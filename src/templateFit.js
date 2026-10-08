// Modo catálogo: la forma exacta de la mica se conoce (contorno del modelo en mm).
// Escala absoluta con el iris (~11.7 mm). Solo quedan 2 incógnitas: altura (cy) y un factor de
// escala fino (k) que absorbe el error del iris. Acumulamos la evidencia de borde en una rejilla
// cy × k durante los frames de frente → el máximo acumulado es muy estable. Luego se bloquea.
import { toImg, lensPt, clamp, sub, dot } from './math.js';

const CY = { min: -0.2, max: 0.14, n: 25 };
const K = { min: 0.88, max: 1.14, n: 15 }; // el plano da el tamaño real: el ajuste fino sólo corrige poco
// Calibración de giro: profundidad extra del plano × wrap, evaluada solo con la cabeza girada
const DEP = { min: -0.05, max: 0.45, n: 11 };
const WRP = { min: 0, max: 24, n: 9 };

export class TemplateFitter {
  constructor() { this.reset(); }
  reset() {
    this.acc = new Float32Array(CY.n * K.n);
    this.cnt = new Uint16Array(CY.n * K.n);
    this.frames = 0; this.tick = 0;
    this.locked = false; this.conf = 0; this.progress = 0;
    this.best = { cy: 0, k: 1 };
    this.iris = []; this.mmPerS = null; // mm por unidad local (distancia entre comisuras)
    this.frontal = false; this.edge = 0;
    this.gAcc = new Float32Array(DEP.n * WRP.n); this.gCnt = new Uint16Array(DEP.n * WRP.n);
    this.gFrames = 0; this.gTick = 0; this.geoBest = null; this.gConf = 0; this.turning = false;
  }
  depAt(i) { return DEP.min + ((DEP.max - DEP.min) * i) / (DEP.n - 1); }
  wrpAt(j) { return WRP.min + ((WRP.max - WRP.min) * j) / (WRP.n - 1); }

  /** Con la forma ya bloqueada, aprende profundidad y wrap cuando la persona gira la cabeza. */
  updateTurn(det, B, cfg, model, base) {
    const c = cfg.catalog, ay = Math.abs(B.yaw) * 180 / Math.PI;
    this.turning = ay > c.turnMinYaw && ay < c.turnMaxYaw && Math.abs(B.pitch) < 0.35;
    if (!this.locked || !this.turning || !c.turnCalib || this.gFrames >= c.turnFrames) return;
    const saved = B.geo, rimless = !!model.rimless;
    const lenses = this.local(model, this.best.cy, this.best.k, 2);
    const phase = this.gTick++ % 3;
    for (let i = 0; i < DEP.n; i++) for (let j = 0; j < WRP.n; j++) {
      const idx = i * WRP.n + j;
      if (idx % 3 !== phase) continue;
      B.geo = { w0: base + this.depAt(i), tp: saved.tp, tw: Math.tan((this.wrpAt(j) * Math.PI) / 180) };
      this.gAcc[idx] += this.edgeScore(det, B, lenses, cfg, rimless); this.gCnt[idx]++;
    }
    B.geo = saved;
    this.gFrames++;
    const d0 = cfg.detect.lensDepthOffset, w0 = cfg.detect.wrapDeg;
    let best = -Infinity, bi = 0, bj = 0, sum = 0, m = 0;
    for (let i = 0; i < DEP.n; i++) for (let j = 0; j < WRP.n; j++) {
      const idx = i * WRP.n + j;
      if (!this.gCnt[idx]) continue;
      const v = this.gAcc[idx] / this.gCnt[idx] - c.turnPrior * 0.01 * (((this.depAt(i) - d0) / 0.15) ** 2 + ((this.wrpAt(j) - w0) / 10) ** 2);
      sum += v; m++;
      if (v > best) { best = v; bi = i; bj = j; }
    }
    if (m) {
      this.gConf = best > 0 ? clamp((best - sum / m) / best / 0.3, 0, 1) : 0;
      if (this.gFrames >= c.turnFrames * 0.3) this.geoBest = { depth: this.depAt(bi), wrap: this.wrpAt(bj) };
    }
  }

  cyAt(i) { return CY.min + ((CY.max - CY.min) * i) / (CY.n - 1); }
  kAt(j) { return K.min + ((K.max - K.min) * j) / (K.n - 1); }

  /** mm por unidad local, medido con el diámetro del iris (mediana acumulada). */
  measureScale(B, lm, cfg) {
    const d = (a, b) => Math.hypot(lm[a][0] - lm[b][0], lm[a][1] - lm[b][1]);
    const irisPx = (d(469, 471) + d(474, 476)) / 2;
    if (irisPx > 2) {
      this.iris.push((cfg.catalog.irisMm / irisPx) * B.s / (cfg.catalog.scaleAdj || 1));
      if (this.iris.length > 90) this.iris.shift();
    }
    const t = [...this.iris].sort((a, b) => a - b);
    this.mmPerS = t.length ? t[t.length >> 1] : 90; // fallback: 90 mm entre comisuras
  }

