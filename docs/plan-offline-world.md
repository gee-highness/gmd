# Plan: offline stylized world (Leaflet + PMTiles), realistic flight feel, ship sound, 100–200 MB PWA

Status: proposed. **Nothing in the app is implemented yet.** Everything marked *measured* was run on your uploaded files on 2026-10-10; the scripts are in `tools/offline-world-prototype/` and the raw numbers in `tools/offline-world-prototype/RESULTS.md`.

Relationship to the existing plans:

- **Replaces** Phase B2 (tile pack) and B3 (service worker) of `docs/plan-offline-fly.md`. That plan sized a pack at 0.5–2 GB; this one targets **≤ 100 MB (Standard) and ≤ 200 MB (HD)**.
- **Replaces** its Phase A (10× thrust, ÷10 drag). That was the opposite of "more realistic"; see §12.
- **Keeps** its B1 (local fonts, analytics gate, offline flag) and Phase C (graphics settings).
- **Obeys** `docs/fly/09-physicality-charter.md` (every visual, sound and camera motion has a physical driver; departures are declared) and `docs/plan-fly.md` §12 (audio is procedural and opt-in).

Legend used throughout (same convention as `docs/fly/08-…`):

- **measured** = computed here from your files.
- **✔ verified** = confirmed by a web lookup in this session (source named).
- **⚠** = from memory or an estimate; verify before relying on it. Every ⚠ size is re-measured by the pack builder, which fails the build if a tier goes over budget (§10).

---

## 0. Summary

1. **The whole planet at about 1.8 km per pixel costs only about 35 MB** (measured, §1). The download limit is not the constraint; the **resolution of the source data** is. Your height map is 25 m per level and 8-bit, so the extra 65–165 MB is best spent on real finer data (regional DEMs, a global 16-bit height layer), bathymetry, audio and detail textures, not on bigger copies of the same image.
2. **Leaflet cannot fly.** It is a 2D raster map library. The right job for it here is (a) the **map UI** (mission map, launch picker, minimap, day/night terminator, offline-region chooser) and (b) the **z/x/y tile addressing** that the existing three.js quadtree already uses. The 3D flight stays in three.js. Both read the **same offline tile archive** (§3, §8).
3. **Pack format: PMTiles**, one file per layer or region, stored in the browser's Origin Private File System. PMTiles has first-class Leaflet raster support and the reader library is tiny (✔ protomaps.com blog: about 7 KB). A working Leaflet + PMTiles offline PWA already exists as precedent (✔ `bmcbride/gps-map`).
4. **Stylized world is generated, not downloaded.** Colour is derived from height + water mask + latitude (+ an optional tiny biome map) and finished in a shader with procedural detail. A first pass from your data is in `tools/offline-world-prototype/images/stylized_preview.png`; its defects are listed in §5 so you can judge it honestly.
5. **"Seamless"** is treated as a tested requirement with six separate meanings (antimeridian wrap, tile borders, LOD transitions, texture repetition, colour continuity across zoom, poles), each with a test (§6).
6. **Offline PWA:** app shell via service worker; the big pack is downloaded by an in-app manager (chunked, resumable, SHA-256 verified, quota-checked, atomic update). iOS needs an "Add to Home Screen" step because Safari caps script-writable storage at 7 days of non-use for ordinary tabs (✔ web.dev, storage-for-the-web).
7. **Flight feel** comes from physically driven cues (inertia, authority vs dynamic pressure, buffet, turbulence, g-effects, camera dynamics, multi-scale ground detail), not from raising thrust (§12).
8. **Ship sound** is procedural WebAudio (0 MB) built to charter §5: vacuum is silent in air, structure-borne only; propagation delay; Doppler; cabin transmission loss; limiter; captions (§13). A small optional sample pack (≈ 6 MB) is only for transients synthesis does poorly.

9. **HD colour-guided overlay** (§7A): bicubic-filtered base colour plus mean-preserving procedural and material detail at three scales, so the world keeps its colours but is sharp from 50 m to 50 km; one dial from Stylized to Natural.
10. **Atmosphere** (§7B): a LUT-based physical sky (multiple scattering, ozone, aerial perspective, clouds, cloud shadows) driven by the same density as the physics; in space the sky is black, shadows are pitch black except earthshine, stars are steady, the horizon is a sharp edge with a thin limb.
11. **Buildings** (§7C): baked real city cores for chosen regions, procedural settlements elsewhere driven by your night-lights map, one stylized look.

Tiers (details in §10; ⚠ lines are estimates until the builder measures them):

| Tier | Target | What you get |
|---|---|---|
| **Lite** | ≈ 50 MB | Global stylized world to z6 (about 1.8 km/px), night lights, detail textures, app shell, full procedural sound |
| **Standard** | **≤ 100 MB** | Lite + real-DEM hero regions to about 75 m/px, stylized bathymetry, ship textures, sound one-shots |
| **HD** | **≤ 200 MB** | Standard + global real 16-bit height to z7 (fixes terracing and clipped peaks everywhere) + more hero regions to about 38 m/px |

---

## 1. What you gave me, and what is in it (measured)

Inputs: `earth_nightlights_10K.tif`, `topography_10k.png`, `earth_landocean_16K.png`, `topography_21K.png`, and the repo zip. All four images are **equirectangular (2:1)** world maps.

| File | Size | Mode | What it really is |
|---|---|---|---|
| `topography_21K.png` | 21600 × 10800 | 8-bit grey | Land elevation. **256 levels, about 25 m per level**, 67.1% of pixels exactly 0 (all ocean and sea level). Level 255 is clipped. |
| `topography_10k.png` | 10800 × 5400 | RGB | **Same map at half resolution**, grey stored as RGB (R = G = B on every pixel). Redundant: not used. |
| `earth_landocean_16K.png` | 16200 × 8100 | 8-bit grey | Water mask: **0 = land, 255 = water**, anti-aliased, and it includes lakes and rivers. Good for crisp coastlines. |
| `earth_nightlights_10K.tif` | 10800 × 5400 | RGB | Grey stored as RGB (R = G = B). Only **1.5% of pixels** are lit, so it compresses to under 1 MB. |

The file names and the 21600-px width (360 × 60 arc-minutes) look like NASA-style products, but **I could not verify their origin or licence from the files alone**. Please confirm where they came from (§17, decision 3), because the licence decides whether the pack may be public.

### Findings that shape the design

- **F1. Height scale is about 25 m per level (measured).** Calibration against known places: Denver 1,600 m → level 64 (25.0 m/level); Lhasa 3,650 m → 147 (24.8); Quito 2,850 m → 112 (25.4); South Pole 2,835 m → 111 (25.5); Addis Ababa 2,355 m → 96 (24.5). So the maximum representable height is 255 × 25 ≈ **6,375 m**.
- **F2. Tall peaks are low (measured).** Everest (8,849 m) reads level 250 ≈ 6.2 km; Kilimanjaro (5,895 m) reads 174 ≈ 4.35 km. The data is both clipped and smoothed. In the Standard tier this is a **declared departure** (charter §10); the HD tier fixes it with real elevation data.
- **F3. No bathymetry (measured).** The Dead Sea (−430 m) reads 0, and 67% of the map is flat zero. Ocean depth must be **stylized** from distance to coast (computed at build time), not read from data. The HD/Standard tiers can add real ocean depth from ETOPO or GEBCO (§9).
- **F4. 8-bit height has visible terraces (measured: 256 levels).** At 25 m steps, smooth slopes show as contour steps when lit. Fix: smooth within terraces at build time (edge-aware) and add sub-level detail at runtime (§7).
- **F5. Small antimeridian seam (measured).** Mean difference between the first and last column: topography 0.34 levels (neighbouring columns differ by 0.04), water mask 0.35 (vs 0.20), night lights 0.09. It is small and mostly ocean, but the builder resamples wrap-aware so ±180° joins exactly.
- **F6. The top row is constant (measured, std 0.0) and the bottom row is Antarctic ice (mean level 110).** Polar handling is therefore a design decision, not an accident (§6.6).
- **F7. Resolution ceiling.** 21600 px over 360° is about **1.85 km per pixel at the equator**. In Web Mercator that is about zoom 6.4. Real information stops there. Everything finer must come from more data (HD tier) or be synthesized and labelled artistic.

### Measured compression (Web Mercator z6 = 16384 × 16384 px, 256-px tiles; the sizes below are z6 only)

| Layer | Encoding | Non-uniform tiles | Uniform tiles (deduplicated) | z6 size |
|---|---|---|---|---|
| Height (8-bit) | WebP lossless | 2,269 | 1,827 | **12.8 MB** |
| Water mask | WebP lossless | 1,491 | 2,605 | **8.7 MB** |
| Stylized albedo (first-pass palette) | WebP lossy q80 (q70) | 2,956 | 1,140 | **3.9 MB** (3.0 MB) |
| Night lights, 8192 × 4096 grey | WebP lossy q60 / q80 | n/a | n/a | **0.44 / 0.59 MB** (0.17 MB at 4096 × 2048, q80) |

Lower zoom levels add about one third (geometric series, ⚠ estimated, not measured): **height ≈ 17 MB, water ≈ 11.6 MB, albedo ≈ 5.2 MB, night ≈ 0.6 MB, about 34 MB for the entire planet.** PMTiles stores identical tiles once ✔ (docs.protomaps.com), which is why the all-ocean tiles cost nothing. These tiles are lossless for the data layers, so the size is exact for what you would ship.

