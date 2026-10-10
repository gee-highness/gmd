"""Night-lights compressed sizes (grey WebP) at two resolutions."""
import numpy as np, io
from PIL import Image
from common import INPUTS
Image.MAX_IMAGE_PIXELS = None
g = Image.fromarray(np.asarray(Image.open(INPUTS + 'earth_nightlights_10K.tif'))[..., 0]).resize((8192, 4096), Image.LANCZOS)
for q in (60, 80):
    b = io.BytesIO(); g.save(b, 'WEBP', quality=q); print('nightlights 8192x4096 gray webp q', q, round(b.tell() / 1e6, 2), 'MB')
b = io.BytesIO(); g.resize((4096, 2048), Image.LANCZOS).save(b, 'WEBP', quality=80); print('4096x2048 q80', round(b.tell() / 1e6, 2), 'MB')