  /** Puntos locales (u, v) de ambas micas para parámetros (cy, k). */
  local(model, cy, k, stride = 1) {
    const L = (k / this.mmPerS) * 1; // local por mm
    const cxMm = (model.A + model.dbl) / 2;
    const out = [];
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i < model.outline.length; i += stride) {
        const [x, y] = model.outline[i];
        pts.push([side * (cxMm + x) * L, cy + y * L]);
      }
      out.push({ side, pts, cu: side * cxMm * L, cv: cy, hu: (model.A / 2) * L, hv: (model.Bh / 2) * L });
    }
    return out;
  }

  /** Caja local que debe cubrir el ROI de procesamiento. */
  localBounds(model) {
    if (!this.mmPerS) return null;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const cy of [CY.min, CY.max]) for (const L of this.local(model, cy, K.max, 4))
      for (const [u, v] of L.pts) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    return { u0, u1, v0, v1 };
  }

  edgeScore(det, B, lenses, cfg, rimless) {
    const w = cfg.detect.lensPlane, dl = cfg.detect.fitDeltaPx / B.s;
    let sum = 0, cnt = 0;
    for (const L of lenses) {
      const P = L.pts, n = P.length;
      for (let i = 0; i < n; i++) {
        const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
        let nx = b[1] - a[1], ny = -(b[0] - a[0]);
        const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        // orienta la normal hacia afuera (lejos del centro de la mica)
        if (nx * (P[i][0] - L.cu) + ny * (P[i][1] - L.cv) < 0) { nx = -nx; ny = -ny; }
        const s = (t) => { const q = lensPt(B, P[i][0] + nx * t, P[i][1] + ny * t); return det.sample(q[0], q[1]); };
        const i0 = s(-dl), i1 = s(0), i2 = s(dl);
        const v = rimless ? Math.abs(i1 - (i0 + i2) / 2) : Math.abs(i0 - i2);
        sum += Math.min(v, 0.25); cnt++;
      }
    }
    return cnt ? sum / cnt : 0;
  }

  update(det, B, lm, cfg, dt, model) {
    const c = cfg.catalog;
    this.frontal = Math.abs(B.yaw) < (c.maxYaw * Math.PI) / 180 && Math.abs(B.pitch) < (c.maxPitch * Math.PI) / 180;
    if (!this.locked && this.frontal) this.measureScale(B, lm, cfg);
    else if (!this.mmPerS) this.measureScale(B, lm, cfg);
    if (this.locked || !this.frontal) return;

    // Evaluamos un tercio de la rejilla por frame (round-robin) para no gastar CPU
    const rimless = !!model.rimless;
    const phase = this.tick++ % 3;
    for (let i = 0; i < CY.n; i++) for (let j = 0; j < K.n; j++) {
      const idx = i * K.n + j;
      if (idx % 3 !== phase) continue;
      const e = this.edgeScore(det, B, this.local(model, this.cyAt(i), this.kAt(j), 2), cfg, rimless);
      this.acc[idx] += e; this.cnt[idx]++;
    }
    this.frames++;

    // Mejor celda (promedio por celda) + prior suave hacia cy≈0, k≈1
    let best = -Infinity, bi = 0, bj = 0, sum = 0, m = 0;
    for (let i = 0; i < CY.n; i++) for (let j = 0; j < K.n; j++) {
      const idx = i * K.n + j;
      if (!this.cnt[idx]) continue;
      const cy = this.cyAt(i), k = this.kAt(j);
      const v = this.acc[idx] / this.cnt[idx] - c.priorWeight * 0.01 * ((cy / 0.1) ** 2 + ((k - 1) / 0.1) ** 2);
      sum += v; m++;
      if (v > best) { best = v; bi = i; bj = j; }
    }
    if (m) {
      const target = { cy: this.cyAt(bi), k: this.kAt(bj) };
      const a = 1 - Math.pow(1 - 0.25, dt * 30);
      this.best.cy += (target.cy - this.best.cy) * a;
      this.best.k += (target.k - this.best.k) * a;
      this.edge = best;
      const mean = sum / m;
      this.conf = best > 0 ? clamp((best - mean) / best / 0.3, 0, 1) : 0;
    }
    this.progress = clamp(this.frames / c.calibFrames, 0, 1);
    if (this.frames >= c.calibFrames && c.autoLock) this.locked = true;
  }

  shapes(B, cfg, model) {
    if (!this.mmPerS) return null;
    const w = cfg.detect.lensPlane, inset = cfg.lens.insetPx / B.s;
    // Ajuste fino por modelo (medido en tienda): escala alrededor del centro de la mica y desplazamiento vertical en mm
    const t = model.tune || {}, ts = t.k || 1, dyL = ((t.dy || 0) * this.best.k) / this.mmPerS;
    return this.local(model, this.best.cy, this.best.k).map((L) => {
      L.cv += dyL;
      const pts = L.pts.map(([u, v]) => {
        const du = (u - L.cu) * ts, dv = (v + dyL - L.cv) * ts, r = Math.hypot(du, dv) || 1, f = Math.max(0, r - inset) / r;
        return lensPt(B, L.cu + du * f, L.cv + dv * f);
      });
      L.hu *= ts; L.hv *= ts;
      const o = lensPt(B, L.cu, L.cv);
      const X = lensPt(B, L.cu + L.hu, L.cv), Y = lensPt(B, L.cu, L.cv - L.hv);
      return { side: L.side, pts, radii: null, frame: { o, X: [X[0] - o[0], X[1] - o[1]], Y: [Y[0] - o[0], Y[1] - o[1]] } };
    });
  }
}
