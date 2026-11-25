/* Lokal yoki oʻz serveringiz uchun HTTP server. Netlify da ishlatilmaydi. */
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import { exec } from 'node:child_process';
import path from 'node:path';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { ROOT, close, get } from './db.js';
import { api, ensureAdmin } from './app.js';
import { VENDOR, SECURITY } from './static.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PROXY = process.env.TRUST_PROXY === '1';
const CERT = path.join(ROOT, 'certs');
const tls = existsSync(path.join(CERT, 'cert.pem')) && existsSync(path.join(CERT, 'key.pem'));

const MOUNTS = [...VENDOR.map(([url, dir]) => [url, path.join(ROOT, 'node_modules', dir)]), ['/', path.join(ROOT, 'public')]];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, pathname) {
  const [prefix, dir] = MOUNTS.find(([p]) => pathname.startsWith(p));
  let file = path.join(dir, pathname.slice(prefix.length));
  const inside = file === dir || file.startsWith(dir + path.sep);
  if (!inside || !existsSync(file) || statSync(file).isDirectory()) {
    if (path.extname(pathname)) { res.writeHead(404, SECURITY); return res.end(); }
    file = path.join(ROOT, 'public', 'index.html');
  }
  const st = statSync(file);
  const etag = `"${st.size.toString(36)}-${Math.trunc(st.mtimeMs).toString(36)}"`;
  const head = { ...SECURITY, ETag: etag, 'Cache-Control': pathname.startsWith('/vendor/') ? 'public, max-age=604800' : 'no-cache' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); return res.end(); }
  res.writeHead(200, { ...head, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

function collect(req, max) {
  return new Promise((ok, no) => {
    const parts = [];
    let n = 0;
    req.on('data', (d) => { n += d.length; if (n <= max) parts.push(d); });
    req.on('end', () => ok(n > max ? null : Buffer.concat(parts)));
    req.on('error', no);
  });
}

async function onRequest(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, pathname);
  }
  const secure = tls || (PROXY && req.headers['x-forwarded-proto'] === 'https');
  const data = req.method === 'GET' || req.method === 'HEAD' ? undefined : await collect(req, 5e6);
  if (data === null) { res.writeHead(413, { Connection: 'close' }); return res.end(); }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (!['connection', 'transfer-encoding'].includes(k) && (PROXY || k !== 'x-forwarded-host')) headers.set(k, String(v));
  const r = await api(new Request(new URL(req.url, `${secure ? 'https' : 'http'}://${req.headers.host || 'localhost'}`), { method: req.method, headers, body: data }), {
    ip: (PROXY && String(req.headers['x-forwarded-for'] || '').split(',').pop().trim()) || req.socket.remoteAddress, secure, serverless: false,
  });
  if (res.destroyed) return;
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}

const wrap = (req, res) => { onRequest(req, res).catch((e) => { console.error(e); res.destroy(); }); };
const server = tls
  ? https.createServer({ cert: readFileSync(path.join(CERT, 'cert.pem')), key: readFileSync(path.join(CERT, 'key.pem')) }, wrap)
  : http.createServer(wrap);
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `${PORT}-port band. Dastur allaqachon ochiq boʻlishi mumkin.` : e);
  process.exit(1);
});
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => { close().finally(() => process.exit(0)); });

console.log('\n  Baza ochilmoqda (birinchi marta 20 soniyagacha)…');
const password = await ensureAdmin().catch((e) => { if (e.code !== 'LOCKED') throw e; console.error(`\n  ${e.message}\n`); process.exit(1); });
const { n } = await get('SELECT COUNT(*) n FROM users');
server.listen(PORT, HOST, () => {
  const proto = tls ? 'https' : 'http';
  console.log(`\n  HISCHOOL ishga tushdi\n  Shu kompyuterda:  ${proto}://localhost:${PORT}`);
  if (HOST === '0.0.0.0') {
    for (const i of Object.values(os.networkInterfaces()).flat()) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  Wi-Fi orqali:     ${proto}://${i.address}:${PORT}`);
    }
  }
  if (password) console.log(`\n  ADMIN yaratildi. Login: HS-ADMIN   Parol: ${password}\n  Parol faqat hozir koʻrsatiladi, yozib oling.\n`);
  console.log(`  Foydalanuvchilar: ${n}\n`);
  if (process.env.HS_OPEN && process.platform === 'win32') exec(`start "" ${proto}://localhost:${PORT}`);
});