Encoding the 4,096 height tiles took about 23 s on a single CPU, so the whole builder will run in minutes, not hours.

---

## 2. Goals, non-goals, conflicts

**Goals**

1. Fly the whole stylized Earth with no network, from a one-time download of 100–200 MB.
2. One art direction: stylized, consistent from orbit to a few metres above the ground.
3. Seamless: no visible tile edges, wrap seam, LOD popping, repetition or polar pinch.
4. More realistic flight feel and a convincing ship soundscape, both obeying the physicality charter.
5. A Leaflet map layer using the same data, for navigation and for choosing what to download.
6. Everything measured, gated and tested; every unverified fact flagged.

**Non-goals**

- Photorealistic satellite imagery of the planet (it would cost GB; also several imagery licences forbid redistribution or commercial use, see §9).
- Real-time Leaflet rendering of 3D terrain (Leaflet is 2D).
- Replacing the existing quadtree, `EarthManager` or stream/budget system. The new pack plugs in as a provider in front of them, as `plan-offline-fly.md` already proposed.

**Conflicts resolved**

- *Old Phase A (10×):* raising thrust ×10 and cutting drag ÷10 makes the ship an arcade rocket and breaks `specs.test.ts` physics. Replaced by §12. If you still want a fast mode, it becomes an opt-in "Arcade" entry on the existing reality dial, not the default.
- *Old B2 pack size (0.5–2 GB):* replaced by §10. Real imagery was the cost; the stylized approach removes it.
- *Audio:* charter says opt-in. Kept. The first launch shows one "Enable sound" button (a user gesture is required by browsers anyway).

---

## 3. Architecture

```
BUILD TIME  (your machine; internet only needed for the optional HD sources)
  inputs/*.png|tif ─► tools/world-pack/build.py ─► dist-pack/
   (+ optional DEM / biome downloads)                 ├ world-terrain.pmtiles   (R height, G coast, B water; z0–6)
                                                       ├ world-albedo.pmtiles    (stylized colour; z0–6)
                                                       ├ world-night.pmtiles     (night lights; z0–5)
                                                       ├ detail.bin              (seamless detail textures)
                                                       ├ regions/<id>.pmtiles    (hero DEM, z7–z11)
                                                       ├ hd-height16.pmtiles     (HD tier only)
                                                       └ manifest.json           (bytes, sha256, licences, version)

RUN TIME
  /fly (three.js) ─ EarthManager ─ provider chain:  LOCAL_PACK ─► network (only if allowed) ─► procedural fallback
        │                                                  ▲
        │                                     PackReader (Web Worker)
        │                                     OPFS file ─► PMTiles directory ─► tile bytes ─► decode off-thread
  Leaflet map (2D) ─ PackTileLayer / pmtiles raster layer ─┘   same archives, same z/x/y
  PWA:  service worker (app shell only)  +  PackManager (download · verify · update · evict-detect) + OPFS storage
```

Design decisions:

- **CRS: Web Mercator, standard z/x/y.** It matches Leaflet's default CRS, the existing `quadtree.ts`/`geo.ts`, and Terrarium. Mercator clips at ±85.0511°, which the existing code already assumes (`MAX_MERCATOR_LAT`). Polar caps are handled in §6.6.
- **One archive per layer or region**, not one giant file and not thousands of loose tiles. Reasons: updates re-download only what changed; tiers are just "which files are present"; no per-tile requests; PMTiles de-duplicates internally.
- **Terrain tile = RGB, no alpha.** R = height (8-bit base), G = distance to coast (drives stylized ocean depth), B = water mask. Alpha is avoided on purpose: canvas decoding premultiplies alpha and would corrupt data wherever A < 255. Data tiles are decoded with `createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })` ⚠ (verify option names in the target browsers). The builder measures this combined layout against separate height/water files and keeps the smaller.
- **Compatibility:** the HD height layer keeps Terrarium's 16-bit idea (hi byte in R, lo byte in G) so the existing `decodeTerrarium` maths can be reused; the base tier decodes as `level × 25 m`.
- **Where Leaflet sits:** `src/lib/fly/map/` (adapter) so the Leaflet version can change without touching flight code (§8).

---

## 4. Pack format and build pipeline

Tooling: a **Python builder** (`tools/world-pack/`, pinned `requirements.txt`: numpy, scipy, Pillow with WebP; optional `pmtiles`). It is a dev-time tool, not part of the Next bundle. The prototype already proves the hard parts on a 1-CPU, 3 GB machine (chunked reprojection; strips instead of whole-image float arrays; the first attempt died of out-of-memory, which is why the chunking exists). A Node/`sharp` port is optional.

Pipeline (each step has a test or a printed check):

1. **Validate inputs:** dimensions, bit depth, channel equality (R = G = B), SHA-256 recorded in the manifest. Refuses the redundant 10K topography.
2. **Wrap-aware load:** pad columns so ±180° is continuous (fixes F5).
3. **Height clean-up:** edge-aware smoothing inside quantization terraces (F4), sea level preserved at exactly 0 on water; optional **peak restoration** curve, off by default, declared as artistic if enabled (F2).
4. **Reproject to Web Mercator at z6:** equirectangular → Mercator is a pure row remap (columns are already linear in longitude). Already implemented in `pyr.py`.
5. **Derive layers:** water mask (keeps lakes and rivers), coast distance in metres (Euclidean distance transform) → stylized ocean depth curve, roughness (local standard deviation of height, 8-bit, z0–z5), optional biome class map.
6. **Stylize albedo** (§5).
7. **Pyramid z0–z5:** area-average (height and albedo), never nearest-neighbour.
8. **Shared-edge stitch:** for each pair of adjacent tiles, border pixels are set to the mean of the two (the standard trick that removes cracks; test in §15).
9. **Encode:** lossless WebP for data, lossy WebP q75–80 for albedo, grey q60–80 for night lights. AVIF is available in the sandbox's Pillow ⚠ but is slower to decode on phones; only adopt if a measured size win is more than 25%.
10. **Write PMTiles v3** with tile de-duplication ✔; `pmtiles convert` from MBTiles/directory exists ✔ (protomaps blog) and a Python writer exists ✔ (`pip install pmtiles`).
11. **Verify:** re-decode every tile and compare to the source raster (data layers: exact or within the declared tolerance); check wrap seam and tile-edge equality; compute SHA-256 per file and per 4 MB chunk.
12. **Budget gate:** print a per-layer size table; **exit non-zero** if any tier exceeds 100 MB (Standard) or 200 MB (HD), or Lite exceeds 60 MB.
13. **Emit `manifest.json`** (Appendix B) with licences and required attributions.

Determinism: the builder takes a seed; the same inputs and seed give byte-identical archives (so SHA-256s are stable and updates are real deltas).

---

## 5. The stylized look

Principle: **stylized means a deliberate palette, clean shapes and consistent lighting, not low quality.** Colour is a function, so the download stays tiny and the art can be re-tuned by editing code and re-running the builder (or live in the shader).

**Inputs to the colour function:** elevation, water mask, distance to coast, latitude, slope (runtime), an optional biome class, and noise.

**Rules (first pass, as prototyped):**

- *Land:* base ramp green → olive → tan → brown → grey → white by elevation; blended toward desert in the subtropical belt (about 26° ± 9°), toward jungle in the wet equatorial belt, toward boreal green at 48–70°, tundra above 64°, ice above 72°.
- *Ocean:* turquoise at the shore → blue → deep navy by distance to coast; sea ice poleward of about 76°.
- *Lighting:* never baked into albedo. Shading comes from runtime normals and the real sun direction (`sun.ts`), so day/night and terminators stay physical.

**What the prototype shows, and its defects (be critical, this is a first pass):** see `tools/offline-world-prototype/images/stylized_preview.png` (2048 × 1024 equirectangular).

| Defect seen | Cause | Fix |
|---|---|---|
| Greenland and Antarctica read brown/tan | Ice only keyed to latitude above 72° | Ice = (\|lat\| > 60° and elevation > about 600 m) or \|lat\| > 72° |
| Coastal glow band too wide and bright | Distance scale too large | Shallow band about 15–25 km, then fall to deep colour |
| Tibetan plateau entirely white | One elevation snow threshold | Latitude-dependent snow line, plus an aridity term so high dry plateaus read tan/grey |
| Sahara and Arabia look olive | Dry weight only 0.75 | Raise to about 0.9 and widen the belt |
| Wrong regional climates (Atacama, Patagonia, Namib, monsoon India) | Latitude alone cannot know them | Add the **biome map** below |

**Biome map (recommended, tiny):** classify a public-domain colour image (NASA Blue Marble ⚠ licence per NASA media guidelines; or Natural Earth ⚠) at build time into about 8 classes (ice, tundra, boreal, temperate, grassland, desert, tropical, rock), stored as a one-channel image at z0–z5 (≈ 0.3 MB ⚠). Only the **classes** ship, not the photo, so the pack stays stylized and the licence exposure is minimal.

**Runtime shader layer (zero download):** per-pixel noise tint; slope-based rock exposure; snow by height and temperature; shoreline foam; ocean normal ripples driven by the wind field, Fresnel sun glint; night side with the night-lights layer masked to land, brightness-limited and dimmed under cloud; procedural cloud layer with cloud shadows on the ground.

**Look dial** (graphics setting): *Painterly* (default; soft bands), *Clean cel* (posterized, hard colour steps), *Natural* (less saturated, more variation).

