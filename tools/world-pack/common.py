"""Shared paths and constants for the world-pack builder.

Inputs default to ../../../original-uploads (a folder next to the repo,
matching tools/offline-world-prototype's convention so both tools can
point at the same texture drop). Override with:

    WORLD_INPUTS=/path/to/textures python3 validate.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
INPUTS = os.environ.get('WORLD_INPUTS', os.path.join(HERE, '..', '..', '..', 'original-uploads')) + '/'
OUT = os.path.join(HERE, 'out') + '/'   # manifest fragments, packs (not shipped)
EXP = os.path.join(HERE, 'exp') + '/'   # large intermediate rasters (not shipped)
os.makedirs(OUT, exist_ok=True)
os.makedirs(EXP, exist_ok=True)

# Plan §1, §4 step 1.
TOPOGRAPHY = 'topography_21K.png'
LANDOCEAN = 'earth_landocean_16K.png'
NIGHTLIGHTS = 'earth_nightlights_10K.tif'
REDUNDANT = 'topography_10k.png'  # same map at half res, RGB with R=G=B; refused (plan §4 step 1)

EXPECTED = {
    TOPOGRAPHY: {'size': (21600, 10800), 'mode': 'L'},
    LANDOCEAN: {'size': (16200, 8100), 'mode': 'L'},
    NIGHTLIGHTS: {'size': (10800, 5400), 'mode': 'RGB'},
}

# Plan §4 step 1 / §6.1: antimeridian seam tolerance (measured F5: topo 0.34, mask 0.35, night 0.09).
SEAM_TOLERANCE_LEVELS = 1.0
