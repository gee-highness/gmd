# Plan: more data on the /fly minimap

Status: proposed. Nothing in this plan is implemented yet.

Follows the Leaflet minimap added alongside the 3D terrain's satellite-+-labels ground texture
(`src/components/fly/Minimap.tsx`, `src/lib/fly/earth/mapLayers.ts`, `imagery.ts`/`loaders.ts`'s
`OSM_LABELS` compositor). That work answers "what does the ground look like"; this plan answers
"what else can the minimap show or do". Each phase is independently shippable and ordered by
value for effort, not by dependency - do them in any order, or skip any of them.

## 0. What's already there (so the plan doesn't repeat it)

| Piece | File | Does |
|---|---|---|
| Base layers | `lib/fly/earth/mapLayers.ts` | `MAP_LAYERS` (EOX satellite, Blue Marble, OSM streets), `layerById`, `zoomForAltitude` |
| Minimap | `components/fly/Minimap.tsx` | Leaflet map, ship marker + heading, layer switcher, follow/re-center |
| Street labels (3D ground only) | `lib/fly/earth/imagery.ts` (`OSM_LABELS`), `loaders.ts` (`makeLabeledImageLoader`) | Composites CARTO label tiles onto the satellite texture |
| Start points | `lib/fly/earth/places.ts` | 18 hard-coded `{id, name, lat, lon, heading, blurb}`, used by the `<Select>` in `EarthFlight.tsx` |

None of this fetches any point data (airports, POIs, weather) yet - only base-map imagery. That's
what phases 1-4 below add. All are **overlay layers on the existing minimap**, not changes to the
3D terrain.

## 1. Phase 1: airports/airfields as clickable teleport points (do first)

Highest value for the effort: reuses the exact pattern `places.ts` → `<Select>` → `teleport()`
already uses, just sourced from data instead of a hand-written list, and surfaced as map markers
instead of (as well as) a dropdown.

