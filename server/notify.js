/* Bildirishnomalar. Matn emas, tur va maʼlumot saqlanadi: har kim oʻz tilida oʻqiydi. */
import { all, get, run, today } from './db.js';
import { sendUser } from './live.js';

export const familyOf = (sid) => all(`SELECT parent_id id FROM links WHERE student_id = ? AND status = 'approved'`, sid).map((r) => r.id);

/** Bir xil kalitli xabar yangilanadi, shuning uchun baho tuzatilsa roʻyxat toʻlib ketmaydi. */
export function notify(userId, key, type, data = {}, link = '') {
  run(`INSERT INTO notifications (user_id, key, type, data, link, created) VALUES (?,?,?,?,?,?)
    ON CONFLICT (user_id, key) DO UPDATE SET data = excluded.data, created = excluded.created, read = 0`,
  userId, key, type, JSON.stringify(data), link, Date.now());
  run(`DELETE FROM notifications WHERE user_id = ?1 AND id NOT IN (SELECT id FROM notifications WHERE user_id = ?1 ORDER BY created DESC LIMIT 100)`, userId);
  sendUser(userId, { t: 'notif', type, data, link });
}
export function notifyFamily(sid, key, type, data, link, withStudent = true) {
  const s = get('SELECT first FROM users WHERE id = ?', sid);
  for (const id of familyOf(sid)) notify(id, key, type, { name: s.first, ...data }, link);
  if (withStudent) notify(sid, key, type, { name: s.first, ...data }, link);
}
export function notifyClassFamilies(classId, key, type, data, link, withStudent = true) {
  for (const s of all(`SELECT id FROM students WHERE class_id = ? AND status = 'approved'`, classId)) notifyFamily(s.id, `${key}:${s.id}`, type, data, link, withStudent);
}

/** Jadvaldagi dars boshlanishiga 10 daqiqa qolganda xabar beradi. */
function upcoming() {
  const at = new Date(Date.now() + 10 * 60000);
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const date = today(at);
  for (const x of all('SELECT * FROM schedule WHERE dow = ? AND start = ?', at.getDay() || 7, time)) {
    const key = `soon:${x.id}:${date}`;
    if (get('SELECT 1 FROM notifications WHERE key LIKE ? LIMIT 1', key + ':%')) continue;
    notifyClassFamilies(x.class_id, key, 'soon', { subject: x.subject, time: x.start }, '#/schedule');
  }
}
setInterval(() => { try { upcoming(); } catch (e) { console.error(e); } }, 20000).unref();
