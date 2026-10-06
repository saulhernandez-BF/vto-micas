// Catálogo de modelos: contorno exacto de la mica por modelo.
// Formatos de contorno aceptados (todo en mm, lente DERECHA vista de frente por el cliente
// al usarla; +x = hacia la sien, +y = arriba; se recentra al centro de la caja):
//   "points_mm": [[x, y], ...]
//   "svg": { "d": "M ... Z", "flipX": false }        (unidades = mm, y hacia abajo como en SVG)
//   "oma": "shapes/modelo.oma"                        (archivo de trazadora OMA/VCA: TRCFMT + R=)
// Opcionales por modelo: "flipX": true si el contorno viene con +x hacia la nariz.

const N = 96; // puntos tras remuestrear

function resample(pts, n = N) {
  const seg = [];
  let L = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(l); L += l;
  }
  const out = [];
  let i = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const t = (k / n) * L;
    while (acc + seg[i] < t && i < pts.length - 1) { acc += seg[i]; i++; }
    const a = pts[i], b = pts[(i + 1) % pts.length], f = seg[i] ? (t - acc) / seg[i] : 0;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

function normalize(pts, flipX) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const out = pts.map(([x, y]) => [(flipX ? -1 : 1) * (x - cx), y - cy]);
  return { pts: resample(out), A: x1 - x0, B: y1 - y0 };
}

export function parseOMA(text) {
  const radii = [];
  let n = 0, fmt = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('TRCFMT=')) { fmt = line; n = parseInt(line.split('=')[1].split(';')[1], 10) || 0; }
    else if (line.startsWith('R=')) radii.push(...line.slice(2).split(';').filter(Boolean).map(Number));
    if (n && radii.length >= n) break;
  }
  if (!radii.length) throw new Error('OMA sin registros R=');
  const m = radii.length;
  // Radios en centésimas de mm, equiangulares desde 0° en sentido antihorario
  return { pts: radii.map((r, i) => [(r / 100) * Math.cos((i / m) * 2 * Math.PI), (r / 100) * Math.sin((i / m) * 2 * Math.PI)]), fmt };
}

function parseSVG(d) {
  const ns = 'http://www.w3.org/2000/svg';
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  const svg = document.createElementNS(ns, 'svg');
  svg.style.position = 'absolute'; svg.style.width = svg.style.height = '0';
  svg.appendChild(path); document.body.appendChild(svg);
  const L = path.getTotalLength(), pts = [];
  for (let i = 0; i < 256; i++) { const p = path.getPointAtLength((i / 256) * L); pts.push([p.x, -p.y]); }
  svg.remove();
  return pts;
}

export async function loadCatalog(url = 'catalog/models.json') {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No se pudo leer ${url}`);
  const data = await res.json();
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  const models = [];
  for (const m of data.models || []) {
    try {
      let raw;
      if (m.points_mm) raw = m.points_mm;
      else if (m.svg) raw = parseSVG(m.svg.d);
      else if (m.oma) raw = parseOMA(await (await fetch(base + m.oma, { cache: 'no-store' })).text()).pts;
      else throw new Error('sin contorno');
      const { pts, A, B } = normalize(raw, m.flipX || m.svg?.flipX);
      // Si el catálogo trae medidas oficiales, el contorno se escala para coincidir exactamente
      const sx = m.lensWidthMm ? m.lensWidthMm / A : 1, sy = m.lensHeightMm ? m.lensHeightMm / B : sx;
      const outline = pts.map(([x, y]) => [x * sx, y * sy]);
      models.push({ ...m, outline, A: m.lensWidthMm || A, Bh: m.lensHeightMm || B, dbl: m.bridgeMm ?? 18 });
    } catch (e) {
      console.warn('[VTO] modelo inválido', m.id, e);
    }
  }
  return models;
}
