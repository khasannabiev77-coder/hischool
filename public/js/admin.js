/* Admin paneli. */
import { html, $, $$, api, state, toast, icon, field, select, onSubmit, head, card, empty, chip, avatar, full, stat, day, dayShort, monthName, ago, clock, phone, contact, confirmBox, formBox } from './ui.js';
import { line, columns } from './charts.js';
import { notificationsPage } from './common.js';
import { settingsPage } from './app.js';
import { journal, assessments, homework, schedule, studentPage, pendingCards, loadClasses, bindDo, bindReset, editClass } from './school.js';

export const tagline = () => 'Maktab boshqaruvi';
export async function init() { await loadClasses(); }

/* ---------- dashboard ---------- */
async function dashboard(ctx) {
  const [r] = await Promise.all([api('GET', '/a/overview'), loadClasses()]);
  if (!ctx.live()) return;
  const t = r.totals, maxOf = (rows, min) => Math.max(min, ...rows.map((x) => x.value || 0));
  const round = (v) => { const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p) * p; };
  const gMax = round(maxOf(r.growth, 4)), uMax = round(maxOf(r.users, 4)), int = (v) => String(Math.round(v));
  ctx.render(html`${head('Dashboard')}
    ${state.pending ? html`<a class="livebar wait" href="#/students">${icon('people')}<span><b>${state.pending} <span>ta soʻrov tasdiq kutmoqda</span></b></span><span class="btn small">Koʻrish</span></a>` : ''}
    ${t.reports ? html`<a class="livebar wait" href="#/cameras">${icon('flag')}<span><b>${t.reports} <span>ta kamera murojaati ochiq</span></b></span><span class="btn small">Koʻrish</span></a>` : ''}
    <div class="grid g3 stats">${stat('people', 'Jami oʻquvchilar', t.students, { sub: 'Roʻyxatdan oʻtgan' })}${stat('check', 'Faol oʻquvchilar', t.active, { sub: 'Tasdiqlangan' })}${stat('cap', 'Oʻqituvchilar', t.teachers, { sub: 'Maktab boʻyicha' })}${stat('book', 'Sinflar', t.classes, { sub: 'Maktab boʻyicha' })}${stat('calendar', 'Bugungi davomat', t.attendance, { suffix: '%', sub: 'Belgilangan oʻquvchilar' })}${stat('camera', 'Jonli kameralar', t.live, { sub: `${t.rooms} xona` })}</div>
    <div class="grid g2">${card('Oʻquvchilar oʻsishi', line(r.growth.map((x) => ({ label: monthName(x.label, true), full: monthName(x.label), value: x.value })), { max: gMax, fmt: int, label: 'Oʻquvchilar soni oylar boʻyicha', head: ['Oy', 'Oʻquvchi'] }))}
      ${card('Davomat', columns(r.attendance.map((x) => ({ label: dayShort(x.label), full: day(x.label), value: x.value })), { label: 'Kunlik davomat', head: ['Kun', 'Davomat'] }))}
      ${card('Oʻrtacha baho', line(r.grades.map((x) => ({ label: monthName(x.label, true), full: monthName(x.label), value: x.value })), { min: 1, max: 5, fmt: (v) => v.toFixed(1), label: 'Oylik oʻrtacha baho', head: ['Oy', 'Baho'] }))}
      ${card('Faol foydalanuvchilar', columns(r.users.map((x) => ({ label: dayShort(x.label), full: day(x.label), value: x.value })), { max: uMax, fmt: int, label: 'Kunlik faol foydalanuvchilar', head: ['Kun', 'Foydalanuvchi'] }))}</div>`);
}

/* ---------- odamlar ---------- */
const search = () => html`<label class="search">${icon('search', 18)}<span class="sr">Qidirish</span><input id="q" type="search" placeholder="Ism, login yoki telefon"></label>`;
function bindSearch(ctx) {
  $('#q')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase(), d = q.replace(/\D/g, '');
    $$('[data-s]', ctx.el).forEach((r) => { r.hidden = !(r.dataset.s.includes(q) || (d.length > 3 && r.dataset.s.includes(d))); });
  });
}
const key = (...x) => x.filter(Boolean).join(' ').toLowerCase();
const resetBtn = (u) => html`<button class="iconbtn sm" data-reset="${u.id}" data-name="${full(u)}" aria-label="Yangi parol" title="Yangi parol">${icon('key', 18)}</button>`;
const delBtn = (u, ask) => html`<button class="iconbtn sm" data-do="DELETE /a/users/${u.id}" data-title="Oʻchirilsinmi?" data-ask="${ask}" data-yes="Oʻchirish" aria-label="Oʻchirish" title="Oʻchirish">${icon('trash', 18)}</button>`;

