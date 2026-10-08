// Envío a la hoja central (Google Sheets vía Apps Script). La URL se configura en REMOTE_URL (config.js)
// y cada tablet se identifica con su tienda (?tienda=polanco, se recuerda en el equipo).
import { REMOTE_URL } from './config.js';

const STORE_KEY = 'vto-micas:tienda';

export function getStore() {
  const q = new URLSearchParams(location.search).get('tienda');
  try {
    if (q) localStorage.setItem(STORE_KEY, q.trim().toLowerCase());
    return localStorage.getItem(STORE_KEY) || '';
  } catch { return q || ''; }
}
export function setStore(v) { try { localStorage.setItem(STORE_KEY, String(v || '').trim().toLowerCase()); } catch {} }

export const remoteEnabled = () => !!REMOTE_URL;

/** POST sin CORS (Apps Script no expone cabeceras): si la red responde, lo damos por recibido. */
export async function send(kind, payload) {
  if (!REMOTE_URL || !navigator.onLine) return false;
  try {
    await fetch(REMOTE_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ app: 'vto-micas', kind, store: getStore() || 'sin-tienda', ...payload }) });
    return true;
  } catch { return false; }
}
