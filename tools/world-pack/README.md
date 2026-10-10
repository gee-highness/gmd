# World pack builder

Builds the offline stylized-world PMTiles pack described in
`docs/plan-offline-world.md`. Dev-time tool, not part of the Next bundle
(plan §4). Ticket progress against the plan's §14 roadmap:

| Ticket | What | Status |
|---|---|---|
| W1 | Input validation, hashes, wrap-aware load, reject redundant 10K file | done (`validate.py`) |
| W2 | Mercator reprojection, water, coast distance, roughness; height clean-up | not started |
| W3 | Stylize function, look dial, biome map | not started |
| W4 | Pyramid, edge stitch, PMTiles write, verify, budget gate, manifest | not started |

```bash
pip install -r requirements.txt
export WORLD_INPUTS=/path/to/textures     # default: ../../../original-uploads (sibling of the repo)
python3 validate.py
```

`validate.py` (W1) checks each input's dimensions, mode and (for sources
stored as grey-in-RGB) channel equality; refuses `topography_10k.png` as
redundant with `topography_21K.png`; records a SHA-256 per file; and runs
the antimeridian seam test (plan §6 item 1) that a wrap-aware resampler
relies on. It writes `out/inputs.json`, a manifest fragment later steps
extend into the full pack manifest (Appendix B), and exits non-zero if a
check fails — out/ and exp/ are gitignored, not shipped.
