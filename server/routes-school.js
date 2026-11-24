/* Taʼlim jarayoni: hisobot (ota-ona, oʻquvchi) va oʻqituvchi/admin uchun sinf ishlari. */
import { all, get, run, tx, today, daysAgo, teacherCode } from './db.js';
import * as A from './auth.js';
import { V, bad, deny, missing, on, canSee, ownClass, ownStudent, ownHomework, ownAssessment, ownSchedule, ownLesson, ownLink, LEVELS, SKILLS } from './core.js';
import { openLesson, isStreaming, viewersOf, closeUser, pushClass, pushStudent, setArriveHandler } from './live.js';
import { notify, notifyFamily, notifyClassFamilies } from "./notify.js";
import { removePhoto, satisfaction } from './routes-auth.js';

/** Kamera indeksi: bola koʻringan va oldinga qaragan kuzatuvlar ulushi. Umuman koʻrinmagan boʻlsa, qiymat yoʻq. */
export const pct = (r) => (r && r.samples > 0 && r.seen > 0 ? Math.min(100, Math.round(100 * r.attentive / r.samples)) : null);
const lessonRow = (l) => ({ id: l.id, date: l.date, topic: l.topic, started: l.started, score: pct(l) });

export function liveInfo(classId) {
  const l = openLesson(classId);
  return l ? { id: l.id, topic: l.topic, started: l.started, streaming: isStreaming(l.id) } : null;
}
export const scheduleOf = (classId) => all(`SELECT x.id, x.class_id, x.dow, x.start, x.finish, x.subject, x.room_id, r.name room, c.name class_name, t.first || ' ' || t.last teacher
  FROM schedule x JOIN classes c ON c.id = x.class_id JOIN users t ON t.id = c.teacher_id LEFT JOIN rooms r ON r.id = COALESCE(x.room_id, c.room_id)
  WHERE x.class_id = ? ORDER BY x.dow, x.start`, classId);

/** Bir davr koʻrsatkichlari: [from, to) */
function period(sid, from, to) {
  const a = get(`SELECT COUNT(*) n, SUM(status <> 'absent') here FROM attendance WHERE student_id = ? AND date >= ? AND date < ?`, sid, from, to);
  const g = (kind) => get('SELECT AVG(value) a, COUNT(value) n FROM grades WHERE student_id = ? AND kind = ? AND date >= ? AND date < ?', sid, kind, from, to);
  const overall = get('SELECT AVG(value) a, COUNT(value) n FROM grades WHERE student_id = ? AND date >= ? AND date < ?', sid, from, to);
  const x = { activity: g('activity'), behaviour: g('behaviour'), homework: g('homework') };
  return {
    attendance: a.n ? 100 * a.here / a.n : null, grade: overall.a,
    activity: x.activity.a == null ? null : x.activity.a * 20, behaviour: x.behaviour.a == null ? null : x.behaviour.a * 20, homework: x.homework.a == null ? null : x.homework.a * 20,
    counts: { grades: overall.n, activity: x.activity.n, behaviour: x.behaviour.n, homework: x.homework.n },
  };
}
export function stats(sid) {
  const now = period(sid, daysAgo(29), daysAgo(-1)), prev = period(sid, daysAgo(59), daysAgo(29));
  const trend = {};
  for (const k of ['attendance', 'grade', 'activity', 'behaviour', 'homework']) trend[k] = now[k] != null && prev[k] != null ? now[k] - prev[k] : null;
  return { ...now, trend };
}
const months = (n) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (n - 1 - i)); return today(d).slice(0, 7); });

function teacherCard(id, parentId) {
  const t = get('SELECT id, first, last, phone, position, experience, bio, photo IS NOT NULL has_photo FROM users WHERE id = ?', id);
  return { ...t, rating: satisfaction(id), myStars: parentId ? get('SELECT stars FROM ratings WHERE parent_id = ? AND teacher_id = ?', parentId, id)?.stars ?? null : null,
    students: get(`SELECT COUNT(*) n FROM students s JOIN classes c ON c.id = s.class_id WHERE c.teacher_id = ? AND s.status = 'approved'`, id).n };
}

