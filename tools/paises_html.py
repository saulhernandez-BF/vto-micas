"""Genera mx/index.html y cl/index.html a partir de index.html (la raíz sigue siendo México).
Correr después de cada cambio a index.html o subida de versión:  python3 tools/paises_html.py
Cada copia apunta a los mismos archivos (<base href="../">) y sólo cambia data-pais."""
import os, re
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
for pais in ('mx', 'cl'):
    s = src.replace('<html lang="es" data-pais="mx">', f'<html lang="es" data-pais="{pais}">', 1)
    s = s.replace('<meta charset="utf-8" />', '<meta charset="utf-8" />\n  <base href="../" />\n  <!-- GENERADO por tools/paises_html.py: no editar, edita index.html -->', 1)
    assert f'data-pais="{pais}"' in s and '<base href' in s
    os.makedirs(os.path.join(ROOT, pais), exist_ok=True)
    open(os.path.join(ROOT, pais, 'index.html'), 'w', encoding='utf-8').write(s)
    print(pais + '/index.html')
