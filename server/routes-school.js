/* Taʼlim jarayoni: hisobot (ota-ona, oʻquvchi) va oʻqituvchi/admin uchun sinf ishlari. */
import { all, get, run, insert, tx, today, daysAgo, lastMonths, teacherCode } from './db.js';
import * as A from './auth.js';
import { V, bad, deny, missing, on, canSee, ownClass, ownStudent, ownHomework, ownAssessment, ownSchedule, ownLesson, ownLink, LEVELS, SKILLS } from './core.js';
import { endLesson, openLesson, openWhere, streaming, viewers } from './live.js';
import { notify, notifyFamily, notifyClassFamilies, notifyMany } from './notify.js';
import { removePhoto } from './files.js';
import { RATING, withRating } from './routes-auth.js';

/** Kamera indeksi: bola koʻringan va oldinga qaragan kuzatuvlar ulushi. Umuman koʻrinmagan boʻlsa, qiymat yoʻq. */
export const pct = (r) => (r && r.samples > 0 && r.seen > 0 ? Math.min(100, Math.round((100 * r.attentive) / r.samples)) : null);
const lessonRow = (l) => ({ id: l.id, date: l.date, topic: l.topic, started: l.started, score: pct(l) });
const liveOf = (l) => (l ? { id: l.id, topic: l.topic, started: l.started, streaming: streaming(l) } : null);

/** Sinf id -> ochiq dars. */
async function liveMap() {
  return new Map((await all('SELECT * FROM lessons WHERE ended IS NULL AND started > ? ORDER BY id', openWhere())).map((l) => [l.class_id, liveOf(l)]));
}
const scheduleSql = `SELECT x.id, x.class_id, x.dow, x.start, x.finish, x.subject, x.room_id, r.name room, c.name class_name, t.first || ' ' || t.last teacher
  FROM schedule x JOIN classes c ON c.id = x.class_id JOIN users t ON t.id = c.teacher_id LEFT JOIN rooms r ON r.id = COALESCE(x.room_id, c.room_id)`;
const scheduleOf = (classId) => all(`${scheduleSql} WHERE x.class_id = ? ORDER BY x.dow, x.start`, classId);

/** Oxirgi 30 kun va undan oldingi 30 kun bitta soʻrovda. */
async function stats(sid) {
  const mid = daysAgo(29), old = daysAgo(59);
  const [att, gr] = await Promise.all([
    all(`SELECT date >= ?1 cur, COUNT(*) n, COUNT(*) FILTER (WHERE status <> 'absent') here FROM attendance WHERE student_id = ?2 AND date >= ?3 GROUP BY 1`, mid, sid, old),
    all('SELECT date >= ?1 cur, kind, SUM(value) s, COUNT(value) n FROM grades WHERE student_id = ?2 AND date >= ?3 GROUP BY 1, 2', mid, sid, old),
  ]);
  const period = (cur) => {
    const a = att.find((x) => x.cur === cur), g = gr.filter((x) => x.cur === cur);
    const mean = (rows) => { const n = rows.reduce((t, x) => t + x.n, 0); return n ? rows.reduce((t, x) => t + (x.s || 0), 0) / n : null; };
    const kind = (k) => { const m = mean(g.filter((x) => x.kind === k)); return m == null ? null : m * 20; };
    return { attendance: a ? (100 * a.here) / a.n : null, grade: mean(g), activity: kind('activity'), behaviour: kind('behaviour'), homework: kind('homework') };
  };
  const now = period(true), prev = period(false), trend = {};
  for (const k of Object.keys(now)) trend[k] = now[k] != null && prev[k] != null ? now[k] - prev[k] : null;
  return { ...now, trend };
}

async function teacherCard(id, parentId) {
  const [t, mine] = await Promise.all([
    get(`SELECT t.id, t.first, t.last, t.phone, t.position, t.experience, t.bio, t.photo IS NOT NULL has_photo, ${RATING} FROM users t WHERE t.id = ?`, id),
    parentId ? get('SELECT stars FROM ratings WHERE parent_id = ? AND teacher_id = ?', parentId, id) : null,
  ]);
  return { ...withRating(t), myStars: mine?.stars ?? null };
}