export function report(sid, viewer) {
  const s = get(`SELECT s.id, u.first, u.last, u.phone, u.telegram, s.address, s.parent_phone, s.class_id, s.status, s.level, s.photo IS NOT NULL has_photo,
    c.name class_name, c.course, c.teacher_id, r.name room, COALESCE(r.camera_on, 1) camera_on
    FROM students s JOIN users u ON u.id = s.id JOIN classes c ON c.id = s.class_id LEFT JOIN rooms r ON r.id = c.room_id WHERE s.id = ?`, sid) || missing();
  const byMonth = new Map(all(`SELECT substr(a.date, 1, 7) m, AVG(r.score) s FROM results r JOIN assessments a ON a.id = r.assessment_id WHERE r.student_id = ? GROUP BY m`, sid).map((r) => [r.m, r.s]));
  const skillRows = new Map(all(`SELECT a.skill, AVG(r.score) s, COUNT(*) n FROM results r JOIN assessments a ON a.id = r.assessment_id WHERE r.student_id = ? AND a.date >= ? GROUP BY a.skill`, sid, daysAgo(180)).map((r) => [r.skill, r]));
  const att = all('SELECT date, status FROM attendance WHERE student_id = ? AND date >= ? ORDER BY date', sid, daysAgo(125));
  const hw = all(`SELECT h.id, h.title, h.details, h.due, g.value, g.note FROM homework h
    LEFT JOIN grades g ON g.student_id = ? AND g.kind = 'homework' AND g.ref = CAST(h.id AS TEXT) WHERE h.class_id = ? ORDER BY h.due DESC, h.id DESC LIMIT 60`, sid, s.class_id);
  return {
    student: s, live: liveInfo(s.class_id), stats: stats(sid),
    teacher: teacherCard(s.teacher_id, viewer?.role === 'parent' ? viewer.id : 0),
    camera: viewer?.role === 'parent' ? !!get('SELECT camera FROM links WHERE parent_id = ? AND student_id = ?', viewer.id, sid)?.camera : true,
    progress: months(6).map((m) => ({ month: m, score: byMonth.has(m) ? Math.round(byMonth.get(m)) : null })),
    skills: SKILLS.map((k) => ({ skill: k, score: skillRows.has(k) ? Math.round(skillRows.get(k).s) : null })),
    assessments: all(`SELECT a.title, a.skill, a.date, r.score, r.comment FROM results r JOIN assessments a ON a.id = r.assessment_id WHERE r.student_id = ? ORDER BY a.date DESC, a.id DESC LIMIT 20`, sid),
    attendance: att, attendanceToday: att.find((a) => a.date === today())?.status ?? null,
    grades: all(`SELECT g.kind, g.date, g.value, g.note, h.title homework FROM grades g LEFT JOIN homework h ON g.kind = 'homework' AND h.id = CAST(g.ref AS INTEGER)
      WHERE g.student_id = ? ORDER BY g.date DESC, g.updated DESC LIMIT 60`, sid),
    homework: hw, homeworkDone: { done: hw.filter((h) => h.value != null).length, total: hw.filter((h) => h.value != null || h.due <= today()).length },
    lessons: all(`SELECT l.id, l.date, l.topic, l.started, SUM(a.samples) samples, SUM(a.seen) seen, SUM(a.attentive) attentive
      FROM lessons l JOIN activity a ON a.lesson_id = l.id WHERE a.student_id = ? GROUP BY l.id ORDER BY l.id DESC LIMIT 14`, sid).map(lessonRow).reverse(),
    feedback: all(`SELECT f.id, f.text, f.created, u.first || ' ' || u.last teacher FROM feedback f LEFT JOIN users u ON u.id = f.teacher_id WHERE f.student_id = ? ORDER BY f.id DESC LIMIT 30`, sid),
    schedule: scheduleOf(s.class_id),
  };
}

on('GET', '/report/:id', [], (c) => { const id = Number(c.p.id); if (!canSee(c.user, id)) deny(); return report(id, c.user); });

