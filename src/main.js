// Orquestación: fuente (cámara/foto/video) → tracking → luz → detección de aro → render → debug.
import { FaceTracker, HeadBasis } from './tracking.js';
import { LensDetector } from './lensDetector.js';
import { LightEstimator } from './light.js';
import { Renderer } from './renderer.js';
import { Debug } from './debug.js';
import { loadConfig, saveConfig, resetConfig, merge, applyPreset, PRESETS, PHOTO_TARGETS, VERSION } from './config.js';
import { hexToRgb } from './math.js';
import { loadCatalog } from './catalog.js';
import { AutoMatcher } from './autoMatch.js';
import { Analytics, openReport } from './analytics.js';
import { Kiosk, startUpdater } from './kiosk.js';
import { Tuner, applyTunes } from './tune.js';

const $ = (id) => document.getElementById(id);
const cfg = loadConfig();
const canvas = $('view');
const ctx = canvas.getContext('2d');
const video = $('video');

const tracker = new FaceTracker();
const basis = new HeadBasis();
const detector = new LensDetector();
const light = new LightEstimator();
const renderer = new Renderer();

const app = {
  src: null, kind: null, W: 0, H: 0, facing: 'user', stream: null,
  paused: false, freeze: null, before: false,
  lm: null, B: null, shapes: null, tries: 0,
  lastVideoTime: -1, lastT: 0, fps: 0, noFace: 0,
  ms: { track: 0, detect: 0, render: 0 },
};
const catalog = { models: [] };
const analytics = new Analytics();
const kiosk = new Kiosk();
window.__vto = { app, cfg, detector, light, renderer, catalog, analytics }; // útil para inspeccionar desde la consola

// ───────────────────────── UI helpers
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
const setStatus = (m) => ($('status').textContent = m);

function isMirrored() { return cfg.view.mirror && app.kind === 'camera' && app.facing === 'user'; }
function applyView() { canvas.classList.toggle('mirrored', isMirrored()); }

async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); toast(`${label} copiado al portapapeles`); }
  catch { openModal(label, text, null); }
}

function openModal(title, text, onApply) {
  $('modal-title').textContent = title;
  $('modal-text').value = text;
  $('modal-ok').hidden = !onApply;
  $('modal').classList.remove('hidden');
  $('modal-ok').onclick = () => { onApply?.($('modal-text').value); closeModal(); };
}
function closeModal() { $('modal').classList.add('hidden'); }
$('modal-cancel').onclick = closeModal;

function buildReport() {
  const r3 = (a) => Array.from(a, (x) => +x.toFixed(3));
  return {
    app: 'vto-micas', version: VERSION, at: new Date().toISOString(),
    ua: navigator.userAgent, source: app.kind, size: [app.W, app.H], delegate: tracker.delegate,
    metrics: {
      fps: +app.fps.toFixed(1), ms: app.ms,
      face: !!app.B,
      glassesScore: +detector.glassesScore.toFixed(3), glassesDetected: detector.detected,
      raysAccepted: detector.stats,
      light: {
        ambientLum: +light.s.ambientLum.toFixed(3), faceLum: +light.s.faceLum.toFixed(3),
        dir: light.s.dir.map((x) => +x.toFixed(3)), contrast: +light.s.contrast.toFixed(3), photo: +light.s.photo.toFixed(3),
      },
      pose: app.B ? { yaw: +app.B.yaw.toFixed(3), pitch: +app.B.pitch.toFixed(3), roll: +app.B.roll.toFixed(3), scalePx: +app.B.s.toFixed(1) } : null,
      render: renderer.info,
      learnedRadii: detector.sides.map((s) => ({ side: s.side < 0 ? 'R' : 'L', radii: r3(s.acc) })),
    },
    note: document.getElementById('note')?.value || '',
    catalog: detector.catalogModel ? { model: detector.catalogModel.id, locked: detector.tpl.locked, best: detector.tpl.best, conf: detector.tpl.conf, mmPerS: detector.tpl.mmPerS, frames: detector.tpl.frames } : null,
    fit: detector.fitter.ps ? { params: detector.fitter.ps, edge: detector.fitter.edge, bg: detector.fitter.bg, conf: detector.fitter.conf, eyeOk: detector.fitter.eyeOk } : null,
    config: cfg,
  };
}

