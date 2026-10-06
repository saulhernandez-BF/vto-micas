// Servidor estático mínimo (sin dependencias). La cámara requiere localhost o HTTPS.
// Un solo puerto (5173) que entiende HTTP y HTTPS a la vez:
//  · http://localhost:5173          → en esta computadora
//  · https://<IP-de-tu-compu>:5173  → desde la tablet (misma red Wi-Fi). La cámara exige HTTPS fuera de localhost.
//    Certificado propio: la primera vez Safari/Chrome muestra "conexión no privada" → Mostrar detalles → Visitar el sitio.
import { createServer } from 'node:http';
import { createServer as createTcp } from 'node:net';
import { createServer as createHttps } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { networkInterfaces, hostname } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 5173;
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.otf': 'font/otf', '.ttf': 'font/ttf' };

async function handler(req, res) {
  try {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let f = join(ROOT, p);
    if (f.includes(join(ROOT, 'certs'))) throw 0; // nunca servir la llave
    if ((await stat(f)).isDirectory()) f = join(f, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(f));
  } catch {
    res.writeHead(404); res.end('404');
  }
}

// IPs de esta compu en la red local; Wi-Fi/Ethernet de la Mac (en0, en1) primero, VPN/Docker al final.
const lanIPs = Object.entries(networkInterfaces())
  .flatMap(([name, list]) => (list || []).filter((i) => i.family === 'IPv4' && !i.internal).map((i) => ({ name, ip: i.address })))
  .map((x) => ({ ...x, wifi: /^(en\d|eth\d|wlan\d|Wi-?Fi|Ethernet)/i.test(x.name) && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.ip) }))
  .sort((a, b) => b.wifi - a.wifi);

const httpSrv = createServer(handler);
const KEY = join(ROOT, 'certs/key.pem'), CERT = join(ROOT, 'certs/cert.pem');
const tls = existsSync(KEY) && existsSync(CERT);
const httpsSrv = tls ? createHttps({ key: readFileSync(KEY), cert: readFileSync(CERT) }, handler) : null;

// Mira el primer byte: 0x16 = saludo TLS → HTTPS; cualquier otro → HTTP.
createTcp((sock) => {
  sock.once('data', (buf) => {
    sock.pause(); sock.unshift(buf);
    (buf[0] === 0x16 && httpsSrv ? httpsSrv : httpSrv).emit('connection', sock);
    process.nextTick(() => sock.resume());
  });
  sock.on('error', () => {});
}).listen(PORT, '0.0.0.0', () => {
  console.log(`VTO Micas → http://localhost:${PORT}  (esta computadora)`);
  if (!tls) return console.log('(Sin certs/ → no hay acceso para la tablet)');
  console.log('\nPara la tablet (misma red Wi-Fi), abre una de estas:');
  for (const { ip, name, wifi } of lanIPs) console.log(`   https://${ip}:${PORT}   ${wifi ? '← red Wi-Fi/Ethernet (' + name + ') — usa esta' : '(' + name + ', probablemente VPN u otra red)'}`);
  console.log(`   https://${hostname().replace(/\.local$/, '')}.local:${PORT}`);
  console.log('La primera vez acepta el aviso de certificado (Mostrar detalles → Visitar este sitio web).\n');
});
