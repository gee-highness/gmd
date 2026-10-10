// src/components/fly/EarthFlight.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Box, Button, Checkbox, Flex, HStack, Input, Select, Stack, Text, VisuallyHidden } from '@chakra-ui/react';
import { FiArrowLeft, FiPause } from 'react-icons/fi';
import { usePadFrames } from '@/components/input/usePad';
import { buttonName } from '@/lib/input/gamepad';
import { CameraRig, type ViewMode } from '@/lib/fly/camera';
import { podTargets } from '@/lib/fly/ship/pods';
import { KESTREL, KESTREL_FAST } from '@/lib/fly/ships/specs';
import { NO_INPUT, type FlightInput } from '@/lib/fly/sim/flight';
import { PLACES, placeById } from '@/lib/fly/earth/places';
import { trailDistanceDeg } from '@/lib/fly/earth/geo';
import { loadSettings, resolveReducedMotion, updateSettings } from '@/lib/fly/settings';
import TouchControls from './TouchControls';
import { useTouchDevice } from './useLandscape';
import PlaceSearch from './PlaceSearch';

const Minimap = dynamic(() => import('./Minimap'), { ssr: false });

interface Hud {
  lat: number; lon: number; msl: number; agl: number; speed: number; vs: number; heading: number; mach: number; fuel: number; mass: number;
  pressure: number; temperature: number; q: number; heat: number; sunElev: number; utc: string; event: string;
  terrainReady: number; underfoot: boolean; offline: boolean; imagery: number; tiles: number; buildings: number; estimated: number; buildingsLoading: boolean; buildingsFailed: boolean; space: boolean; flight: boolean; throttle: number; pitch: number; warp: number; warpMax: number; ap: number | null; pe: number; vOrb: number; vCirc: number; inOrbit: boolean;
}
const EVENT_TEXT = { landed: 'Landed.', rough: 'Rough landing: slow your descent and level out.', crash: 'Hard impact. Back at your last takeoff point.' } as const;

const num = (v: string | null, d: number) => { const n = v === null ? NaN : parseFloat(v); return Number.isFinite(n) ? n : d; };

