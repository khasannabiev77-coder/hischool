import { scryptSync, randomBytes, randomInt, timingSafeEqual, createHash } from 'node:crypto';
import { get, run, today } from './db.js';

const WORDS = `apple book chair table river green happy tiger lemon music paper pencil window garden summer winter
orange planet rocket silver golden friend school lesson letter number circle square flower forest island
bridge castle dragon engine family guitar hammer jacket kitten ladder market nature ocean parrot quick
rabbit salad ticket umbrella violin water yellow zebra bread cloud dream earth field grape horse juice
knight light mountain night olive piano queen rain star train uncle voice whale young bright clever
brave smile story travel winner writer reader singer dancer doctor farmer pilot sailor basket bottle
button camera carrot cheese cherry coffee cookie desert dinner feather finger honey hotel jungle magic
mirror monkey morning museum panda peach pepper pocket potato rainbow shadow shower spring street
sugar sunny sweet turtle valley velvet wagon walnut wonder world`.split(/\s+/);

/** Eslab qolish oson parol: ikkita inglizcha soʻz va uch xonali son. */
export const newPassword = () =>
  `${WORDS[randomInt(WORDS.length)]}-${WORDS[randomInt(WORDS.length)]}-${randomInt(100, 1000)}`;

export function hash(password) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 32).toString('hex')}`;
}
export function verify(password, stored) {
  const [salt, key] = stored.split(':').map((x) => Buffer.from(x, 'hex'));
  return timingSafeEqual(scryptSync(password, salt, 32), key);
}

export async function newLogin() {
  for (;;) {
    const login = `HS-${randomInt(1000, 100000)}`;
    if (!await get('SELECT 1 FROM users WHERE login = ?', login)) return login;
  }
}

const sha = (t) => createHash('sha256').update(t).digest('hex');
export const SESSION_MS = 180 * 864e5; // 180 kun eslab qolinadi

export async function createSession(userId, ua = '') {
  const token = randomBytes(32).toString('base64url'), now = Date.now();
  await run('DELETE FROM sessions WHERE expires < ?', now);
  await run('INSERT INTO sessions (token, user_id, expires, created, seen, ua) VALUES (?,?,?,?,?,?)', sha(token), userId, now + SESSION_MS, now, now, String(ua).slice(0, 200));
  await visit(userId);
  return token;
}
const visit = (id) => run('INSERT INTO visits VALUES (?, ?) ON CONFLICT (user_id, date) DO NOTHING', id, today());
export async function userFromCookie(header) {
  const token = /(?:^|;\s*)hs=([\w-]+)/.exec(header || '')?.[1];
  if (!token) return null;
  const key = sha(token);
  const u = await get(`SELECT u.id, u.role, u.login, u.first, u.last, u.phone, u.telegram, u.position, u.experience, u.bio, u.public, u.status, u.photo IS NOT NULL has_photo, s.seen
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?`, key, Date.now());
  if (!u) return null;
  if (Date.now() - u.seen > 60000) {
    await Promise.all([run('UPDATE sessions SET seen = ? WHERE token = ?', Date.now(), key), visit(u.id)]);
  }
  return { ...u, session: key };
}
export const dropSession = (key) => run('DELETE FROM sessions WHERE token = ?', key);
export const dropSessions = (userId, except = '') =>
  run('DELETE FROM sessions WHERE user_id = ? AND token <> ?', userId, except);

/** Urinishlar cheklovi bazada: serverless muhitda har nusxa xotirasi alohida. */
export async function limited(key, max) {
  const h = await get('SELECT n FROM hits WHERE key = ? AND until > ?', key, Date.now());
  return !!h && h.n >= max;
}
export async function hit(key, ms) {
  const now = Date.now();
  await run(`INSERT INTO hits VALUES (?, 1, ?) ON CONFLICT (key) DO UPDATE SET n = CASE WHEN hits.until > ? THEN hits.n + 1 ELSE 1 END,
    until = CASE WHEN hits.until > ? THEN hits.until ELSE excluded.until END`, key, now + ms, now, now);
  if (randomInt(50) === 0) await run('DELETE FROM hits WHERE until < ?', now);
}
export const clearHits = (key) => run('DELETE FROM hits WHERE key = ?', key);