function snapshot() {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const x = c.getContext('2d');
  if (isMirrored()) { x.translate(c.width, 0); x.scale(-1, 1); }
  x.drawImage(canvas, 0, 0);
  c.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `vto-micas-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
  toast('Captura descargada');
}

function onConfigChange() {
  saveConfig(cfg);
  basis.configure(cfg.tracking);
  applyView();
  renderSwatches();
}

const debug = new Debug(cfg, {
  onChange: onConfigChange,
  copyReport: () => copyText(JSON.stringify(buildReport(), null, 2), 'Reporte'),
  copyConfig: () => copyText(JSON.stringify(cfg, null, 2), 'Config'),
  importConfig: () =>
    openModal('Pegar config JSON', '', (txt) => {
      try {
        const o = JSON.parse(txt);
        merge(cfg, o.config && o.app === 'vto-micas' ? o.config : o);
        debug.refresh(); onConfigChange(); toast('Config aplicada');
      } catch (e) { toast('JSON inválido: ' + e.message); }
    }),
  snapshot,
  openUsage: () => openUsage(),
  openTune: () => tuner.open(),
  togglePause: () => { app.paused = !app.paused; toast(app.paused ? 'Frame congelado' : 'En vivo'); },
  resetShape: () => { detector.reset(); toast('Forma reiniciada'); },
  resetDefaults: () => { resetConfig(cfg); debug.refresh(); detector.reset(); onConfigChange(); toast('Valores por defecto'); },
});
basis.configure(cfg.tracking);

// ───────────────────────── Micas (UI de producto — Figma: Polarizadas | Entintadas)
function renderSwatches() {
  const groups = { Polarizadas: $('sw-pol'), Fotoentintadas: $('sw-tint') };
  if (!groups.Polarizadas.childElementCount) {
    for (const p of PRESETS) {
      const host = groups[p.group];
      if (!host) continue;
      const b = document.createElement('button');
      b.className = 'swatch'; b.dataset.id = p.id; b.setAttribute('role', 'radio');
      const c2 = p.photo === 'cafe' ? '#6C5F4C' : p.photo === 'gris' ? '#545A5C' : '';
      if (p.photo) b.dataset.photo = p.photo;
      b.innerHTML = `<span class="dot" style="--c:${p.swatch || p.color};${c2 ? '--c2:' + c2 : ''}"></span><span class="lbl">${p.name}</span>`;
      b.onclick = () => { applyPreset(cfg, p); analytics.track('preset', { id: p.id }); debug.refresh(); onConfigChange(); };
      host.appendChild(b);
    }
  }
  const allowed = cfg.detect.model === 'catalog' && detector.catalogModel?.tints;
  for (const b of document.querySelectorAll('.swatch')) {
    b.setAttribute('aria-checked', String(b.dataset.id === cfg.lens.preset));
    b.hidden = !!allowed && !allowed.includes(b.dataset.id);
  }
  renderUV();
}

// ───────────────────────── Fotoentintadas: Interior / Exterior
// Con UV la mica vira de su color a café o gris. Emulamos la cinética real (rápido al oscurecer,
// más lento al aclarar), comprimida a pocos segundos para la tienda.
function photoPreset() { return PRESETS.find((p) => p.id === cfg.lens.preset && p.photo); }
function renderUV() {
  const out = !!cfg.lens.outdoor;
  $('uv-in').setAttribute('aria-checked', String(!out));
  $('uv-out').setAttribute('aria-checked', String(out));
  $('uv').classList.toggle('idle', !photoPreset());
  document.querySelector('.lenses').classList.toggle('outdoor', out);
}
function setOutdoor(v) { if (v && !cfg.lens.outdoor) analytics.track('outdoor'); cfg.lens.outdoor = v; onConfigChange(); }
$('uv-in').onclick = () => setOutdoor(false);
$('uv-out').onclick = () => {
  // Si traen una polarizada, pasar a exterior no cambia nada: elegimos la primera fotoentintada
  if (!photoPreset()) { const p = PRESETS.find((x) => x.photo); if (p) applyPreset(cfg, p); }
  setOutdoor(true);
};
function stepPhoto(dt) {
  const target = cfg.lens.outdoor ? 1 : 0;
  const tau = (cfg.lens.outdoor ? cfg.lens.photoInSec : cfg.lens.photoOutSec) / 3; // ~95 % en photo*Sec
  app.photoT = (app.photoT ?? 0) + (target - (app.photoT ?? 0)) * (1 - Math.exp(-dt / Math.max(0.05, tau)));
}
function tintColor() {
  const p = photoPreset();
  if (!p || !(app.photoT > 0.002)) return null;
  const a = hexToRgb(p.color), b = hexToRgb(PHOTO_TARGETS[p.photo]);
  const t = app.photoT * app.photoT * (3 - 2 * app.photoT);
  const h = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0');
  return '#' + [0, 1, 2].map((i) => h(a[i] + (b[i] - a[i]) * t)).join('');
}
renderSwatches();

// ───────────────────────── Detección: Auto / Modelo (+ talla)
// Talla: reescala el contorno a las medidas de esa talla (mismo diseño, distinto calibre)
function withSize(m, talla) {
  if (!m?.sizes?.length) return m;
  const s = m.sizes.find((x) => x.talla === talla) || m.sizes.find((x) => x.lensWidthMm === m.A) || m.sizes[0];
  const kx = s.lensWidthMm / m.A, ky = s.lensHeightMm / m.Bh;
  return { ...m, talla: s.talla, A: s.lensWidthMm, Bh: s.lensHeightMm, dbl: s.bridgeMm, medidas: s.medidas,
    outline: m.outline.map(([x, y]) => [x * kx, y * ky]) };
}
function selectSize(talla) {
  cfg.catalog.size = talla;
  const m = catalog.models.find((x) => x.id === cfg.catalog.modelId);
  detector.catalogModel = withSize(m, talla);
  detector.reset(); onConfigChange(); renderDetect();
}
function selectModel(id) {
  const m = catalog.models.find((x) => x.id === id) || null;
  cfg.catalog.modelId = m ? m.id : '';
  cfg.catalog.size = '';
  detector.catalogModel = withSize(m, '');
  clearAuto();
  if (m) { cfg.detect.model = 'catalog'; analytics.track('model_pick', { id: m.id }); }
  else if (cfg.detect.model === 'catalog') cfg.detect.model = 'auto';
  if (m?.tints && !m.tints.includes(cfg.lens.preset)) {
    const p = PRESETS.find((x) => x.id === m.tints[0]);
    if (p) applyPreset(cfg, p);
  }
  detector.reset();
  debug.refresh(); onConfigChange(); renderDetect();
}
// ───────────────────────── Reconocimiento automático del modelo (sólo modo Auto)
// La detección por rayos aprende el contorno del aro; cada ~300 ms lo comparamos contra los planos de
// todo el catálogo. Cuando un modelo gana con claridad, pasamos a su contorno de fábrica (ajuste exacto)
// sin salir de "Auto". Si la persona se quita los lentes o se va, se olvida.
const matcher = new AutoMatcher();
const tuner = new Tuner({ catalog, cfg, detector, matcher, app, selectModel: (id) => selectModel(id), selectSize: (t) => selectSize(t), openPicker: () => openPicker(), toast: (m) => toast(m) });
window.__vto.matcher = matcher;
function clearAuto() {
  if (detector.autoModel) { detector.autoModel = null; detector.reset(); }
  matcher.reset(); app.autoT = 0; app.noFrameSince = null;
  renderAutoChip();
}
function stepAuto(now) {
  if (cfg.detect.model !== 'auto' || !cfg.catalog.autoRecognize || !matcher.models.length || !app.B || !app.lm) return;
  if (detector.autoModel) {
    // Sin evidencia de armazón por un rato ⇒ ya no trae esos lentes
    if (!detector.bridgeOn) { app.noFrameSince ??= now; if (now - app.noFrameSince > 1500) clearAuto(); }
    else app.noFrameSince = null;
    return;
  }
  if (now - (app.autoT || 0) < 300) return;
  app.autoT = now;
  const B = app.B, frontal = Math.abs(B.yaw) < 0.32 && Math.abs(B.pitch) < 0.3;
  const sh = app.shapes?.find?.((x) => x.side === 1);
  if (!frontal || !detector.detected || !sh?.radii) return;
  const n = sh.radii.length, conf = new Float32Array(n);
  let mc = 0;
  for (let i = 0; i < n; i++) { conf[i] = Math.max(...detector.sides.map((sd) => sd.accConf[i])); mc += conf[i] / n; }
  if (mc < cfg.catalog.autoMinConf) return;
  detector.tpl.measureScale(B, app.lm, cfg);
  matcher.evaluate(sh.radii, conf, cfg.prior, detector.tpl.mmPerS);
  const win = matcher.decide(cfg);
  if (!win) return;
  const m = catalog.models.find((x) => x.id === win.id);
  detector.autoModel = withSize(m, win.talla);
  detector.tpl.reset();
  analytics.track('auto_model', { id: m.id, talla: detector.autoModel.talla || '', score: +win.score.toFixed(3) });
  renderAutoChip();
}
function renderAutoChip() {
  const a = detector.autoModel, el = $('auto-chip');
  if (!el) return;
  el.hidden = !a || cfg.detect.model !== 'auto';
  if (a) el.textContent = a.name + (a.sizes?.length > 1 && a.talla ? ' · ' + a.talla : '');
}
// Tocar el modelo reconocido lo "confirma": pasa a modo Modelo con ese armazón (y deja elegir talla)
$('auto-chip').onclick = () => { const a = detector.autoModel; if (a) { selectModel(a.id); if (a.talla) selectSize(a.talla); } };

function renderDetect() {
  const cur = catalog.models.find((m) => m.id === cfg.catalog.modelId);
  $('mode-auto').setAttribute('aria-checked', String(!cur));
  $('mode-model').setAttribute('aria-checked', String(!!cur));
  $('mode-auto-label').hidden = !!cur;
  $('mode-model-info').hidden = !cur;
  renderAutoChip();
  const sizes = $('sizes');
  sizes.innerHTML = '';
  if (!cur) return;
  $('model-chip').textContent = cur.name;
  if (cur.sizes?.length > 1) {
    const t = detector.catalogModel?.talla;
    for (const z of cur.sizes) {
      const b = document.createElement('button');
      b.className = 'chip' + (z.talla === t ? ' solid' : '');
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(z.talla === t));
      b.setAttribute('aria-label', `Talla ${z.talla} (${z.medidas})`);
      b.textContent = z.talla;
      b.onclick = () => selectSize(z.talla);
      sizes.appendChild(b);
    }
  }
}
$('mode-auto').onclick = () => selectModel('');
$('mode-model').onclick = openPicker;
$('model-chip').onclick = openPicker;

// Debug oculto: 3 toques rápidos sobre "Detección"
{
  let taps = [];
  $('detect-title').addEventListener('pointerdown', () => {
    const t = performance.now();
    taps = taps.filter((x) => t - x < 900); taps.push(t);
    if (taps.length >= 3) { taps = []; debug.togglePanel(); }
  });
}

// ───────────────────────── Catálogo: ¿Qué armazón traes puesto? (A–Z)
const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
function letterOf(name) { const c = fold(name).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; }
function lensSvg(m) {
  const P = m.outline; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const w = x1 - x0, h = y1 - y0, gap = Math.max(2, m.dbl * 0.25), W = 2 * w + gap;
  const path = (dx, flip) => 'M' + P.map(([x, y]) => `${(dx + (flip ? x1 - x : x - x0)).toFixed(2)},${(y1 - y).toFixed(2)}`).join('L') + 'Z';
  return `<svg viewBox="0 0 ${W.toFixed(2)} ${h.toFixed(2)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path d="${path(0, true)}"/><path d="${path(w + gap, false)}"/></svg>`;
}
function renderPicker() {
  const list = $('picker-list'), idx = $('picker-index');
  list.innerHTML = ''; idx.innerHTML = '';
  const sorted = [...catalog.models].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  const groups = new Map();
  for (const m of sorted) { const L = letterOf(m.name); if (!groups.has(L)) groups.set(L, []); groups.get(L).push(m); }
  for (const [L, ms] of groups) {
    const g = document.createElement('section');
    g.className = 'letter-group'; g.id = 'pick-' + L;
    g.innerHTML = `<h4>${L}</h4><div class="letter-items"></div>`;
    const items = g.lastElementChild;
    for (const m of ms) {
      const b = document.createElement('button');
      b.className = 'pick' + (m.id === cfg.catalog.modelId ? ' active' : '');
      b.innerHTML = `${lensSvg(m)}<span>${m.name}</span>`;
      b.onclick = () => { selectModel(m.id); closePicker(); };
      items.appendChild(b);
    }
    list.appendChild(g);
  }
  for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const b = document.createElement('button');
    b.textContent = L; b.disabled = !groups.has(L);
    b.onclick = () => $('pick-' + L)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    idx.appendChild(b);
  }
}
function openPicker() {
  if (!catalog.models.length) return;
  renderPicker();
  $('picker').classList.remove('hidden');
  const cur = cfg.catalog.modelId && document.querySelector('.pick.active');
  if (cur) cur.scrollIntoView({ block: 'center' }); else $('picker-list').scrollTop = 0;
}
function closePicker() { $('picker').classList.add('hidden'); }
$('picker-close').onclick = closePicker;
$('hint').onclick = () => { if (!app.guide) openPicker(); };

