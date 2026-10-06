// Detección del aro (borde interior del armazón) por rayos radiales en el espacio local de la cara.
//
// Idea: partimos de una forma "prior" (superelipse) centrada frente a cada ojo. Desde el centro
// lanzamos N rayos; en cada uno buscamos el borde de mayor contraste dentro de una banda
// [rMin, rMax] × radio prior. Las medidas válidas se acumulan en coordenadas LOCALES de la cara,
// así la forma aprendida viaja rígida con la cabeza y no tiembla aunque la medida de un frame falle.
import { toImg, lensPt, clamp, median, smoothstep, sub, dot } from './math.js';
import { ShapeFitter } from './shapeFit.js';
import { TemplateFitter } from './templateFit.js';

const TAU = Math.PI * 2;

export function priorRadius(th, p) {
  const c = Math.abs(Math.cos(th)) / p.a;
  const s = Math.abs(Math.sin(th)) / p.b;
  return Math.pow(Math.pow(c, p.n) + Math.pow(s, p.n), -1 / p.n);
}

export class LensDetector {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.gray = null;
    this.n = 0;
    this.sides = [];
    this.roi = null;
    this.glassesScore = 0;
    this.frameScore = 0;
    this.detected = false;
    this.learning = false;
    this.stats = { confR: 0, confL: 0, acceptedR: 0, acceptedL: 0 };
    this.fitter = new ShapeFitter();
    this.tpl = new TemplateFitter();
    this.catalogModel = null;
  }

  ensure(n) {
    if (this.n === n) return;
    this.n = n;
    // side: -1 = ojo derecho del usuario (izquierda en imagen cruda), +1 = ojo izquierdo
    this.sides = [-1, 1].map((side) => ({
      side,
      acc: new Float32Array(n).fill(1),
      accConf: new Float32Array(n),
      alt: new Float32Array(n).fill(1), // medición alternativa consistente (para salir de un mínimo malo)
      altT: new Float32Array(n),        // tiempo (frames) que la alternativa lleva siendo consistente
      meas: new Float32Array(n),
      conf: new Float32Array(n),
      peak: new Float32Array(n),
      ok: new Uint8Array(n),
      hit: new Float32Array(n * 2),
      rin: new Float32Array(n * 2),
      rout: new Float32Array(n * 2),
    }));
  }

  reset() {
    for (const s of this.sides) { s.acc.fill(1); s.accConf.fill(0); s.alt.fill(1); s.altT.fill(0); }
    this.glassesScore = 0;
    this.polScore = null;
    this.detected = false;
    this.fitter.reset();
    this.tpl.reset();
    this.noseDepth = null;
  }

  /** Geometría 3D del plano de la mica: profundidad (auto desde el puente nasal), pantoscópico y wrap. */
  updateGeo(B, lm, cfg, dt) {
    const d = cfg.detect;
    let w0 = d.lensPlane;
    if (d.lensDepthAuto && lm) {
      const nose = dot(sub(lm[168], B.O), B.n) / B.s; // qué tan adelante está el puente respecto a las comisuras
      const frontal = Math.abs(B.yaw) < 0.3 && Math.abs(B.pitch) < 0.3;
      if (this.noseDepth == null) this.noseDepth = nose;
      else if (frontal && !(this.tpl.locked && d.model === 'catalog')) this.noseDepth += (nose - this.noseDepth) * (1 - Math.exp(-dt / 0.8));
      this.noseBase = this.noseDepth;
    }
    const gb = d.model === 'catalog' ? this.tpl.geoBest : null;
    const off = gb ? gb.depth : d.lensDepthOffset, wrap = gb ? gb.wrap : d.wrapDeg;
    B.geo = {
      w0: d.lensDepthAuto && lm ? this.noseDepth + off : w0,
      tp: Math.sin((d.pantoDeg * Math.PI) / 180),
      tw: Math.tan((wrap * Math.PI) / 180),
    };
    return B.geo;
  }

  sample(x, y) {
    const w = this.pw, h = this.ph;
    let px = (x - this.roi.x) * this.sc - 0.5;
    let py = (y - this.roi.y) * this.sc - 0.5;
    px = clamp(px, 0, w - 1.001); py = clamp(py, 0, h - 1.001);
    const x0 = px | 0, y0 = py | 0, fx = px - x0, fy = py - y0;
    const g = this.gray, i = y0 * w + x0;
    const a = g[i] + (g[i + 1] - g[i]) * fx;
    const b = g[i + w] + (g[i + w + 1] - g[i + w]) * fx;
    return a + (b - a) * fy;
  }

  update(src, W, H, B, cfg, dt, lm) {
    const d = cfg.detect, p = cfg.prior, n = d.rays;
    this.ensure(n);
    const w = d.lensPlane;

    // ROI que contiene ambas bandas de búsqueda
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const catalog = d.model === 'catalog' && this.catalogModel;
    if (catalog && !this.tpl.mmPerS) this.tpl.measureScale(B, lm, cfg);
    const bb = catalog ? this.tpl.localBounds(this.catalogModel) : null;
    if (bb) {
      for (const [u, v] of [[bb.u0, bb.v0], [bb.u1, bb.v0], [bb.u0, bb.v1], [bb.u1, bb.v1], [0, bb.v0], [0, bb.v1]]) {
        const q = lensPt(B, u, v);
        x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
      }
    } else for (const side of [-1, 1]) for (let i = 0; i < 24; i++) {
      const th = (i / 24) * TAU, rp = priorRadius(th, p) * d.rMax;
      const q = lensPt(B, side * (p.cx + Math.cos(th) * rp), p.cy + Math.sin(th) * rp);
      x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
    }
    const pad = 6;
    x0 = clamp(Math.floor(x0 - pad), 0, W); y0 = clamp(Math.floor(y0 - pad), 0, H);
    x1 = clamp(Math.ceil(x1 + pad), 0, W); y1 = clamp(Math.ceil(y1 + pad), 0, H);
    const rw = x1 - x0, rh = y1 - y0;
    if (rw < 16 || rh < 8) { this.roi = null; return false; }
    this.roi = { x: x0, y: y0, w: rw, h: rh };

    const pw = Math.max(16, Math.round(Math.min(d.procWidth, rw * 2)));
    const ph = Math.max(8, Math.round((pw * rh) / rw));
    if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; }
    this.pw = pw; this.ph = ph; this.sc = pw / rw;
    this.ctx.drawImage(src, x0, y0, rw, rh, 0, 0, pw, ph);
    const img = this.ctx.getImageData(0, 0, pw, ph).data;
    if (!this.gray || this.gray.length !== pw * ph) this.gray = new Float32Array(pw * ph);
    for (let i = 0, j = 0; i < this.gray.length; i++, j += 4)
      this.gray[i] = (0.299 * img[j] + 0.587 * img[j + 1] + 0.114 * img[j + 2]) / 255;

    // Modo catálogo: contorno exacto del modelo, solo se ajusta altura y escala fina
    if (catalog) {
      this.tpl.update(this, B, lm, cfg, dt, this.catalogModel);
      if (d.lensDepthAuto && this.noseDepth != null) this.tpl.updateTurn(this, B, cfg, this.catalogModel, this.noseDepth);
      this.frameScore = this.glassesScore = this.tpl.conf;
      this.detected = true;
      this.learning = !this.tpl.locked;
      return true;
    }

    // Rayos. En automático alternamos por frame entre "aro grueso" (escalón oscuro) y "aro fino"
    // (línea: metal delgado, alambre, nylon) y nos quedamos con el que tenga más evidencia.
    let pol = d.polarity, rimC = d.rimContrast;
    const autoPol = d.model === 'auto' && d.autoPolarity;
    if (autoPol) {
      this.polTick = (this.polTick || 0) + 1;
      pol = this.polTick % 2 ? 'dark' : 'line';
      if (pol === 'line') rimC = d.rimContrastLine;
    }
    this.activePol = pol;
    const S = Math.max(8, d.samples | 0), K = Math.max(1, d.kernel | 0);
    const prof = new Float32Array(S), resp = new Float32Array(S);
    const sig2 = 2 * d.priorSigma * d.priorSigma;
    let sideScore = 0;

    for (const sd of this.sides) {
      const side = sd.side, cu = side * p.cx, cv = p.cy;
      for (let i = 0; i < n; i++) {
        const th = (i / n) * TAU, du = side * Math.cos(th), dv = Math.sin(th);
        const rp = priorRadius(th, p);
        for (let k = 0; k < S; k++) {
          const rel = d.rMin + ((d.rMax - d.rMin) * k) / (S - 1);
          const q = lensPt(B, cu + du * rp * rel, cv + dv * rp * rel);
          prof[k] = this.sample(q[0], q[1]);
          if (k === 0) { sd.rin[i * 2] = q[0]; sd.rin[i * 2 + 1] = q[1]; }
          if (k === S - 1) { sd.rout[i * 2] = q[0]; sd.rout[i * 2 + 1] = q[1]; }
        }
        resp.fill(0);
        let best = -Infinity, bk = -1;
        for (let k = K; k < S - K; k++) {
          let inner = 0, outer = 0;
          for (let j = 1; j <= K; j++) { inner += prof[k - j]; outer += prof[k + j]; }
          const D = (inner - outer) / K; // >0: se oscurece hacia afuera (aro oscuro)
          let r;
          if (pol === 'line') {
            // Cresta: línea fina (canto de mica al aire / aro de alambre), clara u oscura
            r = Math.abs(prof[k] - (prof[k - K] + prof[k + K]) / 2);
          } else r = pol === 'dark' ? D : pol === 'light' ? -D : Math.abs(D);
          resp[k] = r;
          const rel = d.rMin + ((d.rMax - d.rMin) * k) / (S - 1);
          const sc = r * Math.exp(-((rel - 1) * (rel - 1)) / sig2);
          if (sc > best) { best = sc; bk = k; }
        }
        // Mitad inferior: por fuera del aro sólo hay mejilla lisa; por dentro, pliegues del párpado/ojera.
        // Preferimos la cresta significativa más externa para no "cortar" las esquinas inferiores.
        if (bk >= 0 && d.outerBias > 0 && dv < -0.25) {
          const thr = resp[bk] * d.outerBias;
          for (let k = S - K - 2; k > bk; k--) {
            const rel = d.rMin + ((d.rMax - d.rMin) * k) / (S - 1);
            if (rel > d.outerMaxRel) continue;
            if (resp[k] >= thr && resp[k] >= resp[k - 1] && resp[k] >= resp[k + 1]) { bk = k; break; }
          }
        }
        let kk = bk;
        if (bk > K && bk < S - K - 1) {
          const a = resp[bk - 1], b = resp[bk], c = resp[bk + 1], den = a - 2 * b + c;
          if (den < 0) kk = bk + clamp((0.5 * (a - c)) / den, -0.5, 0.5);
        }
        const rel = d.rMin + ((d.rMax - d.rMin) * kk) / (S - 1);
        const med = median(resp.subarray(K, S - K));
        const conf = bk < 0 ? 0 : clamp((resp[bk] - Math.max(0, med)) / d.edgeContrast, 0, 1);
        sd.meas[i] = rel; sd.conf[i] = conf; sd.peak[i] = bk < 0 ? 0 : resp[bk]; sd.ok[i] = conf >= d.minConf ? 1 : 0;
        const q = lensPt(B, cu + du * rp * rel, cv + dv * rp * rel);
        sd.hit[i * 2] = q[0]; sd.hit[i * 2 + 1] = q[1];
      }

      // Rechazo espacial de outliers: cada rayo debe parecerse a sus vecinos
      const keep = new Uint8Array(n);
      const nb = [];
      for (let i = 0; i < n; i++) {
        if (!sd.ok[i]) continue;
        nb.length = 0;
        for (let j = -3; j <= 3; j++) {
          if (!j) continue;
          const t = (i + j + n) % n;
          if (sd.ok[t]) nb.push(sd.meas[t]);
        }
        keep[i] = nb.length < 2 || Math.abs(sd.meas[i] - median(nb)) <= d.outlierTol ? 1 : 0;
      }
      sd.ok.set(keep);
      let cs = 0, ac = 0, pk = 0, rough = 0, rn = 0;
      for (let i = 0; i < n; i++) {
        cs += sd.conf[i]; ac += sd.ok[i]; if (sd.ok[i]) pk += sd.peak[i];
        const j = (i + 1) % n;
        if (sd.ok[i] && sd.ok[j]) { rough += Math.abs(sd.meas[i] - sd.meas[j]); rn++; }
      }
      const k = side < 0 ? 'R' : 'L';
      this.stats['conf' + k] = cs / n; this.stats['accepted' + k] = ac / n;
      const peak = ac ? pk / ac : 0, rgh = rn ? rough / rn : 1;
      this.stats['peak' + k] = peak; this.stats['rough' + k] = rgh;
      // Evidencia de aro: muchos rayos válidos × contraste fuerte × contorno suave
      const cScore = smoothstep(rimC * 0.8, rimC * 1.8, peak);
      const sScore = 1 - smoothstep(d.maxRough * 0.5, d.maxRough * 1.2, rgh);
      sideScore += (ac / n) * cScore * sScore;
    }

    // Automático: rayos (aro visible) y, en paralelo, ajuste sin aro como respaldo
    if (d.model === 'auto') this.fitter.update(this, B, lm, cfg, dt);

    // Modo "sin aro": ajuste paramétrico global
    if (d.model === 'fit') {
      this.fitter.update(this, B, lm, cfg, dt);
      this.frameScore = this.fitter.conf;
      const kf = 1 - Math.exp(-dt / 0.4);
      this.glassesScore += (this.frameScore - this.glassesScore) * kf;
      if (!this.detected && this.glassesScore > d.glassesThreshold) this.detected = true;
      else if (this.detected && this.glassesScore < d.glassesThreshold * 0.7) this.detected = false;
      this.learning = !d.lock;
      return true;
    }

    // ¿Hay lentes? — promedio de evidencia de ambos lados
    this.frameScore = sideScore / 2;
    const kf = 1 - Math.exp(-dt / 0.4);
    let isBest = true;
    if (autoPol) {
      this.polScore ||= { dark: 0, line: 0 };
      this.polScore[pol] += (this.frameScore - this.polScore[pol]) * (1 - Math.exp(-(dt * 2) / 0.5));
      this.bestPol = this.polScore.line > this.polScore.dark ? 'line' : 'dark';
      isBest = pol === this.bestPol;
      this.glassesScore = Math.max(this.polScore.dark, this.polScore.line);
    } else this.glassesScore += (this.frameScore - this.glassesScore) * kf;
    if (!this.detected && this.glassesScore > d.glassesThreshold) this.detected = true;
    else if (this.detected && this.glassesScore < d.glassesThreshold * 0.7) this.detected = false;

    // Aprendizaje de forma (acumulador en espacio local)
    this.learning = !d.lock && isBest && this.frameScore > d.glassesThreshold * 0.8;
    if (this.learning) {
      const frames = dt * 30; // independiente del framerate
      for (const sd of this.sides) for (let i = 0; i < n; i++) {
        if (!sd.ok[i]) continue;
        let a = 1 - Math.pow(1 - d.learnRate * sd.conf[i], frames);
        if (sd.accConf[i] > 0.6 && Math.abs(sd.meas[i] - sd.acc[i]) > d.outlierTol) {
          // ¿Es un outlier aislado o la forma aprendida quedó mal (p. ej. pliegue de la ojera en los
          // primeros frames)? Si la medición discrepante es estable durante ~relearnFrames, la adoptamos.
          if (Math.abs(sd.meas[i] - sd.alt[i]) < d.outlierTol * 0.5) sd.altT[i] += frames;
          else sd.altT[i] = 0;
          sd.alt[i] += 0.3 * (sd.meas[i] - sd.alt[i]);
          if (sd.altT[i] < d.relearnFrames) a *= 0.15;
        } else { sd.altT[i] = 0; sd.alt[i] = sd.meas[i]; }
        sd.acc[i] += a * (sd.meas[i] - sd.acc[i]);
        sd.accConf[i] = Math.min(1, sd.accConf[i] + 0.04 * sd.conf[i] * frames);
      }
    }
    return true;
  }

  /** Forma final de cada mica en píxeles + marco local para gradientes/reflejos. */
  shapes(B, cfg) {
    const d = cfg.detect, p = cfg.prior, n = d.rays;
    this.ensure(n);
    const out = [];
    if (d.model === 'catalog' && this.catalogModel) return this.tpl.shapes(B, cfg, this.catalogModel);
    if (d.model === 'fit' && this.fitter.ps) return this.fitShapes(B, cfg);
    if (d.model === 'auto' && !this.detected && this.fitter.ps) return this.fitShapes(B, cfg);
    const passes = Math.round(d.spatialSmooth * 4);
    for (const sd of this.sides) {
      const other = this.sides.find((s) => s !== sd);
      // Radio por rayo = propio + espejo (simetría), ponderados por cuánto se ha aprendido cada uno.
      // Los rayos que nunca encontraron aro NO se quedan en la forma base (eso "cortaba" las esquinas):
      // se interpolan desde los vecinos aprendidos.
      let r = new Float32Array(n);
      const has = new Uint8Array(n);
      const hs = d.symmetry / 2;
      for (let i = 0; i < n; i++) {
        const wa = sd.accConf[i] * (1 - hs), wb = other.accConf[i] * hs;
        if (wa + wb > 0.05) { r[i] = (sd.acc[i] * wa + other.acc[i] * wb) / (wa + wb); has[i] = 1; }
        // Mitad inferior: los errores típicos son hacia adentro (pliegue de ojera/párpado), casi nunca
        // hacia afuera (mejilla lisa). Si el espejo dice que la mica es más grande ahí, le creemos.
        if (d.lowerMirrorMax && Math.sin((i / n) * TAU) < -0.2 && sd.accConf[i] > 0.3 && other.accConf[i] > 0.3
            && other.acc[i] > sd.acc[i] + d.outlierTol * 0.5) {
          r[i] = other.acc[i] * 0.85 + sd.acc[i] * 0.15; has[i] = 1;
        }
        // Mitad superior: al revés — el error típico es hacia afuera (ceja). Si el espejo es menor, le creemos.
        if (d.lowerMirrorMax && Math.sin((i / n) * TAU) > 0.2 && sd.accConf[i] > 0.3 && other.accConf[i] > 0.3
            && other.acc[i] < sd.acc[i] - d.outlierTol * 0.5) {
          r[i] = other.acc[i] * 0.85 + sd.acc[i] * 0.15; has[i] = 1;
        }
      }
      fillCircular(r, has, 1);
      for (let k = 0; k < passes; k++) {
        const t = new Float32Array(n);
        for (let i = 0; i < n; i++) t[i] = 0.25 * r[(i - 1 + n) % n] + 0.5 * r[i] + 0.25 * r[(i + 1) % n];
        r = t;
      }
      const side = sd.side, cu = side * p.cx, cv = p.cy;
      const pts = [];
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (let i = 0; i < n; i++) {
        const th = (i / n) * TAU, rp = priorRadius(th, p);
        const rr = Math.max(0.05, r[i] * rp - cfg.lens.insetPx / B.s);
        const u = cu + side * Math.cos(th) * rr, v = cv + Math.sin(th) * rr;
        u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
        pts.push(lensPt(B, u, v));
      }
      const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2, hu = (u1 - u0) / 2, hv = (v1 - v0) / 2;
      const o = lensPt(B, mu, mv);
      const X = lensPt(B, mu + hu, mv), Y = lensPt(B, mu, mv - hv);
      out.push({
        side, pts, radii: r,
        frame: { o, X: [X[0] - o[0], X[1] - o[1]], Y: [Y[0] - o[0], Y[1] - o[1]] },
      });
    }
    return out;
  }

  fitShapes(B, cfg) {
    const d = cfg.detect, p = this.fitter.ps, n = d.rays, out = [];
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const th = (i / n) * TAU;
        const rr = Math.max(0.05, priorRadius(th, p) - cfg.lens.insetPx / B.s);
        pts.push(lensPt(B, side * (p.cx + Math.cos(th) * rr), p.cy + Math.sin(th) * rr));
      }
      const o = lensPt(B, side * p.cx, p.cy);
      const X = lensPt(B, side * p.cx + p.a, p.cy), Y = lensPt(B, side * p.cx, p.cy - p.b);
      out.push({ side, pts, radii: null, frame: { o, X: [X[0] - o[0], X[1] - o[1]], Y: [Y[0] - o[0], Y[1] - o[1]] } });
    }
    return out;
  }
}

/** Rellena huecos de un arreglo circular interpolando linealmente entre los vecinos válidos más cercanos. */
function fillCircular(r, has, fallback) {
  const n = r.length, idx = [];
  for (let i = 0; i < n; i++) if (has[i]) idx.push(i);
  if (!idx.length) { r.fill(fallback); return; }
  if (idx.length === 1) { r.fill(r[idx[0]]); return; }
  for (let k = 0; k < idx.length; k++) {
    const a = idx[k], b = idx[(k + 1) % idx.length];
    const gap = (b - a + n) % n || n;
    for (let j = 1; j < gap; j++) { const t = j / gap; r[(a + j) % n] = r[a] * (1 - t) + r[b] * t; }
  }
}
