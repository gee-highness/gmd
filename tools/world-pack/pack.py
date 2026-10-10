"""W4: pyramid, PMTiles write, verify, budget gate, manifest.

Plan: docs/plan-offline-world.md §4 steps 7-13, §10 (budget), Appendix B (manifest).
Exit criterion (plan §14, ticket W4): tier table printed; gate exits non-zero when over.

Produces three PMTiles archives (z0-z6), covering the Lite-tier layers this
builder can make from the four source textures alone (no bathymetry, hero
regions, sound or HD height - those need data this session doesn't have):

    out/world-terrain.pmtiles   R=height, G=coast distance, B=water (lossless WebP)
    out/world-albedo.pmtiles    stylized colour (lossy WebP q80)
    out/world-night.pmtiles     night lights, grey (lossy WebP q70)

Usage:
    cd tools/world-pack
    python3 pack.py
"""
import hashlib
import io
import json
import sys
import time

import numpy as np
from PIL import Image
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import write as pmtiles_write

from common import INPUTS, NIGHTLIGHTS, OUT
from reproject import (
    W as Z6_W, clean_height, coast_distance_metres, merc_reproject,
    roughness_map, row_latitudes, wrap_resize_width,
)
from stylize import albedo as albedo_fn, coast_distance_metres_preview  # noqa: F401 (kept for parity)
from validate import load_grey, sha256_file
from common import TOPOGRAPHY, LANDOCEAN

Image.MAX_IMAGE_PIXELS = None

TILE = 256
MAX_Z = 6
COAST_ENCODE_MAX_M = 50_000.0  # G channel full-scale range (plan §5 shore band ~15-25 km, deep beyond)

TIER_BUDGET_BYTES = {'lite': 60 * 1_000_000, 'standard': 100 * 1_000_000, 'hd': 200 * 1_000_000}


def box_downsample2(a):
    """Area-average 2x downsample (plan §4 step 7: 'area-average, never nearest-neighbour').
    Accumulates into a quarter-size float32 buffer instead of promoting the
    whole input to float32 first, to keep the peak allocation small at z6
    (16384^2, up to 3 channels)."""
    h, w = a.shape[:2]
    a = a[:h - h % 2, :w - w % 2]
    out = a[0::2, 0::2].astype(np.float32)
    out += a[1::2, 0::2]
    out += a[0::2, 1::2]
    out += a[1::2, 1::2]
    out *= 0.25
    return out


def pyramid(z6_array, min_z=0):
    """z6 -> z0 by repeated area-average halving. Returns {z: uint8 array}.
    Because every level is one continuous raster sliced into tiles afterward
    (not rendered per-tile), adjacent tile borders are byte-identical by
    construction - a stronger guarantee than patching shared edges after the
    fact (plan §4 step 8 / §6 item 2)."""
    levels = {MAX_Z: z6_array}
    cur = z6_array.astype(np.float32)
    for z in range(MAX_Z - 1, min_z - 1, -1):
        cur = box_downsample2(cur)
        levels[z] = np.clip(np.rint(cur), 0, 255).astype(np.uint8)
    return levels


def encode_tile(arr, lossless, quality=80):
    im = Image.fromarray(arr)
    bio = io.BytesIO()
    if lossless:
        im.save(bio, 'WEBP', lossless=True, quality=100, method=4)
    else:
        im.save(bio, 'WEBP', quality=quality, method=4)
    return bio.getvalue()


def write_pmtiles(path, levels, lossless, quality, tile_type=TileType.WEBP):
    """Slice every zoom level into 256px tiles and write a PMTiles v3 archive.
    Uniform tiles (e.g. open ocean) are written once and referenced by every
    other identical tile via pmtiles.Writer's own hash dedup."""
    n_tiles = 0
    n_bytes = 0
    with pmtiles_write(path) as writer:
        for z, arr in sorted(levels.items()):
            n = arr.shape[0] // TILE
            for ty in range(n):
                for tx in range(n):
                    tile = arr[ty * TILE:(ty + 1) * TILE, tx * TILE:(tx + 1) * TILE]
                    data = encode_tile(tile, lossless, quality)
                    writer.write_tile(zxy_to_tileid(z, tx, ty), data)
                    n_tiles += 1
                    n_bytes += len(data)
        header = {
            'version': 3,
            'tile_type': tile_type,
            'tile_compression': Compression.NONE,  # WebP is already compressed
            'min_lon_e7': -1800000000, 'min_lat_e7': -850511300,
            'max_lon_e7': 1800000000, 'max_lat_e7': 850511300,
            'center_zoom': 2, 'center_lon_e7': 0, 'center_lat_e7': 0,
        }
        writer.finalize(header, {'name': path.rsplit('/', 1)[-1]})
    import os
    size = os.path.getsize(path)
    print(f'  wrote {path} : {n_tiles} tiles encoded, {size / 1e6:.2f} MB on disk '
          f'(pre-dedup {n_bytes / 1e6:.2f} MB)')
    return size


