/* Roʻyxatdan oʻtish, kirish, sessiyalar, shaxsiy sozlamalar va ochiq sahifa. */
import { all, get, run, insert, tx, nameKey, today } from './db.js';
import * as A from './auth.js';
import { Err, V, bad, deny, missing, on, canSee } from './core.js';
import { savePhoto, readPhoto, removePhoto } from './files.js';
import { notifyMany, poll } from './notify.js';

async function createUser(role, f) {
  const login = await A.newLogin(), password = A.newPassword();
  const id = await insert('INSERT INTO users (status, role, login, pass, first, last, phone, telegram, created) VALUES (?,?,?,?,?,?,?,?,?)',
    'pending', role, login, A.hash(password), f.first, f.last, f.phone ?? null, f.telegram ?? null, Date.now());
  return { id, login, password };
}

export async function me(u) {
  const [unread, s] = await Promise.all([
    get('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read = 0', u.id),
    u.role === 'student' ? get('SELECT photo IS NOT NULL has_photo FROM students WHERE id = ?', u.id) : null,
  ]);
  return {
    id: u.id, role: u.role, login: u.login, first: u.first, last: u.last, phone: u.phone, telegram: u.telegram, unread: unread.n,
    has_photo: s ? s.has_photo : !!(u.has_photo ?? u.photo), status: u.status,
    ...(u.role === 'teacher' ? { position: u.position, experience: u.experience, bio: u.bio, public: u.public } : {}),
  };
}

/** Ota-onaning soʻroviga mos oʻquvchilar. Oxirgi soʻz baribir oʻqituvchida. */
async function candidates(phone, key) {
  const r = await all('SELECT id, parent_phone = ?1 phone_ok, name_key = ?2 name_ok FROM students WHERE parent_phone = ?1 OR name_key = ?2', phone, key);
  for (const test of [(x) => x.phone_ok && x.name_ok, (x) => x.name_ok, (x) => x.phone_ok]) {
    const hit = r.filter(test);
    if (hit.length) return hit.slice(0, 5).map((x) => x.id);
  }
  return [];
}
/** Yangi soʻrov haqida barcha administratorlarga xabar. */
async function askAdmin(id, name, kind) {
  await notifyMany((await all(`SELECT id FROM users WHERE role = 'admin'`)).map((a) => ({ user_id: a.id, key: `request:${kind}:${id}`, type: 'request', data: { name, kind }, link: '#/requests' })));
}
async function addLink(parentId, phone, first, last) {
  const key = nameKey(first, last), ids = await candidates(phone, key);
  if (!ids.length && await get('SELECT 1 FROM links WHERE parent_id = ? AND student_id IS NULL AND name_key = ?', parentId, key)) return;
  for (const sid of ids.length ? ids : [null]) {
    await run('INSERT INTO links (parent_id, student_id, child_first, child_last, name_key) VALUES (?,?,?,?,?) ON CONFLICT (parent_id, student_id) DO NOTHING', parentId, sid, first, last, key);
  }
}
/** Ota-ona boladan oldin roʻyxatdan oʻtgan boʻlsa, kutayotgan soʻrovni bogʻlaydi. */
async function attachWaiting(sid, parentPhone, key) {
  for (const l of await all(`SELECT l.* FROM links l JOIN users u ON u.id = l.parent_id WHERE l.student_id IS NULL AND (l.name_key = ? OR u.phone = ?)`, key, parentPhone)) {
    if (await get('SELECT 1 FROM links WHERE parent_id = ? AND student_id = ?', l.parent_id, sid)) await run('DELETE FROM links WHERE id = ?', l.id);
    else await run('UPDATE links SET student_id = ? WHERE id = ?', sid, l.id);
  }
}


async function regGate(c) {
  if (await A.limited('reg:' + c.ip, 150)) throw new Err(429, 'Juda koʻp urinish. Bir soatdan keyin qayta urinib koʻring.');
}
async function finish(c, u) {
  await A.hit('reg:' + c.ip, 3600e3);
  c.setSession(await A.createSession(u.id, c.ua));
  return { login: u.login, password: u.password, user: await me(await get('SELECT * FROM users WHERE id = ?', u.id)) };
}

