// Envío a la hoja central (Google Sheets vía Apps Script). La URL se configura en REMOTE_URL (config.js)
// y cada tablet se identifica con su tienda (?tienda=polanco, se recuerda en el equipo).
import { REMOTE_URL } from './config.js';
import { PAIS } from './pais.js';

const STORE_KEY = 'vto-micas:tienda';
const TEST_KEY = 'vto-micas:prueba';

// ?tienda=polanco la guarda en el equipo; ?tienda= (vacío) o ?tienda=no la borra (compus de prueba)
export function getStore() {
  const sp = new URLSearchParams(location.search);
  const q = sp.has('tienda') ? (sp.get('tienda') || '').trim().toLowerCase() : null;
  try {
    if (q === '' || q === 'no') localStorage.removeItem(STORE_KEY);
    else if (q) localStorage.setItem(STORE_KEY, q);
    return localStorage.getItem(STORE_KEY) || '';
  } catch { return q && q !== 'no' ? q : ''; }
}
/** Equipo de prueba: ?prueba lo marca (se recuerda), ?prueba=0 lo desmarca. Sus visitas llegan con prueba=1 y no se registra como tablet. */
export function isTest() {
  const sp = new URLSearchParams(location.search);
  const q = sp.has('prueba') ? !['0', 'no'].includes((sp.get('prueba') || '').trim().toLowerCase()) : null;
  try {
    if (q === true) localStorage.setItem(TEST_KEY, '1');
    else if (q === false) localStorage.removeItem(TEST_KEY);
    return localStorage.getItem(TEST_KEY) === '1';
  } catch { return !!q; }
}

/** Monitor de tablets: cada tablet con tienda (y que no sea de prueba) avisa a la hoja que está viva al arrancar y cada hora. */
export function startHeartbeat(info) {
  const beat = () => { if (getStore() && !isTest()) send('ping', info()); };
  setTimeout(beat, 20000);
  setInterval(beat, 60 * 60 * 1000);
}

export function setStore(v) { try { localStorage.setItem(STORE_KEY, String(v || '').trim().toLowerCase()); } catch {} }

export const remoteEnabled = () => !!REMOTE_URL;

/** POST sin CORS (Apps Script no expone cabeceras): si la red responde, lo damos por recibido. */
export async function send(kind, payload) {
  if (!REMOTE_URL || !navigator.onLine) return false;
  try {
    await fetch(REMOTE_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ app: 'vto-micas', kind, pais: PAIS.id, store: getStore() || 'sin-tienda', prueba: isTest(), ...payload }) });
    return true;
  } catch { return false; }
}
