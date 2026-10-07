// Configuración central. Todo lo ajustable vive aquí y es editable desde el panel de debug.
export const VERSION = '0.6.0';

export const DEFAULTS = {
  lens: {
    preset: 'celestun',
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
    frameOn: 1.05,       // evidencia de armazón (puente/varillas, normalizada) para decir "trae lentes"
    frameOff: 0.85,
    lock: false,
  },
  // Forma base en unidades locales (1 = distancia entre comisuras externas ≈ 9 cm)
  // Modo catálogo (kiosko): forma exacta por modelo
  catalog: { modelId: '', size: '', irisMm: 11.7, scaleAdj: 0.91, // el iris de MediaPipe sale ~9 % grande ⇒ micas de más (medido con Igor II)
    maxYaw: 12, maxPitch: 12, calibFrames: 45, autoLock: true, priorWeight: 1, lostResetSec: 3, resetModelOnLost: true, suggestConf: 0.4, suggestAfterSec: 2.5,
    // Reconocimiento automático del modelo (modo Auto): evaluaciones mínimas, error máximo y ventaja sobre el 2º
    autoRecognize: true, autoMinEvals: 6, autoMaxScore: 0.15, autoMargin: 0.02, autoMinConf: 0.35,
    turnCalib: true, turnMinYaw: 15, turnMaxYaw: 50, turnFrames: 60, turnPrior: 1 },
  prior: { cx: 0.37, cy: 0.0, a: 0.27, b: 0.2, n: 2.6 },
  tracking: { minCutoff: 1.5, beta: 0.8, dCutoff: 1.0 },
  view: { mirror: true, showTint: true },
  debug: {
    panel: false, hud: true,
    landmarks: false, basis: true, prior: false, band: true, rays: false,
    hits: true, polygon: true, probes: true, roi: false, roiInset: false,
  },
};

// Micas reales de Ben & Frank. "color" = transmitancia medida por canal (se aplica con multiply):
//  - Polarizadas: render de la mica de sol ÷ render óptico del mismo armazón (IGOR II OCTAGON).
//  - Entintadas: foto de la mica sobre fondo gris ÷ fondo (tabla de colores de Zul).
// color = transmitancia medida (lo que se pinta sobre la mica); swatch = color de muestra del Figma (UI).
// Fotoentintadas: con luz UV (exterior) viran a café o gris. Tono activado un poco más claro que la
// polarizada equivalente (~25–30 % de transmitancia, típico de un fotocromático activado).
export const PHOTO_TARGETS = { cafe: '#8e867d', gris: '#767676' };

export const PRESETS = [
  { id: 'pol-verde', group: 'Polarizadas', name: 'Verde', color: '#3c453d', swatch: '#42674E', density: 1, gradient: 0, mirror: 0 },
  { id: 'pol-cafe', group: 'Polarizadas', name: 'Café', color: '#685e51', swatch: '#6C5F4C', density: 1, gradient: 0, mirror: 0 },
  { id: 'pol-gris', group: 'Polarizadas', name: 'Gris', color: '#494949', swatch: '#545A5C', density: 1, gradient: 0, mirror: 0 },
  { id: 'pol-azul', group: 'Polarizadas', name: 'Azul', color: '#314767', swatch: '#005891', density: 1, gradient: 0, mirror: 0 },
  // Azufre: sin medición real todavía → aproximado a partir del color del Figma (#BF9000) aclarado como las demás entintadas
  { id: 'azufre', group: 'Fotoentintadas', name: 'Azufre', color: '#e2cd8c', swatch: '#BF9000', photo: 'cafe', density: 1, gradient: 0, mirror: 0 },
  { id: 'rosarito', group: 'Fotoentintadas', name: 'Rosarito', color: '#f3f0bd', swatch: '#FFF278', photo: 'cafe', density: 1, gradient: 0, mirror: 0 },
  { id: 'celestun', group: 'Fotoentintadas', name: 'Celestún', color: '#e8becd', swatch: '#F3D0F2', photo: 'cafe', density: 1, gradient: 0, mirror: 0 },
  { id: 'caleta', group: 'Fotoentintadas', name: 'Caleta', color: '#a4b2c1', swatch: '#B2DFFE', photo: 'gris', density: 1, gradient: 0, mirror: 0 },
  { id: 'mermejita', group: 'Fotoentintadas', name: 'Mermejita', color: '#d9ddb5', swatch: '#9FB400', photo: 'gris', density: 1, gradient: 0, mirror: 0 },
  { id: 'miramar', group: 'Fotoentintadas', name: 'Miramar', color: '#9e9cc2', swatch: '#AA86D9', photo: 'gris', density: 1, gradient: 0, mirror: 0 },
];

const KEY = 'vto-micas:config:v8';

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