// ───────────────────────── Guía de distancia y encuadre
// Medimos la cara en coordenadas de PANTALLA (el canvas se recorta con object-fit: cover). La distancia
// entre comisuras externas ≈ 9 cm: si ocupa muy poco del ancho, la persona está lejos (el aro se ve chico
// y el ajuste empeora); si ocupa mucho, está demasiado cerca. Un mensaje sólo aparece si la condición dura
// 0.8 s, y se va en cuanto se corrige (sin parpadeos).
function framingGuide() {
  const now = performance.now();
  let want = null;
  if (app.B && app.lm && app.kind === 'camera' && cfg.guide.enabled) {
    const vw = innerWidth, vh = innerHeight, k = Math.max(vw / app.W, vh / app.H);
    const ox = (vw - app.W * k) / 2, oy = (vh - app.H * k) / 2;
    const r = (app.B.s * k) / vw;
    const lm = app.lm, cx = ((lm[33][0] + lm[263][0]) / 2) * k + ox, cy = ((lm[33][1] + lm[263][1]) / 2) * k + oy;
    if (r < cfg.guide.minRel) want = ['Acércate un poco', 'a la pantalla'];
    else if (r > cfg.guide.maxRel) want = ['Aléjate un poco', 'de la pantalla'];
    else if (Math.abs(cx - vw / 2) > vw * cfg.guide.centerTol || cy < vh * 0.18 || cy > vh * 0.62) want = ['Colócate al centro', 'de la pantalla'];
  }
  const key = want ? want[0] : '';
  if (key !== app.guideKey) { app.guideKey = key; app.guideSince = now; }
  if (!want) return null;
  return now - app.guideSince > cfg.guide.delaySec * 1000 ? want : (app.guide ? want : null);
}

