"""Shared paths for the prototype scripts.
Inputs default to ../../../original-uploads (the folder next to gmd-main in the delivery zip).
Override with:  WORLD_INPUTS=/path/to/textures python3 script.py
"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
INPUTS = os.environ.get('WORLD_INPUTS', os.path.join(HERE, '..', '..', '..', 'original-uploads')) + '/'
EXP = os.path.join(HERE, 'exp') + '/'      # large intermediate rasters (not shipped)
IMG = os.path.join(HERE, 'images') + '/'   # previews
os.makedirs(EXP, exist_ok=True); os.makedirs(IMG, exist_ok=True)
