// src/components/fly/Hangar.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import NextLink from 'next/link';
import { Box, Button, Checkbox, Collapse, Flex, HStack, Slider, SliderFilledTrack, SliderThumb, SliderTrack, Text, VisuallyHidden } from '@chakra-ui/react';
import { FiArrowLeft, FiCamera } from 'react-icons/fi';
import { KESTREL, deltaV, thrustToWeight, G0 } from '@/lib/fly/ships/specs';
import type { KestrelModel } from '@/lib/fly/ship/kestrel';
import { ResourceTracker, trackObject } from '@/lib/fly/stream';

type View = 'three-quarter' | 'side' | 'top' | 'front' | 'cockpit';
const VIEWS: Record<View, { pos: [number, number, number]; target: [number, number, number] }> = {
  'three-quarter': { pos: [8.5, 3.6, 9.5], target: [0.3, 0.1, 0] },
  side: { pos: [0.5, 0.6, 15], target: [0.2, 0.1, 0] },
  top: { pos: [0.2, 15, 0.1], target: [0.2, 0, 0] },
  front: { pos: [15, 1.0, 0.1], target: [0, 0.2, 0] },
  cockpit: { pos: [1.98, 0.85, 0.36], target: [8, 0.85, 0.36] },
};
const VIEW_LABEL: Record<View, string> = { 'three-quarter': '3/4', side: 'Side', top: 'Top', front: 'Front', cockpit: 'Cockpit' };