on('GET', '/children', ['parent'], (c) => all(`SELECT l.id link_id, l.child_first, l.child_last, l.camera, cl.name class_name, s.class_id, s.level, u.first, u.last, s.photo IS NOT NULL has_photo,
    CASE WHEN l.status = 'approved' AND s.status = 'approved' THEN s.id END id
    FROM links l LEFT JOIN students s ON s.id = l.student_id LEFT JOIN users u ON u.id = s.id LEFT JOIN classes cl ON cl.id = s.class_id
    WHERE l.parent_id = ? ORDER BY l.id`, c.user.id)
  .map((r) => (r.id
    ? { id: r.id, link_id: r.link_id, approved: true, first: r.first, last: r.last, level: r.level, class_name: r.class_name, has_photo: r.has_photo, camera: !!r.camera, live: liveInfo(r.class_id) }
    : { link_id: r.link_id, approved: false, first: r.child_first, last: r.child_last })));
on('PUT', '/rate/:id', ['parent'], (c) => {
  const tid = Number(c.p.id);
  if (!get(`SELECT 1 FROM links l JOIN students s ON s.id = l.student_id JOIN classes k ON k.id = s.class_id WHERE l.parent_id = ? AND l.status = 'approved' AND k.teacher_id = ?`, c.user.id, tid)) deny();
  run('INSERT INTO ratings VALUES (?,?,?) ON CONFLICT DO UPDATE SET stars = excluded.stars', c.user.id, tid, V.int(c.body.stars, 'stars', 'Baho', 1, 5));
  return {};
});
on('POST', '/camera/report', ['parent'], (c) => {
  const sid = Number(c.body.student_id);
  if (!canSee(c.user, sid)) deny();
  if (A.limited('camrep:' + c.user.id, 10)) bad('Juda koʻp xabar yuborildi. Keyinroq urinib koʻring.');
  A.hit('camrep:' + c.user.id, 3600e3);
  const k = get('SELECT c.id, c.name, c.teacher_id FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ?', sid);
  const id = run('INSERT INTO camera_reports (user_id, class_id, text, at) VALUES (?,?,?,?)', c.user.id, k.id, V.text(c.body.text, 'text', 'Muammo', 3, 500), Date.now()).lastInsertRowid;
  const to = [k.teacher_id, ...all(`SELECT id FROM users WHERE role = 'admin'`).map((x) => x.id)];
  to.forEach((u) => notify(u, 'camrep:' + id, 'camreport', { name: `${c.user.first} ${c.user.last}`, class: k.name }, '#/cameras'));
  return {};
});

/* ---------- oʻqituvchi va admin ---------- */
const T = ['teacher', 'admin'];
const scope = (u) => (u.role === 'admin' ? ['1 = 1', []] : ['c.teacher_id = ?', [u.id]]);

