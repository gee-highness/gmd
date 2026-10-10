// src/lib/fly/pack/heights.ts
// Elevation from the offline world pack (world-terrain.pmtiles, R channel = height, 25 m/level,
// plan §1 finding F1), in front of the network Terrarium loader so flight has real (if coarse)
// terrain with no network at all, and the finer live data silently takes over once it is reachable.

import type { TileId } from '../earth/geo';
import type { HeightTile } from '../earth/terrarium';
import { loadTerrariumTile } from '../earth/terrarium';
import { type TileSource, decodeTilePixels } from './reader';

/** Real data stops here (plan §1 F7: ~1.8 km/px at z6); anything finer is a smooth upsample of
 * the z6 ancestor, not real detail - a declared departure until runtime detail synthesis (plan
 * §7, ticket R3) lands. Still real continents and mountains, never a flat sea-level plane. */
export const PACK_TERRAIN_MAX_ZOOM = 6;
const HEIGHT_SCALE_M = 25;

type Pixels = { data: Uint8ClampedArray; width: number; height: number };
// Scoped per TileSource instance (WeakMap) - a module-level cache keyed only by z/x/y would wrongly
// share entries across different packs (or mocks in tests) that happen to request the same tile id.
const pixelCaches = new WeakMap<TileSource, Map<string, Promise<Pixels | undefined>>>();

function ancestorPixels(pack: TileSource, tile: TileId, signal?: AbortSignal): Promise<Pixels | undefined> {
	let cache = pixelCaches.get(pack);
	if (!cache) { cache = new Map(); pixelCaches.set(pack, cache); }
	const key = `${tile.z}/${tile.x}/${tile.y}`;
	let p = cache.get(key);
	if (!p) {
		p = pack.getTileBytes(tile, signal).then((bytes) => (bytes ? decodeTilePixels(bytes) : undefined));
		cache.set(key, p);
		p.catch(() => cache!.delete(key)); // don't cache a rejected lookup
	}
	return p;
}

function sampleR(px: Pixels, fx: number, fy: number): number {
	const w = px.width, h = px.height;
	const x = Math.min(w - 1, Math.max(0, fx)), y = Math.min(h - 1, Math.max(0, fy));
	const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
	const fxr = x - x0, fyr = y - y0;
	const at = (xx: number, yy: number) => px.data[(yy * w + xx) * 4];
	const a = at(x0, y0), b = at(x1, y0), c = at(x0, y1), d = at(x1, y1);
	return a * (1 - fxr) * (1 - fyr) + b * fxr * (1 - fyr) + c * (1 - fxr) * fyr + d * fxr * fyr;
}

/** HeightTile for `id` sampled from the offline pack alone (bilinear upsample of its z<=6 ancestor). */
export async function loadHeightsFromPack(pack: TileSource, id: TileId, signal?: AbortSignal): Promise<HeightTile> {
	const size = 256;
	const ancestorZ = Math.min(id.z, PACK_TERRAIN_MAX_ZOOM);
	const k = 2 ** (id.z - ancestorZ);
	const ax = Math.floor(id.x / k), ay = Math.floor(id.y / k);
	const heights = new Float32Array(size * size);
	const px = await ancestorPixels(pack, { z: ancestorZ, x: ax, y: ay }, signal);
	if (px) {
		const span = px.width / k; // ancestor pixels covered by this one target tile
		const x0 = (id.x - ax * k) * span, y0 = (id.y - ay * k) * span;
		for (let j = 0; j < size; j++) {
			const py = y0 + (j / (size - 1)) * span;
			for (let i = 0; i < size; i++) {
				heights[j * size + i] = sampleR(px, x0 + (i / (size - 1)) * span, py) * HEIGHT_SCALE_M;
			}
		}
	}
	return { id, size, heights };
}

/**
 * Network Terrarium first (real ~30 m data where reachable), falling back to the offline pack on
 * any failure - offline, blocked, or simply no server for this tile. Never throws: the pack's
 * z0-z6 coverage is global, so this always resolves to something real.
 */
export function makeOfflineFirstHeightLoader(pack: TileSource, networkLoad = loadTerrariumTile) {
	return async (id: TileId, signal?: AbortSignal): Promise<HeightTile> => {
		try {
			return await networkLoad(id, signal);
		} catch (e) {
			if (signal?.aborted) throw e;
			return loadHeightsFromPack(pack, id, signal);
		}
	};
}
