// Una sola lectura de la cámara por cuadro.
// Pasar un cuadro de video (vive en la GPU) a un canvas que se lee con getImageData obliga a esperar a la
// GPU: ~8 ms cada vez en Chrome/Mac aunque el recorte sea chico (medido con tools/bench.html). Antes lo
// hacían por separado la detección de aro, la luz y los reflejos (3 esperas por cuadro). Ahora se copia
// UNA vez la zona de la cara a un canvas de CPU y todos leen de ahí (copias CPU→CPU, casi gratis).
const MAX_SIDE = 900; // px: suficiente para la detección (procWidth 360) y los reflejos

class FrameCache {
  constructor() {
    this.c = document.createElement('canvas');
    this.x = this.c.getContext('2d', { willReadFrequently: true });
    this.rect = null; this.s = 1; this.src = null; this.want = null; this.fresh = false;
    this.reads = 0; // copias desde la GPU (para ?perf)
  }

  /** Al inicio de cada cuadro: zona de la cara (px de video) que se va a necesitar. No copia todavía. */
  begin(src, W, H, lm) {
    this.src = src; this.fresh = false; this.want = null;
    if (!lm) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < lm.length; i += 3) { const p = lm[i]; if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const w = x1 - x0, h = y1 - y0;
    x0 = Math.max(0, Math.floor(x0 - w * 0.3)); x1 = Math.min(W, Math.ceil(x1 + w * 0.3));
    y0 = Math.max(0, Math.floor(y0 - h * 0.25)); y1 = Math.min(H, Math.ceil(y1 + h * 0.15));
    if (x1 - x0 < 8 || y1 - y0 < 8) return;
    this.want = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  ensure() {
    if (this.fresh || !this.want) return this.fresh;
    const r = this.want, s = Math.min(1, MAX_SIDE / Math.max(r.w, r.h));
    const cw = Math.max(1, Math.round(r.w * s)), ch = Math.max(1, Math.round(r.h * s));
    if (this.c.width !== cw || this.c.height !== ch) { this.c.width = cw; this.c.height = ch; }
    this.x.drawImage(this.src, r.x, r.y, r.w, r.h, 0, 0, cw, ch);
    this.rect = r; this.s = s; this.fresh = true; this.reads++;
    return true;
  }

  /** ¿El rectángulo (px de video) cae dentro de la copia? */
  covers(sx, sy, sw, sh) {
    const r = this.want;
    return !!r && sx >= r.x - 1 && sy >= r.y - 1 && sx + sw <= r.x + r.w + 1 && sy + sh <= r.y + r.h + 1;
  }

  /** drawImage(src, …) pero leyendo de la copia de CPU cuando se puede. */
  draw(ctx, src, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (src === this.src && this.covers(sx, sy, sw, sh) && this.ensure()) {
      const r = this.rect, s = this.s;
      ctx.drawImage(this.c, (sx - r.x) * s, (sy - r.y) * s, sw * s, sh * s, dx, dy, dw, dh);
    } else ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
  }
}

export const frameCache = new FrameCache();
