"""Integra al catálogo los ajustes medidos en tienda con la herramienta ?ajuste.

Uso (desde tools/catalogo/):
  python3 apply_tunes.py <ajustes.json> [--reset id1,id2,...]

- Modelos marcados "listo": se guarda su ajuste fino (tune, o tunes[talla] si se ajustó por talla)
  y tuneOk=true (la herramienta ?ajuste ya no los pide).
- --reset: modelos con problemas → vuelven a valores de fábrica y quedan pendientes para otra vuelta.
- "no-esta": no se toca.
- Los modelos de excluir.txt se ignoran (y se quitan del catálogo).
"""
import json, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
CAT = os.path.join(HERE, '../../catalog/models.json')

def excluded():
    p = os.path.join(HERE, 'excluir.txt')
    return {l.split('#')[0].strip() for l in open(p, encoding='utf-8')} - {''} if os.path.exists(p) else set()

def main():
    src = sys.argv[1]
    reset = set()
    if '--reset' in sys.argv: reset = {x.strip() for x in sys.argv[sys.argv.index('--reset') + 1].split(',') if x.strip()}
    rows = json.load(open(src, encoding='utf-8'))['models']
    D = json.load(open(CAT, encoding='utf-8'))
    ex = excluded()
    before = len(D['models'])
    D['models'] = [m for m in D['models'] if m['id'] not in ex]
    by = {m['id']: m for m in D['models']}
    unknown = sorted({r['id'] for r in rows} - set(by) - ex) + sorted(reset - set(by))
    applied, cleared = [], []
    for mid in reset:
        m = by.get(mid)
        if m: [m.pop(k, None) for k in ('tune', 'tunes', 'tuneOk')]; cleared.append(mid)
    for r in rows:
        mid, talla = r['id'], r.get('talla') or ''
        m = by.get(mid)
        if not m or mid in reset or r.get('status') != 'listo': continue
        t = {'k': round(r.get('k', 1), 4), 'dy': r.get('dy', 0), 'dbx': r.get('dbx', 0)}
        nondefault = t['k'] != 1 or t['dy'] or t['dbx']
        if talla:
            if nondefault: m.setdefault('tunes', {})[talla] = t
            else: m.get('tunes', {}).pop(talla, None)
        else:
            if nondefault: m['tune'] = t
            else: m.pop('tune', None)
        m['tuneOk'] = True
        applied.append(mid + (f'@{talla}' if talla else ''))
    json.dump(D, open(CAT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'modelos: {before} → {len(D["models"])} (excluidos: {", ".join(sorted(ex)) or "—"})')
    print(f'ajustes aplicados: {len(applied)}  ·  regresados a fábrica: {len(cleared)}')
    if unknown: print('no encontrados en el catálogo:', ', '.join(unknown))

if __name__ == '__main__': main()
