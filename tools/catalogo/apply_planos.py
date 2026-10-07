"""Aplica los planos CAD (planos.json) a catalog/models.json:
contorno exacto (lente visible = borde interior del aro) y medidas reales A/B/DBL por talla.
Guarda las medidas Galileo originales en *_galileo para referencia."""
import json, unicodedata, re
def norm(s): return re.sub(r'[^A-Z0-9]', '', unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().upper())
P = json.load(open('planos.json'))
path = '../../catalog/models.json'
D = json.load(open('../../catalog/models.prev.json'))  # siempre desde el catálogo previo (idempotente)
byname = {}
for fn, v in P.items():
    if v['ok']: byname.setdefault(norm(v['name']), []).append(dict(v, file=fn))
n = 0
for m in D['models']:
    cands = byname.get(norm(m['name']), [])
    if not cands: continue
    sizes = m.get('sizes') or []
    def pick(talla, A):
        pl = [c for c in cands if c['size'] == talla] or ([] if sizes else cands)
        return min(pl, key=lambda c: abs(c['A'] - A)) if pl else None
    base = pick(m.get('talla', '') if sizes else '', m['lensWidthMm'])
    if sizes:  # talla por defecto = la que coincide con el ancho del modelo
        d = next((s for s in sizes if s['lensWidthMm'] == m['lensWidthMm']), sizes[0])
        base = pick(d['talla'], d['lensWidthMm'])
        for s in sizes:
            p = pick(s['talla'], s['lensWidthMm'])
            if not p: continue
            s['lensWidthMm_galileo'], s['lensHeightMm_galileo'] = s['lensWidthMm'], s['lensHeightMm']
            s['bridgeMm_galileo'] = s.get('bridgeMm')
            s['lensWidthMm'], s['lensHeightMm'], s['bridgeMm'] = p['A'], p['B'], p['dbl']
            s['plano'] = p['file']
    if not base: continue
    m['lensWidthMm_galileo'], m['lensHeightMm_galileo'] = m['lensWidthMm'], m['lensHeightMm']
    m['bridgeMm_galileo'] = m.get('bridgeMm')
    # puente medido entre micas visibles: así la distancia entre centros (A + DBL) queda igual a la de fábrica
    m['lensWidthMm'], m['lensHeightMm'], m['bridgeMm'] = base['A'], base['B'], base['dbl']
    m['points_mm'] = base['points_mm']
    m['source'] = f"plano CAD {base['file']} (borde interior del aro)"
    n += 1
json.dump(D, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
print('modelos con plano:', n, 'de', len(D['models']))