export default function Hangar({ onFly, onEarth }: { onFly?: () => void; onEarth?: () => void } = {}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ model: KestrelModel | null; setView: (v: View) => void; capture: () => Promise<Blob | null> } | null>(null);
  const [thrust, setThrust] = useState(0);
  const [cruise, setCruise] = useState(0);
  const [gear, setGear] = useState(true);
  const [lights, setLights] = useState(true);
  const [spin, setSpin] = useState(true);
  const [info, setInfo] = useState(false); // the ship card starts as just a name: specs open on demand so the ship stays in view
  const [view, setViewState] = useState<View>('three-quarter');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const state = useRef({ thrust, cruise, gear, lights, spin });
  state.current = { thrust, cruise, gear, lights, spin };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import('three');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
        const { buildKestrel } = await import('@/lib/fly/ship/kestrel');
        if (disposed) return;
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'The Kestrel, a small glass-bubble VTOL craft, in a hangar. Drag to orbit, scroll to zoom.');
        el.prepend(canvas);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        const gl = renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const soft = /swiftshader|llvmpipe|software/i.test(ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '');
        renderer.setPixelRatio(soft ? 0.75 : Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const scene = new THREE.Scene();
        const tracker = new ResourceTracker();
        scene.background = new THREE.Color(0x0a0d14);
        scene.fog = new THREE.Fog(0x0a0d14, 22, 60);
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environmentIntensity = 0.7;
        const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
        const controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 2.5; controls.maxDistance = 30; controls.maxPolarAngle = Math.PI * 0.62;
        const place = (v: View) => { const x = VIEWS[v]; camera.position.set(...x.pos); controls.target.set(...x.target); controls.update(); };

        // Hangar floor: a dark pad with a glowing ring and landing marks.
        const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 96), new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.5, metalness: 0.6 }));
        floor.rotation.x = -Math.PI / 2; floor.position.y = -2.06; floor.receiveShadow = true; scene.add(floor);
        const ring = new THREE.Mesh(new THREE.RingGeometry(6.4, 6.55, 96), new THREE.MeshBasicMaterial({ color: 0xffa23a, toneMapped: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = -2.05; scene.add(ring);
        const ring2 = new THREE.Mesh(new THREE.RingGeometry(9.9, 9.96, 96), new THREE.MeshBasicMaterial({ color: 0x3a4658 }));
        ring2.rotation.x = -Math.PI / 2; ring2.position.y = -2.05; scene.add(ring2);
        // Lights: warm key with shadows, cool fill, rim from behind.
        const key = new THREE.DirectionalLight(0xfff1dd, 2.6); key.position.set(7, 11, 6); key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -9; key.shadow.camera.right = 9; key.shadow.camera.top = 9; key.shadow.camera.bottom = -9; key.shadow.bias = -0.0004; scene.add(key);
        const fill = new THREE.DirectionalLight(0x8fb8ff, 0.7); fill.position.set(-8, 4, -5); scene.add(fill);
        const rim = new THREE.DirectionalLight(0xbfe6ff, 1.2); rim.position.set(-4, 3, 9); scene.add(rim);

        const model = buildKestrel({ glass: soft ? 'simple' : 'physical', detail: soft ? 32 : 64 });
        scene.add(model.root);
        api.current = { model, setView: place, capture: () => new Promise((res) => { renderer.render(scene, camera); canvas.toBlob((b) => res(b), 'image/png'); }) };
        place('three-quarter');

        const fit = () => { const r = el.getBoundingClientRect(); renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); };
        fit();
        const ro = new ResizeObserver(fit); ro.observe(el);
        let raf = 0, last = performance.now(), idleAt = 0;
        const clock = { gear: 1, thrust: 0, cruise: 0 };
        const loop = (t: number) => {
          raf = requestAnimationFrame(loop);
          if (document.hidden) { last = t; return; }
          const dt = Math.min(0.1, (t - last) / 1000); last = t;
          const s = state.current;
          // Ease the controls so the parts move like machinery, not like a slider.
          const k = 1 - Math.exp(-dt * 4);
          clock.gear += ((s.gear ? 1 : 0) - clock.gear) * k; clock.thrust += (s.thrust - clock.thrust) * k; clock.cruise += (s.cruise - clock.cruise) * k;
          model.setGear(clock.gear); model.setPods({ left: clock.cruise * 1.6, right: clock.cruise * 1.6, thrustLeft: clock.thrust, thrustRight: clock.thrust }); model.setLights(s.lights);
          model.update(dt);
          // Hover bob proportional to thrust, so the craft rises off the pad as the lift ring comes up.
          model.root.position.y = 0.9 * clock.thrust * Math.cos(clock.cruise * 1.6) + Math.sin(t / 900) * 0.03 * clock.thrust;
          if (s.spin) { model.root.rotation.y += dt * 0.25; idleAt = t; }
          void idleAt;
          controls.update();
          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(loop);
        setReady(true);
        cleanup = () => {
          cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); model.dispose();
          trackObject(tracker, scene, 'hangar'); tracker.disposeAll(); pmrem.dispose(); renderer.dispose(); canvas.remove(); api.current = null;
        };
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The 3D view could not start on this device.');
      }
    })();
    return () => { disposed = true; cleanup(); };
  }, []);

  const pickView = (v: View) => { setViewState(v); api.current?.setView(v); if (v !== 'three-quarter') setSpin(false); };
  const save = async () => {
    const blob = await api.current?.capture();
    if (!blob) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kestrel.png'; a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const dv = deltaV(KESTREL) / 1000;
  const glass = { bg: 'rgba(8,10,20,0.6)', border: '1px solid', borderColor: 'line.subtle', borderRadius: 'lg', backdropFilter: 'blur(8px)' } as const;
  return (
    <Box position="fixed" inset={0} bg="#0a0d14" data-testid="hangar">
      <Box ref={host} position="absolute" inset={0} data-testid="hangar-canvas" />
      {error && <Flex position="absolute" inset={0} align="center" justify="center" px={6} textAlign="center"><Text color="content.secondary">The 3D hangar needs WebGL, and this device could not start it ({error}). The Kestrel’s data is listed below.</Text></Flex>}
      {!ready && !error && <Flex position="absolute" inset={0} align="center" justify="center" pointerEvents="none"><Text color="content.muted">Opening the hangar…</Text></Flex>}

      {/* Title and data */}
      <Box position="absolute" top={3} left={3} right={3} pointerEvents="none">
        <HStack spacing={2} align="flex-start" pointerEvents="auto" display="inline-flex">
          <Button as={NextLink} href="/stars" size="sm" variant="glass" leftIcon={<FiArrowLeft aria-hidden="true" />}>Back</Button>
        </HStack>
        <Box {...glass} mt={2} px={3} py={2} maxW="360px" pointerEvents="auto" data-testid="ship-card">
          <Flex align="center" justify="space-between" gap={3}>
            <Text fontFamily="heading" fontWeight={700} fontSize="xl">{KESTREL.name}</Text>
            <Button size="xs" variant="ghost" onClick={() => setInfo((v) => !v)} aria-expanded={info} aria-controls="ship-specs">{info ? 'Hide specs' : 'Specs'}</Button>
          </Flex>
          <Collapse in={info} animateOpacity><Box id="ship-specs">
          <Text fontSize="sm" color="content.secondary">{KESTREL.blurb}</Text>
          <Flex gap={3} wrap="wrap" mt={2} fontSize="xs" color="content.muted">
            <Text>{KESTREL.dims.length} × {KESTREL.dims.span} × {KESTREL.dims.height} m</Text>
            <Text>{((KESTREL.mass.dry + KESTREL.mass.propellant) / 1000).toFixed(1)} t</Text>
            <Text>Δv {dv.toFixed(1)} km/s</Text>
            <Text>TWR {thrustToWeight(KESTREL, 9.81).toFixed(1)} Earth · {thrustToWeight(KESTREL, 3.71).toFixed(1)} Mars</Text>
          </Flex>
          <Text fontSize="2xs" color="content.muted" mt={1}>An original bubble-canopy VTOL, laid out after the Oblivion-style reference sheets: glass cockpit, two spherical engine pods, ring-rotor tail. Vehicle numbers are gameplay values; the drive is fictional (Isp {KESTREL.isp} s, g₀ {G0} m/s²).</Text>
          </Box></Collapse>
        </Box>
      </Box>

      {/* Controls: one slim strip at the bottom */}
      <Flex position="absolute" left={3} right={3} bottom={3} direction="column" align="center" gap={2} pointerEvents="none">
        <Flex {...glass} px={3} py={2} gap={4} wrap="wrap" justify="center" align="center" pointerEvents="auto" role="group" aria-label="Ship controls" maxW="100%">
          <Flex direction="column" w={{ base: '130px', md: '170px' }}>
            <Text fontSize="xs" color="content.muted">Lift thrust</Text>
            <Slider aria-label="Lift thrust" min={0} max={1} step={0.01} value={thrust} onChange={setThrust} focusThumbOnChange={false}>
              <SliderTrack><SliderFilledTrack /></SliderTrack><SliderThumb />
            </Slider>
          </Flex>
          <Flex direction="column" w={{ base: '130px', md: '170px' }}>
            <Text fontSize="xs" color="content.muted">Engine pods: down (hover) → aft (forward thrust)</Text>
            <Slider aria-label="Engine pod tilt" min={0} max={1} step={0.01} value={cruise} onChange={setCruise} focusThumbOnChange={false}>
              <SliderTrack><SliderFilledTrack /></SliderTrack><SliderThumb />
            </Slider>
          </Flex>
          <Checkbox size="sm" isChecked={gear} onChange={(e) => setGear(e.target.checked)}>Landing gear</Checkbox>
          <Checkbox size="sm" isChecked={lights} onChange={(e) => setLights(e.target.checked)}>Lights</Checkbox>
          <Checkbox size="sm" isChecked={spin} onChange={(e) => setSpin(e.target.checked)}>Turntable</Checkbox>
        </Flex>
        <Flex {...glass} px={2} py={1} gap={1} wrap="wrap" justify="center" pointerEvents="auto" role="group" aria-label="Camera views">
          {(Object.keys(VIEWS) as View[]).map((v) => <Button key={v} size="xs" variant={view === v ? 'solid' : 'ghost'} aria-pressed={view === v} onClick={() => pickView(v)}>{VIEW_LABEL[v]}</Button>)}
          <Button size="xs" variant="ghost" leftIcon={<FiCamera aria-hidden="true" />} onClick={save}>Save image</Button>
          {onFly && <Button size="xs" variant="solid" colorScheme="orange" onClick={onFly} data-testid="fly-button">Take it flying</Button>}
          {onEarth && <Button size="xs" variant="solid" colorScheme="blue" onClick={onEarth} data-testid="earth-button">Fly over Earth</Button>}
        </Flex>
      </Flex>
      <VisuallyHidden role="status" aria-live="polite">{ready ? 'Hangar ready' : ''}</VisuallyHidden>
    </Box>
  );
}
