#!/usr/bin/env python3
"""Extrae el contorno de la mica de un render frontal (fondo blanco) de catálogo.

Uso: extract.py imagen.png [--out dir]
Salida: <out>/<nombre>.json  (contorno de la lente del lado izquierdo de la imagen = lente DERECHA
del usuario, en px, más métricas de calidad) y <out>/<nombre>_qa.png (overlay para revisar).

Métodos:
  - "hole": aro visible → la mica es el hueco cerrado dentro del armazón (lo más preciso).
  - "edge": sin aro / tres piezas → se ajusta una superelipse al canto fino de la mica.
"""
import json, sys, os, argparse
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi, optimize as opt

N = 160
EDGE_T = 0.55


def load(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.float32) / 255.0
    return im, a


def frame_mask(a):
    """Píxeles que NO son fondo/mica: armazón opaco o con color."""
    L = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    g = np.hypot(ndi.sobel(L, 1), ndi.sobel(L, 0))
    m = (L < 0.80) | ((sat > 0.18) & (L < 0.93)) | (g > EDGE_T)
    m = ndi.binary_closing(m, iterations=2)
    return m, L, g


def fill_dents(pts, cx, cy, max_span_deg=110, min_dev=0.02):
    """Rellena muescas (varillas vistas a través de la mica) usando la envolvente convexa, pero SOLO en
    tramos cortos y profundos: así no se deforman lentes poligonales ni formas cóncavas amplias."""
    from scipy.spatial import ConvexHull
    n = len(pts)
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    r = np.hypot(pts[:, 0] - cx, pts[:, 1] - cy)
    hull = pts[ConvexHull(pts).vertices]
    # radio de la envolvente en cada ángulo (intersección rayo-polígono)
    rh = np.empty(n)
    for i, t in enumerate(th):
        d = np.array([np.cos(t), -np.sin(t)]); best = 0
        for j in range(len(hull)):
            a, b = hull[j] - [cx, cy], hull[(j + 1) % len(hull)] - [cx, cy]
            M = np.array([d, a - b]).T
            if abs(np.linalg.det(M)) < 1e-9: continue
            s_, u = np.linalg.solve(M, a)
            if s_ > 0 and 0 <= u <= 1: best = max(best, s_)
        rh[i] = best or r[i]
    dev = (rh - r) / np.maximum(rh, 1)
    bad = dev > min_dev
    out = r.copy()
    if bad.any() and not bad.all():
        k0 = int(np.argmin(bad))  # empezamos en un punto bueno para recorrer tramos circulares
        idx = [(k0 + k) % n for k in range(n)]
        span = []
        for k in idx + [None]:
            if k is not None and bad[k]: span.append(k); continue
            if span and len(span) * 360 / n <= max_span_deg:
                out[span] = rh[span]
            span = []
    return np.column_stack([cx + out * np.cos(th), cy - out * np.sin(th)])


