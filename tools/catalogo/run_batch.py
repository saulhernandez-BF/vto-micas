import json, re, unicodedata, subprocess, os
from concurrent.futures import ThreadPoolExecutor
L = json.load(open('drive_list.json'))
gal = {}
for line in open('galileo.txt', encoding='utf-8'):
    p = line.strip().split('|')
    if len(p) == 7: gal[p[0]] = dict(name=p[1], forma=p[2], material=p[3], B=float(p[4]), A=float(p[5]), med=p[6])
# modelos sin fila: heredan de su modelo base
inherit = {'MARIA CLIP ON': 'MARIA', 'MOLINA CLIP ON': 'MOLINA', 'BILLIE ReForm': 'BILLIE', 'MARCELA ReForm': 'MARCELA', 'DESMOND (ACETATO)': 'DESMOND'}
def slug(m):
    s = unicodedata.normalize('NFKD', m).encode('ascii', 'ignore').decode().upper()
    return re.sub(r'[^A-Z0-9]+', '_', s).strip('_')
def job(m):
    g = gal.get(m) or gal.get(inherit.get(m, ''), None)
    img = f'renders/{slug(m)}.png'
    cmd = ['python3', 'extract.py', img, '--out', 'qa']
    if g: cmd += ['--A', str(g['A']), '--B', str(g['B']), '--DBL', g['med'].split('-')[1]]
    r = subprocess.run(cmd, capture_output=True, text=True)
    try: res = json.loads(r.stdout.strip().splitlines()[-1])
    except Exception: res = dict(error=r.stderr[-300:])
    return dict(model=m, slug=slug(m), gal=g, inherited=m in inherit, **res)
with ThreadPoolExecutor(8) as ex: out = list(ex.map(job, [m for m, _ in L]))
json.dump(out, open('batch_results.json', 'w'), indent=1)
for o in out:
    print(f"{o['model'][:18]:18} {o.get('method','ERR'):5} sym={o.get('symmetry_iou',0):.3f} gal={'Y' if o['gal'] else '-'}{'(h)' if o['inherited'] else ''}")
