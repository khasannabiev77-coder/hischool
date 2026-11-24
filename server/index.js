import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { ROOT, get, run, teacherCode } from './db.js';
import { userFromCookie, SESSION_MS, hash, newPassword } from './auth.js';
import { handle, Err, SENT } from './core.js';
import './routes-auth.js';
import './routes-school.js';
import './routes-admin.js';
import { upgrade } from './live.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PROXY = process.env.TRUST_PROXY === '1';
const CERT = path.join(ROOT, 'certs');
const tls = existsSync(path.join(CERT, 'cert.pem')) && existsSync(path.join(CERT, 'key.pem'));

const nm = (p) => path.join(ROOT, 'node_modules', p);
const MOUNTS = [
  ['/vendor/face/', nm('@vladmandic/face-api/dist')],
  ['/vendor/model/', nm('@vladmandic/face-api/model')],
  ['/vendor/wasm/', nm('@tensorflow/tfjs-backend-wasm/dist')],
  ['/vendor/onest/', nm('@fontsource-variable/onest/files')],
  ['/', path.join(ROOT, 'public')],
];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
  '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.webmanifest': 'application/manifest+json',
};
const SEC = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; media-src 'self' blob:; connect-src 'self' ws: wss: data: blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

function serveStatic(req, res, pathname) {
  const [prefix, dir] = MOUNTS.find(([p]) => pathname.startsWith(p));
  let file = path.join(dir, pathname.slice(prefix.length));
  const inside = file === dir || file.startsWith(dir + path.sep);
  if (!inside || !existsSync(file) || statSync(file).isDirectory()) {
    if (path.extname(pathname)) { res.writeHead(404, SEC); return res.end(); }
    file = path.join(ROOT, 'public', 'index.html');
  }
  const st = statSync(file);
  const etag = `"${st.size.toString(36)}-${Math.trunc(st.mtimeMs).toString(36)}"`;
  const head = { ...SEC, ETag: etag, 'Cache-Control': pathname.startsWith('/vendor/') ? 'public, max-age=604800' : 'no-cache' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); return res.end(); }
  res.writeHead(200, { ...head, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

function readBody(req) {
  return new Promise((ok, no) => {
    if (!/^application\/json/.test(req.headers['content-type'] || '')) return no(new Err(415, 'JSON kutilgan.'));
    const parts = [];
    let n = 0;
    req.on('data', (d) => { n += d.length; if (n > 4e6) { no(new Err(413, 'Maʼlumot juda katta.')); req.pause(); } else parts.push(d); });
    req.on('end', () => {
      try { const v = JSON.parse(Buffer.concat(parts).toString() || '{}'); ok(v && typeof v === 'object' ? v : {}); }
      catch { no(new Err(400, 'Soʻrov notoʻgʻri.')); }
    });
    req.on('error', no);
  });
}

async function onRequest(req, res) {
  let url, pathname;
  try { url = new URL(req.url, 'http://x'); pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, pathname);
  }
  const secure = tls || (PROXY && req.headers['x-forwarded-proto'] === 'https');
  const extra = {};
  const c = {
    method: req.method, q: url.searchParams, res, body: {}, user: userFromCookie(req.headers.cookie), ua: req.headers['user-agent'] || '',
    ip: (PROXY && String(req.headers['x-forwarded-for'] || '').split(',').pop().trim()) || req.socket.remoteAddress,
    readBody: () => readBody(req),
    setSession: (t) => { extra['Set-Cookie'] = `hs=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${t ? SESSION_MS / 1000 : 0}${secure ? '; Secure' : ''}`; },
  };
  let status = 200, out;
  try {
    out = await handle(c, pathname);
    if (out === SENT) return;
  } catch (e) {
    if (e instanceof Err) { status = e.status; out = { error: e.message, field: e.field }; }
    else { console.error(e); status = 500; out = { error: 'Serverda xatolik yuz berdi.' }; }
  }
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { ...SEC, ...extra, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(status === 413 ? { Connection: 'close' } : {}) });
  res.end(JSON.stringify(out));
}

const wrap = (req, res) => { onRequest(req, res).catch((e) => { console.error(e); res.destroy(); }); };
const server = tls
  ? https.createServer({ cert: readFileSync(path.join(CERT, 'cert.pem')), key: readFileSync(path.join(CERT, 'key.pem')) }, wrap)
  : http.createServer(wrap);
server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => {});
  if (req.url === '/live') upgrade(req, socket, head); else socket.destroy();
});
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `${PORT}-port band. Dastur allaqachon ochiq boʻlishi mumkin.` : e);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  const proto = tls ? 'https' : 'http';
  let admin = '';
  if (!get("SELECT 1 FROM users WHERE role = 'admin'")) {
    const password = newPassword();
    run("INSERT INTO users (role, login, pass, first, last, created) VALUES ('admin', 'HS-ADMIN', ?, 'HISCHOOL', 'Admin', ?)", hash(password), Date.now());
    admin = `\n  ADMIN yaratildi. Login: HS-ADMIN   Parol: ${password}\n  Parol faqat hozir koʻrsatiladi, yozib oling.\n`;
  }
  console.log(`\n  HISCHOOL ishga tushdi\n  Shu kompyuterda:  ${proto}://localhost:${PORT}`);
  if (HOST === '0.0.0.0') {
    for (const i of Object.values(os.networkInterfaces()).flat()) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  Wi-Fi orqali:     ${proto}://${i.address}:${PORT}`);
    }
  }
  console.log(`\n  Oʻqituvchi roʻyxatdan oʻtishi uchun maktab kodi:  ${teacherCode()}`);
  if (admin) console.log(admin);
  const { n } = get('SELECT COUNT(*) n FROM users');
  console.log(`  Foydalanuvchilar: ${n}\n`);
});
