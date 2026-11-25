// Configuración central. Todo lo ajustable vive aquí y es editable desde el panel de debug.
import { PAIS } from './pais.js';
export const VERSION = '0.9.19';
// Hoja central de reportes (Apps Script › Implementar › App web). Vacío = sólo se guarda en la tablet.
export const REMOTE_URL = 'https://script.google.com/macros/s/AKfycbyPvqpy4w7FGJdoeyv9uiuFAWJc5VqALXZBugLimZMUqeIU2FZ81lEhLA3s1xzhMQ4/exec';

export const DEFAULTS = {
  lens: {
    preset: 'celestun',
    polGlare: 0.3,     // polarizadas: fracción de reflejos que pasa (0 = sin reflejos)
    color: '#e8becd',
    density: 1,        // 0 = transparente, 1 = color pleno
    gradient: 0,         // cuánto se aclara hacia abajo
    gradientStart: 0.3,
    edgeDarken: 0.12,    // mica más gruesa en el borde
    blend: 'multiply',
    feather: 1.5,        // px de suavizado del contorno
    insetPx: 1.0,        // contrae el contorno para no pintar el aro
    outdoor: false,      // Fotoentintadas: interior (claro) / exterior (activado por UV)
    photoInSec: 2.5,     // segundos para oscurecerse al pasar a exterior
    photoOutSec: 3.5,    // segundos para aclararse al volver a interior
  },
  mirror: { strength: 0, color: '#8fc9ff' },
  light: {
    keepReal: true,       // conservar los reflejos reales de la mica demo
    keepThreshold: 0.62,  // luminancia a partir de la cual se considera reflejo
    keepSoftness: 0.25,
    keepStrength: 0.9,
    reflection: 0,        // reflejo sintético (apagado: la mica real ya refleja)
    highlightStrength: 0, // brillo sintético (apagado)
    highlightSize: 0.45,
    hlBaseX: -0.35,
    hlBaseY: -0.45,
    followLight: 0.6,
    followHead: 1.0,
    fresnel: 0.6,
    adaptExposure: 0.3,
    photochromic: false,
    photoStrength: 0.35,
    photoTau: 3,
  },
  detect: {
    enabled: true,
    model: 'auto',       // 'auto' · 'rays' aro visible · 'fit' sin aro · 'catalog' forma exacta del modelo
    fitPoints: 48,
    fitCandidates: 24,
    fitStep: 1,
    fitDeltaPx: 1.5,
    fitSmooth: 0.15,
    fitPrior: 1,
    fitEyeMargin: 0.08,
    fitMaxN: 6,          // 2 = elipse/redondo, 4+ = rectangular
    fitMinAspect: 0.4,   // alto/ancho mínimo
    fitSizeTol: 0.25,    // cuánto puede crecer/encoger vs. forma base
    fitMaxYaw: 12,       // grados: solo aprende de frente
    fitMaxPitch: 12,
    polarity: 'dark',
    rays: 64,
    samples: 32,
    hqAuto: true, hqRays: 96, hqSamples: 44, // equipos sobrados (iPad A17 Pro): contorno más fino
    kernel: 2,
    rMin: 0.65,
    rMax: 1.85,          // micas grandes (p. ej. Parks G) rebasan la forma base
    priorSigma: 0.35,
    edgeContrast: 0.15,
    rimContrast: 0.16,   // contraste medio mínimo del aro (distingue lentes de arrugas/párpados)
    autoPolarity: true,   // automático: prueba aro grueso y aro fino
    rimContrastLine: 0.07, // contraste mínimo para aro fino (línea)
    maxRough: 0.07,      // (antes 0.05) más tolerante para aros metálicos delgados
    outerBias: 0,        // (experimental) mitad inferior: cresta más externa si es ≥ X de la más fuerte
    lowerMirrorMax: true, // mitad inferior: si el lado espejo es más grande, usarlo (evita esquinas cortadas)
    outerMaxRel: 1.7,
    relearnFrames: 12,   // frames de medición estable y discrepante para corregir la forma aprendida
    minConf: 0.3,
    outlierTol: 0.18,
    learnRate: 0.25,
    spatialSmooth: 1,
    symmetry: 0.5,
    glassesThreshold: 0.4,
    lensPlane: 0.05,       // profundidad fija (si lensDepthAuto = false)
    lensDepthAuto: true,   // profundidad desde el puente nasal (landmark 168)
    lensDepthOffset: 0.2,  // extra delante del puente (calibrado con Zul a yaw 46°; compensa que el z de MediaPipe viene comprimido)
    pantoDeg: 5.5,         // inclinación pantoscópica típica
    wrapDeg: 13.5,           // curvatura del frente hacia la sien
    procWidth: 360,
    renderWithoutGlasses: false, // sin lentes detectados no se pinta mica
    // Evidencia de armazón (puente/varillas). Medido en tienda (25-nov, Mac): sin lentes 1.1–1.5 quieto y hasta 2.3–2.9
    // gesticulando (cejas, giros); acetato transparente 10–15 de frente y ≥3 de perfil; aro oscuro/metal 15–20.
    // Con modelo elegido se usa un umbral más bajo.
    frameOn: 3.0,
    frameOff: 2.2, frameOnModel: 2.2, frameOffModel: 1.6, frameTau: 0.9,
    lock: false,
  },
  // Forma base en unidades locales (1 = distancia entre comisuras externas ≈ 9 cm)
  // Modo catálogo (kiosko): forma exacta por modelo
  catalog: { modelId: '', size: '', irisMm: 11.7, scaleAdj: 0.91, // el iris de MediaPipe sale ~9 % grande ⇒ micas de más (medido con Igor II)
    maxYaw: 12, maxPitch: 12, calibFrames: 45, autoLock: true, priorWeight: 1, lostResetSec: 3, resetModelOnLost: true, suggestConf: 0.4, suggestAfterSec: 2.5,
    // Reconocimiento automático del modelo (modo Auto): evaluaciones mínimas, error máximo y ventaja sobre el 2º
    // Apagado (25-nov): con armazones transparentes el contorno detectado es pobre y elegía modelos equivocados
    // (Rivers → Gretchen / Gabriela; Rivers quedaba 6.º con diferencias de 0.02). Auto pinta con el contorno detectado.
    autoRecognize: false, autoMinEvals: 6, autoMaxScore: 0.15, autoMargin: 0.02, autoMinConf: 0.35,
    turnCalib: true, turnMinYaw: 15, turnMaxYaw: 50, turnFrames: 60, turnPrior: 1 },
  guide: { enabled: true, minRel: 0.12, maxRel: 0.4, centerTol: 0.15, delaySec: 0.8, idleSec: 6, idleTrackHz: 5 },
  prior: { cx: 0.37, cy: 0.0, a: 0.27, b: 0.2, n: 2.6 },
  tracking: { minCutoff: 1.5, beta: 0.8, dCutoff: 1.0 },
  view: { mirror: true, showTint: true, zoom: 1.3 }, // zoom: la persona se para más lejos → menos deformación de gran angular
  debug: {
    panel: false, hud: true,
    landmarks: false, basis: true, prior: false, band: true, rays: false,
    hits: true, polygon: true, probes: true, roi: false, roiInset: false,
  },
};

