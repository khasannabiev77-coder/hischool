/**
 * Jonli dars (WebSocket siz, serverless muhitda ham ishlaydi).
 * Oʻqituvchi brauzeri eng oxirgi kadrni yuboradi, ota-ona brauzeri uni soʻrab oladi.
 * Kadrlar yozib borilmaydi: har yangi kadr eskisini almashtiradi, dars tugagach oʻchadi.
 *
 * Kadr: [uint32 sarlavha uzunligi][JSON sarlavha][asosiy JPEG][yuz boʻlaklari...][ovoz]
 * Boʻlak: bitta bolaning ochiq yuzi. U faqat oʻz ota-onasiga yuboriladi.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { all, get, run, today } from './db.js';
import { Err, bad, deny, on } from './core.js';
import { dropFrame, getFrame, putFrame } from './files.js';
import { notifyFamily } from './notify.js';

const MAX_LESSON = 4 * 3600e3, BEAT_MS = 20000, VIEW_MS = 25000;
export const openWhere = () => Date.now() - MAX_LESSON;
export const openLesson = (classId) => get('SELECT * FROM lessons WHERE class_id = ? AND ended IS NULL AND started > ? ORDER BY id DESC LIMIT 1', classId, openWhere());
export const streaming = (l) => !l.ended && Date.now() - l.beat < BEAT_MS;
export async function endLesson(id) {
  await run('UPDATE lessons SET ended = ? WHERE id = ? AND ended IS NULL', Date.now(), id);
  await dropFrame(id);
}
/** Dars id -> hozir koʻrayotganlar soni. */
export async function viewers() {
  return new Map((await all('SELECT lesson_id, COUNT(*) n FROM camera_views WHERE seen > ? GROUP BY lesson_id', Date.now() - VIEW_MS)).map((r) => [r.lesson_id, r.n]));
}

/* ---------- qisqa muddatli ruxsat: har kadrda bazaga murojaat qilmaslik uchun ---------- */
let key;
async function liveKey() {
  if (key) return key;
  await run(`INSERT INTO settings VALUES ('live_key', ?) ON CONFLICT (k) DO NOTHING`, randomBytes(32).toString('hex'));
  key = Buffer.from((await get(`SELECT v FROM settings WHERE k = 'live_key'`)).v, 'hex');
  return key;
}
const mac = async (body) => createHmac('sha256', await liveKey()).update(body).digest();
async function sign(data, ms) {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + ms })).toString('base64url');
  return `${body}.${(await mac(body)).toString('base64url')}`;
}
async function open(token, kind) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig, 'base64url'), b = await mac(body);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const d = JSON.parse(Buffer.from(body, 'base64url'));
  return d.kind === kind && d.exp > Date.now() ? d : null;
}

/* ---------- oʻqituvchi ---------- */
const int = (n) => Math.max(0, Math.min(1000, Math.trunc(Number(n)) || 0));
on('POST', '/live/beat', ['teacher'], async (c) => {
  const l = await get(`SELECT l.*, COALESCE(r.camera_on, 1) camera_on FROM lessons l JOIN classes c ON c.id = l.class_id LEFT JOIN rooms r ON r.id = c.room_id
    WHERE l.id = ? AND c.teacher_id = ? AND l.ended IS NULL AND l.started > ?`, Number(c.body.lesson) || 0, c.user.id, openWhere());
  if (!l) throw new Err(409, 'Dars yakunlangan.');
  if (l.camera_on) await run('UPDATE lessons SET beat = ? WHERE id = ?', Date.now(), l.id);
  const raw = Array.isArray(c.body.items) ? c.body.items.slice(0, 200) : [];
  if (raw.length) {
    const ids = new Set((await all(`SELECT id FROM students WHERE class_id = ? AND status = 'approved'`, l.class_id)).map((r) => r.id));
    const items = [...new Map(raw.filter((i) => ids.has(i?.sid)).map((i) => [i.sid, { sid: i.sid, samples: int(i.samples), seen: int(i.seen), attentive: int(i.attentive), arrived: !!i.arrived }])).values()];
    const json = JSON.stringify(items);
    await run(`INSERT INTO activity SELECT ?, sid, ?::int, samples, seen, attentive FROM json_to_recordset(?::json) AS x(sid int, samples int, seen int, attentive int)
      ON CONFLICT (lesson_id, student_id, minute) DO UPDATE SET samples = activity.samples + excluded.samples, seen = activity.seen + excluded.seen, attentive = activity.attentive + excluded.attentive`,
    l.id, Math.floor((Date.now() - l.started) / 60000), json);
    const date = today();
    const came = await all(`INSERT INTO attendance SELECT sid, ?::text, 'present', 'camera' FROM json_to_recordset(?::json) AS x(sid int, arrived boolean) WHERE arrived
      ON CONFLICT (student_id, date) DO NOTHING RETURNING student_id id`, date, json);
    for (const a of came) await notifyFamily(a.id, `att:${date}:${a.id}`, 'attendance', { status: 'present', date }, '#/attendance', false);
  }
  return { camera_on: !!l.camera_on, viewers: (await viewers()).get(l.id) || 0, token: l.camera_on ? await sign({ kind: 'send', lesson: l.id }, 25000) : null };
});

