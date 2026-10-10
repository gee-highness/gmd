import numpy as np, io, math, time, sys
pass
from PIL import Image
from scipy import ndimage as ndi
from common import EXP, HERE
import os
exec(open(os.path.join(HERE,'style.py')).read().split("# --- preview")[0])
h=np.load(EXP+'h_z6.npy',mmap_mode='r'); m=np.load(EXP+'m_z6.npy',mmap_mode='r'); W=h.shape[0]
# coarse EDT for coast fade (4096 grid), upsample per strip
mc=np.asarray(m[::4,::4]); dist=ndi.distance_transform_edt(mc>127)
t0=time.time(); tot={}; cnt=0; uni=0
for q in (70,80):
    tot[q]=0
for ty in range(W//256):
    y0=ty*256; ys=np.arange(y0,y0+256)
    lat=np.degrees(np.arctan(np.sinh(math.pi*(1-2*(ys+0.5)/W))))[:,None]*np.ones((1,W))
    hh=np.asarray(h[y0:y0+256]).astype(np.float32); mm=np.asarray(m[y0:y0+256]).astype(np.float32)
    dstrip=ndi.zoom(dist[y0//4:(y0+256)//4],4,order=1)
    col=albedo(hh,mm,lat,np.clip(dstrip/45.0*0.25,0,1))
    img=np.clip(col,0,255).astype(np.uint8)
    for tx in range(W//256):
        t=img[:,tx*256:(tx+1)*256]
        if (t==t[0,0]).all(): uni+=1; continue
        cnt+=1
        for q in (70,80):
            bio=io.BytesIO(); Image.fromarray(t).save(bio,'WEBP',quality=q,method=4); tot[q]+=bio.tell()
print('albedo z6 tiles',cnt,'uniform',uni,{k:round(v/1e6,1) for k,v in tot.items()},'MB',round(time.time()-t0),'s')
