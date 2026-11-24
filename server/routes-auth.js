/* Roʻyxatdan oʻtish, kirish, sessiyalar, shaxsiy sozlamalar va ochiq sahifa. */
import { writeFileSync, rmSync, createReadStream, existsSync } from 'node:fs';
import { randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import path from 'node:path';
import { all, get, run, tx, nameKey, teacherCode, PHOTOS, today } from './db.js';
import * as A from './auth.js';
import { Err, V, bad, deny, missing, on, canSee, SENT } from './core.js';
import { closeUser } from './live.js';
import { notify } from './notify.js';

export const removePhoto = (name) => { if (name) rmSync(path.join(PHOTOS, name), { force: true }); };
const savePhoto = (buf) => { const file = randomUUID() + '.jpg'; writeFileSync(path.join(PHOTOS, file), buf); return file; };

function createUser(role, f) {
  const login = A.newLogin(), password = A.newPassword();
  const { lastInsertRowid } = run('INSERT INTO users (role, login, pass, first, last, phone, telegram, created) VALUES (?,?,?,?,?,?,?,?)',
    role, login, A.hash(password), f.first, f.last, f.phone ?? null, f.telegram ?? null, Date.now());
  return { id: Number(lastInsertRowid), login, password };
}

export const me = (u) => ({
  id: u.id, role: u.role, login: u.login, first: u.first, last: u.last, phone: u.phone, telegram: u.telegram,
  has_photo: u.role === 'student' ? !!get('SELECT photo FROM students WHERE id = ?', u.id)?.photo : !!(u.has_photo ?? u.photo),
  unread: get('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read = 0', u.id).n,
  ...(u.role === 'student' ? { status: get('SELECT status FROM students WHERE id = ?', u.id)?.status } : {}),
  ...(u.role === 'teacher' ? { position: u.position, experience: u.experience, bio: u.bio, public: u.public } : {}),
});

/** Ota-ona soʻroviga mos oʻquvchilar. Oxirgi soʻz baribir oʻqituvchida. */
function candidates(phone, key) {
  const tries = [['parent_phone = ? AND name_key = ?', [phone, key]], ['name_key = ?', [key]], ['parent_phone = ?', [phone]]];
  for (const [where, args] of tries) {
    const r = all(`SELECT id FROM students WHERE ${where}`, ...args);
    if (r.length) return r.slice(0, 5).map((x) => x.id);
  }
  return [];
}
function askTeacher(sid, name, kind) {
  const t = get('SELECT c.teacher_id id FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ?', sid);
  if (t) notify(t.id, `request:${kind}:${name}:${sid}`, 'request', { name, kind }, '#/students');
}
function addLink(parentId, phone, first, last, who) {
  const key = nameKey(first, last);
  const ids = candidates(phone, key);
  if (!ids.length && get('SELECT 1 FROM links WHERE parent_id = ? AND student_id IS NULL AND name_key = ?', parentId, key)) return;
  for (const sid of ids.length ? ids : [null]) {
    const done = run('INSERT OR IGNORE INTO links (parent_id, student_id, child_first, child_last, name_key) VALUES (?,?,?,?,?)', parentId, sid, first, last, key).changes;
    if (sid && done) askTeacher(sid, who, 'parent');
  }
}
/** Ota-ona boladan oldin roʻyxatdan oʻtgan boʻlsa, kutayotgan soʻrovni bogʻlaydi. */
function attachWaiting(sid, parentPhone, key) {
  for (const l of all(`SELECT l.* FROM links l JOIN users u ON u.id = l.parent_id
    WHERE l.student_id IS NULL AND (l.name_key = ? OR u.phone = ?)`, key, parentPhone)) {
    if (get('SELECT 1 FROM links WHERE parent_id = ? AND student_id = ?', l.parent_id, sid)) run('DELETE FROM links WHERE id = ?', l.id);
    else run('UPDATE links SET student_id = ? WHERE id = ?', sid, l.id);
  }
}

on('GET', '/classes', null, () => all(`SELECT c.id, c.name, t.first || ' ' || t.last teacher FROM classes c JOIN users t ON t.id = c.teacher_id ORDER BY c.name`));

const regGate = (c) => {
  if (A.limited('reg:' + c.ip, 150)) throw new Err(429, 'Juda koʻp urinish. Bir soatdan keyin qayta urinib koʻring.');
};
const finish = (c, u) => {
  A.hit('reg:' + c.ip, 3600e3);
  c.setSession(A.createSession(u.id, c.ua));
  return { login: u.login, password: u.password, user: me(get('SELECT * FROM users WHERE id = ?', u.id)) };
};

on('POST', '/register/student', null, (c) => {
  regGate(c);
  const b = c.body;
  const f = { first: V.name(b.first, 'first', 'Ism'), last: V.name(b.last, 'last', 'Familiya') };
  if (b.contact === 'telegram') f.telegram = V.telegram(b.telegram, 'telegram'); else f.phone = V.phone(b.phone, 'phone');
  const address = V.text(b.address, 'address', 'Turar joy', 5, 160);
  const parentPhone = V.phone(b.parent_phone, 'parent_phone');
  const cls = get('SELECT * FROM classes WHERE id = ?', Number(b.class_id) || 0) || bad('Sinfni tanlang.', 'class_id');
  const photo = V.photo(b.photo), descriptor = V.descriptor(b.descriptor);
  if (b.consent !== true) bad('Rasmdan foydalanishga rozilik kerak.', 'consent');
  const key = nameKey(f.first, f.last);
  if (get('SELECT 1 FROM students WHERE class_id = ? AND name_key = ? AND parent_phone = ?', cls.id, key, parentPhone)) {
    bad('Bu oʻquvchi allaqachon roʻyxatdan oʻtgan. Login va parol bilan kiring.', 'first');
  }
  const file = savePhoto(photo);
  let u;
  try {
    u = tx(() => {
      const x = createUser('student', f);
      run('INSERT INTO students (id, class_id, address, parent_phone, name_key, photo, descriptor) VALUES (?,?,?,?,?,?,?)',
        x.id, cls.id, address, parentPhone, key, file, descriptor);
      attachWaiting(x.id, parentPhone, key);
      return x;
    });
  } catch (e) { removePhoto(file); throw e; }
  askTeacher(u.id, `${f.first} ${f.last}`, 'student');
  return finish(c, u);
});

on('POST', '/register/parent', null, (c) => {
  regGate(c);
  const b = c.body;
  const f = { first: V.name(b.first, 'first', 'Ism'), last: V.name(b.last, 'last', 'Familiya'), phone: V.phone(b.phone, 'phone') };
  const cf = V.name(b.child_first, 'child_first', 'Farzand ismi'), cl = V.name(b.child_last, 'child_last', 'Farzand familiyasi');
  if (get(`SELECT 1 FROM users WHERE role = 'parent' AND phone = ?`, f.phone)) bad('Bu raqam bilan ota-ona roʻyxatdan oʻtgan. Login va parol bilan kiring.', 'phone');
  return finish(c, tx(() => { const u = createUser('parent', f); addLink(u.id, f.phone, cf, cl, `${f.first} ${f.last}`); return u; }));
});

on('POST', '/register/teacher', null, (c) => {
  regGate(c);
  const b = c.body;
  if (A.limited('code:' + c.ip, 10)) throw new Err(429, 'Kod koʻp marta xato kiritildi. 15 daqiqadan keyin urinib koʻring.');
  const f = { first: V.name(b.first, 'first', 'Ism'), last: V.name(b.last, 'last', 'Familiya'), phone: V.phone(b.phone, 'phone') };
  const cls = V.className(b.class_name, 'class_name');
  const digest = (s) => createHash('sha256').update(String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')).digest();
  if (!timingSafeEqual(digest(b.code), digest(teacherCode()))) { A.hit('code:' + c.ip, 900e3); bad('Maktab kodi notoʻgʻri.', 'code'); }
  if (get(`SELECT 1 FROM users WHERE role = 'teacher' AND phone = ?`, f.phone)) bad('Bu raqam bilan oʻqituvchi roʻyxatdan oʻtgan.', 'phone');
  return finish(c, tx(() => { const u = createUser('teacher', f); run('INSERT INTO classes (name, teacher_id) VALUES (?, ?)', cls, u.id); return u; }));
});

on('POST', '/login', null, (c) => {
  const id = String(c.body.login ?? '').trim(), pass = String(c.body.password ?? '').trim().toLowerCase();
  const keys = ['login:' + id.toLowerCase(), 'ip:' + c.ip];
  if (A.limited(keys[0], 8) || A.limited(keys[1], 100)) throw new Err(429, 'Juda koʻp xato urinish. 15 daqiqadan keyin qayta kiring.');
  const phone = /^[+\d\s()-]+$/.test(id) ? id.replace(/\D/g, '').slice(-9) : '';
  const found = all('SELECT * FROM users WHERE login = ? COLLATE NOCASE OR phone = ? OR telegram = ?', id, phone, id.replace(/^@/, '').toLowerCase());
  const u = found.find((x) => A.verify(pass, x.pass));
  if (!u) { keys.forEach((k) => A.hit(k, 900e3)); throw new Err(401, 'Login yoki parol notoʻgʻri.'); }
  A.clearHits(keys[0]);
  c.setSession(A.createSession(u.id, c.ua));
  return { user: me(u) };
});
on('POST', '/logout', [], (c) => { A.dropSession(c.user.session); closeUser(c.user.id); c.setSession(''); return {}; });
on('GET', '/me', null, (c) => ({ user: c.user ? me(c.user) : null }));
on('POST', '/me/password', [], (c) => {
  const key = 'pw:' + c.user.id;
  if (A.limited(key, 8)) throw new Err(429, 'Juda koʻp urinish. Keyinroq qayta urinib koʻring.');
  const row = get('SELECT pass FROM users WHERE id = ?', c.user.id);
  if (!A.verify(String(c.body.old ?? '').trim().toLowerCase(), row.pass)) { A.hit(key, 900e3); bad('Hozirgi parol notoʻgʻri.', 'old'); }
  const next = String(c.body.next ?? '').trim().toLowerCase();
  if (next.length < 8 || next.length > 100) bad('Yangi parol kamida 8 belgidan iborat boʻlsin.', 'next');
  run('UPDATE users SET pass = ? WHERE id = ?', A.hash(next), c.user.id);
  A.dropSessions(c.user.id, c.user.session);
  return {};
});
on('GET', '/me/sessions', [], (c) => all('SELECT rowid id, token = ? current, created, seen, ua FROM sessions WHERE user_id = ? AND expires > ? ORDER BY seen DESC', c.user.session, c.user.id, Date.now()));
on('DELETE', '/me/sessions/:id', [], (c) => {
  run('DELETE FROM sessions WHERE rowid = ? AND user_id = ? AND token <> ?', Number(c.p.id), c.user.id, c.user.session);
  closeUser(c.user.id);
  return {};
});
on('PUT', '/me/photo', ['teacher', 'parent', 'admin'], (c) => {
  const file = savePhoto(V.photo(c.body.photo));
  const before = get('SELECT photo FROM users WHERE id = ?', c.user.id).photo;
  run('UPDATE users SET photo = ? WHERE id = ?', file, c.user.id);
  removePhoto(before);
  return {};
});
on('PUT', '/me/profile', ['teacher'], (c) => {
  const b = c.body;
  run('UPDATE users SET position = ?, experience = ?, bio = ?, public = ? WHERE id = ?', V.text(b.position, 'position', 'Lavozim', 0, 80),
    b.experience === '' || b.experience == null ? null : V.int(b.experience, 'experience', 'Tajriba', 0, 60), V.text(b.bio, 'bio', 'Oʻzi haqida', 0, 400), b.public ? 1 : 0, c.user.id);
  return {};
});

/* -- bildirishnomalar -- */
on('GET', '/notifications', [], (c) => all('SELECT id, type, data, link, created, read FROM notifications WHERE user_id = ? ORDER BY created DESC LIMIT 60', c.user.id)
  .map((n) => ({ ...n, data: JSON.parse(n.data) })));
on('POST', '/notifications/read', [], (c) => { run('UPDATE notifications SET read = 1 WHERE user_id = ?', c.user.id); return {}; });

/* -- ota-ona -- */
on('POST', '/children', ['parent'], (c) => {
  const f = V.name(c.body.child_first, 'child_first', 'Farzand ismi'), l = V.name(c.body.child_last, 'child_last', 'Farzand familiyasi');
  if (get('SELECT COUNT(*) n FROM links WHERE parent_id = ?', c.user.id).n >= 10) bad('Juda koʻp soʻrov yuborilgan.', 'child_first');
  tx(() => addLink(c.user.id, c.user.phone, f, l, `${c.user.first} ${c.user.last}`));
  return {};
});

/* -- rasmlar -- */
function sendPhoto(c, name, cache) {
  const file = name && path.join(PHOTOS, name);
  if (!file || !existsSync(file)) missing();
  c.res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
  createReadStream(file).pipe(c.res);
  return SENT;
}
on('GET', '/photo/:id', [], (c) => {
  const id = Number(c.p.id);
  const u = get('SELECT role, photo FROM users WHERE id = ?', id) || missing();
  if (u.role === 'student') {
    if (!canSee(c.user, id)) deny();
    return sendPhoto(c, get('SELECT photo FROM students WHERE id = ?', id)?.photo, 'private, max-age=300');
  }
  const related = id === c.user.id || c.user.role === 'admin' || u.role === 'teacher'
    || (c.user.role === 'teacher' && get('SELECT 1 FROM links l JOIN students s ON s.id = l.student_id JOIN classes k ON k.id = s.class_id WHERE l.parent_id = ? AND k.teacher_id = ?', id, c.user.id));
  if (!related) deny();
  return sendPhoto(c, u.photo, 'private, max-age=300');
});

/* -- ochiq sahifa -- */
export function satisfaction(teacherId) {
  const r = get('SELECT COUNT(*) n, SUM(stars >= 4) good, AVG(stars) avg FROM ratings WHERE teacher_id = ?', teacherId);
  return r.n ? { n: r.n, pct: Math.round(100 * r.good / r.n), avg: r.avg } : null;
}
on('GET', '/public', null, () => {
  const teachers = all(`SELECT id, first, last, position, experience, bio, photo IS NOT NULL has_photo FROM users WHERE role = 'teacher' AND public = 1 ORDER BY experience DESC LIMIT 8`)
    .map((t) => ({ ...t, rating: satisfaction(t.id), students: get(`SELECT COUNT(*) n FROM students s JOIN classes c ON c.id = s.class_id WHERE c.teacher_id = ? AND s.status = 'approved'`, t.id).n }));
  const n = (q) => get(q).n;
  return { teachers, stats: { students: n(`SELECT COUNT(*) n FROM students WHERE status = 'approved'`), lessons: n('SELECT COUNT(*) n FROM lessons'), teachers: n(`SELECT COUNT(*) n FROM users WHERE role = 'teacher'`) } };
});
on('GET', '/public/photo/:id', null, (c) => sendPhoto(c, get(`SELECT photo FROM users WHERE id = ? AND role = 'teacher' AND public = 1`, Number(c.p.id))?.photo, 'public, max-age=600'));
on('POST', '/public/message', null, (c) => {
  if (A.limited('msg:' + c.ip, 5)) throw new Err(429, 'Juda koʻp xabar. Bir soatdan keyin urinib koʻring.');
  const id = run('INSERT INTO messages (name, phone, text, at) VALUES (?,?,?,?)', V.name(c.body.name, 'name', 'Ism'), V.phone(c.body.phone, 'phone'), V.text(c.body.text, 'text', 'Xabar', 5, 1000), Date.now()).lastInsertRowid;
  A.hit('msg:' + c.ip, 3600e3);
  for (const a of all(`SELECT id FROM users WHERE role = 'admin'`)) notify(a.id, 'contact:' + id, 'contact', { name: String(c.body.name).trim() }, '#/notifications');
  return {};
});
export const visitedToday = () => get('SELECT COUNT(*) n FROM visits WHERE date = ?', today()).n;