// ───────────────────────── Pantalla de espera (Figma 1561:1700)
// Sin nadie enfrente: cámara oscurecida + "Pruébate solar o entintado al instante". En cuanto aparece una
// cara (0.4 s seguidos) pasa directo a la vista de espejo; si se va por idleSec, regresa.
function stepIdle(now) {
  const el = $('idle');
  if (app.kind !== 'camera' || tuner.on) { if (app.idle) { app.idle = false; el.classList.add('hidden'); $('ui').classList.remove('idle'); } return; }
  if (app.lm) { app.faceSince ??= now; app.noFaceSince = null; app.everFace = true; } else { app.faceSince = null; app.noFaceSince ??= now; }
  const wait = app.everFace ? cfg.guide.idleSec * 1000 : 0; // al arrancar se ve directo la pantalla de espera
  const show = app.idle ? !(app.faceSince && now - app.faceSince > 400) : !!(app.noFaceSince && now - app.noFaceSince >= wait);
  if (show !== app.idle) {
    app.idle = show;
    el.classList.toggle('hidden', !show);
    $('ui').classList.toggle('idle', show);
  }
}

// ───────────────────────── Mensaje central: sugerir modelo / calibrar
function setHint(lines, { calibrating = false, prog = 0, pulse = false } = {}) {
  const el = $('hint');
  if (!lines) { el.classList.add('hidden'); return; }
  const html = lines.map((l) => `<span>${l}</span>`).join('');
  if ($('hint-text').innerHTML !== html) $('hint-text').innerHTML = html;
  el.classList.remove('hidden');
  el.classList.toggle('calibrating', calibrating);
  el.classList.toggle('pulse', pulse);
  $('hint-ring').style.strokeDashoffset = String(125.66 * (1 - prog));
}
function updateHint() {
  const tpl = detector.tpl;
  const catalogMode = cfg.detect.model === 'catalog' && detector.catalogModel;
  const autoLow = !catalogMode && app.B && detector.glassesScore < cfg.catalog.suggestConf && catalog.models.length;
  if (autoLow) app.lowSince ??= performance.now(); else app.lowSince = null;
  const suggest = autoLow && performance.now() - app.lowSince > cfg.catalog.suggestAfterSec * 1000;
  const pickerOpen = !$('picker').classList.contains('hidden');
  const guide = framingGuide();
  app.guide = !!guide;
  if (!app.B || app.before || pickerOpen || app.idle) setHint(null);
  else if (guide) setHint(guide, { pulse: false });
  else if (catalogMode && !tpl.locked)
    setHint(tpl.frontal ? ['Mantén la vista', 'al frente…'] : ['Voltea a ver de frente', 'a la cámara'], { calibrating: true, prog: tpl.progress });
  else if (suggest) setHint(['Para un ajuste perfecto', 'elige tu modelo'], { pulse: true });
  else setHint(null);
}

