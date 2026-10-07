// Reporteo de uso del probador (anónimo y local: nada sale del dispositivo).
// Unidad = "visita": empieza cuando aparece un rostro ≥ 1 s y termina cuando se va (lostResetSec).
// Por visita guardamos duración, segundos con mica pintada, segundos por color, cambios de color,
// uso de Exterior, de "Antes" y modelo elegido / reconocido. Sin imágenes ni datos personales.
const KEY = 'vto-micas:analytics:v1';
const MAX_VISITS = 8000;

const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export class Analytics {
  constructor({ device = '' } = {}) {
    this.device = device;
    this.visits = [];
    try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); this.visits = o.visits || []; this.device = o.device || device || Math.random().toString(36).slice(2, 8); } catch {}
    this.cur = null; this.faceSince = null; this.dirty = false;
    setInterval(() => this.save(), 5000);
    addEventListener('pagehide', () => { this.end(Date.now()); this.save(); });
  }

  save() {
    if (!this.dirty) return;
    this.dirty = false;
    try { localStorage.setItem(KEY, JSON.stringify({ device: this.device, visits: this.visits })); } catch {}
  }

  /** Llamar en cada cuadro procesado. face: hay rostro; lostMs: tiempo sin rostro; lens: preset visible (o null). */
  tick(now, dt, { face, lostMs = 0, lostLimitMs = 3000, lens = null, tinted = false, preset = '' }) {
    if (face) {
      this.faceSince ??= now;
      if (!this.cur && now - this.faceSince > 1000) this.begin(now, preset);
    } else this.faceSince = null;
    const v = this.cur;
    if (!v) return;
    if (!face && lostMs > lostLimitMs) { this.end(Date.now() - lostMs); return; }
    if (face && tinted && lens) { v.tintSec += dt; v.dwell[lens] = (v.dwell[lens] || 0) + dt; }
  }

  begin(now, preset) {
    this.cur = { t: Date.now(), dur: 0, tintSec: 0, dwell: {}, picks: 0, colors: preset ? [preset] : [], outdoor: 0, before: 0, model: '', auto: '' };
    this.t0 = now;
  }

  end(tEnd) {
    const v = this.cur;
    if (!v) return;
    this.cur = null;
    v.dur = Math.max(0, (tEnd - v.t) / 1000);
    if (v.dur < 2) return; // pasó frente a la cámara: no cuenta
    for (const k in v.dwell) v.dwell[k] = Math.round(v.dwell[k] * 10) / 10;
    v.dur = Math.round(v.dur * 10) / 10; v.tintSec = Math.round(v.tintSec * 10) / 10;
    this.visits.push(v);
    if (this.visits.length > MAX_VISITS) this.visits.splice(0, this.visits.length - MAX_VISITS);
    this.dirty = true;
  }

  /** Eventos sueltos dentro de la visita en curso. */
  track(e, data = {}) {
    const v = this.cur;
    if (!v) return;
    if (e === 'preset') { v.picks++; if (v.colors[v.colors.length - 1] !== data.id) v.colors.push(data.id); }
    else if (e === 'outdoor') v.outdoor++;
    else if (e === 'before') v.before++;
    else if (e === 'model_pick') v.model = data.id;
    else if (e === 'auto_model') v.auto = data.id;
  }

  clear() { this.visits = []; this.cur = null; this.dirty = true; this.save(); }

  summary(fromT = 0) {
    const vs = this.visits.filter((v) => v.t >= fromT);
    const n = vs.length, sum = (f) => vs.reduce((a, v) => a + f(v), 0);
    const dwell = {}, chosen = {}, models = {}, autos = {}, days = {}, hours = new Array(24).fill(0);
    for (const v of vs) {
      for (const k in v.dwell) dwell[k] = (dwell[k] || 0) + v.dwell[k];
      for (const c of new Set(v.colors)) chosen[c] = (chosen[c] || 0) + 1;
      if (v.model) models[v.model] = (models[v.model] || 0) + 1;
      if (v.auto) autos[v.auto] = (autos[v.auto] || 0) + 1;
      days[day(v.t)] = (days[day(v.t)] || 0) + 1;
      hours[new Date(v.t).getHours()]++;
    }
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
    const durs = vs.map((v) => v.dur).sort((a, b) => a - b);
    return {
      device: this.device, visits: n,
      medianSec: n ? durs[n >> 1] : 0,
      withGlassesPct: n ? (100 * vs.filter((v) => v.tintSec > 1).length) / n : 0,
      avgColors: n ? sum((v) => new Set(v.colors).size) / n : 0,
      outdoorPct: n ? (100 * vs.filter((v) => v.outdoor).length) / n : 0,
      beforePct: n ? (100 * vs.filter((v) => v.before).length) / n : 0,
      manualPct: n ? (100 * vs.filter((v) => v.model).length) / n : 0,
      autoPct: n ? (100 * vs.filter((v) => v.auto).length) / n : 0,
      dwell: top(dwell), chosen: top(chosen), models: top(models), autos: top(autos),
      days: Object.entries(days).sort(), hours,
    };
  }

  csv() {
    const head = ['fecha', 'hora', 'dispositivo', 'duracion_s', 'con_mica_s', 'colores', 'cambios', 'exterior', 'antes', 'modelo_elegido', 'modelo_auto', 'segundos_por_color'];
    const esc = (x) => { const s = String(x ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = this.visits.map((v) => {
      const d = new Date(v.t);
      return [day(v.t), d.toTimeString().slice(0, 8), this.device, v.dur, v.tintSec, v.colors.join(' > '), v.picks, v.outdoor, v.before, v.model, v.auto,
        Object.entries(v.dwell).map(([k, s]) => `${k}:${s}`).join(' ')].map(esc).join(',');
    });
    return '﻿' + [head.join(','), ...rows].join('\n');
  }

  json() { return JSON.stringify({ app: 'vto-micas', device: this.device, exported: new Date().toISOString(), visits: this.visits }, null, 1); }
}

/** Vista de reporte (?reporte o desde el debug). names: id → nombre legible. */
export function openReport(an, names = {}) {
  const nm = (id) => names[id] || id;
  let el = document.getElementById('report');
  if (!el) { el = document.createElement('section'); el.id = 'report'; el.className = 'report'; el.setAttribute('role', 'dialog'); document.body.appendChild(el); }
  let range = 'all';
  const draw = () => {
    const from = range === 'today' ? new Date().setHours(0, 0, 0, 0) : range === '7d' ? Date.now() - 7 * 864e5 : 0;
    const s = an.summary(from);
    const bars = (list, unit = '', f = (x) => x) => {
      const max = Math.max(1, ...list.map((x) => x[1]));
      return list.length ? list.slice(0, 12).map(([k, v]) => `<div class="bar"><span>${nm(k)}</span><i style="--w:${(100 * v / max).toFixed(1)}%"></i><b>${f(v)}${unit}</b></div>`).join('') : '<p class="muted">Sin datos todavía</p>';
    };
    const kpi = (v, l) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`;
    const hmax = Math.max(1, ...s.hours);
    el.innerHTML = `
      <header class="report-head">
        <div><h2>Reporte de uso</h2><p>Dispositivo ${s.device} · datos anónimos guardados sólo en este equipo</p></div>
        <button class="icon-btn" data-a="close" aria-label="Cerrar"><img src="assets/ui/close.svg" alt="" width="24" height="24"></button>
      </header>
      <div class="seg seg-text report-range" role="radiogroup">
        ${[['today', 'Hoy'], ['7d', '7 días'], ['all', 'Todo']].map(([k, l]) => `<button class="seg-btn" role="radio" data-r="${k}" aria-checked="${range === k}">${l}</button>`).join('')}
      </div>
      <div class="kpis">
        ${kpi(s.visits, 'visitas')}${kpi(Math.round(s.medianSec) + ' s', 'duración mediana')}
        ${kpi(Math.round(s.withGlassesPct) + ' %', 'con lentes puestos')}${kpi(s.avgColors.toFixed(1), 'colores por visita')}
        ${kpi(Math.round(s.outdoorPct) + ' %', 'probó Exterior')}${kpi(Math.round(s.beforePct) + ' %', 'usó Antes')}
        ${kpi(Math.round(s.autoPct) + ' %', 'modelo reconocido')}${kpi(Math.round(s.manualPct) + ' %', 'eligió modelo')}
      </div>
      <h3>Tiempo con cada mica</h3>${bars(s.dwell, ' s', (v) => Math.round(v))}
      <h3>Visitas que probaron cada color</h3>${bars(s.chosen)}
      <h3>Modelos reconocidos</h3>${bars(s.autos)}
      <h3>Modelos elegidos a mano</h3>${bars(s.models)}
      <h3>Visitas por hora</h3>
      <div class="hours">${s.hours.map((v, h) => `<i title="${h}:00 · ${v}" style="--h:${(100 * v / hmax).toFixed(1)}%"></i>`).join('')}</div>
      <div class="hours-l"><span>0 h</span><span>12 h</span><span>23 h</span></div>
      <div class="report-actions">
        <button class="chip solid" data-a="csv">Descargar CSV</button>
        <button class="chip" data-a="json">Descargar JSON</button>
        <button class="chip" data-a="clear">Borrar datos</button>
      </div>`;
  };
  const dl = (name, text, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  el.onclick = (e) => {
    const r = e.target.closest('[data-r]')?.dataset.r;
    if (r) { range = r; draw(); return; }
    const a = e.target.closest('[data-a]')?.dataset.a;
    const stamp = new Date().toISOString().slice(0, 10);
    if (a === 'close') el.classList.add('hidden');
    else if (a === 'csv') dl(`vto-micas-uso-${an.device}-${stamp}.csv`, an.csv(), 'text/csv;charset=utf-8');
    else if (a === 'json') dl(`vto-micas-uso-${an.device}-${stamp}.json`, an.json(), 'application/json');
    else if (a === 'clear') {
      const b = e.target.closest('[data-a]');
      if (b.dataset.confirm) { an.clear(); draw(); } else { b.dataset.confirm = '1'; b.textContent = '¿Seguro? Toca otra vez'; }
    }
  };
  draw();
  el.classList.remove('hidden');
}
