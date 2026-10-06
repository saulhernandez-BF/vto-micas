#!/usr/bin/env python3
"""Contorno exacto de la mica comparando el render óptico con el de SOL del MISMO color de armazón.
Todo lo que está detrás de la mica (incluidas varillas y plaquetas) se oscurece por el tinte;
el armazón y el fondo quedan idénticos. Así la mica sale completa, sin muescas."""
import json, sys, os, argparse
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import extract as ex

def lens_mask(O, S):
    r = (S.mean(-1) + 0.01) / (O.mean(-1) + 0.01)
    bright = O.max(-1) > 0.06
    m = (r < 0.80) & bright
    # píxeles casi negros en ambos (varilla negra detrás de la mica): se resuelven con relleno
    m = ndi.binary_opening(m, iterations=2)
    return m, r

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('opt'); ap.add_argument('sun'); ap.add_argument('--out', default='qa_pair')
    a = ap.parse_args()
    Oi = Image.open(a.opt).convert('RGB'); Si = Image.open(a.sun).convert('RGB')
    if Si.size != Oi.size: Si = Si.resize(Oi.size)
    O = np.asarray(Oi).astype(np.float32) / 255; S = np.asarray(Si).astype(np.float32) / 255
    H, W = O.shape[:2]
    m, r = lens_mask(O, S)
    lab, n = ndi.label(m)
    res = {}
    for side, (x0, x1) in {'L': (0, W // 2), 'R': (W // 2, W)}.items():
        best, bi = 0, None
        for i in range(1, n + 1):
            comp = lab == i; ar = comp.sum()
            if ar < 3000: continue
            if x0 <= ndi.center_of_mass(comp)[1] < x1 and ar > best: best, bi = ar, i
        if bi is None:
            print(json.dumps(dict(image=os.path.basename(a.opt), method='pair', error='no lens'))); return
        sel = ndi.binary_fill_holes(ndi.binary_closing(lab == bi, iterations=4))
        ys, xs = np.nonzero(sel); cx, cy = xs.mean(), ys.mean()
        pts = ex.polygon_from_mask(sel, cx, cy)
        res[side] = ex.smooth_dents(pts, cx, cy, order=12, thr=0.02)
    pl, pr = res['L'], res['R']
    sym = ex.iou_mirror(pl, pr, W)
    out = dict(image=os.path.basename(a.opt), method='pair', symmetry_iou=round(sym, 4),
               lens_px=dict(w=float(np.ptp(pl[:, 0])), h=float(np.ptp(pl[:, 1]))), dbl_px=float(pr[:, 0].min() - pl[:, 0].max()),
               left_px=np.round(pl, 2).tolist(), right_px=np.round(pr, 2).tolist())
    os.makedirs(a.out, exist_ok=True)
    base = os.path.splitext(os.path.basename(a.opt))[0]
    json.dump(out, open(os.path.join(a.out, base + '.json'), 'w'))
    qa = Oi.copy(); d = ImageDraw.Draw(qa)
    for p in (pl, pr): d.line([tuple(q) for q in p] + [tuple(p[0])], fill=(0, 170, 60), width=3)
    qa.save(os.path.join(a.out, base + '_qa.png'))
    print(json.dumps({k: out[k] for k in ('image', 'method', 'symmetry_iou', 'lens_px', 'dbl_px')}))

if __name__ == '__main__': main()
