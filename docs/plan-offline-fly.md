# Plan: Offline /fly, graphics control, 10× Kestrel performance

Status: proposed. Nothing in this plan is implemented yet.

## 0. What I found

**Network dependencies (everything else, including the galaxy, solar system, house viewer, HDRIs, textures and `land.json`, is already local):**

| # | Dependency | Where | Offline impact |
|---|---|---|---|
| 1 | Elevation tiles, `s3.amazonaws.com/elevation-tiles-prod/terrarium` | `src/lib/fly/earth/terrarium.ts:8` | Flat terrain, no real Earth |
| 2 | Satellite imagery, EOX Sentinel-2 and NASA GIBS | `src/lib/fly/earth/imagery.ts:23,29` | Falls back to the procedural tint (works, but plain) |
| 3 | City buildings, Overpass API | `src/lib/fly/earth/buildings.ts:29`, `buildingsLayer.ts:24` | No cities |
| 4 | Google Fonts at build time | `src/app/layout.tsx:3,14-15` (`next/font/google`) | `next build` fails offline |
| 5 | Vercel Analytics | `src/app/layout.tsx:5,52` | Harmless, but a dead request |
| 6 | Contact form to Sanity | `src/app/api/contact/route.ts` | Fails offline (acceptable, needs a clear message) |
| 7 | `npm install` | `package-lock.json` | Needs the registry once |
| 8 | No service worker or offline shell | n/a (`manifest.json` exists, `sw` does not) | Reloading with no network fails |

The loaders already take injectable `fetchBlob`/`decode` (`loaders.ts`), so the cleanest design is a local-first provider in front of the network ones.

**Ship performance (Kestrel, `src/lib/fly/ships/specs.ts`):** mass 8,500 kg full, main thrust 120 kN, which is 14.1 m/s² (1.44 g). Speed is not capped by a constant. It comes from thrust against drag, plus one soft limit:

- `HOVER_MODE_LIMIT` fades forward thrust out between 30 and 50 m/s (`earthflight.ts:136`).
- Drag is `½ρ·C_D·A·v²` with a transonic rise, so terminal speed scales as √(thrust / drag area).

**Graphics:** all render settings are hard-coded and scattered: `EarthFlight.tsx:97-116` (AA, pixel ratio, shadows, log depth), `:216-217` (resolution governor), `:281-283` (near/far); plus `FlightArena.tsx:66-81` and `Hangar.tsx:53-82`. The only user-facing control today is `?quality=low`.

---

## 1. Phase A: 10× speed and acceleration (small, do first)

**Physics note.** Raising thrust ×10 gives acceleration ×10 (14 m/s² → 141 m/s², about 14 g), but in thick air top speed only rises by √10 ≈ 3.2×, because drag grows with v². To get a true 10× top speed, drag area must fall by 10 as well (v ∝ √(T/k), so T×10 and k÷10 gives v×10). Thrust ×10 and drag ÷10 does both.

Single source of truth, so it is one dial and not edits scattered across the sim:

1. Add `export const PERFORMANCE = { thrust: 10, drag: 0.1, isp: 10 }` to `ships/specs.ts`, applied when building the Kestrel spec:
   - `thrust.main × 10` (hover thrust stays, so VTOL feel is unchanged; decision below).
   - `cdA × 0.1` and the `AERO.Cx` / lateral drag terms in `earthflight.ts:118`.
   - `isp × 10`, so propellant burn (ṁ = F / (Isp·g0)) stays the same per second. Otherwise the tank empties 10× faster. Δv becomes about 149 km/s, which is fine for gameplay.
2. Scale `HOVER_MODE_LIMIT` (30–50 m/s) and the `RCS_FORCE` by the same factor, so hover mode does not choke the new thrust.
3. `RETRO_FRACTION` braking scales automatically through `thrust.main`.
4. Keep the original numbers available as `STOCK`, behind a flag (`?perf=stock`), so the roster tests in `specs.test.ts` (Δv 14.9 km/s, TWR 2.64, β 157, terminal speeds) still prove the published physics. Add new tests for the tuned values.

