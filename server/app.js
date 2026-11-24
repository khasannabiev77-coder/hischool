/* API: standart Request -> Response. Lokal server ham, Netlify funksiyasi ham shuni chaqiradi. */
import { SERVERLESS, get, run } from './db.js';
import { userFromCookie, SESSION_MS, hash, newPassword } from './auth.js';
import { Err, handle } from './core.js';
import './live.js';
import './routes-auth.js';
import './routes-school.js';
import './routes-admin.js';

/** Birinchi ishga tushishda admin. Netlify da parol ADMIN_PASSWORD oʻzgaruvchisidan olinadi. */
export async function ensureAdmin() {
  if (await get(`SELECT 1 FROM users WHERE role = 'admin'`)) return null;
  const given = (process.env.ADMIN_PASSWORD || '').trim().toLowerCase();
  if (SERVERLESS && given.length < 8) {
    console.warn('Admin yaratilmadi: ADMIN_PASSWORD (kamida 8 belgi) oʻzgaruvchisini kiriting va qayta deploy qiling.');
    return null;
  }
  const password = given.length >= 8 ? given : newPassword();
  await run(`INSERT INTO users (role, login, pass, first, last, created) VALUES ('admin', 'HS-ADMIN', ?, 'HISCHOOL', 'Admin', ?) ON CONFLICT (login) DO NOTHING`, hash(password), Date.now());
  return given ? null : password;
}

async function body(req, max) {
  const size = Number(req.headers.get('content-length') || 0);
  if (size > max) throw new Err(413, 'Maʼlumot juda katta.');
  const b = Buffer.from(await req.arrayBuffer());
  if (b.length > max) throw new Err(413, 'Maʼlumot juda katta.');
  return b;
}
async function json(req) {
  if (!/^application\/json/.test(req.headers.get('content-type') || '')) throw new Err(415, 'JSON kutilgan.');
  try { const v = JSON.parse((await body(req, 4e6)).toString() || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { if (e instanceof Err) throw e; throw new Err(400, 'Soʻrov notoʻgʻri.'); }
}

const HEAD = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store' };
let boot;

export async function api(req, { ip, secure, serverless }) {
  const url = new URL(req.url), extra = {};
  let status = 200, out;
  try {
    await (boot ??= ensureAdmin().catch((e) => { boot = null; throw e; }));
    // Boshqa saytdan yuborilgan oʻzgartirish soʻrovlari rad etiladi.
    const origin = req.headers.get('origin');
    if (req.method !== 'GET' && origin && new URL(origin).host !== (req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host)) throw new Err(403, 'Soʻrov boshqa saytdan kelgan.');
    const c = {
      method: req.method, q: url.searchParams, body: {}, ip, serverless, ua: req.headers.get('user-agent') || '',
      user: await userFromCookie(req.headers.get('cookie')),
      readBody: () => json(req), bytes: (max) => body(req, max),
      setSession: (t) => { extra['Set-Cookie'] = `hs=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${t ? SESSION_MS / 1000 : 0}${secure ? '; Secure' : ''}`; },
    };
    out = await handle(c, url.pathname);
    if (out instanceof Response) return out;
  } catch (e) {
    if (e instanceof Err) { status = e.status; out = { error: e.message, field: e.field }; }
    else if (e.code === '23505') { status = 400; out = { error: 'Bu maʼlumot allaqachon bor.' }; }
    else { console.error(e); status = 500; out = { error: 'Serverda xatolik yuz berdi.' }; }
  }
  return new Response(JSON.stringify(out), { status, headers: { ...HEAD, ...extra, 'Content-Type': 'application/json; charset=utf-8' } });
}
