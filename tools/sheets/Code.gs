/**
 * VTO Micas · hoja central de reportes.
 * Instalación (una vez):
 *  1. Crea una Google Sheet nueva → Extensiones → Apps Script → pega este archivo.
 *  2. Implementar → Nueva implementación → Tipo "App web" → Ejecutar como: Yo · Acceso: Cualquier usuario.
 *  3. Copia la URL (…/exec) y pásasela a Claude para ponerla en REMOTE_URL (src/config.js).
 * Cada tablet manda su tienda (?tienda=polanco) → columna "tienda" para filtrar / hacer tablas dinámicas.
 */
const VISITAS = ['recibido', 'tienda', 'dispositivo', 'version', 'fecha', 'hora', 'duracion_s', 'con_mica_s', 'colores', 'cambios',
  'exterior', 'antes', 'modelo_elegido', 'modelo_auto', 'segundos_por_color'];
const AJUSTES = ['recibido', 'tienda', 'modelo_id', 'modelo', 'estado', 'tamano', 'altura_mm', 'reconoce', 'confunde_con', 'evidencia_med', 'evidencia_p10'];

function sheet_(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); }
  return sh;
}

function doPost(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.app !== 'vto-micas') return out_({ ok: false });
    const now = new Date(), store = String(d.store || 'sin-tienda').slice(0, 40);
    if (d.kind === 'visits') {
      const rows = (d.visits || []).slice(0, 500).map((v) => {
        const t = new Date(v.t);
        return [now, store, d.device, d.version, Utilities.formatDate(t, 'America/Mexico_City', 'yyyy-MM-dd'),
          Utilities.formatDate(t, 'America/Mexico_City', 'HH:mm:ss'), v.dur, v.tintSec, (v.colors || []).join(' > '), v.picks,
          v.outdoor, v.before, v.model || '', v.auto || '', Object.keys(v.dwell || {}).map((k) => k + ':' + v.dwell[k]).join(' ')];
      });
      if (rows.length) { const sh = sheet_('Visitas', VISITAS); sh.getRange(sh.getLastRow() + 1, 1, rows.length, VISITAS.length).setValues(rows); }
    } else if (d.kind === 'tune') {
      const rows = (d.models || []).slice(0, 500).map((m) => [now, store, m.id, m.name, m.status || '', m.k, m.dy,
        m.recog ? (m.recog.ok ? 'sí' : 'no') : '', m.recog && !m.recog.ok ? m.recog.got : '', m.ev ? m.ev.med : '', m.ev ? m.ev.p10 : '']);
      if (rows.length) { const sh = sheet_('Ajustes', AJUSTES); sh.getRange(sh.getLastRow() + 1, 1, rows.length, AJUSTES.length).setValues(rows); }
    }
    return out_({ ok: true });
  } finally { lock.releaseLock(); }
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
