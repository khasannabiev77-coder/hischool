/* Bildirishnomalar. Matn emas, tur va maʼlumot saqlanadi: har kim oʻz tilida oʻqiydi. */
import { all, get, local, run } from './db.js';

export const familyOf = async (sid) => (await all(`SELECT parent_id id FROM links WHERE student_id = ? AND status = 'approved'`, sid)).map((r) => r.id);

/** Bir xil kalitli xabar yangilanadi, shuning uchun baho tuzatilsa roʻyxat toʻlib ketmaydi. */
export async function notifyMany(rows) {
  const unique = [...new Map(rows.map((r) => [`${r.user_id}|${r.key}`, r])).values()];
  if (!unique.length) return;
  await run(`INSERT INTO notifications (user_id, key, type, data, link, created)
    SELECT user_id, key, type, data, link, ?::bigint FROM json_to_recordset(?::json) AS x(user_id int, key text, type text, data text, link text)
    ON CONFLICT (user_id, key) DO UPDATE SET data = excluded.data, created = excluded.created, read = 0`,
  Date.now(), JSON.stringify(unique.map((r) => ({ ...r, data: JSON.stringify(r.data || {}), link: r.link || '' }))));
}
export const notify = (userId, key, type, data = {}, link = '') => notifyMany([{ user_id: userId, key, type, data, link }]);

const kidsAndParents = (where, arg) => all(`SELECT s.id sid, u.first, l.parent_id FROM students s JOIN users u ON u.id = s.id
  LEFT JOIN links l ON l.student_id = s.id AND l.status = 'approved' WHERE ${where}`, arg);
async function toFamilies(rows, key, type, data, link, withStudent) {
  await notifyMany(rows.flatMap((r) => [r.parent_id, withStudent && r.sid].filter(Boolean).map((id) => ({ user_id: id, key: key(r.sid), type, data: { name: r.first, ...data }, link }))));
}
export const notifyFamily = async (sid, key, type, data, link, withStudent = true) => toFamilies(await kidsAndParents('s.id = ?', sid), () => key, type, data, link, withStudent);
export const notifyClassFamilies = async (classId, key, type, data, link, withStudent = true) =>
  toFamilies(await kidsAndParents(`s.status = 'approved' AND s.class_id = ?`, classId), (sid) => `${key}:${sid}`, type, data, link, withStudent);

/** Jadvaldagi dars boshlanishiga 10 daqiqa qolganda xabar. Ilova ochiq boʻlganda tekshiriladi. */
async function soon(u) {
  const now = local(), end = local(new Date(Date.now() + 10 * 60000));
  if (end.date !== now.date) return;
  const mine = u.role === 'student' ? 's.id = ?' : `s.id IN (SELECT student_id FROM links WHERE parent_id = ? AND status = 'approved')`;
  await run(`INSERT INTO notifications (user_id, key, type, data, link, created)
    SELECT ?, 'soon:' || x.id || ':' || ?::text, 'soon', json_build_object('subject', x.subject, 'time', x.start)::text, '#/schedule', ?::bigint
    FROM schedule x WHERE x.dow = ? AND x.start > ? AND x.start <= ? AND x.class_id IN (SELECT s.class_id FROM students s WHERE ${mine} AND s.status = 'approved')
    ON CONFLICT (user_id, key) DO NOTHING`, u.id, now.date, Date.now(), now.dow, now.time, end.time, u.id);
}

/** Davriy soʻrov: oʻqilmaganlar soni, yangi xabarlar va jonli darslar holati. */
export async function poll(u, since) {
  if (u.role === 'parent' || u.role === 'student') await soon(u);
  const [count, fresh, live] = await Promise.all([
    get('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read = 0', u.id),
    since ? all('SELECT type, data, link, created FROM notifications WHERE user_id = ? AND created > ? ORDER BY created LIMIT 5', u.id, since) : [],
    u.role === 'parent' ? all(`SELECT DISTINCT l.id FROM lessons l JOIN students s ON s.class_id = l.class_id JOIN links k ON k.student_id = s.id
      WHERE k.parent_id = ? AND k.status = 'approved' AND l.ended IS NULL AND l.started > ? ORDER BY l.id`, u.id, Date.now() - 4 * 3600e3) : [],
  ]);
  return { unread: count.n, fresh: fresh.map((n) => ({ ...n, data: JSON.parse(n.data) })), live: live.map((l) => l.id).join(','), now: Date.now() };
}
