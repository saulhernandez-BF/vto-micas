import json, re, unicodedata, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
import importlib.util
spec = importlib.util.spec_from_file_location('ex', 'extract.py'); ex = importlib.util.module_from_spec(spec); spec.loader.exec_module(ex)
gal = {}
for line in open('galileo.txt', encoding='utf-8'):
    p = line.strip().split('|')
    if len(p) == 7: gal[p[0]] = dict(name=p[1], forma=p[2], material=p[3], B=float(p[4]), A=float(p[5]), med=p[6])
sizes = {}
for line in open('sizes.txt', encoding='utf-8'):
    m, t, B, A, med = line.strip().split('|')
    sizes.setdefault(m, []).append(dict(talla=t, lensWidthMm=float(A), lensHeightMm=float(B), bridgeMm=float(med.split('-')[1]), medidas=med))
inherit = {'MARIA CLIP ON': 'MARIA', 'MOLINA CLIP ON': 'MOLINA', 'BILLIE ReForm': 'BILLIE', 'MARCELA ReForm': 'MARCELA', 'DESMOND (ACETATO)': 'DESMOND'}
shape_from = {'MARIA CLIP ON': 'MARIA', 'MOLINA CLIP ON': 'MOLINA'}
def slug(m):
    s = unicodedata.normalize('NFKD', m).encode('ascii', 'ignore').decode().upper()
    return re.sub(r'[^A-Z0-9]+', '_', s).strip('_')
def nice(n):
    n = n.title()
    n = re.sub(r'\b(Ii|Iii|Iv|Vi|V|I)\b', lambda k: k.group(1).upper(), n)
    return n.replace('Reform', 'ReForm').replace(' X ', ' x ').replace('C-3Po', 'C-3PO').replace('R2-D2', 'R2-D2').replace('Obi-Wan', 'Obi-Wan')
models = [m for m, _ in json.load(open('drive_list.json'))] + ['HAN SOLO', 'SKYWALKER', 'C-3PO', 'LEIA', 'OBI-WAN', 'R2-D2', 'YODA', 'CHEWIE']
tints = ['pol-verde', 'pol-cafe', 'pol-gris', 'pol-azul', 'azufre', 'rosarito', 'celestun', 'caleta', 'mermejita', 'miramar']
out, report = [], []
for m in models:
    src = shape_from.get(m, m)
    s = slug(src)
    j, method = None, None
    for f, meth in ((f'qa_pair/{s}.json', 'mica sol vs óptico'), (f'qa/{s}.json', 'aro/borde')):
        if os.path.exists(f):
            jj = json.load(open(f))
            if jj.get('symmetry_iou', 0) >= 0.93: j, method = jj, meth; break
    g = gal.get(m) or gal.get(inherit.get(m, ''))
    if not j or not g:
        report.append((m, 'SIN DATOS', bool(j), bool(g))); continue
    P = np.array(j['left_px']); cx = (P[:, 0].min() + P[:, 0].max()) / 2; cy = (P[:, 1].min() + P[:, 1].max()) / 2
    pxmm = np.ptp(P[:, 0]) / g['A']
    pts = [[round(float(-(x - cx) / pxmm), 2), round(float(-(y - cy) / pxmm), 2)] for x, y in P[::2]]
    # ¿al aire? — fracción del contorno sin armazón pegado por fuera
    im, a = ex.load(f'renders/{s}.png'); ex.EDGE_T = 0.55; fm, L, gr = ex.frame_mask(a)
    fmd = ndi.binary_dilation(fm, iterations=4)
    touch = np.mean([fmd[int(min(max(y, 0), fm.shape[0] - 1)), int(min(max(x, 0), fm.shape[1] - 1))] for x, y in P])
    rimless = bool(touch < 0.55) or m in ('NADIA III', 'NADIA V', 'NADIA VI', 'IGOR I', 'IGOR II', 'NADIA IV')
    dbl = float(g['med'].split('-')[1])
    name = nice(g['name']) if m not in inherit else nice(m)
    mid = re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', m).encode('ascii', 'ignore').decode().lower()).strip('-')
    e = dict(id=mid, name=name, rimless=rimless, lensWidthMm=g['A'], lensHeightMm=g['B'], bridgeMm=dbl,
             forma=g['forma'], material=g['material'], medidas=g['med'],
             source=f"{j['image']} · {method} · simetría {j['symmetry_iou']:.3f}" + (' · medidas del modelo base' if m in inherit else '') + (f' · forma de {src}' if src != m else ''),
             points_mm=pts, tints=tints)
    if m in sizes: e['sizes'] = sizes[m]
    out.append(e); report.append((m, method, round(j['symmetry_iou'], 3), 'al aire' if rimless else 'aro'))
out.sort(key=lambda x: x['name'])
json.dump({'generated': '2026-09-30', 'models': out}, open('/mnt/user-data/outputs/models.json', 'w'), separators=(',', ':'))
print(len(out), 'modelos')
for r in report:
    if r[1] == 'SIN DATOS' or r[1] != 'mica sol vs óptico': print(r)
print('al aire:', [x['name'] for x in out if x['rimless']])