// ───────────────────────── Fuentes
function setSource(el, kind) {
  app.src = el; app.kind = kind;
  app.lm = null; app.B = null; app.tries = 0; app.lastVideoTime = -1; app.paused = false;
  basis.reset(); detector.reset();
  $('start').classList.add('hidden');
  $('ui').classList.remove('hidden');
  applyView();
}

function stopCamera() {
  app.stream?.getTracks().forEach((t) => t.stop());
  app.stream = null;
}

async function startCamera() {
  setStatus('Solicitando cámara…');
  try {
    stopCamera();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: app.facing, width: { ideal: 1280 }, height: { ideal: 1280 }, aspectRatio: { ideal: innerWidth / innerHeight }, frameRate: { ideal: 30 } },
      audio: false,
    });
    app.stream = stream;
    video.removeAttribute('src');
    video.srcObject = stream;
    await video.play();
    setStatus('');
    setSource(video, 'camera');
  } catch (e) {
    console.error(e);
    $('start').classList.remove('hidden');
    $('btn-cam').disabled = false;
    setStatus(
      e.name === 'NotAllowedError'
        ? 'Necesitamos permiso para usar la cámara.'
        : `No pudimos abrir la cámara (${e.name}).`
    );
  }
}

async function loadFile(file) {
  const url = URL.createObjectURL(file);
  if (file.type.startsWith('image/')) {
    stopCamera();
    const img = new Image();
    img.src = url;
    await img.decode();
    setSource(img, 'image');
  } else if (file.type.startsWith('video/')) {
    stopCamera();
    video.srcObject = null;
    video.src = url; video.loop = true;
    await video.play();
    setSource(video, 'file');
  }
}

