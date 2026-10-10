"""W3: stylize function with the §5 preview defects fixed, plus a look dial.

Plan: docs/plan-offline-world.md §5.
Exit criterion (plan §14, ticket W3): preview defects in §5 fixed; side-by-side review.

Defect 5 ("wrong regional climates... add the biome map") needs a
public-domain colour source (NASA Blue Marble / Natural Earth) to classify;
this sandbox cannot reach those hosts and the licence is still unconfirmed
(plan §17 decision 3), so the biome map is NOT implemented here. Defects
1-4, which are derivable from the data already in hand, are fixed below.

Usage:
    cd tools/world-pack
    python3 stylize.py
"""
import time

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from common import IMG, INPUTS, LANDOCEAN, NIGHTLIGHTS, TOPOGRAPHY
from reproject import EARTH_CIRCUMFERENCE_M

Image.MAX_IMAGE_PIXELS = None


def lerp(stops, x):
    xs = np.array([s[0] for s in stops], float)
    out = np.zeros(x.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = np.interp(x, xs, [s[1][c] for s in stops])
    return out


LAND = [(0, (86, 140, 70)), (0.12, (120, 160, 78)), (0.30, (176, 166, 96)),
        (0.5, (150, 120, 92)), (0.75, (128, 118, 112)), (1.0, (236, 238, 242))]


def albedo(h, m, lat, coast_m, look='stylized'):
    """h: 0..255 (25 m/level). m: 0 land .. 255 water. lat: degrees.
    coast_m: metres from water pixel to nearest land (0 on land)."""
    elev = h / 255.0
    water = m > 127
    al = np.abs(lat)

    # Defect 4: dry (subtropical desert) weight raised 0.75 -> 0.9, belt widened 9 -> 12.
    dry = np.exp(-((al - 26) / 12.0) ** 2)
    wet = np.exp(-(al / 9.0) ** 2)
    base = lerp(LAND, np.clip(elev * 1.0, 0, 1))
    desert = np.array([214, 186, 120], np.float32)
    jungle = np.array([52, 112, 64], np.float32)
    boreal = np.array([70, 104, 86], np.float32)
    tundra = np.array([160, 160, 140], np.float32)
    low = (1 - np.clip(elev * 3, 0, 1))[..., None]
    col = base.copy()
    col = col * (1 - low * dry[..., None] * 0.9) + low * dry[..., None] * 0.9 * desert
    col = col * (1 - low * wet[..., None] * 0.7) + low * wet[..., None] * 0.7 * jungle
    b = np.clip((al - 48) / 12, 0, 1) * np.clip((70 - al) / 10, 0, 1)
    col = col * (1 - low * b[..., None] * 0.7) + low * b[..., None] * 0.7 * boreal
    t = np.clip((al - 64) / 8, 0, 1)
    col = col * (1 - t[..., None] * 0.8) + t[..., None] * 0.8 * tundra

    # Defect 3: latitude-dependent snow line, pulled up by aridity so dry
    # high plateaus (Tibet) read tan/grey, not white, at the same elevation
    # that would be snow in a wet temperate range.
    snow_line = 0.55 - 0.30 * np.clip((70 - al) / 70, 0, 1)   # lower (more snow) toward the poles
    snow_line = np.clip(snow_line + 0.45 * dry, 0.30, 0.95)    # raised (less snow) in the dry belt
    snow = np.clip((elev - snow_line) / 0.08, 0, 1)

    # Defect 1: ice keyed to latitude AND elevation together, not latitude alone,
    # so a high-latitude ice sheet (Greenland interior, ~3000 m) reads ice at
    # 72 degrees instead of needing >76, while low, ice-free high-latitude
    # coastal land stays out of it.
    ice_by_lat_alone = np.clip((al - 76) / 4, 0, 1)
    ice_by_lat_and_height = np.where((al > 60) & (elev > 600 / 6375), np.clip((al - 60) / 12, 0, 1), 0.0)
    ice = np.maximum(ice_by_lat_alone, ice_by_lat_and_height)
    ice = np.maximum(ice, snow)
    col = col * (1 - ice[..., None]) + ice[..., None] * np.array([238, 242, 248], np.float32)

    # Defect 2: coastal glow band narrowed from an arbitrary pixel scale to a
    # physically meaningful ~20 km shallow-water band, using the real coast
    # distance in metres from W2 instead of a tuned pixel constant.
    coast_norm = np.clip(coast_m / 20_000.0, 0, 1)
    ocean = lerp([(0, (70, 200, 200)), (0.15, (30, 140, 190)), (0.5, (18, 70, 140)), (1, (10, 30, 90))], coast_norm)
    ice_sea = np.clip((al - 76) / 4, 0, 1)
    ocean = ocean * (1 - ice_sea[..., None]) + ice_sea[..., None] * np.array([226, 234, 244], np.float32)

    out = np.where(water[..., None], ocean, col)
    if look == 'clean_cel':
        out = np.round(out / 24) * 24  # posterize, Clean cel look dial (plan §5)
    return out


def coast_distance_metres_preview(water_mask, lat_row, w):
    dist_px = ndi.distance_transform_edt(water_mask > 127)
    metres_per_px = (EARTH_CIRCUMFERENCE_M / w) * np.cos(np.radians(lat_row))
    return dist_px * metres_per_px[:, None]


def render_preview(size=(2048, 1024), look='stylized'):
    h = np.asarray(Image.open(INPUTS + TOPOGRAPHY).resize(size, Image.LANCZOS)).astype(np.float32)
    m = np.asarray(Image.open(INPUTS + LANDOCEAN).resize(size, Image.LANCZOS)).astype(np.float32)
    lat_row = np.linspace(90, -90, size[1])
    lat = lat_row[:, None] * np.ones((1, size[0]))
    coast_m = coast_distance_metres_preview(m, lat_row, size[0])
    col = albedo(h, m, lat, coast_m, look=look)

    hs = ndi.gaussian_filter(h * 25.0, 1.2)
    gy, gx = np.gradient(hs)
    shade = np.clip(0.78 + (-gx * 0.7 + gy * 0.7) / 9000.0, 0.55, 1.15)
    shade = np.where(m > 127, 1.0, shade)
    return np.clip(col * shade[..., None], 0, 255).astype(np.uint8)


def main():
    t0 = time.time()
    for look in ('stylized', 'clean_cel'):
        img = render_preview(look=look)
        out = IMG + f'stylized_preview_{look}.png'
        Image.fromarray(img).save(out)
        print(f'{out} saved')
    print(f'{round(time.time() - t0, 1)} s')
    print('Defects fixed: 1 (ice by lat+elevation), 2 (coastal band in real metres),')
    print('3 (latitude+aridity snow line), 4 (desert weight/belt). Defect 5 (biome map)')
    print('is NOT implemented: it needs a public-domain colour source this sandbox')
    print('cannot fetch, and plan §17 decision 3 (texture licence) is still open.')


if __name__ == '__main__':
    main()