async function report(sid, viewer) {
  const s = (await get(`SELECT s.id, u.first, u.last, u.phone, u.telegram, s.address, s.parent_phone, s.class_id, s.status, s.level, s.photo IS NOT NULL has_photo,
    c.name class_name, c.course, c.teacher_id, r.name room, COALESCE(r.camera_on, 1) camera_on
    FROM students s JOIN users u ON u.id = s.id JOIN classes c ON c.id = s.class_id LEFT JOIN rooms r ON r.id = c.room_id WHERE s.id = ?`, sid)) || missing();
  const parent = viewer?.role === 'parent';
  const [st, teacher, live, link, months, skills, assessments, att, grades, hw, lessons, feedback, schedule] = await Promise.all([
    stats(sid), teacherCard(s.teacher_id, parent ? viewer.id : 0), openLesson(s.class_id),
    parent ? get('SELECT camera FROM links WHERE parent_id = ? AND student_id = ?', viewer.id, sid) : { camera: 1 },
    all(`SELECT substr(a.date, 1, 7) m, AVG(r.score) s FROM results r JOIN assessments a ON a.id = r.assessment_id WHERE r.student_id = ? GROUP BY 1`, sid),
    all(`SELECT a.skill, AVG(r.score) s FROM results r JOIN assessments a ON a.id = r.assessment_id WHERE r.student_id = ? AND a.date >= ? GROUP BY a.skill`, sid, daysAgo(180)),
    all('SELECT a.title, a.skill, a.date, r.score, r.comment FROM results r JOIN assessments a ON a.id = r.assessment_id WHERE r.student_id = ? ORDER BY a.date DESC, a.id DESC LIMIT 20', sid),
    all('SELECT date, status FROM attendance WHERE student_id = ? AND date >= ? ORDER BY date', sid, daysAgo(125)),
    all(`SELECT g.kind, g.date, g.value, g.note, h.title homework FROM grades g LEFT JOIN homework h ON g.kind = 'homework' AND h.id::text = g.ref
      WHERE g.student_id = ? ORDER BY g.date DESC, g.updated DESC LIMIT 60`, sid),
    all(`SELECT h.id, h.title, h.details, h.due, g.value, g.note FROM homework h LEFT JOIN grades g ON g.student_id = ? AND g.kind = 'homework' AND g.ref = h.id::text
      WHERE h.class_id = ? ORDER BY h.due DESC, h.id DESC LIMIT 60`, sid, s.class_id),
    all(`SELECT l.id, l.date, l.topic, l.started, SUM(a.samples) samples, SUM(a.seen) seen, SUM(a.attentive) attentive
      FROM lessons l JOIN activity a ON a.lesson_id = l.id WHERE a.student_id = ? GROUP BY l.id ORDER BY l.id DESC LIMIT 14`, sid),
    all(`SELECT f.id, f.text, f.created, u.first || ' ' || u.last teacher FROM feedback f LEFT JOIN users u ON u.id = f.teacher_id WHERE f.student_id = ? ORDER BY f.id DESC LIMIT 30`, sid),
    scheduleOf(s.class_id),
  ]);
  const byMonth = new Map(months.map((r) => [r.m, r.s])), bySkill = new Map(skills.map((r) => [r.skill, r.s]));
  const round = (v) => (v == null ? null : Math.round(v));
  return {
    student: s, live: liveOf(live), stats: st, teacher, camera: !!link?.camera,
    progress: lastMonths(6).map((m) => ({ month: m, score: round(byMonth.get(m)) })), skills: SKILLS.map((k) => ({ skill: k, score: round(bySkill.get(k)) })),
    assessments, attendance: att, attendanceToday: att.find((a) => a.date === today())?.status ?? null, grades,
    homework: hw, homeworkDone: { done: hw.filter((h) => h.value != null).length, total: hw.filter((h) => h.value != null || h.due <= today()).length },
    lessons: lessons.map(lessonRow).reverse(), feedback, schedule,
  };
}

on('GET', '/report/:id', [], async (c) => { const id = Number(c.p.id); if (!await canSee(c.user, id)) deny(); return report(id, c.user); });

