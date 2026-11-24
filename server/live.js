import { WebSocketServer } from 'ws';
import { userFromCookie } from './auth.js';
import { all, get, run, tx, today } from './db.js';

/**
 * Jonli dars va tezkor xabarlar. Oʻqituvchi brauzeri kadr yuboradi, server uni faqat
 * xotirada ruxsatli ota-onalarga uzatadi. Video ham, ovoz ham hech qayerga yozilmaydi.
 *
 * Kadr:  [uint32 sarlavha uzunligi][JSON sarlavha][asosiy JPEG][yuz boʻlaklari...]
 * Ovoz:  [uint32 0][uint32 dars][8 bitli mu-law, 16 kHz]
 * Boʻlak: bitta bolaning ochiq yuzi. U faqat oʻz ota-onasiga yuboriladi.
 */
const wss = new WebSocketServer({ noServer: true, maxPayload: 3 * 1024 * 1024 });
const sockets = new Set();
const lastFrame = new Map(); // lesson_id -> vaqt

export const openLesson = (classId) =>
  get('SELECT * FROM lessons WHERE class_id = ? AND ended IS NULL ORDER BY id DESC', classId);
export const isStreaming = (lessonId) => Date.now() - (lastFrame.get(lessonId) || 0) < 10000;
export const viewersOf = (classId) => new Set([...sockets].filter((s) => s.watch && s.kids?.some((k) => k.class_id === classId && k.camera)).map((s) => s.user.id)).size;

/** Huquq oʻzgarganda ulanish uziladi; brauzer yangi huquq bilan qayta ulanadi. */
export function closeUser(userId) {
  for (const s of sockets) if (s.user.id === userId) { if (s.kids) s.kids = []; s.lesson = null; s.close(4001, 'access changed'); }
}
export function sendUser(userId, msg) {
  const text = JSON.stringify(msg);
  for (const s of sockets) if (s.user.id === userId) s.send(text);
}
function notifyKids(match, msg) {
  const text = JSON.stringify(msg);
  for (const s of sockets) if (s.kids?.some(match) || (s.self && match(s.self))) s.send(text);
}
export const pushClass = (classId, msg) => notifyKids((k) => k.class_id === classId, msg);
export const pushStudent = (studentId, msg) => notifyKids((k) => k.id === studentId, msg);

/** Xona kamerasi oʻchirilsa, oʻqituvchining keshlangan ruxsati ham bekor boʻladi. */
export const recheckLessons = () => { for (const s of sockets) s.lesson = null; };

export function upgrade(req, socket, head) {
  const user = userFromCookie(req.headers.cookie);
  let sameOrigin = false;
  try { sameOrigin = new URL(req.headers.origin).host === req.headers.host; } catch { /* origin yoʻq */ }
  if (!user || !sameOrigin) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.user = user;
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => {});
    ws.on('close', () => sockets.delete(ws));
    if (user.role === 'parent') {
      ws.kids = all(`SELECT s.id, s.class_id, l.camera FROM links l JOIN students s ON s.id = l.student_id
        WHERE l.parent_id = ? AND l.status = 'approved' AND s.status = 'approved'`, user.id);
    } else if (user.role === 'student') ws.self = get('SELECT id, class_id FROM students WHERE id = ?', user.id);
    ws.on('message', (data, binary) => {
      try {
        if (!binary) onText(ws, JSON.parse(data));
        else if (user.role === 'teacher') onBinary(ws, data);
      } catch (e) { console.error('live:', e.message); }
    });
    sockets.add(ws);
  });
}

function lessonOf(ws, id) {
  if (ws.lesson?.id === id && Date.now() - ws.lesson.checked < 5000) return ws.lesson;
  const l = get(`SELECT l.*, COALESCE(r.camera_on, 1) camera_on FROM lessons l JOIN classes c ON c.id = l.class_id LEFT JOIN rooms r ON r.id = c.room_id
    WHERE l.id = ? AND l.ended IS NULL AND c.teacher_id = ?`, Number(id), ws.user.id);
  ws.lesson = l ? { ...l, checked: Date.now() } : null;
  return ws.lesson;
}
const watchers = (classId) => [...sockets].filter((s) => s.watch && s.kids?.some((k) => k.class_id === classId && k.camera));

