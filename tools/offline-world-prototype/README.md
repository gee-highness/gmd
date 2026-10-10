# Offline-world prototype scripts

Throwaway measurement scripts behind `docs/plan-offline-world.md`. They are not part of the app build.

```bash
pip install numpy scipy pillow
export WORLD_INPUTS=/path/to/textures     # default: ../../../original-uploads (next to gmd-main in the delivery zip)
python3 inspect_inputs.py && python3 calibrate_height.py
python3 pyr.py && python3 enc.py && python3 colsize.py
python3 style.py && python3 night_size.py
```

Outputs: `images/` (previews and the stylized preview) and `exp/` (large intermediates, not shipped). See `RESULTS.md` for the raw numbers.