def polygon_rim(fm, hole_pts, cx, cy, stop, gap_merge=5):
    """Borde interior del ARO: por cada rayo, el inicio de la ÚLTIMA franja de armazón antes de salir
    (así las varillas/plaquetas que se ven a través de la mica, que son franjas anteriores, no recortan la mica).
    Nunca más adentro que el hueco detectado (el hueco es seguro que es mica)."""
    H, W = fm.shape
    n = len(hole_pts)
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    r_hole = np.hypot(hole_pts[:, 0] - cx, hole_pts[:, 1] - cy)
    out = r_hole.copy()
    rs = np.arange(0, max(H, W), 0.5)
    for i, t in enumerate(th):
        xs = cx + rs * np.cos(t); ys = cy - rs * np.sin(t)
        ok = (xs >= 0) & (xs < W - 1) & (ys >= 0) & (ys < H - 1)
        v = ndi.map_coordinates(fm.astype(np.float32), [ys[ok], xs[ok]], order=1) > 0.5
        rr = rs[ok]
        # cortamos el rayo al llegar al fondo exterior o a la otra mica
        st = ndi.map_coordinates(stop.astype(np.float32), [ys[ok], xs[ok]], order=0) > 0.5
        st &= rr > r_hole[i]
        if st.any():
            cut = int(np.argmax(st)); v = v[:cut]; rr = rr[:cut]
        runs, k = [], 0
        while k < len(v):
            if v[k]:
                j = k
                while j < len(v) and v[j]: j += 1
                runs.append([rr[k], rr[j - 1]]); k = j
            else: k += 1
        merged = []
        for a, b in runs:
            if merged and a - merged[-1][1] <= gap_merge: merged[-1][1] = b
            else: merged.append([a, b])
        # franjas que empiezan dentro del hueco no cuentan (no pueden ser el aro)
        merged = [m for m in merged if m[1] > r_hole[i] - 1]
        if merged:
            out[i] = min(max(r_hole[i], merged[-1][0]), r_hole[i] * 1.6)
    # suavizado robusto (mediana circular de 5)
    ext = np.concatenate([out[-2:], out, out[:2]])
    out = np.array([np.median(ext[k:k + 5]) for k in range(n)])
    return np.column_stack([cx + out * np.cos(th), cy - out * np.sin(th)])


def smooth_dents(pts, cx, cy, order=10, thr=0.015):
    """Rellena muescas hacia adentro con una curva suave: ajuste de Fourier robusto y asimétrico
    (los puntos que quedan muy ADENTRO de la curva se ignoran: son varillas/plaquetas, no el aro)."""
    n = len(pts)
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    r = np.hypot(pts[:, 0] - cx, pts[:, 1] - cy)
    A = np.column_stack([np.ones(n)] + [f(k * th) for k in range(1, order + 1) for f in (np.cos, np.sin)])
    w = np.ones(n)
    for _ in range(12):
        coef, *_ = np.linalg.lstsq(A * w[:, None], r * w, rcond=None)
        fit = A @ coef
        res = (r - fit) / fit
        w = np.where(res < -thr, 0.05, 1.0)
    fit = A @ coef
    out = np.where((fit - r) / fit > thr, fit, r)
    return np.column_stack([cx + out * np.cos(th), cy - out * np.sin(th)])


def polygon_from_mask(mask, cx, cy):
    """Radios desde (cx, cy) hasta el borde exterior de la máscara (N rayos)."""
    th = np.linspace(0, 2 * np.pi, N, endpoint=False)
    H, W = mask.shape
    rs = np.arange(1, max(H, W), 0.5)
    out = []
    for t in th:
        xs = cx + rs * np.cos(t); ys = cy - rs * np.sin(t)
        ok = (xs >= 0) & (xs < W - 1) & (ys >= 0) & (ys < H - 1)
        v = ndi.map_coordinates(mask.astype(np.float32), [ys[ok], xs[ok]], order=1)
        inside = np.where(v > 0.5)[0]
        r = rs[ok][inside[-1]] if len(inside) else 0
        out.append([cx + r * np.cos(t), cy - r * np.sin(t)])
    return np.array(out)


