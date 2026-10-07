// src/components/fly/FlyApp.tsx
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Flex, IconButton, Text } from '@chakra-ui/react';
import { FiMaximize2, FiMinimize2 } from 'react-icons/fi';
import Hangar from './Hangar';
import FlightArena from './FlightArena';
import EarthFlight from './EarthFlight';
import { useLandscape, useTouchDevice } from './useLandscape';

type Mode = 'hangar' | 'arena' | 'earth';

/**
 * /fly shows the hangar (inspect the ship), the test arena, or the real Earth (`?mode=earth`, optionally `&place=` or `&lat=&lon=`).
 * The whole page is a landscape, fullscreen experience: on phones the first tap enters fullscreen and locks landscape (where the browser
 * allows it), a portrait screen shows a "turn your phone" cover, and everywhere there is a fullscreen button (and the F key).
 */
export default function FlyApp() {
  const [mode, setMode] = useState<Mode>('hangar');
  const [full, setFull] = useState(false);
  // The corner button only matters when you reach for it: it fades out a few seconds after the pointer stops (any pointer movement or touch brings it back).
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let t = 0;
    const wake = () => { setAwake(true); window.clearTimeout(t); t = window.setTimeout(() => setAwake(false), 3500); };
    wake();
    window.addEventListener('pointermove', wake); window.addEventListener('pointerdown', wake);
    return () => { window.clearTimeout(t); window.removeEventListener('pointermove', wake); window.removeEventListener('pointerdown', wake); };
  }, []);
  const isTouch = useTouchDevice();
  const { portrait, goLandscape } = useLandscape(isTouch);

  useEffect(() => { const m = new URLSearchParams(window.location.search).get('mode'); if (m === 'arena' || m === 'earth') setMode(m); }, []);

  const toggleFull = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' } as FullscreenOptions); if (isTouch) await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {}); }
    } catch { /* the browser refused (iOS Safari on iPhone has no page fullscreen): nothing to do */ }
  }, [isTouch]);

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) return;
      if (e.key === 'f' || e.key === 'F') void toggleFull();
    };
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('fullscreenchange', on); window.removeEventListener('keydown', key); };
  }, [toggleFull]);

  // On a phone, the first touch anywhere is the gesture the browser needs to allow fullscreen + orientation lock.
  useEffect(() => {
    if (!isTouch) return;
    const once = () => { void goLandscape(); };
    window.addEventListener('pointerdown', once, { once: true });
    return () => window.removeEventListener('pointerdown', once);
  }, [isTouch, goLandscape]);

  const go = (m: Mode) => { setMode(m); void (isTouch ? goLandscape() : Promise.resolve()); try { const u = new URL(window.location.href); if (m === 'hangar') { u.search = ''; } else u.searchParams.set('mode', m); window.history.replaceState(null, '', u); } catch { /* ignore */ } };

  return (
    <>
      {mode === 'earth' ? <EarthFlight onBack={() => go('hangar')} /> : mode === 'arena' ? <FlightArena onBack={() => go('hangar')} /> : <Hangar onFly={() => go('arena')} onEarth={() => go('earth')} />}
      <IconButton
        position="fixed" zIndex={30} size="sm" variant="glass" onClick={toggleFull} aria-pressed={full} aria-label={full ? 'Exit fullscreen (F)' : 'Enter fullscreen (F)'} title={full ? 'Exit fullscreen (F)' : 'Fullscreen (F)'} data-testid="fullscreen-button"
        icon={full ? <FiMinimize2 aria-hidden="true" /> : <FiMaximize2 aria-hidden="true" />}
        top="10px" right="10px" minW="32px" h="32px" borderRadius="full"
        opacity={awake ? 0.75 : 0} pointerEvents={awake ? 'auto' : 'none'} transition="opacity 0.4s" _hover={{ opacity: 1 }} _focusVisible={{ opacity: 1, pointerEvents: 'auto' }}
      />
      {isTouch && portrait && (
        <Flex position="fixed" inset={0} zIndex={2000} bg="rgba(8,10,20,0.97)" direction="column" align="center" justify="center" gap={4} px={8} textAlign="center" data-testid="rotate-overlay">
          <Text fontSize="4xl" aria-hidden="true">⟳</Text>
          <Text fontWeight={700}>Turn your phone sideways to fly</Text>
          <Text fontSize="sm" color="content.secondary">Flying is a landscape, fullscreen experience.</Text>
          <Button colorScheme="orange" onClick={() => void toggleFull()} data-testid="go-landscape">Go landscape (fullscreen)</Button>
        </Flex>
      )}
    </>
  );
}
