// src/components/fly/FlightArena.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { BufferAttribute } from 'three';
import { Box, Button, Checkbox, Flex, HStack, Text, VisuallyHidden } from '@chakra-ui/react';
import { FiArrowLeft } from 'react-icons/fi';
import { usePadFrames } from '@/components/input/usePad';
import { buttonName } from '@/lib/input/gamepad';
import { CameraRig, type ViewMode } from '@/lib/fly/camera';
import { podTargets } from '@/lib/fly/ship/pods';
import { KESTREL } from '@/lib/fly/ships/specs';
import { ARENA_HALF_SIZE, PAD_RADIUS, groundHeight } from '@/lib/fly/sim/terrain';
import { NO_INPUT, clearEvent, initialState, resetToPad, step, telemetry, type FlightInput, type Telemetry } from '@/lib/fly/sim/flight';
import { ResourceTracker, trackObject } from '@/lib/fly/stream';

interface Hud extends Telemetry { event: string; assist: boolean }
const EVENT_TEXT = { landed: 'Landed.', rough: 'Rough landing: slow your descent and level out.', crash: 'Hard impact: the ship was returned to the pad.' } as const;

export default function FlightArena({ onBack }: { onBack: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewMode>('third');
  const [hud, setHud] = useState<Hud | null>(null);
  const [hideUi, setHideUi] = useState(false);
  const [hoverAssist, setHoverAssist] = useState(true);
  const [levelAssist, setLevelAssist] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  // Game-style UI: help follows the device in use (hidden for a controller), the toolbar fades when the pointer is still, K brings help back.
  const [inputKind, setInputKind] = useState<'keys' | 'pad'>('keys');
  const [helpOpen, setHelpOpen] = useState(true);
  const [awake, setAwake] = useState(true);
  useEffect(() => { const t = window.setTimeout(() => setHelpOpen(false), 12_000); return () => window.clearTimeout(t); }, []);
  useEffect(() => {
    let t = 0;
    const wake = () => { setAwake(true); window.clearTimeout(t); t = window.setTimeout(() => setAwake(false), 3500); };
    wake();
    window.addEventListener('pointermove', wake); window.addEventListener('pointerdown', wake);
    return () => { window.clearTimeout(t); window.removeEventListener('pointermove', wake); window.removeEventListener('pointerdown', wake); };
  }, []);
  const flags = useRef({ view, hoverAssist, levelAssist, gear: true });
  flags.current.view = view; flags.current.hoverAssist = hoverAssist; flags.current.levelAssist = levelAssist;
  const keys = useRef(new Set<string>());
  const pad = useRef<FlightInput>({ ...NO_INPUT });
  const padActive = useRef(false);
  const actions = useRef<{ reset: () => void; gear: () => void; view: () => void } | null>(null);

  // --- controller: sticks fly, buttons switch the view, gear and reset ---------------------------------
  usePadFrames(({ pad: p, pressed }) => {
    if (Math.abs(p.lx) + Math.abs(p.ly) + Math.abs(p.rx) + Math.abs(p.ry) + p.l2 + p.r2 > 0.05 || p.down.l1 || p.down.r1) setInputKind('pad');
    padActive.current = Math.abs(p.lx) + Math.abs(p.ly) + Math.abs(p.rx) + Math.abs(p.ry) + p.l2 + p.r2 > 0.05 || p.down.l1 || p.down.r1;
    pad.current = {
      collective: p.r2 - p.l2, forward: -p.ly, strafe: p.lx, yaw: p.rx, pitch: p.ry, roll: (p.down.r1 ? 1 : 0) - (p.down.l1 ? 1 : 0),
    };
    for (const c of pressed) {
      if (c === 'triangle') actions.current?.view();
      else if (c === 'square') actions.current?.gear();
      else if (c === 'circle') actions.current?.reset();
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
        const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
        const { buildKestrel } = await import('@/lib/fly/ship/kestrel');
        if (disposed) return;
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'The Kestrel flying over a test arena. First-person and third-person views are available.');
        el.prepend(canvas);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        const gl = renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const soft = /swiftshader|llvmpipe|software/i.test(ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '');
        renderer.setPixelRatio(soft ? 0.6 : Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
        const scene = new THREE.Scene();
        const tracker = new ResourceTracker();
        const skyTop = new THREE.Color(0x4f86c8), skyHorizon = new THREE.Color(0xbcd4ea);
        scene.background = skyHorizon.clone();
        scene.fog = new THREE.Fog(skyHorizon, 220, 1100);
        const camera = new THREE.PerspectiveCamera(55, 1, 0.08, 4000);
        const sun = new THREE.DirectionalLight(0xfff0d8, 3.1); sun.position.set(80, 140, 60); sun.castShadow = true;
        sun.shadow.mapSize.set(soft ? 1024 : 2048, soft ? 1024 : 2048);
        const sc = sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 10; sc.far = 400; sun.shadow.bias = -0.0005;
        scene.add(sun, sun.target);
        scene.add(new THREE.HemisphereLight(skyTop, 0x4a4e40, 0.6));
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // image-based light so the ship's metal and clearcoat read properly
        scene.environmentIntensity = 0.9;

        // Terrain from the same function the physics samples.
        const N = soft ? 120 : 220, SIZE = ARENA_HALF_SIZE * 2;
        const tg = new THREE.PlaneGeometry(SIZE, SIZE, N, N);
        tg.rotateX(-Math.PI / 2);
        const pos = tg.getAttribute('position') as BufferAttribute;
        const col = new Float32Array(pos.count * 3);
        const c1 = new THREE.Color(0x5b6b48), c2 = new THREE.Color(0x8b8467), c3 = new THREE.Color(0xb9b5a4), tc = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), z = pos.getZ(i), h = groundHeight(x, z);
          pos.setY(i, h);
          const t = Math.min(1, Math.max(0, h / 14));
          tc.copy(c1).lerp(c2, Math.min(1, t * 1.6)).lerp(c3, Math.max(0, t - 0.55) * 2);
          const pad = Math.hypot(x, z) < PAD_RADIUS ? 1 : 0;
          if (pad) tc.set(0x6a6f76);
          col.set([tc.r, tc.g, tc.b], i * 3);
        }
        tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
        tg.computeVertexNormals();
        // A faint 10 m grid texture gives a sense of speed near the ground.
        const gc = document.createElement('canvas'); gc.width = gc.height = 256;
        const g2 = gc.getContext('2d')!; g2.fillStyle = '#fff'; g2.fillRect(0, 0, 256, 256); g2.strokeStyle = 'rgba(0,0,0,0.16)'; g2.lineWidth = 3; g2.strokeRect(0, 0, 256, 256);
        const gt = new THREE.CanvasTexture(gc); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(SIZE / 10, SIZE / 10); gt.anisotropy = 4; gt.colorSpace = THREE.SRGBColorSpace;
        const tm = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, map: gt, roughness: 0.95, metalness: 0 }));
        tm.receiveShadow = true; scene.add(tm);
        // Landing pad marks.
        const padMat = new THREE.MeshBasicMaterial({ color: 0xffa23a, toneMapped: false });
        const ringM = new THREE.Mesh(new THREE.RingGeometry(PAD_RADIUS - 1.2, PAD_RADIUS - 0.8, 96), padMat); ringM.rotation.x = -Math.PI / 2; ringM.position.y = 0.03; scene.add(ringM);
        const ringI = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.0, 64), new THREE.MeshBasicMaterial({ color: 0xffffff })); ringI.rotation.x = -Math.PI / 2; ringI.position.y = 0.03; scene.add(ringI);
        // Beacon pylons scattered deterministically around, for scale and speed cues.
        const pylonGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 8), pylonMat = new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.5, metalness: 0.4 });
        const lampGeo = new THREE.SphereGeometry(0.4, 10, 8), lampMat = new THREE.MeshBasicMaterial({ color: 0xff6a3a, toneMapped: false });
        for (let i = 0; i < 48; i++) {
          const a = i * 2.399963, r = 40 + 11 * i; // golden-angle spiral outward
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          if (Math.abs(x) > ARENA_HALF_SIZE - 20 || Math.abs(z) > ARENA_HALF_SIZE - 20) continue;
          const y = groundHeight(x, z);
          const p = new THREE.Mesh(pylonGeo, pylonMat); p.position.set(x, y + 3, z); p.castShadow = true; scene.add(p);
          const l = new THREE.Mesh(lampGeo, lampMat); l.position.set(x, y + 6.3, z); scene.add(l);
        }

        const model = buildKestrel({ glass: soft ? 'simple' : 'physical', detail: soft ? 32 : 56 });
        scene.add(model.root);

        const state = initialState();
        const rig = new CameraRig('third', { reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches });
        const fit = () => { const r = el.getBoundingClientRect(); renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); };
        fit();
        const ro = new ResizeObserver(fit); ro.observe(el);

        actions.current = {
          reset: () => { resetToPad(state); },
          gear: () => { state.gear = !state.gear; flags.current.gear = state.gear; },
          view: () => setView((v) => (v === 'first' ? 'third' : 'first')),
        };

        const onKeyDown = (e: KeyboardEvent) => {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
          if (['w', 'a', 's', 'd', 'q', 'e', ' ', 'Shift', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) { keys.current.add(k); setInputKind('keys'); e.preventDefault(); }
          else if (k === 'k') setHelpOpen((v) => !v);
          else if (k === 'v') actions.current?.view();
          else if (k === '1') setView('first');
          else if (k === '3') setView('third');
          else if (k === 'g') actions.current?.gear();
          else if (k === 'r') actions.current?.reset();
          else if (k === 'i') setHideUi((v) => !v);
          else if (k === 'h') setHoverAssist((v) => !v);
        };
        const onKeyUp = (e: KeyboardEvent) => { keys.current.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); };
        window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
        const onBlur = () => keys.current.clear(); window.addEventListener('blur', onBlur);

        const keyboardInput = (): FlightInput => {
          const k = keys.current, ax = (neg: string, pos: string) => (k.has(pos) ? 1 : 0) - (k.has(neg) ? 1 : 0);
          return { collective: (k.has(' ') ? 1 : 0) - (k.has('Shift') ? 1 : 0), forward: ax('s', 'w'), strafe: ax('a', 'd'), yaw: ax('q', 'e'), pitch: ax('ArrowUp', 'ArrowDown'), roll: ax('ArrowLeft', 'ArrowRight') };
        };

        let raf = 0, last = performance.now(), acc = 0, hudAt = 0, lastView: ViewMode = 'third', eventText = '', eventUntil = 0;
        const loop = (t: number) => {
          raf = requestAnimationFrame(loop);
          if (document.hidden) { last = t; return; }
          const dt = Math.min(0.1, (t - last) / 1000); last = t;
          const f = flags.current;
          // Input: keyboard plus controller (the controller wins when it is being touched).
          const kin = keyboardInput(), pin = pad.current;
          const input: FlightInput = padActive.current ? { collective: pin.collective + kin.collective, forward: pin.forward + kin.forward, strafe: pin.strafe + kin.strafe, yaw: pin.yaw + kin.yaw, pitch: pin.pitch + kin.pitch, roll: pin.roll + kin.roll } : kin;
          acc += dt;
          while (acc >= 1 / 60) { step(state, input, 1 / 60, { hoverAssist: f.hoverAssist, levelAssist: f.levelAssist }); acc -= 1 / 60; }
          // Arena edge: nudge back so the ship never leaves the terrain.
          const lim = ARENA_HALF_SIZE - 10;
          if (Math.abs(state.pos.x) > lim) { state.pos.x = Math.sign(state.pos.x) * lim; state.vel.x = 0; }
          if (Math.abs(state.pos.z) > lim) { state.pos.z = Math.sign(state.pos.z) * lim; state.vel.z = 0; }
          if (state.event) {
            eventText = EVENT_TEXT[state.event.kind]; eventUntil = t + 4000;
            if (state.event.kind === 'crash') resetToPad(state); else clearEvent(state);
          }
          // Visuals from the simulated quantities.
          model.root.position.copy(state.pos); model.root.quaternion.copy(state.q);
          const tel = telemetry(state);
          model.setGear(state.gear ? 1 : 0);
                    model.setPods(podTargets({ hoverN: tel.hoverN, mainN: tel.mainN, yaw: input.yaw, roll: input.roll }, KESTREL.thrust.hover));
          model.update(dt);
          if (f.view !== lastView) { rig.setMode(f.view); lastView = f.view; model.setFirstPerson(f.view === 'first'); }
          rig.update(dt, state.pos, state.q, state.vel);
          camera.position.copy(rig.pose.pos); camera.quaternion.copy(rig.pose.quat);
          if (Math.abs(camera.fov - rig.fov) > 0.01) { camera.fov = rig.fov; camera.near = f.view === 'first' ? 0.05 : 0.3; camera.updateProjectionMatrix(); }
          sun.position.set(state.pos.x + 80, state.pos.y + 140, state.pos.z + 60); sun.target.position.copy(state.pos);
          renderer.render(scene, camera);
          if (t - hudAt > 100) {
            hudAt = t;
            setHud({ ...tel, event: t < eventUntil ? eventText : '', assist: f.hoverAssist });
          }
        };
        raf = requestAnimationFrame(loop);
        setReady(true);
        cleanup = () => {
          cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur);
          actions.current = null; model.dispose(); trackObject(tracker, scene, 'arena'); tracker.track(gt, 'arena', 'texture'); tracker.disposeAll(); pmrem.dispose(); renderer.dispose(); canvas.remove();
        };
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The flight arena could not start on this device.');
      }
    })();
    return () => { disposed = true; cleanup(); };
  }, []);

  const glass = { bg: 'rgba(8,10,20,0.55)', border: '1px solid', borderColor: 'line.subtle', borderRadius: 'lg', backdropFilter: 'blur(8px)' } as const;
  const fmt = (v: number, d = 0) => v.toFixed(d);
  return (
    <Box position="fixed" inset={0} bg="#9fc0e0" data-testid="arena">
      <Box ref={host} position="absolute" inset={0} data-testid="arena-canvas" />
      {error && <Flex position="absolute" inset={0} align="center" justify="center" px={6} textAlign="center" bg="#0a0d14"><Text color="content.secondary">The flight arena needs WebGL, and this device could not start it ({error}).</Text></Flex>}
      {!ready && !error && <Flex position="absolute" inset={0} align="center" justify="center" pointerEvents="none" bg="#0a0d14"><Text color="content.muted">Rolling the Kestrel out…</Text></Flex>}
      {view === 'first' && <Box position="absolute" inset={0} pointerEvents="none" boxShadow="inset 0 0 160px 40px rgba(0,0,0,0.35)" />}

      {!hideUi && (
        <>
          <HStack position="absolute" top={3} left={3} spacing={2} wrap="wrap" maxW="calc(100% - 64px)" opacity={awake ? 1 : 0} pointerEvents={awake ? 'auto' : 'none'} transition="opacity 0.4s" _focusWithin={{ opacity: 1, pointerEvents: 'auto' }}>
            <Button size="sm" variant="glass" leftIcon={<FiArrowLeft aria-hidden="true" />} onClick={onBack}>Hangar</Button>
            <Flex {...glass} px={1} py={1} gap={1} role="group" aria-label="Camera view">
              <Button size="xs" variant={view === 'first' ? 'solid' : 'ghost'} aria-pressed={view === 'first'} onClick={() => setView('first')}>First person</Button>
              <Button size="xs" variant={view === 'third' ? 'solid' : 'ghost'} aria-pressed={view === 'third'} onClick={() => setView('third')}>Third person</Button>
            </Flex>
          </HStack>

          <Box {...glass} position="absolute" top={{ base: '96px', md: '60px' }} left={3} p={3} maxW="280px" fontSize="xs" color="content.secondary" display={helpOpen && inputKind === 'keys' ? 'block' : 'none'} data-testid="arena-help">
            <Text fontWeight={700} color="content.primary" mb={1}>Controls</Text>
            <Text><b>Space / Shift</b> climb / descend · <b>W S</b> thrust / retro · <b>A D</b> strafe</Text>
            <Text><b>Q E</b> yaw · <b>↑ ↓</b> pitch · <b>← →</b> roll</Text>
            <Text><b>V</b> view · <b>G</b> gear · <b>H</b> hover assist · <b>R</b> reset · <b>I</b> hide</Text>
            <Text mt={1}>Controller: sticks fly, R2/L2 climb/descend, L1/R1 roll, {buttonName('triangle', 'playstation')} view, {buttonName('square', 'playstation')} gear, {buttonName('circle', 'playstation')} reset.</Text>
            <Flex gap={3} mt={2}>
              <Checkbox size="sm" isChecked={hoverAssist} onChange={(e) => setHoverAssist(e.target.checked)}>Hover assist</Checkbox>
              <Checkbox size="sm" isChecked={levelAssist} onChange={(e) => setLevelAssist(e.target.checked)}>Level assist</Checkbox>
            </Flex>
          </Box>

          <Flex position="absolute" left={3} right={3} bottom={3} direction="column" align="center" gap={2} pointerEvents="none">
            {hud?.event && <Text {...glass} px={3} py={1} fontSize="sm" data-testid="arena-event">{hud.event}</Text>}
            <Flex px={4} py={1} gap={5} wrap="wrap" justify="center" fontFamily="mono" fontSize="sm" color="white" textShadow="0 1px 6px rgba(0,0,0,0.9)" data-testid="arena-hud">
              <Text>SPD <b data-testid="hud-speed">{fmt(hud?.speed ?? 0)}</b> m/s</Text>
              <Text>ALT <b data-testid="hud-alt">{fmt(hud?.altitude ?? 0, 1)}</b> m</Text>
              <Text>V/S <b>{fmt(hud?.verticalSpeed ?? 0, 1)}</b> m/s</Text>
              <Text>HDG <b>{fmt(hud?.heading ?? 0)}</b>°</Text>
              <Text>FUEL <b>{fmt((hud?.fuelFraction ?? 1) * 100)}</b>%</Text>
              <Text>MASS <b>{fmt((hud?.mass ?? 8500) / 1000, 2)}</b> t</Text>
            </Flex>
          </Flex>
        </>
      )}
      <VisuallyHidden role="status" aria-live="polite">{hud?.event ?? ''}</VisuallyHidden>
    </Box>
  );
}