function pendingCount(u) {
  const [w, a] = scope(u);
  return get(`SELECT (SELECT COUNT(*) FROM students s JOIN classes c ON c.id = s.class_id WHERE ${w} AND s.status = 'pending')
    + (SELECT COUNT(*) FROM links l JOIN students s ON s.id = l.student_id JOIN classes c ON c.id = s.class_id WHERE ${w} AND l.status = 'pending') n`, ...a, ...a).n;
}
on('GET', '/t/classes', T, (c) => {
  const [w, a] = scope(c.user);
  return {
    pending: pendingCount(c.user),
    rooms: all('SELECT * FROM rooms ORDER BY name'),
    classes: all(`SELECT c.id, c.name, c.course, c.room_id, c.teacher_id, t.first || ' ' || t.last teacher, r.name room, COALESCE(r.camera_on, 1) camera_on,
      (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 'approved') students
      FROM classes c JOIN users t ON t.id = c.teacher_id LEFT JOIN rooms r ON r.id = c.room_id WHERE ${w} ORDER BY c.name`, ...a).map((x) => ({ ...x, live: liveInfo(x.id), viewers: viewersOf(x.id) })),
  };
});
on('POST', '/t/classes', T, (c) => {
  const name = V.className(c.body.name, 'name');
  const tid = c.user.role === 'admin' ? Number(c.body.teacher_id) || bad('Oʻqituvchini tanlang.', 'teacher_id') : c.user.id;
  if (!get(`SELECT 1 FROM users WHERE id = ? AND role = 'teacher'`, tid)) bad('Oʻqituvchini tanlang.', 'teacher_id');
  if (get('SELECT 1 FROM classes WHERE name = ? AND teacher_id = ?', name, tid)) bad('Bu sinf allaqachon bor.', 'name');
  return { id: Number(run('INSERT INTO classes (name, teacher_id, course) VALUES (?, ?, ?)', name, tid, V.text(c.body.course, 'course', 'Kurs', 0, 60)).lastInsertRowid) };
});
on('PATCH', '/t/classes/:id', T, (c) => {
  const k = ownClass(c.user, c.p.id), b = c.body;
  const room = b.room_id ? get('SELECT id FROM rooms WHERE id = ?', Number(b.room_id))?.id ?? null : null;
  const tid = c.user.role === 'admin' && b.teacher_id ? Number(b.teacher_id) : k.teacher_id;
  if (!get(`SELECT 1 FROM users WHERE id = ? AND role = 'teacher'`, tid)) bad('Oʻqituvchini tanlang.', 'teacher_id');
  const name = V.className(b.name ?? k.name, 'name');
  if (get('SELECT 1 FROM classes WHERE name = ? AND teacher_id = ? AND id <> ?', name, tid, k.id)) bad('Bu sinf allaqachon bor.', 'name');
  run('UPDATE classes SET name = ?, course = ?, room_id = ?, teacher_id = ? WHERE id = ?', name, V.text(b.course ?? k.course, 'course', 'Kurs', 0, 60), room, tid, k.id);
  return {};
});
on('DELETE', '/t/classes/:id', T, (c) => {
  const k = ownClass(c.user, c.p.id);
  if (get('SELECT 1 FROM students WHERE class_id = ?', k.id)) bad('Sinfda oʻquvchi bor. Avval ularni boshqa sinfga oʻtkazing.');
  run('DELETE FROM classes WHERE id = ?', k.id);
  return {};
});
on('GET', '/t/code', T, () => ({ code: teacherCode() }));

on('GET', '/t/dashboard/:id', T, (c) => {
  const k = ownClass(c.user, c.p.id);
  const mean = (kind) => `(SELECT AVG(value) FROM grades g WHERE g.student_id = u.id AND g.date >= ?1 AND g.kind = '${kind}') ${kind}`;
  const students = all(`SELECT u.id, u.first, u.last, s.level, s.photo IS NOT NULL has_photo, a.status attendance, ${mean('activity')}, ${mean('behaviour')}, ${mean('homework')},
      (SELECT AVG(r.score) FROM results r JOIN assessments x ON x.id = r.assessment_id WHERE r.student_id = u.id AND x.date >= ?1) test
    FROM students s JOIN users u ON u.id = s.id LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?2
    WHERE s.class_id = ?3 AND s.status = 'approved' ORDER BY u.last, u.first`, daysAgo(29), today(), k.id);
  const lessons = all(`SELECT l.id, l.date, l.topic, l.started, SUM(a.samples) samples, SUM(a.seen) seen, SUM(a.attentive) attentive
    FROM lessons l JOIN (SELECT lesson_id, SUM(samples) samples, SUM(seen) seen, SUM(attentive) attentive FROM activity
      GROUP BY lesson_id, student_id HAVING SUM(seen) > 0) a ON a.lesson_id = l.id
    WHERE l.class_id = ? GROUP BY l.id ORDER BY l.id DESC LIMIT 14`, k.id).map(lessonRow).reverse();
  return { class: k, live: liveInfo(k.id), viewers: viewersOf(k.id), students, lessons, schedule: scheduleOf(k.id) };
});

