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
import type { Airport } from '@/lib/fly/earth/airports';

export interface MinimapProps {
  lat: number;
  lon: number;
  heading: number;
  agl: number;
  glass: Record<string, unknown>;
  /** Recent [lat, lon] samples (oldest first), drawn as a trail (docs/plan-fly-map-data.md §3). Omit or pass [] for none. */
  trail?: readonly (readonly [number, number])[];
  /** Called with an airport's [lat, lon] when its marker is clicked (docs/plan-fly-map-data.md §1). Airports are not shown at all if this is omitted. */
  onSelectPlace?: (lat: number, lon: number) => void;
}

/** Airports only clutter the minimap zoomed out to a continent or the world - hide the layer below this. */
const AIRPORTS_MIN_ZOOM = 4;

// pointer-events:none so the icon (purely decorative - it has no click handler of its own) never blocks a click
// through to an airport marker underneath it, which happens whenever a place is near the ship on screen (its own
// marker pane sits above the airports' overlay pane).
const shipIcon = (L: typeof Leaflet, heading: number) =>
  L.divIcon({
    html: `<div style="width:22px;height:22px;transform:rotate(${heading}deg);pointer-events:none"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 1 L22 21 L12 16 L2 21 Z" fill="#ff8a3d" stroke="#1a1208" stroke-width="1.5"/></svg></div>`,
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

export default function Minimap({ lat, lon, heading, agl, glass, trail, onSelectPlace }: MinimapProps) {
  const host = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const tileLayer = useRef<Leaflet.TileLayer | null>(null);
  const marker = useRef<Leaflet.Marker | null>(null);
  const trailLine = useRef<Leaflet.Polyline | null>(null);
  const airportsLayer = useRef<Leaflet.LayerGroup | null>(null);
  const resizeObs = useRef<ResizeObserver | null>(null);
  const follow = useRef(true);
  const [layerId, setLayerId] = useState(MAP_LAYERS[0].id);
  const [followState, setFollowState] = useState(true);
  const latest = useRef({ lat, lon, heading, agl });
  latest.current = { lat, lon, heading, agl };
  const onSelectPlaceRef = useRef(onSelectPlace);
  onSelectPlaceRef.current = onSelectPlace;

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
      // Leaflet measures the container's pixel size synchronously at construction; the Chakra Box it lives in can
      // still be mid-layout at that instant (its height comes from a responsive breakpoint, not an inline style), so
      // a stale/zero size here corrupts every vector layer's pixel-bounds math for the rest of the session (tiles and
      // the marker icon still look fine - only Path layers, like the airport circles below, go permanently empty).
      // A ResizeObserver re-measures whenever the box's real size lands, not just once.
      resizeObs.current = new ResizeObserver(() => m.invalidateSize());
      resizeObs.current.observe(host.current);
      tileLayer.current = defLayer(mod, layerById(layerId));
      tileLayer.current.addTo(m);
      // interactive:false (not just a pointer-events style on the inner HTML) so Leaflet's own wrapper element for
      // the icon - the actual DOM node carrying its size/position, not the div/svg authored in shipIcon()'s html -
      // never blocks a click through to an airport marker underneath it.
      marker.current = mod.marker([la, lo], { icon: shipIcon(mod, hd), interactive: false }).addTo(m);
      trailLine.current = mod.polyline([], { color: '#ff8a3d', weight: 2, opacity: 0.8 }).addTo(m);
      map.current = m;

      // Airports (docs/plan-fly-map-data.md §1): loaded lazily, only while the minimap is actually open, and only
      // rendered when a click handler was given - a Minimap with no onSelectPlace has nowhere to send the click.
      if (onSelectPlaceRef.current) {
        const group = mod.layerGroup();
        airportsLayer.current = group;
        const syncVisibility = () => { if (m.getZoom() >= AIRPORTS_MIN_ZOOM) { if (!m.hasLayer(group)) group.addTo(m); } else if (m.hasLayer(group)) m.removeLayer(group); };
        m.on('zoomend', syncVisibility);
        syncVisibility();
        fetch('/data/airports.json').then((r) => (r.ok ? r.json() : [])).then((airports: Airport[]) => {
          if (disposed) return;
          for (const a of airports) {
            mod.circleMarker([a.lat, a.lon], { radius: 3, color: '#fff', weight: 1, fillColor: '#4fa3ff', fillOpacity: 0.9, className: 'minimap-airport' })
              .bindTooltip(a.name, { direction: 'top', opacity: 0.9 })
              .on('click', () => onSelectPlaceRef.current?.(a.lat, a.lon))
              .addTo(group);
          }
          // Leaflet's SVG renderer only draws a vector layer's path once it has seen a 'moveend' since that layer
          // was added, leaving a bulk-added batch as empty (zero-size, unclickable) paths until the map next pans or
          // zooms on its own. A no-op setView forces that redraw pass immediately instead of waiting on the pilot.
          m.setView(m.getCenter(), m.getZoom(), { animate: false });
        }).catch(() => {}); // airports are a nice-to-have overlay; a failed fetch just leaves the minimap without them
      }
    })();
    return () => { disposed = true; resizeObs.current?.disconnect(); resizeObs.current = null; map.current?.remove(); map.current = null; tileLayer.current = null; marker.current = null; trailLine.current = null; airportsLayer.current = null; };
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
    // Follow re-centers the pan only, never the zoom: forcing zoomForAltitude on every tick would snap a pilot's
    // manual zoom-out back to the tight ship-following level within one HUD tick (~150 ms) - indistinguishable from
    // the zoom control not working at all. Zoom only follows altitude at spawn and on an explicit "Follow" re-center.
    if (follow.current) m.panTo([lat, lon], { animate: false });
  }, [lat, lon, heading, agl]);

  // Flight trail (docs/plan-fly-map-data.md §3): redrawn whenever EarthFlight hands over a new trail array.
  useEffect(() => {
    trailLine.current?.setLatLngs((trail ?? []) as [number, number][]);
  }, [trail]);

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
