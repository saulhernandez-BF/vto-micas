"""Lista de modelos por país → catalog/paises/<pais>.json

Uso:  python3 build_paises.py            (procesa todos los paises/*.csv)
CSV: tipo,modelo,color,talla,mica  (exportado de la hoja de modelos del país; color y mica son informativos)
Salida: { "pais": "cl", "modelos": { "<id>": ["G","XG"] | [] } }  ([] = modelo de una sola talla en el catálogo)
Los nombres se empatan contra catalog/models.json sin acentos ni signos; ALIAS cubre los que se escriben distinto.
"""
import csv, json, re, unicodedata, glob, os, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
ALIAS = {'darthvader': 'star-wars', 'billiexreform': 'billie-reform', 'marcelaxreform': 'marcela-reform'}
EXCL = {l.split('#')[0].strip() for l in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'excluir.txt'), encoding='utf-8')} - {''}

def key(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '', s)

cat = json.load(open(os.path.join(ROOT, 'catalog', 'models.json'), encoding='utf-8'))['models']
by = {key(m['name']): m for m in cat}
by.update({key(m['id']): m for m in cat})
ids = {m['id']: m for m in cat}
os.makedirs(os.path.join(ROOT, 'catalog', 'paises'), exist_ok=True)
for f in sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'paises', '*.csv'))):
    pais = os.path.splitext(os.path.basename(f))[0]
    sel, faltan, sin_talla, excl = {}, set(), set(), set()
    for r in csv.DictReader(open(f, encoding='utf-8')):
        k = key(r['modelo']); m = ids.get(ALIAS.get(k, '')) or by.get(k)
        if not m: faltan.add(r['modelo']); continue
        if m['id'] in EXCL: excl.add(r['modelo']); continue
        t = sel.setdefault(m['id'], [])
        tallas = [s['talla'] for s in m.get('sizes', [])]
        if tallas:
            if r['talla'] in tallas:
                if r['talla'] not in t: t.append(r['talla'])
            else: sin_talla.add(f"{m['name']} {r['talla']} (catálogo: {'/'.join(tallas)})")
    for i, t in sel.items():
        order = [s['talla'] for s in ids[i].get('sizes', [])]
        t.sort(key=order.index)
    out = {'pais': pais, 'fuente': os.path.basename(f), 'modelos': dict(sorted(sel.items()))}
    json.dump(out, open(os.path.join(ROOT, 'catalog', 'paises', pais + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{pais}: {len(sel)} modelos')
    if faltan: print('  sin plano en el catálogo:', ', '.join(sorted(faltan)))
    if excl: print('  excluidos (excluir.txt):', ', '.join(sorted(excl)))
    if sin_talla: print('  talla no medida:', '; '.join(sorted(sin_talla)))
