// Banco de pruebas con fotos (media/test/*.jpg). Uso en consola del VTO:
//   const h = await import('/tools/test-harness.js'); await h.suite([['r3',{}, 'base'], ['r5',{symmetry:0},'sym0']]);
// Dibuja una rejilla 4×3 con el recorte de los ojos de cada prueba y devuelve [foto, etiqueta, score, polaridad].
export async function suite(items, wait = 5000) {
  const v = window.__vto;
  let g = document.getElementById('__grid');
  if (!g) {
    g = document.createElement('canvas'); g.id = '__grid'; g.width = 1480; g.height = 600;
    Object.assign(g.style, { position: 'fixed', left: '0', top: '0', width: '1480px', height: '600px', zIndex: 99, background: '#000' });
    g.onclick = () => g.remove();
    document.body.appendChild(g);
  }
  const ctx = g.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, g.width, g.height);
  const base = JSON.parse(JSON.stringify(v.cfg.detect));
  const res = [];
  let i = 0;
  for (const [n, set = {}, label = ''] of items) {
    Object.assign(v.cfg.detect, base, set);
    await v.loadUrl('media/test/' + n + '.jpg');
    v.detector.reset();
    await new Promise((r) => setTimeout(r, wait));
    const B = v.app.B, cv = document.getElementById('view');
    if (B) {
      const s = B.s * 1.3, w = s * 1.6, h = s * 0.9, x = B.O[0] - w / 2, y = B.O[1] - h * 0.5;
      const tx = (i % 4) * 370, ty = Math.floor(i / 4) * 200;
      ctx.drawImage(cv, x, y, w, h, tx, ty, 368, 198);
      ctx.fillStyle = '#ff0'; ctx.font = '15px monospace';
      ctx.fillText(`${n} ${v.detector.glassesScore.toFixed(2)} ${v.detector.bestPol || ''} ${label}`, tx + 6, ty + 18);
    }
    res.push([n, label, +v.detector.glassesScore.toFixed(2), v.detector.bestPol]);
    i++;
  }
  Object.assign(v.cfg.detect, base);
  window.__last = res;
  return res;
}