on('POST', '/live/frame', null, async (c) => {
  const t = await open(c.q.get('t'), 'send');
  if (!t) deny();
  const buf = await c.bytes(4e6);
  if (buf.length < 8 || buf.readUInt32BE(0) > buf.length - 4) bad('Kadr notoʻgʻri.');
  await putFrame(t.lesson, buf);
  return {};
});

/* ---------- ota-ona ---------- */
async function grant(c) {
  if (!c.user) throw new Err(401, 'Avval tizimga kiring.');
  if (c.user.role !== 'parent') deny();
  const sid = Number(c.q.get('student')) || 0;
  const s = await get(`SELECT s.id, s.class_id, l.camera, COALESCE(r.camera_on, 1) camera_on FROM links l JOIN students s ON s.id = l.student_id JOIN classes c ON c.id = s.class_id
    LEFT JOIN rooms r ON r.id = c.room_id WHERE l.parent_id = ? AND s.id = ? AND l.status = 'approved' AND s.status = 'approved'`, c.user.id, sid);
  if (!s) deny();
  if (!s.camera || !s.camera_on) return { why: s.camera ? 'room' : 'denied' };
  const l = await openLesson(s.class_id);
  if (!l) return { why: 'none' };
  await run('INSERT INTO camera_views (user_id, lesson_id, at, seen) VALUES (?,?,?,?) ON CONFLICT (user_id, lesson_id) DO UPDATE SET seen = excluded.seen', c.user.id, l.id, Date.now(), Date.now());
  const data = { kind: 'view', sid: s.id, lesson: l.id, topic: l.topic, started: l.started };
  return { data, token: await sign(data, 10000) };
}
const nothing = (why, token) => new Response(null, { status: 204, headers: { 'X-Live': why, 'Cache-Control': 'no-store', ...(token ? { 'X-Live-Token': token } : {}) } });

on('GET', '/live/frame', null, async (c) => {
  let token = null;
  let t = await open(c.q.get('t'), 'view');
  if (!t || t.sid !== Number(c.q.get('student'))) {
    const g = await grant(c);
    if (g.why) return nothing(g.why);
    t = g.data; token = g.token;
  }
  const f = await getFrame(t.lesson, c.q.get('since'));
  if (!f || Date.now() - f.at > 12000) return nothing('waiting', token);
  if (String(f.at) === c.q.get('since')) return nothing('same', token);
  const buf = f.buf, hl = buf.readUInt32BE(0), head = JSON.parse(buf.subarray(4, 4 + hl));
  const base = buf.subarray(4 + hl, 4 + hl + head.base);
  let off = 4 + hl + head.base;
  const patches = head.patches.map((p) => { const d = buf.subarray(off, off + p.len); off += p.len; return { ...p, d }; });
  const mine = patches.filter((p) => p.sid === t.sid);
  const sound = c.q.get('audio') === '1' && head.audioLen ? buf.subarray(off, off + head.audioLen) : Buffer.alloc(0);
  const out = Buffer.from(JSON.stringify({
    at: f.at, topic: t.topic, started: t.started, w: head.w, h: head.h, base: head.base, blur: head.blur !== false, audio: !!head.audio,
    audioPos: head.audioPos, audioLen: sound.length,
    faces: head.faces.filter((x) => x.sid === t.sid), scores: head.scores.filter((x) => x.sid === t.sid), patches: mine.map(({ d, ...p }) => p),
  }));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(out.length);
  return new Response(Buffer.concat([len, out, base, ...mine.map((p) => p.d), sound]), {
    headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Live': 'frame', ...(token ? { 'X-Live-Token': token } : {}) },
  });
});