on('GET', '/children', ['parent'], async (c) => {
  const [rows, live] = await Promise.all([all(`SELECT l.id link_id, l.child_first, l.child_last, l.camera, cl.name class_name, s.class_id, s.level, u.first, u.last, s.photo IS NOT NULL has_photo,
    CASE WHEN l.status = 'approved' AND s.status = 'approved' THEN s.id END id
    FROM links l LEFT JOIN students s ON s.id = l.student_id LEFT JOIN users u ON u.id = s.id LEFT JOIN classes cl ON cl.id = s.class_id WHERE l.parent_id = ? ORDER BY l.id`, c.user.id), liveMap()]);
  return rows.map((r) => (r.id
    ? { id: r.id, link_id: r.link_id, approved: true, first: r.first, last: r.last, level: r.level, class_name: r.class_name, has_photo: r.has_photo, camera: !!r.camera, live: live.get(r.class_id) || null }
    : { link_id: r.link_id, approved: false, first: r.child_first, last: r.child_last }));
});
on('PUT', '/rate/:id', ['parent'], async (c) => {
  const tid = Number(c.p.id);
  if (!await get(`SELECT 1 FROM links l JOIN students s ON s.id = l.student_id JOIN classes k ON k.id = s.class_id WHERE l.parent_id = ? AND l.status = 'approved' AND k.teacher_id = ?`, c.user.id, tid)) deny();
  await run('INSERT INTO ratings VALUES (?,?,?) ON CONFLICT (parent_id, teacher_id) DO UPDATE SET stars = excluded.stars', c.user.id, tid, V.int(c.body.stars, 'stars', 'Baho', 1, 5));
  return {};
});
on('POST', '/camera/report', ['parent'], async (c) => {
  const sid = Number(c.body.student_id) || 0;
  if (!await canSee(c.user, sid)) deny();
  if (await A.limited('camrep:' + c.user.id, 10)) bad('Juda koʻp xabar yuborildi. Keyinroq urinib koʻring.');
  await A.hit('camrep:' + c.user.id, 3600e3);
  const k = await get('SELECT c.id, c.name, c.teacher_id FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ?', sid);
  const id = await insert('INSERT INTO camera_reports (user_id, class_id, text, at) VALUES (?,?,?,?)', c.user.id, k.id, V.text(c.body.text, 'text', 'Muammo', 3, 500), Date.now());
  const to = [k.teacher_id, ...(await all(`SELECT id FROM users WHERE role = 'admin'`)).map((x) => x.id)];
  await notifyMany(to.map((u) => ({ user_id: u, key: 'camrep:' + id, type: 'camreport', data: { name: `${c.user.first} ${c.user.last}`, class: k.name }, link: '#/cameras' })));
  return {};
});

/* ---------- oʻqituvchi va admin ---------- */
const T = ['teacher', 'admin'];
const scope = (u) => (u.role === 'admin' ? ['1 = 1', []] : ['c.teacher_id = ?1', [u.id]]);