on('POST', '/register/student', null, async (c) => {
  await regGate(c);
  const b = c.body;
  const f = { first: V.name(b.first, 'first', 'Ism'), last: V.name(b.last, 'last', 'Familiya') };
  if (b.contact === 'telegram') f.telegram = V.telegram(b.telegram, 'telegram'); else f.phone = V.phone(b.phone, 'phone');
  const address = V.text(b.address, 'address', 'Turar joy', 5, 160);
  const parentPhone = V.phone(b.parent_phone, 'parent_phone');
  const photo = V.photo(b.photo), descriptor = V.descriptor(b.descriptor);
  if (b.consent !== true) bad('Rasmdan foydalanishga rozilik kerak.', 'consent');
  const key = nameKey(f.first, f.last);
  if (await get('SELECT 1 FROM students WHERE name_key = ? AND parent_phone = ?', key, parentPhone)) {
    bad('Bu oʻquvchi allaqachon roʻyxatdan oʻtgan. Login va parol bilan kiring.', 'first');
  }
  const file = await savePhoto(photo);
  let u;
  try {
    u = await tx(async () => {
      const x = await createUser('student', f);
      await run('INSERT INTO students (id, address, parent_phone, name_key, photo, descriptor) VALUES (?,?,?,?,?,?)', x.id, address, parentPhone, key, file, descriptor);
      await attachWaiting(x.id, parentPhone, key);
      return x;
    });
  } catch (e) { await removePhoto(file); throw e; }
  await askAdmin(u.id, `${f.first} ${f.last}`, 'student');
  return finish(c, u);
});

on('POST', '/register/parent', null, async (c) => {
  await regGate(c);
  const b = c.body;
  const f = { first: V.name(b.first, 'first', 'Ism'), last: V.name(b.last, 'last', 'Familiya'), phone: V.phone(b.phone, 'phone') };
  const cf = V.name(b.child_first, 'child_first', 'Farzand ismi'), cl = V.name(b.child_last, 'child_last', 'Farzand familiyasi');
  if (await get(`SELECT 1 FROM users WHERE role = 'parent' AND phone = ?`, f.phone)) bad('Bu raqam bilan ota-ona roʻyxatdan oʻtgan. Login va parol bilan kiring.', 'phone');
  const u = await tx(async () => { const x = await createUser('parent', f); await addLink(x.id, f.phone, cf, cl); return x; });
  await askAdmin(u.id, `${f.first} ${f.last}`, 'parent');
  return finish(c, u);
});

on('POST', '/register/teacher', null, async (c) => {
  await regGate(c);
  const b = c.body;
  const f = { first: V.name(b.first, 'first', 'Ism'), last: V.name(b.last, 'last', 'Familiya'), phone: V.phone(b.phone, 'phone') };
  if (await get(`SELECT 1 FROM users WHERE role = 'teacher' AND phone = ?`, f.phone)) bad('Bu raqam bilan oʻqituvchi roʻyxatdan oʻtgan.', 'phone');
  const u = await createUser('teacher', f);
  await askAdmin(u.id, `${f.first} ${f.last}`, 'teacher');
  return finish(c, u);
});

