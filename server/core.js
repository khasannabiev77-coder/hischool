/* Yoʻllar, tekshiruvlar va rol ruxsatlari. Har bir yoʻl oʻz rollarini eʼlon qiladi. */
import { get } from './db.js';

export class Err extends Error {
  constructor(status, msg, field) { super(msg); this.status = status; this.field = field; }
}
export const bad = (msg, field) => { throw new Err(400, msg, field); };
export const deny = () => { throw new Err(403, 'Bu maʼlumotni koʻrishga ruxsat yoʻq.'); };
export const missing = () => { throw new Err(404, 'Topilmadi.'); };

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const SKILLS = ['grammar', 'vocabulary', 'speaking', 'listening', 'reading', 'writing'];

export const V = {
  name(v, field, label) {
    const s = String(v ?? '').trim().replace(/\s+/g, ' ').replace(/['`‘’]/g, 'ʻ');
    if (!/^[\p{L}ʻʼ -]{2,40}$/u.test(s)) bad(`${label} kamida 2 ta harfdan iborat boʻlsin.`, field);
    return s;
  },
  phone(v, field) {
    const s = String(v ?? '').replace(/\D/g, '');
    if (!/^\d{9}$/.test(s)) bad('Raqam aynan 9 xonali boʻlishi kerak.', field);
    return s;
  },
  telegram(v, field) {
    const s = String(v ?? '').trim().replace(/^@/, '');
    if (!/^[A-Za-z]\w{4,31}$/.test(s)) bad('Telegram nik notoʻgʻri. Masalan: @ali_valiyev', field);
    return s.toLowerCase();
  },
  text(v, field, label, min, max) {
    const s = String(v ?? '').trim();
    if (s.length < min) bad(`${label} kiritilmagan yoki juda qisqa.`, field);
    if (s.length > max) bad(`${label} juda uzun.`, field);
    return s;
  },
  date(v, field) {
    const s = String(v ?? '');
    if (!/^\d{4}-\d\d-\d\d$/.test(s) || Number.isNaN(Date.parse(s))) bad('Sana notoʻgʻri.', field);
    return s;
  },
  time(v, field) {
    const s = String(v ?? '');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) bad('Vaqt notoʻgʻri.', field);
    return s;
  },
  int(v, field, label, min, max) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) bad(`${label}: ${min} dan ${max} gacha son kiriting.`, field);
    return n;
  },
  oneOf(v, list, field, label) {
    if (!list.includes(v)) bad(`${label} tanlanmagan.`, field);
    return v;
  },
  className(v, field) {
    const s = String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!/^[\p{L}\d][\p{L}\d "ʻ-]{0,15}$/u.test(s)) bad('Sinf nomini kiriting. Masalan: 7-A', field);
    return s;
  },
  descriptor(v) {
    if (v == null) return null;
    if (!Array.isArray(v) || v.length !== 128 || !v.every(Number.isFinite)) bad('Yuz maʼlumoti notoʻgʻri. Rasmni qayta oling.', 'photo');
    return JSON.stringify(v.map((x) => +x.toFixed(5)));
  },
  photo(v) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(v ?? ''));
    if (!m) bad('Rasm kerak.', 'photo');
    const b = Buffer.from(m[1], 'base64');
    if (b.length < 1000 || b.length > 2e6 || b[0] !== 0xff || b[1] !== 0xd8) bad('Rasm fayli yaroqsiz.', 'photo');
    return b;
  },
};

/* ---------- ruxsatlar: admin hammasini, oʻqituvchi faqat oʻz sinfini boshqaradi ---------- */
const adm = (u) => (u.role === 'admin' ? 1 : 0);
export const ownClass = (u, id) => get('SELECT * FROM classes WHERE id = ? AND (teacher_id = ? OR ?)', Number(id) || 0, u.id, adm(u)) || missing();
const own = (sql) => (u, id) => get(`${sql} AND (c.teacher_id = ? OR ?)`, Number(id) || 0, u.id, adm(u)) || missing();
export const ownStudent = own(`SELECT s.*, u.first, u.last, c.name class_name, c.teacher_id FROM students s JOIN users u ON u.id = s.id
  JOIN classes c ON c.id = s.class_id WHERE s.id = ?`);
export const ownHomework = own('SELECT h.* FROM homework h JOIN classes c ON c.id = h.class_id WHERE h.id = ?');
export const ownAssessment = own('SELECT a.* FROM assessments a JOIN classes c ON c.id = a.class_id WHERE a.id = ?');
export const ownSchedule = own('SELECT x.* FROM schedule x JOIN classes c ON c.id = x.class_id WHERE x.id = ?');
export const ownLesson = own('SELECT l.* FROM lessons l JOIN classes c ON c.id = l.class_id WHERE l.id = ?');
export const ownLink = own(`SELECT l.*, s.status student_status FROM links l JOIN students s ON s.id = l.student_id JOIN classes c ON c.id = s.class_id WHERE l.id = ?`);

export function canSee(u, sid) {
  if (u.role === 'admin') return true;
  if (u.role === 'student') return u.id === sid;
  if (u.role === 'parent') {
    return !!get(`SELECT 1 FROM links l JOIN students s ON s.id = l.student_id
      WHERE l.parent_id = ? AND l.student_id = ? AND l.status = 'approved' AND s.status = 'approved'`, u.id, sid);
  }
  return !!get('SELECT 1 FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ? AND c.teacher_id = ?', sid, u.id);
}

/* ---------- yoʻllar: roles null = hamma, [] = kirgan har kim ---------- */
const routes = [];
export const on = (method, pattern, roles, fn) => routes.push({
  method, roles, fn, re: new RegExp('^/api' + pattern.replace(/:(\w+)/g, '(?<$1>\\d+)') + '$'),
});

export const SENT = Symbol('sent');
export async function handle(c, pathname) {
  let known = false;
  for (const r of routes) {
    const m = r.re.exec(pathname);
    if (!m) continue;
    known = true;
    if (r.method !== c.method) continue;
    if (r.roles) {
      if (!c.user) throw new Err(401, 'Avval tizimga kiring.');
      if (r.roles.length && !r.roles.includes(c.user.role)) deny();
    }
    c.p = m.groups || {};
    if (c.method !== 'GET') c.body = await c.readBody();
    return r.fn(c);
  }
  throw new Err(known ? 405 : 404, 'Topilmadi.');
}