**Data source:** [OurAirports](https://ourairports.com/data/) `airports.csv`, public domain, no
key, no rate limit (it's a static file). ~80,000 rows; filter to `type in
(large_airport, medium_airport)` and it's about 2,000 - small enough to commit as a pre-built
JSON asset rather than fetching the Overpass-style way `buildingsLayer.ts` does.

1. **Build-time script** `scripts/build-airports.mjs` (pattern: `scripts/build-land.mjs` already
   does an offline data-prep step): downloads `airports.csv` once, filters to large/medium
   airports with a valid IATA code, writes `public/data/airports.json`:
   `{ id: 'LHR', name: 'London Heathrow', lat, lon, elevationFt }[]`. Committed output, not
   fetched live by the app (matches the "no Overpass at interactive framerate" lesson already
   learned in `buildingsLayer.ts`).
2. **Load** the JSON lazily in `Minimap.tsx` only while the minimap is open (`fetch('/data/airports.json')`
   in the mount effect, same spirit as the dynamic `import('leaflet')` already there).
3. **Render** as a `L.layerGroup` of small circle markers (`L.circleMarker`, cheap, no icon
   images), visible only above `MINI_MAX_ZOOM - 4` or so - 2,000 markers at world zoom would be
   noise; consider `leaflet.markercluster` (new dependency, MIT, well-maintained) if that
   threshold still feels busy once it's on screen.
4. **Click → teleport:** `onClick` on a marker calls the same `actions.current?.teleport(lat, lon,
   heading, alt)` the `<Select>` already wires up in `EarthFlight.tsx`. Pass a callback prop into
   `Minimap` rather than importing `actions` directly, to keep the map component free of flight-sim
   internals (mirrors how `Minimap` already only takes `lat/lon/heading/agl/glass` as props).
5. **Popup:** name, IATA code, elevation - `L.circleMarker(...).bindPopup(...)`.

**Verification:** a unit test for the build script's CSV filter (given a small fixture CSV, asserts
the JSON shape and the large/medium filter), and a Playwright check that clicking a marker moves
`hud.lat/lon` to the airport's coordinates (same assertion style as the existing `earth-coords`
Playwright flow, if one exists, else a new one next to `e2e/controller.spec.ts`).

**Effort:** small-medium. **Risk:** low (static data, no live calls).

## 2. Phase 2: geocoding search box

Replace/extend the free-text `lat, lon` `<Input>` in the toolbar (`EarthFlight.tsx`, `earth-coords`
testid) with a place-name search, backed by Nominatim (OpenStreetMap's free geocoder, usage-policy
rate limit ~1 req/s, needs a `User-Agent`/referrer - acceptable for a type-and-pause search box,
not for autocomplete-per-keystroke).

1. `lib/fly/earth/geocode.ts`: `searchPlace(query: string, signal: AbortSignal): Promise<{lat, lon,
   label}[]>` hitting `https://nominatim.openstreetmap.org/search?format=json&q=...`. Injectable
   `fetch` like `loaders.ts`'s `LoaderIO`, for the same reason (testable without a browser).
2. Debounce (300-500 ms) in the toolbar `<Input>`'s `onChange`, show a small results dropdown,
   selecting a result calls `teleport()` the same way the existing coords input does.
3. **Respect the rate limit:** one in-flight request at a time (abort the previous on a new
   keystroke, exactly like `AbortController` is already used throughout `loaders.ts`), and don't
   fire on every keystroke - only after the debounce settles.

**Verification:** unit test the debounce/abort logic with a fake clock and a mock fetch (assert
only the last query's fetch survives a burst of keystrokes). No new Playwright coverage strictly
needed; manual check is enough given it is a thin UI layer on a tested teleport path.

**Effort:** small. **Risk:** low; graceful failure (no results) is just an empty dropdown, same
posture as the current `coordError` state already handles for malformed lat/lon.

## 3. Phase 3: terrain/weather base layers

Two more entries in `MAP_LAYERS` (`mapLayers.ts`), no new plumbing - the minimap's layer `<Select>`
already iterates `MAP_LAYERS` generically.

1. **OpenTopoMap** (contour/terrain style, OSM-derived, CC BY-SA, `maxNativeZoom` 17, free, no
   key): useful on a flight sim minimap to see terrain shape, not just satellite colour.
2. **Weather overlay** (OpenWeatherMap tile layers - clouds/precipitation/wind, free tier needs an
   API key): this is the one piece here that is NOT "just add a `MapLayerDef`", because it needs a
   secret. Two sub-options:
   - **Skip it** (recommended default) - the app has no server-side secret-handling precedent for
     a client-visible map tile key (Sanity's write token is explicitly server-only,
     `lib/sanity.server.ts`), and an OpenWeatherMap key embedded in client JS is usable by anyone
     who looks, so it would need a thin proxy route (`src/app/api/weather-tile/route.ts`, forwarding
     the request server-side, key in env) to do properly - real but second-order effort.
   - **Build it properly**: proxy route as above, `NEXT_PUBLIC`-free key in `.env.local` (matches
     `SANITY_API_WRITE_TOKEN`'s existing pattern), `onlineOnly: true` (weather has no offline
     meaning anyway).

**Verification:** OpenTopoMap is a one-line `MapLayerDef` addition, covered by the same
`mapLayers.test.ts` pattern already testing `MAP_LAYERS`. Weather (if built) needs a route test for
the proxy (mock the upstream fetch, assert the key never reaches the response/URL sent to the
client) plus a manual check of the tile rendering.

**Effort:** OpenTopoMap trivial; weather proxy small-medium (new secret, new route).
**Risk:** OpenTopoMap none; weather needs the proxy done correctly or the key leaks.

## 4. Phase 4: flight path trail and distance

A different kind of data: generated from the flight itself, not fetched.

1. Keep a rolling buffer of recent `[lat, lon]` samples (every few HUD ticks, capped at e.g. 500
   points - ring buffer, not unbounded) in `EarthFlight.tsx` alongside the existing `hud` state.
2. Pass it to `Minimap` as a prop; render as an `L.polyline` on the minimap, updated the same way
   the ship marker already is (in the per-tick effect).
3. Optional: a small HUD readout of cumulative great-circle distance flown (haversine over the
   buffer - pure function, easily unit-tested like the rest of `lib/fly/earth/geo.ts`).

**Verification:** unit test the haversine distance function and the ring-buffer eviction logic in
isolation (pure functions, no DOM/Leaflet needed - same testability bar as `geo.test.ts`).

**Effort:** small. **Risk:** low (purely additive, no new data source, bounded memory by
construction).

## 5. Explicitly out of scope (for now)

- **Live traffic/other-aircraft data:** no free, no-key, no-rate-limit source exists; would need a
  paid feed. Not worth building until there's a real one to point at.
- **Marker clustering as its own phase:** folded into Phase 1 as a "consider if it's needed" step
  rather than a separate phase - don't add the dependency speculatively.
- **Heatmap of flown paths:** needs path history to accumulate across sessions (localStorage or a
  backend), which is a different, bigger feature (persistence) wearing a map-data costume. Revisit
  only if persistence is wanted for its own sake.

## 6. Suggested order

1 (airports/teleport) → 4 (flight trail, cheap, no new data source) → 2 (geocoding search) → 3
(OpenTopoMap layer; weather only if the proxy work is wanted). Each phase stands alone, so this is
a suggestion, not a dependency chain.