async function students(ctx) {
  if (ctx.param) return studentPage(ctx);
  const [pend, list] = await Promise.all([pendingCards(), api('GET', '/a/students'), loadClasses()]);
  if (!ctx.live()) return;
  ctx.render(html`${head('Oʻquvchilar', '', search())}${pend}${card('', list.length ? html`<div class="scroll"><table class="tbl cards"><thead><tr><th>Oʻquvchi</th><th>Sinf</th><th>Daraja</th><th>Aloqa</th><th>Ota-ona raqami</th><th>Holat</th><th></th></tr></thead><tbody>${list.map((s) => html`<tr data-s="${key(s.first, s.last, s.login, s.phone, s.telegram, s.parent_phone, s.class_name)}"><td><a class="who" href="#/students/${s.id}">${avatar(s)}<span><b>${full(s)}</b><small>${s.login}</small></span></a></td><td data-l="Sinf">${s.class_name}</td><td data-l="Daraja">${chip(s.level, 'blue')}</td><td data-l="Aloqa">${contact(s)}</td><td data-l="Ota-ona raqami">${phone(s.parent_phone)}</td><td data-l="Holat">${s.status === 'approved' ? chip('Faol', 'good') : chip('Kutilmoqda', 'warn')}</td><td><div class="row tight nowrap">${resetBtn(s)}${delBtn(s, 'Oʻquvchining rasmi, baholari va kamera maʼlumotlari butunlay oʻchiriladi.')}</div></td></tr>`)}</tbody></table></div>` : empty('Hali oʻquvchi yoʻq.', 'people'))}`);
  bindSearch(ctx); bindDo(ctx); bindReset(ctx);
}
async function parents(ctx) {
  const list = await api('GET', '/a/parents');
  if (!ctx.live()) return;
  ctx.render(html`${head('Ota-onalar', '', search())}${card('', list.length ? html`<ul class="list">${list.map((p) => html`<li class="line wrap" data-s="${key(p.first, p.last, p.login, p.phone, ...p.links.map((l) => l.child_first + ' ' + l.child_last))}">${avatar(p)}<div><b>${full(p)}</b><small>${phone(p.phone)} · ${p.login}</small></div><div class="links">${p.links.map((l) => html`<p class="row tight">${l.student_id ? html`<a href="#/students/${l.student_id}">${l.first} ${l.last}</a><small>${l.class_name}</small>` : html`<span>${l.child_first} ${l.child_last}</span>`}${l.status === 'approved' ? html`<label class="switch"><input type="checkbox" data-cam="${l.id}" ${l.camera ? html`checked` : ''}><i></i><span>Kamera</span></label>` : l.student_id ? html`<button class="btn small" data-do="POST /t/links/${l.id}/approve" data-ask="Bu odam haqiqatan ota-onasi ekanini tekshirdingizmi?">Tasdiqlash</button>` : chip('Farzand topilmadi', 'warn')}</p>`)}</div><div class="row tight nowrap">${resetBtn(p)}${delBtn(p, 'Ota-ona hisobi butunlay oʻchiriladi.')}</div></li>`)}</ul>` : empty('Hali ota-ona yoʻq.', 'people'))}`);
  bindSearch(ctx); bindDo(ctx); bindReset(ctx);
  $$('[data-cam]').forEach((i) => i.addEventListener('change', async () => { try { await api('PUT', `/t/links/${i.dataset.cam}/camera`, { on: i.checked }); toast(i.checked ? 'Kameraga ruxsat berildi' : 'Kameraga ruxsat yopildi'); } catch (e) { i.checked = !i.checked; toast(e.message, 'err'); } }));
}
async function teachers(ctx) {
  const [list, { code }] = await Promise.all([api('GET', '/a/teachers'), api('GET', '/t/code')]);
  if (!ctx.live()) return;
  ctx.render(html`${head('Oʻqituvchilar', '', search())}${card('', html`<div class="line wrap"><span class="nic blue">${icon('key', 20)}</span><div><b class="mono">${code}</b><small>Oʻqituvchi roʻyxatdan oʻtishda shu kodni yozadi</small></div><button class="btn small ghost" data-copy="${code}">Nusxa olish</button><button class="btn small ghost" data-do="POST /a/code" data-title="Kod yangilansinmi?" data-ask="Eski kod bilan roʻyxatdan oʻtib boʻlmaydi." data-yes="Yangilash">Yangi kod</button></div>`)}
    ${list.length ? html`<div class="grid g3">${list.map((t) => html`<section class="card tmini" data-s="${key(t.first, t.last, t.login, t.phone)}"><div class="line">${avatar(t, 'lg')}<div><b>${full(t)}</b><small>${t.position || 'English Teacher'}</small><small>${phone(t.phone)} · ${t.login}</small></div></div><dl class="tstats"><div><dt>Tajriba</dt><dd>${t.experience ?? '–'}</dd></div><div><dt>Oʻquvchilar</dt><dd>${t.students}</dd></div><div><dt>Mamnun ota-onalar</dt><dd>${t.rating ? t.rating.pct + '%' : '–'}</dd></div></dl><p class="row tight">${t.classes.map((c) => chip(c, 'blue'))}</p><div class="row tight"><button class="btn small ghost" data-edit="${t.id}">Tahrirlash</button>${resetBtn(t)}${delBtn(t, 'Oʻqituvchi hisobi butunlay oʻchiriladi.')}</div></section>`)}</div>` : card('', empty('Hali oʻqituvchi yoʻq. Yuqoridagi kodni oʻqituvchiga bering.', 'cap'))}`);
  bindSearch(ctx); bindDo(ctx); bindReset(ctx);
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const t = list.find((x) => x.id === Number(b.dataset.edit));
    formBox('Oʻqituvchini tahrirlash', html`<div class="two">${field('first', 'Ism', { value: t.first })}${field('last', 'Familiya', { value: t.last })}</div>${field('position', 'Lavozim', { value: t.position, maxlength: 80 })}${field('experience', 'Tajriba (yil)', { type: 'number', value: t.experience, min: 0, max: 60 })}`, 'Saqlash', async (v) => { await api('PATCH', `/a/users/${t.id}`, v); ctx.refresh(); });
  }));
}

