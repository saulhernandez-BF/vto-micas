// Modo "sin aro" (tres piezas / al aire): en lugar de buscar el borde rayo por rayo,
// ajusta una superelipse completa (cx, cy, a, b, n), simétrica L/R, maximizando la
// respuesta de borde integrada sobre TODO el contorno de ambas micas. Un canto débil
// pero continuo gana sobre ruido local. La forma debe contener al ojo (no se pega a párpados).
import { toImg, lensPt, clamp, sub, dot } from './math.js';
import { priorRadius } from './lensDetector.js';

const TAU = Math.PI * 2;
// Solo comisuras (rígidas): los párpados/iris se mueven con la mirada y hacían 'bailar' la mica
const CORNERS = { '-1': [33, 133], '1': [263, 362] };
const BOUNDS = { cx: [0.2, 0.52], cy: [-0.22, 0.2], a: [0.12, 0.46], b: [0.08, 0.36], n: [1.8, 6] };
const KEYS = ['cx', 'cy', 'a', 'b', 'n'];

function gauss() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

export class ShapeFitter {
  constructor() { this.reset(); }
  reset(prior) {
    this.p = prior ? { ...prior } : null;   // punto de búsqueda
    this.ps = prior ? { ...prior } : null;  // salida suavizada
    this.score = 0; this.edge = 0; this.bg = 0; this.conf = 0; this.eyeOk = true;
    this.iters = 0;
  }

  toLocal(B, P) {
    const d = sub(P, B.O);
    return [dot(d, B.ex) / B.s, dot(d, B.ey) / B.s];
  }

  /** Respuesta media de borde a lo largo del contorno de ambas micas, escalado k. */
  edgeAlong(det, B, p, cfg, k = 1) {
    const d = cfg.detect, M = d.fitPoints, w = d.lensPlane;
    const dl = d.fitDeltaPx / B.s; // paso en unidades locales
    let sum = 0, cnt = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < M; i++) {
        const th = (i / M) * TAU, c = Math.cos(th), s = Math.sin(th);
        const r = priorRadius(th, p) * k;
        const at = (rr) => {
          const q = lensPt(B, side * (p.cx + c * rr), p.cy + s * rr);
          return det.sample(q[0], q[1]);
        };
        const i0 = at(r - dl), i1 = at(r), i2 = at(r + dl);
        let v;
        if (d.polarity === 'line') v = Math.abs(i1 - (i0 + i2) / 2);
        else if (d.polarity === 'dark') v = Math.max(0, i0 - i2);
        else if (d.polarity === 'light') v = Math.max(0, i2 - i0);
        else v = Math.abs(i0 - i2);
        sum += Math.min(v, 0.25); cnt++;
      }
    }
    return cnt ? sum / cnt : 0;
  }

  /** Penalización si la forma no contiene al ojo con margen. */
  eyePenalty(B, lm, p, cfg) {
    if (!lm) return 0;
    const m = cfg.detect.fitEyeMargin;
    let pen = 0;
    for (const side of [-1, 1]) {
      const [c0, c1] = CORNERS[side].map((i) => this.toLocal(B, lm[i]));
      const mu = (c0[0] + c1[0]) / 2, mv = (c0[1] + c1[1]) / 2, ew = Math.hypot(c0[0] - c1[0], c0[1] - c1[1]);
      // caja fija del ojo: comisuras + alto proporcional al ancho del ojo
      const box = [c0, c1, [mu, mv + ew * 0.32], [mu, mv - ew * 0.3]];
      for (const [u, v] of box) {
      const du = Math.abs(side * u - p.cx), dv = Math.abs(v - p.cy);
      const f = Math.pow(Math.pow(du / p.a, p.n) + Math.pow(dv / p.b, p.n), 1 / p.n); // <1 dentro
      const lim = 1 - m;
      if (f > lim) pen += f - lim;
      }
    }
    return pen;
  }

  evaluate(det, B, lm, p, cfg) {
    const d = cfg.detect, pr = cfg.prior;
    const e = this.edgeAlong(det, B, p, cfg);
    const reg =
      ((p.a - pr.a) / pr.a) ** 2 + ((p.b - pr.b) / pr.b) ** 2 + ((p.cx - pr.cx) / 0.1) ** 2 + ((p.cy - pr.cy) / 0.1) ** 2;
    return { e, s: e - d.fitPrior * 0.01 * reg - this.eyePenalty(B, lm, p, cfg) * 0.2 };
  }

  update(det, B, lm, cfg, dt) {
    const d = cfg.detect, pr = cfg.prior;
    if (!this.ps) this.reset(pr);
    // Solo aprendemos de frente: de lado la proyección 2D deforma la mica y el ajuste se "infla"
    this.frontal = Math.abs(B.yaw) < (d.fitMaxYaw * Math.PI) / 180 && Math.abs(B.pitch) < (d.fitMaxPitch * Math.PI) / 180;
    const evalCur = this.evaluate(det, B, lm, this.ps, cfg);
    this.edge = evalCur.e;
    this.bg = (this.edgeAlong(det, B, this.ps, cfg, 0.85) + this.edgeAlong(det, B, this.ps, cfg, 1.15)) / 2;
    this.conf = this.edge > 0 ? clamp((this.edge - this.bg) / this.edge, 0, 1) : 0;
    this.eyeOk = this.eyePenalty(B, lm, this.ps, cfg) === 0;
    if (d.lock || !this.frontal) return;

    // Búsqueda local alrededor de la estimación estable (no deriva de frame en frame)
    const lim = {
      ...BOUNDS,
      a: [pr.a * (1 - d.fitSizeTol), pr.a * (1 + d.fitSizeTol)],
      b: [pr.b * (1 - d.fitSizeTol), pr.b * (1 + d.fitSizeTol)],
      n: [BOUNDS.n[0], d.fitMaxN],
    };
    let best = { ...this.ps }, bestEv = evalCur;
    const T = d.fitStep;
    const sig = { cx: 0.012 * T, cy: 0.012 * T, a: 0.015 * T, b: 0.015 * T, n: 0.25 * T };
    for (let k = 0; k < d.fitCandidates; k++) {
      const c = { ...best };
      const pick = Math.random() < 0.5 ? [KEYS[(Math.random() * 5) | 0]] : KEYS;
      for (const key of pick) c[key] = clamp(c[key] + gauss() * sig[key], lim[key][0], lim[key][1]);
      c.b = Math.max(c.b, c.a * d.fitMinAspect);
      const ev = this.evaluate(det, B, lm, c, cfg);
      if (ev.s > bestEv.s * 1.002) { best = c; bestEv = ev; }
    }
    this.p = best;
    // Promedio acumulado: rápido al inicio, cada vez más estable (la mica no cambia de forma)
    this.iters++;
    const a = Math.max(d.fitSmooth * 0.1, 1 / (1 + this.iters * d.fitSmooth)) * Math.min(1, dt * 30);
    for (const key of KEYS) this.ps[key] += (best[key] - this.ps[key]) * a;
  }
}