// Carga por URL (?src=media/archivo.mp4|jpg) — útil donde la cámara está bloqueada (p. ej. navegador embebido)
async function loadUrl(url) {
  const isImg = /\.(jpe?g|png|webp|gif|avif)$/i.test(url.split('?')[0]);
  stopCamera();
  if (isImg) {
    const img = new Image();
    img.src = url;
    await img.decode();
    setSource(img, 'image');
  } else {
    video.srcObject = null;
    video.src = url; video.loop = true;
    await video.play();
    setSource(video, 'file');
  }
}
window.__vto.loadUrl = loadUrl;
window.__vto.selectModel = (id) => selectModel(id);
window.__vto.selectSize = (t) => selectSize(t);
window.__vto.report = buildReport;
// Nota para Claude (persistente por navegador)
const noteEl = document.getElementById('note');
try { noteEl.value = localStorage.getItem('vto-micas:note') || ''; } catch {}
noteEl.addEventListener('input', () => { try { localStorage.setItem('vto-micas:note', noteEl.value); } catch {} });

$('btn-cam').onclick = startCamera;
$('file').onchange = (e) => e.target.files[0] && loadFile(e.target.files[0]);
// ───────────────────────── Antes / después (mantener presionado; un toque lo deja 3 s)
function setBefore(v) {
  if (v && !app.before) analytics.track('before');
  app.before = v;
  $('compare').setAttribute('aria-pressed', String(v));
}
{
  const b = $('compare');
  let downT = 0, latch = null;
  b.addEventListener('pointerdown', (e) => { b.setPointerCapture?.(e.pointerId); downT = performance.now(); clearTimeout(latch); setBefore(true); });
  const up = () => {
    if (!downT) return;
    const tap = performance.now() - downT < 280; downT = 0;
    if (tap) latch = setTimeout(() => setBefore(false), 3000); else setBefore(false);
  };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  b.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setBefore(!app.before); } });
}
function openUsage() {
  const names = Object.fromEntries([...PRESETS.map((p) => [p.id, (p.name || p.id) + (p.photo ? '' : ' polarizada')]), ...catalog.models.map((m) => [m.id, m.name])]);
  openReport(analytics, names);
}

window.addEventListener('keydown', (e) => {
  if (e.target.closest('textarea, input, .lil-gui')) return;
  const k = e.key.toLowerCase();
  if (k === 'b') setBefore(true);
  else if (k === 'd') debug.togglePanel();
  else if (k === 'p') { app.paused = !app.paused; toast(app.paused ? 'Frame congelado' : 'En vivo'); }
  else if (k === 'r') { detector.reset(); toast('Forma reiniciada / recalibrando'); }
  else if (k === 'l') { cfg.detect.lock = !cfg.detect.lock; onConfigChange(); toast(cfg.detect.lock ? 'Forma bloqueada' : 'Forma desbloqueada'); }
  else if (k === 's') snapshot();
  else if (k === 'c') copyText(JSON.stringify(buildReport(), null, 2), 'Reporte');
  else if (k === 'u') $('file').click(); // subir foto/video de prueba
  else if (k === 'f') { app.facing = app.facing === 'user' ? 'environment' : 'user'; startCamera(); }
  else if (k === 'escape') closePicker();
});
window.addEventListener('keyup', (e) => { if (e.key.toLowerCase() === 'b') setBefore(false); });

// Medidor de rendimiento mínimo (?perf) para probar en la tablet sin abrir el debug
const PERF = new URLSearchParams(location.search).has('perf') ? Object.assign(document.body.appendChild(document.createElement('div')), { className: 'perf mono' }) : null;

// ───────────────────────── Loop principal
function sourceSize() {
  if (!app.src) return [0, 0];
  return app.kind === 'image' ? [app.src.naturalWidth, app.src.naturalHeight] : [video.videoWidth, video.videoHeight];
}