---

## 6. Seamless: six separate requirements, each tested

1. **Antimeridian (±180°).** Wrap-aware resampling at build time (§4 step 2). *Test:* decode the left-most and right-most tile columns; border pixels equal within 1 level (height) and ΔE < 1 (albedo).
2. **Tile borders.** Shared-edge stitch (§4 step 8), plus the existing skirts in `tileMesh.ts`. *Test:* for every adjacent pair, edge height difference ≤ 0.5 m in HD and ≤ 1 level in Standard; a render test with skirts disabled shows no cracks larger than 1 px at standard zoom.
3. **LOD transitions.** Geomorphing (blend vertex height from parent to child over a distance band) and a cross-fade for albedo. *Test:* a scripted fly-down shows no frame-to-frame vertex jump larger than 0.25 × the finer cell size; screenshot diff on a fixed camera path.
4. **Texture repetition.** The detail textures (two 512² tileable sets: albedo-modulation and normal) are generated by the builder from periodic noise so they wrap exactly, then sampled with **triplanar projection at two scales plus stochastic/hex tiling** to break up repetition ⚠ (technique from memory; prototype and compare). *Test:* wrap test (the edge-to-edge difference equals the interior neighbour difference); an autocorrelation check on rendered ground shows no periodic peak.
5. **Colour continuity across zoom.** Child tiles derive from the same function as their parents and the detail layer is zero-mean, so average colour does not change when a tile refines. *Test:* mean colour of a parent versus the mean of its four children within ΔE 2.
6. **Poles.** Mercator excludes about 85–90°. The Arctic is sea ice and Antarctica above −85° is an ice disc; both use a **procedural polar cap** matched in colour to the last real row. Declared as a departure. *Test:* a camera orbit across the pole shows no hard colour line.

---

## 7. Detail beyond the data

The data stops at about 1.8 km/px (F7). Flight at 100–300 m altitude needs detail at 1–50 m, so the engine **synthesizes** it and labels it artistic in the reality panel.

- **Geometry:** terrain-aware fractal (ridged multifractal, Hurst exponent about 0.8) added in the tile mesh builder (workers). Amplitude at each vertex = local roughness (from the roughness layer) × spacing^H, so mountains get rough and plains stay flat.
- **CPU twin:** the same deterministic function (integer-hash noise, no `Math.random`) is applied in `TerrainField.height()`, so **ground contact equals what is drawn** (the repo already uses this pattern for the sky shader).
- **Mesh scale limit:** the existing mesh is `GRID = 32` cells per tile, so at z13 a cell is about 150 m. Detail below that is **normal and albedo detail in the shader, not geometry**. The sub-cell geometric amplitude is capped at 3 m so collision tolerance covers any mismatch.
- **Dequantization:** the 25 m terraces are removed by smoothing in the builder and by sub-level noise at runtime so slopes are continuous (F4).
- **Rule for speed cues, derived from optical flow:** the ground's angular speed is ω = v / h. At 150 m/s and 300 m above ground that is 0.5 rad/s (about 29°/s, intense); at 3 km it is 0.05 rad/s (slow). So the detail must have visible features of about 0.5° angular size at **every altitude from 50 m to 20 km**, which requires multi-octave detail from about 5 m to about 500 km. This is a test (§15).

---

## 7A. Colour-guided HD overlay (fixes the "pixelated" look)

**Problem.** The base colour is one pixel per 1.8 km. Seen from 300 m it is blocks. Making that image bigger cannot add information, so the plan **adds detail at runtime, guided by the base colour**, so the result still looks like the same world.

**How it works (a shader pass on every terrain tile, 0 MB of extra imagery):**

1. **Remove the blockiness first.** Sample the base albedo with **bicubic (Catmull-Rom) filtering**, not bilinear, and never nearest-neighbour. This alone removes visible pixel edges and costs about four texture reads using the bilinear trick.
2. **Classify the surface** per pixel from the base colour (hue/lightness), the biome class (§5), slope (from the height normals), elevation and latitude, into about 8 material weights: grass, forest, farmland, dry soil/sand, rock, snow, ice, shallow-water bed (urban is handled in §7C).
3. **Add per-material detail at three scales** (about 2 m, 20 m and 200 m features): tileable albedo-modulation, normal and roughness maps, **triplanar** projected with **stochastic/hex tiling** so nothing visibly repeats (§6.4).
4. **Keep the colour of the texture (mean-preserving blend).** The overlay multiplies the base colour by a detail ratio `d / mean(d)`, plus a small hue jitter (about ±3°), so the *average* colour over any area equals the base colour. Only structure is added. That is the property that makes it "the same world, in HD".
5. **Procedural structure that real land has:**
   - farmland as patchwork parcels (Voronoi cells with per-parcel tint and row direction),
   - forest as canopy cells with darker gaps,
   - desert as dune ridges aligned to the wind field, rock strata following height contours, snow as wind-scoured crusts,
   - **rivers and lakes** from your water mask (it already contains them), with a domain-warped meander edge so the 2.5 km pixels become natural curves, and shoreline foam.
6. **Lighting detail:** slope/cavity darkening from the height normals plus the detail normals; in Stylized mode a soft rim light on ridges.
7. **Distance behaviour:** the three scales cross-fade by altitude and use analytic anti-aliasing, so there is no shimmer and no blur at any speed. This is the same rule as §7 (visible features near 0.5° at every altitude).

**Real-looking or stylized: one dial, same pipeline.**

| Look | Detail source | Contrast and palette |
|---|---|---|
| **Stylized** (default) | Procedural noise sets, hand-tuned | Palette-limited, soft colour bands, clean shapes |
| **Natural** | Photo-based PBR material maps, colour-graded to the base palette | Full contrast and variation |

PBR source options for the Natural look: CC0 material libraries such as ambientCG or Poly Haven ⚠ (confirm each licence before bundling), and the repo's own `public/textures/` (it already has grass colour and normal maps and a ground folder; confirm their licence first). At 512²–1024², 8 materials × (albedo + normal/roughness) compress to about 1–4 MB lossy WebP ⚠, so they fit the existing detail-texture budget in §10.

**Where real data exists (hero regions, HD tier):** a finer biome/material map derived from the real DEM (slope, aspect, elevation bands) at z7–z10, so the overlay follows real mountains instead of only the coarse classes.

**Honesty rule.** Everything this pass adds below the data resolution is **synthetic**. It is labelled artistic in the reality panel (charter §10); it never changes where the ground is except through the capped sub-cell displacement in §7.

**Tests:** mean colour of overlay vs base within ΔE 2 at every LOD; autocorrelation shows no repetition peak; temporal stability (a 0.5 px camera nudge changes frames by less than a set threshold, so no shimmer); GPU time per frame within budget on a mid-range laptop and a phone; fixed-camera screenshot suite from 50 m, 500 m, 5 km, 50 km.

---

## 7B. Atmosphere: the best it can be, and unmistakably absent in space

### What exists today (read from the repo)

`skyShader.ts` already ray-marches **single-scattering Rayleigh + Mie** through an exponential atmosphere, with the Sun disc and procedural stars; `atmosphere.ts` holds the **US Standard 1976** air model (density, pressure, temperature, speed of sound) and a **CPU twin** of the sky radiance; `lighting.ts` gives exposure, ACES tone mapping and `starVisibility`. The HUD credits say "No wind or weather yet", and I found **no clouds** anywhere in the fly code. So the foundation is good and physically based; what is missing is multiple scattering, ozone, haze on the terrain, clouds and a deliberate space look.

### Upgrade: LUT-based physical atmosphere (0 MB download, built on the GPU at start-up)

Technique family: precomputed atmospheric scattering (Bruneton and Neyret 2008) and the production-oriented LUT sky of Hillaire 2020 ⚠ (both from memory; verify when implementing).

| Piece | What it adds | Notes |
|---|---|---|
| **Transmittance LUT** | Correct sun colour and dimming at any altitude and angle | Rayleigh + Mie + **ozone absorption** (the ozone layer is what makes twilight deep blue) |
| **Multiple-scattering LUT** | Brighter, less muddy sky and shadowed areas | Single scattering alone is too dark at twilight |
| **Sky-view LUT** | Cheap, accurate sky from the ground and low altitudes | Replaces per-pixel ray marching in most of the sky |
| **Aerial-perspective volume** | **Blue haze on distant terrain and mountains**, correct at every altitude | Applied to terrain, ocean and buildings |
| **Sun and sunset** | Orange-red sunsets, Earth's shadow band, limb-darkened solar disc, soft glare | Colours fall out of the transmittance, not painted |
| **Clouds** | Cumulus shell near 2 km and cirrus near 8 km ⚠ with soft self-shadow and **cloud shadows on the ground**, advected by the wind field (F6) | High: ray-marched volumetric; Medium: layered noise shells; Low: 2D parallax layers (phones). Coverage from latitude bands plus terrain lift; an optional tiny climatology map (< 0.5 MB ⚠) |
| **Ocean coupling** | Ocean reflects the actual sky colour; sun glint by Fresnel | Wave amplitude from the wind field |
| **Ambient light** | Ground ambient taken from the sky (spherical-harmonics irradiance) | Shadows are blue-tinted by the sky in air |

All densities use the **same US Standard 1976 model** as the physics (charter rule 6: one atmosphere for everything), and the CPU twin is kept and extended so tests can compare it against the shader.

