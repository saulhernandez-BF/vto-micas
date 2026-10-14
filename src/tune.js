// Ajuste por modelo (?ajuste, o debug › Ajuste por modelo). Se hace UNA vez, antes del lanzamiento:
// Zul se prueba cada armazón en tienda, corrige tamaño/altura de la mica, prueba el reconocimiento
// automático y marca el modelo como listo. Todo se guarda en la tablet al instante y se exporta
// (hoja central o JSON) para integrarlo a catalog/models.json → así llega a todas las tiendas.
import { send, remoteEnabled } from './remote.js';

// v2: desde que los ajustes de la primera vuelta en tienda viven en catalog/models.json. Los ajustes
// locales viejos (v1) se ignoran para que no tapen los del catálogo.
const KEY = 'vto-micas:tune:v2';

export function loadTunes() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
function saveTunes(t) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch {} }

// Llaves: "modelo" para modelos de una talla, "modelo@talla" para modelos con varias tallas
// (cada talla tiene su propio ajuste fino).
const splitKey = (key) => { const i = key.indexOf('@'); return i < 0 ? [key, ''] : [key.slice(0, i), key.slice(i + 1)]; };
const hasTune = (r) => r && ((r.k ?? 1) !== 1 || r.dy || r.dbx);
const tuneOf = (r) => ({ k: r.k ?? 1, dy: r.dy ?? 0, dbx: r.dbx ?? 0 });

/** Aplica ajustes guardados en esta tablet sobre los del catálogo (los locales mandan). */
export function applyTunes(models) {
  const t = loadTunes();
  for (const [key, r] of Object.entries(t)) {
    if (!hasTune(r)) continue;
    const [id, talla] = splitKey(key), m = models.find((x) => x.id === id);
    if (!m) continue;
    if (talla) (m.tunes ??= {})[talla] = tuneOf(r); else m.tune = tuneOf(r);
  }
}

