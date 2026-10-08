// Ajuste por modelo (?ajuste, o debug › Ajuste por modelo). Se hace UNA vez, antes del lanzamiento:
// Zul se prueba cada armazón en tienda, corrige tamaño/altura de la mica, prueba el reconocimiento
// automático y marca el modelo como listo. Todo se guarda en la tablet al instante y se exporta
// (hoja central o JSON) para integrarlo a catalog/models.json → así llega a todas las tiendas.
import { send, remoteEnabled } from './remote.js';

const KEY = 'vto-micas:tune:v1';

export function loadTunes() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
function saveTunes(t) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch {} }

/** Aplica ajustes guardados en esta tablet sobre los del catálogo (los locales mandan). */
export function applyTunes(models) {
  const t = loadTunes();
  for (const m of models) if (t[m.id]?.k || t[m.id]?.dy) m.tune = { k: t[m.id].k ?? 1, dy: t[m.id].dy ?? 0 };
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
  rec(id = this.id) { return (this.data[id] ??= { k: 1, dy: 0, status: '' }); }

  open() {
    if (!this.h.catalog.models.length) return;
    this.on = true;
    document.documentElement.classList.add('tuning');
    const L = this.list();
    const first = L.find((m) => !this.data[m.id]?.status) || L[0];
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
    this.draw();
  }
  step(d) { const L = this.list(), i = L.findIndex((m) => m.id === this.id); this.go(L[(i + d + L.length) % L.length].id); }

  setTune(k, dy) {
    const r = this.rec(); r.k = k; r.dy = dy; r.t = Date.now();
    const m = this.cur(); m.tune = { k, dy };
    if (this.h.detector.catalogModel?.id === m.id) this.h.detector.catalogModel.tune = m.tune;
    saveTunes(this.data);
  }

  // Se llama en cada cuadro: muestra el reconocimiento en vivo y junta la evidencia de armazón
  tick() {
    if (!this.on) return;
    const { detector, matcher, app, cfg } = this.h;
    if (cfg.catalog.modelId && cfg.catalog.modelId !== this.id && this.mode === 'fit') { this.id = cfg.catalog.modelId; this.draw(); } // eligió desde la lista
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
  flushEv() {
    if (!this.id || this.ev.length < 10) { this.ev = []; return; }
    const s = [...this.ev].sort((a, b) => a - b), r = this.rec();
    r.ev = { p10: +s[Math.floor(s.length * 0.1)].toFixed(3), med: +s[s.length >> 1].toFixed(3), n: s.length };
    this.ev = []; saveTunes(this.data);
  }

  onInput(e) {
    const r = this.rec();
    if (e.target.name === 'k') this.setTune(+e.target.value / 100, r.dy);
    else if (e.target.name === 'dy') this.setTune(r.k, +e.target.value);
    else return;
    this.el.querySelector(`[data-v="${e.target.name}"]`).textContent = e.target.name === 'k' ? `${e.target.value} %` : `${(+e.target.value).toFixed(2)} mm`;
  }

  onClick(e) {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    const r = this.rec();
    if (a === 'close') this.close();
    else if (a === 'prev') this.step(-1);
    else if (a === 'next') this.step(1);
    else if (a === 'list') this.h.openPicker();
    else if (a === 'reset') { this.setTune(1, 0); this.draw(); }
    else if (a === 'ok' || a === 'skip') { r.status = a === 'ok' ? 'listo' : 'no-esta'; r.t = Date.now(); this.flushEv(); saveTunes(this.data); this.step(1); }
    else if (a === 'recog') { this.mode = 'recog'; this.recog = null; this.h.selectModel(''); this.h.matcher.reset(); this.draw(); }
    else if (a === 'fit') { this.mode = 'fit'; this.h.selectModel(this.id); this.draw(); }
    else if (a === 'size') { this.h.selectSize(e.target.closest('[data-a]').dataset.t); this.draw(); }
    else if (a === 'export') this.export();
  }

  rows() {
    return Object.entries(this.data).filter(([, r]) => r.status || r.k !== 1 || r.dy || r.recog)
      .map(([id, r]) => ({ id, name: this.h.catalog.models.find((m) => m.id === id)?.name || id, ...r }));
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

  draw() {
    const m = this.cur(); if (!m) return;
    const r = this.rec(), L = this.list(), i = L.findIndex((x) => x.id === m.id);
    const done = L.filter((x) => this.data[x.id]?.status).length;
    const tallas = m.sizes?.length > 1 ? m.sizes.map((z) => `<button class="chip${this.h.detector.catalogModel?.talla === z.talla ? ' solid' : ''}" data-a="size" data-t="${z.talla}">${z.talla}</button>`).join('') : '';
    const rc = r.recog ? (r.recog.ok ? '✓ Lo reconoce' : `✗ Lo confunde con ${this.h.catalog.models.find((x) => x.id === r.recog.got)?.name || r.recog.got}`) : 'Sin probar';
    this.el.innerHTML = `
      <header class="tune-head">
        <div><h2>Ajuste por modelo</h2><p>${done} de ${L.length} listos · se guarda solo en esta tablet</p></div>
        <button class="icon-btn" data-a="close" aria-label="Cerrar"><img src="assets/ui/close.svg" alt="" width="24" height="24"></button>
      </header>
      <div class="tune-model">
        <button class="tune-nav" data-a="prev" aria-label="Anterior">‹</button>
        <button class="tune-name" data-a="list"><b>${m.name}</b><span>${i + 1} / ${L.length}${r.status ? ' · ' + (r.status === 'listo' ? 'listo' : 'no está en tienda') : ''}</span></button>
        <button class="tune-nav" data-a="next" aria-label="Siguiente">›</button>
      </div>
      ${this.mode === 'fit' ? `
        ${tallas ? `<div class="tune-sizes">${tallas}</div>` : ''}
        <label class="tune-row"><span>Tamaño</span><input type="range" name="k" min="88" max="112" step="0.5" value="${(r.k * 100).toFixed(1)}"><b data-v="k">${(r.k * 100).toFixed(1)} %</b></label>
        <label class="tune-row"><span>Altura</span><input type="range" name="dy" min="-3" max="3" step="0.25" value="${r.dy}"><b data-v="dy">${r.dy.toFixed(2)} mm</b></label>
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
