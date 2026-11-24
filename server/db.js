import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const DATA = path.resolve(process.env.HS_DATA || path.join(ROOT, 'data'));
export const PHOTOS = path.join(DATA, 'photos');
mkdirSync(PHOTOS, { recursive: true });

export const db = new DatabaseSync(path.join(DATA, 'hischool.db'));
db.exec('PRAGMA journal_mode = WAL;');

const USERS = `(
  id INTEGER PRIMARY KEY, role TEXT NOT NULL CHECK (role IN ('admin','teacher','student','parent')),
  login TEXT UNIQUE NOT NULL, pass TEXT NOT NULL,
  first TEXT NOT NULL, last TEXT NOT NULL, phone TEXT, telegram TEXT, created INTEGER NOT NULL)`;

// 1.0 dan oʻtish: users jadvalidagi rol cheklovi admin bilan kengaytiriladi.
const old = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`).get();
if (old && !old.sql.includes(`'admin'`)) {
  db.exec(`PRAGMA foreign_keys = OFF; BEGIN;
    CREATE TABLE users_new ${USERS};
    INSERT INTO users_new SELECT id, role, login, pass, first, last, phone, telegram, created FROM users;
    DROP TABLE users; ALTER TABLE users_new RENAME TO users; COMMIT;`);
}

db.exec(`
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users ${USERS};
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, camera_on INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, teacher_id INTEGER NOT NULL REFERENCES users ON DELETE RESTRICT,
  UNIQUE (name, teacher_id));
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes ON DELETE RESTRICT,
  address TEXT NOT NULL, parent_phone TEXT NOT NULL, name_key TEXT NOT NULL,
  photo TEXT, descriptor TEXT, status TEXT NOT NULL DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE,
  student_id INTEGER REFERENCES students ON DELETE CASCADE,
  child_first TEXT NOT NULL, child_last TEXT NOT NULL, name_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', UNIQUE (parent_id, student_id));
CREATE TABLE IF NOT EXISTS homework (
  id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes ON DELETE CASCADE,
  title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', due TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('activity','behaviour','homework')),
  ref TEXT NOT NULL, date TEXT NOT NULL, value INTEGER, note TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL,
  UNIQUE (student_id, kind, ref));
CREATE TABLE IF NOT EXISTS attendance (
  student_id INTEGER NOT NULL REFERENCES students ON DELETE CASCADE, date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','late','absent')), source TEXT NOT NULL,
  PRIMARY KEY (student_id, date));
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes ON DELETE CASCADE,
  topic TEXT NOT NULL, date TEXT NOT NULL, started INTEGER NOT NULL, ended INTEGER);
CREATE TABLE IF NOT EXISTS activity (
  lesson_id INTEGER NOT NULL REFERENCES lessons ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students ON DELETE CASCADE, minute INTEGER NOT NULL,
  samples INTEGER NOT NULL, seen INTEGER NOT NULL, attentive INTEGER NOT NULL,
  PRIMARY KEY (lesson_id, student_id, minute));
CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes ON DELETE CASCADE,
  dow INTEGER NOT NULL CHECK (dow BETWEEN 1 AND 7), start TEXT NOT NULL, finish TEXT NOT NULL, subject TEXT NOT NULL,
  room_id INTEGER REFERENCES rooms ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes ON DELETE CASCADE,
  title TEXT NOT NULL, skill TEXT NOT NULL, date TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS results (
  assessment_id INTEGER NOT NULL REFERENCES assessments ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students ON DELETE CASCADE,
  score INTEGER NOT NULL, comment TEXT NOT NULL DEFAULT '', PRIMARY KEY (assessment_id, student_id));
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES users ON DELETE SET NULL, text TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ratings (
  parent_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE, teacher_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE,
  stars INTEGER NOT NULL, PRIMARY KEY (parent_id, teacher_id));
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE, key TEXT NOT NULL,
  type TEXT NOT NULL, data TEXT NOT NULL, link TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, key));
CREATE TABLE IF NOT EXISTS camera_views (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES lessons ON DELETE CASCADE, at INTEGER NOT NULL, UNIQUE (user_id, lesson_id));
CREATE TABLE IF NOT EXISTS camera_reports (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes ON DELETE CASCADE, text TEXT NOT NULL, at INTEGER NOT NULL, resolved INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS visits (user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE, date TEXT NOT NULL, PRIMARY KEY (user_id, date));
CREATE INDEX IF NOT EXISTS i_students_class ON students (class_id);
CREATE INDEX IF NOT EXISTS i_activity_student ON activity (student_id);
CREATE INDEX IF NOT EXISTS i_lessons_class ON lessons (class_id, date);
CREATE INDEX IF NOT EXISTS i_notif ON notifications (user_id, created);
CREATE INDEX IF NOT EXISTS i_results ON results (student_id);
`);

function column(table, name, def) {
  if (!db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
}
column('users', 'photo', 'TEXT');
column('users', 'position', `TEXT NOT NULL DEFAULT ''`);
column('users', 'experience', 'INTEGER');
column('users', 'bio', `TEXT NOT NULL DEFAULT ''`);
column('users', 'public', 'INTEGER NOT NULL DEFAULT 0');
column('students', 'level', `TEXT NOT NULL DEFAULT 'A1'`);
column('classes', 'course', `TEXT NOT NULL DEFAULT ''`);
column('classes', 'room_id', 'INTEGER REFERENCES rooms ON DELETE SET NULL');
column('links', 'camera', 'INTEGER NOT NULL DEFAULT 1');
column('sessions', 'created', 'INTEGER NOT NULL DEFAULT 0');
column('sessions', 'seen', 'INTEGER NOT NULL DEFAULT 0');
column('sessions', 'ua', `TEXT NOT NULL DEFAULT ''`);

const cache = new Map();
const stmt = (sql) => { let s = cache.get(sql); if (!s) cache.set(sql, s = db.prepare(sql)); return s; };
export const all = (sql, ...a) => stmt(sql).all(...a);
export const get = (sql, ...a) => stmt(sql).get(...a);
export const run = (sql, ...a) => stmt(sql).run(...a);
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function teacherCode(renew = false) {
  const row = get('SELECT v FROM settings WHERE k = ?', 'teacher_code');
  if (row && !renew) return row.v;
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += abc[randomInt(abc.length)];
  code = code.slice(0, 4) + '-' + code.slice(4);
  run('INSERT OR REPLACE INTO settings VALUES (?, ?)', 'teacher_code', code);
  return code;
}

export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return today(d); };

/** Ismlarni solishtirish uchun: katta-kichik harf, apostrof va boʻshliq farqlanmaydi. */
export const nameKey = (first, last) =>
  [first, last].map((s) => s.toLowerCase().replace(/[ʻʼ'`‘’"\s-]/g, '')).sort().join('|');