/* ---------- sinflar va xonalar ---------- */
async function classes(ctx) {
  const [list] = await Promise.all([api('GET', '/a/teachers'), loadClasses()]);
  if (!ctx.live()) return;
  ctx.render(html`${head('Sinflar', '', html`<button class="btn" id="add" ${list.length ? '' : html`disabled`}>${icon('plus', 20)} <span>Sinf ochish</span></button>`)}${card('', state.classes.length ? html`<div class="scroll"><table class="tbl cards"><thead><tr><th>Sinf</th><th>Kurs</th><th>Oʻqituvchi</th><th>Xona</th><th>Oʻquvchilar</th><th></th></tr></thead><tbody>${state.classes.map((c) => html`<tr><td><b>${c.name}</b> ${c.live?.streaming ? chip('LIVE', 'bad') : ''}</td><td data-l="Kurs">${c.course || '–'}</td><td data-l="Oʻqituvchi">${c.teacher}</td><td data-l="Xona">${c.room || '–'}</td><td data-l="Oʻquvchilar">${c.students}</td><td><div class="row tight nowrap"><button class="iconbtn sm" data-edit="${c.id}" aria-label="Tahrirlash">${icon('edit', 18)}</button><button class="iconbtn sm" data-do="DELETE /t/classes/${c.id}" data-title="Sinf oʻchirilsinmi?" data-ask="Boʻsh sinf roʻyxatdan oʻchadi." data-yes="Oʻchirish" aria-label="Oʻchirish">${icon('trash', 18)}</button></div></td></tr>`)}</tbody></table></div>` : empty('Hali sinf yoʻq.', 'cap'))}`);
  bindDo(ctx);
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => editClass(ctx, state.classes.find((c) => c.id === Number(b.dataset.edit)), list)));
  $('#add').addEventListener('click', () => formBox('Sinf ochish', html`${field('name', 'Sinf nomi', { placeholder: '8-B', cap: 'characters', maxlength: 16 })}${field('course', 'Kurs', { placeholder: 'English Intermediate', maxlength: 60 })}${select('teacher_id', 'Oʻqituvchi', list.map((t) => [t.id, full(t)]))}`, 'Ochish', async (v) => { await api('POST', '/t/classes', v); ctx.refresh(); }));
}
async function rooms(ctx) {
  const list = await api('GET', '/a/rooms');
  if (!ctx.live()) return;
  ctx.render(html`${head('Xonalar')}<div class="grid split rev">${card('Yangi xona', html`<form id="add">${field('name', 'Xona nomi', { placeholder: 'Classroom 203', maxlength: 40 })}<button class="btn" type="submit">Qoʻshish</button></form><p class="fine">Xonani sinfga «Sinflar» boʻlimida biriktirasiz.</p>`)}${card('Xonalar roʻyxati', list.length ? html`<ul class="list">${list.map((r) => html`<li class="line wrap"><span class="nic blue">${icon("room", 20)}</span><div><b>${r.name}</b><small>${r.classes.join(', ') || '–'}</small></div>${r.camera_on ? chip('Kamera ruxsat etilgan', 'good') : chip('Kamera yopiq', 'bad')}<button class="iconbtn sm" data-do="DELETE /a/rooms/${r.id}" data-title="Xona oʻchirilsinmi?" data-ask="Sinf va jadvaldagi xona belgisi olib tashlanadi." data-yes="Oʻchirish" aria-label="Oʻchirish">${icon('trash', 18)}</button></li>`)}</ul>` : empty('Hali xona qoʻshilmagan.', 'room'))}</div>`);
  bindDo(ctx);
  onSubmit($('#add'), async (v) => { await api('POST', '/a/rooms', v); ctx.refresh(); });
}

