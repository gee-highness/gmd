# Measured results (run 2026-10-10)

Environment: 1 CPU, 3 GB RAM, Pillow 12.1.1 (WebP and AVIF), SciPy 1.17.1. Raw output of each script, unedited.

## inspect_inputs.py, calibrate_height.py, pyr.py
```
earth_nightlights_10K.tif (10800, 5400) RGB
  small stats: min 0 max 255 mean 1.0
topography_10k.png (10800, 5400) RGB
  small stats: min 0 max 241 mean 18.6
earth_landocean_16K.png (16200, 8100) L
  small stats: min 0 max 255 mean 169.2
topography_21K.png (21600, 10800) L
  small stats: min 0 max 237 mean 15.0
10k RGB identical channels: True
21K distinct levels: 256 max 255
21K frac==0 (ocean/sea level): 0.671
night R,G,B equal? True lit px >8: 0.0149
topo21 left/right edge mean abs diff: 0.34  vs neighbour col diff: 0.039
   top row std: 0.0  bottom row mean 110.5
landocean left/right edge mean abs diff: 0.349  vs neighbour col diff: 0.195
   top row std: 0.0  bottom row mean 0.0
night left/right edge mean abs diff: 0.085  vs neighbour col diff: 0.0
   top row std: 0.0  bottom row mean 0.0
hist top levels [(251, 152), (252, 119), (253, 124), (254, 138), (255, 329)]

Everest 8849                 level 250
Lhasa 3650                   level 147
S Pole 2835                  level 111
Greenland ctr 3200           level 128
Denver 1600                  level 64
Mt Whitney area              level 145
Ethiopian hl Addis 2355      level 96
Quito 2850                   level 112
Dead Sea -430                level 0
Kilimanjaro 5895             level 174
Amazon Manaus 50             level 1
Sahara Tamanrasset 1400      level 55

height 2.9 s
mask 4.9 s
```

## enc.py, style.py, colsize.py
```
height z6 WebP lossless 256: 12.8 MB in 2269 tiles (+1827 uniform skipped of 4096)
mask z6 WebP lossless 256: 8.7 MB in 1491 tiles (+2605 uniform skipped of 4096)
53 s
preview saved
albedo z6 tiles 2956 uniform 1140 {70: 3.0, 80: 3.9} MB 88 s

```

## night_size.py
```
nightlights 8192x4096 gray webp q 60 0.44 MB
nightlights 8192x4096 gray webp q 80 0.59 MB
4096x2048 q80 0.17 MB
```

## Reading the numbers

- Height scale is about 25 m per level (Denver 1600 m = 64, Lhasa 3650 m = 147, Quito 2850 m = 112, South Pole 2835 m = 111, Addis 2355 m = 96). Everest reads 250 and Kilimanjaro 174, so tall peaks are clipped and smoothed.
- Dead Sea (-430 m) reads 0: there is no bathymetry. 67.1% of the height map is exactly 0.
- topography_10k.png is grey stored as RGB (R = G = B on every pixel) and is the same map at half resolution: redundant.
- z6 lossless WebP tiles: height 12.8 MB, water mask 8.7 MB. Stylized albedo (first-pass palette) q80 3.9 MB. Night lights 0.59 MB at 8192 x 4096 q80.
- Lower zoom levels add about one third (geometric series; estimated, not measured). Whole planet is about 34 MB.
- The first-pass stylization in images/stylized_preview.png has known defects, listed in section 5 of docs/plan-offline-world.md.
- The large intermediate rasters (exp/*.npy, about 0.5 GB) are not shipped; run pyr.py to regenerate them in seconds.
