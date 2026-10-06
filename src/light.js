// Estimación de luz ambiental a partir del frame completo + sondas sobre la piel.
import { clamp, smoothstep } from './math.js';

const PROBES = { forehead: 151, cheekR: 205, cheekL: 425, chin: 199, nose: 4 };

export class LightEstimator {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.s = {
      ambientLum: 0.5, ambientRGB: [0.5, 0.5, 0.5], faceLum: 0.5,
      dir: [0, 0], contrast: 0, intensity: 1, photo: 0, probes: {},
    };
    this.init = false;
  }

  update(src, W, H, lm, dt, cfg) {
    const w = 128, h = Math.max(1, Math.round((128 * H) / W));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.ctx.drawImage(src, 0, 0, w, h);
    const d = this.ctx.getImageData(0, 0, w, h).data;

    let r = 0, g = 0, b = 0, c = 0;
    for (let i = 0; i < d.length; i += 8) { r += d[i]; g += d[i + 1]; b += d[i + 2]; c++; }
    r /= c * 255; g /= c * 255; b /= c * 255;
    const amb = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    const probes = {};
    for (const [k, idx] of Object.entries(PROBES)) {
      const p = lm[idx];
      const px = Math.round((p[0] * w) / W), py = Math.round((p[1] * h) / H);
      let s = 0, n = 0;
      for (let y = py - 1; y <= py + 1; y++) for (let x = px - 1; x <= px + 1; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const j = (y * w + x) * 4;
        s += (0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2]) / 255; n++;
      }
      probes[k] = { x: p[0], y: p[1], lum: n ? s / n : 0 };
    }
    const face = (probes.forehead.lum + probes.cheekL.lum + probes.cheekR.lum + probes.chin.lum + probes.nose.lum) / 5;
    const dn = Math.max(0.05, face);
    let dx = (probes.cheekL.lum - probes.cheekR.lum) / dn; // +x imagen = luz desde la derecha de la imagen
    let dy = (probes.chin.lum - probes.forehead.lum) / dn;  // +y = luz desde abajo
    const contrast = Math.hypot(dx, dy);
    if (contrast > 1) { dx /= contrast; dy /= contrast; }

    const S = this.s;
    const k = this.init ? 1 - Math.exp(-dt / 0.25) : 1;
    this.init = true;
    const e = (a, x) => a + (x - a) * k;
    S.ambientLum = e(S.ambientLum, amb);
    S.ambientRGB = [e(S.ambientRGB[0], r), e(S.ambientRGB[1], g), e(S.ambientRGB[2], b)];
    S.faceLum = e(S.faceLum, face);
    S.dir = [e(S.dir[0], dx), e(S.dir[1], dy)];
    S.contrast = e(S.contrast, Math.min(1, contrast));
    S.intensity = clamp(0.35 + S.contrast * 1.6 + S.faceLum * 0.6, 0, 1.6);
    S.probes = probes;

    // Fotocromático: se oscurece con luz intensa, con constante de tiempo lenta.
    const L = cfg.light;
    const target = L.photochromic ? smoothstep(0.25, 0.7, S.ambientLum) : 0;
    S.photo += (target - S.photo) * (1 - Math.exp(-dt / Math.max(0.05, L.photoTau)));
    return S;
  }
}
