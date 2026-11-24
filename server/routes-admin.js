/* Admin paneli. Sinf ichidagi ishlar (jurnal, vazifa, test, jadval) routes-school.js da umumiy. */
import { all, get, run, insert, today, daysAgo, lastMonths, teacherCode } from './db.js';
import { V, bad, missing, on } from './core.js';
import { openWhere, streaming, viewers } from './live.js';
import { notifyMany } from './notify.js';
import { removePhoto } from './files.js';
import { RATING, withRating } from './routes-auth.js';
import { deleteStudent } from './routes-school.js';

const ADM = ['admin'];
const group = (rows, key) => { const m = new Map(); for (const r of rows) m.set(r[key], [...(m.get(r[key]) || []), r]); return m; };

on('GET', '/a/overview', ADM, async () => {
  const months = lastMonths(6), days = Array.from({ length: 14 }, (_, i) => daysAgo(13 - i));
  const [t, lessons, created, att, gr, vis] = await Promise.all([
    get(`SELECT (SELECT COUNT(*) FROM students) students, (SELECT COUNT(*) FROM students WHERE status = 'approved') active, (SELECT COUNT(*) FROM users WHERE role = 'teacher') teachers,
      (SELECT COUNT(*) FROM users WHERE role = 'parent') parents, (SELECT COUNT(*) FROM classes) classes, (SELECT COUNT(*) FROM rooms) rooms, (SELECT COUNT(*) FROM messages) messages,
      (SELECT COUNT(*) FROM camera_reports WHERE resolved = 0) reports`),
    all('SELECT * FROM lessons WHERE ended IS NULL AND started > ?', openWhere()),
    all(`SELECT u.created FROM users u JOIN students s ON s.id = u.id WHERE s.status = 'approved'`),
    all(`SELECT date k, COUNT(*) n, COUNT(*) FILTER (WHERE status <> 'absent') here FROM attendance WHERE date >= ? GROUP BY date`, days[0]),
    all('SELECT substr(date, 1, 7) k, AVG(value) a FROM grades WHERE value IS NOT NULL AND date >= ? GROUP BY 1', months[0]),
    all('SELECT date k, COUNT(*) n FROM visits WHERE date >= ? GROUP BY date', days[0]),
  ]);
  const key = (rows) => new Map(rows.map((r) => [r.k, r])), A = key(att), G = key(gr), N = key(vis), now = A.get(today());
  const since = created.map((r) => today(new Date(r.created)).slice(0, 7));
  return {
    totals: { ...t, attendance: now ? Math.round((100 * now.here) / now.n) : null, live: lessons.filter(streaming).length, visits: N.get(today())?.n || 0 },
    growth: months.map((m) => ({ label: m, value: since.filter((x) => x <= m).length })),
    attendance: days.map((d) => ({ label: d, value: A.has(d) ? Math.round((100 * A.get(d).here) / A.get(d).n) : null })),
    grades: months.map((m) => ({ label: m, value: G.has(m) ? Math.round(G.get(m).a * 10) / 10 : null })),
    users: days.map((d) => ({ label: d, value: N.get(d)?.n || 0 })),
  };
});

/* -- odamlar -- */
on('GET', '/a/students', ADM, () => all(`SELECT u.id, u.first, u.last, u.login, u.phone, u.telegram, s.parent_phone, s.level, s.status, s.class_id, c.name class_name, s.photo IS NOT NULL has_photo
  FROM students s JOIN users u ON u.id = s.id JOIN classes c ON c.id = s.class_id ORDER BY s.status = 'approved', u.last, u.first`));
on('GET', '/a/parents', ADM, async () => {
  const [parents, links] = await Promise.all([
    all(`SELECT id, first, last, login, phone, photo IS NOT NULL has_photo FROM users WHERE role = 'parent' ORDER BY last, first`),
    all(`SELECT l.parent_id, l.id, l.status, l.camera, l.child_first, l.child_last, l.student_id, u.first, u.last, c.name class_name FROM links l
      LEFT JOIN students s ON s.id = l.student_id LEFT JOIN users u ON u.id = s.id LEFT JOIN classes c ON c.id = s.class_id ORDER BY l.id`),
  ]);
  const by = group(links, 'parent_id');
  return parents.map((p) => ({ ...p, links: by.get(p.id) || [] }));
});
on('GET', '/a/teachers', ADM, async () => {
  const [list, classes] = await Promise.all([
    all(`SELECT t.id, t.first, t.last, t.login, t.phone, t.position, t.experience, t.bio, t.public, t.photo IS NOT NULL has_photo, ${RATING} FROM users t WHERE t.role = 'teacher' ORDER BY t.last, t.first`),
    all('SELECT teacher_id, name FROM classes ORDER BY name'),
  ]);
  const by = group(classes, 'teacher_id');
  return list.map((t) => ({ ...withRating(t), classes: (by.get(t.id) || []).map((x) => x.name) }));
});
on('PATCH', '/a/users/:id', ADM, async (c) => {
  const u = (await get('SELECT * FROM users WHERE id = ?', Number(c.p.id))) || missing(), b = c.body;
  await run('UPDATE users SET first = ?, last = ?, phone = ?, position = ?, experience = ? WHERE id = ?', V.name(b.first ?? u.first, 'first', 'Ism'), V.name(b.last ?? u.last, 'last', 'Familiya'),
    b.phone === undefined ? u.phone : b.phone === '' && u.role === 'student' ? null : V.phone(b.phone, 'phone'), V.text(b.position ?? u.position, 'position', 'Lavozim', 0, 80),
    b.experience === undefined ? u.experience : b.experience === '' ? null : V.int(b.experience, 'experience', 'Tajriba', 0, 60), u.id);
  return {};
});
on('DELETE', '/a/users/:id', ADM, async (c) => {
  const u = (await get('SELECT * FROM users WHERE id = ?', Number(c.p.id))) || missing();
  if (u.role === 'admin') bad('Admin hisobini oʻchirib boʻlmaydi.');
  if (u.role === 'student') { await deleteStudent(u.id); return {}; }
  if (u.role === 'teacher' && await get('SELECT 1 FROM classes WHERE teacher_id = ?', u.id)) bad('Oʻqituvchining sinflari bor. Avval ularni boshqa oʻqituvchiga bering.');
  await run('DELETE FROM users WHERE id = ?', u.id);
  await removePhoto(u.photo);
  return {};
});
on('POST', '/a/code', ADM, async () => ({ code: await teacherCode(true) }));

