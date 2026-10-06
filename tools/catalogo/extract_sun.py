#!/usr/bin/env python3
"""Contorno de la mica usando el render de SOL (mica gris) + el render óptico del mismo modelo.
La mica es la zona que en el óptico es clara y en el de sol es gris neutra y más oscura."""
import json, sys, os, argparse
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(__file__))
import extract as ex
MODE = os.environ.get('SUNMODE', 'solo')

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('opt'); ap.add_argument('sun'); ap.add_argument('--out', default='qa_sun')
    a = ap.parse_args()
    O = np.asarray(Image.open(a.opt).convert('RGB')).astype(np.float32) / 255
    S = np.asarray(Image.open(a.sun).convert('RGB')).astype(np.float32) / 255
    if O.shape != S.shape:
        S = np.asarray(Image.open(a.sun).convert('RGB').resize((O.shape[1], O.shape[0]))).astype(np.float32) / 255
    H, W = O.shape[:2]
    lum = lambda X: 0.2126 * X[..., 0] + 0.7152 * X[..., 1] + 0.0722 * X[..., 2]
    Lo, Ls = lum(O), lum(S)
    sat = (S.max(-1) - S.min(-1)) / np.maximum(S.max(-1), 1e-3)
    # Mica de sol: gris neutro de brillo medio; cortamos por bordes fuertes para separarla del aro
    g = np.hypot(ndi.sobel(ndi.gaussian_filter(Ls, 1.0), 1), ndi.sobel(ndi.gaussian_filter(Ls, 1.0), 0))
    m = (sat < 0.10) & (Ls > 0.07) & (Ls < 0.82) & (g < 0.35)
    if MODE == 'diff':
        m = (Lo - Ls > 0.18) & (sat < 0.12) & (Lo > 0.80)
    m = ndi.binary_opening(m, iterations=3)
    m = ndi.binary_closing(m, iterations=4)
    lab, n = ndi.label(m)
    res = {}
    for side, (x0, x1) in {'L': (0, W // 2), 'R': (W // 2, W)}.items():
        best, bi = 0, None
        for i in range(1, n + 1):
            comp = lab == i
            ar = comp.sum()
            if ar < 3000: continue
            cx = ndi.center_of_mass(comp)[1]
            if x0 <= cx < x1 and ar > best: best, bi = ar, i
        if bi is None:
            print(json.dumps(dict(image=os.path.basename(a.sun), method='sun', error='no lens'))); return
        sel = ndi.binary_fill_holes(lab == bi)
        ys, xs = np.nonzero(sel)
        cx, cy = xs.mean(), ys.mean()
        pts = ex.polygon_from_mask(sel, cx, cy)
        pts = ex.smooth_dents(pts, cx, cy)
        res[side] = pts
    pl, pr = res['L'], res['R']
    sym = ex.iou_mirror(pl, pr, W)
    bl = dict(x0=pl[:, 0].min(), x1=pl[:, 0].max(), y0=pl[:, 1].min(), y1=pl[:, 1].max())
    br = dict(x0=pr[:, 0].min())
    out = dict(image=os.path.basename(a.sun), method='sun', symmetry_iou=round(sym, 4),
               lens_px=dict(w=float(bl['x1'] - bl['x0']), h=float(bl['y1'] - bl['y0'])), dbl_px=float(br['x0'] - bl['x1']),
               left_px=np.round(pl, 2).tolist(), right_px=np.round(pr, 2).tolist())
    os.makedirs(a.out, exist_ok=True)
    base = os.path.splitext(os.path.basename(a.opt))[0]
    json.dump(out, open(os.path.join(a.out, base + '.json'), 'w'))
    qa = Image.open(a.opt).convert('RGB'); d = ImageDraw.Draw(qa)
    for p in (pl, pr): d.line([tuple(q) for q in p] + [tuple(p[0])], fill=(0, 120, 255), width=3)
    qa.save(os.path.join(a.out, base + '_qa.png'))
    print(json.dumps({k: out[k] for k in ('image', 'method', 'symmetry_iou', 'lens_px', 'dbl_px')}))

if __name__ == '__main__':
    main()