on('GET', '/t/classes', T, async (c) => {
  const [w, a] = scope(c.user);
  const [pending, rooms, classes, live, seen] = await Promise.all([
    get(`SELECT (SELECT COUNT(*) FROM students s JOIN classes c ON c.id = s.class_id WHERE ${w} AND s.status = 'pending')
      + (SELECT COUNT(*) FROM links l JOIN students s ON s.id = l.student_id JOIN classes c ON c.id = s.class_id WHERE ${w} AND l.status = 'pending') n`, ...a),
    all('SELECT * FROM rooms ORDER BY name'),
    all(`SELECT c.id, c.name, c.course, c.room_id, c.teacher_id, t.first || ' ' || t.last teacher, r.name room, COALESCE(r.camera_on, 1) camera_on,
      (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 'approved') students
      FROM classes c JOIN users t ON t.id = c.teacher_id LEFT JOIN rooms r ON r.id = c.room_id WHERE ${w} ORDER BY c.name`, ...a),
    liveMap(), viewers(),
  ]);
  return { pending: pending.n, rooms, classes: classes.map((x) => { const l = live.get(x.id) || null; return { ...x, live: l, viewers: (l && seen.get(l.id)) || 0 }; }) };
});
const checkTeacher = async (id) => { if (!await get(`SELECT 1 FROM users WHERE id = ? AND role = 'teacher'`, Number(id) || 0)) bad('Oʻqituvchini tanlang.', 'teacher_id'); return Number(id); };
const checkRoom = async (id) => (id ? (await get('SELECT id FROM rooms WHERE id = ?', Number(id) || 0))?.id ?? null : null);
on('POST', '/t/classes', T, async (c) => {
  const name = V.className(c.body.name, 'name');
  const tid = c.user.role === 'admin' ? await checkTeacher(c.body.teacher_id) : c.user.id;
  if (await get('SELECT 1 FROM classes WHERE name = ? AND teacher_id = ?', name, tid)) bad('Bu sinf allaqachon bor.', 'name');
  return { id: await insert('INSERT INTO classes (name, teacher_id, course) VALUES (?, ?, ?)', name, tid, V.text(c.body.course, 'course', 'Kurs', 0, 60)) };
});
on('PATCH', '/t/classes/:id', T, async (c) => {
  const k = await ownClass(c.user, c.p.id), b = c.body;
  const tid = c.user.role === 'admin' && b.teacher_id ? await checkTeacher(b.teacher_id) : k.teacher_id;
  const name = V.className(b.name ?? k.name, 'name');
  if (await get('SELECT 1 FROM classes WHERE name = ? AND teacher_id = ? AND id <> ?', name, tid, k.id)) bad('Bu sinf allaqachon bor.', 'name');
  await run('UPDATE classes SET name = ?, course = ?, room_id = ?, teacher_id = ? WHERE id = ?', name, V.text(b.course ?? k.course, 'course', 'Kurs', 0, 60), await checkRoom(b.room_id), tid, k.id);
  return {};
});
on('DELETE', '/t/classes/:id', T, async (c) => {
  const k = await ownClass(c.user, c.p.id);
  if (await get('SELECT 1 FROM students WHERE class_id = ?', k.id)) bad('Sinfda oʻquvchi bor. Avval ularni boshqa sinfga oʻtkazing.');
  await run('DELETE FROM classes WHERE id = ?', k.id);
  return {};
});
on('GET', '/t/code', T, async () => ({ code: await teacherCode() }));

on('GET', '/t/dashboard/:id', T, async (c) => {
  const k = await ownClass(c.user, c.p.id), from = daysAgo(29);
  const mean = (kind) => `AVG(g.value) FILTER (WHERE g.kind = '${kind}') ${kind}`;
  const [students, grades, tests, lessons, live, schedule] = await Promise.all([
    all(`SELECT u.id, u.first, u.last, s.level, s.photo IS NOT NULL has_photo, a.status attendance FROM students s JOIN users u ON u.id = s.id
      LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ? WHERE s.class_id = ? AND s.status = 'approved' ORDER BY u.last, u.first`, today(), k.id),
    all(`SELECT g.student_id id, ${mean('activity')}, ${mean('behaviour')}, ${mean('homework')} FROM grades g JOIN students s ON s.id = g.student_id WHERE s.class_id = ? AND g.date >= ? GROUP BY g.student_id`, k.id, from),
    all('SELECT r.student_id id, AVG(r.score) test FROM results r JOIN assessments x ON x.id = r.assessment_id JOIN students s ON s.id = r.student_id WHERE s.class_id = ? AND x.date >= ? GROUP BY r.student_id', k.id, from),
    all(`SELECT l.id, l.date, l.topic, l.started, SUM(a.samples) samples, SUM(a.seen) seen, SUM(a.attentive) attentive
      FROM lessons l JOIN (SELECT lesson_id, SUM(samples) samples, SUM(seen) seen, SUM(attentive) attentive FROM activity GROUP BY lesson_id, student_id HAVING SUM(seen) > 0) a ON a.lesson_id = l.id
      WHERE l.class_id = ? GROUP BY l.id ORDER BY l.id DESC LIMIT 14`, k.id),
    openLesson(k.id), scheduleOf(k.id),
  ]);
  const g = new Map(grades.map((x) => [x.id, x])), t = new Map(tests.map((x) => [x.id, x]));
  return { class: k, live: liveOf(live), students: students.map((s) => ({ activity: null, behaviour: null, homework: null, test: null, ...s, ...g.get(s.id), ...t.get(s.id) })), lessons: lessons.map(lessonRow).reverse(), schedule };
});