/* -- xonalar va kameralar -- */
async function roomList() {
  const [rooms, classes] = await Promise.all([all('SELECT * FROM rooms ORDER BY name'), all('SELECT id, name, room_id FROM classes WHERE room_id IS NOT NULL ORDER BY name')]);
  const by = group(classes, 'room_id');
  return rooms.map((r) => ({ ...r, classes: (by.get(r.id) || []).map(({ id, name }) => ({ id, name })) }));
}
on('GET', '/a/rooms', ADM, async () => (await roomList()).map((r) => ({ ...r, classes: r.classes.map((c) => c.name) })));
on('POST', '/a/rooms', ADM, async (c) => {
  const name = V.text(c.body.name, 'name', 'Xona nomi', 1, 40);
  if (await get('SELECT 1 FROM rooms WHERE name = ?', name)) bad('Bu xona allaqachon bor.', 'name');
  return { id: await insert('INSERT INTO rooms (name) VALUES (?)', name) };
});
on('DELETE', '/a/rooms/:id', ADM, async (c) => { await run('DELETE FROM rooms WHERE id = ?', Number(c.p.id)); return {}; });
on('PUT', '/a/rooms/:id/camera', ADM, async (c) => { await run('UPDATE rooms SET camera_on = ? WHERE id = ?', c.body.on ? 1 : 0, Number(c.p.id)); return {}; });
on('GET', '/a/cameras', ADM, async () => {
  const [rooms, live, seen, reports, views] = await Promise.all([
    roomList(),
    all(`SELECT l.id, l.topic, l.started, l.ended, l.beat, c.id class_id, c.name class_name, r.name room, t.first || ' ' || t.last teacher FROM lessons l JOIN classes c ON c.id = l.class_id
      JOIN users t ON t.id = c.teacher_id LEFT JOIN rooms r ON r.id = c.room_id WHERE l.ended IS NULL AND l.started > ? ORDER BY l.id DESC`, openWhere()),
    viewers(),
    all(`SELECT p.id, p.text, p.at, p.resolved, u.first || ' ' || u.last AS name, u.phone, c.name class_name FROM camera_reports p JOIN users u ON u.id = p.user_id JOIN classes c ON c.id = p.class_id ORDER BY p.resolved, p.id DESC LIMIT 30`),
    all(`SELECT v.at, u.first || ' ' || u.last AS name, c.name class_name, l.topic FROM camera_views v JOIN users u ON u.id = v.user_id JOIN lessons l ON l.id = v.lesson_id JOIN classes c ON c.id = l.class_id ORDER BY v.id DESC LIMIT 40`),
  ]);
  return { rooms, live: live.map((l) => ({ ...l, streaming: streaming(l), viewers: seen.get(l.id) || 0 })), reports, views };
});
on('POST', '/a/reports/:id/resolve', ADM, async (c) => { await run('UPDATE camera_reports SET resolved = 1 WHERE id = ?', Number(c.p.id)); return {}; });

/* -- xabarlar -- */
on('GET', '/a/messages', ADM, () => all('SELECT * FROM messages ORDER BY id DESC LIMIT 100'));
on('DELETE', '/a/messages/:id', ADM, async (c) => { await run('DELETE FROM messages WHERE id = ?', Number(c.p.id)); return {}; });
on('POST', '/a/notify', ADM, async (c) => {
  const title = V.text(c.body.title, 'title', 'Sarlavha', 2, 100), text = V.text(c.body.text, 'text', 'Matn', 2, 600), to = String(c.body.to ?? '');
  let rows;
  if (to === 'all') rows = await all(`SELECT id FROM users WHERE role <> 'admin'`);
  else if (['parent', 'student', 'teacher'].includes(to)) rows = await all('SELECT id FROM users WHERE role = ?', to);
  else if (/^class:\d+$/.test(to)) {
    rows = await all(`SELECT id FROM students WHERE class_id = ?1 AND status = 'approved' UNION SELECT l.parent_id FROM links l JOIN students s ON s.id = l.student_id
      WHERE s.class_id = ?1 AND s.status = 'approved' AND l.status = 'approved'`, Number(to.slice(6)));
  } else bad('Kimga yuborilishini tanlang.', 'to');
  const key = 'msg:' + Date.now();
  await notifyMany(rows.map((r) => ({ user_id: r.id, key, type: 'message', data: { title, text }, link: '#/notifications' })));
  return { sent: rows.length };
});
