# VTO · Micas

Probador virtual web que **detecta el armazón que la persona ya trae puesto** y pinta el color sobre las micas,
reaccionando a la luz ambiental y al movimiento de la cabeza. Incluye una UI de debug completa para iterar ajustes.

## Correr

```bash
npm start          # → http://localhost:5173   (sin dependencias, Node ≥18)
# o: python3 -m http.server 5173
```

La cámara solo funciona en `localhost` o HTTPS. Para probar en celular usa un túnel HTTPS
(p. ej. `npx localtunnel --port 5173` o `cloudflared tunnel --url http://localhost:5173`).
Si se niega la cámara se puede subir una foto o video.

## Arquitectura (3 capas)

| Capa | Archivo | Qué hace |
|---|---|---|
| 1 · Tracking | `src/tracking.js` | MediaPipe Face Landmarker (478 pts). Construye una base 3D rígida de la cabeza (comisuras 33/263, frente 10, mentón 152) filtrada con One Euro. Da yaw/pitch/roll. |
| 1 · Detección | `src/lensDetector.js` | Lanza N rayos desde el centro de cada mica en el **espacio local de la cara** y busca el borde interior del aro. Rechaza outliers, mide contraste y rugosidad para decidir si hay lentes, y **acumula la forma en coordenadas locales** (viaja rígida con la cabeza). |
| 1 · Luz | `src/light.js` | Luminancia/color del ambiente y sondas en frente, mejillas, nariz y mentón → dirección e intensidad de la luz. Estado fotocromático con constante de tiempo. |
| 2 · Render | `src/renderer.js` | Canvas 2D. Tinte físico por `multiply` (transmitancia), degradado vertical, borde más grueso, reflejo ambiental, capa espejo y brillo especular que sigue a la luz y a la cabeza, con Fresnel por ángulo. |
| 3 · UI | `index.html`, `styles.css`, `src/main.js` | Selector de micas, antes/después, cámara frontal/trasera, captura, subir foto/video. |
| 3 · Debug | `src/debug.js` | Panel lil-gui con todos los parámetros, overlays sobre el video y HUD de métricas. |

La configuración vive en `src/config.js` y se guarda sola en el navegador.

## Debug y feedback

Atajos: **D** panel · **B** (mantener) antes/después · **P** congelar frame · **R** reiniciar forma · **L** bloquear forma · **S** captura PNG · **C** copiar reporte.

Para darme feedback: ajusta en el panel, pulsa **Copiar reporte** (config + métricas + radios aprendidos) y pégalo en el chat junto con una captura (**S**).
**Pegar / importar config** acepta tanto una config como un reporte completo.

Overlays: puntos verdes/rojos = borde detectado por rayo (color = confianza, gris = rechazado) ·
línea cian = contorno final · bandas blancas = zona de búsqueda · círculos naranja = sondas de luz y flecha de dirección de luz ·
ejes rojo/verde/azul = base de la cabeza.

## Estado v0.1

Probado en navegador headless con fotos: aro oscuro detectado con 95% de confianza; rostro sin lentes → 0% (sin falso positivo).
Casos débiles conocidos: aros transparentes o metálicos muy delgados y giros de cabeza mayores a ~35°
(prueba con **Polaridad = Cualquiera** y baja **Contraste mín. aro**).