function frame() {
  requestAnimationFrame(frame);
  if (!app.src) return;
  const now = performance.now();
  const dt = app.lastT ? Math.min(0.1, (now - app.lastT) / 1000) : 1 / 60;
  app.lastT = now;
  app.fps += (1 / Math.max(dt, 1e-3) - app.fps) * 0.1;

  const [W, H] = sourceSize();
  if (!W || !H) return;
  if (W !== app.W || H !== app.H) { app.W = canvas.width = W; app.H = canvas.height = H; }

  let src = app.src;
  if (app.paused) {
    if (!app.freeze) {
      app.freeze = document.createElement('canvas');
      app.freeze.width = W; app.freeze.height = H;
      app.freeze.getContext('2d').drawImage(src, 0, 0, W, H);
    }
    src = app.freeze;
  } else app.freeze = null;

  // Capa 1 · tracking (solo cuando hay frame nuevo)
  // En foto reintentamos hasta encontrar rostro (el tracker en modo VIDEO puede fallar el primer intento)
  // Video: sólo trabajamos cuando la cámara entrega un cuadro nuevo (la pantalla refresca a 60-120 Hz, la cámara a ~30)
  if (app.kind !== 'image' && !app.paused) {
    if (video.currentTime === app.lastFrameT && !app.dirty) return;
    app.lastFrameT = video.currentTime;
  }
  app.dirty = false;
  const isNew = app.kind === 'image' ? !app.lm && app.tries < 40 : true;
  // Modo ligero (tablets): si cada cuadro tarda > 40 ms, alternamos rostro (cuadros pares) y aro (impares)
  // en vez de hacer las dos cosas en el mismo cuadro; el tinte se redibuja en todos.
  app.frameN = (app.frameN || 0) + 1;
  const fdt = app.lastWorkT ? now - app.lastWorkT : 33; app.lastWorkT = now;
  const wdt = app.kind === 'image' ? dt : Math.min(0.1, fdt / 1000); // dt entre cuadros procesados
  app.frameMs = (app.frameMs ?? 33) * 0.9 + Math.min(200, fdt) * 0.1;
  // Cámara a ~30 fps ⇒ 33 ms por cuadro. Si rostro + aro + dibujo no caben, modo ligero (con histéresis).
  const work = app.ms.track + (app.ms.detectFull || 0) + app.ms.render;
  if (work > 30) app.lite = true; else if (work < 20) app.lite = false;
  // Calidad de cámara: empezamos en alta (~1280 px). Si tras 4 s el equipo sigue en modo ligero, bajamos a 720.
  if (app.kind === 'camera' && app.lite && Math.max(app.W, app.H) > 900) {
    app.liteSince ??= now;
    if (now - app.liteSince > 4000 && !app.downscaled) {
      app.downscaled = true;
      app.stream?.getVideoTracks()[0]?.applyConstraints({ width: { ideal: 720 }, height: { ideal: 720 } }).catch(() => {});
    }
  } else app.liteSince = null;
  const trackTurn = !app.lite || app.frameN % 3 !== 0 || !app.lm; // ligero: 2 de cada 3 cuadros rostro, 1 de 3 aro
  if (!app.paused && isNew && trackTurn && tracker.landmarker) {
    app.tries++;
    const t0 = performance.now();
    const lm = tracker.detect(src, W, H, now);
    app.cnt = app.cnt || { t: 0, d: 0, r: 0 }; app.cnt.t++;
    app.ms.track = performance.now() - t0;
    if (lm) { app.lm = lm; app.noFace = 0; app.B = basis.update(lm, now / 1000); }
    else if (app.kind !== 'image' && ++app.noFace > 6) { app.lm = null; app.B = null; basis.reset(); }
    if (!lm && app.kind === 'camera') {
      app.lostSince ??= now;
      if (now - app.lostSince > cfg.catalog.lostResetSec * 1000) { // nuevo cliente
        if (cfg.lens.outdoor) setOutdoor(false);
        if (detector.autoModel || matcher.evals) clearAuto();
        if (cfg.catalog.resetModelOnLost && cfg.catalog.modelId && !tuner.on) selectModel('');
        else if (detector.tpl.frames || detector.fitter.iters) detector.reset();
      }
    } else app.lostSince = null;
  }

  // Luz + detección de aro
  const t1 = performance.now();
  if (app.B && app.lm) {
    detector.updateGeo(app.B, app.lm, cfg, wdt);
    // La luz ambiente cambia lento: basta medirla cada 4 cuadros
    if (app.frameN % 4 === 0 || !light.init) light.update(src, W, H, app.lm, wdt * 4, cfg);
    const detectTurn = !app.lite || app.frameN % 3 === 0;
    if (cfg.detect.enabled && detectTurn) {
      const S = cfg.detect.samples;
      if (app.lite) cfg.detect.samples = Math.min(S, 22);
      const td = performance.now();
      detector.update(src, W, H, app.B, cfg, app.lite ? wdt * 3 : wdt, app.lm);
      app.ms.detectFull = performance.now() - td;
      if (app.cnt) app.cnt.d++;
      cfg.detect.samples = S;
    }
    app.shapes = detector.shapes(app.B, cfg);
    stepAuto(now);
    tuner.tick();
  } else app.shapes = null;
  app.ms.detect = performance.now() - t1;

  // Capa 2 · render (en cámara, sólo si llegó un cuadro nuevo: no tiene caso repintar el mismo)
  if (app.cnt) app.cnt.r++;
  const t2 = performance.now();
  // Sólo pintamos mica si hay lentes: en automático, cuando la detección de aro los confirma; con modelo
  // elegido, siempre (el cliente nos dijo cuál trae). Aparece/desaparece con un fundido corto.
  const hasGlasses = cfg.detect.model === 'catalog' ? !!detector.catalogModel && detector.bridgeOn
    : detector.autoModel ? detector.bridgeOn
    : (detector.detected || detector.bridgeOn || cfg.detect.renderWithoutGlasses || !cfg.detect.enabled);
  const want = app.B && hasGlasses ? 1 : 0;
  app.tintA = (app.tintA ?? 0) + (want - (app.tintA ?? 0)) * (1 - Math.exp(-wdt / 0.12));
  const tint = cfg.view.showTint && !app.before && app.tintA > 0.02;
  stepPhoto(wdt);
  if (app.kind === 'camera') {
    analytics.tick(now, wdt, { face: !!app.lm, lostMs: app.lostSince ? now - app.lostSince : 0, lostLimitMs: cfg.catalog.lostResetSec * 1000,
      lens: cfg.lens.preset, tinted: tint && app.tintA > 0.5, preset: cfg.lens.preset });
    app.frameAt = Date.now();
  }
  const canCompare = app.before || (app.B && app.tintA > 0.5);
  if (canCompare !== app.canCompare) { app.canCompare = canCompare; $('compare').classList.toggle('off', !canCompare); }
  renderer.draw(ctx, src, W, H, { cfg, B: app.B, light: light.s, shapes: app.shapes, tint, lite: app.lite, frameN: app.frameN, tintColor: tintColor(), alpha: app.tintA, polarized: !photoPreset() });
  app.ms.render = performance.now() - t2;

  // Capa 3 · debug
  if (!app.before)
    debug.drawOverlays(ctx, { cfg, B: app.B, lm: app.lm, detector, light: light.s, shapes: app.shapes, W, H });
  debug.hud({ app, B: app.B, detector, light: light.s, render: renderer.info, tracker }, now);
  stepIdle(now);
  updateHint();
  if (PERF && now - (app.perfT || 0) > 1000) {
    const c = app.cnt || { t: 0, d: 0, r: 0 }, sec = (now - (app.perfT || now)) / 1000 || 1;
    app.rates = `cámara ${(c.r / sec).toFixed(0)} · rostro ${(c.t / sec).toFixed(0)} · aro ${(c.d / sec).toFixed(0)} /s`;
    app.cnt = { t: 0, d: 0, r: 0 };
    app.perfT = now;
    PERF.textContent = `v${VERSION} · ${app.rates || ''}${app.lite ? ' (ligero)' : ''} · ${app.W}×${app.H} · track ${app.ms.track.toFixed(1)} · detect ${app.ms.detect.toFixed(1)} · render ${app.ms.render.toFixed(1)} ms · ${tracker.delegate || ''}`;
  }
}