/* -- soʻrovlar -- */
on('GET', '/t/pending', T, async (c) => {
  const [w, a] = scope(c.user);
  const [students, parents] = await Promise.all([
    all(`SELECT s.id, u.first, u.last, u.phone, u.telegram, s.address, s.parent_phone, c.name class_name, s.photo IS NOT NULL has_photo
      FROM students s JOIN users u ON u.id = s.id JOIN classes c ON c.id = s.class_id WHERE ${w} AND s.status = 'pending' ORDER BY s.id`, ...a),
    all(`SELECT l.id, p.first, p.last, p.phone, l.child_first, l.child_last, su.first s_first, su.last s_last, c.name class_name, p.phone = s.parent_phone phone_ok, l.name_key = s.name_key name_ok
      FROM links l JOIN users p ON p.id = l.parent_id JOIN students s ON s.id = l.student_id JOIN users su ON su.id = s.id JOIN classes c ON c.id = s.class_id WHERE ${w} AND l.status = 'pending' ORDER BY l.id`, ...a),
  ]);
  return { students, parents };
});
on('POST', '/t/students/:id/approve', T, async (c) => {
  const s = await ownStudent(c.user, c.p.id);
  await run(`UPDATE students SET status = 'approved' WHERE id = ?`, s.id);
  await notifyFamily(s.id, 'approved', 'approved', { class: s.class_name }, '#/dashboard');
  return {};
});
on('PATCH', '/t/students/:id', T, async (c) => {
  const s = await ownStudent(c.user, c.p.id), b = c.body;
  const level = V.oneOf(b.level ?? s.level, LEVELS, 'level', 'Daraja');
  const cls = b.class_id && Number(b.class_id) !== s.class_id ? (await ownClass(c.user, b.class_id)).id : s.class_id;
  await run('UPDATE students SET level = ?, class_id = ? WHERE id = ?', level, cls, s.id);
  if (level !== s.level) await notifyFamily(s.id, 'level', 'level', { level }, '#/child');
  return {};
});
export async function deleteStudent(id) {
  const s = await get('SELECT photo FROM students WHERE id = ?', id);
  await run('DELETE FROM users WHERE id = ?', id);
  await removePhoto(s?.photo);
}
on('DELETE', '/t/students/:id', T, async (c) => { await deleteStudent((await ownStudent(c.user, c.p.id)).id); return {}; });
on('POST', '/t/links/:id/approve', T, async (c) => {
  const l = await ownLink(c.user, c.p.id);
  await run(`UPDATE links SET status = 'approved' WHERE id = ?`, l.id);
  await notify(l.parent_id, 'linked:' + l.id, 'linked', { name: `${l.child_first} ${l.child_last}` }, '#/dashboard');
  return {};
});
on('PUT', '/t/links/:id/camera', T, async (c) => { const l = await ownLink(c.user, c.p.id); await run('UPDATE links SET camera = ? WHERE id = ?', c.body.on ? 1 : 0, l.id); return {}; });
on('DELETE', '/t/links/:id', T, async (c) => { const l = await ownLink(c.user, c.p.id); await run('DELETE FROM links WHERE id = ?', l.id); return {}; });

on('GET', '/t/students/:id', T, async (c) => {
  const s = await ownStudent(c.user, c.p.id);
  const [r, u, parents] = await Promise.all([report(s.id, c.user), get('SELECT login FROM users WHERE id = ?', s.id),
    all('SELECT l.id link_id, l.camera, u.id, u.first, u.last, u.phone, u.login, u.photo IS NOT NULL has_photo, l.status FROM links l JOIN users u ON u.id = l.parent_id WHERE l.student_id = ? ORDER BY l.id', s.id)]);
  return { ...r, login: u.login, parents };
});
on('POST', '/t/users/:id/reset', T, async (c) => {
  const id = Number(c.p.id), target = (await get('SELECT id, login FROM users WHERE id = ?', id)) || missing();
  if (c.user.role === 'admin') { if (id === c.user.id) bad('Oʻz parolingizni sozlamalarda almashtiring.'); }
  else {
    // Oʻz oʻquvchisi yoki faqat shu oʻqituvchi tasdiqlagan ota-ona. Boshqa oʻqituvchiga ham bogʻliq ota-ona paroliga tegib boʻlmaydi.
    const x = await get(`SELECT EXISTS (SELECT 1 FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ?1 AND c.teacher_id = ?2) mine,
      COUNT(*) FILTER (WHERE c.teacher_id = ?2) ours, COUNT(*) FILTER (WHERE c.teacher_id <> ?2) others
      FROM links l JOIN students s ON s.id = l.student_id JOIN classes c ON c.id = s.class_id WHERE l.parent_id = ?1 AND l.status = 'approved'`, id, c.user.id);
    if (!x.mine && !(x.ours && !x.others)) deny();
  }
  const password = A.newPassword();
  await run('UPDATE users SET pass = ? WHERE id = ?', A.hash(password), id);
  await A.dropSessions(id);
  return { login: target.login, password };
});