/* -- soʻrovlar -- */
on('GET', '/t/pending', T, (c) => {
  const [w, a] = scope(c.user);
  return {
    students: all(`SELECT s.id, u.first, u.last, u.phone, u.telegram, s.address, s.parent_phone, c.name class_name, s.photo IS NOT NULL has_photo
      FROM students s JOIN users u ON u.id = s.id JOIN classes c ON c.id = s.class_id WHERE ${w} AND s.status = 'pending' ORDER BY s.id`, ...a),
    parents: all(`SELECT l.id, p.first, p.last, p.phone, l.child_first, l.child_last, su.first s_first, su.last s_last, c.name class_name,
        p.phone = s.parent_phone phone_ok, l.name_key = s.name_key name_ok
      FROM links l JOIN users p ON p.id = l.parent_id JOIN students s ON s.id = l.student_id JOIN users su ON su.id = s.id
      JOIN classes c ON c.id = s.class_id WHERE ${w} AND l.status = 'pending' ORDER BY l.id`, ...a),
  };
});
const allParents = (sid) => all('SELECT parent_id id FROM links WHERE student_id = ?', sid).map((r) => r.id);
on('POST', '/t/students/:id/approve', T, (c) => {
  const s = ownStudent(c.user, c.p.id);
  run(`UPDATE students SET status = 'approved' WHERE id = ?`, s.id);
  allParents(s.id).forEach(closeUser);
  closeUser(s.id);
  notifyFamily(s.id, 'approved', 'approved', { class: s.class_name }, '#/dashboard');
  return {};
});
on('PATCH', '/t/students/:id', T, (c) => {
  const s = ownStudent(c.user, c.p.id), b = c.body;
  const level = V.oneOf(b.level ?? s.level, LEVELS, 'level', 'Daraja');
  let cls = s.class_id;
  if (b.class_id && Number(b.class_id) !== cls) cls = ownClass(c.user, b.class_id).id;
  run('UPDATE students SET level = ?, class_id = ? WHERE id = ?', level, cls, s.id);
  if (cls !== s.class_id) { allParents(s.id).forEach(closeUser); closeUser(s.id); }
  if (level !== s.level) notifyFamily(s.id, 'level', 'level', { level }, '#/child');
  return {};
});
export function deleteStudent(id) {
  const s = get('SELECT photo FROM students WHERE id = ?', id), parents = allParents(id);
  run('DELETE FROM users WHERE id = ?', id);
  removePhoto(s?.photo);
  [id, ...parents].forEach(closeUser);
}
on('DELETE', '/t/students/:id', T, (c) => { deleteStudent(ownStudent(c.user, c.p.id).id); return {}; });
on('POST', '/t/links/:id/approve', T, (c) => {
  const l = ownLink(c.user, c.p.id);
  run(`UPDATE links SET status = 'approved' WHERE id = ?`, l.id);
  closeUser(l.parent_id);
  notify(l.parent_id, 'linked:' + l.id, 'linked', { name: `${l.child_first} ${l.child_last}` }, '#/dashboard');
  return {};
});
on('PUT', '/t/links/:id/camera', T, (c) => {
  const l = ownLink(c.user, c.p.id);
  run('UPDATE links SET camera = ? WHERE id = ?', c.body.on ? 1 : 0, l.id);
  closeUser(l.parent_id);
  return {};
});
on('DELETE', '/t/links/:id', T, (c) => { const l = ownLink(c.user, c.p.id); run('DELETE FROM links WHERE id = ?', l.id); closeUser(l.parent_id); return {}; });

on('GET', '/t/students/:id', T, (c) => {
  const s = ownStudent(c.user, c.p.id);
  return { ...report(s.id, c.user), login: get('SELECT login FROM users WHERE id = ?', s.id).login,
    parents: all('SELECT l.id link_id, l.camera, u.id, u.first, u.last, u.phone, u.login, u.photo IS NOT NULL has_photo, l.status FROM links l JOIN users u ON u.id = l.parent_id WHERE l.student_id = ?', s.id) };
});
on('POST', '/t/users/:id/reset', T, (c) => {
  const id = Number(c.p.id), target = get('SELECT * FROM users WHERE id = ?', id) || missing();
  if (c.user.role === 'admin') { if (id === c.user.id) bad('Oʻz parolingizni sozlamalarda almashtiring.'); }
  else {
    // Oʻz oʻquvchisi yoki faqat shu oʻqituvchi tasdiqlagan ota-ona. Boshqa oʻqituvchiga ham bogʻliq ota-ona paroliga tegib boʻlmaydi.
    const linked = (op) => get(`SELECT 1 FROM links l JOIN students s ON s.id = l.student_id JOIN classes c ON c.id = s.class_id
      WHERE l.parent_id = ? AND l.status = 'approved' AND c.teacher_id ${op} ?`, id, c.user.id);
    const mine = get('SELECT 1 FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ? AND c.teacher_id = ?', id, c.user.id);
    if (!mine && !(linked('=') && !linked('<>'))) deny();
  }
  const password = A.newPassword();
  run('UPDATE users SET pass = ? WHERE id = ?', A.hash(password), id);
  A.dropSessions(id);
  closeUser(id);
  return { login: target.login, password };
});