**Things that can bite at 10× speed (verify, don't assume):**
- `heatFlux ∝ v³` becomes 1000× larger. Check whether heat destroys the ship or only feeds the HUD (`earthflight.ts:102`, HUD in `EarthFlight.tsx`). If it kills the ship, scale the heat model.
- Tile streaming: at ~10× ground speed the quadtree and request budget (`stream/budget.ts`, `manager.ts`) must keep up. Re-tune the concurrency and lookahead limits, and check there are no holes in the terrain.
- Camera `far`/`near` and chase-camera lag (`camera.ts`) at high speed.
- Integration step: `earthflight.ts:189` already shrinks steps with speed (floor 1/240 s). Confirm no tunnelling through terrain at about Mach 10 near the ground.
- Orbit scripted-ascent test (`orbit.test.ts`) will reach orbit far sooner. Update its expectations, don't delete it.

**Verification:** unit tests for sea-level acceleration (about 141 m/s²) and a measured top speed of roughly 10× stock in a scripted run; the existing flight/earthflight/orbit tests green; a manual Playwright flight over mountains.

## 2. Phase B: fully offline

**B1. Build offline**
- Replace `next/font/google` (Inter, Space Grotesk) with `next/font/local`, using `.woff2` files committed under `public/fonts/` (the repo already ships fonts there and an OFL licence).
- Gate `<Analytics />` behind `process.env.NEXT_PUBLIC_OFFLINE !== '1'`, or remove it when not on Vercel.
- Check `next.config.ts` image `remotePatterns` (`cdn.sanity.io`) and any other `next/image` remote use. Bundled assets only in offline mode.
- Vendor npm with `npm ci --offline` against a populated cache (or commit an `npm pack` cache folder) and document it.

**B2. Offline tile pack (the real work)**
- New script `scripts/fetch-tiles.mjs` (run once, **with** internet): given a region list and zoom range, downloads Terrarium elevation, imagery (EOX, with a GIBS fallback) and pre-baked building JSON per Overpass cell into `public/offline/{terrarium,imagery,buildings}/…`, plus an `index.json` manifest (regions, zooms, bytes, attribution and licences).
- Regions are configurable. Default pack: **global z0–z8** for elevation and imagery (continent-scale flight and orbit), plus **detailed z9–z13 / z14** around a handful of chosen places (spawn site, a few cities and mountains; the repo already has `places.ts` and the Matterhorn, Everest and Dead Sea fixtures).
- Rough sizes, to be measured by the script and confirmed with you: global z0–8 is on the order of **0.5–2 GB** (imagery dominates). Each detailed region at z13 is about **0.1–0.5 GB**. A full-world z13 pack is **hundreds of GB**, so it is not feasible, which is why regions are selective.
- New local-first providers: `LOCAL_TERRARIUM`, `LOCAL_IMAGERY` and `LOCAL_BUILDINGS`, tried before the network ones. Missing local tile means fall through to the existing network chain, then to the existing procedural fallback. So "online" still works, "offline" never leaves a hole, and the existing `DISABLE_AFTER` logic turns dead hosts off.
- Offline mode switch: `NEXT_PUBLIC_OFFLINE=1` (or `?offline=1`) skips network providers entirely, so there are no hanging requests, timeouts or console noise.
- Tiles are served as static files by `next start`, or by any static server. Mapzen/AWS Terrarium, EOX Sentinel-2 cloudless (CC BY 4.0), NASA GIBS (public domain) and OSM (ODbL) licences and attributions go in the manifest and the HUD credits.

**B3. App shell offline**
- Add a small service worker (cache-first for `_next/static`, `/models`, `/textures`, `/hdri`, `/fonts`, `/solar`, and `/offline/*` tiles; network-first for pages) plus an install prompt via the existing `manifest.json`. This makes it a real installable PWA that opens with no network.
- Contact form: detect offline and show "You're offline; message not sent" (or queue it locally and retry), rather than a generic failure.

**B4. Verification**
- Playwright test with `context.setOffline(true)`: load `/`, `/stars`, `/fly`, fly a short scripted path over a pre-baked region, and assert no failed network requests and no console errors.
- Unit tests: local provider order and fallback in `loaders.test.ts`; manifest parsing.
- Docs: a README "Offline mode" section (build, fetch tiles, run) and an update to `docs/fly/12-streaming-and-loading.md`.

## 3. Phase C: modifiable graphics

Meaning I'm assuming: an in-game graphics settings panel **and** one place in the code to tune visuals. Tell me if you meant editing the ship model or shaders instead.

1. **`src/lib/fly/graphics.ts`**: one typed settings object with presets (Low / Medium / High / Ultra) and individual overrides:
   - resolution scale (min/max for the governor), anti-aliasing, shadows on/off and shadow map size (1024/2048/4096), log depth
   - terrain detail (quadtree LOD bias), imagery on/off and maximum zoom, buildings on/off and radius
   - view distance, FOV, exposure/tone-mapping, atmosphere and dust density, thruster/downwash effects
   - frame-rate cap
2. Replace the hard-coded values in `EarthFlight.tsx`, `FlightArena.tsx` and `Hangar.tsx` with reads from that object. Settings that need a renderer restart (AA, log depth) apply on respawn; the rest apply live.
3. **Settings panel** in the fly HUD (keyboard, touch and gamepad reachable, as with the existing controls), persisted to `localStorage` with a safe try/catch, plus URL overrides (`?quality=`, `?shadows=0`) for testing.
4. A short `docs/fly/13-graphics.md` listing every knob, its default, its cost, and where the ship model, sky shader and lighting live, so deeper edits are easy.
5. Tests: preset resolution and clamping (pure functions); Playwright check that the panel changes the renderer state (pixel ratio, shadow flag).

## 4. Order of work and effort

| Step | What | Size |
|---|---|---|
| 1 | Phase A (perf dial plus tests and heat/streaming checks) | small |
| 2 | B1 (fonts, analytics, offline env flag) | small |
| 3 | C (graphics module, panel, docs) | medium |
| 4 | B2 (tile fetch script and local providers) | medium, plus download time |
| 5 | B3 and B4 (service worker, offline tests, docs) | medium |

Each step lands as its own commit on `ccr-da26c508-iddj0b`, with typecheck, lint, unit tests and e2e green before pushing.

## 5. Decisions needed from Gee

1. **Offline pack scope.** Which places should be detailed (home, favourite cities, mountains), and what total disk size is acceptable (for example 2 GB / 10 GB / 50 GB)?
2. **Hover thrust.** Scale the lift engines ×10 too, or main thrust only (recommended)?
3. **Heat.** If 10× speed makes reentry heating lethal, scale the heat model or let it kill the ship?
4. **Environment note.** This cloud sandbox has restricted outbound access, so I may not be able to download the tile pack here. The fetch script would then be run on your machine with internet, and only the code and the manifest would be committed (not the multi-GB tiles).
