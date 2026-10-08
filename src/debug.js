// Capa de debug: panel de parámetros (lil-gui), overlays sobre el canvas y HUD de métricas.
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';
import { toImg } from './math.js';
import { priorRadius } from './lensDetector.js';

const TAU = Math.PI * 2;
const deg = (r) => ((r * 180) / Math.PI).toFixed(0).padStart(4, ' ');
const confColor = (c, a = 1) => `hsla(${Math.round(c * 120)},90%,55%,${a})`;

export class Debug {
  constructor(cfg, actions) {
    this.cfg = cfg;
    this.actions = actions;
    this.hudEl = document.getElementById('hud');
    this.lastHud = 0;
    this.build();
    this.gui.show(cfg.debug.panel);
    if (window.innerWidth < 900) this.gui.close(); // en ventanas angostas no tapar la cara
    this.hudEl.hidden = !(cfg.debug.panel && cfg.debug.hud);
  }

  build() {
    const c = this.cfg, A = this.actions;
    const g = (this.gui = new GUI({ title: 'Debug · VTO Micas', width: 310 }));

    const fa = g.addFolder('Acciones');
    const act = {
      reporte: () => A.copyReport(),
      config: () => A.copyConfig(),
      importar: () => A.importConfig(),
      captura: () => A.snapshot(),
      pausa: () => A.togglePause(),
      resetForma: () => A.resetShape(),
      defaults: () => A.resetDefaults(),
      uso: () => A.openUsage(),
      ajuste: () => A.openTune(),
    };
    fa.add(act, 'uso').name('📊 Reporte de uso');
    fa.add(act, 'ajuste').name('🎯 Ajuste por modelo');
    fa.add(act, 'reporte').name('📋 Copiar reporte (C)');
    fa.add(act, 'config').name('Copiar config JSON');
    fa.add(act, 'importar').name('Pegar / importar config');
    fa.add(act, 'captura').name('📸 Captura PNG (S)');
    fa.add(act, 'pausa').name('⏸ Congelar frame (P)');
    fa.add(act, 'resetForma').name('↺ Reiniciar forma (R)');
    fa.add(act, 'defaults').name('Restaurar valores por defecto');

    const fl = g.addFolder('Mica · Tinte');
    fl.addColor(c.lens, 'color').name('Color');
    fl.add(c.lens, 'density', 0, 1, 0.01).name('Densidad');
    fl.add(c.lens, 'gradient', 0, 1, 0.01).name('Degradado ↓');
    fl.add(c.lens, 'gradientStart', 0, 1, 0.01).name('Inicio degradado');
    fl.add(c.lens, 'edgeDarken', 0, 0.6, 0.01).name('Oscurecer borde');
    fl.add(c.lens, 'blend', ['multiply', 'color', 'soft-light', 'overlay', 'hue']).name('Fusión');
    fl.add(c.lens, 'feather', 0, 6, 0.1).name('Feather px');
    fl.add(c.lens, 'insetPx', -4, 6, 0.1).name('Contraer contorno px');

    const fm = g.addFolder('Espejo');
    fm.addColor(c.mirror, 'color').name('Color espejo');
    fm.add(c.mirror, 'strength', 0, 1, 0.01).name('Intensidad');
    fm.close();

    const fli = g.addFolder('Luz ambiental');
    fli.add(c.light, 'keepReal').name('Conservar reflejos reales');
    fli.add(c.light, 'keepThreshold', 0.3, 0.95, 0.01).name('Umbral reflejo');
    fli.add(c.light, 'keepSoftness', 0.02, 0.5, 0.01).name('Suavidad reflejo');
    fli.add(c.light, 'keepStrength', 0, 1, 0.01).name('Fuerza reflejo real');
    fli.add(c.light, 'reflection', 0, 0.6, 0.01).name('Reflejo sintético');
    fli.add(c.light, 'highlightStrength', 0, 1.2, 0.01).name('Brillo sintético');
    fli.add(c.light, 'highlightSize', 0.1, 1.2, 0.01).name('Tamaño brillo');
    fli.add(c.light, 'hlBaseX', -1, 1, 0.01).name('Brillo base X');
    fli.add(c.light, 'hlBaseY', -1, 1, 0.01).name('Brillo base Y');
    fli.add(c.light, 'followLight', 0, 2, 0.01).name('Seguir dir. de luz');
    fli.add(c.light, 'adaptExposure', 0, 1, 0.01).name('Aclarar en oscuridad');
    fli.add(c.light, 'photochromic').name('Fotocromático');
    fli.add(c.light, 'photoStrength', 0, 1, 0.01).name('Fuerza fotocrom.');
    fli.add(c.light, 'photoTau', 0.2, 10, 0.1).name('Tiempo fotocrom. s');

    const fmo = g.addFolder('Movimiento');
    fmo.add(c.light, 'followHead', 0, 3, 0.01).name('Brillo sigue cabeza');
    fmo.add(c.light, 'fresnel', 0, 2, 0.01).name('Fresnel (ángulo)');
    fmo.add(c.tracking, 'minCutoff', 0.05, 6, 0.05).name('Filtro minCutoff');
    fmo.add(c.tracking, 'beta', 0, 4, 0.01).name('Filtro beta');
    fmo.add(c.tracking, 'dCutoff', 0.1, 5, 0.1).name('Filtro dCutoff');
    fmo.close();

    const fd = g.addFolder('Detección de aro');
    fd.add(c.detect, 'enabled').name('Detección activa');
    fd.add(c.detect, 'model', { Automático: 'auto', 'Aro visible (rayos)': 'rays', 'Sin aro / 3 piezas (ajuste)': 'fit', 'Catálogo (forma exacta)': 'catalog' }).name('Modelo').onChange(() => A.resetShape());
    const ff = fd.addFolder('Ajuste sin aro');
    ff.add(c.detect, 'fitPoints', 16, 96, 4).name('Puntos contorno');
    ff.add(c.detect, 'fitCandidates', 4, 80, 1).name('Candidatos/frame');
    ff.add(c.detect, 'fitStep', 0.1, 4, 0.05).name('Tamaño de paso');
    ff.add(c.detect, 'fitDeltaPx', 0.5, 4, 0.1).name('Ancho canto px');
    ff.add(c.detect, 'fitSmooth', 0.01, 1, 0.01).name('Suavizado salida');
    ff.add(c.detect, 'fitPrior', 0, 10, 0.1).name('Peso forma base');
    ff.add(c.detect, 'fitEyeMargin', 0, 0.4, 0.01).name('Margen ojo');
    ff.add(c.detect, 'fitMaxN', 1.8, 6, 0.05).name('Cuadratura máx');
    ff.add(c.detect, 'fitMinAspect', 0.3, 1, 0.01).name('Alto/ancho mín');
    ff.add(c.detect, 'fitSizeTol', 0.05, 0.6, 0.01).name('Tolerancia tamaño');
    ff.add(c.detect, 'fitMaxYaw', 3, 40, 1).name('Aprende si yaw < °');
    ff.add(c.detect, 'fitMaxPitch', 3, 40, 1).name('Aprende si pitch < °');
    fd.add(c.detect, 'lock').name('🔒 Bloquear forma (L)').listen();
    fd.add(c.detect, 'polarity', { 'Aro oscuro': 'dark', 'Aro claro': 'light', Cualquiera: 'any', 'Línea fina (sin aro / alambre)': 'line' }).name('Polaridad');
    fd.add(c.detect, 'rays', 16, 128, 4).name('Rayos');
    fd.add(c.detect, 'samples', 12, 64, 1).name('Muestras/rayo');
    fd.add(c.detect, 'kernel', 1, 5, 1).name('Kernel borde');
    fd.add(c.detect, 'rMin', 0.3, 1, 0.01).name('Banda mín');
    fd.add(c.detect, 'rMax', 1, 2.2, 0.01).name('Banda máx');
    fd.add(c.detect, 'priorSigma', 0.05, 1, 0.01).name('Peso prior σ');
    fd.add(c.detect, 'edgeContrast', 0.01, 0.3, 0.005).name('Contraste ref.');
    fd.add(c.detect, 'minConf', 0, 1, 0.01).name('Confianza mín');
    fd.add(c.detect, 'outlierTol', 0.03, 1, 0.01).name('Tolerancia outlier');
    fd.add(c.detect, 'learnRate', 0, 1, 0.01).name('Velocidad aprendizaje');
    fd.add(c.detect, 'spatialSmooth', 0, 1, 0.01).name('Suavizado contorno');
    fd.add(c.detect, 'symmetry', 0, 1, 0.01).name('Simetría L/R');
    fd.add(c.detect, 'glassesThreshold', 0, 1, 0.01).name('Umbral “hay lentes”');
    fd.add(c.detect, 'rimContrast', 0.03, 0.5, 0.005).name('Contraste mín. aro');
    fd.add(c.detect, 'autoPolarity').name('Auto: probar aro fino');
    fd.add(c.detect, 'rimContrastLine', 0.02, 0.3, 0.005).name('Contraste mín. aro fino');
    fd.add(c.detect, 'maxRough', 0.01, 0.15, 0.001).name('Rugosidad máx.');
    fd.add(c.detect, 'outerBias', 0, 1, 0.05).name('Sesgo externo (abajo)');
    fd.add(c.detect, 'lowerMirrorMax').name('Abajo: usar espejo si es mayor');
    fd.add(c.detect, 'outerMaxRel', 1, 2, 0.01).name('Radio máx. externo');
    fd.add(c.detect, 'relearnFrames', 2, 60, 1).name('Frames para re-aprender');
    fd.add(c.detect, 'lensDepthAuto').name('Profundidad auto (puente)');
    fd.add(c.detect, 'lensDepthOffset', -0.15, 0.25, 0.005).name('Profundidad extra');
    fd.add(c.detect, 'lensPlane', -0.2, 0.4, 0.005).name('Profundidad fija');
    fd.add(c.detect, 'pantoDeg', -5, 20, 0.5).name('Pantoscópico °');
    fd.add(c.detect, 'wrapDeg', -5, 20, 0.5).name('Wrap °');
    fd.add(c.detect, 'procWidth', 120, 720, 10).name('Resolución proceso px');
    fd.add(c.detect, 'renderWithoutGlasses').name('Pintar sin lentes detectados');

    const fc = g.addFolder('Catálogo / kiosko');
    fc.add(c.catalog, 'irisMm', 10.5, 13, 0.05).name('Iris mm (escala)');
    fc.add(c.catalog, 'scaleAdj', 0.85, 1.25, 0.01).name('Escala global micas');
    fc.add(c.catalog, 'maxYaw', 3, 30, 1).name('Calibra si yaw < °');
    fc.add(c.catalog, 'maxPitch', 3, 30, 1).name('Calibra si pitch < °');
    fc.add(c.catalog, 'calibFrames', 10, 200, 1).name('Frames calibración');
    fc.add(c.catalog, 'autoLock').name('Bloquear al calibrar');
    fc.add(c.catalog, 'priorWeight', 0, 10, 0.1).name('Peso altura/escala base');
    fc.add(c.catalog, 'lostResetSec', 0.5, 15, 0.5).name('Reset sin rostro s');
    fc.add(c.catalog, 'resetModelOnLost').name('Volver a auto (nuevo cliente)');
    fc.add(c.catalog, 'suggestConf', 0, 1, 0.01).name('Sugerir modelo si conf <');
    fc.add(c.catalog, 'suggestAfterSec', 0.5, 10, 0.5).name('…después de s');
    fc.add(c.catalog, 'turnCalib').name('Auto-calibrar giro');
    fc.add(c.catalog, 'turnMinYaw', 5, 40, 1).name('Giro mín °');
    fc.add(c.catalog, 'turnMaxYaw', 20, 70, 1).name('Giro máx °');
    fc.add(c.catalog, 'turnFrames', 10, 300, 5).name('Frames de giro');
    fc.add(c.catalog, 'turnPrior', 0, 10, 0.1).name('Peso valores base');
    fc.close();
    const fp = g.addFolder('Forma base (prior)');
    fp.add(c.prior, 'cx', 0.2, 0.5, 0.005).name('Centro X');
    fp.add(c.prior, 'cy', -0.2, 0.2, 0.005).name('Centro Y');
    fp.add(c.prior, 'a', 0.1, 0.45, 0.005).name('Semiancho');
    fp.add(c.prior, 'b', 0.08, 0.35, 0.005).name('Semialto');
    fp.add(c.prior, 'n', 1.5, 6, 0.05).name('Cuadratura (n)');
    fp.close();

    const fv = g.addFolder('Vista / overlays');
    fv.add(c.view, 'mirror').name('Espejo (selfie)');
    fv.add(c.view, 'showTint').name('Mostrar tinte');
    fv.add(c.debug, 'hud').name('HUD métricas');
    fv.add(c.debug, 'landmarks').name('Landmarks');
    fv.add(c.debug, 'basis').name('Ejes cabeza');
    fv.add(c.debug, 'prior').name('Forma prior');
    fv.add(c.debug, 'band').name('Banda búsqueda');
    fv.add(c.debug, 'rays').name('Rayos');
    fv.add(c.debug, 'hits').name('Bordes detectados');
    fv.add(c.debug, 'polygon').name('Contorno final');
    fv.add(c.debug, 'probes').name('Sondas de luz');
    fv.add(c.debug, 'roi').name('ROI');
    fv.add(c.debug, 'roiInset').name('Inset ROI procesada');

    g.onChange(() => A.onChange());
  }

