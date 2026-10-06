// Capa 2 · Render: tinte físico (multiply = transmitancia), reflejo ambiental, espejo y brillo especular.
import { hexToRgb, rgbStr, clamp, lerp, norm2 } from './math.js';

export function smoothPath(pts) {
  const p = new Path2D(), n = pts.length;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    p.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1]
    );
  }
  p.closePath();
  return p;
}

const mk = () => document.createElement('canvas');

export class Renderer {
  constructor() {
    this.mask = mk(); this.mul = mk(); this.scr = mk();
    this.hasFilter = 'filter' in this.mask.getContext('2d');
    this.info = { density: 0, fresnel: 1, highlight: [0, 0], hlAlpha: 0 };
  }

  size(rw, rh) {
    for (const c of [this.mask, this.mul, this.scr])
      if (c.width !== rw || c.height !== rh) { c.width = rw; c.height = rh; }
  }

  restoreReflections(ctx, src, rx, ry, rw, rh, Li) {
    this.orig ??= document.createElement('canvas');
    const oc = this.orig;
    if (oc.width !== rw || oc.height !== rh) { oc.width = rw; oc.height = rh; }
    const o = oc.getContext('2d', { willReadFrequently: true });
    o.drawImage(src, rx, ry, rw, rh, 0, 0, rw, rh);
    const O = o.getImageData(0, 0, rw, rh).data;
    const M = this.mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, rw, rh).data;
    const img = ctx.getImageData(rx, ry, rw, rh), D = img.data;
    const t0 = Li.keepThreshold, t1 = Math.min(1, t0 + Li.keepSoftness), k = Li.keepStrength;
    for (let i = 0; i < D.length; i += 4) {
      const a = M[i + 3];
      if (!a) continue;
      const L = (0.2126 * O[i] + 0.7152 * O[i + 1] + 0.0722 * O[i + 2]) / 255;
      if (L <= t0) continue;
      let h = (L - t0) / (t1 - t0); h = h >= 1 ? 1 : h * h * (3 - 2 * h);
      h *= k * (a / 255);
      D[i] += (O[i] - D[i]) * h; D[i + 1] += (O[i + 1] - D[i + 1]) * h; D[i + 2] += (O[i + 2] - D[i + 2]) * h;
    }
    ctx.putImageData(img, rx, ry);
  }

  draw(ctx, src, W, H, st) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(src, 0, 0, W, H);
    if (!st.tint || !st.shapes?.length || !st.B) return;

    const { cfg, B, light: lt, shapes } = st;
    const L = cfg.lens;
    const paths = shapes.map((s) => smoothPath(s.pts));

    // ROI de las capas
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of shapes) for (const q of s.pts) {
      x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
    }
    const pad = L.feather * 3 + 4;
    const rx = clamp(Math.floor(x0 - pad), 0, W), ry = clamp(Math.floor(y0 - pad), 0, H);
    const rw = clamp(Math.ceil(x1 + pad), 0, W) - rx, rh = clamp(Math.ceil(y1 + pad), 0, H) - ry;
    if (rw < 2 || rh < 2) return;
    this.size(rw, rh);

    // Máscara (con feather)
    const m = this.mask.getContext('2d');
    m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, rw, rh);
    m.setTransform(1, 0, 0, 1, -rx, -ry);
    m.fillStyle = '#fff';
    if (this.hasFilter && L.feather > 0) m.filter = `blur(${L.feather}px)`;
    for (const p of paths) m.fill(p);
    if (this.hasFilter) m.filter = 'none';

    // Densidad efectiva: base + fotocromático − adaptación a oscuridad
    const Li = cfg.light;
    const photo = lt.photo * Li.photoStrength;
    const darkCut = Li.adaptExposure * clamp((0.45 - lt.faceLum) / 0.45, 0, 1) * 0.5;
    const dens = clamp(L.density * (1 - darkCut) + photo, 0, 1);
    const col = hexToRgb(L.color);
    const physical = L.blend === 'multiply';
    const cs = (dd) =>
      physical
        ? rgbStr(lerp(1, col[0], dd), lerp(1, col[1], dd), lerp(1, col[2], dd))
        : rgbStr(col[0], col[1], col[2], dd);

    // ── Capa de transmitancia
    const a = this.mul.getContext('2d');
    a.setTransform(1, 0, 0, 1, 0, 0); a.globalCompositeOperation = 'source-over';
    a.clearRect(0, 0, rw, rh);
    for (const s of shapes) {
      const f = s.frame;
      a.setTransform(f.X[0], f.X[1], f.Y[0], f.Y[1], f.o[0] - rx, f.o[1] - ry);
      const g = a.createLinearGradient(0, -1, 0, 1);
      g.addColorStop(0, cs(dens));
      g.addColorStop(clamp(L.gradientStart, 0, 0.99), cs(dens));
      g.addColorStop(1, cs(dens * (1 - L.gradient)));
      a.globalCompositeOperation = 'source-over';
      a.fillStyle = g; a.fillRect(-1.3, -1.3, 2.6, 2.6);
      if (physical && L.edgeDarken > 0) {
        a.globalCompositeOperation = 'multiply';
        const r = a.createRadialGradient(0, 0, 0, 0, 0, 1.1);
        const e = 1 - L.edgeDarken;
        r.addColorStop(0, '#fff'); r.addColorStop(0.55, '#fff'); r.addColorStop(1, rgbStr(e, e, e));
        a.fillStyle = r; a.fillRect(-1.3, -1.3, 2.6, 2.6);
      }
    }
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.globalCompositeOperation = 'destination-in'; a.drawImage(this.mask, 0, 0);
    a.globalCompositeOperation = 'source-over';

    // ── Capa de reflejos (screen)
    const cosT = Math.abs(B.n[2]);
    const fres = 1 + Li.fresnel * (1 - cosT) * 3;
    const refl = clamp(Li.reflection * fres, 0, 1);
    const amb = lt.ambientRGB;
    const mir = cfg.mirror.strength, mc = hexToRgb(cfg.mirror.color);
    const hlA = clamp(Li.highlightStrength * lt.intensity * fres, 0, 1);

    const b = this.scr.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, rw, rh);
    let hlPos = [0, 0];
    for (const s of shapes) {
      const f = s.frame;
      b.setTransform(f.X[0], f.X[1], f.Y[0], f.Y[1], f.o[0] - rx, f.o[1] - ry);
      b.globalCompositeOperation = 'lighter';
      if (refl > 0.001) {
        b.fillStyle = rgbStr(amb[0] * refl, amb[1] * refl, amb[2] * refl);
        b.fillRect(-1.3, -1.3, 2.6, 2.6);
      }
      if (mir > 0.001) {
        const k = -B.yaw * 1.5;
        const g = b.createLinearGradient(k, -1, -k, 1);
        g.addColorStop(0, rgbStr(mc[0] * mir, mc[1] * mir, mc[2] * mir));
        g.addColorStop(0.5, rgbStr(mc[0] * mir * 0.55, mc[1] * mir * 0.55, mc[2] * mir * 0.55));
        g.addColorStop(1, rgbStr(mc[0] * mir * 0.85, mc[1] * mir * 0.85, mc[2] * mir * 0.85));
        b.fillStyle = g; b.fillRect(-1.3, -1.3, 2.6, 2.6);
      }
      if (hlA > 0.002) {
        // Dirección de luz (imagen) → marco local de la mica
        const Xn = norm2(f.X), Yn = norm2(f.Y);
        const lx = lt.dir[0] * Xn[0] + lt.dir[1] * Xn[1];
        const ly = lt.dir[0] * Yn[0] + lt.dir[1] * Yn[1];
        const hx = clamp(Li.hlBaseX + lx * Li.followLight - B.yaw * Li.followHead * 1.2, -0.85, 0.85);
        const hy = clamp(Li.hlBaseY + ly * Li.followLight + B.pitch * Li.followHead * 1.2, -0.85, 0.85);
        hlPos = [hx, hy];
        b.save();
        b.translate(hx, hy); b.rotate(-0.55); b.scale(Li.highlightSize, Li.highlightSize * 0.4);
        const rg = b.createRadialGradient(0, 0, 0, 0, 0, 1);
        rg.addColorStop(0, `rgba(255,255,255,${hlA})`);
        rg.addColorStop(0.4, `rgba(255,255,255,${hlA * 0.45})`);
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        b.fillStyle = rg; b.fillRect(-1, -1, 2, 2);
        b.restore();
      }
    }
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'destination-in'; b.drawImage(this.mask, 0, 0);
    b.globalCompositeOperation = 'source-over';

    // ── Composición final sobre el video
    ctx.globalCompositeOperation = L.blend;
    ctx.drawImage(this.mul, rx, ry);
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(this.scr, rx, ry);
    ctx.globalCompositeOperation = 'source-over';

    // Reflejos reales: la mica demo ya refleja el entorno. Un reflejo se SUMA encima de la mica
    // (no pasa a través del tinte), así que devolvemos las zonas brillantes del original.
    if (Li.keepReal && Li.keepStrength > 0) this.restoreReflections(ctx, src, rx, ry, rw, rh, Li);

    this.info = { density: dens, fresnel: fres, highlight: hlPos, hlAlpha: hlA };
  }
}