function onBinary(ws, buf) {
  const hl = buf.readUInt32BE(0);
  if (hl === 0) {
    const lesson = lessonOf(ws, buf.readUInt32BE(4));
    if (!lesson?.camera_on) return;
    for (const s of watchers(lesson.class_id)) if (s.watch.audio && s.bufferedAmount < 400000) s.send(buf);
    return;
  }
  const head = JSON.parse(buf.subarray(4, 4 + hl));
  const lesson = lessonOf(ws, head.lesson);
  if (!lesson) return;
  if (!lesson.camera_on) {
    if (!ws.warned || Date.now() - ws.warned > 10000) { ws.warned = Date.now(); ws.send(JSON.stringify({ t: 'camera-off' })); }
    return;
  }
  lastFrame.set(lesson.id, Date.now());
  const base = buf.subarray(4 + hl, 4 + hl + head.base);
  let off = 4 + hl + head.base;
  const patches = head.patches.map((p) => { const d = buf.subarray(off, off + p.len); off += p.len; return { ...p, d }; });
  for (const s of watchers(lesson.class_id)) {
    s.frame = (s.frame || 0) + 1;
    if (s.bufferedAmount > 400000 || s.frame % s.watch.every) continue; // sekin internet yoki tejamkor rejim
    const ids = s.kids.filter((k) => k.class_id === lesson.class_id && k.camera).map((k) => k.id);
    if (s.viewed !== lesson.id) {
      s.viewed = lesson.id;
      run('INSERT OR IGNORE INTO camera_views (user_id, lesson_id, at) VALUES (?,?,?)', s.user.id, lesson.id, Date.now());
    }
    const mine = patches.filter((p) => ids.includes(p.sid));
    const out = Buffer.from(JSON.stringify({
      lesson: lesson.id, class_id: lesson.class_id, topic: lesson.topic, started: lesson.started, w: head.w, h: head.h, base: head.base,
      blur: head.blur !== false, audio: !!head.audio, at: head.at,
      faces: head.faces.filter((f) => ids.includes(f.sid)),
      scores: head.scores.filter((f) => ids.includes(f.sid)),
      patches: mine.map(({ d, ...p }) => p),
    }));
    const len = Buffer.alloc(4);
    len.writeUInt32BE(out.length);
    s.send(Buffer.concat([len, out, base, ...mine.map((p) => p.d)]));
  }
}

const int = (n) => Math.max(0, Math.min(1000, Math.trunc(Number(n)) || 0));
let onArrive = () => {};
export const setArriveHandler = (fn) => { onArrive = fn; };

function onText(ws, m) {
  if (m.t === 'watch' && ws.kids) {
    ws.watch = m.on ? { every: { high: 1, mid: 2, low: 4 }[m.quality] || 1, audio: !!m.audio } : null;
    return;
  }
  if (m.t !== 'activity' || ws.user.role !== 'teacher') return;
  const lesson = lessonOf(ws, m.lesson);
  if (!lesson) return;
  const minute = Math.floor((Date.now() - lesson.started) / 60000);
  const ids = new Set(all(`SELECT id FROM students WHERE class_id = ? AND status = 'approved'`, lesson.class_id).map((r) => r.id));
  const arrived = [];
  tx(() => {
    for (const i of m.items) {
      if (!ids.has(i.sid)) continue;
      run(`INSERT INTO activity VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET
        samples = samples + excluded.samples, seen = seen + excluded.seen, attentive = attentive + excluded.attentive`,
      lesson.id, i.sid, minute, int(i.samples), int(i.seen), int(i.attentive));
      if (i.arrived && run(`INSERT OR IGNORE INTO attendance VALUES (?, ?, 'present', 'camera')`, i.sid, today()).changes) arrived.push(i.sid);
    }
  });
  arrived.forEach((sid) => onArrive(sid, 'present'));
}

setInterval(() => {
  for (const s of sockets) { if (!s.alive) { s.terminate(); continue; } s.alive = false; s.ping(); }
  run('UPDATE lessons SET ended = ? WHERE ended IS NULL AND started < ?', Date.now(), Date.now() - 4 * 3600e3);
}, 30000).unref();