/* -- jurnal -- */
on('GET', '/t/journal/:id', T, (c) => {
  const k = ownClass(c.user, c.p.id), date = V.date(c.q.get('date'));
  const students = all(`SELECT u.id, u.first, u.last, s.photo IS NOT NULL has_photo, a.status attendance, a.source
    FROM students s JOIN users u ON u.id = s.id LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?
    WHERE s.class_id = ? AND s.status = 'approved' ORDER BY u.last, u.first`, date, k.id);
  const grades = all(`SELECT g.student_id, g.kind, g.value, g.note FROM grades g JOIN students s ON s.id = g.student_id
    WHERE s.class_id = ? AND g.kind IN ('activity','behaviour') AND g.ref = ?`, k.id, date);
  const cam = all(`SELECT a.student_id, SUM(samples) samples, SUM(seen) seen, SUM(attentive) attentive FROM activity a JOIN lessons l ON l.id = a.lesson_id
    WHERE l.class_id = ? AND l.date = ? GROUP BY 1`, k.id, date);
  return students.map((s) => ({ ...s, camera: pct(cam.find((x) => x.student_id === s.id)),
    grades: Object.fromEntries(grades.filter((g) => g.student_id === s.id).map((g) => [g.kind, { value: g.value, note: g.note }])) }));
});
function saveGrade(sid, kind, ref, date, value, note, extra = {}) {
  if (value !== null && ![1, 2, 3, 4, 5].includes(value)) bad('Baho 1 dan 5 gacha boʻladi.');
  const n = String(note ?? '').trim().slice(0, 300);
  if (value === null && !n) run('DELETE FROM grades WHERE student_id = ? AND kind = ? AND ref = ?', sid, kind, ref);
  else {
    run(`INSERT INTO grades (student_id, kind, ref, date, value, note, updated) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT (student_id, kind, ref) DO UPDATE SET value = excluded.value, note = excluded.note, updated = excluded.updated`, sid, kind, ref, date, value, n, Date.now());
    if (value !== null) notifyFamily(sid, `grade:${kind}:${ref}:${sid}`, 'grade', { kind, value, ...extra }, kind === 'homework' ? '#/homework' : '#/behaviour');
  }
  pushStudent(sid, { t: 'update' });
}
on('PUT', '/t/grade', T, (c) => {
  const { kind, value, note } = c.body, s = ownStudent(c.user, c.body.student_id);
  if (kind === 'homework') {
    const h = ownHomework(c.user, c.body.homework_id);
    if (h.class_id !== s.class_id) deny();
    saveGrade(s.id, kind, String(h.id), today(), value ?? null, note, { title: h.title });
  } else if (kind === 'activity' || kind === 'behaviour') {
    const d = V.date(c.body.date);
    if (d > today()) bad('Kelajak sanaga baho qoʻyib boʻlmaydi.');
    saveGrade(s.id, kind, d, d, value ?? null, note);
  } else bad('Baho turi notoʻgʻri.');
  return {};
});
function attendanceChanged(sid, status, date = today()) {
  notifyFamily(sid, `att:${date}:${sid}`, 'attendance', { status, date }, '#/attendance', false);
  pushStudent(sid, { t: 'update' });
}
setArriveHandler(attendanceChanged);
on('PUT', '/t/attendance', T, (c) => {
  const s = ownStudent(c.user, c.body.student_id), d = V.date(c.body.date), st = c.body.status;
  if (d > today()) bad('Kelajak sanaga davomat belgilab boʻlmaydi.');
  if (st === null) { run('DELETE FROM attendance WHERE student_id = ? AND date = ?', s.id, d); pushStudent(s.id, { t: 'update' }); return {}; }
  V.oneOf(st, ['present', 'late', 'absent'], 'status', 'Davomat holati');
  run(`INSERT INTO attendance VALUES (?,?,?,'teacher') ON CONFLICT DO UPDATE SET status = excluded.status, source = 'teacher'`, s.id, d, st);
  attendanceChanged(s.id, st, d);
  return {};
});