on('POST', '/login', null, async (c) => {
  const id = String(c.body.login ?? '').trim(), pass = String(c.body.password ?? '').trim().toLowerCase();
  const keys = ['login:' + id.toLowerCase().slice(0, 80), 'ip:' + c.ip];
  if ((await A.limited(keys[0], 8)) || (await A.limited(keys[1], 100))) throw new Err(429, 'Juda koʻp xato urinish. 15 daqiqadan keyin qayta kiring.');
  const phone = /^[+\d\s()-]+$/.test(id) ? id.replace(/\D/g, '').slice(-9) : '';
  const found = await all('SELECT * FROM users WHERE lower(login) = ? OR phone = ? OR telegram = ?', id.toLowerCase(), phone, id.replace(/^@/, '').toLowerCase());
  const u = found.find((x) => A.verify(pass, x.pass));
  if (!u) { for (const k of keys) await A.hit(k, 900e3); throw new Err(401, 'Login yoki parol notoʻgʻri.'); }
  await A.clearHits(keys[0]);
  c.setSession(await A.createSession(u.id, c.ua));
  return { user: await me(u) };
});
on('POST', '/logout', [], async (c) => { await A.dropSession(c.user.session); c.setSession(''); return {}; });
/* Brauzer qanchalik tez-tez soʻrashi: serverless muhitda har soʻrov pullik, shuning uchun siyrakroq. */
on('GET', '/me', null, async (c) => ({ user: c.user ? await me(c.user) : null, pace: c.serverless ? { poll: 45000, frame: 1200, beat: 6000, idle: 12000 } : { poll: 4000, frame: 300, beat: 3000, idle: 3000 } }));
on('GET', '/poll', [], (c) => poll(c.user, Number(c.q.get('since')) || 0));
on('POST', '/me/password', [], async (c) => {
  const key = 'pw:' + c.user.id;
  if (await A.limited(key, 8)) throw new Err(429, 'Juda koʻp urinish. Keyinroq qayta urinib koʻring.');
  const row = await get('SELECT pass FROM users WHERE id = ?', c.user.id);
  if (!A.verify(String(c.body.old ?? '').trim().toLowerCase(), row.pass)) { await A.hit(key, 900e3); bad('Hozirgi parol notoʻgʻri.', 'old'); }
  const next = String(c.body.next ?? '').trim().toLowerCase();
  if (next.length < 8 || next.length > 100) bad('Yangi parol kamida 8 belgidan iborat boʻlsin.', 'next');
  await run('UPDATE users SET pass = ? WHERE id = ?', A.hash(next), c.user.id);
  await A.dropSessions(c.user.id, c.user.session);
  return {};
});
on('GET', '/me/sessions', [], (c) => all('SELECT id, token = ? AS current, created, seen, ua FROM sessions WHERE user_id = ? AND expires > ? ORDER BY seen DESC', c.user.session, c.user.id, Date.now()));
on('DELETE', '/me/sessions/:id', [], async (c) => { await run('DELETE FROM sessions WHERE id = ? AND user_id = ? AND token <> ?', Number(c.p.id), c.user.id, c.user.session); return {}; });
on('PUT', '/me/photo', ['teacher', 'parent', 'admin'], async (c) => {
  const file = await savePhoto(V.photo(c.body.photo));
  const before = (await get('SELECT photo FROM users WHERE id = ?', c.user.id)).photo;
  await run('UPDATE users SET photo = ? WHERE id = ?', file, c.user.id);
  await removePhoto(before);
  return {};
});
on('PUT', '/me/profile', ['teacher'], async (c) => {
  const b = c.body;
  await run('UPDATE users SET position = ?, experience = ?, bio = ?, public = ? WHERE id = ?', V.text(b.position, 'position', 'Lavozim', 0, 80),
    b.experience === '' || b.experience == null ? null : V.int(b.experience, 'experience', 'Tajriba', 0, 60), V.text(b.bio, 'bio', 'Oʻzi haqida', 0, 400), b.public ? 1 : 0, c.user.id);
  return {};
});

/* -- bildirishnomalar -- */
on('GET', '/notifications', [], async (c) => {
  await run('DELETE FROM notifications WHERE user_id = ?1 AND id NOT IN (SELECT id FROM notifications WHERE user_id = ?1 ORDER BY created DESC LIMIT 100)', c.user.id);
  return (await all('SELECT id, type, data, link, created, read FROM notifications WHERE user_id = ? ORDER BY created DESC LIMIT 60', c.user.id)).map((n) => ({ ...n, data: JSON.parse(n.data) }));
});
on('POST', '/notifications/read', [], async (c) => { await run('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0', c.user.id); return {}; });