def verify_pmtiles(path, levels, lossless, sample=40):
    """Plan §4 step 11: re-decode tiles and compare to the source raster."""
    from pmtiles.reader import Reader, MmapSource
    reader = Reader(MmapSource(open(path, 'rb')))
    rng = np.random.default_rng(0)
    checked = 0
    worst = 0
    for z, arr in levels.items():
        n = arr.shape[0] // TILE
        coords = rng.integers(0, n, size=(min(sample, n * n), 2))
        for tx, ty in coords:
            tile_bytes = reader.get(z, int(tx), int(ty))
            if tile_bytes is None:
                print(f'  VERIFY FAIL: missing tile z{z}/{tx}/{ty}', file=sys.stderr)
                return False
            decoded = np.asarray(Image.open(io.BytesIO(tile_bytes)))
            expected = arr[ty * TILE:(ty + 1) * TILE, tx * TILE:(tx + 1) * TILE]
            if decoded.shape != expected.shape:
                print(f'  VERIFY FAIL: shape mismatch z{z}/{tx}/{ty}', file=sys.stderr)
                return False
            diff = int(np.abs(decoded.astype(int) - expected.astype(int)).max())
            worst = max(worst, diff)
            checked += 1
    tolerance = 0 if lossless else 24  # lossy q70-80 WebP can move a level/channel a bit
    passed = worst <= tolerance
    print(f'  verify [{path.rsplit("/", 1)[-1]}]: {checked} tiles sampled, worst pixel diff {worst} '
          f'<= {tolerance} : {"PASS" if passed else "FAIL"}')
    return passed


def build_terrain(height_z6, coast_m_z6, water_z6):
    g = np.clip(coast_m_z6 / COAST_ENCODE_MAX_M * 255.0, 0, 255).astype(np.uint8)
    rgb_z6 = np.stack([height_z6, g, water_z6], axis=-1)
    levels = pyramid(rgb_z6)
    return levels


