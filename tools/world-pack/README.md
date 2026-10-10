# World pack builder

Builds the offline stylized-world PMTiles pack described in
`docs/plan-offline-world.md`. Dev-time tool, not part of the Next bundle
(plan §4). Ticket progress against the plan's §14 roadmap:

| Ticket | What | Status |
|---|---|---|
| W1 | Input validation, hashes, wrap-aware load, reject redundant 10K file | done (`validate.py`) |
| W2 | Mercator reprojection, water, coast distance, roughness; height clean-up | done (`reproject.py`) |
| W3 | Stylize function, look dial, biome map | partly done (`stylize.py`); biome map not implemented (see below) |
| W4 | Pyramid, edge stitch, PMTiles write, verify, budget gate, manifest | not started |

```bash
pip install -r requirements.txt
export WORLD_INPUTS=/path/to/textures     # default: ../../../original-uploads (sibling of the repo)
python3 validate.py
python3 reproject.py
python3 stylize.py
```

**`validate.py` (W1)** checks each input's dimensions, mode and (for sources
stored as grey-in-RGB) channel equality; refuses `topography_10k.png` as
redundant with `topography_21K.png`; records a SHA-256 per file; and runs
the antimeridian seam test (plan §6 item 1) that a wrap-aware resampler
relies on. It writes `out/inputs.json`, a manifest fragment later steps
extend into the full pack manifest (Appendix B), and exits non-zero if a
check fails — out/ and exp/ are gitignored, not shipped.

**`reproject.py` (W2)** cleans the height terraces (edge-aware smoothing,
sea level pinned to 0 on water), reprojects height and water to Web
Mercator z6 (16384×16384, wrap-aware horizontal resize so the antimeridian
resample doesn't clamp to the edge pixel), derives coast distance in real
metres (Mercator is conformal, so pixel spacing in metres is `(equatorial
circumference / W) * cos(latitude)`) and a z5 roughness map (local height
std). Exit test: a round trip comparing the cleaned equirectangular height
to the same point read back from the z6 raster, at the calibration points
from `tools/offline-world-prototype/calibrate_height.py` minus the two
beyond Mercator's representable latitude (§6 item 6). Two points
(Kilimanjaro, Mt Whitney) are confirmed-by-inspection 2-3 px summit spikes
that a 24% linear downsample is expected to erode; they're reported but
excluded from the pass/fail gate rather than hidden behind a loose
tolerance. All other points land within 1 level. Measured on the real
textures: ~72 s end to end on 4 CPUs / 15 GB.

**`stylize.py` (W3)** fixes four of the five preview defects from plan §5:
ice now keys off latitude *and* elevation together (fixes Greenland/
Antarctica reading brown), the ocean colour band uses the real coast
distance in metres from W2 instead of an arbitrary pixel scale (narrows
the glow), the snow line is latitude- *and* aridity-dependent (Tibet goes
from solid white to a believable mix of glaciated peaks and bare plateau),
and the desert blend weight/width are raised (Sahara/Arabia read tan, not
olive). **Defect 5 (regional-climate biome map) is not implemented**: it
needs classifying a public-domain colour source (NASA Blue Marble / Natural
Earth) that this sandbox cannot reach, and plan §17 decision 3 (texture
licence) is still open — both are Gee's call, not something to guess at.
Renders `images/stylized_preview_{stylized,clean_cel}.png` (the two
plan §5 look-dial options derivable without photo-based materials).