/* ---------- kameralar ---------- */
async function cameras(ctx) {
  const r = await api('GET', '/a/cameras');
  if (!ctx.live()) return;
  ctx.render(html`${head('Kameralar', 'Ruxsat, holat va koʻrishlar jurnali')}
    ${card('Hozirgi darslar', r.live.length ? html`<ul class="list">${r.live.map((l) => html`<li class="line wrap"><span class="nic ${l.streaming ? 'bad' : ''}">${icon('camera', 20)}</span><div><b>${l.class_name}: ${l.topic}</b><small>${l.teacher} · ${l.room || '–'} · ${clock(l.started)}</small></div>${l.streaming ? chip('LIVE', 'bad') : chip('Kamera ulanmagan')}<span class="muted row tight">${icon('eye', 18)} ${l.viewers}</span><button class="btn small ghost" data-do="POST /t/lessons/${l.id}/end" data-title="Dars toʻxtatilsinmi?" data-ask="Ota-onalar uchun translyatsiya toʻxtaydi." data-yes="Toʻxtatish">Toʻxtatish</button></li>`)}</ul>` : empty('Hozir jonli dars yoʻq.', 'camera'))}
    <div class="grid g2 atop">${card('Xona kameralari', r.rooms.length ? html`<ul class="list">${r.rooms.map((x) => html`<li class="line"><div><b>${x.name}</b><small>${x.classes.map((c) => c.name).join(', ') || '–'}</small></div><label class="switch"><input type="checkbox" data-room="${x.id}" ${x.camera_on ? html`checked` : ''}><i></i><span>Ruxsat</span></label></li>`)}</ul>` : empty('Hali xona qoʻshilmagan.', 'room'))}
      ${card('Murojaatlar', r.reports.length ? html`<ul class="list">${r.reports.map((p) => html`<li class="line wrap"><div><b>${p.class_name}</b><p>${p.text}</p><small>${p.name}, ${phone(p.phone)} · ${ago(p.at)}</small></div>${p.resolved ? chip('Hal qilindi', 'good') : html`<button class="btn small" data-do="POST /a/reports/${p.id}/resolve">Hal qilindi</button>`}</li>`)}</ul>` : empty('Murojaat yoʻq.', 'flag'))}</div>
    ${card('Koʻrishlar jurnali', r.views.length ? html`<div class="scroll"><table class="tbl cards"><thead><tr><th>Ota-ona</th><th>Sinf</th><th>Dars</th><th>Vaqt</th></tr></thead><tbody>${r.views.map((v) => html`<tr><td data-l="Ota-ona"><b>${v.name}</b></td><td data-l="Sinf">${v.class_name}</td><td data-l="Dars">${v.topic}</td><td data-l="Vaqt">${ago(v.at)}</td></tr>`)}</tbody></table></div>` : empty('Hali hech kim koʻrmagan.', 'eye'))}`);
  bindDo(ctx);
  $$('[data-room]').forEach((i) => i.addEventListener('change', async () => { try { await api('PUT', `/a/rooms/${i.dataset.room}/camera`, { on: i.checked }); toast(i.checked ? 'Kameraga ruxsat berildi' : 'Kameraga ruxsat yopildi'); } catch (e) { i.checked = !i.checked; toast(e.message, 'err'); } }));
}