/* -- jurnal -- */
on('GET', '/t/journal/:id', T, async (c) => {
  const k = await ownClass(c.user, c.p.id), date = V.date(c.q.get('date'));
  const [students, grades, cam] = await Promise.all([
    all(`SELECT u.id, u.first, u.last, s.photo IS NOT NULL has_photo, a.status attendance, a.source FROM students s JOIN users u ON u.id = s.id
      LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ? WHERE s.class_id = ? AND s.status = 'approved' ORDER BY u.last, u.first`, date, k.id),
    all(`SELECT g.student_id, g.kind, g.value, g.note FROM grades g JOIN students s ON s.id = g.student_id WHERE s.class_id = ? AND g.kind IN ('activity','behaviour') AND g.ref = ?`, k.id, date),
    all('SELECT a.student_id, SUM(samples) samples, SUM(seen) seen, SUM(attentive) attentive FROM activity a JOIN lessons l ON l.id = a.lesson_id WHERE l.class_id = ? AND l.date = ? GROUP BY 1', k.id, date),
  ]);
  return students.map((s) => ({ ...s, camera: pct(cam.find((x) => x.student_id === s.id)),
    grades: Object.fromEntries(grades.filter((g) => g.student_id === s.id).map((g) => [g.kind, { value: g.value, note: g.note }])) }));
});
async function saveGrade(sid, kind, ref, date, value, note, extra = {}) {
  if (value !== null && ![1, 2, 3, 4, 5].includes(value)) bad('Baho 1 dan 5 gacha boʻladi.');
  const n = String(note ?? '').trim().slice(0, 300);
  if (value === null && !n) { await run('DELETE FROM grades WHERE student_id = ? AND kind = ? AND ref = ?', sid, kind, ref); return; }
  await run(`INSERT INTO grades (student_id, kind, ref, date, value, note, updated) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT (student_id, kind, ref) DO UPDATE SET value = excluded.value, note = excluded.note, updated = excluded.updated`, sid, kind, ref, date, value, n, Date.now());
  if (value !== null) await notifyFamily(sid, `grade:${kind}:${ref}:${sid}`, 'grade', { kind, value, ...extra }, kind === 'homework' ? '#/homework' : '#/behaviour');
}
on('PUT', '/t/grade', T, async (c) => {
  const { kind, value, note } = c.body, s = await ownStudent(c.user, c.body.student_id);
  if (kind === 'homework') {
    const h = await ownHomework(c.user, c.body.homework_id);
    if (h.class_id !== s.class_id) deny();
    await saveGrade(s.id, kind, String(h.id), today(), value ?? null, note, { title: h.title });
  } else if (kind === 'activity' || kind === 'behaviour') {
    const d = V.date(c.body.date);
    if (d > today()) bad('Kelajak sanaga baho qoʻyib boʻlmaydi.');
    await saveGrade(s.id, kind, d, d, value ?? null, note);
  } else bad('Baho turi notoʻgʻri.');
  return {};
});
on('PUT', '/t/attendance', T, async (c) => {
  const s = await ownStudent(c.user, c.body.student_id), d = V.date(c.body.date), st = c.body.status;
  if (d > today()) bad('Kelajak sanaga davomat belgilab boʻlmaydi.');
  if (st === null) { await run('DELETE FROM attendance WHERE student_id = ? AND date = ?', s.id, d); return {}; }
  V.oneOf(st, ['present', 'late', 'absent'], 'status', 'Davomat holati');
  await run(`INSERT INTO attendance VALUES (?,?,?,'teacher') ON CONFLICT (student_id, date) DO UPDATE SET status = excluded.status, source = 'teacher'`, s.id, d, st);
  await notifyFamily(s.id, `att:${d}:${s.id}`, 'attendance', { status: st, date: d }, '#/attendance', false);
  return {};
});

