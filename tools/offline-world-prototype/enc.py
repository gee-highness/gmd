"""Lossless WebP 256-px tile sizes at z6 for height and water mask (uniform tiles skipped = deduplicated in PMTiles)."""
import numpy as np, io, time
from PIL import Image
from common import EXP
def sizes(npy, label, fmt, tile=256, **kw):
    a = np.load(npy, mmap_mode='r'); W = a.shape[0]; n = W // tile
    tot = 0; uni = 0; cnt = 0
    for ty in range(n):
        strip = np.asarray(a[ty * tile:(ty + 1) * tile])
        for tx in range(n):
            t = strip[:, tx * tile:(tx + 1) * tile]
            if t.min() == t.max(): uni += 1; continue
            bio = io.BytesIO(); Image.fromarray(t).save(bio, fmt, **kw); tot += bio.tell(); cnt += 1
    print(f'{label}: {tot / 1e6:.1f} MB in {cnt} tiles (+{uni} uniform skipped of {n * n})')
t = time.time()
sizes(EXP + 'h_z6.npy', 'height z6 WebP lossless 256', 'WEBP', lossless=True, quality=100, method=4)
sizes(EXP + 'm_z6.npy', 'mask z6 WebP lossless 256', 'WEBP', lossless=True, quality=100, method=4)
print(round(time.time() - t), 's')
