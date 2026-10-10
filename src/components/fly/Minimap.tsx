// src/components/fly/Minimap.tsx
// A real Leaflet map, alongside the 3D terrain's own satellite-+-labels ground texture (EarthFlight.tsx): this one is
// a flat, pannable, zoomable chart of where the Kestrel is, with its own base-layer switcher (the MAP_LAYERS groundwork
// in lib/fly/earth/mapLayers.ts - this is the first thing to actually use it). Dynamically imports leaflet in an
// effect, matching how the rest of this feature dynamically imports three.js: a mapping library has no business in
// the initial bundle for a page that might render without ever opening the minimap.
'use client';

import 'leaflet/dist/leaflet.css';
import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Flex, Select, Text } from '@chakra-ui/react';
import { FiCrosshair } from 'react-icons/fi';
import type * as Leaflet from 'leaflet';
import { MAP_LAYERS, type MapLayerDef, MINI_MAX_ZOOM, layerById, zoomForAltitude } from '@/lib/fly/earth/mapLayers';

export interface MinimapProps {
  lat: number;
  lon: number;
  heading: number;
  agl: number;
  glass: Record<string, unknown>;
}

const shipIcon = (L: typeof Leaflet, heading: number) =>
  L.divIcon({
    html: `<div style="width:22px;height:22px;transform:rotate(${heading}deg)"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 1 L22 21 L12 16 L2 21 Z" fill="#ff8a3d" stroke="#1a1208" stroke-width="1.5"/></svg></div>`,
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

/** Builds tiles straight from a MapLayerDef's own url(t) - no string-template guessing, since each provider bakes z/x/y into different URL positions. */
function defLayer(L: typeof Leaflet, def: MapLayerDef): Leaflet.TileLayer {
  const layer = L.tileLayer('', { maxNativeZoom: def.maxNativeZoom, maxZoom: 19, attribution: def.attribution });
  layer.getTileUrl = (coords) => def.url({ z: coords.z, x: coords.x, y: coords.y });
  return layer;
}

export default function Minimap({ lat, lon, heading, agl, glass }: MinimapProps) {
  const host = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const tileLayer = useRef<Leaflet.TileLayer | null>(null);
  const marker = useRef<Leaflet.Marker | null>(null);
  const follow = useRef(true);
  const [layerId, setLayerId] = useState(MAP_LAYERS[0].id);
  const [followState, setFollowState] = useState(true);
  const latest = useRef({ lat, lon, heading, agl });
  latest.current = { lat, lon, heading, agl };

  // Mount once: load leaflet, build the map, the initial base layer and the ship marker. Reads latest.current rather
  // than taking lat/lon/heading/agl as deps, so opening the minimap never tears the map down on every HUD tick.
  useEffect(() => {
    let disposed = false;
    (async () => {
      const mod = await import('leaflet');
      if (disposed || !host.current) return;
      L.current = mod;
      const { lat: la, lon: lo, heading: hd, agl: ag } = latest.current;
      const m = mod.map(host.current, { attributionControl: false, zoomControl: false }).setView([la, lo], Math.min(MINI_MAX_ZOOM, zoomForAltitude(ag)));
      m.on('dragstart', () => { follow.current = false; setFollowState(false); });
      tileLayer.current = defLayer(mod, layerById(layerId));
      tileLayer.current.addTo(m);
      marker.current = mod.marker([la, lo], { icon: shipIcon(mod, hd) }).addTo(m);
      map.current = m;
    })();
    return () => { disposed = true; map.current?.remove(); map.current = null; tileLayer.current = null; marker.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Base layer swap: replaces the tile layer in place, leaving the map (and the user's pan/zoom) untouched.
  useEffect(() => {
    if (!map.current || !L.current) return; // still loading, or this is the initial render racing the mount effect's own first layer
    tileLayer.current?.remove();
    tileLayer.current = defLayer(L.current, layerById(layerId));
    tileLayer.current.addTo(map.current);
  }, [layerId]);

  // Ship position/heading every HUD tick (~every 120-300 ms, EarthFlight's own throttle); the view too, while following.
  useEffect(() => {
    const m = map.current, mk = marker.current, mod = L.current;
    if (!m || !mk || !mod) return;
    mk.setLatLng([lat, lon]);
    mk.setIcon(shipIcon(mod, heading));
    if (follow.current) m.setView([lat, lon], Math.min(MINI_MAX_ZOOM, zoomForAltitude(agl)), { animate: false });
  }, [lat, lon, heading, agl]);

  const recenter = () => {
    follow.current = true; setFollowState(true);
    map.current?.setView([latest.current.lat, latest.current.lon], Math.min(MINI_MAX_ZOOM, zoomForAltitude(latest.current.agl)), { animate: false });
  };

  return (
    <Box {...glass} position="absolute" bottom={3} right={3} w={{ base: '150px', md: '220px' }} overflow="hidden" pointerEvents="auto" data-testid="earth-minimap">
      <Box ref={host} h={{ base: '110px', md: '160px' }} w="100%" sx={{ '.leaflet-container': { background: '#0a0d14', fontFamily: 'inherit' } }} />
      <Flex position="absolute" top={1} left={1} right={1} justify="space-between" align="center" gap={1}>
        <Select size="xs" w="110px" value={layerId} onChange={(e) => setLayerId(e.target.value)} aria-label="Minimap base layer" bg="blackAlpha.700" color="white" borderColor="whiteAlpha.400">
          {MAP_LAYERS.map((l) => <option key={l.id} value={l.id} style={{ color: 'black' }}>{l.name}</option>)}
        </Select>
        {!followState && <Button size="xs" leftIcon={<FiCrosshair aria-hidden="true" />} onClick={recenter} aria-label="Re-center on the ship">Follow</Button>}
      </Flex>
      <Text position="absolute" bottom={0} left={1} fontSize="9px" color="whiteAlpha.600" bg="blackAlpha.600" px={1} pointerEvents="none">{layerById(layerId).attribution.split(',')[0]}</Text>
    </Box>
  );
}