// ───────────────────────── Arranque (kiosko: la cámara abre sola)
(async () => {
  cfg.lens.outdoor = false; // cada arranque empieza en interior
  if (new URLSearchParams(location.search).has('debug')) cfg.debug.panel = true;
  else cfg.debug.panel = false;
  debug.refresh(); onConfigChange();
  if (!cfg.debug.panel) debug.gui?.show(false);
  $('start').classList.remove('hidden');
  $('btn-cam').disabled = true;
  try {
    await tracker.init(setStatus);
    try {
      catalog.models = await loadCatalog();
      applyTunes(catalog.models);
      matcher.setCatalog(catalog.models);
      const m = catalog.models.find((x) => x.id === cfg.catalog.modelId);
      detector.catalogModel = m ? withSize(m, cfg.catalog.size) : null;
      if (!m && cfg.detect.model === 'catalog') cfg.detect.model = 'auto';
    } catch (e) { console.warn('[VTO] sin catálogo', e); }
    renderDetect(); renderSwatches();
    setStatus('');
    const qs = new URLSearchParams(location.search).get('src');
    if (qs) await loadUrl(qs).catch((e) => setStatus('No se pudo cargar ' + qs + ': ' + e.message));
    else await startCamera();
  } catch (e) {
    console.error(e);
    setStatus('No se pudo cargar el modelo de rostro: ' + e.message);
  }
  requestAnimationFrame(frame);
  kiosk.start({
    lastFrameAt: () => app.frameAt || Date.now(),
    isCamera: () => app.kind === 'camera' && !app.paused,
    restartCamera: () => startCamera(),
    idleMs: () => (app.lm ? 0 : performance.now() - (app.lostSince ?? 0)),
  });
  if (new URLSearchParams(location.search).has('reporte')) openUsage();
  if (new URLSearchParams(location.search).has('ajuste')) tuner.open();
  // Actualización silenciosa: si subiste una versión nueva, se recarga sola cuando no hay nadie enfrente
  startUpdater(VERSION, () => !!app.idle || (app.kind === 'camera' && !app.lm && performance.now() - (app.lostSince ?? 0) > 30000));
})();
