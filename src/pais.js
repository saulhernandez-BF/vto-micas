// País de la experiencia. Misma app, distinta URL:
//   …/vto-micas/        → México (raíz, la que ya usan las tablets)
//   …/vto-micas/mx/     → México
//   …/vto-micas/cl/     → Chile
// Cada carpeta tiene su index.html (generado con tools/paises_html.py) que marca <html data-pais="…">.
// ?pais=cl también funciona (pruebas). Todo lo que cambia entre países vive aquí.

export const PAISES = {
  mx: {
    id: 'mx', nombre: 'México', tz: 'America/Mexico_City',
    presets: ['pol-verde', 'pol-cafe', 'pol-gris', 'pol-azul', 'azufre', 'rosarito', 'celestun', 'caleta', 'mermejita', 'miramar'],
    defaultPreset: 'celestun',
    fotoentintado: true,           // switch Interior / Exterior
    catalogo: null,                // null = todos los modelos de catalog/models.json
    textos: {
      pol: { titulo: 'Polarizadas', sub: 'Para evitar el vampirazo' },
      tint: { titulo: 'Fotoentintadas', sub: 'Enchula tus lentes y oscurécelos con la luz' },
    },
  },
  cl: {
    id: 'cl', nombre: 'Chile', tz: 'America/Santiago',
    presets: ['pol-verde', 'pol-cafe', 'pol-gris', 'pol-azul', 'cl-naranja', 'cl-azul', 'cl-rojo'],
    defaultPreset: 'cl-naranja',
    fotoentintado: false,          // en Chile sólo hay entintados: sin Interior / Exterior
    catalogo: 'catalog/paises/cl.json', // modelos que sí se venden en Chile (tools/catalogo/build_paises.py)
    textos: {
      pol: { titulo: 'Polarizadas', sub: 'Chao reflejos, hola nitidez' },
      tint: { titulo: 'Entintadas', sub: 'Dale color a tus lentes' },
    },
  },
};

function detect() {
  const q = new URLSearchParams(location.search).get('pais');
  const id = (q || document.documentElement.dataset.pais || 'mx').toLowerCase();
  return PAISES[id] || PAISES.mx;
}
export const PAIS = detect();
