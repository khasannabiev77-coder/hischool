/* Namuna maʼlumotlar bilan ishga tushirish. Haqiqiy bazaga (data/) tegmaydi. */
import path from 'node:path';
process.env.HS_DATA ||= path.resolve(import.meta.dirname, '..', 'data-demo');
process.env.PORT ||= '3100';
process.env.HOST ||= '127.0.0.1'; // namuna parollari ochiq, shuning uchun faqat shu kompyuterda

const { run, get, insert, tx, today, daysAgo, nameKey } = await import('../server/db.js');
const { hash } = await import('../server/auth.js');

if (await get(`SELECT 1 FROM users WHERE login NOT LIKE 'DEMO-%'`)) {
  console.error('Bu papkada haqiqiy foydalanuvchilar bor. Namuna uchun boshqa HS_DATA papkasini koʻrsating.');
  process.exit(1);
}
if (!await get('SELECT 1 FROM rooms')) {
  const pass = hash('demo-demo'), now = Date.now();
  const ins = insert;
  let seed = 7; // har safar bir xil namuna chiqishi uchun
  const rnd = (a, b) => { seed = (seed * 16807) % 2147483647; return a + (seed % (b - a + 1)); };
  const chance = (p) => rnd(1, 100) <= p;
  const user = (role, login, first, last, phone, days = 150) => ins('INSERT INTO users (role, login, pass, first, last, phone, created) VALUES (?,?,?,?,?,?,?)', role, login, pass, first, last, phone, now - days * 864e5);
  await tx(async () => {
    await user('admin', 'DEMO-A', 'Hischool', 'Admin', null);
    const t = await user('teacher', 'DEMO-T', 'John', 'Smith', '901112233'), t2 = await user('teacher', 'DEMO-T2', 'Dilnoza', 'Karimova', '901112244');
    await run(`UPDATE users SET position = 'Senior English Teacher', experience = 8, public = 1, bio = 'Speaking va Grammar boʻyicha mutaxassis. Darslarda har bir oʻquvchi gapirishi uchun vaqt ajratadi.' WHERE id = ?`, t);
    await run(`UPDATE users SET position = 'English Teacher', experience = 5, public = 1, bio = 'Boshlangʻich daraja va bolalar guruhlari bilan ishlaydi.' WHERE id = ?`, t2);
    const rooms = [];
    for (const n of ['Classroom 203', 'Classroom 204', 'Classroom 105']) rooms.push(await ins('INSERT INTO rooms (name) VALUES (?)', n));
    const cls = await ins('INSERT INTO classes (name, teacher_id, course, room_id) VALUES (?,?,?,?)', 'Intermediate-1', t, 'English Intermediate', rooms[0]);
    const cls2 = await ins('INSERT INTO classes (name, teacher_id, course, room_id) VALUES (?,?,?,?)', 'Elementary-2', t2, 'English Elementary', rooms[1]);
    const mk = async (list, c, off) => {
      const ids = [];
      for (const [i, [f, l]] of list.entries()) {
      const id = await user('student', off + i === 0 ? 'DEMO-S' : `DEMO-S${off + i + 1}`, f, l, `93000${String(off + i).padStart(4, '0')}`, 20 + ((off + i) * 23) % 140);
      await run('INSERT INTO students (id, class_id, address, parent_phone, name_key, status, level) VALUES (?,?,?,?,?,?,?)', id, off + i === 7 ? null : c, 'Toshkent, Chilonzor 9', `97000${String(off + i).padStart(4, '0')}`, nameKey(f, l), off + i === 7 ? 'pending' : 'approved', c === cls ? 'B1' : 'A2');
      ids.push(id);
      }
      return ids;
    };
    const a = await mk([['Azizbek', 'Karimov'], ['Madina', 'Rahimova'], ['Jasur', 'Toʻrayev'], ['Sevara', 'Yusupova'], ['Bekzod', 'Nazarov'], ['Zilola', 'Qodirova'], ['Sardor', 'Aliyev'], ['Nilufar', 'Ergasheva']], cls, 0);
    const b = await mk([['Kamron', 'Saidov'], ['Laylo', 'Hamidova'], ['Otabek', 'Rasulov'], ['Shahzoda', 'Olimova']], cls2, 8);
    const parent = async (login, f, l, ph, sid, kid, st = 'approved') => { const p = await user('parent', login, f, l, ph); await run('INSERT INTO links (parent_id, student_id, child_first, child_last, name_key, status) VALUES (?,?,?,?,?,?)', p, sid, kid[0], kid[1], nameKey(...kid), st); return p; };
    const p = await parent('DEMO-P', 'Dilshod', 'Karimov', '970000000', a[0], ['Azizbek', 'Karimov']);
    const p2 = await parent('DEMO-P2', 'Gulnora', 'Rahimova', '970000001', a[1], ['Madina', 'Rahimova'], 'pending');
    const p3 = await parent('DEMO-P3', 'Umida', 'Toʻrayeva', '970000002', a[2], ['Jasur', 'Toʻrayev']);
    for (const x of [p, p3]) await run('INSERT INTO ratings VALUES (?,?,?)', x, t, 5);

    const all = [...a.slice(0, 7), ...b], strong = new Set([a[0], a[1], b[1]]);
    for (let d = 100; d >= 0; d--) {
      const date = daysAgo(d), dow = new Date(now - d * 864e5).getDay();
      if (![1, 3, 5].includes(dow) && d !== 0) continue;
      for (const k of all) {
        const bad = strong.has(k) ? 2 : 6, r = rnd(1, 100), st = r <= bad ? 'absent' : r <= bad + 4 ? 'late' : 'present';
        await run('INSERT INTO attendance VALUES (?,?,?,?)', k, date, st, 'teacher');
        if (st === 'absent') continue;
        const lo = strong.has(k) ? 4 : 3 + (d < 40 ? 1 : 0);
        for (const kind of ['activity', 'behaviour']) if (chance(60)) await run('INSERT INTO grades (student_id, kind, ref, date, value, note, updated) VALUES (?,?,?,?,?,?,?)', k, kind, date, date, Math.max(chance(78) ? 5 : 4, lo) - (strong.has(k) || chance(60) ? 0 : 1), kind === 'activity' && chance(12) ? 'Savollarga faol javob berdi' : '', now - d * 864e5);
      }
    }
    for (const [i, topic] of ['Present Perfect', 'Seasons', 'Travelling', 'Reading: London', 'Irregular verbs', 'At the market', 'Conditionals', 'Revision'].entries()) {
      const d = (7 - i) * 2 + 1, at = now - d * 864e5;
      const lid = await ins('INSERT INTO lessons (class_id, topic, date, started, ended) VALUES (?,?,?,?,?)', cls, topic, daysAgo(d), at - 27e5, at);
      for (const [n, k] of a.slice(0, 7).entries()) { const seen = rnd(82, 98); await run('INSERT INTO activity VALUES (?,?,0,100,?,?)', lid, k, seen, Math.min(seen, 64 + i * 2 - n + rnd(-6, 8) + (strong.has(k) ? 8 : 0))); }
    }
    const skills = ['grammar', 'vocabulary', 'speaking', 'listening', 'reading', 'writing'], base = { grammar: 92, vocabulary: 95, speaking: 88, listening: 94, reading: 91, writing: 89 };
    for (let m = 5; m >= 0; m--) for (const [i, sk] of skills.entries()) {
      if (m > 2 && i > 2) continue;
      const d = Math.max(1, m * 30 - i * 2 + 4), id = await ins('INSERT INTO assessments (class_id, title, skill, date) VALUES (?,?,?,?)', cls, `Unit ${6 - m} · ${sk[0].toUpperCase() + sk.slice(1)} test`, sk, daysAgo(d));
      for (const k of a.slice(0, 7)) await run('INSERT INTO results VALUES (?,?,?,?)', id, k, Math.max(35, Math.min(100, base[sk] - m * 5 - (strong.has(k) ? 0 : 12) + rnd(-3, 3))), strong.has(k) && m === 0 ? 'Juda yaxshi natija' : '');
    }
    for (let i = 0; i < 24; i++) {
      const due = daysAgo(66 - i * 3), id = await ins('INSERT INTO homework (class_id, title, details, due, created) VALUES (?,?,?,?,?)', cls, ['Workbook, page ' + (20 + i) + ', ex. 3', 'Learn the new words (Unit ' + (1 + (i % 6)) + ')', 'Write 8 sentences about your weekend'][i % 3], i % 3 === 2 ? 'Use Past Simple.' : '', due, now - (70 - i * 3) * 864e5);
      if (due > today()) continue;
      for (const k of a.slice(0, 7)) if (chance(strong.has(k) ? 94 : 80)) await run('INSERT INTO grades (student_id, kind, ref, date, value, note, updated) VALUES (?,?,?,?,?,?,?)', k, 'homework', String(id), due, strong.has(k) ? rnd(4, 5) : rnd(3, 5), '', now);
    }
    const plan = [['English Grammar', 'Speaking', 'Vocabulary'], ['Listening', 'Reading'], ['English Grammar', 'Writing', 'Speaking'], ['Listening', 'Vocabulary'], ['English Grammar', 'Reading', 'Speaking'], ['Speaking club']];
    for (const [dow, subs] of plan.entries()) for (const [i, s] of subs.entries()) await ins('INSERT INTO schedule (class_id, dow, start, finish, subject) VALUES (?,?,?,?,?)', cls, dow + 1, `${String(9 + i).padStart(2, '0')}:00`, `${String(9 + i).padStart(2, '0')}:45`, s);
    for (const [dow, s] of [[1, 'English Grammar'], [3, 'Vocabulary'], [5, 'Speaking']]) await ins('INSERT INTO schedule (class_id, dow, start, finish, subject) VALUES (?,?,?,?,?)', cls2, dow, '14:00', '14:45', s);
    for (const [text, d] of [['Bugungi darsda faol qatnashdi va barcha topshiriqlarni vaqtida bajardi.', 0.1], ['Speaking boʻyicha katta oʻsish bor. Uyda har kuni 10 daqiqa ovoz chiqarib oʻqish tavsiya qilinadi.', 5], ['Yangi soʻzlarni tez oʻzlashtiryapti. Yozma ishda artikllarga eʼtibor beramiz.', 14]].reverse())
      await ins('INSERT INTO feedback (student_id, teacher_id, text, created) VALUES (?,?,?,?)', a[0], t, text, Math.round(now - d * 864e5));
    const note = (uid, key, type, data, link, h, read = 0) => run('INSERT INTO notifications (user_id, key, type, data, link, created, read) VALUES (?,?,?,?,?,?,?)', uid, key, type, JSON.stringify(data), link, now - h * 3600e3, read);
    await note(p, 'n1', 'attendance', { name: 'Azizbek', status: 'present', date: today() }, '#/attendance', 1);
    await note(p, 'n2', 'result', { name: 'Azizbek', title: 'Unit 6 · Vocabulary test', score: 95 }, '#/grades', 3);
    await note(p, 'n3', 'feedback', { name: 'Azizbek', teacher: 'John Smith' }, '#/feedback', 4);
    await note(p, 'n4', 'homework', { name: 'Azizbek', title: 'Write 8 sentences about your weekend', due: today() }, '#/homework', 28, 1);
    await run(`UPDATE users SET status = 'pending' WHERE login IN ('DEMO-S8', 'DEMO-P2')`);
    for (let d = 13; d >= 0; d--) for (const u of [p, p2, p3, t, t2, ...all]) if (chance(58)) await run('INSERT INTO visits VALUES (?,?) ON CONFLICT DO NOTHING', u, daysAgo(d));
  });
}
console.log('\n  NAMUNA rejimi. Parol hammasida: demo-demo\n  Admin: DEMO-A   Oʻqituvchi: DEMO-T   Ota-ona: DEMO-P   Oʻquvchi: DEMO-S');
await import('../server/index.js');
