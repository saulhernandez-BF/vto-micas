// Capa 1 · Video & AI tracking: MediaPipe Face Landmarker (478 pts) + base 3D rígida de la cabeza.
import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { VecOneEuro, OneEuro } from './filters.js';
import { sub, len, scale, norm, cross, dot, mid } from './math.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export class FaceTracker {
  constructor() {
    this.landmarker = null;
    this.lastTs = 0;
    this.delegate = null;
  }

  async init(onStatus = () => {}) {
    onStatus('Cargando modelo de rostro…');
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    const forceCPU = new URLSearchParams(location.search).has('cpu'); // para comparar en tablets
    try {
      if (forceCPU) throw new Error('CPU forzado (?cpu)');
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, opts('GPU'));
      this.delegate = 'GPU';
    } catch (e) {
      console.warn('[VTO] GPU delegate falló, usando CPU', e);
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, opts('CPU'));
      this.delegate = 'CPU';
    }
    onStatus('');
  }

  /** Devuelve landmarks en píxeles [x, y, z] (z en la escala de x) o null. */
  detect(src, W, H, nowMs) {
    if (!this.landmarker) return null;
    const ts = Math.max(nowMs, this.lastTs + 1);
    this.lastTs = ts;
    const res = this.landmarker.detectForVideo(src, ts);
    const f = res?.faceLandmarks?.[0];
    if (!f) return null;
    return f.map((p) => [p.x * W, p.y * H, p.z * W]);
  }
}

/**
 * Base local de la cara, filtrada con One Euro:
 *  O  = punto medio de comisuras externas (33, 263)
 *  ex = eje comisura→comisura, ey = arriba, n = hacia la cámara
 *  s  = distancia entre comisuras externas (px)
 */
export class HeadBasis {
  constructor() {
    this.fO = new VecOneEuro(3);
    this.fEx = new VecOneEuro(3);
    this.fEy = new VecOneEuro(3);
    this.fS = new OneEuro();
  }
  configure(t) {
    for (const f of [this.fO, this.fEx, this.fEy]) f.set(t.minCutoff, t.beta, t.dCutoff);
    Object.assign(this.fS, { minCutoff: t.minCutoff, beta: t.beta, dCutoff: t.dCutoff });
  }
  reset() {
    this.fO.reset(); this.fEx.reset(); this.fEy.reset(); this.fS.reset();
  }
  update(lm, t) {
    const O = mid(lm[33], lm[263]);
    let ex = sub(lm[263], lm[33]);
    const s = len(ex);
    ex = scale(ex, 1 / s);
    const up = sub(lm[10], lm[152]);
    const n0 = norm(cross(ex, up));
    const ey0 = norm(cross(n0, ex));

    const Of = this.fO.filter(O, t, s);
    const exf = norm(this.fEx.filter(ex, t, 1));
    let eyf = this.fEy.filter(ey0, t, 1);
    eyf = norm(sub(eyf, scale(exf, dot(eyf, exf)))); // re-ortogonaliza
    const n = cross(exf, eyf);
    const sf = this.fS.filter(s, t, s);

    return {
      O: Of, ex: exf, ey: eyf, n, s: sf,
      yaw: Math.atan2(n[0], -n[2]),
      pitch: Math.atan2(-n[1], -n[2]),
      roll: Math.atan2(exf[1], exf[0]),
    };
  }
}
