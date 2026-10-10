"""Findings F1/F5/F6/redundancy: sizes, modes, level counts, channel equality, seam differences, lit fraction."""
import numpy as np
from PIL import Image
from common import INPUTS, IMG
Image.MAX_IMAGE_PIXELS = None
for f in ['earth_nightlights_10K.tif', 'topography_10k.png', 'earth_landocean_16K.png', 'topography_21K.png']:
    im = Image.open(INPUTS + f)
    print(f, im.size, im.mode)
    a = np.asarray(im.resize((1024, 512)))
    print('  small stats: min', a.min(), 'max', a.max(), 'mean', round(float(a.mean()), 1))
    im.convert('RGB').resize((1024, 512), Image.LANCZOS).save(IMG + 'preview_' + f.split('.')[0] + '.jpg', quality=85)
t10 = np.asarray(Image.open(INPUTS + 'topography_10k.png'))
print('10k RGB identical channels:', bool((t10[..., 0] == t10[..., 1]).all() and (t10[..., 1] == t10[..., 2]).all()))
t21 = np.asarray(Image.open(INPUTS + 'topography_21K.png'))
lv = np.unique(t21); print('21K distinct levels:', len(lv), 'max', lv.max())
print('21K frac==0 (ocean/sea level):', round(float((t21 == 0).mean()), 3))
night = np.asarray(Image.open(INPUTS + 'earth_nightlights_10K.tif'))
print('night R,G,B equal?', bool((night[..., 0] == night[..., 1]).all() and (night[..., 1] == night[..., 2]).all()),
      'lit px >8:', round(float((night[..., 0] > 8).mean()), 4))
for name, a in [('topo21', t21), ('landocean', np.asarray(Image.open(INPUTS + 'earth_landocean_16K.png'))), ('night', night)]:
    L = a[:, 0].astype(float); R = a[:, -1].astype(float)
    print(name, 'left/right edge mean abs diff:', round(float(np.abs(L - R).mean()), 3),
          ' vs neighbour col diff:', round(float(np.abs(a[:, 0].astype(float) - a[:, 1].astype(float)).mean()), 3))
    print('   top row std:', round(float(a[0].astype(float).std()), 3), ' bottom row mean', round(float(a[-1].mean()), 2))
print('hist top levels', [(int(v), int((t21 == v).sum())) for v in lv[-5:]])