  refresh() { this.gui.controllersRecursive().forEach((c) => c.updateDisplay()); }

  togglePanel() {
    this.cfg.debug.panel = !this.cfg.debug.panel;
    this.gui.show(this.cfg.debug.panel);
    this.actions.onChange();
  }

  drawOverlays(ctx, st) {
    const { cfg, B, lm, detector, light, shapes, W } = st;
    if (!cfg.debug.panel || !B) return;
    const D = cfg.debug, p = cfg.prior, w = cfg.detect.lensPlane;
    const lw = Math.max(1, W / 700);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = lw;

    if (D.landmarks && lm) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (const q of lm) ctx.fillRect(q[0] - lw * 0.6, q[1] - lw * 0.6, lw * 1.2, lw * 1.2);
    }

    if (D.basis) {
      const o = toImg(B, 0, 0), L = 0.25;
      const ax = [[toImg(B, L, 0), '#ff5566'], [toImg(B, 0, L), '#55ff88'], [toImg(B, 0, 0, L), '#5599ff']];
      for (const [q, c] of ax) {
        ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
    }

    const sides = detector.sides || [];
    const n = detector.n;

    if (D.prior) {
      ctx.setLineDash([4 * lw, 4 * lw]); ctx.strokeStyle = 'rgba(255,220,120,0.8)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        for (let i = 0; i <= 64; i++) {
          const th = (i / 64) * TAU, r = priorRadius(th, p);
          const q = toImg(B, side * (p.cx + Math.cos(th) * r), p.cy + Math.sin(th) * r, w);
          i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    if (D.band || D.rays) for (const sd of sides) {
      if (D.band) {
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        for (const arr of [sd.rin, sd.rout]) {
          ctx.beginPath();
          for (let i = 0; i <= n; i++) {
            const k = (i % n) * 2; i ? ctx.lineTo(arr[k], arr[k + 1]) : ctx.moveTo(arr[k], arr[k + 1]);
          }
          ctx.stroke();
        }
      }
      if (D.rays) for (let i = 0; i < n; i++) {
        ctx.strokeStyle = confColor(sd.conf[i], 0.35);
        ctx.beginPath(); ctx.moveTo(sd.rin[i * 2], sd.rin[i * 2 + 1]); ctx.lineTo(sd.rout[i * 2], sd.rout[i * 2 + 1]); ctx.stroke();
      }
    }

    if (D.hits) for (const sd of sides) for (let i = 0; i < n; i++) {
      const x = sd.hit[i * 2], y = sd.hit[i * 2 + 1];
      ctx.fillStyle = sd.ok[i] ? confColor(sd.conf[i]) : 'rgba(150,150,150,0.6)';
      ctx.beginPath(); ctx.arc(x, y, lw * (sd.ok[i] ? 1.8 : 1.1), 0, TAU); ctx.fill();
    }

    if (D.polygon && shapes) {
      ctx.strokeStyle = detector.detected ? '#00e5ff' : 'rgba(0,229,255,0.45)';
      ctx.lineWidth = lw * 1.4;
      for (const s of shapes) {
        ctx.beginPath();
        s.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
        ctx.closePath(); ctx.stroke();
      }
      ctx.lineWidth = lw;
    }

    if (D.probes && light.probes) {
      for (const pr of Object.values(light.probes)) {
        const v = Math.round(pr.lum * 255);
        ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.strokeStyle = '#ffb000';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, lw * 4, 0, TAU); ctx.fill(); ctx.stroke();
      }
      const nose = light.probes.nose;
      if (nose) {
        const k = B.s * 0.5;
        ctx.strokeStyle = '#ffb000'; ctx.lineWidth = lw * 2;
        ctx.beginPath(); ctx.moveTo(nose.x, nose.y); ctx.lineTo(nose.x + light.dir[0] * k, nose.y + light.dir[1] * k); ctx.stroke();
        ctx.lineWidth = lw;
      }
    }

    if (D.roi && detector.roi) {
      const r = detector.roi; ctx.strokeStyle = 'rgba(255,0,200,0.7)'; ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
    if (D.roiInset && detector.roi) {
      const iw = Math.min(W * 0.35, detector.canvas.width * 1.5);
      const ih = (iw * detector.canvas.height) / detector.canvas.width;
      ctx.drawImage(detector.canvas, 8, 8, iw, ih);
      ctx.strokeStyle = '#fff'; ctx.strokeRect(8, 8, iw, ih);
    }
    ctx.restore();
  }

  hud(st, now) {
    const show = this.cfg.debug.panel && this.cfg.debug.hud;
    this.hudEl.hidden = !show;
    document.body.classList.toggle('no-debug', !this.cfg.debug.panel);
    if (!show || now - this.lastHud < 120) return;
    this.lastHud = now;
    const { app, B, detector: d, light: l, render: r, tracker } = st;
    const pct = Math.round(d.glassesScore * 100);
    const state = !B ? '—' : this.cfg.detect.lock ? 'bloqueada' : d.learning ? 'aprendiendo' : 'en espera';
    const bar = (v) => `<span class="bar"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></span>`;
    this.hudEl.innerHTML = `
      <div><b>${app.fps.toFixed(0)}</b> fps · track ${app.ms.track.toFixed(1)}ms · det ${app.ms.detect.toFixed(1)}ms · render ${app.ms.render.toFixed(1)}ms <span class="dim">${tracker.delegate || ''}</span></div>
      <div>Rostro ${B ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'} · ${app.W}×${app.H}${app.paused ? ' · <span class="warn">PAUSA</span>' : ''}</div>
      <div>Lentes ${bar(d.glassesScore)} ${pct}% ${d.detected ? '<span class="ok">DETECTADOS</span>' : '<span class="warn">no detectados</span>'}</div>
      <div>Forma: ${state}${d.polScore ? ` · aro grueso ${(d.polScore.dark * 100).toFixed(0)}% / fino ${(d.polScore.line * 100).toFixed(0)}%` : ''} · rayos ok R ${(d.stats.acceptedR * 100).toFixed(0)}% L ${(d.stats.acceptedL * 100).toFixed(0)}%</div>
      <div>Contraste aro R ${(d.stats.peakR ?? 0).toFixed(2)} L ${(d.stats.peakL ?? 0).toFixed(2)} · rugosidad R ${(d.stats.roughR ?? 0).toFixed(3)} L ${(d.stats.roughL ?? 0).toFixed(3)}</div>
      ${this.cfg.detect.model === 'catalog' && d.catalogModel ? `<div>Catálogo: ${d.catalogModel.name} · ${d.tpl.locked ? '<span class="ok">bloqueado</span>' : `calibrando ${(d.tpl.progress * 100).toFixed(0)}%`} · cy ${d.tpl.best.cy.toFixed(3)} k ${d.tpl.best.k.toFixed(3)} · conf ${d.tpl.conf.toFixed(2)} · ${(d.tpl.mmPerS || 0).toFixed(1)} mm/u</div><div>Giro: ${d.tpl.geoBest ? `prof ${d.tpl.geoBest.depth.toFixed(2)} wrap ${d.tpl.geoBest.wrap.toFixed(0)}° · ` : ''}${d.tpl.gFrames}/${this.cfg.catalog.turnFrames} frames · conf ${d.tpl.gConf.toFixed(2)}${d.tpl.turning ? ' · <span class="ok">girado</span>' : ''}</div>` : ''}
      ${this.cfg.detect.model === 'fit' && d.fitter.ps ? `<div>Ajuste: canto ${d.fitter.edge.toFixed(3)} vs fondo ${d.fitter.bg.toFixed(3)} · conf ${d.fitter.conf.toFixed(2)} · ojo ${d.fitter.eyeOk ? '<span class="ok">✓</span>' : '<span class="warn">toca</span>'} · ${d.fitter.frontal ? '<span class="ok">de frente: aprende</span>' : '<span class="warn">girado: congelado</span>'} · n=${d.fitter.iters}</div><div class="dim">cx ${d.fitter.ps.cx.toFixed(3)} cy ${d.fitter.ps.cy.toFixed(3)} a ${d.fitter.ps.a.toFixed(3)} b ${d.fitter.ps.b.toFixed(3)} n ${d.fitter.ps.n.toFixed(2)}</div>` : ''}
      <div>Luz amb ${l.ambientLum.toFixed(2)} · rostro ${l.faceLum.toFixed(2)} · contraste ${l.contrast.toFixed(2)}</div>
      <div>Dir luz (${l.dir[0].toFixed(2)}, ${l.dir[1].toFixed(2)}) · fotocrom ${l.photo.toFixed(2)}</div>
      <div>Densidad efectiva ${r.density.toFixed(2)} · fresnel ${r.fresnel.toFixed(2)} · brillo ${r.hlAlpha.toFixed(2)}</div>
      ${B ? `<div>Plano mica w0 ${(B.geo?.w0 ?? 0).toFixed(3)} · </div><div>Pose yaw${deg(B.yaw)}° pitch${deg(B.pitch)}° roll${deg(B.roll)}° · escala ${B.s.toFixed(0)}px</div>` : ''}
    `;
  }
}
