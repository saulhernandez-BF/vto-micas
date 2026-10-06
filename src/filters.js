// One Euro Filter (Casiez et al. 2012) — suaviza jitter sin meter lag en movimientos rápidos.
class LowPass {
  constructor() { this.y = null; }
  filter(x, a) {
    this.y = this.y === null ? x : a * x + (1 - a) * this.y;
    return this.y;
  }
}

export class OneEuro {
  constructor(minCutoff = 1.5, beta = 0.8, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }
  reset() {
    this.x = new LowPass();
    this.dx = new LowPass();
    this.tPrev = null;
  }
  alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  /** @param scale normaliza la velocidad (p.ej. tamaño de cara en px) para que beta sea invariante */
  filter(x, t, scale = 1) {
    if (this.tPrev === null) {
      this.tPrev = t;
      this.dx.y = 0;
      return this.x.filter(x, 1);
    }
    const dt = Math.max(1e-3, t - this.tPrev);
    this.tPrev = t;
    const v = (x - this.x.y) / dt / (scale || 1);
    const edx = this.dx.filter(v, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(x, this.alpha(cutoff, dt));
  }
}

export class VecOneEuro {
  constructor(n, ...args) { this.f = Array.from({ length: n }, () => new OneEuro(...args)); }
  set(minCutoff, beta, dCutoff) {
    for (const f of this.f) Object.assign(f, { minCutoff, beta, dCutoff });
  }
  reset() { this.f.forEach((f) => f.reset()); }
  filter(v, t, scale = 1) { return v.map((x, i) => this.f[i].filter(x, t, scale)); }
}