/* -- uy vazifasi -- */
const roster = (classId) => all(`SELECT u.id, u.first, u.last, s.photo IS NOT NULL has_photo FROM students s JOIN users u ON u.id = s.id WHERE s.class_id = ? AND s.status = 'approved' ORDER BY u.last, u.first`, classId);
const group = (rows, key, pick) => { const m = {}; for (const r of rows) (m[r[key]] ??= {})[r.student_id] = pick(r); return m; };
on('GET', '/t/homework/:id', T, async (c) => {
  const k = await ownClass(c.user, c.p.id);
  const [students, items, grades] = await Promise.all([roster(k.id), all('SELECT * FROM homework WHERE class_id = ? ORDER BY due DESC, id DESC LIMIT 60', k.id),
    all(`SELECT g.ref, g.student_id, g.value, g.note FROM grades g JOIN homework h ON h.id::text = g.ref WHERE g.kind = 'homework' AND h.class_id = ?`, k.id)]);
  const by = group(grades, 'ref', ({ student_id, value, note }) => ({ student_id, value, note }));
  return { students, items: items.map((h) => ({ ...h, grades: by[h.id] || {} })) };
});
on('POST', '/t/homework', T, async (c) => {
  const k = await ownClass(c.user, c.body.class_id), title = V.text(c.body.title, 'title', 'Vazifa nomi', 2, 120), due = V.date(c.body.due, 'due');
  const id = await insert('INSERT INTO homework (class_id, title, details, due, created) VALUES (?,?,?,?,?)', k.id, title, V.text(c.body.details, 'details', 'Tavsif', 0, 1000), due, Date.now());
  await notifyClassFamilies(k.id, 'hw:' + id, 'homework', { title, due }, '#/homework');
  return { id };
});
on('DELETE', '/t/homework/:id', T, async (c) => {
  const h = await ownHomework(c.user, c.p.id);
  await tx(async () => { await run(`DELETE FROM grades WHERE kind = 'homework' AND ref = ?`, String(h.id)); await run('DELETE FROM homework WHERE id = ?', h.id); });
  return {};
});

/* -- testlar -- */
on('GET', '/t/assessments/:id', T, async (c) => {
  const k = await ownClass(c.user, c.p.id);
  const [students, items, results] = await Promise.all([roster(k.id), all('SELECT * FROM assessments WHERE class_id = ? ORDER BY date DESC, id DESC LIMIT 60', k.id),
    all('SELECT r.assessment_id, r.student_id, r.score, r.comment FROM results r JOIN assessments a ON a.id = r.assessment_id WHERE a.class_id = ?', k.id)]);
  const by = group(results, 'assessment_id', ({ student_id, score, comment }) => ({ student_id, score, comment }));
  return { students, items: items.map((a) => ({ ...a, results: by[a.id] || {} })) };
});
on('POST', '/t/assessments', T, async (c) => {
  const k = await ownClass(c.user, c.body.class_id);
  return { id: await insert('INSERT INTO assessments (class_id, title, skill, date) VALUES (?,?,?,?)', k.id, V.text(c.body.title, 'title', 'Test nomi', 2, 120),
    V.oneOf(c.body.skill, SKILLS, 'skill', 'Koʻnikma'), V.date(c.body.date, 'date')) };
});
on('DELETE', '/t/assessments/:id', T, async (c) => { await run('DELETE FROM assessments WHERE id = ?', (await ownAssessment(c.user, c.p.id)).id); return {}; });
on('PUT', '/t/result', T, async (c) => {
  const a = await ownAssessment(c.user, c.body.assessment_id), s = await ownStudent(c.user, c.body.student_id);
  if (a.class_id !== s.class_id) deny();
  if (c.body.score === null || c.body.score === '') { await run('DELETE FROM results WHERE assessment_id = ? AND student_id = ?', a.id, s.id); return {}; }
  const score = V.int(c.body.score, 'score', 'Natija', 0, 100);
  await run('INSERT INTO results VALUES (?,?,?,?) ON CONFLICT (assessment_id, student_id) DO UPDATE SET score = excluded.score, comment = excluded.comment', a.id, s.id, score, V.text(c.body.comment, 'comment', 'Izoh', 0, 300));
  await notifyFamily(s.id, `result:${a.id}:${s.id}`, 'result', { title: a.title, score }, '#/grades');
  return {};
});

