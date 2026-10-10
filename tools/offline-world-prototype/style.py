import numpy as np, io, math, time
from PIL import Image
from scipy import ndimage as ndi
from common import INPUTS, IMG
Image.MAX_IMAGE_PIXELS=None
def lerp(stops,x):
    xs=np.array([s[0] for s in stops],float); out=np.zeros(x.shape+(3,),np.float32)
    for c in range(3): out[...,c]=np.interp(x,xs,[s[1][c] for s in stops])
    return out
LAND=[(0,(86,140,70)),(0.12,(120,160,78)),(0.30,(176,166,96)),(0.5,(150,120,92)),(0.75,(128,118,112)),(1.0,(236,238,242))]
def albedo(h,m,lat,coast):  # h 0..255 (25 m/level), m 0=land..255=water, lat deg, coast = distance-to-land in px-ish 0..1
    elev=h/255.0
    water=m>127
    # biome wetness proxy from latitude: wet tropics, dry subtropics (15-35), temperate, boreal, tundra
    al=np.abs(lat)
    dry=np.exp(-((al-26)/9.0)**2)       # subtropical desert belt
    wet=np.exp(-(al/9.0)**2)
    base=lerp(LAND,np.clip(elev*1.0,0,1))
    desert=np.array([214,186,120],np.float32); jungle=np.array([52,112,64],np.float32); boreal=np.array([70,104,86],np.float32); tundra=np.array([160,160,140],np.float32)
    low=(1-np.clip(elev*3,0,1))[...,None]
    col=base.copy()
    col=col*(1-low*dry[...,None]*0.75)+low*dry[...,None]*0.75*desert
    col=col*(1-low*wet[...,None]*0.7)+low*wet[...,None]*0.7*jungle
    b=np.clip((al-48)/12,0,1)*np.clip((70-al)/10,0,1); col=col*(1-low*b[...,None]*0.7)+low*b[...,None]*0.7*boreal
    t=np.clip((al-64)/8,0,1); col=col*(1-t[...,None]*0.8)+t[...,None]*0.8*tundra
    ice=np.clip((al-72)/6,0,1)|0 if False else np.clip((al-72)/6,0,1)
    snow=np.clip((elev-0.55)/0.15,0,1); ice=np.maximum(ice,snow)
    col=col*(1-ice[...,None])+ice[...,None]*np.array([238,242,248],np.float32)
    ocean=lerp([(0,(70,200,200)),(0.15,(30,140,190)),(0.5,(18,70,140)),(1,(10,30,90))],np.clip(coast,0,1))
    ice_sea=np.clip((al-76)/4,0,1); ocean=ocean*(1-ice_sea[...,None])+ice_sea[...,None]*np.array([226,234,244],np.float32)
    return np.where(water[...,None],ocean,col)
# --- preview, equirect 2048x1024 from the 21K + 16K sources
b=INPUTS
S=(2048,1024)
h=np.asarray(Image.open(b+'topography_21K.png').resize(S,Image.LANCZOS)).astype(np.float32)
m=np.asarray(Image.open(b+'earth_landocean_16K.png').resize(S,Image.LANCZOS)).astype(np.float32)
lat=np.linspace(90,-90,S[1])[:,None]*np.ones((1,S[0]))
dist=ndi.distance_transform_edt(m>127)            # px from land, for water pixels
coast=np.clip(dist/45.0,0,1)
col=albedo(h,m,lat,coast)
# hillshade (smoothed to hide 25 m terracing)
hs=ndi.gaussian_filter(h*25.0,1.2); gy,gx=np.gradient(hs)
shade=np.clip(0.78+(-gx*0.7+gy*0.7)/9000.0,0.55,1.15)
shade=np.where(m>127,1.0,shade)
img=np.clip(col*shade[...,None],0,255).astype(np.uint8)
Image.fromarray(img).save(IMG+'stylized_preview.png')
print('preview saved')
