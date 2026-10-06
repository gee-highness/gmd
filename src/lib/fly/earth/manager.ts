// src/lib/fly/earth/manager.ts
// Streams and shows the Earth's surface around the ship (docs/fly/12): selects tiles from the camera, loads elevation (and optional imagery)
// with bounded concurrency, builds meshes, shows a coarser ancestor wherever a finer tile is not ready (so there are never holes), pins the
// ground under the ship for physics, evicts through the ResourceTracker, and survives network failure by substituting flat sea-level tiles
// (flagged, so the HUD can say terrain data is offline instead of silently lying).

import * as THREE from 'three';
import { type TileId, deg, geodeticToEcef, lonLatToTile, rad, tileKey, type Vec3, parentOf } from './geo';
import { type SelectedTile, selectTiles } from './quadtree';
import { type HeightTile, TerrainField } from './terrarium';
import { buildTileGeometry, type TileGeometry } from './tileMesh';
import { ancestors, imageryFor } from './imagery';
import type { LocalFrame } from './frame';
import { Budget, ResourceTracker, geometryBytes } from '../stream';

export const MAX_TERRAIN_ZOOM = 13;
const UNDERFOOT_ZOOM = 13;
const COARSE_ZOOM = 8;

export interface ManagerDeps {
	loadHeights(id: TileId, signal: AbortSignal): Promise<HeightTile>;
	/** Optional imagery: resolves the image for `id` and the tile it actually covers (an ancestor when a coarser provider answered), or null. */
	loadImage?(id: TileId, signal: AbortSignal): Promise<{ image: ImageBitmap | HTMLImageElement; tile: TileId } | null>;
}

export interface ManagerOptions {
	maxConcurrent?: number;
	maxImageConcurrent?: number;
	maxRecords?: number;
	/** Tile meshes built per frame (the rest wait), so a burst of arrivals cannot stall a frame on a slow device. */
	maxBuildsPerFrame?: number;
	/** Lambert instead of PBR shading on the terrain (much cheaper on mobile GPUs; loses the sea's sun glint). */
	cheapMaterials?: boolean;
	tolerance?: number;
	maxTiles?: number;
	budget?: Budget;
}

type State = 'idle' | 'loading' | 'ready' | 'failed';
interface Rec {
	id: TileId; key: string; state: State; attempts: number;
	heights?: HeightTile; geo?: TileGeometry; mesh?: THREE.Mesh;
	abort?: AbortController; wantedAt: number; lastUsed: number; priority: number;
	img: 'none' | 'loading' | 'done' | 'failed'; imgAbort?: AbortController;
	synthetic: boolean; fallback: boolean; sea: boolean; failedAt: number;
}

export interface ManagerStats { resident: number; displayed: number; loading: number; queued: number; failed: number; offline: boolean; ready: number; underfootReady: boolean; imagery: number }

const flatTile = (id: TileId): HeightTile => ({ id, size: 256, heights: new Float32Array(256 * 256) });

export class EarthManager {
	readonly root = new THREE.Group();
	readonly field = new TerrainField();
	readonly tracker: ResourceTracker;
	readonly budget: Budget;
	private recs = new Map<string, Rec>();
	private active = 0;
	private clock = 0;
	private buildQueue: { r: Rec; h: HeightTile; synthetic: boolean }[] = [];
	private activeImages = 0;
	private lastSelect = -1e9;
	private lastPump = -1e9;
	private applyQueue: (() => void)[] = [];
	private selected: SelectedTile[] = [];
	private underfoot: TileId[] = [];
	private underfootKeys = new Set<string>();
	private stats_: ManagerStats = { resident: 0, displayed: 0, loading: 0, queued: 0, failed: 0, offline: false, ready: 0, underfootReady: false, imagery: 0 };
	private shipAltitude = 0;
	private disposed = false;
	private frustum = new THREE.Frustum();
	private pv = new THREE.Matrix4();
	private sphere = new THREE.Sphere();
	private tmp = new THREE.Vector3();
	private mats!: { land: THREE.Material; sea: THREE.Material; landBack: THREE.Material; seaBack: THREE.Material };
	private textures = new Map<string, THREE.Texture>();
	imageryEnabled = true;

	constructor(private deps: ManagerDeps, private opts: ManagerOptions = {}) {
		this.mats = (() => {
		const cheap = !!opts.cheapMaterials;
		const make = (roughness: number, back: boolean): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial => {
			const common = { vertexColors: true, side: THREE.FrontSide, polygonOffset: back, polygonOffsetFactor: back ? 3 : 0, polygonOffsetUnits: back ? 3 : 0 };
			return cheap ? new THREE.MeshLambertMaterial(common) : new THREE.MeshStandardMaterial({ ...common, roughness, metalness: 0 });
		};
		// "back" variants are used for coarse ancestors shown in place of a tile that is still loading: pushed behind the finer neighbours.
		return { land: make(0.96, false), sea: make(0.12, false), landBack: make(0.96, true), seaBack: make(0.12, true) };
})();

		this.budget = opts.budget ?? new Budget('high');
		this.tracker = new ResourceTracker(this.budget);
		this.root.frustumCulled = false;
		for (const m of Object.values(this.mats)) this.tracker.track(m, 'earth', 'material');
	}