/* -- uy vazifasi -- */
const roster = (classId) => all(`SELECT u.id, u.first, u.last, s.photo IS NOT NULL has_photo FROM students s JOIN users u ON u.id = s.id
  WHERE s.class_id = ? AND s.status = 'approved' ORDER BY u.last, u.first`, classId);
on('GET', '/t/homework/:id', T, (c) => {
  const k = ownClass(c.user, c.p.id);
  return { students: roster(k.id), items: all('SELECT * FROM homework WHERE class_id = ? ORDER BY due DESC, id DESC LIMIT 60', k.id).map((h) => ({
    ...h, grades: Object.fromEntries(all(`SELECT student_id, value, note FROM grades WHERE kind = 'homework' AND ref = ?`, String(h.id)).map((g) => [g.student_id, g])) })) };
});
on('POST', '/t/homework', T, (c) => {
  const k = ownClass(c.user, c.body.class_id), title = V.text(c.body.title, 'title', 'Vazifa nomi', 2, 120), due = V.date(c.body.due, 'due');
  const id = Number(run('INSERT INTO homework (class_id, title, details, due, created) VALUES (?,?,?,?,?)', k.id, title, V.text(c.body.details, 'details', 'Tavsif', 0, 1000), due, Date.now()).lastInsertRowid);
  notifyClassFamilies(k.id, 'hw:' + id, 'homework', { title, due }, '#/homework');
  pushClass(k.id, { t: 'update' });
  return { id };
});
on('DELETE', '/t/homework/:id', T, (c) => {
  const h = ownHomework(c.user, c.p.id);
  tx(() => { run(`DELETE FROM grades WHERE kind = 'homework' AND ref = ?`, String(h.id)); run('DELETE FROM homework WHERE id = ?', h.id); });
  return {};
});

/* -- testlar -- */
on('GET', '/t/assessments/:id', T, (c) => {
  const k = ownClass(c.user, c.p.id);
  return { students: roster(k.id), items: all('SELECT * FROM assessments WHERE class_id = ? ORDER BY date DESC, id DESC LIMIT 60', k.id).map((a) => ({
    ...a, results: Object.fromEntries(all('SELECT student_id, score, comment FROM results WHERE assessment_id = ?', a.id).map((r) => [r.student_id, r])) })) };
});
on('POST', '/t/assessments', T, (c) => {
  const k = ownClass(c.user, c.body.class_id);
  return { id: Number(run('INSERT INTO assessments (class_id, title, skill, date) VALUES (?,?,?,?)', k.id, V.text(c.body.title, 'title', 'Test nomi', 2, 120),
    V.oneOf(c.body.skill, SKILLS, 'skill', 'Koʻnikma'), V.date(c.body.date, 'date')).lastInsertRowid) };
});
on('DELETE', '/t/assessments/:id', T, (c) => { run('DELETE FROM assessments WHERE id = ?', ownAssessment(c.user, c.p.id).id); return {}; });
on('PUT', '/t/result', T, (c) => {
  const a = ownAssessment(c.user, c.body.assessment_id), s = ownStudent(c.user, c.body.student_id);
  if (a.class_id !== s.class_id) deny();
  if (c.body.score === null || c.body.score === '') run('DELETE FROM results WHERE assessment_id = ? AND student_id = ?', a.id, s.id);
  else {
    const score = V.int(c.body.score, 'score', 'Natija', 0, 100);
    run('INSERT INTO results VALUES (?,?,?,?) ON CONFLICT DO UPDATE SET score = excluded.score, comment = excluded.comment', a.id, s.id, score, V.text(c.body.comment, 'comment', 'Izoh', 0, 300));
    notifyFamily(s.id, `result:${a.id}:${s.id}`, 'result', { title: a.title, score }, '#/grades');
  }
  pushStudent(s.id, { t: 'update' });
  return {};
});