def by_holes(a, fm):
    H, W = fm.shape
    bg = ndi.binary_fill_holes(fm) & ~fm        # huecos encerrados por el armazón
    lab, n = ndi.label(bg)
    if n == 0:
        return None
    areas = ndi.sum(bg, lab, range(1, n + 1))
    res = {}
    for side, (x0, x1) in {'L': (0, W // 2), 'R': (W // 2, W)}.items():
        # Solo el hueco más grande de cada lado (evita sumar el hueco del doble puente en aviadores);
        # las muescas que dejan las varillas se corrigen después con la envolvente convexa.
        best, bi = 0, None
        for i, ar in enumerate(areas, 1):
            if ar < 3000:
                continue
            cxm = ndi.center_of_mass(lab == i)[1]
            if x0 <= cxm < x1 and ar > best:
                best, bi = ar, i
        if bi is None:
            return None
        sel = ndi.binary_fill_holes(ndi.binary_closing(lab == bi, structure=np.ones((3, 3)), iterations=3))
        res.setdefault('_raw', {})[side] = lab == bi
        ys, xs = np.nonzero(sel)
        res[side] = dict(mask=sel, cx=float(xs.mean()), cy=float(ys.mean()), area=int(sel.sum()))
    return res


def superellipse(p, th):
    cx, cy, ax, by, n = p
    c, s = np.cos(th), np.sin(th)
    return cx + ax * np.sign(c) * np.abs(c) ** (2 / n), cy - by * np.sign(s) * np.abs(s) ** (2 / n)


def by_edges(L, W, A=None, B=None, pxmm=6.75):
    g = np.hypot(ndi.sobel(ndi.gaussian_filter(L, 0.8), 1), ndi.sobel(ndi.gaussian_filter(L, 0.8), 0))
    gb = ndi.gaussian_filter(np.minimum(g, 0.25), 1.5)
    th = np.linspace(0, 2 * np.pi, 400, endpoint=False)
    res = {}
    for side, cx0 in {'L': W * 0.29, 'R': W * 0.71}.items():
        if A and B:
            # Medidas de catálogo conocidas: solo buscamos centro, escala fina y cuadratura
            a0, b0 = A / 2 * pxmm, B / 2 * pxmm
            def g(q):
                cx, cy, sc, n = q
                if not (0.84 < sc < 1.16 and 1.6 < n < 7 and abs(cx - cx0) < 70 and 240 < cy < 390): return 1e9
                xs, ys = superellipse([cx, cy, a0 * sc, b0 * sc, n], th)
                return -ndi.map_coordinates(gb, [ys, xs], order=1).mean()
            best = None
            for cy0 in (290, 315, 340):
                for n0 in (2.2, 3.2, 4.5):
                    r = opt.minimize(g, [cx0, cy0, 1.0, n0], method='Nelder-Mead', options=dict(maxiter=2000, xatol=0.05, fatol=1e-6))
                    if best is None or r.fun < best.fun: best = r
            cx, cy, sc, n = best.x
            params = [cx, cy, a0 * sc, b0 * sc, n]
        else:
            def f(p):
                if p[4] < 1.5 or p[4] > 8 or p[2] < 80 or p[3] < 0.5 * p[2] or p[3] > 1.2 * p[2]:
                    return 1e9
                xs, ys = superellipse(p, th)
                return -ndi.map_coordinates(gb, [ys, xs], order=1).mean()
            best = None
            for a0 in (150, 175, 195):
                for b0f in (0.75, 0.95):
                    for n0 in (2.2, 3.5):
                        r = opt.minimize(f, [cx0, 312, a0, a0 * b0f, n0], method='Nelder-Mead',
                                         options=dict(maxiter=2500, xatol=0.05, fatol=1e-6))
                        if best is None or r.fun < best.fun:
                            best = r
            params = list(best.x)
        xs, ys = superellipse(params, np.linspace(0, 2 * np.pi, N, endpoint=False))
        res[side] = dict(pts=np.column_stack([xs, ys]), params=[float(x) for x in params], score=float(-best.fun))
    return res


def iou_mirror(pl, pr, W):
    """Simetría: IoU entre la lente izquierda y la derecha espejeada."""
    from PIL import Image as I, ImageDraw as D
    H = 700
    a = I.new('L', (W, H)); b = I.new('L', (W, H))
    D.Draw(a).polygon([tuple(p) for p in pl], fill=1)
    D.Draw(b).polygon([(W - 1 - x, y) for x, y in pr], fill=1)
    a, b = np.asarray(a, bool), np.asarray(b, bool)
    return float((a & b).sum() / max(1, (a | b).sum()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('img'); ap.add_argument('--out', default='.'); ap.add_argument('--A', type=float); ap.add_argument('--B', type=float); ap.add_argument('--DBL', type=float)
    args = ap.parse_args()
    im, a = load(args.img)
    H, W = a.shape[:2]
    fm, L, g = frame_mask(a)
    global FM_USED
    FM_USED = fm
    holes = by_holes(a, fm)
    if not holes:
        # aros muy finos o claros (nylon, alambre): umbral de borde más bajo para cerrar el aro
        global EDGE_T
        EDGE_T = 0.30
        fm2, _, _ = frame_mask(a)
        holes = by_holes(a, fm2)
        if holes: FM_USED = fm2
    if holes and args.A and args.B:
        # ¿el hueco tiene el tamaño esperado según el catálogo? (≈6.75 px/mm en estos renders)
        ys, xs = np.nonzero(holes['L']['mask'])
        w, h = xs.max() - xs.min(), ys.max() - ys.min()
        # proporción alto/ancho del hueco vs. la del catálogo, y tamaño razonable (la escala del render varía ±10 %)
        ar = (h / w) / (args.B / args.A)
        pxmm = w / args.A
        if not (0.6 < ar < 1.6 and 3.0 < pxmm < 10.5):
            holes = None
    method, conf = None, 0.0
    if holes:
        fmr = FM_USED
        outside = ~fmr & ~ndi.binary_fill_holes(fmr)
        def lens(side):
            h = holes[side]
            other = holes['_raw']['R' if side == 'L' else 'L']
            ph = polygon_from_mask(h['mask'], h['cx'], h['cy'])
            return smooth_dents(polygon_rim(fmr, ph, h['cx'], h['cy'], outside | other), h['cx'], h['cy'])
        pl, pr = lens('L'), lens('R')
        method = 'hole'
    else:
        # escala del render: ancho total del frente ≈ 2·A + DBL + ~10 mm de terminales
        pxmm = 6.75
        if args.A and args.DBL:
            cols = np.nonzero(fm[int(H * 0.25):int(H * 0.75)].any(0))[0]
            if len(cols): pxmm = (cols.max() - cols.min()) / (2 * args.A + args.DBL + 10)
        cands = sorted({round(pxmm, 3), 6.75, 4.4}) if args.A else [6.75]
        e = max((by_edges(L, W, args.A, args.B, p) for p in cands), key=lambda r: r['L']['score'] + r['R']['score'])
        pl, pr = e['L']['pts'], e['R']['pts']
        method = 'edge'
    sym = iou_mirror(pl, pr, W)
    conf = sym
    # bbox / caja
    def box(p):
        return dict(x0=float(p[:, 0].min()), x1=float(p[:, 0].max()), y0=float(p[:, 1].min()), y1=float(p[:, 1].max()))
    bl, br = box(pl), box(pr)
    dbl_px = br['x0'] - bl['x1']
    out = dict(
        image=os.path.basename(args.img), method=method, symmetry_iou=round(sym, 4),
        lens_px=dict(w=bl['x1'] - bl['x0'], h=bl['y1'] - bl['y0']), dbl_px=dbl_px,
        # Contorno de la lente del lado izquierdo de la imagen (= derecha del usuario), en px de imagen
        left_px=np.round(pl, 2).tolist(), right_px=np.round(pr, 2).tolist(),
    )
    base = os.path.splitext(os.path.basename(args.img))[0]
    os.makedirs(args.out, exist_ok=True)
    json.dump(out, open(os.path.join(args.out, base + '.json'), 'w'))
    qa = im.copy(); d = ImageDraw.Draw(qa)
    for p in (pl, pr):
        d.line([tuple(q) for q in p] + [tuple(p[0])], fill=(255, 0, 40), width=3)
    d.text((10, 10), f"{method} sym={sym:.3f} w={out['lens_px']['w']:.0f} h={out['lens_px']['h']:.0f} dbl={dbl_px:.0f}", fill=(0, 0, 0))
    qa.save(os.path.join(args.out, base + '_qa.png'))
    print(json.dumps({k: out[k] for k in ('image', 'method', 'symmetry_iou', 'lens_px', 'dbl_px')}))


if __name__ == '__main__':
    main()
