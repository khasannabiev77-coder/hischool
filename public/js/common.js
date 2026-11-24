/* Bir nechta rol ishlatadigan boʻlaklar: bildirishnoma, jadval, oʻqituvchi kartasi, baholar. */
import { html, $$, api, state, icon, head, card, empty, chip, mark, avatar, full, day, ago, KIND, SKILL, ATT, ATT_TONE, DAYS, today, toast, phone } from './ui.js';
import { tr } from './i18n.js';

/** Bildirishnoma matni foydalanuvchi tilida yigʻiladi. */
export function describe({ type, data: d }) {
  const t = (s) => Object.entries(d).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, v), tr(s));
  switch (type) {
    case 'attendance': return { icon: 'calendar', tone: ATT_TONE[d.status], text: t({ present: '{name} bugungi English darsiga qatnashdi.', late: '{name} darsga kechikib keldi.', absent: '{name} bugungi darsda qatnashmadi.' }[d.status]).replace(/^(.*)$/, (x) => (d.date && d.date !== today() ? `${day(d.date)}: ${x}` : x)) };
    case 'grade': return { icon: 'star', tone: 'blue', text: `${d.name}: ${tr(KIND[d.kind])}${d.title ? ` (${d.title})` : ''} – ${d.value}` };
    case 'result': return { icon: 'chart', tone: 'blue', text: `${t('{name}: yangi test natijasi qoʻshildi.')} ${d.title}, ${d.score}%` };
    case 'feedback': return { icon: 'chat', tone: 'blue', text: t('{teacher} yangi fikr yubordi.') };
    case 'homework': return { icon: 'book', tone: 'blue', text: `${t('Yangi uy vazifasi')}: ${d.title}` };
    case 'live': return { icon: 'camera', tone: 'bad', text: `${t('Jonli dars boshlandi')}: ${d.topic}` };
    case 'soon': return { icon: 'clock', tone: 'warn', text: `${t('Bugungi dars 10 daqiqadan keyin boshlanadi.')} ${d.subject}, ${d.time}` };
    case 'approved': return { icon: 'check', tone: 'good', text: t('{name} {class} sinfiga qabul qilindi.') };
    case 'linked': return { icon: 'check', tone: 'good', text: t('{name} profilingizga ulandi.') };
    case 'level': return { icon: 'up', tone: 'good', text: t('{name} darajasi endi {level}.') };
    case 'request': return { icon: 'people', tone: 'warn', text: t(d.kind === 'parent' ? 'Ota-ona soʻrovi: {name}' : 'Yangi oʻquvchi: {name}') };
    case 'camreport': return { icon: 'flag', tone: 'warn', text: t('{class} kamerasi haqida murojaat: {name}') };
    case 'contact': return { icon: 'mail', tone: 'blue', text: t('Saytdan yangi xabar: {name}') };
    case 'message': return { icon: 'bell', tone: 'blue', text: d.title, more: d.text };
    default: return { icon: 'bell', tone: '', text: type };
  }
}
export const notifList = (list) => (list.length ? html`<ul class="notifs">${list.map((n) => { const x = describe(n); return html`<li class="${n.read ? '' : 'new'}"><a href="${n.link || '#/notifications'}"><span class="nic ${x.tone}">${icon(x.icon, 20)}</span><span><b>${x.text}</b>${x.more ? html`<span class="more">${x.more}</span>` : ''}<small>${ago(n.created)}</small></span></a></li>`; })}</ul>` : empty('Hali bildirishnoma yoʻq.', 'bell'));

export async function notificationsPage(ctx, extra = '', bind) {
  const list = await api('GET', '/notifications');
  if (!ctx.live()) return;
  ctx.render(html`${head('Bildirishnomalar')}${extra}${card('', notifList(list))}`);
  bind?.();
  if (list.some((n) => !n.read)) await api('POST', '/notifications/read');
  state.user.unread = 0;
  $$('[data-bell]').forEach((b) => { b.hidden = true; });
  ctx.onLeave(state.bus.on((m) => { if (m.t === 'notif') ctx.refresh(); }));
}