export class Tuner {
  /** h: { catalog, cfg, detector, matcher, app, selectModel, selectSize, openPicker, toast } */
  constructor(h) {
    this.h = h; this.data = loadTunes(); this.on = false; this.mode = 'fit'; this.ev = [];
    this.el = document.createElement('section');
    this.el.id = 'tune'; this.el.className = 'tune hidden';
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => this.onInput(e));
  }

  list() { return [...this.h.catalog.models].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })); }
  cur() { return this.h.catalog.models.find((m) => m.id === this.id); }
  /** Talla en ajuste ('' si el modelo tiene una sola). */
  talla() { return this.cur()?.sizes?.length > 1 ? this.h.detector.catalogModel?.talla || '' : ''; }
  key(id = this.id, talla = this.talla()) { return talla ? `${id}@${talla}` : id; }
  rec(key = this.key()) {
    if (!this.data[key]) {
      // Talla nueva: arranca desde el ajuste general del modelo (si se hizo antes de separar por talla)
      // Sin ajuste local: parte del ajuste del catálogo (de la talla o del modelo)
      const [id, talla] = splitKey(key), m = this.h.catalog.models.find((x) => x.id === id);
      const base = (talla && this.data[id]) || (talla && m?.tunes?.[talla]) || m?.tune;
      this.data[key] = { k: base?.k ?? 1, dy: base?.dy ?? 0, dbx: base?.dbx ?? 0, status: '' };
    }
    this.data[key].dbx ??= 0;
    return this.data[key];
  }
  /** ¿Modelo terminado? (con tallas: todas marcadas) */
  done(m) {
    // Listo si se marcó en esta tablet, o si ya viene aprobado en el catálogo (tuneOk) y aquí no se ha tocado
    const st = (k) => this.data[k]?.status || (m.tuneOk && !this.data[k] ? 'listo' : '');
    return m.sizes?.length > 1 ? m.sizes.every((z) => st(this.key(m.id, z.talla))) || (m.tuneOk && !Object.keys(this.data).some((k) => k.startsWith(m.id + '@'))) : !!st(m.id);
  }

  open() {
    if (!this.h.catalog.models.length) return;
    this.on = true;
    document.documentElement.classList.add('tuning');
    const L = this.list();
    const first = L.find((m) => !this.done(m)) || L[0];
    this.go(this.h.cfg.catalog.modelId || first.id);
    this.el.classList.remove('hidden');
  }
  close() {
    this.on = false; this.mode = 'fit';
    document.documentElement.classList.remove('tuning');
    this.el.classList.add('hidden');
  }

  go(id) {
    this.flushEv();
    this.id = id; this.mode = 'fit'; this.recog = null;
    this.h.selectModel(id);
    // Con tallas: empezar por la primera talla pendiente
    const m = this.cur(), z = m?.sizes?.length > 1 && m.sizes.find((s) => !this.data[this.key(id, s.talla)]?.status);
    if (z) this.h.selectSize(z.talla);
    this.lastKey = this.key();
    this.draw();
  }
  /** Siguiente modelo pendiente (salta los ya aprobados); si no queda ninguno, el siguiente de la lista. */
  nextPending() {
    const L = this.list(), i = L.findIndex((m) => m.id === this.id);
    for (let j = 1; j <= L.length; j++) { const m = L[(i + j) % L.length]; if (!this.done(m)) return this.go(m.id); }
    this.step(1);
  }
  step(d) { const L = this.list(), i = L.findIndex((m) => m.id === this.id); this.go(L[(i + d + L.length) % L.length].id); }

  setTune(k, dy, dbx = this.rec().dbx) {
    const r = this.rec(); r.k = k; r.dy = dy; r.dbx = dbx; r.t = Date.now();
    const m = this.cur(), talla = this.talla(), t = { k, dy, dbx };
    if (talla) (m.tunes ??= {})[talla] = t; else m.tune = t;
    const cm = this.h.detector.catalogModel;
    if (cm?.id === m.id && (cm.talla || '') === (talla || cm.talla || '')) cm.tune = t;
    saveTunes(this.data);
  }

  // Se llama en cada cuadro: muestra el reconocimiento en vivo y junta la evidencia de armazón
  tick() {
    if (!this.on) return;
    const { detector, matcher, app, cfg } = this.h;
    if (cfg.catalog.modelId && cfg.catalog.modelId !== this.id && this.mode === 'fit') { this.flushEv(); this.id = cfg.catalog.modelId; this.lastKey = this.key(); this.draw(); } // eligió desde la lista
    if (this.mode === 'fit' && this.id && this.key() !== this.lastKey) { this.flushEvKey(this.lastKey); this.lastKey = this.key(); this.draw(); } // cambió de talla
    const br = detector.bridgeRaw; if (app.lm && br) this.ev.push(Math.max(br.bScore, br.temple)); // evidencia de armazón (puente/varillas) con este modelo
    if (this.mode === 'recog') {
      const got = detector.autoModel?.id, top = matcher.top?.[0];
      const txt = got ? `Reconoce: ${detector.autoModel.name}` : top ? `Buscando… (va ${this.h.catalog.models.find((m) => m.id === top.id)?.name || top.id})` : 'Buscando el aro…';
      const el = this.el.querySelector('[data-recog]');
      if (el && el.textContent !== txt) el.textContent = txt;
      if (got && !this.recog) {
        this.recog = got;
        const r = this.rec(); const ok = got === this.id || sameShape(matcher, got, this.id);
        r.recog = { ok, got, t: Date.now() };
        saveTunes(this.data);
        this.draw();
      }
    }
  }
  flushEv() { this.flushEvKey(this.key()); }
  flushEvKey(key) {
    if (!this.id || !key || this.ev.length < 10) { this.ev = []; return; }
    const s = [...this.ev].sort((a, b) => a - b), r = this.rec(key);
    r.ev = { p10: +s[Math.floor(s.length * 0.1)].toFixed(3), med: +s[s.length >> 1].toFixed(3), n: s.length };
    this.ev = []; saveTunes(this.data);
  }

  onInput(e) {
    const r = this.rec();
    const n = e.target.name, v = +e.target.value;
    if (n === 'k') this.setTune(v / 100, r.dy, r.dbx);
    else if (n === 'dy') this.setTune(r.k, v, r.dbx);
    else if (n === 'dbx') this.setTune(r.k, r.dy, v);
    else return;
    this.showVal(n);
  }

  onClick(e) {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    const r = this.rec();
    if (a === 'close') this.close();
    else if (a === 'prev') this.step(-1);
    else if (a === 'next') this.step(1);
    else if (a === 'list') this.h.openPicker();
    else if (a === 'reset') { this.setTune(1, 0, 0); this.draw(); }
    else if (a === 'step') {
      // Botones − / +: ajuste fino de un paso (el slider es para movimientos grandes)
      const b = e.target.closest('[data-a]'), n = b.dataset.n, d = +b.dataset.d, inp = this.el.querySelector(`input[name="${n}"]`);
      inp.value = Math.min(+inp.max, Math.max(+inp.min, +inp.value + d * +inp.step));
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    else if (a === 'ok' || a === 'skip') {
      r.status = a === 'ok' ? 'listo' : 'no-esta'; r.t = Date.now(); this.flushEv(); saveTunes(this.data);
      // Con tallas: pasar a la siguiente talla pendiente del mismo modelo antes de cambiar de modelo
      const m = this.cur(), z = m.sizes?.length > 1 && m.sizes.find((s) => !this.data[this.key(m.id, s.talla)]?.status);
      if (z) { this.h.selectSize(z.talla); this.lastKey = this.key(); this.draw(); } else this.nextPending();
    }
    else if (a === 'recog') { this.mode = 'recog'; this.recog = null; this.h.selectModel(''); this.h.matcher.reset(); this.draw(); }
    else if (a === 'fit') { this.mode = 'fit'; this.h.selectModel(this.id); this.draw(); }
    else if (a === 'size') { this.flushEv(); this.h.selectSize(e.target.closest('[data-a]').dataset.t); this.lastKey = this.key(); this.draw(); }
    else if (a === 'export') this.export();
  }

  rows() {
    return Object.entries(this.data).filter(([, r]) => r.status || r.k !== 1 || r.dy || r.dbx || r.recog)
      .map(([key, r]) => { const [id, talla] = splitKey(key); return { id, talla, name: this.h.catalog.models.find((m) => m.id === id)?.name || id, ...r }; });
  }
  async export() {
    this.flushEv();
    const rows = this.rows();
    const text = JSON.stringify({ app: 'vto-micas', kind: 'tune', exported: new Date().toISOString(), models: rows }, null, 1);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `vto-micas-ajustes-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    if (remoteEnabled()) { const ok = await send('tune', { models: rows }); this.h.toast(ok ? 'Ajustes enviados a la hoja central' : 'Sin red: quedó el JSON descargado'); }
    else this.h.toast('Ajustes descargados (JSON)');
  }

  fmt(n, v) { return n === 'k' ? `${(+v).toFixed(1)} %` : `${+v > 0 ? '+' : ''}${(+v).toFixed(2)} mm`; }
  showVal(n) { const i = this.el.querySelector(`input[name="${n}"]`); this.el.querySelector(`[data-v="${n}"]`).textContent = this.fmt(n, i.value); }
  row(n, label, min, max, step, v) {
    return `<div class="tune-row"><span>${label}</span>
      <button class="tune-step" data-a="step" data-n="${n}" data-d="-1" aria-label="${label} menos">−</button>
      <input type="range" name="${n}" min="${min}" max="${max}" step="${step}" value="${(+v).toFixed(2)}" aria-label="${label}">
      <button class="tune-step" data-a="step" data-n="${n}" data-d="1" aria-label="${label} más">+</button>
      <b data-v="${n}">${this.fmt(n, v)}</b></div>`;
  }

  draw() {
    const m = this.cur(); if (!m) return;
    const r = this.rec(), L = this.list(), i = L.findIndex((x) => x.id === m.id);
    const done = L.filter((x) => this.done(x)).length, talla = this.talla();
    const tallas = m.sizes?.length > 1 ? m.sizes.map((z) => {
      const st = this.data[this.key(m.id, z.talla)]?.status;
      return `<button class="chip${talla === z.talla ? ' solid' : ''}" data-a="size" data-t="${z.talla}">${z.talla}${st ? (st === 'listo' ? ' ✓' : ' –') : ''}</button>`;
    }).join('') : '';
    const rc = r.recog ? (r.recog.ok ? '✓ Lo reconoce' : `✗ Lo confunde con ${this.h.catalog.models.find((x) => x.id === r.recog.got)?.name || r.recog.got}`) : 'Sin probar';
    this.el.innerHTML = `
      <header class="tune-head">
        <div><h2>Ajuste por modelo</h2><p>${done} de ${L.length} listos · se guarda solo en esta tablet</p></div>
        <button class="icon-btn" data-a="close" aria-label="Cerrar"><img src="assets/ui/close.svg" alt="" width="24" height="24"></button>
      </header>
      <div class="tune-model">
        <button class="tune-nav" data-a="prev" aria-label="Anterior">‹</button>
        <button class="tune-name" data-a="list"><b>${m.name}</b><span>${i + 1} / ${L.length}${talla ? ` · talla ${talla}` : ''}${r.status ? ' · ' + (r.status === 'listo' ? 'listo' : 'no está en tienda') : m.tuneOk ? ' · aprobado (catálogo)' : ' · pendiente'}</span></button>
        <button class="tune-nav" data-a="next" aria-label="Siguiente">›</button>
      </div>
      ${this.mode === 'fit' ? `
        ${tallas ? `<div class="tune-sizes"><span>Ajuste de la talla:</span>${tallas}</div>` : ''}
        ${this.row('k', 'Tamaño', 70, 140, 0.5, r.k * 100)}
        ${this.row('dy', 'Altura', -10, 10, 0.25, r.dy)}
        ${this.row('dbx', 'Puente', -10, 10, 0.25, r.dbx)}
        <div class="tune-actions">
          <button class="chip" data-a="reset">Restablecer</button>
          <button class="chip" data-a="recog">Probar reconocimiento · ${rc}</button>
        </div>
        <div class="tune-actions">
          <button class="chip solid" data-a="ok">Queda bien · siguiente</button>
          <button class="chip" data-a="skip">No está en tienda</button>
          <button class="chip" data-a="export">Exportar ajustes</button>
        </div>` : `
        <p class="tune-recog" data-recog>Buscando el aro…</p>
        <p class="tune-help">Mira de frente unos segundos con el armazón puesto. ${this.recog ? rc : ''}</p>
        <div class="tune-actions"><button class="chip solid" data-a="fit">Volver al ajuste</button></div>`}`;
  }
}

function sameShape(matcher, a, b) {
  const ma = matcher.models.find((m) => m.id === a), mb = matcher.models.find((m) => m.id === b);
  if (!ma || !mb) return false;
  let d = 0; for (let k = 0; k < ma.sig.length; k++) d = Math.max(d, Math.abs(ma.sig[k] - mb.sig[k]));
  return d <= 0.03 && Math.abs(Math.log(ma.aspect / mb.aspect)) <= 0.03;
}
