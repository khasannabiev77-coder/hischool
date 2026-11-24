/* Admin paneli. Sinf ichidagi ishlar (jurnal, vazifa, test, jadval) routes-school.js da umumiy. */
import { all, get, run, today, daysAgo, teacherCode } from './db.js';
import { V, bad, missing, on } from './core.js';
import { closeUser, isStreaming, viewersOf, recheckLessons, pushClass } from './live.js';
import { notify, familyOf } from './notify.js';
import { removePhoto, satisfaction, visitedToday } from './routes-auth.js';
import { deleteStudent } from './routes-school.js';

const ADM = ['admin'];
const n = (sql, ...a) => get(sql, ...a).n;
const lastMonths = (k) => Array.from({ length: k }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (k - 1 - i)); return today(d).slice(0, 7); });

on('GET', '/a/overview', ADM, () => {
  const months = lastMonths(6), days = Array.from({ length: 14 }, (_, i) => daysAgo(13 - i));
  const created = all(`SELECT u.created FROM users u JOIN students s ON s.id = u.id WHERE s.status = 'approved'`).map((r) => today(new Date(r.created)).slice(0, 7));
  const byKey = (rows, k = 'k') => new Map(rows.map((r) => [r[k], r]));
  const att = byKey(all(`SELECT date k, COUNT(*) n, SUM(status <> 'absent') here FROM attendance WHERE date >= ? GROUP BY date`, days[0]));
  const gr = byKey(all('SELECT substr(date, 1, 7) k, AVG(value) a FROM grades WHERE value IS NOT NULL GROUP BY k'));
  const vis = byKey(all('SELECT date k, COUNT(*) n FROM visits WHERE date >= ? GROUP BY date', days[0]));
  const t = att.get(today());
  return {
    totals: {
      students: n('SELECT COUNT(*) n FROM students'), active: n(`SELECT COUNT(*) n FROM students WHERE status = 'approved'`),
      teachers: n(`SELECT COUNT(*) n FROM users WHERE role = 'teacher'`), parents: n(`SELECT COUNT(*) n FROM users WHERE role = 'parent'`),
      classes: n('SELECT COUNT(*) n FROM classes'), attendance: t ? Math.round(100 * t.here / t.n) : null,
      live: all('SELECT id FROM lessons WHERE ended IS NULL').filter((l) => isStreaming(l.id)).length, rooms: n('SELECT COUNT(*) n FROM rooms'), visits: visitedToday(),
      messages: n('SELECT COUNT(*) n FROM messages'), reports: n('SELECT COUNT(*) n FROM camera_reports WHERE resolved = 0'),
    },
    growth: months.map((m) => ({ label: m, value: created.filter((x) => x <= m).length })),
    attendance: days.map((d) => ({ label: d, value: att.has(d) ? Math.round(100 * att.get(d).here / att.get(d).n) : null })),
    grades: months.map((m) => ({ label: m, value: gr.has(m) ? Math.round(gr.get(m).a * 10) / 10 : null })),
    users: days.map((d) => ({ label: d, value: vis.get(d)?.n || 0 })),
  };
});

/* -- odamlar -- */
on('GET', '/a/students', ADM, () => all(`SELECT u.id, u.first, u.last, u.login, u.phone, u.telegram, s.parent_phone, s.level, s.status, s.class_id, c.name class_name, s.photo IS NOT NULL has_photo
  FROM students s JOIN users u ON u.id = s.id JOIN classes c ON c.id = s.class_id ORDER BY s.status = 'approved', u.last, u.first`));
on('GET', '/a/parents', ADM, () => all(`SELECT id, first, last, login, phone, photo IS NOT NULL has_photo FROM users WHERE role = 'parent' ORDER BY last, first`)
  .map((p) => ({ ...p, links: all(`SELECT l.id, l.status, l.camera, l.child_first, l.child_last, l.student_id, u.first, u.last, c.name class_name FROM links l
    LEFT JOIN students s ON s.id = l.student_id LEFT JOIN users u ON u.id = s.id LEFT JOIN classes c ON c.id = s.class_id WHERE l.parent_id = ?`, p.id) })));
on('GET', '/a/teachers', ADM, () => all(`SELECT id, first, last, login, phone, position, experience, bio, public, photo IS NOT NULL has_photo FROM users WHERE role = 'teacher' ORDER BY last, first`)
  .map((t) => ({ ...t, rating: satisfaction(t.id), classes: all('SELECT name FROM classes WHERE teacher_id = ? ORDER BY name', t.id).map((x) => x.name),
    students: n(`SELECT COUNT(*) n FROM students s JOIN classes c ON c.id = s.class_id WHERE c.teacher_id = ? AND s.status = 'approved'`, t.id) })));