/* -- ota-ona -- */
on('POST', '/children', ['parent'], async (c) => {
  const f = V.name(c.body.child_first, 'child_first', 'Farzand ismi'), l = V.name(c.body.child_last, 'child_last', 'Farzand familiyasi');
  if ((await get('SELECT COUNT(*) n FROM links WHERE parent_id = ?', c.user.id)).n >= 10) bad('Juda koʻp soʻrov yuborilgan.', 'child_first');
  await tx(() => addLink(c.user.id, c.user.phone, f, l));
  await askAdmin(`${c.user.id}:${nameKey(f, l)}`, `${c.user.first} ${c.user.last}`, 'parent');
  return {};
});

/* -- rasmlar -- */
async function sendPhoto(name, cache) {
  const data = (await readPhoto(name)) || missing();
  return new Response(data, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' } });
}
on('GET', '/photo/:id', [], async (c) => {
  const id = Number(c.p.id);
  const u = (await get('SELECT u.role, COALESCE(s.photo, u.photo) photo FROM users u LEFT JOIN students s ON s.id = u.id WHERE u.id = ?', id)) || missing();
  const ok = u.role === 'student' ? await canSee(c.user, id)
    : id === c.user.id || c.user.role === 'admin' || u.role === 'teacher'
      || (c.user.role === 'teacher' && await get('SELECT 1 FROM links l JOIN students s ON s.id = l.student_id JOIN classes k ON k.id = s.class_id WHERE l.parent_id = ? AND k.teacher_id = ?', id, c.user.id));
  if (!ok) deny();
  return sendPhoto(u.photo, 'private, max-age=300');
});

/* -- ochiq sahifa -- */
export const RATING = `(SELECT COUNT(*) FROM ratings r WHERE r.teacher_id = t.id) rate_n, (SELECT COUNT(*) FROM ratings r WHERE r.teacher_id = t.id AND r.stars >= 4) rate_good,
  (SELECT COUNT(*) FROM students s JOIN classes k ON k.id = s.class_id WHERE k.teacher_id = t.id AND s.status = 'approved') students`;
export const withRating = ({ rate_n: n, rate_good: good, ...t }) => ({ ...t, rating: n ? { n, pct: Math.round((100 * good) / n) } : null });
on('GET', '/public', null, async () => {
  const [teachers, stats] = await Promise.all([
    all(`SELECT t.id, t.first, t.last, t.position, t.experience, t.bio, t.photo IS NOT NULL has_photo, ${RATING} FROM users t WHERE t.role = 'teacher' AND t.public = 1 AND t.status = 'approved' ORDER BY t.experience DESC NULLS LAST LIMIT 8`),
    get(`SELECT (SELECT COUNT(*) FROM students WHERE status = 'approved') students, (SELECT COUNT(*) FROM lessons) lessons, (SELECT COUNT(*) FROM users WHERE role = 'teacher' AND status = 'approved') teachers`),
  ]);
  return { teachers: teachers.map(withRating), stats };
});
on('GET', '/public/photo/:id', null, async (c) => sendPhoto((await get(`SELECT photo FROM users WHERE id = ? AND role = 'teacher' AND public = 1`, Number(c.p.id)))?.photo, 'public, max-age=600'));
on('POST', '/public/message', null, async (c) => {
  if (await A.limited('msg:' + c.ip, 5)) throw new Err(429, 'Juda koʻp xabar. Bir soatdan keyin urinib koʻring.');
  const name = V.name(c.body.name, 'name', 'Ism');
  const id = await insert('INSERT INTO messages (name, phone, text, at) VALUES (?,?,?,?)', name, V.phone(c.body.phone, 'phone'), V.text(c.body.text, 'text', 'Xabar', 5, 1000), Date.now());
  await A.hit('msg:' + c.ip, 3600e3);
  await notifyMany((await all(`SELECT id FROM users WHERE role = 'admin'`)).map((a) => ({ user_id: a.id, key: 'contact:' + id, type: 'contact', data: { name }, link: '#/notifications' })));
  return {};
});
export const visitedToday = async () => (await get('SELECT COUNT(*) n FROM visits WHERE date = ?', today())).n;
