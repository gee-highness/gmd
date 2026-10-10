"""Reproject equirectangular height and water rasters to Web Mercator z6 (16384x16384), chunked to fit in 3 GB RAM."""
import numpy as np, math, time
from PIL import Image
from common import INPUTS, EXP
Image.MAX_IMAGE_PIXELS = None
Z = 6; W = 256 * 2 ** Z
def merc(path, W, out):
    im = Image.open(path).convert('L')
    s = np.asarray(im.resize((W, im.height), Image.BILINEAR)); del im
    H = s.shape[0]
    res = np.lib.format.open_memmap(out, mode='w+', dtype=np.uint8, shape=(W, W))
    for y0 in range(0, W, 512):
        ys = np.arange(y0, min(W, y0 + 512))
        lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * (ys + 0.5) / W))))
        r = np.clip((90 - lat) / 180 * H - 0.5, 0, H - 1)
        i0 = np.floor(r).astype(int); i1 = np.minimum(i0 + 1, H - 1); f = (r - i0)[:, None].astype(np.float32)
        blk = s[i0].astype(np.float32) * (1 - f) + s[i1].astype(np.float32) * f
        res[y0:y0 + len(ys)] = np.clip(np.rint(blk), 0, 255).astype(np.uint8)
    res.flush()
t = time.time()
merc(INPUTS + 'topography_21K.png', W, EXP + 'h_z6.npy'); print('height', round(time.time() - t, 1), 's')
merc(INPUTS + 'earth_landocean_16K.png', W, EXP + 'm_z6.npy'); print('mask', round(time.time() - t, 1), 's')
