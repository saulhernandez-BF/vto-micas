"""Contorno exacto de la mica desde los planos CAD de fábrica (PDF vectorial, escala 1:1 en mm).

Método: re-dibujamos sólo los trazos NEGROS (contornos del armazón; las cotas son de color),
buscamos los huecos blancos cerrados con tamaño de mica, emparejamos los dos de la vista de frente
y tomamos el de la izquierda de la imagen (= lente derecha del usuario). Un cierre morfológico tapa
plaquetas/tornillos que invaden la mica sin perder concavidades suaves (cat-eye).
Salida: JSON por plano con A/B/DBL medidos, contorno en mm (+x sien, +y arriba) y PNG de control.
Uso: python3 extract_planos.py <carpeta_planos> <salida_json> <carpeta_qa>
"""
import sys, os, re, json, math
import numpy as np, cv2, pymupdf

PXMM = 10.0                 # resolución del raster
PT2MM = 25.4 / 72.0

def parse_name(fn):
    base = os.path.splitext(fn)[0].strip()
    m = re.match(r'^(.*?)\s*\(([A-Z]+)\)\s*$', base)
    return (m.group(1).strip(), m.group(2)) if m else (base, '')

def dark(c):
    return c is not None and len(c) >= 3 and max(c[:3]) < 0.35

def raster_black(page):
    W, H = page.rect.width * PT2MM, page.rect.height * PT2MM
    img = np.zeros((int(H * PXMM) + 2, int(W * PXMM) + 2), np.uint8)
    k = PT2MM * PXMM
    for d in page.get_drawings():
        if 's' not in d['type'] or not dark(d.get('color')): continue
        for it in d['items']:
            op = it[0]
            if op == 'l': pts = [it[1], it[2]]
            elif op == 'c':
                p0, p1, p2, p3 = it[1:5]
                pts = [p0 * (1 - t) ** 3 + p1 * 3 * t * (1 - t) ** 2 + p2 * 3 * t * t * (1 - t) + p3 * t ** 3 for t in np.linspace(0, 1, 12)]
            elif op == 're': r = it[1]; pts = [r.tl, r.tr, r.br, r.bl, r.tl]
            elif op == 'qu': q = it[1]; pts = [q.ul, q.ur, q.lr, q.ll, q.ul]
            else: continue
            P = np.array([[p.x * k, p.y * k] for p in pts], np.int32)
            cv2.polylines(img, [P], False, 255, 1, cv2.LINE_8)
    return cv2.dilate(img, np.ones((2, 2), np.uint8))   # cierra micro-huecos entre segmentos

def holes(img):
    free = (img == 0).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(free, 4)
    out = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        wm, hm = w / PXMM, h / PXMM
        if not (22 <= wm <= 80 and 15 <= hm <= 70): continue
        if x == 0 or y == 0 or x + w >= img.shape[1] - 1 or y + h >= img.shape[0] - 1: continue
        fill = a / (w * h)
        if fill < 0.55: continue
        out.append(dict(i=i, x=x, y=y, w=w, h=h, wm=wm, hm=hm, cx=x + w / 2, cy=y + h / 2, fill=fill))
    return out, lab

def best_pair(H, A=None):
    best = None
    for a in H:
        for b in H:
            if b['cx'] <= a['cx']: continue
            if abs(a['wm'] - b['wm']) > 0.06 * a['wm'] or abs(a['hm'] - b['hm']) > 0.06 * a['hm']: continue
            if abs(a['cy'] - b['cy']) / PXMM > 3: continue
            gap = (b['x'] - (a['x'] + a['w'])) / PXMM
            if not (5 <= gap <= 35): continue
            score = 0 if A is None else abs(a['wm'] - A) / A
            score += 0.001 * gap
            if best is None or score < best[0]: best = (score, a, b, gap)
    return best

def contour_mm(lab, comp):
    m = (lab == comp['i']).astype(np.uint8) * 255
    r = int(2.5 * PXMM)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    m = cv2.dilate(m, np.ones((3, 3), np.uint8))       # el trazo de 1–2 px pertenece a la mica
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c0 = max(cs, key=cv2.contourArea)
    # Las plaquetas y cotas negras que invaden la mica la "muerden" del lado nasal: la mica real es
    # (casi siempre) convexa, así que usamos la envolvente convexa del hueco.
    hull = cv2.convexHull(c0)
    c = cv2.approxPolyDP(hull, 0.15, True) if False else hull
    c = c[:, 0, :].astype(float)
    m = np.zeros_like(m); cv2.fillPoly(m, [hull], 255)
    # densificar la envolvente (sus vértices pueden estar muy separados)
    dense = []
    for i in range(len(c)):
        a, b = c[i], c[(i + 1) % len(c)]
        n = max(1, int(np.hypot(*(b - a)) / 3))
        for t in range(n): dense.append(a + (b - a) * t / n)
    c = np.array(dense)
    x0, x1, y0, y1 = c[:, 0].min(), c[:, 0].max(), c[:, 1].min(), c[:, 1].max()
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    # lente izquierda de la imagen = derecha del usuario: +x hacia la sien = hacia la izquierda de la imagen
    pts = [[round(-(x - cx) / PXMM, 2), round(-(y - cy) / PXMM, 2)] for x, y in c]
    return pts, (x1 - x0) / PXMM, (y1 - y0) / PXMM, m

def main(src, outp, qa):
    import time
    os.makedirs(qa, exist_ok=True)
    res = json.load(open(outp)) if os.path.exists(outp) else {}
    t0 = time.time()
    for fn in sorted(os.listdir(src)):
        if not fn.lower().endswith('.pdf') or fn in res: continue
        if time.time() - t0 > float(os.environ.get('BUDGET', '1e9')): break   # por lotes (reanudable)
        name, size = parse_name(fn)
        try:
            page = pymupdf.open(os.path.join(src, fn))[0]
            img = raster_black(page)
            H, lab = holes(img)
            bp = best_pair(H)
            if not bp:
                res[fn] = dict(name=name, size=size, ok=False, reason='sin par de micas', cands=len(H)); print('✗', fn, len(H)); continue
            _, a, b, gap = bp
            pts, A, B, m = contour_mm(lab, a)
            res[fn] = dict(name=name, size=size, ok=True, A=round(A, 2), B=round(B, 2), dbl=round(gap, 2), points_mm=pts)
            # QA: recorte de la vista de frente con el contorno encima
            pad = 60
            y0, y1 = max(0, int(a['y']) - pad), int(a['y'] + a['h']) + pad
            x0, x1 = max(0, int(a['x']) - pad), int(b['x'] + b['w']) + pad
            vis = cv2.cvtColor(255 - img[y0:y1, x0:x1], cv2.COLOR_GRAY2BGR)
            cs, _ = cv2.findContours(m[y0:y1, x0:x1], cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            cv2.drawContours(vis, cs, -1, (0, 0, 255), 2)
            cv2.putText(vis, f'{name} {size} A{A:.1f} B{B:.1f} DBL{gap:.1f}', (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 0, 0), 2)
            cv2.imwrite(os.path.join(qa, re.sub(r'[^A-Za-z0-9_-]+', '_', fn[:-4]) + '.png'), vis)
            print('✓', fn, f'A {A:.2f} B {B:.2f} DBL {gap:.2f}')
        except Exception as e:
            res[fn] = dict(name=name, size=size, ok=False, reason=str(e)); print('!', fn, e)
        json.dump(res, open(outp, 'w'), ensure_ascii=False)
    json.dump(res, open(outp, 'w'), ensure_ascii=False)

if __name__ == '__main__':
    main(*sys.argv[1:4])