// Micas reales de Ben & Frank. "color" = transmitancia medida por canal (se aplica con multiply):
//  - Polarizadas (25-nov, tienda): promedio de (a) foto en mesa de luz, al cuadrado (sobre la cara la piel bajo la mica
//    también recibe la luz filtrada: doble paso) y (b) medición en vivo sobre la cara (piel bajo la mica ÷ mejilla, sin reflejos).
//  - Entintadas: foto de la mica sobre fondo gris ÷ fondo (tabla de colores de Zul).
// color = transmitancia medida (lo que se pinta sobre la mica); swatch = círculo de la UI, derivado del color medido
// (fotoentintadas como mica más gruesa para que se lea el tono; polarizadas un poco más luminosas).
// Fotoentintadas: con luz UV (exterior) viran a café o gris. Tono activado un poco más claro que la
// polarizada equivalente (~25–30 % de transmitancia, típico de un fotocromático activado).
// Medido en tienda (25-nov) con micas activadas junto a la cara: gris ≈40 % de transmitancia; café algo rosado
// (la muestra ya se estaba aclarando, así que se dejó ~12 % más oscura que lo medido).
export const PHOTO_TARGETS = { cafe: '#c49993', gris: '#64686c' };

const ALL_PRESETS = [
  { id: 'pol-verde', group: 'Polarizadas', name: 'Verde', color: '#3d453f', swatch: '#576059', density: 1, gradient: 0, mirror: 0 },
  { id: 'pol-cafe', group: 'Polarizadas', name: 'Café', color: '#89675b', swatch: '#927165', density: 1, gradient: 0, mirror: 0 },
  { id: 'pol-gris', group: 'Polarizadas', name: 'Gris', color: '#282b36', swatch: '#464956', density: 1, gradient: 0, mirror: 0 },
  { id: 'pol-azul', group: 'Polarizadas', name: 'Azul', color: '#2e3541', swatch: '#4D5562', density: 1, gradient: 0, mirror: 0 },
  // Fotoentintadas (interior): medidas en tienda 25-nov de fotos de las micas reales sobre hoja blanca (mica ÷ hoja)
  // y validadas en vivo por Zul sobre el armazón demo.
  { id: 'azufre', group: 'Fotoentintadas', name: 'Azufre', color: '#f0cfbb', swatch: '#DB9775', photo: 'cafe', density: 1, gradient: 0, mirror: 0 },
  { id: 'rosarito', group: 'Fotoentintadas', name: 'Rosarito', color: '#fffad8', swatch: '#FFF09B', photo: 'cafe', density: 1, gradient: 0, mirror: 0 },
  { id: 'celestun', group: 'Fotoentintadas', name: 'Celestún', color: '#ffd5e9', swatch: '#FFA3CC', photo: 'cafe', density: 1, gradient: 0, mirror: 0 },
  { id: 'caleta', group: 'Fotoentintadas', name: 'Caleta', color: '#cde8fc', swatch: '#94C9F8', photo: 'gris', density: 1, gradient: 0, mirror: 0 },
  { id: 'mermejita', group: 'Fotoentintadas', name: 'Mermejita', color: '#cfd8cd', swatch: '#97A894', photo: 'gris', density: 1, gradient: 0, mirror: 0 },
  { id: 'miramar', group: 'Fotoentintadas', name: 'Miramar', color: '#c7c9f2', swatch: '#898DE0', photo: 'gris', density: 1, gradient: 0, mirror: 0 },
  // Chile · entintados (sin fotoentintado). Medidos de la foto de Zul (3 micas sobre pared blanca): mica ÷ pared.
  { id: 'cl-naranja', group: 'Entintadas', name: 'Naranja', color: '#c18e5a', swatch: '#C8874A', density: 1, gradient: 0, mirror: 0 },
  { id: 'cl-azul', group: 'Entintadas', name: 'Azul', color: '#86aecc', swatch: '#6F9CC0', density: 1, gradient: 0, mirror: 0 },
  { id: 'cl-rojo', group: 'Entintadas', name: 'Rojo', color: '#e38e9d', swatch: '#D7737F', density: 1, gradient: 0, mirror: 0 },
];
// Sólo las micas que se venden en el país (src/pais.js), en ese orden
export const PRESETS = PAIS.presets.map((id) => ALL_PRESETS.find((p) => p.id === id)).filter(Boolean);
export const isPolarized = (p) => p?.group === 'Polarizadas';
{ const p = PRESETS.find((x) => x.id === PAIS.defaultPreset) || PRESETS[0]; DEFAULTS.lens.preset = p.id; DEFAULTS.lens.color = p.color; }

const KEY = 'vto-micas:config:v20' + (PAIS.id === 'mx' ? '' : ':' + PAIS.id); // config separada por país

export function merge(base, over) {
  if (!over || typeof over !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (!(k in over)) continue;
    const bv = base[k], ov = over[k];
    if (bv && typeof bv === 'object' && !Array.isArray(bv)) merge(bv, ov);
    else if (typeof ov === typeof bv) base[k] = ov;
  }
  return base;
}

export function loadConfig() {
  const c = structuredClone(DEFAULTS);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) merge(c, JSON.parse(raw));
  } catch { /* storage bloqueado: usamos defaults */ }
  return c;
}

export function saveConfig(c) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

export function resetConfig(c) { merge(c, structuredClone(DEFAULTS)); }

export function applyPreset(c, p) {
  c.lens.preset = p.id;
  c.lens.color = p.color;
  c.lens.density = p.density;
  c.lens.gradient = p.gradient;
  c.mirror.strength = p.mirror;
  if (p.mirrorColor) c.mirror.color = p.mirrorColor;
}
