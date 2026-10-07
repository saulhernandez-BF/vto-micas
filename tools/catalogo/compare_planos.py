import json, unicodedata, re, sys
def norm(s): return re.sub(r'[^A-Z0-9]', '', unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode().upper())
P = json.load(open('planos.json'))
C = json.load(open('../../catalog/models.json'))['models']
byname = {}
for fn, v in P.items():
    if v['ok']: byname.setdefault(norm(v['name']), []).append(v)
rows, miss = [], []
for m in C:
    k = norm(m['name']); cands = byname.get(k, [])
    sizes = m.get('sizes') or [dict(talla='', lensWidthMm=m['lensWidthMm'], lensHeightMm=m['lensHeightMm'], bridgeMm=m.get('bridgeMm'))]
    for s in sizes:
        pl = [c for c in cands if c['size'] == s['talla']] or (cands if len(sizes) == 1 else [])
        if not pl: miss.append((m['name'], s['talla'], [c['size'] for c in cands])); continue
        p = min(pl, key=lambda c: abs(c['A'] - s['lensWidthMm']))
        rows.append((m['name'], s['talla'], p['size'], s['lensWidthMm'], s['lensHeightMm'], p['A'], p['B'], p['dbl'], s.get('bridgeMm')))
print(f"{'modelo':22} talla plano  cat A×B      plano A×B     ΔA%   ΔB%")
for r in sorted(rows, key=lambda r: (r[6]-r[4])/r[4]):
    dA = 100*(r[5]-r[3])/r[3]; dB = 100*(r[6]-r[4])/r[4]
    flag = ' <<' if abs(dB) > 4 or abs(dA) > 4 else ''
    print(f"{r[0][:22]:22} {r[1]:4} {r[2]:4}  {r[3]:5.1f}×{r[4]:5.1f}  {r[5]:5.1f}×{r[6]:5.1f}  {dA:+5.1f} {dB:+5.1f}{flag}")
print('\nsin plano:', len(miss)); print(miss)
json.dump(rows, open('/tmp/cmp.json','w'))