/* ---------- xabarlar ---------- */
async function notifications(ctx) {
  const [msgs] = await Promise.all([api('GET', '/a/messages'), loadClasses()]);
  if (!ctx.live()) return;
  await notificationsPage(ctx, html`<div class="grid g2 atop">${card('Xabar yuborish', html`<form id="send">${select('to', 'Kimga', [['all', 'Hammaga'], ['parent', 'Ota-onalarga'], ['student', 'Oʻquvchilarga'], ['teacher', 'Oʻqituvchilarga'], ...state.classes.map((c) => [`class:${c.id}`, c.name])])}${field('title', 'Sarlavha', { maxlength: 100 })}${field('text', 'Matn', { type: 'textarea', maxlength: 600 })}<button class="btn" type="submit">${icon('send', 18)} <span>Yuborish</span></button></form>`)}
    ${card('Saytdan kelgan xabarlar', msgs.length ? html`<ul class="list">${msgs.map((m) => html`<li class="line wrap"><div><b>${m.name}</b><p class="pre">${m.text}</p><small><a href="tel:+998${m.phone}">${phone(m.phone)}</a> · ${ago(m.at)}</small></div><button class="iconbtn sm" data-do="DELETE /a/messages/${m.id}" data-title="Xabar oʻchirilsinmi?" data-ask="Xabar butunlay oʻchadi." data-yes="Oʻchirish" aria-label="Oʻchirish">${icon('trash', 18)}</button></li>`)}</ul>` : empty('Hali xabar yoʻq.', 'mail'))}</div>`, () => {
    bindDo(ctx);
    onSubmit($('#send'), async (v) => {
      if (!await confirmBox('Xabar yuborilsinmi?', v.title, 'Yuborish', false)) return;
      await api('POST', '/a/notify', v); toast('Xabar yuborildi'); ctx.refresh();
    });
  });
}

export const bottom = () => ['dashboard', 'students', 'cameras', 'schedule', 'settings'];
export const pages = () => [
  { id: 'dashboard', uz: 'Dashboard', short: 'Bosh', icon: 'home', page: dashboard },
  { id: 'students', uz: 'Oʻquvchilar', short: 'Oʻquvchi', icon: 'child', page: students, badge: () => state.pending || '' },
  { id: 'parents', uz: 'Ota-onalar', icon: 'people', page: parents },
  { id: 'teachers', uz: 'Oʻqituvchilar', icon: 'cap', page: teachers },
  { id: 'classes', uz: 'Sinflar', icon: 'book', page: classes },
  { id: 'attendance', uz: 'Davomat', icon: 'calendar', page: journal('Davomat', 'attendance') },
  { id: 'grades', uz: 'Baholar', icon: 'chart', page: assessments },
  { id: 'discipline', uz: 'Intizom', icon: 'star', page: journal('Intizom', 'behaviour') },
  { id: 'homework', uz: 'Uy vazifalari', icon: 'edit', page: homework },
  { id: 'schedule', uz: 'Dars jadvali', short: 'Jadval', icon: 'clock', page: schedule },
  { id: 'rooms', uz: 'Xonalar', icon: 'room', page: rooms },
  { id: 'cameras', uz: 'Kameralar', short: 'Kamera', icon: 'camera', page: cameras },
  { id: 'notifications', uz: 'Bildirishnomalar', icon: 'bell', page: notifications },
  { id: 'settings', uz: 'Sozlamalar', short: 'Profil', icon: 'gear', page: (ctx) => settingsPage(ctx) },
];