on('PATCH', '/a/users/:id', ADM, (c) => {
  const u = get('SELECT * FROM users WHERE id = ?', Number(c.p.id)) || missing(), b = c.body;
  run('UPDATE users SET first = ?, last = ?, phone = ?, position = ?, experience = ? WHERE id = ?', V.name(b.first ?? u.first, 'first', 'Ism'), V.name(b.last ?? u.last, 'last', 'Familiya'),
    b.phone === undefined ? u.phone : b.phone === '' && u.role === 'student' ? null : V.phone(b.phone, 'phone'), V.text(b.position ?? u.position, 'position', 'Lavozim', 0, 80),
    b.experience === undefined ? u.experience : b.experience === '' ? null : V.int(b.experience, 'experience', 'Tajriba', 0, 60), u.id);
  return {};
});
on('DELETE', '/a/users/:id', ADM, (c) => {
  const u = get('SELECT * FROM users WHERE id = ?', Number(c.p.id)) || missing();
  if (u.role === 'admin') bad('Admin hisobini oʻchirib boʻlmaydi.');
  if (u.role === 'student') { deleteStudent(u.id); return {}; }
  if (u.role === 'teacher' && get('SELECT 1 FROM classes WHERE teacher_id = ?', u.id)) bad('Oʻqituvchining sinflari bor. Avval ularni boshqa oʻqituvchiga bering.');
  run('DELETE FROM users WHERE id = ?', u.id);
  removePhoto(u.photo);
  closeUser(u.id);
  return {};
});
on('POST', '/a/code', ADM, () => ({ code: teacherCode(true) }));

/* -- xonalar va kameralar -- */
on('GET', '/a/rooms', ADM, () => all('SELECT * FROM rooms ORDER BY name').map((r) => ({ ...r, classes: all('SELECT name FROM classes WHERE room_id = ? ORDER BY name', r.id).map((x) => x.name) })));
on('POST', '/a/rooms', ADM, (c) => {
  const name = V.text(c.body.name, 'name', 'Xona nomi', 1, 40);
  if (get('SELECT 1 FROM rooms WHERE name = ?', name)) bad('Bu xona allaqachon bor.', 'name');
  return { id: Number(run('INSERT INTO rooms (name) VALUES (?)', name).lastInsertRowid) };
});
on('DELETE', '/a/rooms/:id', ADM, (c) => { run('DELETE FROM rooms WHERE id = ?', Number(c.p.id)); recheckLessons(); return {}; });
on('PUT', '/a/rooms/:id/camera', ADM, (c) => {
  run('UPDATE rooms SET camera_on = ? WHERE id = ?', c.body.on ? 1 : 0, Number(c.p.id));
  recheckLessons();
  for (const k of all('SELECT id FROM classes WHERE room_id = ?', Number(c.p.id))) pushClass(k.id, { t: 'lesson' });
  return {};
});
on('GET', '/a/cameras', ADM, () => ({
  rooms: all('SELECT * FROM rooms ORDER BY name').map((r) => ({ ...r, classes: all('SELECT id, name FROM classes WHERE room_id = ?', r.id) })),
  live: all(`SELECT l.id, l.topic, l.started, c.id class_id, c.name class_name, r.name room, t.first || ' ' || t.last teacher FROM lessons l JOIN classes c ON c.id = l.class_id
    JOIN users t ON t.id = c.teacher_id LEFT JOIN rooms r ON r.id = c.room_id WHERE l.ended IS NULL ORDER BY l.id DESC`).map((l) => ({ ...l, streaming: isStreaming(l.id), viewers: viewersOf(l.class_id) })),
  reports: all(`SELECT p.id, p.text, p.at, p.resolved, u.first || ' ' || u.last name, u.phone, c.name class_name FROM camera_reports p JOIN users u ON u.id = p.user_id JOIN classes c ON c.id = p.class_id ORDER BY p.resolved, p.id DESC LIMIT 30`),
  views: all(`SELECT v.at, u.first || ' ' || u.last name, c.name class_name, l.topic FROM camera_views v JOIN users u ON u.id = v.user_id JOIN lessons l ON l.id = v.lesson_id JOIN classes c ON c.id = l.class_id ORDER BY v.id DESC LIMIT 40`),
}));
on('POST', '/a/reports/:id/resolve', ADM, (c) => { run('UPDATE camera_reports SET resolved = 1 WHERE id = ?', Number(c.p.id)); return {}; });

/* -- xabarlar -- */
on('GET', '/a/messages', ADM, () => all('SELECT * FROM messages ORDER BY id DESC LIMIT 100'));
on('DELETE', '/a/messages/:id', ADM, (c) => { run('DELETE FROM messages WHERE id = ?', Number(c.p.id)); return {}; });
on('POST', '/a/notify', ADM, (c) => {
  const title = V.text(c.body.title, 'title', 'Sarlavha', 2, 100), text = V.text(c.body.text, 'text', 'Matn', 2, 600), to = String(c.body.to ?? '');
  let ids;
  if (to === 'all') ids = all(`SELECT id FROM users WHERE role <> 'admin'`).map((x) => x.id);
  else if (['parent', 'student', 'teacher'].includes(to)) ids = all('SELECT id FROM users WHERE role = ?', to).map((x) => x.id);
  else if (/^class:\d+$/.test(to)) {
    const kids = all(`SELECT id FROM students WHERE class_id = ? AND status = 'approved'`, Number(to.slice(6))).map((x) => x.id);
    ids = [...new Set(kids.flatMap((k) => [k, ...familyOf(k)]))];
  } else bad('Kimga yuborilishini tanlang.', 'to');
  const key = 'msg:' + Date.now();
  ids.forEach((id) => notify(id, key, 'message', { title, text }, '#/notifications'));
  return { sent: ids.length };
});