	get stats(): ManagerStats { return this.stats_; }

	/** Ground height query for physics (radians in, metres out). Null = "not loaded yet, hold": never a silently wrong value near the ground. */
	readonly terrain = {
		height: (lat: number, lon: number): number | null => {
			if (!this.stats_.underfootReady && this.shipAltitude < 8000) return null;
			return this.field.height(deg(lon), deg(lat));
		},
	};

	/** Tell the manager where the ship is so the ground beneath it is pinned and loaded first. */
	pinUnderfoot(latDeg: number, lonDeg: number, altitudeMsl: number) {
		this.shipAltitude = altitudeMsl;
		const c = lonLatToTile(UNDERFOOT_ZOOM, lonDeg, latDeg);
		const n = 2 ** UNDERFOOT_ZOOM;
		const list: TileId[] = [];
		for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
			const y = c.y + dy; if (y < 0 || y >= n) continue;
			list.push({ z: UNDERFOOT_ZOOM, x: (((c.x + dx) % n) + n) % n, y });
		}
		this.underfoot = list;
		this.underfootKeys = new Set(list.map(tileKey));
	}

	/** Call once per frame with the camera in local coordinates. */
	update(frame: LocalFrame, camera: THREE.PerspectiveCamera, camEcef: Vec3, viewportHeight: number, now: number) {
		if (this.disposed) return;
		this.clock = now;
		if (now - this.lastSelect > 120) {
			this.lastSelect = now;
			this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
			this.frustum.setFromProjectionMatrix(this.pv);
			this.selected = selectTiles({
				camera: camEcef, fov: (camera.fov * Math.PI) / 180, viewportHeight, tolerance: this.opts.tolerance ?? 3, maxTiles: this.opts.maxTiles ?? 500, maxZoom: MAX_TERRAIN_ZOOM,
				inView: (c, r) => { frame.toLocal(c, this.tmp); this.sphere.set(this.tmp, r); return this.frustum.intersectsSphere(this.sphere); },
			});
			this.plan(now);
		}
		this.drainBuilds();
		this.applyQueue.shift()?.();
		this.show(frame, now);
		// Scheduling, eviction and stats scan every resident tile (and sort the wanted ones): 10 Hz is plenty and keeps the frame free on phones.
		if (now - this.lastPump > 100) { this.lastPump = now; this.pump(now); }
	}

	// ---------------------------------------------------------------- planning
	private rec(id: TileId): Rec {
		const key = tileKey(id);
		let r = this.recs.get(key);
		if (!r) { r = { id, key, state: 'idle', attempts: 0, wantedAt: 0, lastUsed: 0, priority: Infinity, img: 'none', synthetic: false, fallback: false, sea: false, failedAt: 0 }; this.recs.set(key, r); }
		return r;
	}

	private want(id: TileId, priority: number, now: number, needHeights = false) {
		const r = this.rec(id);
		r.wantedAt = now; r.lastUsed = now; r.priority = Math.min(r.priority, priority);
		if (needHeights && r.state === 'ready' && !r.heights) { r.state = 'idle'; } // re-fetch heights for the physics set (HTTP cache makes it cheap)
	}

	private plan(now: number) {
		for (const r of this.recs.values()) r.priority = Infinity;
		for (const id of this.underfoot) this.want(id, -1, now, true);
		for (const s of this.selected) {
			this.want(s.id, s.distance, now);
			// Progressive refinement: also want up to three coarser ancestors, nearest first, so something is always on screen.
			const chain = ancestors(s.id).filter((a) => a.z >= 3).slice(0, 3);
			chain.forEach((a, i) => this.want(a, s.distance * (0.15 + 0.1 * i), now));
		}
	}

	// ---------------------------------------------------------------- loading
	private pump(now: number) {
		const wantedNow = [...this.recs.values()].filter((r) => r.priority !== Infinity);
		let queued = 0;
		const idle = wantedNow.filter((r) => r.state === 'idle' || (r.state === 'failed' && r.attempts < 2 && now - r.failedAt > 800)).sort((a, b) => a.priority - b.priority);
		// Two lanes: coarse tiles (z ≤ 8, which cover the screen) always keep two slots, so slow fine tiles can never starve them.
		const max = this.opts.maxConcurrent ?? 6, reserve = Math.min(2, Math.floor(max / 3));
		let fine = 0;
		for (const r of this.recs.values()) if (r.state === 'loading' && r.id.z > COARSE_ZOOM) fine++;
		for (const r of idle) {
			const isFine = r.id.z > COARSE_ZOOM;
			if (this.active >= max || (isFine && fine >= max - reserve)) { queued++; continue; }
			this.startHeights(r);
			if (isFine) fine++;
		}
		// Abort loads nobody wants any more.
		for (const r of this.recs.values()) if (r.state === 'loading' && r.abort && r.priority === Infinity && now - r.wantedAt > 2000) { r.abort?.abort(); r.state = 'idle'; r.abort = undefined; this.active = Math.max(0, this.active - 1); }
		// Imagery for displayed tiles
		if (this.imageryEnabled && this.deps.loadImage) {
			for (const r of this.recs.values()) {
				if (this.activeImages >= (this.opts.maxImageConcurrent ?? 4)) break;
				if (r.mesh?.visible && r.img === 'none') this.startImage(r);
			}
		}
		this.evict(now);
		this.refreshStats(queued);
	}

	private startHeights(r: Rec) {
		r.state = 'loading'; r.attempts++; this.active++;
		const ac = new AbortController(); r.abort = ac;
		this.deps.loadHeights(r.id, ac.signal).then((h) => {
			if (this.disposed || ac.signal.aborted) return;
			this.active = Math.max(0, this.active - 1);
			r.abort = undefined; this.buildQueue.push({ r, h, synthetic: false });
		}).catch((e: unknown) => {
			if (this.disposed || ac.signal.aborted) return;
			this.active = Math.max(0, this.active - 1);
			if (r.attempts >= 2) { void e; r.abort = undefined; this.buildQueue.push({ r, h: flatTile(r.id), synthetic: true }); } else { r.state = 'failed'; r.failedAt = this.clock; }
		});
	}

	private drainBuilds() {
		for (let n = 0; n < (this.opts.maxBuildsPerFrame ?? 2) && this.buildQueue.length; n++) {
			const b = this.buildQueue.shift()!;
			if (this.recs.get(b.r.key) === b.r) this.accept(b.r, b.h, b.synthetic);
		}
	}

	private accept(r: Rec, h: HeightTile, synthetic: boolean) {
		r.synthetic = synthetic; r.abort = undefined;
		if (!r.mesh) {
			const g = buildTileGeometry(h);
			r.geo = g;
			const geom = new THREE.BufferGeometry();
			geom.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
			geom.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
			geom.setAttribute('color', new THREE.BufferAttribute(g.colors, 3));
			geom.setAttribute('uv', new THREE.BufferAttribute(g.uvs, 2));
			geom.setIndex(new THREE.BufferAttribute(g.indices, 1));
			geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), g.radius);
			this.tracker.track(geom, 'earth', 'geometry', geometryBytes(g.positions.length / 3, g.indices.length, 11), 'tiles');
			r.sea = g.water > 0.6;
			const mesh = new THREE.Mesh(geom, r.sea ? this.mats.sea : this.mats.land);
			mesh.visible = false; mesh.matrixAutoUpdate = true; mesh.receiveShadow = true;
			this.root.add(mesh);
			r.mesh = mesh;
		}
		// Heights are kept only where physics needs them (underfoot set) or where they are tiny (coarse levels).
		if (this.underfootKeys.has(r.key) || r.id.z <= 7) { r.heights = h; this.field.set(h); } else { this.field.delete(r.id); r.heights = undefined; }
		r.state = 'ready';
	}

	private startImage(r: Rec) {
		if (!this.deps.loadImage) return;
		r.img = 'loading'; this.activeImages++;
		const ac = new AbortController(); r.imgAbort = ac;
		const want: TileId = r.id.z <= 13 ? r.id : ancestors(r.id).find((a) => a.z === 13) ?? r.id;
		this.deps.loadImage(want, ac.signal).then((res) => {
			this.activeImages = Math.max(0, this.activeImages - 1);
			if (this.disposed || ac.signal.aborted) { if (res && 'close' in res.image) res.image.close(); return; }
			if (!res || !r.mesh) { r.img = 'failed'; return; }
			this.applyQueue.push(() => this.applyImage(r, res));
		}).catch(() => { this.activeImages = Math.max(0, this.activeImages - 1); r.img = 'failed'; });
	}

	/** Texture creation and the GPU upload that follows are applied one tile per frame, so a burst of arrivals cannot stall a frame. */
	private applyImage(r: Rec, res: { image: ImageBitmap | HTMLImageElement; tile: TileId }) {
		if (this.disposed || !r.mesh || this.recs.get(r.key) !== r) { if ('close' in res.image) res.image.close(); return; }
		{
			const key = `${tileKey(res.tile)}`;
			let base = this.textures.get(key);
			if (!base) {
				base = new THREE.Texture(res.image as HTMLImageElement); base.colorSpace = THREE.SRGBColorSpace; base.anisotropy = this.opts.cheapMaterials ? 1 : 4; base.generateMipmaps = true; base.minFilter = THREE.LinearMipmapLinearFilter; base.needsUpdate = true;
				this.tracker.track(base, 'earth', 'texture', 256 * 256 * 4 * 1.33);
				this.textures.set(key, base);
			}
			const map = imageryFor(r.id, res.tile.z);
			const tex = base.clone(); tex.needsUpdate = true;
			tex.repeat.set(map.repeat, map.repeat); tex.offset.set(map.offsetX, map.offsetY);
			tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
			const mat = (r.mesh.material as THREE.MeshStandardMaterial).clone();
			mat.vertexColors = false; mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true;
			this.tracker.track(mat, 'earth', 'material'); this.tracker.track(tex, 'earth', 'texture');
			r.mesh.material = mat; r.img = 'done';
		}
	}

	// ---------------------------------------------------------------- display
	private show(frame: LocalFrame, now: number) {
		for (const r of this.recs.values()) if (r.mesh) { r.mesh.visible = false; r.fallback = false; }
		let displayed = 0, ready = 0;
		const shown = new Set<string>();
		for (const s of this.selected) {
			let r: Rec | undefined = this.recs.get(tileKey(s.id));
			let usedFallback = false;
			if (!r?.mesh) {
				r = undefined;
				for (const a of ancestors(s.id)) { const ar = this.recs.get(tileKey(a)); if (ar?.mesh) { r = ar; usedFallback = true; break; } }
			} else ready++;
			if (!r?.mesh || shown.has(r.key)) continue;
			shown.add(r.key); r.lastUsed = now; r.fallback = usedFallback;
			r.mesh.visible = true; displayed++;
			frame.toLocal(r.geo!.center, r.mesh.position);
			r.mesh.quaternion.copy(frame.qInv);
			r.mesh.renderOrder = r.id.z;
			if (r.img === 'done') { const mat = r.mesh.material as THREE.MeshStandardMaterial; if (mat.polygonOffset !== usedFallback) { mat.polygonOffset = usedFallback; mat.polygonOffsetFactor = usedFallback ? 3 : 0; mat.polygonOffsetUnits = usedFallback ? 3 : 0; } }
			else r.mesh.material = r.sea ? (usedFallback ? this.mats.seaBack : this.mats.sea) : usedFallback ? this.mats.landBack : this.mats.land;
		}
		this.stats_.displayed = displayed;
		this.stats_.ready = this.selected.length ? ready / this.selected.length : 1;
		this.stats_.underfootReady = this.underfoot.length > 0 && this.underfoot.every((id) => { const r = this.recs.get(tileKey(id)); return r?.state === 'ready' && !!r.heights; });
	}

	// ---------------------------------------------------------------- housekeeping
	private evict(now: number) {
		const max = this.opts.maxRecords ?? 1100;
		const critical = this.budget.pressure('tiles') === 'critical';
		if (this.recs.size <= max && !critical) return;
		const victims = [...this.recs.values()].filter((r) => r.priority === Infinity && now - r.lastUsed > 4000 && !this.underfootKeys.has(r.key)).sort((a, b) => a.lastUsed - b.lastUsed);
		let excess = Math.max(this.recs.size - max, critical ? Math.ceil(this.recs.size * 0.15) : 0);
		for (const r of victims) {
			if (excess-- <= 0) break;
			this.drop(r);
		}
	}

	private drop(r: Rec) {
		r.abort?.abort(); r.imgAbort?.abort();
		if (r.mesh) {
			this.root.remove(r.mesh);
			this.tracker.release(r.mesh.geometry);
			const m = r.mesh.material as THREE.MeshStandardMaterial;
			if (!Object.values(this.mats).includes(m)) { if (m.map) this.tracker.release(m.map); this.tracker.release(m); }
		}
		this.field.delete(r.id);
		this.recs.delete(r.key);
	}

	private refreshStats(queued: number) {
		let loading = 0, failed = 0, resident = 0, imagery = 0, synth = 0;
		for (const r of this.recs.values()) { if (r.state === 'loading') loading++; if (r.state === 'failed') failed++; if (r.mesh) resident++; if (r.img === 'done') imagery++; if (r.synthetic) synth++; }
		Object.assign(this.stats_, { resident, loading, failed, queued, imagery, offline: synth > 0 });
	}

	/** Releases everything. Safe to call twice. */
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		for (const r of this.recs.values()) { r.abort?.abort(); r.imgAbort?.abort(); }
		this.recs.clear(); this.textures.clear(); this.buildQueue.length = 0; this.applyQueue.length = 0;
		this.tracker.disposeAll();
		this.root.clear();
	}
}

export { parentOf, geodeticToEcef, rad };