/* -- fikrlar -- */
on('POST', '/t/feedback', T, async (c) => {
  const s = await ownStudent(c.user, c.body.student_id);
  const id = await insert('INSERT INTO feedback (student_id, teacher_id, text, created) VALUES (?,?,?,?)', s.id, c.user.id, V.text(c.body.text, 'text', 'Fikr', 3, 800), Date.now());
  await notifyFamily(s.id, 'fb:' + id, 'feedback', { teacher: `${c.user.first} ${c.user.last}` }, '#/feedback');
  return {};
});
on('DELETE', '/t/feedback/:id', T, async (c) => {
  const f = (await get('SELECT * FROM feedback WHERE id = ?', Number(c.p.id))) || missing();
  await ownStudent(c.user, f.student_id);
  await run('DELETE FROM feedback WHERE id = ?', f.id);
  return {};
});

/* -- jadval -- */
on('GET', '/t/schedule', T, (c) => { const [w, a] = scope(c.user); return all(`${scheduleSql} WHERE ${w} ORDER BY x.class_id, x.dow, x.start`, ...a); });
on('POST', '/t/schedule', T, async (c) => {
  const k = await ownClass(c.user, c.body.class_id), b = c.body;
  const start = V.time(b.start, 'start'), finish = V.time(b.finish, 'finish'), dow = V.int(b.dow, 'dow', 'Kun', 1, 7), subject = V.text(b.subject, 'subject', 'Dars', 2, 60);
  if (finish <= start) bad('Tugash vaqti boshlanishidan keyin boʻlsin.', 'finish');
  if (await get('SELECT 1 FROM schedule WHERE class_id = ? AND dow = ? AND start < ? AND finish > ?', k.id, dow, finish, start)) bad('Bu vaqtda sinfning boshqa darsi bor.', 'start');
  return { id: await insert('INSERT INTO schedule (class_id, dow, start, finish, subject, room_id) VALUES (?,?,?,?,?,?)', k.id, dow, start, finish, subject, await checkRoom(b.room_id)) };
});
on('DELETE', '/t/schedule/:id', T, async (c) => { await run('DELETE FROM schedule WHERE id = ?', (await ownSchedule(c.user, c.p.id)).id); return {}; });

/* -- jonli dars -- */
on('GET', '/t/faces/:id', ['teacher'], async (c) => (await all(`SELECT u.id, u.first, u.last, s.descriptor, s.photo IS NOT NULL has_photo FROM students s JOIN users u ON u.id = s.id
  WHERE s.class_id = ? AND s.status = 'approved' ORDER BY u.last, u.first`, (await ownClass(c.user, c.p.id)).id)).map((s) => ({ ...s, descriptor: s.descriptor ? JSON.parse(s.descriptor) : null })));
on('PUT', '/t/faces/:id', ['teacher'], async (c) => { const s = await ownStudent(c.user, c.p.id); await run('UPDATE students SET descriptor = ? WHERE id = ?', V.descriptor(c.body.descriptor), s.id); return {}; });
on('POST', '/t/lessons', ['teacher'], async (c) => {
  const k = await ownClass(c.user, c.body.class_id);
  if (k.room_id && !(await get('SELECT camera_on FROM rooms WHERE id = ?', k.room_id))?.camera_on) bad('Bu xona kamerasi admin tomonidan oʻchirilgan.');
  const open = await openLesson(k.id);
  if (open) return open;
  const topic = V.text(c.body.topic, 'topic', 'Dars mavzusi', 2, 120);
  const id = await insert('INSERT INTO lessons (class_id, topic, date, started) VALUES (?,?,?,?)', k.id, topic, today(), Date.now());
  await notifyClassFamilies(k.id, 'live:' + id, 'live', { topic, class: k.name }, '#/camera', false);
  return get('SELECT * FROM lessons WHERE id = ?', id);
});
on('POST', '/t/lessons/:id/end', T, async (c) => { await endLesson((await ownLesson(c.user, c.p.id)).id); return {}; });