/* -- fikrlar -- */
on('POST', '/t/feedback', T, (c) => {
  const s = ownStudent(c.user, c.body.student_id);
  const id = run('INSERT INTO feedback (student_id, teacher_id, text, created) VALUES (?,?,?,?)', s.id, c.user.id, V.text(c.body.text, 'text', 'Fikr', 3, 800), Date.now()).lastInsertRowid;
  notifyFamily(s.id, 'fb:' + id, 'feedback', { teacher: `${c.user.first} ${c.user.last}` }, '#/feedback');
  pushStudent(s.id, { t: 'update' });
  return {};
});
on('DELETE', '/t/feedback/:id', T, (c) => {
  const f = get('SELECT * FROM feedback WHERE id = ?', Number(c.p.id)) || missing();
  ownStudent(c.user, f.student_id);
  run('DELETE FROM feedback WHERE id = ?', f.id);
  return {};
});

/* -- jadval -- */
on('GET', '/t/schedule', T, (c) => {
  const [w, a] = scope(c.user);
  return all(`SELECT c.id FROM classes c WHERE ${w}`, ...a).flatMap((k) => scheduleOf(k.id));
});
const scheduleBody = (b) => {
  const start = V.time(b.start, 'start'), finish = V.time(b.finish, 'finish');
  if (finish <= start) bad('Tugash vaqti boshlanishidan keyin boʻlsin.', 'finish');
  const room = b.room_id ? get('SELECT id FROM rooms WHERE id = ?', Number(b.room_id))?.id ?? null : null;
  return [V.int(b.dow, 'dow', 'Kun', 1, 7), start, finish, V.text(b.subject, 'subject', 'Dars', 2, 60), room];
};
on('POST', '/t/schedule', T, (c) => {
  const k = ownClass(c.user, c.body.class_id);
  const [dow, start, finish, subject, room] = scheduleBody(c.body);
  if (get('SELECT 1 FROM schedule WHERE class_id = ? AND dow = ? AND start < ? AND finish > ?', k.id, dow, finish, start)) bad('Bu vaqtda sinfning boshqa darsi bor.', 'start');
  return { id: Number(run('INSERT INTO schedule (class_id, dow, start, finish, subject, room_id) VALUES (?,?,?,?,?,?)', k.id, dow, start, finish, subject, room).lastInsertRowid) };
});
on('DELETE', '/t/schedule/:id', T, (c) => { run('DELETE FROM schedule WHERE id = ?', ownSchedule(c.user, c.p.id).id); return {}; });

/* -- jonli dars -- */
on('GET', '/t/faces/:id', ['teacher'], (c) => all(`SELECT u.id, u.first, u.last, s.descriptor, s.photo IS NOT NULL has_photo FROM students s JOIN users u ON u.id = s.id
  WHERE s.class_id = ? AND s.status = 'approved' ORDER BY u.last, u.first`, ownClass(c.user, c.p.id).id)
  .map((s) => ({ ...s, descriptor: s.descriptor ? JSON.parse(s.descriptor) : null })));
on('PUT', '/t/faces/:id', ['teacher'], (c) => { const s = ownStudent(c.user, c.p.id); run('UPDATE students SET descriptor = ? WHERE id = ?', V.descriptor(c.body.descriptor), s.id); return {}; });
on('POST', '/t/lessons', ['teacher'], (c) => {
  const k = ownClass(c.user, c.body.class_id);
  if (k.room_id && !get('SELECT camera_on FROM rooms WHERE id = ?', k.room_id)?.camera_on) bad('Bu xona kamerasi admin tomonidan oʻchirilgan.');
  let l = openLesson(k.id);
  if (!l) {
    const topic = V.text(c.body.topic, 'topic', 'Dars mavzusi', 2, 120);
    const id = run('INSERT INTO lessons (class_id, topic, date, started) VALUES (?,?,?,?)', k.id, topic, today(), Date.now()).lastInsertRowid;
    l = get('SELECT * FROM lessons WHERE id = ?', id);
    notifyClassFamilies(k.id, 'live:' + id, 'live', { topic, class: k.name }, '#/camera', false);
  }
  pushClass(k.id, { t: 'lesson' });
  return l;
});
on('POST', '/t/lessons/:id/end', T, (c) => {
  const l = ownLesson(c.user, c.p.id);
  run('UPDATE lessons SET ended = ? WHERE id = ? AND ended IS NULL', Date.now(), l.id);
  pushClass(l.class_id, { t: 'lesson' });
  return {};
});