def main():
    t0 = time.time()

    print('loading inputs and W2 reprojection ...')
    height_raw = load_grey(TOPOGRAPHY, {'size': (21600, 10800), 'mode': 'L'})
    water_raw = load_grey(LANDOCEAN, {'size': (16200, 8100), 'mode': 'L'})
    water_on_height_grid = np.asarray(
        Image.fromarray(water_raw).resize((height_raw.shape[1], height_raw.shape[0]), Image.BILINEAR)
    )
    height_clean = clean_height(height_raw, water_on_height_grid)
    height_z6 = merc_reproject(wrap_resize_width(height_clean, Z6_W))
    water_z6 = merc_reproject(wrap_resize_width(water_raw, Z6_W))
    lat_per_row = row_latitudes(Z6_W)
    coast_m_z6 = coast_distance_metres(water_z6, lat_per_row)
    print(f'  reprojected, {round(time.time() - t0, 1)} s')

    print('building albedo (stylized), in row strips to bound peak memory ...')
    albedo_z6 = np.empty((Z6_W, Z6_W, 3), dtype=np.uint8)
    strip_h = 1024
    for y0 in range(0, Z6_W, strip_h):
        y1 = min(Z6_W, y0 + strip_h)
        lat_strip = lat_per_row[y0:y1, None] * np.ones((1, Z6_W), dtype=np.float32)
        strip = albedo_fn(height_z6[y0:y1].astype(np.float32), water_z6[y0:y1].astype(np.float32),
                           lat_strip, coast_m_z6[y0:y1])
        albedo_z6[y0:y1] = np.clip(strip, 0, 255).astype(np.uint8)
    print(f'  albedo built, {round(time.time() - t0, 1)} s')

    print('reprojecting night lights ...')
    night_raw = load_grey(NIGHTLIGHTS, {'size': (10800, 5400), 'mode': 'RGB'})
    night_z6 = merc_reproject(wrap_resize_width(night_raw, Z6_W))
    print(f'  night lights reprojected, {round(time.time() - t0, 1)} s')

    print('roughness map ...')
    roughness = roughness_map(height_z6)  # z5 only, per plan §5
    print(f'  roughness done, {round(time.time() - t0, 1)} s')

    print('pyramiding + encoding + writing + verifying PMTiles, one layer at a time (bounds peak memory) ...')
    import gc
    files = {}
    ok = True

    def pack_layer(name, levels, lossless, quality, tile_type=TileType.WEBP):
        nonlocal ok
        path = OUT + name
        size = write_pmtiles(path, levels, lossless, quality, tile_type)
        ok &= verify_pmtiles(path, levels, lossless)
        files[name] = size
        print(f'  {name} done, {round(time.time() - t0, 1)} s')

    terrain_levels = build_terrain(height_z6, coast_m_z6, water_z6)
    del height_z6, water_z6, coast_m_z6  # not needed past this point; frees ~2GB before the next pyramid
    gc.collect()
    pack_layer('world-terrain.pmtiles', terrain_levels, lossless=True, quality=100)
    del terrain_levels
    gc.collect()

    albedo_levels = pyramid(albedo_z6)
    del albedo_z6
    gc.collect()
    pack_layer('world-albedo.pmtiles', albedo_levels, lossless=False, quality=80)
    del albedo_levels
    gc.collect()

    night_levels = pyramid(night_z6)
    del night_z6
    gc.collect()
    pack_layer('world-night.pmtiles', night_levels, lossless=False, quality=70)
    del night_levels
    gc.collect()

    # Roughness (z0-z5, plan §5) ships as a lossless WebP PMTiles archive too.
    roughness_levels = pyramid(roughness, min_z=0)
    del roughness_levels[MAX_Z]  # roughness is z0-z5 only (plan §5), z6 was never generated for it
    del roughness
    gc.collect()
    pack_layer('world-roughness.pmtiles', roughness_levels, lossless=True, quality=100)
    del roughness_levels
    gc.collect()

    lite_bytes = sum(files.values())

    print()
    print('tier table (bytes measured, this builder only produces Lite-tier layers so far):')
    print(f'{"file":28s}{"MB":>10s}')
    for name, size in files.items():
        print(f'{name:28s}{size / 1e6:10.2f}')
    print(f'{"lite total":28s}{lite_bytes / 1e6:10.2f}   (gate: <= {TIER_BUDGET_BYTES["lite"] / 1e6:.0f} MB)')

    manifest = {
        'version': time.strftime('%Y.%m.%d', time.gmtime()),
        'attribution': [{
            'id': 'inputs',
            'text': 'Elevation, land/water and night-light rasters: origin unconfirmed (plan §17 decision 3)',
            'licence': 'unconfirmed - keep private until confirmed',
        }],
        'tiers': {'lite': {'bytes': lite_bytes, 'files': list(files.keys())}},
        'files': {},
    }
    for name, size in files.items():
        path = OUT + name
        manifest['files'][name] = {
            'path': name, 'bytes': size, 'sha256': sha256_file(path),
            'minZoom': 0, 'maxZoom': MAX_Z if name != 'world-roughness.pmtiles' else MAX_Z - 1,
        }
    with open(OUT + 'manifest.json', 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f'manifest written to {OUT}manifest.json')

    gate_failed = lite_bytes > TIER_BUDGET_BYTES['lite']
    print(f'{round(time.time() - t0, 1)} s total')
    if not ok:
        print('W4 FAILED: tile verification failed.', file=sys.stderr)
        sys.exit(1)
    if gate_failed:
        print(f'W4 FAILED: Lite tier {lite_bytes / 1e6:.2f} MB exceeds {TIER_BUDGET_BYTES["lite"] / 1e6:.0f} MB gate.',
              file=sys.stderr)
        sys.exit(1)
    print('W4 passed.')


if __name__ == '__main__':
    main()
