// Modo kiosko (?kiosk, se recuerda en el equipo; ?kiosk=0 lo apaga):
//  · pantalla siempre encendida (Wake Lock), pantalla completa al primer toque
//  · caché offline (service worker) de la app, MediaPipe y el modelo de rostro
//  · vigilante de cámara: si no llega un cuadro nuevo en 3 s, la reabre
//  · recarga nocturna (4 a. m.) cuando nadie la está usando, para empezar limpio cada día
//  · sin menú contextual, zoom con pellizco ni selección de texto
const KEY = 'vto-micas:kiosk';

export class Kiosk {
  constructor() {
    const q = new URLSearchParams(location.search).get('kiosk');
    try {
      if (q === '0') localStorage.removeItem(KEY);
      else if (q !== null) localStorage.setItem(KEY, '1');
      this.on = q !== '0' && (q !== null || localStorage.getItem(KEY) === '1');
    } catch { this.on = q !== null && q !== '0'; }
    this.lock = null; this.startedAt = Date.now();
  }

  /** hooks: { lastFrameAt(): ms, isCamera(): bool, restartCamera(): Promise, idleMs(): ms sin rostro } */
  start(hooks) {
    if (!this.on) return;
    this.h = hooks;
    document.documentElement.classList.add('kiosk');
    this.wake();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.wake(); });
    const fs = () => {
      const d = document.documentElement;
      if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      else if (d.webkitRequestFullscreen && !document.webkitFullscreenElement) try { d.webkitRequestFullscreen(); } catch {}
    };
    addEventListener('pointerdown', fs, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    for (const ev of ['gesturestart', 'gesturechange']) addEventListener(ev, (e) => e.preventDefault());
    addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[kiosk] sw', e));
    setInterval(() => this.watchdog(), 1000);
    setInterval(() => this.nightly(), 60000);
  }

  async wake() {
    try { if ('wakeLock' in navigator && !this.lock) { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => (this.lock = null)); } }
    catch (e) { console.warn('[kiosk] wakeLock', e.message); }
  }

  async watchdog() {
    const h = this.h;
    if (!h.isCamera() || document.visibilityState !== 'visible' || this.restarting) return;
    if (Date.now() - h.lastFrameAt() < 3000) return;
    this.restarting = true;
    console.warn('[kiosk] cámara congelada: reabriendo');
    try { await h.restartCamera(); } catch {}
    setTimeout(() => (this.restarting = false), 4000); // dar tiempo a que llegue el primer cuadro
  }

  nightly() {
    const now = new Date();
    if (now.getHours() !== 4 || Date.now() - this.startedAt < 2 * 3600e3) return;
    if (this.h.idleMs() > 60000) location.reload();
  }
}

/**
 * Actualización silenciosa (todas las tablets, no sólo kiosko): cada 10 min revisa la versión publicada;
 * si cambió, recarga en cuanto la tablet esté libre. Una sola vez por versión (evita ciclos con caché).
 */
export function startUpdater(current, isIdle) {
  let pending = null;
  const check = async () => {
    try {
      const r = await fetch('src/config.js?t=' + Date.now(), { cache: 'no-store' });
      const v = (await r.text()).match(/VERSION\s*=\s*'([^']+)'/)?.[1];
      if (v && v !== current) pending = v;
    } catch {}
  };
  setInterval(check, 10 * 60 * 1000);
  setTimeout(check, 60 * 1000);
  setInterval(() => {
    if (!pending || !isIdle()) return;
    try { if (sessionStorage.getItem('vto-micas:reloaded-for') === pending) return; sessionStorage.setItem('vto-micas:reloaded-for', pending); } catch {}
    location.reload();
  }, 5000);
}