export default function EarthFlight({ onBack }: { onBack: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewMode>('third');
  const [hud, setHud] = useState<Hud | null>(null);
  const [hideUi, setHideUi] = useState(false);
  // Initial values come from the last saved settings (docs/plan-fly-game-ux.md Phase 1); the lazy initializer runs
  // once, before paint, so there's no flash of the hard-coded defaults before a saved preference "jumps in" later.
  const [settings] = useState(loadSettings);
  const [hoverAssist, setHoverAssist] = useState(settings.hoverAssist);
  const [levelAssist, setLevelAssist] = useState(settings.levelAssist);
  const [buildingsOn, setBuildingsOn] = useState(settings.buildingsOn);
  const [imageryOn, setImageryOn] = useState(settings.imageryOn);
  const [labelsOn, setLabelsOn] = useState(settings.labelsOn);
  const [minimapOn, setMinimapOn] = useState(settings.minimapOn);
  const [reducedMotionPref, setReducedMotionPref] = useState(settings.reducedMotion);
  const [paused, setPaused] = useState(false);
  const [trail, setTrail] = useState<[number, number][]>([]);

  // Persist every toggle on change, in one place, rather than an updateSettings() call scattered across six
  // onChange handlers. Skips the very first render (nothing changed yet - it's exactly what was just loaded).
  const firstPersist = useRef(true);
  useEffect(() => {
    if (firstPersist.current) { firstPersist.current = false; return; }
    updateSettings({ hoverAssist, levelAssist, buildingsOn, imageryOn, labelsOn, minimapOn, reducedMotion: reducedMotionPref });
  }, [hoverAssist, levelAssist, buildingsOn, imageryOn, labelsOn, minimapOn, reducedMotionPref]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [placeId, setPlaceId] = useState('zurich');
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('place'); if (id && placeById(id)) setPlaceId(id); }, []);
  const [coords, setCoords] = useState('');
  const [coordError, setCoordError] = useState('');
  // Offline world pack (docs/plan-offline-world.md §11): register the /fly-scoped service worker
  // once on mount (independent of the WebGL scene below), and offer a manual "check for updates"
  // that re-syncs packs/manifest.json whenever the device is online.
  const [packUpdate, setPackUpdate] = useState<'idle' | 'checking' | 'available' | 'current'>('idle');
  const swReg = useRef<ServiceWorkerRegistration | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { registerFlyServiceWorker } = await import('@/lib/fly/pack/offline');
      const reg = await registerFlyServiceWorker();
      if (!cancelled && reg) swReg.current = reg;
    })();
    return () => { cancelled = true; };
  }, []);
  const checkForUpdates = async () => {
    setPackUpdate('checking');
    const { checkForPackUpdate } = await import('@/lib/fly/pack/offline');
    const { changed } = await checkForPackUpdate(swReg.current);
    setPackUpdate(changed.length ? 'available' : 'current');
  };
  // Game-style UI: the screen stays clear while you fly. Controls help follows the device in use (gone for a controller or touch),
  // the toolbar fades when the pointer is still, and the detailed telemetry is a toggle (T).
  const [inputKind, setInputKind] = useState<'keys' | 'pad'>('keys');
  const [helpOpen, setHelpOpen] = useState(true);
  const [details, setDetails] = useState(false);
  const [awake, setAwake] = useState(true);
  useEffect(() => { const t = window.setTimeout(() => setHelpOpen(false), 12_000); return () => window.clearTimeout(t); }, []);
  useEffect(() => {
    let t = 0;
    const wake = () => { setAwake(true); window.clearTimeout(t); t = window.setTimeout(() => setAwake(false), 3500); };
    wake();
    window.addEventListener('pointermove', wake); window.addEventListener('pointerdown', wake);
    return () => { window.clearTimeout(t); window.removeEventListener('pointermove', wake); window.removeEventListener('pointerdown', wake); };
  }, []);
  const flags = useRef({ view, hoverAssist, levelAssist, buildingsOn, imageryOn, labelsOn, paused, reducedMotionPref });
  flags.current = { view, hoverAssist, levelAssist, buildingsOn, imageryOn, labelsOn, paused, reducedMotionPref };
  const keys = useRef(new Set<string>());
  const pad = useRef<FlightInput>({ ...NO_INPUT });
  const touchInput = useRef<FlightInput>({ ...NO_INPUT });
  const isTouch = useTouchDevice();
  const padActive = useRef(false);
  const actions = useRef<{ respawn: () => void; flightMode: () => void; warp: (dir: number) => void; view: () => void; teleport: (lat: number, lon: number, hdg: number, alt?: number) => void; timeShift: (h: number | 'now') => void } | null>(null);

  usePadFrames(({ pad: p, pressed }) => {
    padActive.current = Math.abs(p.lx) + Math.abs(p.ly) + Math.abs(p.rx) + Math.abs(p.ry) + p.l2 + p.r2 > 0.05 || p.down.l1 || p.down.r1;
    if (padActive.current) setInputKind('pad');
    pad.current = { collective: p.r2 - p.l2, forward: -p.ly, strafe: p.lx, yaw: p.rx, pitch: p.ry, roll: (p.down.r1 ? 1 : 0) - (p.down.l1 ? 1 : 0) };
    for (const c of pressed) {
      if (c === 'triangle') actions.current?.view();
      else if (c === 'circle') actions.current?.respawn();
      else if (c === 'cross') actions.current?.flightMode();
      else if (c === 'options') setHideUi((v) => !v);
    }
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import('three');
        const [{ buildKestrel }, earth, flight, sim, geo, atmo, sunMod, light, skyMod, loaders, imagery, bl] = await Promise.all([
          import('@/lib/fly/ship/kestrel'),
          import('@/lib/fly/earth/manager'),
          import('@/lib/fly/sim/flight'),
          import('@/lib/fly/sim/earthflight'),
          import('@/lib/fly/earth/geo'),
          import('@/lib/fly/earth/atmosphere'),
          import('@/lib/fly/earth/sun'),
          import('@/lib/fly/earth/lighting'),
          import('@/lib/fly/earth/skyShader'),
          import('@/lib/fly/earth/loaders'),
          import('@/lib/fly/earth/imagery'),
          import('@/lib/fly/earth/buildingsLayer'),
        ]);
        const { loadTerrariumTile } = await import('@/lib/fly/earth/terrarium');
        const { LocalFrame } = await import('@/lib/fly/earth/frame');
        const { Dust } = await import('@/lib/fly/earth/dust');
        const { PackSource } = await import('@/lib/fly/pack/reader');
        const { makeOfflineFirstHeightLoader } = await import('@/lib/fly/pack/heights');
        const { makeOfflineFirstImageLoader } = await import('@/lib/fly/pack/imagery');
        void atmo; void flight;
        if (disposed) return;

        const qp = new URLSearchParams(window.location.search);
        const coarse = !!window.matchMedia?.('(pointer: coarse)').matches || qp.get('touch') === '1';
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'The Kestrel flying over the real Earth: terrain from elevation data, sky from atmospheric scattering, cities as 3D boxes.');
        el.prepend(canvas);
        const lowGuess = coarse || qp.get('q') === 'low';
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowGuess, powerPreference: 'high-performance', logarithmicDepthBuffer: !lowGuess });
        const gl = renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const soft = /swiftshader|llvmpipe|software/i.test(ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '');
        const lowQ = soft || lowGuess;
        // Resolution governor: starts modest on weak devices and follows the measured frame time (never below 0.45× or above the device's own ratio).
        const prMax = lowQ ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
        let pr = soft ? 0.5 : lowQ ? 0.7 : prMax;
        renderer.setPixelRatio(pr);
        renderer.shadowMap.enabled = !lowQ; renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;

        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x9fb8d8, 2e-5);
        const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 5e7);
        const sunLight = new THREE.DirectionalLight(0xffffff, 3);
        sunLight.castShadow = !lowQ;
        sunLight.shadow.mapSize.set(1024, 1024);
        Object.assign(sunLight.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 400 });
        sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.05;
        const hemi = new THREE.HemisphereLight(0x88aaff, 0x443322, Math.PI);
        scene.add(sunLight, sunLight.target, hemi);

        const sky = skyMod.createSky(lowQ ? 'low' : 'high');
        scene.add(sky.mesh);

        const providers = imagery.DEFAULT_PROVIDERS;
        // Street/place names are a label overlay composited onto the satellite tile, live-toggled without rebuilding
        // the loader; like the OSM_STREETS layer in mapLayers.ts, it needs a network, so it wraps the network loader,
        // never the offline pack (the pack's bundled imagery has no matching label data).
        const labelsOnRef = { current: false }; // synced from flags.current every frame, below, like imageryEnabled/buildings.enabled
        const networkLoadImage = loaders.makeLabeledImageLoader(loaders.makeImageLoader(providers), imagery.OSM_LABELS, () => labelsOnRef.current);
        // The offline world pack (docs/plan-offline-world.md) sits behind the network sources: real
        // elevation/imagery wins when reachable, the pack answers instantly with no network at all
        // and silently stands in whenever the network loader fails (offline, blocked, or just slow).
        const terrainPack = new PackSource('/packs/world-terrain.pmtiles');
        const albedoPack = new PackSource('/packs/world-albedo.pmtiles');
        const loadHeights = makeOfflineFirstHeightLoader(terrainPack, loadTerrariumTile);
        const loadImage = makeOfflineFirstImageLoader(albedoPack, networkLoadImage);
        const manager = new earth.EarthManager({ loadHeights, loadImage }, { tolerance: lowQ ? 5 : 3, maxTiles: lowQ ? 200 : 500, maxConcurrent: lowQ ? 4 : 6, maxBuildsPerFrame: lowQ ? 1 : 2, cheapMaterials: lowQ });
        scene.add(manager.root);
        const buildings = new bl.BuildingsLayer({ fetchJson: bl.overpassFetch as never }, manager.tracker, (la, lo) => manager.field.height(lo, la), 16, lowQ);
        scene.add(buildings.root);

        const dust = new Dust(); scene.add(dust.points);
        const model = buildKestrel({ glass: lowQ ? 'simple' : 'physical', detail: lowQ ? 24 : 56, cheap: lowQ });
        model.root.traverse((o) => { if ((o as import('three').Mesh).isMesh) (o as import('three').Mesh).castShadow = true; });
        scene.add(model.root);

        const params = new URLSearchParams(window.location.search);
        const ship = params.get('perf') === 'stock' ? KESTREL : KESTREL_FAST; // ?perf=stock flies the original, slower numbers
        const startPlace = placeById(params.get('place') ?? '') ?? placeById('zurich')!;
        const start = { lat: num(params.get('lat'), startPlace.lat), lon: num(params.get('lon'), startPlace.lon), hdg: num(params.get('hdg'), startPlace.heading), alt: Math.max(0, num(params.get('alt'), 0)) };
        const t0Date = params.get('t') ? new Date(params.get('t')!) : new Date();
        let timeOffsetMs = Number.isNaN(t0Date.getTime()) ? 0 : t0Date.getTime() - Date.now();

        const state = sim.spawnOnGround(start.lat, start.lon, start.hdg, 0, ship);
        const frame = new LocalFrame([state.pos.x, state.pos.y, state.pos.z]);
        const rig = new CameraRig('third', { reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches });
        let spawnInfo = { ...start, pending: true };

        const fit = () => { const r = el.getBoundingClientRect(); renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); };
        fit();
        const ro = new ResizeObserver(fit); ro.observe(el);

        const teleport = (lat: number, lon: number, hdg: number, alt = 0) => {
          spawnInfo = { lat, lon, hdg, alt, pending: true };
          Object.assign(state, sim.spawnOnGround(lat, lon, hdg, 0, ship));
          frame.setAnchor([state.pos.x, state.pos.y, state.pos.z]);
          rig.snap(); gearDown = true; gearPos = 1;
          trailBuf.length = 0; setTrail([]); // a new takeoff starts a new trail, not a line across the globe from wherever the last one ended
        };
        actions.current = {
          respawn: () => teleport(spawnInfo.lat, spawnInfo.lon, spawnInfo.hdg, 0),
          flightMode: () => { state.flightMode = !state.flightMode; state.throttle = 0; },
          // Up steps to the next speed allowed right now and wraps to ×1; down steps back one.
          warp: (dir) => { const i = Math.max(0, WARPS.indexOf(warpNow)); if (dir > 0) { const nx = WARPS[Math.min(WARPS.length - 1, i + 1)]; warpTarget = nx <= warpMax && nx !== warpNow ? nx : 1; } else warpTarget = WARPS[Math.max(0, i - 1)]; },
          view: () => setView((v) => (v === 'first' ? 'third' : 'first')),
          teleport,
          timeShift: (h) => { timeOffsetMs = h === 'now' ? 0 : timeOffsetMs + h * 3600_000; },
        };

        const onKeyDown = (e: KeyboardEvent) => {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          const target = e.target as HTMLElement | null;
          if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
          const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
          if (['w', 'a', 's', 'd', 'q', 'e', ' ', 'Shift', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) { keys.current.add(k); setInputKind('keys'); e.preventDefault(); }
          else if (k === 'k') setHelpOpen((v) => !v);
          else if (k === 't') setDetails((v) => !v);
          else if (k === 'v') actions.current?.view();
          else if (k === '1') setView('first');
          else if (k === '3') setView('third');
          else if (k === 'r') actions.current?.respawn();
          else if (k === 'i') setHideUi((v) => !v);
          else if (k === 'c') actions.current?.flightMode();
          else if (k === '.' || k === '>') actions.current?.warp(1);
          else if (k === ',' || k === '<') actions.current?.warp(-1);
          else if (k === 'h') setHoverAssist((v) => !v);
          else if (k === 'm') setMinimapOn((v) => !v);
          else if (k === 'Escape') setPaused((v) => !v);
          else if (k === '[') actions.current?.timeShift(e.shiftKey ? -6 : -1);
          else if (k === ']') actions.current?.timeShift(e.shiftKey ? 6 : 1);
          else if (k === '{') actions.current?.timeShift(-6);
          else if (k === '}') actions.current?.timeShift(6);
        };
        const onKeyUp = (e: KeyboardEvent) => { keys.current.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); };
        window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
        const onBlur = () => keys.current.clear(); window.addEventListener('blur', onBlur);
        const keyboardInput = (): FlightInput => {
          const k = keys.current, ax = (neg: string, pos: string) => (k.has(pos) ? 1 : 0) - (k.has(neg) ? 1 : 0);
          return { collective: (k.has(' ') ? 1 : 0) - (k.has('Shift') ? 1 : 0), forward: ax('s', 'w'), strafe: ax('a', 'd'), yaw: ax('q', 'e'), pitch: ax('ArrowUp', 'ArrowDown'), roll: ax('ArrowLeft', 'ArrowRight') };
        };

        const v3 = new THREE.Vector3(), sunLocal = new THREE.Vector3(), upLocal = new THREE.Vector3(), shipLocal = new THREE.Vector3(), velLocal = new THREE.Vector3(), qLocal = new THREE.Quaternion();
        const mEcef3 = new THREE.Matrix3(), mInertial = new THREE.Matrix3(), rz = new THREE.Matrix3();
        let lit = light.lightingFor(10, 30), litAt = -1e9, sunE: [number, number, number] = [1, 0, 0], gast = 0, sunAt = -1e9;
        const WARPS = [1, 2, 5, 10, 50];
        let warpTarget = 1, warpNow = 1;
        let warpMax = 1;
        let lastTel: ReturnType<typeof sim.earthTelemetry> | null = null;
        let emaDt = 0.02, govAt = 0, calmSince = 0, lastDown = -1e9, gearPos = 1, gearDown = true;
        let lastView: ViewMode = 'third', eventText = '', eventUntil = 0, raf = 0, last = performance.now(), hudAt = 0;
        const trailBuf: [number, number][] = []; // flight trail (docs/plan-fly-map-data.md §3): bounded ring buffer, synced to React state on each HUD tick
        const rd = (n: number, d = 0) => Number(n.toFixed(d));

        const loop = (t: number) => {
          raf = requestAnimationFrame(loop);
          if (document.hidden) { last = t; return; }
          const rawDt = (t - last) / 1000;
          const dt = Math.min(0.1, rawDt); last = t;
          const f = flags.current;
          // frame-time governor
          emaDt += (Math.min(0.25, rawDt) - emaDt) * 0.08;
          // Each change reallocates the canvas buffers (a visible hitch), so: step down at once when slow, step up only after a long calm spell, and never within 20 s of a step down.
          if (t - govAt > 1200) {
            govAt = t;
            if (emaDt > 0.036 && pr > 0.45) { pr = Math.max(0.45, pr * 0.85); renderer.setPixelRatio(pr); fit(); calmSince = t; lastDown = t; }
            else if (emaDt < 0.021 && pr < prMax && t - lastDown > 20000 && t - calmSince > 8000) { pr = Math.min(prMax, pr * 1.1); renderer.setPixelRatio(pr); fit(); calmSince = t; }
            else if (emaDt >= 0.021) calmSince = t;
          }
          manager.imageryEnabled = f.imageryOn; buildings.enabled = f.buildingsOn; labelsOnRef.current = f.labelsOn;
          rig.reducedMotion = resolveReducedMotion(f.reducedMotionPref);

          const kin = keyboardInput(), pin = pad.current;
          const tin = touchInput.current;
          const base = padActive.current ? { collective: pin.collective + kin.collective, forward: pin.forward + kin.forward, strafe: pin.strafe + kin.strafe, yaw: pin.yaw + kin.yaw, pitch: pin.pitch + kin.pitch, roll: pin.roll + kin.roll } : kin;
          const input: FlightInput = { collective: base.collective + tin.collective, forward: base.forward + tin.forward, strafe: base.strafe + tin.strafe, yaw: base.yaw + tin.yaw, pitch: base.pitch + tin.pitch, roll: base.roll + tin.roll };

          // First seat on the real ground once the terrain under the spawn point has arrived.
          if (spawnInfo.pending && manager.stats.underfootReady) {
            const gh = Math.max(0, manager.terrain.height(geo.rad(spawnInfo.lat), geo.rad(spawnInfo.lon)) ?? 0);
            Object.assign(state, sim.spawnOnGround(spawnInfo.lat, spawnInfo.lon, spawnInfo.hdg, gh, ship));
            if (spawnInfo.alt > 0) { const p = geo.geodeticToEcef(geo.rad(spawnInfo.lat), geo.rad(spawnInfo.lon), gh + spawnInfo.alt); state.pos.set(p[0], p[1], p[2]); state.landed = false; }
            frame.setAnchor([state.pos.x, state.pos.y, state.pos.z]); rig.snap();
            spawnInfo.pending = false;
          }
          // Time warp is only allowed where nothing near can hurt the ship: out of the thick air (and never close to the ground).
          {
            const agl = lastTel?.altitudeAgl ?? 0, dens = lastTel?.air.density ?? 1.2, msl = lastTel?.altitudeMsl ?? 0;
            const allowed = msl > 100_000 ? 50 : dens < 1e-3 && agl > 20_000 ? 10 : dens < 0.2 && agl > 5000 ? 2 : 1;
            warpNow = Math.max(1, Math.min(warpTarget, allowed));
            warpMax = allowed;
            if (warpNow > 1) timeOffsetMs += dt * 1000 * (warpNow - 1); // the day and night pass at the same pace
          }
          if (!spawnInfo.pending && !f.paused) {
            // Sub-steps proportional to the real frame time (never a fixed 1/60 s quantum): the ship then moves smoothly whatever the frame rate, instead of 1, 2 or 3 steps per frame.
            const n = Math.min(6, Math.max(1, Math.ceil(dt * 60 - 1e-6)));
            for (let i = 0; i < n; i++) sim.stepEarth(state, input, (dt / n) * warpNow, manager.terrain, { hoverAssist: f.hoverAssist, levelAssist: f.levelAssist, spec: ship });
          }
          if (state.event) {
            eventText = EVENT_TEXT[state.event.kind]; eventUntil = t + 4500;
            if (state.event.kind === 'crash') actions.current?.respawn(); else state.event = null;
          }

          // Re-base the render frame near the ship.
          if (frame.needsRebase(state.pos)) {
            frame.toLocal(state.pos, v3);
            frame.setAnchor([state.pos.x, state.pos.y, state.pos.z]);
            rig.shift(v3.negate());
          }

          frame.toLocal(state.pos, shipLocal); frame.quatToLocal(state.q, qLocal); frame.dirToLocal(state.vel, velLocal);
          const tel = sim.earthTelemetry(state, manager.terrain, ship); lastTel = tel;
          model.root.position.copy(shipLocal); model.root.quaternion.copy(qLocal);
          // Automatic landing gear: down below 15 m above the ground, up (and hidden) above 30 m.
          if (gearDown && tel.altitudeAgl > 30) gearDown = false; else if (!gearDown && tel.altitudeAgl < 15) gearDown = true;
          state.gear = gearDown;
          gearPos += Math.sign((gearDown ? 1 : 0) - gearPos) * Math.min(Math.abs((gearDown ? 1 : 0) - gearPos), dt * 0.8);
          model.setGear(gearPos);
                    model.setPods(podTargets({ hoverN: tel.hoverN, mainN: tel.mainN, yaw: input.yaw, roll: input.roll }, KESTREL.thrust.hover));
          model.update(dt);
          {
            const groundY = shipLocal.y - tel.altitudeAgl - (state.gear ? 2.03 : 1.3);
            dust.update(dt, shipLocal, qLocal, groundY, Math.max(tel.hover, tel.main * 0.5), tel.altitudeAgl, tel.altitudeMsl - tel.altitudeAgl <= 1, Math.min(1, 0.25 + 0.75 * Math.max(0, Math.sin((lit.sunElevation * Math.PI) / 180))));
          }
          if (f.view !== lastView) { rig.setMode(f.view); lastView = f.view; model.setFirstPerson(f.view === 'first'); }
          rig.update(dt, shipLocal, qLocal, velLocal);
          camera.position.copy(rig.pose.pos); camera.quaternion.copy(rig.pose.quat);
          if (Math.abs(camera.fov - rig.fov) > 0.01) { camera.fov = rig.fov; camera.near = f.view === 'first' ? 0.05 : 0.3; camera.updateProjectionMatrix(); }
          if (!renderer.capabilities.logarithmicDepthBuffer) {
            // Standard depth buffer (phones): fit near/far to the altitude so the precision goes where the eye is looking.
            const h = Math.max(10, tel.altitudeMsl);
            const far = Math.min(4e7, 1.15 * Math.sqrt(2 * 6371000 * h + h * h) + 160000);
            const near = Math.max(f.view === 'first' ? 0.1 : 0.3, far / 3.2e6);
            if (Math.abs(far - camera.far) / camera.far > 0.05 || Math.abs(near - camera.near) / camera.near > 0.05) { camera.far = far; camera.near = near; camera.updateProjectionMatrix(); }
          }
          camera.updateMatrixWorld();

          // Time, Sun and lighting (the Sun's real position at the chosen instant).
          const now = new Date(Date.now() + timeOffsetMs);
          if (t - sunAt > 500) { sunAt = t; sunE = sunMod.sunEcef(now); gast = sunMod.gastRad(now); }
          const camEcef = frame.toEcef(camera.position, v3);
          const cg = geo.ecefToGeodetic(camEcef.x, camEcef.y, camEcef.z);
          const upE = geo.upAt(cg.lat, cg.lon);
          frame.dirToLocal(sunE, sunLocal).normalize(); frame.dirToLocal(upE, upLocal).normalize();
          const sunElev = (Math.asin(Math.max(-1, Math.min(1, sunLocal.dot(upLocal)))) * 180) / Math.PI;
          const camAlt = Math.max(1, cg.h);
          if (t - litAt > 250) { litAt = t; lit = light.lightingFor(camAlt, sunElev); }
          renderer.toneMappingExposure += (lit.exposure - renderer.toneMappingExposure) * Math.min(1, dt * 1.5);
          sunLight.color.setRGB(lit.sunColor[0], lit.sunColor[1], lit.sunColor[2]);
          sunLight.intensity = lit.sunIntensity;
          sunLight.castShadow = !lowQ && sunElev > 1;
          sunLight.position.copy(shipLocal).addScaledVector(sunLocal, 150); sunLight.target.position.copy(shipLocal);
          hemi.color.setRGB(lit.skyColor[0], lit.skyColor[1], lit.skyColor[2]); hemi.groundColor.setRGB(lit.groundColor[0], lit.groundColor[1], lit.groundColor[2]); hemi.intensity = Math.PI;
          const fog = scene.fog as import('three').FogExp2;
          fog.color.setRGB(lit.fogColor[0], lit.fogColor[1], lit.fogColor[2]); fog.density = lit.fogDensity;
          sky.mesh.position.copy(camera.position);
          sky.uniforms.uCamUp.value.copy(upLocal); sky.uniforms.uAlt.value = camAlt; sky.uniforms.uSun.value.copy(sunLocal); sky.uniforms.uStars.value = lit.starVisibility;
          mEcef3.setFromMatrix4(frame.basis);
          sky.uniforms.uToEcef.value.copy(mEcef3);
          rz.set(Math.cos(gast), -Math.sin(gast), 0, Math.sin(gast), Math.cos(gast), 0, 0, 0, 1); // inertial = Rz(θ)·ecef
          mInertial.multiplyMatrices(rz, mEcef3); sky.uniforms.uToInertial.value.copy(mInertial);

          // Terrain and cities around the camera / ship.
          manager.pinUnderfoot(tel.lat, tel.lon, tel.altitudeMsl);
          manager.update(frame, camera, [camEcef.x, camEcef.y, camEcef.z], renderer.domElement.height, t);
          buildings.update(frame, tel.lat, tel.lon, tel.altitudeAgl, t, manager.stats.underfootReady);

          renderer.render(scene, camera);
          if (t - hudAt > (lowQ ? 300 : 120)) {
            hudAt = t;
            const bs = buildings.stats;
            if (!spawnInfo.pending) {
              const last2 = trailBuf[trailBuf.length - 1];
              if (!last2 || Math.hypot(tel.lat - last2[0], tel.lon - last2[1]) > 1e-5) { // skip near-duplicate points (parked on the ground)
                trailBuf.push([tel.lat, tel.lon]);
                if (trailBuf.length > 400) trailBuf.shift();
                setTrail(trailBuf.slice());
              }
            }
            setHud({
              lat: rd(tel.lat, 4), lon: rd(tel.lon, 4), msl: tel.altitudeMsl, agl: tel.altitudeAgl, speed: tel.speed, vs: tel.verticalSpeed, heading: tel.heading, mach: tel.mach,
              fuel: tel.fuelFraction, mass: tel.mass, pressure: tel.air.pressure / 1000, temperature: tel.air.temperature - 273.15, q: tel.q / 1000, heat: tel.heatFlux / 1e4, sunElev,
              utc: now.toISOString().slice(0, 16).replace('T', ' ') + ' UTC', event: t < eventUntil ? eventText : '',
              terrainReady: manager.stats.ready, underfoot: manager.stats.underfootReady && !spawnInfo.pending, offline: manager.stats.offline, imagery: manager.stats.imagery, tiles: manager.stats.displayed,
              buildings: bs.buildings, estimated: bs.estimatedShare, buildingsLoading: bs.loading, buildingsFailed: bs.failed > 0 && bs.cells === 0, space: tel.inSpace, flight: tel.flightMode, throttle: tel.throttle,
              pitch: tel.pitch, warp: warpNow, warpMax, ap: tel.orbit.apoapsis, pe: tel.orbit.periapsis, vOrb: tel.orbit.inertialSpeed, vCirc: tel.orbit.circularSpeed, inOrbit: tel.orbit.inOrbit,
            });
          }
        };
        raf = requestAnimationFrame(loop);
        setReady(true);
        (window as unknown as { __earth?: unknown }).__earth = { state, manager, buildings, model, teleport, get lit() { return lit; } };
        cleanup = () => {
          cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur);
          actions.current = null; delete (window as unknown as { __earth?: unknown }).__earth;
          model.dispose(); dust.dispose(); buildings.dispose(); manager.dispose(); sky.dispose(); renderer.dispose(); canvas.remove();
        };
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Earth could not start on this device.');
      }
    })();
    return () => { disposed = true; cleanup(); };
  }, []);

  // On touch devices a blurred backdrop over a canvas that repaints every frame forces the browser to re-blur the live WebGL output each frame (a large, GPU-bound cost on phones), so the panels go slightly more opaque and unblurred instead.
  const glass = { bg: isTouch ? 'rgba(8,10,20,0.72)' : 'rgba(8,10,20,0.55)', border: '1px solid', borderColor: 'line.subtle', borderRadius: 'lg', backdropFilter: isTouch ? 'none' : 'blur(8px)' } as const;
  const fmt = (v: number, d = 0) => v.toFixed(d);
  const goPlace = (id: string) => { setPlaceId(id); const p = placeById(id); if (p) actions.current?.teleport(p.lat, p.lon, p.heading); };
  const goCoords = () => {
    const m = coords.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) { setCoordError('Enter latitude, longitude (e.g. 46.02, 7.75)'); return; }
    const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) { setCoordError('Latitude must be within ±90 and longitude within ±180'); return; }
    setCoordError(''); actions.current?.teleport(lat, lon, 0);
  };
  const place = placeById(placeId);
  const flownKm = useMemo(() => trailDistanceDeg(trail) / 1000, [trail]);

  return (
    <Box position="fixed" inset={0} bg="#0a0d14" data-testid="earth" sx={isTouch ? { '& *': { backdropFilter: 'none !important' } } : undefined}>
      <Box ref={host} position="absolute" inset={0} data-testid="earth-canvas" />
      {error && <Flex position="absolute" inset={0} align="center" justify="center" px={6} textAlign="center" bg="#0a0d14"><Text color="content.secondary">Flying over Earth needs WebGL, and this device could not start it ({error}).</Text></Flex>}
      {!ready && !error && <Flex position="absolute" inset={0} align="center" justify="center" pointerEvents="none" bg="#0a0d14"><Text color="content.muted">Spinning up the planet…</Text></Flex>}
      {view === 'first' && <Box position="absolute" inset={0} pointerEvents="none" boxShadow="inset 0 0 160px 40px rgba(0,0,0,0.35)" />}

      {!hideUi && ready && (
        <>
          <Flex position="absolute" top={3} left={3} direction="column" align="start" gap={2} maxW="calc(100% - 64px)" pointerEvents="none">
            <HStack spacing={2} wrap="wrap" align="start" opacity={awake ? 1 : 0} pointerEvents={awake ? 'auto' : 'none'} transition="opacity 0.4s" _focusWithin={{ opacity: 1, pointerEvents: 'auto' }} data-testid="earth-toolbar">
            <Button size="sm" variant="glass" leftIcon={<FiArrowLeft aria-hidden="true" />} onClick={onBack}>Hangar</Button>
            <Button size="sm" variant="glass" leftIcon={<FiPause aria-hidden="true" />} onClick={() => setPaused(true)} aria-label="Pause">{isTouch ? '' : 'Pause (Esc)'}</Button>
            {!isTouch && <Button size="xs" variant={packUpdate === 'available' ? 'solid' : 'glass'} colorScheme={packUpdate === 'available' ? 'green' : undefined} isLoading={packUpdate === 'checking'} onClick={() => (packUpdate === 'available' ? window.location.reload() : void checkForUpdates())} data-testid="pack-update-button">
              {packUpdate === 'available' ? 'Offline world updated – reload' : packUpdate === 'current' ? 'Offline world up to date' : 'Check for offline updates'}
            </Button>}
            {!isTouch && <Flex {...glass} px={1} py={1} gap={1} role="group" aria-label="Camera view">
              <Button size="xs" variant={view === 'first' ? 'solid' : 'ghost'} aria-pressed={view === 'first'} onClick={() => setView('first')}>First person</Button>
              <Button size="xs" variant={view === 'third' ? 'solid' : 'ghost'} aria-pressed={view === 'third'} onClick={() => setView('third')}>Third person</Button>
            </Flex>}
            <Button size="sm" variant={hud?.flight ? 'solid' : 'glass'} colorScheme={hud?.flight ? 'orange' : undefined} aria-pressed={!!hud?.flight} onClick={() => actions.current?.flightMode()} data-testid="mode-button">{hud?.flight ? 'Flight mode' : 'Hover mode'}{isTouch ? '' : ' (C)'}</Button>
            {hud && (hud.warpMax > 1 || hud.warp > 1) && <Button size="sm" variant={hud.warp > 1 ? 'solid' : 'glass'} colorScheme={hud.warp > 1 ? 'purple' : undefined} onClick={() => actions.current?.warp(1)} aria-label={`Time warp, now ×${hud.warp}`} data-testid="warp-button">Warp ×{hud.warp}{isTouch ? '' : ' (. ,)'}</Button>}
            <Flex {...glass} px={2} py={1} gap={2} align="center">
              <Select size="xs" w="210px" value={placeId} onChange={(e) => goPlace(e.target.value)} aria-label="Start from a place" data-testid="earth-place">
                {PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              {!isTouch && <Input size="xs" w="150px" placeholder="lat, lon" value={coords} onChange={(e) => setCoords(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') goCoords(); }} aria-label="Go to latitude, longitude" aria-invalid={!!coordError} data-testid="earth-coords" />}
              {!isTouch && <Button size="xs" onClick={goCoords}>Go</Button>}
              {!isTouch && <PlaceSearch glass={glass} onSelect={(la, lo) => actions.current?.teleport(la, lo, 0)} />}
            </Flex>
          </HStack>
            {coordError && <Text fontSize="xs" color="red.300" role="alert">{coordError}</Text>}
            <Flex direction="column" gap={1} pointerEvents="none" maxW={isTouch ? '240px' : '320px'} fontSize={isTouch ? '10px' : undefined}>
            {hud && !hud.underfoot && !hud.offline && <Text {...glass} px={3} py={1} fontSize="sm" data-testid="earth-loading">Loading the ground under {place?.name.split(',')[0] ?? 'you'}… {fmt(hud.terrainReady * 100)}%</Text>}
            {hud && (() => {
              // One quiet line instead of a box per missing data source (the full wording is the tooltip, and screen readers get it too).
              const notes: string[] = [];
              if (hud.offline) notes.push('terrain is flat sea level');
              if (!isTouch && hud.imagery === 0 && hud.tiles > 0 && imageryOn) notes.push('ground colours are estimated');
              if (!isTouch && hud.buildingsFailed && buildingsOn && hud.agl < 1500) notes.push('no 3D buildings');
              if (!notes.length) return null;
              return <Text {...glass} px={3} py={1} fontSize="xs" color="orange.200" title="Some map data could not be reached from here: the ground may be flat sea level instead of real terrain, with estimated colours and no 3D buildings." data-testid={hud.offline ? 'earth-offline' : 'earth-data-note'}>⚠ Live map data unreachable: {notes.join(' · ')}</Text>;
            })()}
            {hud && hud.buildings > 0 && <Text {...glass} px={3} py={1} fontSize="xs" color="content.muted" data-testid="earth-buildings">{hud.buildings} buildings (OpenStreetMap){hud.estimated > 0.05 ? `; heights guessed for ${fmt(hud.estimated * 100)}%` : ''}</Text>}
          </Flex>
          </Flex>
          

          {!isTouch && helpOpen && inputKind === 'keys' && <Box {...glass} position="absolute" top={{ base: '130px', md: '56px' }} right={3} p={3} maxW="260px" fontSize="xs" color="content.secondary" data-testid="earth-help">
            <Text fontWeight={700} color="content.primary" mb={1}>Controls</Text>
            <Text><b>Space / Shift</b> climb / descend (airbrake in flight) · <b>W S</b> thrust / retro (throttle lever in flight) · <b>A D</b> strafe</Text>
            <Text><b>Q E</b> yaw · <b>↑ ↓</b> pitch · <b>← →</b> roll</Text>
            <Text><b>C</b> hover ⇄ flight mode · <b>V</b> view · <b>H</b> assist · <b>R</b> back to takeoff · <b>I</b> hide</Text>
            <Text><b>. ,</b> time warp (out of the thick air) · <b>[ ]</b> time of day ∓1 h (<b>Shift</b> ∓6 h)</Text>
            <Text mt={1}>Controller: sticks fly, R2/L2 climb/descend, {buttonName('triangle', 'playstation')} view, {buttonName('cross', 'playstation')} flight mode, {buttonName('circle', 'playstation')} back.</Text>
            <Flex gap={3} mt={2} wrap="wrap">
              <Checkbox size="sm" isChecked={hoverAssist} onChange={(e) => setHoverAssist(e.target.checked)}>Hover assist</Checkbox>
              <Checkbox size="sm" isChecked={levelAssist} onChange={(e) => setLevelAssist(e.target.checked)}>Level assist</Checkbox>
              <Checkbox size="sm" isChecked={imageryOn} onChange={(e) => setImageryOn(e.target.checked)}>Satellite imagery</Checkbox>
              <Checkbox size="sm" isChecked={buildingsOn} onChange={(e) => setBuildingsOn(e.target.checked)}>Buildings</Checkbox>
              <Checkbox size="sm" isChecked={labelsOn} isDisabled={!imageryOn} onChange={(e) => setLabelsOn(e.target.checked)}>Street names</Checkbox>
              <Checkbox size="sm" isChecked={minimapOn} onChange={(e) => setMinimapOn(e.target.checked)}>Minimap (M)</Checkbox>
            </Flex>
            <Flex gap={1} mt={2} align="center"><Text>Time</Text><Button size="xs" onClick={() => actions.current?.timeShift(-1)} aria-label="One hour earlier">−1 h</Button><Button size="xs" onClick={() => actions.current?.timeShift(1)} aria-label="One hour later">+1 h</Button><Button size="xs" onClick={() => actions.current?.timeShift('now')}>Now</Button></Flex>
          </Box>}

          

          <Flex position="absolute" left={3} right={3} bottom={isTouch ? 'auto' : 3} top={isTouch ? '54px' : 'auto'} direction="column" align="center" gap={2} pointerEvents="none" fontSize={isTouch ? 'xs' : undefined}>
            {hud && hud.msl > 20_000 && (
              <Flex {...glass} px={4} py={1} gap={4} wrap="wrap" justify="center" fontFamily="mono" fontSize="sm" data-testid="earth-orbit">
                <Text>V <b>{fmt(hud.vOrb / 1000, 2)}</b> km/s <Text as="span" color="content.muted">(orbital {fmt(hud.vCirc / 1000, 2)})</Text></Text>
                <Text>AP <b>{hud.ap === null ? 'escape' : fmt(hud.ap / 1000)}</b>{hud.ap === null ? '' : ' km'}</Text>
                <Text>PE <b>{fmt(hud.pe / 1000)}</b> km</Text>
                {hud.inOrbit && <Text color="green.300" fontWeight={700} data-testid="in-orbit">IN ORBIT</Text>}
              </Flex>
            )}
            {hud?.event && <Text {...glass} px={3} py={1} fontSize="sm" data-testid="earth-event">{hud.event}</Text>}
            {hud && hud.heat > 25 && <Text {...glass} px={3} py={1} fontSize="sm" color="orange.200">Re-entry heating {fmt(hud.heat)} W/cm² (damage is not modelled yet)</Text>}
            <Flex direction="column" align="center" gap={1} fontFamily="mono" color="white" textShadow="0 1px 6px rgba(0,0,0,0.9)" data-testid="earth-hud" pointerEvents="auto" cursor="pointer" role="button" tabIndex={0} aria-pressed={details} aria-label="Detailed telemetry (T)" onClick={() => setDetails((v) => !v)} onKeyDown={(e) => { if (e.key === 'Enter') setDetails((v) => !v); }}>
              <Flex align="baseline" gap={{ base: 4, md: 6 }}>
                <Text fontSize="xs" color="whiteAlpha.700">HDG <b>{fmt(hud?.heading ?? 0)}</b>°</Text>
                <Text fontSize={isTouch ? 'xl' : '3xl'} fontWeight={700} lineHeight={1}>
                  <span data-testid="hud-speed">{fmt(hud?.speed ?? 0)}</span><Text as="span" fontSize="xs" fontWeight={400} ml={1} color="whiteAlpha.700">m/s</Text>
                  {hud && hud.mach >= 0.8 && <Text as="span" fontSize="sm" fontWeight={400} ml={2} color="orange.200">M {fmt(hud.mach, 1)}</Text>}
                </Text>
                <Text fontSize="xs" color="whiteAlpha.700">ALT <b data-testid="hud-agl">{hud && hud.agl >= 20_000 ? `${fmt(hud.agl / 1000, 0)} km` : `${fmt(hud?.agl ?? 0, hud && hud.agl < 100 ? 1 : 0)} m`}</b></Text>
              </Flex>
              <Flex gap={3} align="center" aria-hidden="true">
                <Box w={{ base: '90px', md: '140px' }} h="2px" bg="whiteAlpha.300" borderRadius="full"><Box h="100%" w={`${Math.max(0, Math.min(1, hud?.fuel ?? 1)) * 100}%`} bg={(hud?.fuel ?? 1) < 0.15 ? 'red.300' : 'whiteAlpha.800'} borderRadius="full" /></Box>
                {hud?.flight && <Box w={{ base: '50px', md: '80px' }} h="2px" bg="whiteAlpha.300" borderRadius="full"><Box h="100%" w={`${Math.max(0, Math.min(1, hud.throttle)) * 100}%`} bg="orange.300" borderRadius="full" /></Box>}
              </Flex>
              <VisuallyHidden>Fuel {fmt((hud?.fuel ?? 1) * 100)} percent{hud?.flight ? `, throttle ${fmt((hud?.throttle ?? 0) * 100)} percent` : ''}</VisuallyHidden>
              {!isTouch && inputKind === 'keys' && <Text fontSize="10px" color="whiteAlpha.500">K controls · T details</Text>}
            </Flex>
            {details && (
              <Flex direction="column" align="center" gap={2} pointerEvents="auto" data-testid="earth-details-panel">
            <Flex {...glass} px={4} py={2} gap={4} wrap="wrap" justify="center" fontFamily="mono" fontSize="sm" data-testid="earth-details">
              <Text>LAT <b data-testid="hud-lat">{fmt(hud?.lat ?? 0, 4)}</b></Text>
              <Text>LON <b data-testid="hud-lon">{fmt(hud?.lon ?? 0, 4)}</b></Text>
              <Text>ALT <b data-testid="hud-msl">{fmt(hud?.msl ?? 0)}</b> m</Text>
              <Text>AGL <b data-testid="hud-agl-detail">{fmt(hud?.agl ?? 0, 1)}</b> m</Text>
              <Text>SPD <b data-testid="hud-speed-detail">{fmt(hud?.speed ?? 0)}</b> m/s</Text>
              <Text>M <b>{fmt(hud?.mach ?? 0, 2)}</b></Text>
              <Text>V/S <b>{fmt(hud?.vs ?? 0, 1)}</b></Text>
              <Text>HDG <b>{fmt(hud?.heading ?? 0)}</b>°</Text>
              {hud?.flight && <Text>THR <b data-testid="hud-throttle">{fmt(hud.throttle * 100)}</b>%</Text>}
              {hud && (hud.msl > 15_000 || hud.flight) && <Text>PITCH <b data-testid="hud-pitch">{fmt(hud.pitch)}</b>°</Text>}
              <Text>FUEL <b>{fmt((hud?.fuel ?? 1) * 100)}</b>%</Text>
              {flownKm > 0 && <Text>FLOWN <b>{fmt(flownKm, flownKm < 100 ? 1 : 0)}</b> km</Text>}
            </Flex>

            <Flex {...glass} px={4} py={1} gap={4} wrap="wrap" justify="center" fontFamily="mono" fontSize="xs" color="content.muted" data-testid="earth-air">
              <Text>AIR {fmt(hud?.pressure ?? 101.3, 1)} kPa · {fmt(hud?.temperature ?? 15, 0)} °C · q {fmt(hud?.q ?? 0, 1)} kPa</Text>
              <Text>{hud?.utc} · Sun {fmt(hud?.sunElev ?? 0, 0)}°</Text>
              {hud?.space && <Text>IN SPACE</Text>}
            </Flex>
              </Flex>
            )}
            {(details || helpOpen) && !isTouch && (
            <Text fontSize="10px" color="content.muted" alignSelf="flex-start" maxW={helpOpen && inputKind === 'keys' ? 'calc(100% - 290px)' : '900px'} data-testid="earth-credits">
              Elevation: Mapzen/AWS Terrain Tiles (SRTM, GEBCO and others) · Imagery: Sentinel-2 cloudless 2016 by EOX (CC BY 4.0), NASA GIBS Blue Marble · Buildings: © OpenStreetMap contributors (ODbL) · Sun: astronomy-engine · Atmosphere: US Standard 1976. No wind or weather yet.
            </Text>
            )}
          </Flex>
          {minimapOn && hud && <Minimap lat={hud.lat} lon={hud.lon} heading={hud.heading} agl={hud.agl} glass={glass} trail={trail} onSelectPlace={(la, lo) => actions.current?.teleport(la, lo, 0)} />}
        </>
      )}
      {paused && ready && (
        <Flex position="absolute" inset={0} align="center" justify="center" bg="blackAlpha.700" zIndex={20} data-testid="earth-pause">
          <Box {...glass} p={6} w="min(92vw, 360px)" role="dialog" aria-modal="true" aria-label="Paused">
            <Text fontWeight={700} fontSize="lg" mb={4}>Paused</Text>
            <Stack spacing={4} mb={2}>
              <Button onClick={() => setPaused(false)} autoFocus>Resume</Button>
              <Box>
                <Text fontSize="sm" color="content.secondary" mb={1}>Comfort</Text>
                <Select size="sm" value={reducedMotionPref} onChange={(e) => setReducedMotionPref(e.target.value as typeof reducedMotionPref)} aria-label="Reduced motion">
                  <option value="auto">Reduced motion: follow system setting</option>
                  <option value="on">Reduced motion: on</option>
                  <option value="off">Reduced motion: off</option>
                </Select>
              </Box>
              <Button variant="outline" onClick={onBack}>Exit to hangar</Button>
            </Stack>
            <Text fontSize="xs" color="content.muted">Esc to resume · the ship holds its position while paused</Text>
          </Box>
        </Flex>
      )}
      {isTouch && ready && <TouchControls input={touchInput} actions={() => actions.current} />}
      <VisuallyHidden role="status" aria-live="polite">{hud?.event ?? ''}</VisuallyHidden>
    </Box>
  );
}