/* ---------- jadval ---------- */
const nowTime = () => new Date().toTimeString().slice(0, 5);
export const todayDow = () => new Date().getDay() || 7;
export function lessonStatus(x) {
  if (x.dow !== todayDow()) return null;
  const n = nowTime();
  return n < x.start ? ['Kutilmoqda', ''] : n < x.finish ? ['Hozir', 'live'] : ['Tugadi', 'done'];
}
const slot = (x, del) => { const s = lessonStatus(x); return html`<div class="slot ${s?.[1] || ''}"><div class="slot-t"><b>${x.start}</b><span>${x.finish}</span></div><div class="slot-b"><b>${x.subject}</b><small>${x.teacher}</small><small>${x.room || 'Xona belgilanmagan'}${del ? ` · ${x.class_name}` : ''}</small></div>${s ? chip(s[0], s[1] === 'live' ? 'bad' : s[1] === 'done' ? 'good' : 'blue') : ''}${del ? html`<button class="iconbtn sm" data-delslot="${x.id}" aria-label="Darsni oʻchirish">${icon('trash', 18)}</button>` : ''}</div>`; };
export const week = (rows, del = false) => html`<div class="week">${DAYS.map((d, i) => { const r = rows.filter((x) => x.dow === i + 1); if (!r.length && i > 4) return ''; return html`<section class="wday ${i + 1 === todayDow() ? 'today' : ''}"><h3>${d}${i + 1 === todayDow() ? html`<span class="chip blue">Bugun</span>` : ''}</h3>${r.length ? r.map((x) => slot(x, del)) : html`<p class="none">Dars yoʻq</p>`}</section>`; })}</div>`;
export const todayList = (rows) => { const r = rows.filter((x) => x.dow === todayDow()); return r.length ? html`<div class="slots">${r.map((x) => slot(x))}</div>` : empty('Bugun dars yoʻq.', 'calendar'); };

/* ---------- oʻqituvchi ---------- */
export const teacherCard = (t, rate = false) => html`<div class="teacher">${avatar({ ...t }, 'xl')}<div class="teacher-b"><h3>${full(t)}</h3><p>${t.position || 'English Teacher'}</p>${t.phone ? html`<a href="tel:+998${t.phone}">${phone(t.phone)}</a>` : ''}</div>
  <dl class="tstats"><div><dt>Tajriba</dt><dd>${t.experience != null ? html`${t.experience} <small>yil</small>` : '–'}</dd></div><div><dt>Oʻquvchilar</dt><dd>${t.students}</dd></div><div><dt>Mamnun ota-onalar</dt><dd>${t.rating ? t.rating.pct + '%' : '–'}</dd></div></dl>
  ${t.bio ? html`<p class="bio">${t.bio}</p>` : ''}${rate ? html`<div class="rate" role="group" aria-label="Oʻqituvchini baholang"><span>Oʻqituvchini baholang</span><div>${[1, 2, 3, 4, 5].map((n) => html`<button data-star="${n}" class="${t.myStars >= n ? 'on' : ''}" aria-pressed="${t.myStars === n ? 'true' : 'false'}" aria-label="${n}">${icon('star', 24)}</button>`)}</div></div>` : ''}</div>`;
export function bindRate(ctx, t) {
  $$('[data-star]', ctx.el).forEach((b) => b.addEventListener('click', async () => {
    try { await api('PUT', `/rate/${t.id}`, { stars: Number(b.dataset.star) }); toast('Bahoingiz uchun rahmat'); ctx.refresh(); } catch (e) { toast(e.message, 'err'); }
  }));
}
export const feedbackList = (list, del = false) => (list.length ? html`<ul class="fb">${list.map((f) => html`<li><blockquote>${f.text}</blockquote><p><b>${f.teacher || 'HISCHOOL'}</b> <span>${ago(f.created)}</span>${del ? html`<button class="iconbtn sm" data-delfb="${f.id}" aria-label="Oʻchirish">${icon('trash', 17)}</button>` : ''}</p></li>`)}</ul>` : empty('Oʻqituvchi fikri hali yozilmagan.', 'chat'));

/* ---------- baholar ---------- */
export const gradeRows = (list) => (list.length ? html`<ul class="list">${list.map((g) => html`<li class="line">${mark(g.value)}<div><b>${KIND[g.kind]}</b>${g.homework ? html`<small>${g.homework}</small>` : ''}${g.note ? html`<small>${g.note}</small>` : ''}</div><time>${day(g.date)}</time></li>`)}</ul>` : empty('Hali baho qoʻyilmagan.', 'star'));
export const assessTable = (list) => (list.length ? html`<div class="scroll"><table class="tbl cards"><thead><tr><th>Test nomi</th><th>Koʻnikma</th><th>Sana</th><th>Natija</th><th>Oʻqituvchi izohi</th></tr></thead><tbody>${list.map((a) => html`<tr><td data-l="Test nomi"><b>${a.title}</b></td><td data-l="Koʻnikma">${SKILL[a.skill]}</td><td data-l="Sana">${day(a.date)}</td><td data-l="Natija"><b>${a.score}%</b></td><td data-l="Oʻqituvchi izohi">${a.comment || '–'}</td></tr>`)}</tbody></table></div>` : empty('Hali test natijasi yoʻq.', 'chart'));