### Making space look different: one continuous function of density, no "space mode" switch

Charter rule 1 forbids a hard switch. Everything below is driven by the same optical depth and density, so the transition from air to vacuum is continuous and *physical*, and it is dramatic because the real thing is.

| What you see | In the atmosphere | In space (density about 0) |
|---|---|---|
| **Sky** | Blue/white, gradient to the horizon | **Black**; the blue fades out smoothly with density, roughly by 100 km |
| **Horizon** | Soft haze band | **Sharp, curved edge** with a **thin glowing limb**. The atmosphere is about 100 km thick on a 6,371 km radius, so about 1.6%: genuinely thin. Default is true scale; Stylized may exaggerate up to 1.5× (declared) |
| **Sun** | Glare, halo, sunset colours | **Hard white disc, no halo** from scattering; only lens optics can bloom |
| **Shadows** | Filled with blue sky light | **Pitch black**; the only fill is **earthshine** (light reflected off the lit Earth, albedo about 0.3 ⚠) and light bounced off the ship itself |
| **Stars** | Fade in the day, **twinkle** | Always visible, **steady** (twinkle is caused by air turbulence, so it vanishes with the air) |
| **Terrain far away** | Hazy, blue, low contrast (aerial perspective) | **Crisp and saturated**, no haze; Earth is a lit disc with a hard terminator |
| **Terminator from orbit** | n/a | Red-orange ring where sunlight skims through the limb; night side shows city lights and a faint airglow ⚠ (airglow is artistic, declared) |
| **Clouds** | Present, shadows on the ground | Seen from above as a thin shell, with a fine-scale lit edge |
| **Exposure** | Gentle | **High contrast**: sunlit surfaces vs black shadow (several stops of range); auto-exposure adapts with a believable lag |
| **Engine plume** | Pinched, drag-braked | **Fat, expanding, silent** (§13); no contrails |
| **Heat / drag / dust / wind** | Present | Absent; the **physics lens** shows density, dynamic pressure and sound speed |
| **Sound** | Full | Airborne sound gone; only structure-borne rumble (§13) |

The transition itself is a designed moment (plan-fly §"leaving atmosphere": sky fades to stars, sound fades out): the sky goes from blue to deep violet to black over tens of kilometres, stars appear and stop twinkling, haze leaves the ground, and the engine note thins. The player should be able to read the altitude from the sky alone.

### Quality tiers and cost

| Tier | Content | Target |
|---|---|---|
| High | All LUTs, aerial perspective, volumetric clouds, cloud shadows, ozone | about 1.5 ms GPU on a mid-range desktop ⚠ |
| Medium | LUT sky + aerial perspective, layered cloud shells | about 0.8 ms ⚠ |
| Low (phones) | Sky-view LUT, 2D cloud layers, simple haze | about 0.4 ms ⚠ |

The resolution governor already in `EarthFlight.tsx` keeps frame time in budget; the atmosphere quality is a Phase C graphics setting.

### Tests

- Shader vs CPU twin: sky radiance and transmittance match within a set tolerance across 0–400 km and all sun angles; transmittance never exceeds 1.
- **Altitude sweep screenshots** at 0, 10, 30, 60, 100 and 200 km: sky luminance falls monotonically; star visibility rises; shadow darkness in vacuum equals earthshine only.
- Limb thickness from orbit is about 1.6% of the planet radius at true scale.
- Star scintillation amplitude is proportional to air mass and zero above the atmosphere.
- Aerial perspective: contrast of a distant ridge decreases with distance in air and does not in vacuum.
- No discrete jumps: frame-to-frame sky change while climbing is smooth.

---

## 7C. Buildings and settlements

**Today (read from the repo):** cities are OpenStreetMap outlines extruded to flat-roofed boxes on the real terrain, streamed live from the Overpass API in about 1 km cells (`buildings.ts`, `buildingsLayer.ts`). They appear only below about 3 km above ground (a 3×3 block of cells below 1.5 km), heights are guessed by building type where untagged, and **with no network there are no buildings**.

**Plan: three layers, each optional, one stylized look.**

1. **Baked real city cores (Standard and HD).** For the hero regions, footprints are fetched **once at build time** from an OSM extract (not from public tile servers), simplified, quantized and packed per 1 km cell, so the existing extrusion code reads them from the pack instead of Overpass. The 8 MB budget in §10 buys roughly **town-sized cores of about 40,000 buildings per region** (⚠ estimate: about 25 bytes per building after simplification, to be measured); a dense metropolis may need more, so the builder prints the true size per city and trims. ODbL attribution and share-alike obligations apply to this baked data (§9).
2. **Procedural settlements everywhere else, driven by your night-lights map.** Where the night-lights layer is bright, generate towns and cities offline: density from brightness, street-grid orientation from terrain slope and coastline, taller cores toward the brightest pixel, parks and rivers left clear, deterministic from `(cell, seed)`. Dark land gets scattered farmsteads only in farmland biomes. This costs about **0 MB** (a small generator plus a kit of roof shapes) and makes every lit region look inhabited. It is **generated, not real**, and labelled as such in the HUD.
3. **Stylized building look.** Simple roof shapes (flat, gabled, hipped; the current code is flat only), a limited palette tuned per region, a little height variety, windows that **light up at night** in proportion to the same night-lights value, and aerial perspective from §7B so cities haze correctly. Instanced meshes with distance LOD (box silhouettes beyond about 1.5 km) keep draw calls low.

Rules: buildings stay on the real terrain (existing ground query); collision uses the same footprints; the existing "buildings" toggle and "heights guessed for N%" HUD note stay and gain a "procedural" share. **Tests:** footprint round-trip from the pack; procedural determinism; density follows night-lights brightness within tolerance; no building intersects water or steep slopes above a threshold; frame time with a dense city in view.

---

## 8. Leaflet: what it is for here, and how to use all of it

