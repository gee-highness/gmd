"""Finding F1/F2/F3: metres per height level, from known elevations."""
import numpy as np
from PIL import Image
from common import INPUTS
Image.MAX_IMAGE_PIXELS = None
a = np.asarray(Image.open(INPUTS + 'topography_21K.png'))
H, W = a.shape
def at(lat, lon, r=3):
    y = int((90 - lat) / 180 * H); x = int((lon + 180) / 360 * W)
    return int(np.median(a[y - r:y + r + 1, x - r:x + r + 1]))
pts = {'Everest 8849': (27.99, 86.93), 'Lhasa 3650': (29.65, 91.1), 'S Pole 2835': (-89.9, 0), 'Greenland ctr 3200': (72.5, -38),
       'Denver 1600': (39.74, -104.99), 'Mt Whitney area': (36.58, -118.29), 'Ethiopian hl Addis 2355': (9.03, 38.74),
       'Quito 2850': (-0.18, -78.47), 'Dead Sea -430': (31.5, 35.5), 'Kilimanjaro 5895': (-3.07, 37.35),
       'Amazon Manaus 50': (-3.1, -60), 'Sahara Tamanrasset 1400': (22.8, 5.5)}
for k, (la, lo) in pts.items(): print(f'{k:28s} level {at(la, lo)}')
