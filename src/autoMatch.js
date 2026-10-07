// Reconocimiento automático del modelo: compara el contorno que encontró la detección de aro con los
// contornos de fábrica (planos CAD) de todo el catálogo — forma, proporción y tamaño — y elige modelo y
// talla. Funciona también con medio aro: sólo cuentan los ángulos donde el aro se vio (pesos).
import { priorRadius } from './lensDetector.js';

const K = 72;                    // ángulos de la firma
const TAU = Math.PI * 2;

/** Firma polar de un contorno normalizado a su caja (x, y en −1..1), con +x hacia la sien y +y arriba. */
function signature(pts) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2 || 1, hy = (y1 - y0) / 2 || 1;
  const P = pts.map(([x, y]) => [(x - cx) / hx, (y - cy) / hy]);
  const sig = new Float32Array(K);
  for (let k = 0; k < K; k++) {
    const a = (k / K) * TAU, dx = Math.cos(a), dy = Math.sin(a);
    let best = 0;
    for (let i = 0; i < P.length; i++) {                     // intersección rayo–segmento más lejana
      const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
      const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = (ax * ey - ay * ex) / den, u = (ax * dy - ay * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t > best) best = t;
    }
    sig[k] = best;
  }
  return { sig, w: x1 - x0, h: y1 - y0 };
}

export class AutoMatcher {
  constructor() { this.models = []; this.reset(); }

  setCatalog(models) {
    this.models = models.map((m) => {
      const s = signature(m.outline);
      const sizes = (m.sizes?.length ? m.sizes : [{ talla: '', lensWidthMm: m.A, lensHeightMm: m.Bh }])
        .map((z) => ({ talla: z.talla, A: z.lensWidthMm, B: z.lensHeightMm }));
      return { id: m.id, name: m.name, sig: s.sig, aspect: s.h / s.w, sizes, rimless: !!m.rimless };
    });
  }

  reset() { this.ema = new Map(); this.evals = 0; this.top = []; this.locked = null; }

  /**
   * radii: radios aprendidos de la mica izquierda del usuario (side +1, relativos a la forma base);
   * conf: confianza por rayo; mmPerLocal: mm por unidad local (escala del iris).
   */
  evaluate(radii, conf, prior, mmPerLocal) {
    const n = radii.length, pts = [], wts = [];
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU, r = radii[i] * priorRadius(th, prior);
      pts.push([Math.cos(th) * r, Math.sin(th) * r]); wts.push(conf[i]);
    }
    const det = signature(pts);
    // peso por ángulo de la firma = confianza del rayo más cercano en dirección
    const w = new Float32Array(K);
    for (let k = 0; k < K; k++) w[k] = conf[Math.round((k / K) * n) % n];
    const W = det.w * mmPerLocal, H = det.h * mmPerLocal, aspect = det.h / det.w;
    const res = [];
    for (const m of this.models) {
      let sw = 0, se = 0;
      for (let k = 0; k < K; k++) { const e = det.sig[k] - m.sig[k]; se += w[k] * e * e; sw += w[k]; }
      const shape = Math.sqrt(se / Math.max(1e-6, sw));
      const asp = Math.abs(Math.log(aspect / m.aspect));
      let best = null;
      for (const z of m.sizes) {
        const size = Math.abs(Math.log(W / z.A)) + 0.5 * Math.abs(Math.log(H / z.B));
        if (!best || size < best.size) best = { talla: z.talla, size };
      }
      const total = shape + 0.8 * asp + 0.35 * best.size;    // el tamaño pesa menos: el iris tiene ±8 %
      const prev = this.ema.get(m.id);
      const e = prev == null ? total : prev + (total - prev) * 0.35;
      this.ema.set(m.id, e);
      res.push({ id: m.id, name: m.name, talla: best.talla, score: e, shape, asp, size: best.size });
    }
    res.sort((a, b) => a.score - b.score);
    this.evals++;
    this.all = res;
    this.top = res.slice(0, 3);
    this.measured = { W, H };
    return this.top;
  }

  /** ¿Ya estamos seguros? (varias evaluaciones, buen ajuste y ventaja clara sobre el segundo) */
  decide(cfg) {
    const c = cfg.catalog;
    if (this.evals < c.autoMinEvals || !this.all || this.all.length < 2) return null;
    const a = this.all[0], ma = this.models.find((m) => m.id === a.id);
    // Modelos con la misma geometría (p. ej. Parks / Parks Caviar) no compiten entre sí: da igual cuál
    // se use para pintar. La ventaja se mide contra el primero con forma distinta.
    const b = this.all.find((r) => {
      if (r.id === a.id) return false;
      const mb = this.models.find((m) => m.id === r.id);
      let d = 0; for (let k = 0; k < K; k++) d = Math.max(d, Math.abs(ma.sig[k] - mb.sig[k]));
      return d > 0.03 || Math.abs(Math.log(ma.aspect / mb.aspect)) > 0.03;
    });
    if (a.score < c.autoMaxScore && (!b || b.score - a.score > c.autoMargin)) return a;
    return null;
  }
}
