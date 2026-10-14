# VTO Micas · Ben & Frank

Probador virtual de micas de sol para tiendas Ben & Frank.

El cliente se pone un **armazón óptico de exhibición** (micas transparentes), se para frente a una tablet y ve **ese mismo armazón con micas de sol**: Polarizadas o Fotoentintadas, en los colores reales de B&F. No tiene que configurar nada: la app detecta la cara y el armazón, y pinta el color dentro de las micas en tiempo real.

- **Sitio publicado:** https://saulhernandez-bf.github.io/vto-micas/
- **Repo:** https://github.com/saulhernandez-BF/vto-micas (público; lo que se sube a `main` es lo que se publica)
- **Diseño:** Figma "🎨 Librería - Arte Mkt" → nodos 1539:1588 (pantalla principal), 1541:1589 (mensaje central), 1561:1700 (pantalla de espera)
- **Versión actual:** ver `VERSION` en `src/config.js` (también se ve con `?perf`)

---

## Índice

1. [Cómo se usa en tienda](#1-cómo-se-usa-en-tienda)
2. [Links y parámetros](#2-links-y-parámetros)
3. [Poner una tablet nueva](#3-poner-una-tablet-nueva)
4. [Publicar cambios](#4-publicar-cambios)
5. [Correr en local](#5-correr-en-local)
6. [Cómo funciona por dentro](#6-cómo-funciona-por-dentro)
7. [Catálogo de modelos y planos CAD](#7-catálogo-de-modelos-y-planos-cad)
8. [Ajuste por modelo (`?ajuste`)](#8-ajuste-por-modelo-ajuste)
9. [Reporte de uso y hoja central](#9-reporte-de-uso-y-hoja-central)
10. [Modo kiosko](#10-modo-kiosko)
11. [Micas: colores y fotoentintado](#11-micas-colores-y-fotoentintado)
12. [Debug y pruebas](#12-debug-y-pruebas)
13. [Estructura de archivos](#13-estructura-de-archivos)
14. [Configuración (`src/config.js`)](#14-configuración-srcconfigjs)
15. [Problemas comunes](#15-problemas-comunes)
16. [Decisiones y cosas descartadas](#16-decisiones-y-cosas-descartadas)

---

## 1. Cómo se usa en tienda

1. **Pantalla de espera.** Sin nadie enfrente se ve la cámara oscurecida con el logo y el texto "Pruébate *solar* o *entintado* al instante". En cuanto alguien se para frente a la tablet, pasa sola a la vista de espejo.
2. **Espejo.** La persona se ve como en un espejo. Si trae puesto un armazón, el tinte aparece dentro de las micas; si no trae lentes, no se pinta nada.
3. **Elegir mica.** Abajo están los colores:
   - **Polarizadas** (Verde, Café, Gris, Azul): además del color, bajan los reflejos sobre la mica.
   - **Fotoentintadas** (Azufre, Rosarito, Celestún, Caleta, Mermejita, Miramar), con el switch **Interior / Exterior**. En Exterior la mica se oscurece poco a poco (como con el sol) hacia café o gris, según el color.
4. **Antes.** Botón a la derecha, arriba de las micas. **Mientras se mantiene oprimido** se ve sin tinte; al soltarlo regresa.
5. **Detección (arriba a la derecha).**
   - **Auto:** la app busca sola el contorno del aro. Si reconoce el modelo de B&F, lo muestra en un chip bajo "Auto" y usa su contorno exacto de fábrica. Tocar el chip lo confirma.
   - **Modelo:** tocar el switch abre el catálogo A–Z ("¿Qué armazón traes puesto?") para elegir el modelo exacto y su talla. Volver a tocar el switch regresa a Auto.
   - Los dos switches (Detección e Interior/Exterior) se cambian tocando **cualquier parte** del componente.
6. **Mensajes al centro.** Sólo aparecen cuando hacen falta:
   - Guía de encuadre: "Acércate un poco", "Aléjate un poco", "Colócate al centro".
   - Calibración del modelo elegido: "Mantén la vista al frente…", con anillo de progreso.
   - Si la detección automática no está segura: "Para un ajuste perfecto elige tu modelo" (tocarlo abre el catálogo).
7. **Cuando la persona se va** (3 s sin cara) se olvida el modelo, vuelve a Interior y, a los 6 s, regresa la pantalla de espera.
8. **Si la cámara falla** (permiso negado, cámara ocupada o desconectada), aparece una pantalla con el mismo estilo que la de espera, que explica qué pasa y reintenta sola.

---

## 2. Links y parámetros

Hay una sola página. Todo lo demás son parámetros que se agregan al link y se pueden combinar con `&`.

**Para las tablets**

| Parámetro | Qué hace | ¿Se queda guardado en la tablet? |
|---|---|---|
| `?tienda=polanco` | Nombre de la tienda. Todas sus visitas llegan a la hoja central con ese nombre. | Sí |
| `?kiosk` | Modo kiosko (ver [sección 10](#10-modo-kiosko)). | Sí |
| `?kiosk=0` | Apaga el modo kiosko. | Sí |

**Herramientas internas**

| Parámetro | Qué hace |
|---|---|
| `?reporte` | Reporte de uso de esa tablet: KPIs, tiempo por mica, modelos, visitas por hora. Ahí se cambia el nombre de tienda, se descarga CSV/JSON, se fuerza el envío a la hoja y se borran los datos. |
| `?ajuste` | Herramienta de ajuste por modelo (ver [sección 8](#8-ajuste-por-modelo-ajuste)). |
| `?debug` | Panel técnico con todos los parámetros. También se abre con **3 toques rápidos sobre "Detección"** o la tecla **D**. |
| `?perf` | Barra arriba con versión, ritmos (cámara / rostro / aro por segundo), resolución y ms por etapa. Sirve para ver si la tablet va lenta o si ya se actualizó. |
| `?cpu` | Fuerza el reconocimiento de cara por procesador en lugar de GPU (para comparar en tablets problemáticas). |
| `?src=media/test/r3.jpg` | Carga una foto o video de prueba en vez de la cámara. Sólo en local: `media/` no se sube al repo. |

**Atajos de teclado (computadora)**

| Tecla | Acción |
|---|---|
| D | Panel de debug |
| B (mantener) | Antes |
| S | Captura PNG |
| P | Congelar / descongelar imagen |
| R | Reiniciar forma detectada |
| L | Bloquear / desbloquear forma |
| C | Copiar reporte técnico (config + métricas) |
| U | Subir foto o video de prueba |
| F | Cambiar cámara frontal / trasera |
| Esc | Cerrar catálogo |

---

## 3. Poner una tablet nueva

1. Abrir en Safari / Chrome:
   `https://saulhernandez-bf.github.io/vto-micas/?tienda=NOMBRE-DE-TIENDA&kiosk`
   (nombre en minúsculas y sin espacios, por ejemplo `polanco`, `condesa`, `guadalajara-andares`).
2. Permitir la cámara cuando lo pida.
3. (iPad) Compartir → "Agregar a pantalla de inicio" para abrirla como app, y activar **Acceso guiado** (Ajustes → Accesibilidad) para que no se pueda salir.
4. Dejarla conectada a la corriente, en vertical.

La tienda y el modo kiosko se guardan en la tablet; las siguientes veces basta abrir el link normal. Para revisar que quedó bien: abrir `?reporte` y ver que diga la tienda correcta.

---

## 4. Publicar cambios

```bash
cd ~/Documents/GitHub/VTO-MICAS
git add -A && git commit -m "descripción del cambio" && git push pages HEAD:main
```

- GitHub Pages tarda 1–2 minutos en publicar.
- **Las tablets se actualizan solas:** cada 10 minutos revisan `VERSION` en `src/config.js` y, si cambió, se recargan en cuanto nadie la está usando. Por eso **cada cambio debe subir `VERSION`** (y el `?v=` de `index.html` para el CSS y el JS principal).
- Para ver el cambio en tu compu al instante, usa una pestaña privada (el navegador guarda caché).
- Para confirmar qué versión tiene una tablet, abre el link con `?perf`.
- **Nunca subir** `certs/` (llave privada del HTTPS local), `media/` (fotos de prueba, sólo para QA interno) ni los PDFs de los planos. Ya están en `.gitignore`.

---

## 5. Correr en local

Requisitos: Node 18 o superior. No hay dependencias ni paso de build: es JavaScript plano con módulos ES.

```bash
npm start      # → http://localhost:5173
```

- `serve.mjs` atiende **HTTP y HTTPS en el mismo puerto** (5173): detecta si la conexión es TLS por el primer byte. HTTPS usa el certificado de `certs/` (sólo local, nunca se sube).
- La cámara sólo funciona en `localhost` o en HTTPS. Para probar en tablet se usa el sitio publicado en GitHub Pages.
- Para probar con fotos: `http://localhost:5173/?src=media/test/r3.jpg` o tecla **U** para subir un archivo.

---

## 6. Cómo funciona por dentro

El cálculo se hace en el navegador de la tablet. No hay servidor propio; la única conexión de salida es el envío de métricas anónimas a la hoja central (ver [sección 9](#9-reporte-de-uso-y-hoja-central)). El trabajo está organizado en 3 capas que se ejecutan en cada cuadro de cámara (`src/main.js` → `frame()`).

### Capa 1 · Tracking y detección

**Cara** (`src/tracking.js`)
- MediaPipe Face Landmarker 0.10.14 (CDN jsdelivr; modelo en storage.googleapis) da 478 puntos de la cara.
- Con las comisuras externas de los ojos (puntos 33 y 263), la frente y el mentón se construye una **base 3D de la cabeza** (origen, ejes, escala), filtrada con One Euro para que no tiemble. De ahí salen yaw, pitch y roll.
- Busca hasta 3 caras y se queda con la **más grande** (la más cerca de la tablet), dando preferencia a la que ya seguía. Así no salta al acompañante.

**Aro** (`src/lensDetector.js`) — modo Auto
- Desde el centro estimado de cada mica se lanzan rayos en el **espacio local de la cara** y en cada rayo se busca el borde interior del aro (el salto de contraste más fuerte dentro de una banda).
- Las medidas buenas se **acumulan en coordenadas de la cara**: la forma aprendida viaja pegada a la cabeza y no tiembla aunque un cuadro falle.
- Hay reglas de robustez:
  - simetría entre ambas micas;
  - corrección de errores típicos (ceja arriba, ojera abajo);
  - interpolación de rayos sin borde;
  - re-aprendizaje si aparece una medida alternativa consistente.
- **Medio aro:** si sólo se ve la mitad superior, se usa la forma por rayos en lugar del ajuste genérico.
- **¿Trae lentes? (evidencia de armazón):** además del aro, se mide el **puente sobre la nariz** y las **varillas** junto a las sienes. Se usa la relación señal/ruido de una franja perpendicular y qué tan recta es la línea encontrada. Con histéresis (`frameOn` / `frameOff`), esto decide si se pinta o no. Gracias a esto se detectan también armazones al aire (sin aro).

**Reconocimiento automático de modelo** (`src/autoMatch.js`)
- Cada ~300 ms, con la cabeza de frente, compara el contorno aprendido contra los planos de los 110 modelos del catálogo con tres medidas:
  - una "firma" polar de 72 ángulos de la forma;
  - la proporción alto/ancho;
  - el tamaño en mm (escala tomada del diámetro del iris ≈ 11.7 mm).
- Decide sólo si tiene ≥ 6 evaluaciones, error < 0.15 y ventaja clara sobre el siguiente (`autoMinEvals`, `autoMaxScore`, `autoMargin`). Modelos con la misma forma (p. ej. Parks / Parks Caviar) no compiten entre sí.
- Al reconocer, usa el **contorno exacto de fábrica**. Si hay duda, se queda con el contorno por rayos.

**Modelo elegido** (`src/templateFit.js`)
- Con el contorno del plano CAD (en mm), sólo quedan dos incógnitas: la altura de la mica sobre el ojo y un factor fino de escala.
- Se busca en una rejilla altura × escala qué combinación coincide mejor con los bordes de la imagen, se acumula durante unos cuadros de frente (anillo de progreso) y se bloquea.
- Al girar la cabeza aprende la profundidad y la curvatura (wrap) del armazón.
- La escala absoluta viene del iris, multiplicada por `scaleAdj` 0.91 (el iris de MediaPipe sale ~9 % grande).

**Luz** (`src/light.js`)
- Luminancia y color del ambiente, y dirección de la luz (sondas en frente, mejillas, nariz y mentón).
- Se mide cada 4 cuadros.

### Capa 2 · Render (`src/renderer.js`)

Canvas 2D, en este orden:
1. Se dibuja el cuadro de cámara.
2. Se arma una **máscara** con la forma de las dos micas (con un borde suave).
3. **Tinte físico con `multiply`:** el color de la mica es su **transmitancia** por canal (cuánta luz deja pasar). Es lo mismo que hace una mica real, así que respeta la luz, la piel y el balance de blancos de la cámara.
4. Opcionalmente, una capa de reflejo/espejo con `screen`.
5. **Reflejos reales:** la mica de exhibición ya refleja el entorno; esas zonas brillantes se recuperan encima del tinte para que se vea como cristal. Las **polarizadas** sólo dejan pasar 30 % de esos reflejos (`lens.polGlare`).
6. El tinte aparece y desaparece con un fundido corto (0.12 s).

### Capa 3 · UI (`index.html`, `styles.css`, `src/main.js`)

Pantalla de espera, espejo, mensajes, switches, catálogo, botón Antes, pantalla de cámara no disponible. Tipografías Apercu y Perfectly Nineties (regular e itálica, tomadas de benandfrank.com), iconos y tokens del Figma.

### Rendimiento (tablets)

- Sólo se trabaja cuando la cámara entrega un cuadro nuevo (30 por segundo), no en cada refresco de pantalla.
- **Modo ligero automático:** si cara + aro + dibujo pasan de 30 ms por cuadro, se alternan (2 de cada 3 cuadros cara, 1 de 3 aro). Sale del modo ligero cuando baja de 20 ms.
- Cámara a 1280 px; si tras 4 s sigue en modo ligero, baja a 720 px.
- Reflejos recalculados cada 2 cuadros en modo ligero, sin desenfoque de máscara.

---

## 7. Catálogo de modelos y planos CAD

`catalog/models.json` tiene **110 modelos**. Cada uno incluye:

| Campo | Qué es |
|---|---|
| `id`, `name` | Identificador y nombre comercial |
| `points_mm` | Contorno de la mica derecha en mm (+x hacia la sien, +y arriba) |
| `lensWidthMm`, `lensHeightMm`, `bridgeMm` | Ancho, alto y puente reales (del plano) |
| `*_galileo` | Medidas originales de Galileo (referencia; ~1–1.5 mm más grandes que la mica visible) |
| `sizes` | Tallas disponibles con sus medidas |
| `tints` | Micas que existen para ese modelo |
| `rimless` | Si es al aire |
| `tuneOk` | `true` si el ajuste ya se aprobó en tienda |
| `tunes` | (opcional) Ajuste fino por talla, p. ej. `{ "G": { k, dy, dbx } }`. Si una talla no tiene, se usa `tune`. |
| `tune` | (opcional) Ajuste fino medido en tienda: `{ k: escala, dy: altura en mm, dbx: separación extra entre micas en mm }` |
| `source` | De dónde salió el contorno |

- **105 modelos** tienen el contorno sacado de los **planos CAD de fábrica** (PDF vectoriales 1:1 de merch, carpeta de Drive "PLANOS/BEN&FRANK"). Se usa el **borde interior del aro** (lo que se ve de mica), no el ancho de lente de Galileo.
- **Sin plano** (contorno de foto): Fran x Lucho, Molina Caviar, Sergioarmando x Gepe, Gloria M.
- **Fuera del probador** (`tools/catalogo/excluir.txt`): clip-ons (Maria Clip On, Molina Clip On) y De Palma (no se puede hacer en ningún color). Los scripts los ignoran.

Scripts en `tools/catalogo/` (Python, para regenerar el catálogo):

| Script | Qué hace |
|---|---|
| `extract_planos.py` | Lee los PDFs, separa los trazos negros del armazón, encuentra el hueco de la mica y saca contorno y medidas. Corre por lotes (`BUDGET=segundos`) y se puede reanudar. Salida: `planos.json` + PNG de control en `tools/planos_qa/`. |
| `compare_planos.py` | Compara planos contra el catálogo (diferencias de medidas y forma). |
| `apply_planos.py` | Aplica `planos.json` a `catalog/models.json`. Siempre parte de `models.prev.json` (idempotente). |
| `build_catalog.py` | Arma el catálogo base desde datos de Galileo (`galileo.txt`, `sizes.txt`) y las fotos de producto. |

---

## 8. Ajuste por modelo (`?ajuste`)

Se hace **una sola vez, antes del lanzamiento**, para que cada armazón quede perfecto. El resultado se integra al catálogo y llega a todas las tiendas.

1. Abrir `…/vto-micas/?ajuste` en una tablet, en tienda.
2. Ponerse el armazón que muestra el panel (o elegir otro con ‹ › o tocando el nombre para abrir la lista).
3. Mover:
   - **Tamaño** (70–140 %): agranda o achica la mica pintada alrededor de su centro.
   - **Altura** (±10 mm): la sube o baja.
   - **Puente** (±10 mm): separa o junta las dos micas.
   - Cada control tiene botones **−** / **+** para mover un paso fino; el slider es para movimientos grandes.
   - **Modelos con tallas:** cada talla se ajusta por separado ("Ajuste de la talla: M · G · XG"). Al marcar una talla como lista pasa sola a la siguiente talla pendiente del mismo modelo; el modelo cuenta como listo cuando todas sus tallas están marcadas. Las tallas marcadas muestran ✓ (lista) o – (no está en tienda).
4. **Probar reconocimiento:** pasa a Auto y registra si la app reconoce ese modelo o con cuál lo confunde.
5. **Queda bien · siguiente** o **No está en tienda**. El panel lleva la cuenta (p. ej. "37 de 110 listos").
6. Al terminar, **Exportar ajustes**: descarga un JSON y, si hay hoja central, lo manda a la pestaña "Ajustes".
7. Ese JSON se integra al catálogo con `tools/catalogo/apply_tunes.py`:
   ```bash
   cd tools/catalogo
   python3 apply_tunes.py ajustes/ajustes-AAAA-MM-DD.json --reset id1,id2   # --reset = modelos con problemas → de fábrica
   ```
   Los modelos "listo" quedan con su ajuste (`tune` / `tunes`) y `tuneOk: true`; la herramienta `?ajuste` los marca como "aprobado (catálogo)" y, al avanzar, salta directo a los pendientes. Los JSON de cada vuelta se guardan en `tools/catalogo/ajustes/`.

**Historial:** 1.ª vuelta en tienda (13-oct-2026): 37 modelos aprobados, 72 regresados a fábrica para revisarse en una 2.ª vuelta, Ataulfo no estaba en tienda.

Mientras tanto, los ajustes ya se aplican en la tablet donde se hicieron (se guardan en `localStorage`). La herramienta también registra la evidencia de armazón medida con cada modelo, que sirve para calibrar la detección.

---

## 9. Reporte de uso y hoja central

**Qué se mide** (`src/analytics.js`). Es anónimo: no se guardan imágenes ni datos personales.

Una **visita** empieza cuando aparece una cara por más de 1 s y termina cuando se va. Por visita se guarda:
- fecha y hora, tienda y dispositivo;
- duración y segundos con mica pintada (≈ traía lentes);
- colores probados y segundos con cada uno;
- si usó Exterior y si usó Antes;
- modelo elegido a mano o reconocido automáticamente.

Las visitas de menos de 2 s no cuentan.

**Dónde vive**
- En cada tablet (`localStorage`), visible con `?reporte`.
- En la **hoja central de Google Sheets**. Cada tablet envía sus visitas cada 10 minutos o cuando junta 5 sin enviar; si no hay internet, espera y las manda después.

**Hoja central**
- Código del buzón: `tools/sheets/Code.gs` (Google Apps Script publicado como App web, a nombre de Zul).
- La URL está en `REMOTE_URL` (`src/config.js`). Si se deja vacía, todo se queda sólo en la tablet.
- Pestañas que crea solo:
  - **Visitas:** una fila por visita, con columna `tienda`, lista para filtros o tablas dinámicas.
  - **Ajustes:** lo que se exporta desde `?ajuste`.
- Para cambiar el buzón: Extensiones → Apps Script en la hoja → pegar `Code.gs` → Implementar → Nueva implementación → App web, ejecutar como "Yo" y acceso "Cualquier usuario". Copiar la URL `/exec` en `REMOTE_URL`.
- La URL es pública (está en el repo), así que alguien podría mandar filas basura. Para métricas internas se consideró aceptable.

**Cómo se distingue cada tienda:** con `?tienda=nombre` al dar de alta la tablet (se recuerda), o editándolo en `?reporte`. Las tablets sin nombre llegan como `sin-tienda`.

---

## 10. Modo kiosko

Se activa con `?kiosk` (se recuerda en la tablet). Archivos: `src/kiosk.js` y `sw.js`.

- **Pantalla siempre encendida** (Wake Lock).
- **Pantalla completa** al primer toque.
- Sin menú al mantener presionado, sin zoom con pellizco, sin cursor.
- **Funciona sin Wi-Fi:** un service worker guarda la app, MediaPipe y el modelo de cara. Los archivos de la app siempre se revisan contra el servidor, así que no se queda con versiones viejas.
- **Vigilante de cámara:** si no llega un cuadro nuevo en 3 s, reabre la cámara.
- **Recarga nocturna** a las 4 a. m. si nadie la está usando.

La **actualización silenciosa** (revisar versión cada 10 min y recargar cuando está libre) funciona en todas las tablets, con o sin kiosko.

---

## 11. Micas: colores y fotoentintado

Definidas en `PRESETS` (`src/config.js`):

- `color`: **transmitancia** medida de la mica real, que es lo que se pinta con `multiply`.
- `swatch`: el color del círculo en la UI (del Figma).

| Grupo | Micas | Al exterior vira a |
|---|---|---|
| Polarizadas | Verde, Café, Gris, Azul | — (bajan reflejos 70 %) |
| Fotoentintadas | Azufre, Rosarito, Celestún | Café `#8e867d` |
| Fotoentintadas | Caleta, Mermejita, Miramar | Gris `#767676` |

- El fotoentintado se oscurece en ~2.5 s y se aclara en ~3.5 s (`photoInSec` / `photoOutSec`). Es una versión comprimida de cómo reacciona la mica real al sol.
- Los círculos de color son híbridos: color al 55 % + `multiply` + filo blanco, para que se vean sobre fondos negros y conserven el efecto de cristal.

---

## 12. Debug y pruebas

**Panel de debug** (`?debug`, tecla D o 3 toques en "Detección"). Tiene todos los parámetros de detección, tinte, luz y catálogo, más acciones:
- copiar reporte técnico;
- copiar o importar config;
- captura;
- congelar;
- reiniciar forma;
- Reporte de uso y Ajuste por modelo.

Los cambios se guardan en el navegador.

**Overlays de debug sobre la imagen:**
- puntos = borde detectado por rayo (color = confianza, gris = rechazado);
- línea cian = contorno final;
- bandas = zona de búsqueda;
- ejes rojo/verde/azul = base de la cabeza.

**Pruebas con fotos:**
- `media/test/` tiene fotos de prueba (sólo uso interno de QA; no se publican).
- `tools/test-harness.js` corre varias fotos con distintas configs y arma una rejilla de resultados. Uso desde la consola del navegador:
  ```js
  const h = await import('/tools/test-harness.js');
  await h.suite([['r3', {}, 'base'], ['r5', { symmetry: 0 }, 'sym0']]);
  ```

---

## 13. Estructura de archivos

```
index.html            Estructura de la UI (pantalla de espera, espejo, catálogo, pantallas de error)
styles.css            Estilos (tokens del Figma, tipografías, componentes)
sw.js                 Service worker del modo kiosko (caché offline)
serve.mjs             Servidor local HTTP+HTTPS en el puerto 5173
package.json          `npm start`
src/
  main.js             Orquestación: arranque, cámara, loop por cuadro, UI, mensajes, espera, Antes
  config.js           VERSION, REMOTE_URL, parámetros por defecto y PRESETS de micas
  tracking.js         MediaPipe Face Landmarker + base 3D de la cabeza (elige la cara principal)
  lensDetector.js     Detección de aro por rayos, evidencia de armazón (puente/varillas), medio aro
  autoMatch.js        Reconocimiento automático del modelo contra el catálogo
  templateFit.js      Ajuste del contorno de fábrica (altura, escala, profundidad, wrap, ajuste fino)
  shapeFit.js         Forma genérica cuando no hay aro visible
  light.js            Estimación de luz ambiental
  renderer.js         Dibujo del tinte (multiply), reflejos, polarizado
  catalog.js          Carga y normaliza catalog/models.json
  tune.js             Herramienta de ajuste por modelo (?ajuste)
  analytics.js        Reporte de uso local + vista ?reporte
  remote.js           Envío a la hoja central + nombre de tienda
  kiosk.js            Modo kiosko + actualización silenciosa
  debug.js            Panel de debug (lil-gui), overlays y HUD
  filters.js, math.js Utilidades (One Euro, geometría)
catalog/
  models.json         Catálogo de 110 modelos (contornos en mm, medidas, tallas, micas)
  models.prev.json    Catálogo previo a aplicar los planos (base de apply_planos.py)
assets/
  fonts/              Apercu, Perfectly Nineties (regular e itálica)
  ui/                 Iconos y logo del Figma
tools/
  catalogo/           Scripts para extraer contornos de los planos CAD y armar el catálogo
  planos_qa/          Imágenes de control de cada plano procesado
  sheets/Code.gs      Buzón de la hoja central (Google Apps Script)
  test-harness.js     Banco de pruebas con fotos
  qa_tmp/             Temporales (ignorado por git)
media/test/           Fotos de prueba (ignorado por git, sólo QA interno)
certs/                Certificado HTTPS local (ignorado por git, NUNCA subir)
```

---

## 14. Configuración (`src/config.js`)

| Clave | Para qué |
|---|---|
| `VERSION` | Versión publicada. **Subirla en cada cambio** (dispara la actualización de las tablets). |
| `REMOTE_URL` | URL del buzón de la hoja central (vacío = sólo local). |
| `KEY` (`vto-micas:config:vN`) | Llave de guardado en el navegador. Subir `N` cuando cambian valores por defecto, para que las tablets no usen la config vieja guardada. |
| `lens.*` | Mica activa, densidad, degradado, `polGlare` (reflejos en polarizadas), tiempos de fotoentintado. |
| `detect.*` | Detección de aro: rayos, contraste, umbrales `frameOn` / `frameOff` de evidencia de armazón. |
| `catalog.*` | `irisMm`, `scaleAdj` (escala global de la mica), calibración, `lostResetSec`, reconocimiento automático (`autoRecognize`, `autoMinEvals`, `autoMaxScore`, `autoMargin`, `autoMinConf`). |
| `guide.*` | Guía de encuadre (`minRel` / `maxRel` = qué tan lejos / cerca, `centerTol`) e `idleSec` (segundos sin nadie para la pantalla de espera). |
| `light.*` | Reflejos reales y sintéticos, brillo. |
| `PRESETS` | Las micas (ver [sección 11](#11-micas-colores-y-fotoentintado)). |

---

## 15. Problemas comunes

| Síntoma | Causa / solución |
|---|---|
| La tablet muestra una versión vieja | Esperar ≤ 10 min (se actualiza cuando está libre) o recargar. En computadora, usar pestaña privada. Confirmar con `?perf`. |
| "Activa la cámara" | El permiso está negado: en Ajustes del navegador permitir cámara para el sitio y tocar Reintentar. |
| "La cámara está ocupada" | Otra app la usa (FaceTime, cámara). Cerrarla; la app reintenta sola. |
| No pinta aunque traigo lentes | La evidencia de armazón no pasa el umbral (luz muy plana o armazón muy delgado). Probar eligiendo el modelo. Ajustar `frameOn` / `frameOff` en debug. |
| Pinta sin lentes | Bajar sensibilidad: subir `frameOn` en debug y reportarlo. |
| La mica se ve más grande o chica que el aro | Ajustarlo con `?ajuste` para ese modelo (o `scaleAdj` global en debug). |
| Va lenta | Ver `?perf`. Si "(ligero)" aparece seguido y la cámara está a 720, la tablet está al límite. |
| No llegan datos a la hoja | Revisar que la tablet tenga internet, que `REMOTE_URL` esté bien y en `?reporte` cuántas visitas hay "por enviar". |

---

## 16. Decisiones y cosas descartadas

**Decisiones**
- Todo corre en la tablet (sin servidor) por privacidad y para que funcione con mala red.
- El color se pinta como **transmitancia con `multiply`**. Es físicamente correcto (igual que una mica real), así que no hace falta compensar la luz de cada tienda.
- Contornos de los **planos CAD** (borde interior del aro), no de las medidas de Galileo.

**Descartado (probado o evaluado)**
- QR para llevarse la foto.
- Deslizar para cambiar de mica (se prefiere tocar el color).
- Tarjeta para el asesor (tiendas chicas, el vendedor da seguimiento).
- Calibración por tienda.
- **Oclusión por manos:** se probó y se veía mal; el código quedó en `tools/qa_tmp/`.
- Pasar el dibujo a WebGL: no es el cuello de botella.

**Siguientes pasos posibles**
- Si va lento en Android: mover la detección de aro a un Web Worker.
- Control remoto o ajustes por tienda desde la hoja central.
