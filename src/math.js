// Utilidades de vectores y color — sin dependencias.
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
export const norm2 = (v) => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

/**
 * Proyecta un punto del espacio local de la cara (u, v, w) a píxeles de imagen.
 * u: eje entre comisuras externas (1 = distancia 33↔263), v: arriba, w: hacia la cámara.
 * Proyección ortográfica débil (se descarta z).
 */
export function toImg(B, u, v, w = 0) {
  const s = B.s;
  return [
    B.O[0] + s * (u * B.ex[0] + v * B.ey[0] + w * B.n[0]),
    B.O[1] + s * (u * B.ex[1] + v * B.ey[1] + w * B.n[1]),
  ];
}

export function hexToRgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const rgbStr = (r, g, b, a = 1) =>
  `rgba(${Math.round(clamp(r, 0, 1) * 255)},${Math.round(clamp(g, 0, 1) * 255)},${Math.round(
    clamp(b, 0, 1) * 255
  )},${clamp(a, 0, 1).toFixed(3)})`;

export function median(arr, n = arr.length) {
  const t = Array.prototype.slice.call(arr, 0, n).sort((a, b) => a - b);
  if (!t.length) return 0;
  const m = t.length >> 1;
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
}

/**
 * Punto sobre el plano de la mica (espacio local → imagen). La profundidad w depende de:
 *  - B.geo.w0: distancia del plano del armazón delante de las comisuras (auto desde el puente nasal)
 *  - B.geo.tp: inclinación pantoscópica (la parte baja de la mica va más pegada a la cara)
 *  - B.geo.tw: curvatura/wrap (la mica se va hacia atrás hacia la sien)
 */
export function lensPt(B, u, v) {
  const g = B.geo || { w0: 0.05, tp: 0, tw: 0 };
  return toImg(B, u, v, g.w0 + v * g.tp - Math.abs(u) * g.tw);
}