**Honest scope.** Leaflet is a 2D slippy-map library. It does not render 3D and it provides **no map data**; "data from Leaflet" really means data from tile providers listed in the Leaflet-providers ecosystem. Most such services forbid bulk prefetching or redistribution (⚠ read each terms page; OpenStreetMap's tile policy forbids bulk downloading ⚠). So the pack is **built from open datasets** (§9), and Leaflet displays it.

**Version.** The repo pins `leaflet ^1.9.4` and `@types/leaflet ^1.9.22`. Leaflet 2.0 is ESM-only, drops the global `L`, replaces factory methods with constructors, and moves to Pointer Events ✔ (leafletjs.com 2.0 alpha post); its stated stable target was November 2025, **and I could not confirm a stable release as of today** (⚠ check before upgrading). **Decision: stay on 1.9.4**, and isolate all Leaflet use in `src/lib/fly/map/` behind a small adapter so moving to 2.x is a one-folder change. Plugins are only added if they are small, maintained and licence-checked (candidates below). Loaded lazily (dynamic `import()`), about 40 KB gzipped ⚠.

**Leaflet features used**

| Feature | Use in the game |
|---|---|
| `L.map` with `crs: L.CRS.EPSG3857`, `maxBounds` ±85.05°, `zoomSnap`/`zoomDelta` fractional zoom, `preferCanvas` | Mission map, launch picker, minimap |
| `L.GridLayer` subclass `PackTileLayer` (async `createTile` with `done`) | Reads height/water tiles from the PMTiles archive and **renders the same palette as the 3D world** (so the 2D map and the 3D view match) |
| PMTiles raster layer (`leafletRasterLayer`, ⚠ verify the export name in the installed `pmtiles` version) | Direct display of the stylized albedo and night layers |
| `maxNativeZoom` 6 (HD: 7+), `maxZoom` 10, `bounds`, `keepBuffer`, `updateWhenIdle` | Smooth overzoom and bounded memory |
| `L.control.layers` | Switch: Stylized / Height shaded / Night lights / Water |
| `L.Rectangle` / `L.LayerGroup` | Hero regions: shows which regions are downloaded, lets you tap to download one (feeds the PackManager) |
| `L.Polygon` | **Day/night terminator** computed from the existing `sun.ts` |
| `L.Polyline` + `L.Marker` (rotated `DivIcon`) | Live flight path and ship heading (CSS rotation, no plugin) |
| `L.control.scale`, `L.Control.Zoom`, `map.fitBounds`, `map.flyTo` | Orientation and navigation (map-level `flyTo` only; it is a camera animation on the 2D map) |
| `places.ts` markers | Existing points of interest (Matterhorn, Everest, Dead Sea, spawn) |
| Keyboard, ARIA labels, Pointer Events | Accessibility; gamepad focus via the existing controller layer |

Candidate plugins (each must pass: licence, size, maintenance, Leaflet-2 compatibility): `pmtiles` (✔ BSD-3 reference implementation), a geodesic-line helper ⚠ (or draw great circles ourselves; it is about 30 lines). **Not used:** `leaflet.offline`-style plugins, because the pack lives in OPFS and a second cache would duplicate bytes.

Appendix D has a short, **untested** sketch of the layer and the OPFS source.

---

## 9. Data providers and licences

Verified rows come from this session's lookups; everything else is ⚠.

| Source | What it gives | Licence / terms | Use here |
|---|---|---|---|
| **Your four textures** | Land height, water mask, night lights | ⚠ **unknown, confirm origin** | Core of the pack |
| **PMTiles** | Single-file tile archive; Leaflet raster support | ✔ reference implementations BSD-3; spec public domain / CC0 (protomaps docs and GitHub) | Pack format |
| **Leaflet** | Map UI | ⚠ BSD-2-Clause | Map layer |
| **EOX Sentinel-2 cloudless** | Real imagery | ✔ **2016 version: CC BY 4.0; 2018–2022 versions: CC BY-NC-SA 4.0** (non-commercial); commercial use needs EOX's own licence; attribution text is mandated (eox.at release notes) | The repo's "CC BY 4.0" claim is **only true for the 2016 layer**. Not baked into the pack. If the live network chain uses a newer layer, check the licence. |
| NASA GIBS / Blue Marble | Colour imagery, 500 m | ⚠ NASA media guidelines (generally unrestricted with credit); confirm per product | Biome classification input only (§5) |
| Natural Earth | Coastlines, lakes, rivers, land cover vectors/rasters | ⚠ public domain | Optional crisper water and labels |
| NOAA **ETOPO 2022** | Global land + **ocean depth**, 15″/30″/60″ | ⚠ US government public domain; verify product page | Real bathymetry (Standard) and global 16-bit height (HD) |
| GEBCO | Global bathymetry | ⚠ free with attribution | Alternative to ETOPO |
| Mapzen/AWS **Terrarium** | Global DEM tiles to z15 (the repo already uses it) | ⚠ open data with per-source attributions; check bulk-download terms | Hero-region elevation, downloaded once at build time |
| SRTM / GMTED2010 / Copernicus DEM | Source DEMs | ⚠ public domain (SRTM, GMTED); Copernicus free with attribution | Alternatives for hero regions |
| OpenStreetMap / Overpass | Buildings, roads | ⚠ ODbL (attribution and share-alike); **do not prefetch from `tile.openstreetmap.org`** | City footprints for hero regions only, baked once from an extract, never bulk-scraped from public tile servers |
| Audio sources | Optional one-shots | CC0 only, checked per file ⚠; or generated by our own synth | §13 |

Rule: **the pack manifest lists every source, its licence and its required attribution text; the HUD credits page is generated from it.** A source whose licence cannot be satisfied is not baked in.

---

## 10. Size budget (download), with a hard gate

Sizes in MB. **Measured** rows come from §1; every ⚠ row is an estimate that the builder replaces with a measurement and enforces.

| Component | Lite | Standard | HD | Basis |
|---|---|---|---|---|
| Height, z0–z6, 8-bit lossless | 17 | 17 | 17 | measured z6 12.8 × 4/3 |
| Water mask + coast distance, z0–z6 | 11.6 | 11.6 | 11.6 | measured z6 8.7 × 4/3 (coast channel is smooth, small) |
| Stylized albedo, z0–z6 | 5.2 | 5.2 | 5.2 | measured z6 3.9 × 4/3 |
| Night lights | 0.6 | 0.6 | 0.6 | measured (8192 × 4096, q80) |
| Roughness + biome map, z0–z5 | 1 | 1 | 1 | ⚠ estimate |
| HD overlay material sets and detail textures (§7A) | 4 | 4 | 8 | ⚠ 8 materials × albedo + normal/roughness at 512² (HD: 1024²) |
| `/fly` app shell (JS chunks, fonts, essentials) | 8 | 8 | 8 | ⚠ measure with `scripts/check-bundle.mjs`; do **not** precache the portfolio's 30 MB of site assets |
| Real bathymetry (ETOPO/GEBCO, 8-bit z0–z6) | – | 5 | 5 | ⚠ |
| Hero regions, 300 × 300 km, z7–z10 (about 76 m/px), 8 regions | – | 20 | 20 | ⚠ about 25 KB per 256² DEM tile |
| Baked city cores for hero regions (§7C), about 40,000 buildings per region | – | 8 | 8 | ⚠ about 25 bytes per building; not whole regions |
| Procedural settlement generator and roof kit (§7C) | 0.3 | 0.3 | 0.3 | ⚠ code and small kit; atmosphere LUTs are built on the GPU, 0 MB |
| Ship textures/models, cockpit | – | 8 | 8 | ⚠ |
| Sound one-shots (Opus), optional | – | 6 | 6 | ⚠ 24 clips, mono |
| **Global real 16-bit height, z0–z7 (about 0.9 km/px)** | – | – | 75 | ⚠ range 60–95; land tiles only |
| Hero regions raised to z11 (about 38 m/px), 3 regions | – | – | 19 | ⚠ |
| **Total** | **≈ 48** | **≈ 96** | **≈ 195** | Gate: Lite ≤ 60, Standard ≤ 100, HD ≤ 200 |

When a tier exceeds its gate the builder drops items in a fixed, documented priority order (lowest-priority hero regions first). Download time for reference: 100 MB takes about 40 s at 20 Mbps and about 2.7 min at 5 Mbps; 200 MB doubles that.

Runtime memory is a separate budget (not download size): a 256² RGBA tile is 256 KB, a float height tile is 256 KB, and the existing quadtree allows up to 700 tiles, so mobile needs measured caps and mipmaps. Target to be set after the device tests in ticket P7.

---

## 11. Offline PWA

**Starting point in the repo:** `public/manifest.json` exists (standalone, 192 and 512 icons, purpose `any` only); **there is no service worker**; the contact form and Vercel Analytics need the network; fonts come from Google at build time (all listed in `plan-offline-fly.md` §0 and fixed by its B1, which stays).

### 11.1 What is cached where

| Content | Where | Strategy |
|---|---|---|
| `/fly` HTML and `_next/static/*` (hashed, immutable) | Cache Storage via service worker | Precache the fly shell; cache-first for hashed assets |
| `/fly` navigation | SW | Network-first with a 3 s timeout, then cached shell |
| Fonts, essential textures, HDRI used by fly | Cache Storage | Cache-first, versioned |
| **World pack (`.pmtiles`, detail, regions)** | **OPFS** (Origin Private File System), managed by `PackManager` | Not in Cache Storage: no Range-request handling needed in the SW, and the reader slices files directly |
| API routes (`/api/contact`) | none | Network only; show "You are offline; message not sent" |
| Third-party hosts | none | Blocked in offline mode (§11.6) |

OPFS is the recommended store for file-based content, and IndexedDB, OPFS and Cache Storage are all supported in modern browsers ✔ (web.dev, storage-for-the-web). Fallback for browsers without OPFS: IndexedDB chunk store, same reader interface.

Service worker implementation: **hand-written, about 150 lines**, or Serwist/Workbox for manifest injection ⚠ (check Serwist's current maintenance and Next 15 compatibility before choosing). The SW only handles the app shell, so it stays simple. Updates **never `skipWaiting` mid-flight**: a new version activates when the user taps "Update" or on next launch.

### 11.2 PackManager (the real work)

States: `not-installed → downloading ⇄ paused → verifying → ready`, plus `update-available`, `repairing`, `evicted`, `error`.

1. **Choose a tier** (Lite / Standard / HD) in a "Play offline" panel showing sizes from the manifest, free space, and a Wi-Fi recommendation.
2. **Pre-flight:** `navigator.storage.estimate()` and require free ≥ 1.5 × tier size (headroom for temporary files); request `navigator.storage.persist()` ✔ (web.dev); explain clearly if refused.
3. **Download:** `Range` requests in 4 MB chunks, 3 in parallel, each chunk SHA-256-checked against the manifest, progress persisted after every chunk so a closed tab **resumes**. Retries with back-off. A **Web Locks** lock ensures only one tab downloads ⚠.
4. **Write to a temp name in OPFS**, verify the whole-file hash, then **atomically rename**; the old version stays until the new one verifies.
5. **Background Fetch** is used where supported (Chromium on Android ⚠ verify); it is **not supported on iOS** ✔ (MagicBell iOS PWA guide), so the UI says "keep this screen open" and uses the Screen Wake Lock API ⚠ while downloading.
6. **Integrity at startup:** compare file sizes and a cheap header check; if a file is missing or truncated, state becomes `repairing` and only that file is re-downloaded.
7. **Updates:** each layer and region is its own file with its own hash, so an update is a manifest diff, and users re-download only what changed.
8. **Metered or low-data:** if the Network Information API reports `saveData` ⚠, warn before starting.

### 11.3 Storage and eviction realities

- Safari caps **all script-writable storage (IndexedDB, Cache API, service worker registration) at 7 days without user interaction** for ordinary browsing; **installed home-screen PWAs are exempt** ✔ (web.dev). So on iOS the panel must prompt "Add to Home Screen" before the big download.
- A home-screen PWA gets its **own storage container**, separate from Safari ✔ (web.dev), so a pack downloaded in Safari is not visible to the installed app.
- Once an installed iOS PWA hits its quota there may be no way to ask for more ✔ (web.dev), so the pre-flight check matters.
- Chromium and Firefox: best-effort storage can be evicted under pressure unless persistence is granted ✔ (web.dev); detect and show `evicted` with a one-tap repair.

### 11.4 Offline behaviour matrix

| Situation | Behaviour |
|---|---|
| Installed + pack ready, no network | Full game. Zero network requests (tested). |
| Installed, no pack, no network | App opens; `/fly` shows "Download the world pack" and falls back to the existing procedural globe from `land.json` |
| Lite only | Whole stylized planet; hero regions show synthesized detail only |
| Pack ready, network available | Local first; network chain stays **off by default** (a setting can enable live imagery) |
| Local tile missing | Existing chain: network (if allowed) → procedural, so there is never a hole (as in `plan-offline-fly.md` B2) |

### 11.5 Installability

Add `purpose: "maskable"` icons, a `/fly` shortcut, `orientation` handling for `/fly` (landscape), and a screenshots entry ⚠. Install prompt via `beforeinstallprompt` on Chromium; step-by-step instructions on iOS. Request a Screen Wake Lock during flight ⚠.

### 11.6 Offline switch

`NEXT_PUBLIC_OFFLINE=1` (build) and an in-app "Offline mode" toggle (runtime). `navigator.onLine` is unreliable ⚠, so it is a hint only: requests are skipped in offline mode, and failed fetches flip a "probably offline" flag with a retry timer.

### 11.7 Hosting the pack

Do not commit pack files to git. Host on object storage or a CDN with CORS and Range support, content-hashed file names, `Cache-Control: immutable`. Whether the current Vercel plan accepts files of this size, and the egress cost per download, are ⚠ to check; an R2/S3-style bucket is the safe default. Commit only the builder, the manifest and a README, as the earlier plan already decided.

---

## 12. More realistic flight feel

**Principle.** Realism comes from physically driven behaviour and physically driven cues, not from a bigger engine. Defaults stay on the real Kestrel numbers (8,500 kg, 120 kN main thrust, about 1.44 g at sea level; `ships/specs.ts`), and the **reality dial** (Cinematic / Physical / Strict, charter §1.8) controls assists, not physics.

| # | Change | Physical driver | Test |
|---|---|---|---|
| F1 | **Rotational inertia and rate limits:** attitude from real inertia tensors (recomputed with fuel); torque from control authority, never instant | I, torque, fuel mass | Step response time constants match `I/τ` within 5% |
| F2 | **Authority vs dynamic pressure:** aero surfaces ∝ q; RCS fixed torque; blend emerges from authority, not a threshold | q = ½ρv² | Surface authority is 0 in vacuum; RCS-only attitude control works |
| F3 | **Hover-to-forward transition from forces:** replaces the `HOVER_MODE_LIMIT` fade (a 30–50 m/s speed threshold in `earthflight.ts:136`, which charter rule 1 disallows) with lift from q·S·C_L(α) plus vectored thrust | q, α, thrust vector | Trim curve is continuous; no force discontinuity across the old threshold |
| F4 | **Stall and buffet:** onset at the α where C_L(α) peaks; buffet amplitude ∝ q × (α − α_stall) | q, α | Onset within 1° of the model; buffet RMS scales with q |
| F5 | **Transonic behaviour:** existing drag rise, plus buffet band about M 0.85–1.15 ⚠, pitch-trim shift, vapour cone when humid and the pressure drop is large | Mach, humidity, p | Drag rise and trim shift continuous; cone appears only above the humidity-pressure criterion |
| F6 | **Wind and turbulence from one field `w(x,t)`:** seeded noise with altitude profile, boundary-layer shear, mountain-wave and orographic lift from terrain slope; gusts act through the aerodynamics, not only the camera | w, terrain slope | Turbulence RMS vs altitude matches the table in the world dossier; determinism from `(state, date, seed)` |
| F7 | **Ground effect, downwash and gear:** lift/thrust gain near the surface, dust from downwash (`dust.ts` exists), gear compression and sinkage per surface (charter §2) | h/b, thrust | Hover thrust required drops near ground; sinkage matches stiffness |
| F8 | **g-effects:** low-pass filtered acceleration moves the head/camera; optional grey-out/tunnel vision from the onset curve; **off with reduced motion** | a, onset curve | Camera offset ∝ filtered a; disabled when `prefers-reduced-motion` |
| F9 | **Camera dynamics:** critically damped chase spring (ζ about 0.7–1 ⚠), lag proportional to acceleration; FOV widening with speed capped at +10° (artistic, declared) | a, v | Overshoot < 5%; FOV cap respected |
| F10 | **Visual speed cues:** multi-scale ground detail (§7), cloud layer with parallax and shadows, contrails when cold and humid, near-camera particles advected by relative wind, subtle motion blur, exhaust heat shimmer | ω = v/h, T, humidity | **Optical-flow coverage:** at 50 m, 500 m, 5 km and 20 km, ground features near 0.5° angular size exist |
| F11 | **Flight instruments:** flight-path marker, radar altitude (AGL), vertical speed, g meter, terrain-ahead warning | state | Values equal sim state; warning fires at the time-to-impact threshold |
| F12 | **Haptics:** gamepad rumble from the structure-borne vibration spectrum (`docs/fly/10-controller-support.md`) | vibration RMS | Rumble amplitude tracks the same driver as the audio rumble |
| F13 | **Integration:** keep the speed-dependent sub-stepping (floor 1/240 s); fixed-step accumulator for determinism | n/a | Same inputs give the same trajectory bit for bit |
| F14 | **Streaming that keeps up:** with local tiles, latency is milliseconds; set lookahead distance to about v × 20 s along the predicted path (existing `stream/budget.ts`) | v | No terrain holes during a scripted Mach-1 low pass |

All new constants go in the physics constants module with unit, source and a `reality` tag (charter rule 2). Everything artistic (FOV kick, buffet band if tuned by ear, cinematic boom) is listed in charter §10 and shown in the reality panel.

**Human check, not only unit tests:** after F1–F10, five players fly the same 10-minute course on Cinematic vs Physical and rate "feels real" and "feels fast" (1–5); the target is Physical ≥ 4.0 on both, with no one motion-sick. Numbers are a gate, not a replacement for feel.

---

## 13. Ship sound

**Scope.** Procedural WebAudio (0 MB), opt-in, built to charter §5 and `plan-fly.md` §12. It lives in `src/lib/fly/audio/`:

- `acoustics.ts` pure, tested: speed of sound `a = √(γ R T / M)`, propagation delay `d/a`, Doppler `f′ = f·c/(c − v_r)`, medium gating, mass-law transmission loss, air absorption.
- `profile.ts` per-ship `soundProfile` (engine type, shaft frequencies, spool time constant, nozzle diameter) so each ship in `docs/fly/11-ship-roster.md` sounds like itself.
- `mixer.ts`, `voices/*.ts`, `engine-worklet.ts` (AudioWorklet for the engine synth; oscillator-graph fallback ⚠), `captions.ts`, and a small React provider.

**Rules from the charter that shape everything:**

- **Medium:** airborne sound exists only where there is gas. In vacuum the pilot hears **structure-borne** vibration and cabin systems only. Level scales with density (about `10·log10(ρ/ρ₀)` dB ⚠ simplification).
- **Causality:** thrust → sound **after spool lag**; impact → sound **after d/a**.
- **Same wind field** carries sound (speed of sound plus the wind component along the path).
- **Safety:** master limiter, loudness cap, "reduce loud sounds", captions for key events.

### 13.1 Sound layers

| Layer | Physical driver | Synthesis recipe |
|---|---|---|
| **Cabin life support** (always, even in vacuum) | Systems state | Pump/fan hum at about 100–200 Hz with harmonics, band-limited pink noise, occasional relay ticks |
| **Main engine, roar** | Exhaust power ∝ ṁ·v_e², throttle | Noise shaped into a low rumble (20–200 Hz) with combustion amplitude modulation (20–60 Hz) plus a mid band (0.4–1.5 kHz); **spectral peak ∝ exhaust velocity / nozzle diameter** (Strouhal about 0.2 ⚠) |
| **Main engine, whine** | Shaft speed from a **spool model** (first-order lag, τ about 1–3 s ⚠) | 3–5 sine partials at shaft harmonics; two shafts detuned a few percent for beating |
| **Engine crackle** | Fuel flow | Poisson impulses through a resonant band-pass |
| **Hover jets and downwash** | Thrust, AGL height | Same engine voice plus a **ground-reflection comb filter**: delay `2·AGL/a`, which is audible as a changing hollow tone when hovering low |
| **Airflow roar** | Dynamic pressure q, turbulence | Band-pass noise whose centre frequency rises with `v/L` (canopy-edge Strouhal ⚠), level ∝ q, modulated by the turbulence field |
| **Transonic** | Mach | Rising buffet rumble across M 0.85–1.15 ⚠. Physically, **the pilot does not hear their own sonic boom**; a boom is heard by observers on the ground, after delay. In **Cinematic** mode only, a stylized thump marks the crossing and is labelled artistic |
| **Reentry plasma roar** | Heat flux q̇ | Broadband noise with high-frequency emphasis and crackle; comms static during blackout |
| **RCS pulses** | Thruster firing events | 10–40 ms band-passed noise burst (0.8–3 kHz) + valve tick + low structure-borne thump; panned by thruster location. In vacuum, **only the thump and tick** (structure-borne) |
| **Gear, flaps, airbrakes** | Actuator state | Servo whine (sine sweep) + latch thud |
| **Touchdown and scrape** | Leg force impulse, surface type | Low decaying thump (40–80 Hz) + surface-specific noise: rock (bright), sand (soft hiss), ice (crack), water (splash) |
| **Alerts** | Fault conditions | Master caution two-tone, stall horn, pulsing terrain warning, low-fuel and overheat tones; **captions always on for alerts**; optional spoken callouts via `speechSynthesis` only where a local voice exists ⚠ |
| **UI** | Interaction | Clean short ticks, never loud |

### 13.2 Cabin versus external

- **Cockpit view:** sources pass through **hull transmission loss**: a multi-band filter whose attenuation follows the mass law, TL ≈ 20·log₁₀(f·m_s) − 47 dB ⚠ (m_s = surface density; constant is for normal incidence, verify), so highs are cut, lows come through. Plus short cabin reverb from a **runtime-generated impulse response** (RT60 about 0.15–0.3 s, 0 MB download).
- **External or chase camera:** no hull loss; gain ∝ 1/r, air absorption increases with distance ⚠, **delay d/a**, **Doppler** for passing sources, HRTF panning (`PannerNode`).
- **Space:** airborne layers fade to silence with density; structure-borne rumble remains, low-passed at about 80–200 Hz.

### 13.3 Mixing and platform behaviour

- Buses (engine, air, structure, alerts, UI) → compressor/limiter → master; target peak ≤ −3 dBFS and a short-term loudness cap ⚠; ducking of ambience under alerts.
- Settings: master, effects, alerts, "reduce loud sounds" (about −6 dB and softer transients), captions on/off, per-bus mute; remembered, with try/catch if storage is blocked.
- Browsers require a **user gesture** to start audio; the first-launch "Enable sound" button does that. Handle `suspended` and iOS `interrupted` states and resume on gesture; mute on `visibilitychange`.
- Known quirk to test: on iOS the hardware silent switch may mute Web Audio ⚠.
- Parameter updates at 30–60 Hz with `setTargetAtTime` smoothing (τ 20–50 ms) to avoid zipper noise. CPU budget ≤ 0.5 ms per frame (`plan-fly.md` §11); keep node count modest (about 60 or fewer ⚠).

### 13.4 Samples (optional, small)

Ship **100% procedural first**. Then A/B against recorded one-shots only for transients synthesis does poorly (touchdown thump, latch clunk, servo). About 24 mono clips in about 6 MB of Opus ⚠; sources must be **CC0 or recorded by you**, with licence recorded in the manifest. Check Opus support on target Safari versions; if missing, use AAC for iOS only ⚠.

### 13.5 Audio tests

- Unit tests (`acoustics.ts`): speed of sound, delay `d/a`, Doppler against the formula, medium gating (zero airborne gain at ρ = 0), mass-law cutoff.
- Render tests with `OfflineAudioContext` in Playwright: render 2 s at 0/50/100% throttle; assert peak ≤ −1 dBFS, no NaN/Inf, **spectral centroid increases with throttle**, whine frequency tracks the spool model with its lag.
- Vacuum test: airborne layers silent, structure-borne layer present.
- CPU test: parameter update ≤ 0.5 ms.
- Listening checklist (human): idle, takeoff, hover near ground, transonic, reentry, touchdown on four surfaces, alerts.

---

## 14. Roadmap and tickets

Sizes: **S** about a day, **M** a few days, **L** about a week or more (relative, ⚠ rough). Each ticket lands as its own commit with typecheck, lint, unit tests and e2e green, as in `plan-offline-fly.md` §4.

**Phase 0: decide (no code)**

| # | Ticket | Size |
|---|---|---|
| 0.1 | Confirm the origin and licence of the four textures (§17-3) | S |
| 0.2 | Choose tiers, hero regions and hosting (§17) | S |

**Phase 1: world pack builder** (`tools/world-pack/`)

| # | Ticket | Size | Exit criterion |
|---|---|---|---|
| W1 | Input validation, hashes, wrap-aware load, reject redundant 10K file | S | Seam test passes (§6.1) |
| W2 | Mercator reprojection, water, coast distance, roughness; height clean-up | M | Round-trip tolerance test |
| W3 | Stylize function, look dial, biome map (needs a public-domain colour source) | M | Preview defects in §5 fixed; side-by-side review |
| W4 | Pyramid, edge stitch, PMTiles write, verify, budget gate, manifest | M | Tier table printed; gate exits non-zero when over |

**Phase 2: runtime** (`src/lib/fly/earth/`, `src/lib/fly/pack/`)

| # | Ticket | Size | Exit criterion |
|---|---|---|---|
| R1 | `PackReader` worker: OPFS source, PMTiles directory cache, decode off-thread | M | Tile fetch p95 under 5 ms on desktop |
| R2 | `LOCAL_PACK` provider in front of the existing chain; fallbacks | M | `loaders.test.ts` order and fallback tests |
| R3 | Terrain detail synthesis + CPU twin (`TerrainField`) | M | Ground contact equals drawn surface within 3 m |
| R4 | Stylized shader: albedo, ocean, night, clouds, detail textures | L | Fixed-camera screenshot suite |
| R5 | Seam and LOD test suite (§6) | M | All six seam tests green |

**Phase 2B: look, atmosphere and settlements** (after R1–R3 so there is real data to look at)

| # | Ticket | Size | Exit criterion |
|---|---|---|---|
| O1 | Bicubic base-colour sampling and material classification | S | No visible pixel blocks at 300 m |
| O2 | Mean-preserving detail overlay at three scales, triplanar + hex tiling (§7A) | L | ΔE ≤ 2 vs base; no repetition peak; no shimmer |
| O3 | Rivers, farmland parcels, dunes, forest canopy (§7A item 5) | M | Screenshot review per biome |
| O4 | Stylized / Natural look dial and material sets | M | Both looks selectable live |
| A1 | Transmittance + multiple-scattering + sky-view LUTs with ozone; extend the CPU twin (§7B) | L | Shader matches CPU twin |
| A2 | Aerial-perspective volume on terrain, ocean, buildings | M | Haze rises with distance in air, absent in vacuum |
| A3 | Space look: black sky, hard sun, earthshine-only shadows, steady stars, thin limb, terminator ring | M | Altitude-sweep screenshots; star scintillation test |
| A4 | Clouds (High/Medium/Low) with ground shadows, driven by the wind field | L | Frame-time budget per tier |
| A5 | Ocean sky reflection, sun glint, ambient from sky irradiance | M | Sky colour visible in water |
| A6 | Atmosphere quality tiers wired to Phase C graphics settings | S | Governor keeps frame time |
| B1 | Pack reader for baked footprints; hook into `BuildingsLayer` | M | Offline buildings in a hero city |
| B2 | Procedural settlements from night lights (§7C) | M | Density follows brightness |
| B3 | Stylized buildings: roof shapes, palette, lit windows, instancing, LOD | M | Frame time with a dense city |
| B4 | Baked city-core builder (OSM extract, simplify, quantize, measure size) | M | Per-city size printed; gate respected |

**Phase 3: Leaflet** (`src/lib/fly/map/`)

| # | Ticket | Size |
|---|---|---|
| L1 | Adapter and `PackTileLayer` / PMTiles raster layer | M |
| L2 | Mission map, minimap, terminator, flight path | M |
| L3 | Region chooser wired to PackManager | S |

**Phase 4: offline PWA**

| # | Ticket | Size | Exit criterion |
|---|---|---|---|
| P1 | Old B1: local fonts, analytics gate, offline flag | S | `next build` works offline |
| P2 | Service worker for the fly shell; manifest upgrades | M | Reload offline works |
| P3 | `PackManager`: chunked resumable download, hashes, quota, OPFS, atomic update, repair | L | Interrupt/resume and corruption tests pass |
| P4 | Install UX, iOS Add-to-Home-Screen flow, eviction detection | M | Manual iOS and Android runs |
| P5 | Playwright offline suite with `context.setOffline(true)` | M | Zero failed requests, zero console errors |
| P6 | Pack hosting, CORS and Range, manifest publishing | S | Download works from the real host |
| P7 | Device matrix and runtime memory caps | M | Targets set per device class |

**Phase 5: flight feel:** F1–F14 in §12, grouped as (A) F1, F2, F13; (B) F4, F5, F6, F7; (C) F3; (D) F8–F12, F14. Each group ends with its tests and the human check.

**Phase 6: sound** (§13)

| # | Ticket | Size |
|---|---|---|
| S1 | `acoustics.ts` and tests | S |
| S2 | Mixer, limiter, settings, captions, gesture/iOS handling | M |
| S3 | Engine, airflow and cabin voices | L |
| S4 | Event voices: RCS, gear, touchdown, alerts | M |
| S5 | External-camera spatialization, delay, Doppler | M |
| S6 | Optional sample A/B | S |
| S7 | Render tests and listening checklist | M |

**Phase 7: HD tier**

| # | Ticket | Size |
|---|---|---|
| H1 | Acquire ETOPO/DEM sources and record licences | S |
| H2 | 16-bit global height archive (z0–z7) | M |
| H3 | Hero regions to z11 | M |
| H4 | Baked building footprints | M |
| H5 | Final gate, trim, release | S |

**Suggested order:** Phase 0 → 1 → 2 (so you can already fly offline from a local file) → 2B (look, atmosphere, settlements) → 4 (P1, P2, P3 early, because storage is the riskiest part) → 6 and 5 in parallel → 3 → 7. Sound S1–S2 and PWA P3 can start as soon as Phase 1 produces a real pack.

---

## 15. Test and acceptance matrix

| Area | Test | Pass criterion | Type |
|---|---|---|---|
| Builder | Round trip | Decoded data layers equal source within declared tolerance | unit/script |
| Builder | Budget gate | Non-zero exit if a tier is over budget | script |
| Builder | Determinism | Same inputs and seed give identical SHA-256 | script |
| Seamless | Six seam tests (§6) | See §6 | unit + e2e |
| Detail | Optical-flow coverage (§7, F10) | Features near 0.5° exist at 50 m–20 km AGL | e2e |
| Streaming | Scripted low pass at Mach 1 | No terrain holes; no tile request waits over 1 frame budget | e2e |
| Offline | `setOffline(true)` fly session | Zero failed requests, zero console errors | e2e |
| Storage | Simulated quota exceeded (Chrome DevTools quota override ✔ web.dev) | Clear error, no partial file left | e2e |
| Download | Kill the tab mid-download | Resumes from the last verified chunk | e2e |
| Integrity | Flip one byte in a stored chunk | Detected; only that file repaired | unit/e2e |
| SW | Update available during flight | No reload until the user accepts | e2e |
| Overlay | Mean colour and repetition (§7A) | ΔE ≤ 2; no autocorrelation peak; no shimmer | unit + e2e |
| Atmosphere | Shader vs CPU twin; altitude sweep (§7B) | Within tolerance; sky luminance monotonic; vacuum shadows = earthshine only | unit + e2e |
| Atmosphere | Limb thickness and star scintillation | About 1.6% of radius at true scale; zero twinkle in vacuum | unit |
| Buildings | Round trip, determinism, density vs night lights (§7C) | See §7C | unit + e2e |
| Leaflet | Layer toggles, region chooser, terminator | Matches the 3D palette; terminator matches `sun.ts` | e2e |
| Flight | F1–F14 table tests | See §12 | unit |
| Flight | Determinism and conservation | Energy and mass books balance (charter §1.3) | unit |
| Sound | `acoustics.ts` formulas | See §13.5 | unit |
| Sound | `OfflineAudioContext` render | Peak ≤ −1 dBFS; no NaN; centroid rises with throttle | e2e |
| Sound | Vacuum | Airborne layers silent | unit |
| Perf | Frame time and main-thread terrain scheduling | ≤ 1 ms main thread (plan-fly §11) | e2e |
| Perf | Audio CPU | ≤ 0.5 ms per frame | unit |
| Devices | iOS Safari (tab and Home Screen), Android Chrome, desktop Chrome/Edge/Firefox | Download, offline play, eviction recovery all work | manual |
| Licences | Manifest | Every source lists licence and attribution; credits page generated from it | script |

---

## 16. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Input textures have a licence that forbids redistribution | Unknown | Ticket 0.1 before anything is published; keep the pack private until confirmed |
| iOS storage limits or eviction break offline play | High on iOS | Home-Screen install gate, persistence request, quota pre-flight, repair flow, honest messaging |
| Peaks look low in Standard (F2) | Certain | Declared departure; optional peak restoration; fixed in HD |
| Synthesized detail looks fake or collides wrongly | Medium | Roughness-driven amplitude, 3 m sub-cell cap, CPU twin, A/B screenshots |
| Stylized colours look wrong in some regions | Medium | Biome map; look dial; tuning loop with the preview |
| Leaflet 2.0 changes the API | Medium | Stay on 1.9.4; adapter folder |
| PMTiles API names differ by version | Low | Pin the version; the sketch in Appendix D is flagged untested |
| Audio feels fake or too loud | Medium | Limiter, loudness cap, reduce-loud setting, listening checklist, optional samples |
| iOS silent switch or autoplay policy mutes audio | Medium | Gesture start, resume logic, device test |
| Hosting cost or file-size limits | Medium | Object storage with CDN; verify Vercel limits |
| Runtime memory on phones | Medium | Mipmaps, lower tile cap, P7 caps per device class |
| Realism work makes the ship hard to fly | Medium | Assists on the reality dial; human check gate |

---

## 17. Decisions needed from you

1. **Tiers:** is Lite (≈ 50 MB) / Standard (≤ 100 MB) / HD (≤ 200 MB) the right split, or only two tiers?
2. **Hero regions (8 for Standard):** which places? The repo already knows the spawn site, Matterhorn, Everest and Dead Sea. Add home town, cities and mountains you care about.
3. **Origin and licence of your four textures.** Where did they come from, and may the pack be public? (If unsure, I keep the pack private.)
4. **Hosting:** where will the pack live (R2/S3, GitHub Releases, Vercel Blob, other)?
5. **Builder language:** Python (proven in this session) is recommended; say if you want a Node/`sharp` port instead.
6. **Leaflet version:** stay on 1.9.4 (recommended) or move to 2.x once you confirm it is stable.
7. **Fast mode:** drop the old 10× idea, or keep it as an opt-in "Arcade" setting?
8. **Sound:** 100% procedural first (recommended), then decide on samples. Should the first-launch prompt default to sound off (charter) or ask once?
9. **Peak restoration** (taller Himalaya and Andes in Standard): on, off, or HD only?
10. **Polar caps:** is a procedural ice disc at the poles acceptable?
11. **Settlements:** procedural towns driven by night lights everywhere plus baked real city cores for hero regions (recommended), or only real baked buildings? Which cities should be baked?
12. **Default look:** Stylized (recommended) or Natural for the HD overlay? May I use CC0 material libraries and the repo's own textures once their licences are confirmed?
13. **Atmosphere thickness:** true scale (about 1.6% of radius, recommended) or up to 1.5× exaggerated in Stylized?
14. **Cloud quality default** on phones: 2D parallax layers (recommended) or none?

---

## Appendix A: reproduce the measurements

All scripts are in `tools/offline-world-prototype/` (the large intermediate `.npy` rasters are not shipped; they regenerate in seconds).

```bash
cd tools/offline-world-prototype
python3 inspect_inputs.py       # sizes, modes, level counts, seam diffs (F1, F5, F6, redundancy)
python3 calibrate_height.py     # metres per level at known places (F1, F2, F3)
python3 pyr.py                  # Mercator z6 rasters for height and water -> exp/*.npy
python3 enc.py                  # lossless WebP tile sizes at z6
python3 colsize.py              # stylized albedo tile size at z6 (q70, q80)
python3 night_size.py           # night-lights compressed sizes
python3 style.py                # 2048x1024 stylized preview image (images/stylized_preview.png)
# inputs: set WORLD_INPUTS=/path/to/textures, default ../../../original-uploads
```

Environment used: 1 CPU, 3 GB RAM, Pillow 12.1.1 with WebP and AVIF, SciPy 1.17.1.

## Appendix B: manifest schema (example)

```json
{
  "version": "2026.10.0",
  "attribution": [
    { "id": "inputs", "text": "Elevation, land/water and night-light rasters: <source to be confirmed>", "licence": "<to be confirmed>" }
  ],
  "tiers": {
    "lite":     { "bytes": 0, "files": ["world-terrain", "world-albedo", "world-night", "detail"] },
    "standard": { "bytes": 0, "files": ["lite", "bathymetry", "regions/*", "sounds"] },
    "hd":       { "bytes": 0, "files": ["standard", "hd-height16", "regions-hd/*"] }
  },
  "files": {
    "world-terrain": {
      "path": "world-terrain.pmtiles", "bytes": 0, "sha256": "<hex>",
      "chunkBytes": 4194304, "chunks": ["<hex>"],
      "layout": { "R": "height", "G": "coast", "B": "water" },
      "heightScaleMetres": 25, "minZoom": 0, "maxZoom": 6
    }
  }
}
```

Byte counts are filled by the builder; `0` here is a placeholder, not a measurement.

## Appendix C: proposed layout

```
tools/world-pack/                 builder (Python) + requirements.txt + README
tools/offline-world-prototype/    the scripts and results from this session
src/lib/fly/pack/                 PackManager, PackReader (worker), OPFS source, manifest types
src/lib/fly/map/                  Leaflet adapter, PackTileLayer, mission map
src/lib/fly/audio/                acoustics.ts, profile.ts, mixer.ts, voices/, engine-worklet.ts, captions.ts
src/lib/fly/earth/                existing; add LOCAL_PACK provider, detail synthesis
public/sw.js (or generated)       service worker for the fly shell
public/manifest.json              upgraded (maskable icons, /fly shortcut)
docs/fly/13-graphics.md           from plan-offline-fly Phase C
docs/fly/14-offline-world.md      user-facing "how the pack works" once built
```

## Appendix D: Leaflet and OPFS sketch (UNTESTED, ⚠ verify against the installed `pmtiles` and `leaflet` versions)

```ts
// src/lib/fly/pack/opfsSource.ts
import type { Source, RangeResponse } from 'pmtiles';

export class OpfsSource implements Source {
  constructor(private file: File, private key: string) {}
  getKey() { return this.key; }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    return { data: await this.file.slice(offset, offset + length).arrayBuffer() };
  }
}

// src/lib/fly/map/packTileLayer.ts  (Leaflet 1.9.x)
import L from 'leaflet';
import { PMTiles } from 'pmtiles';

export function packTileLayer(archive: PMTiles, paint: (c: HTMLCanvasElement, bmp: ImageBitmap) => void) {
  const Layer = L.GridLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const tile = document.createElement('canvas');
      tile.width = tile.height = 256;
      archive.getZxy(coords.z, coords.x, coords.y)
        .then(async (r) => {
          if (!r) return done(undefined, tile);
          const bmp = await createImageBitmap(new Blob([r.data]),
            { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
          paint(tile, bmp);          // palette + hillshade, same function as the 3D world
          done(undefined, tile);
        })
        .catch((e) => done(e as Error, tile));
      return tile;
    },
  });
  return new (Layer as any)({ maxNativeZoom: 6, maxZoom: 10, keepBuffer: 2, updateWhenIdle: true });
}
```
