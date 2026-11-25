/**
 * VTO Micas · hoja central de reportes.
 * Instalación (una vez):
 *  1. Crea una Google Sheet nueva → Extensiones → Apps Script → pega este archivo.
 *  2. Implementar → Nueva implementación → Tipo "App web" → Ejecutar como: Yo · Acceso: Cualquier usuario.
 *  3. Copia la URL (…/exec) y pásasela a Claude para ponerla en REMOTE_URL (src/config.js).
 * Cada tablet manda su tienda (?tienda=polanco) → columna "tienda" para filtrar / hacer tablas dinámicas.
 * Y su país (mx / cl, según la URL …/vto-micas/cl/) → columna "pais" al final; fecha y hora en la zona del país.
 * Si ya tenías la hoja: pega esta versión y vuelve a implementar (Implementar › Administrar › editar › Nueva versión);
 * la columna "pais" se agrega sola al final; si una pestaña tenía otras columnas, se renombra a "(anterior …)" y se crea nueva.
 */
const VISITAS = ['recibido', 'tienda', 'dispositivo', 'version', 'fecha', 'hora', 'duracion_s', 'con_mica_s', 'colores', 'cambios',
  'exterior', 'antes', 'modelo_elegido', 'modelo_auto', 'segundos_por_color', 'pais', 'prueba'];
const AJUSTES = ['recibido', 'tienda', 'modelo_id', 'modelo', 'talla', 'estado', 'tamano', 'altura_mm', 'puente_mm', 'reconoce', 'confunde_con', 'evidencia_med', 'evidencia_p10', 'pais'];
// Monitor de tablets: hoja aparte "VTO Micas · Tablets" (una fila por tablet; su primera pestaña la lee el tablero)
const TABLETS_ID = '1_X-7q8XGpsaimrAPqZM58dTzM24t5kl-JkE6b5dFnlg';
const TABLETS = ['dispositivo', 'tienda', 'pais', 'version', 'primera_senal', 'ultima_senal', 'ultima_ms', 'camara', 'por_enviar', 'senales'];
const TZ = { mx: 'America/Mexico_City', cl: 'America/Santiago' };

function sheet_(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (sh) {
    const cur = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].filter(String);
    if (cur.join('|') !== head.join('|')) {
      if (head.slice(0, cur.length).join('|') === cur.join('|')) sh.getRange(1, 1, 1, head.length).setValues([head]); // sólo columnas nuevas al final
      else { sh.setName(name + ' (anterior ' + Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd') + ')'); sh = null; } // columnas cambiadas: se archiva
    }
  }
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); }
  return sh;
}

function doPost(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.app !== 'vto-micas') return out_({ ok: false });
    const now = new Date(), store = String(d.store || 'sin-tienda').slice(0, 40);
    const pais = String(d.pais || 'mx').slice(0, 4), tz = TZ[pais] || TZ.mx;
    if (d.kind === 'visits') {
      const rows = (d.visits || []).slice(0, 500).map((v) => {
        const t = new Date(v.t);
        return [now, store, d.device, d.version, Utilities.formatDate(t, tz, 'yyyy-MM-dd'),
          Utilities.formatDate(t, tz, 'HH:mm:ss'), v.dur, v.tintSec, (v.colors || []).join(' > '), v.picks,
          v.outdoor, v.before, v.model || '', v.auto || '', Object.keys(v.dwell || {}).map((k) => k + ':' + v.dwell[k]).join(' '), pais, d.prueba ? 1 : 0];
      });
      if (rows.length) { const sh = sheet_('Visitas', VISITAS); sh.getRange(sh.getLastRow() + 1, 1, rows.length, VISITAS.length).setValues(rows); }
    } else if (d.kind === 'tune') {
      const rows = (d.models || []).slice(0, 500).map((m) => [now, store, m.id, m.name, m.talla || '', m.status || '', m.k, m.dy, m.dbx || 0,
        m.recog ? (m.recog.ok ? 'sí' : 'no') : '', m.recog && !m.recog.ok ? m.recog.got : '', m.ev ? m.ev.med : '', m.ev ? m.ev.p10 : '', pais]);
      if (rows.length) { const sh = sheet_('Ajustes', AJUSTES); sh.getRange(sh.getLastRow() + 1, 1, rows.length, AJUSTES.length).setValues(rows); }
    } else if (d.kind === 'ping') {
      const dev = String(d.device || '').slice(0, 20);
      if (!dev || d.prueba) return out_({ ok: false });
      const sh = SpreadsheetApp.openById(TABLETS_ID).getSheets()[0];
      sh.getRange(1, 1, 1, TABLETS.length).setValues([TABLETS]);
      const n = sh.getLastRow();
      const ids = n > 1 ? sh.getRange(2, 1, n - 1, 1).getValues().map((r) => String(r[0])) : [];
      const i = ids.indexOf(dev), when = "'" + Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm');
      const prev = i >= 0 ? sh.getRange(i + 2, 1, 1, TABLETS.length).getValues()[0] : null;
      const row = [dev, store, pais, d.version || '', prev ? "'" + prev[4] : when, when, now.getTime(), d.camara || '', Number(d.por_enviar) || 0, (prev ? Number(prev[9]) || 0 : 0) + 1];
      sh.getRange(i >= 0 ? i + 2 : n + 1, 1, 1, TABLETS.length).setValues([row]);
    }
    return out_({ ok: true });
  } finally { lock.releaseLock(); }
}

/** Córrela una vez desde el editor (▶ Ejecutar) para autorizar el acceso a la hoja de tablets. */
function probarTablets() { Logger.log(SpreadsheetApp.openById(TABLETS_ID).getName()); }

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
