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

export function newLogin() {
  for (;;) {
    const login = `HS-${randomInt(1000, 100000)}`;
    if (!get('SELECT 1 FROM users WHERE login = ?', login)) return login;
  }
}

const sha = (t) => createHash('sha256').update(t).digest('hex');
export const SESSION_MS = 180 * 864e5; // 180 kun eslab qolinadi

export function createSession(userId, ua = '') {
  const token = randomBytes(32).toString('base64url'), now = Date.now();
  run('DELETE FROM sessions WHERE expires < ?', now);
  run('INSERT INTO sessions (token, user_id, expires, created, seen, ua) VALUES (?,?,?,?,?,?)', sha(token), userId, now + SESSION_MS, now, now, String(ua).slice(0, 200));
  run('INSERT OR IGNORE INTO visits VALUES (?, ?)', userId, today());
  return token;
}
export function userFromCookie(header) {
  const token = /(?:^|;\s*)hs=([\w-]+)/.exec(header || '')?.[1];
  if (!token) return null;
  const key = sha(token);
  const u = get(`SELECT u.id, u.role, u.login, u.first, u.last, u.phone, u.telegram, u.position, u.experience, u.bio, u.public, u.photo IS NOT NULL has_photo, s.seen
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?`, key, Date.now());
  if (!u) return null;
  if (Date.now() - u.seen > 60000) {
    run('UPDATE sessions SET seen = ? WHERE token = ?', Date.now(), key);
    run('INSERT OR IGNORE INTO visits VALUES (?, ?)', u.id, today());
  }
  return { ...u, session: key };
}
export const dropSession = (key) => run('DELETE FROM sessions WHERE token = ?', key);
export const dropSessions = (userId, except = '') =>
  run('DELETE FROM sessions WHERE user_id = ? AND token <> ?', userId, except);

/** Urinishlar cheklovi: `hit` sanaydi, `limited` chegaradan oʻtganini aytadi. */
const hits = new Map();
export function limited(key, max) {
  const h = hits.get(key);
  return !!h && h.until > Date.now() && h.n >= max;
}
export function hit(key, ms) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.until <= now) hits.set(key, { n: 1, until: now + ms });
  else h.n++;
  if (hits.size > 5000) for (const [k, v] of hits) if (v.until <= now) hits.delete(k);
}
export const clearHits = (key) => hits.delete(key);
