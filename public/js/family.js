/* Ota-ona va oʻquvchi sahifalari. */
import { html, put, $, $$, api, state, toast, icon, field, onSubmit, head, card, empty, chip, mark, avatar, full, stat, word, pick, day, dayShort, monthName, today, clock, num, KIND, SKILL, ATT, textBox } from './ui.js';
import { line, columns, ring, bar, calendar, attendanceBy } from './charts.js';
import { notificationsPage, week, todayList, lessonStatus, teacherCard, bindRate, feedbackList, gradeRows, assessTable } from './common.js';
import { settingsPage } from './app.js';
import { tr } from './i18n.js';

const isParent = () => state.user.role === 'parent';
export const tagline = () => (isParent() ? 'Farzandingizning bugungi taʼlim jarayoni' : 'Bugungi taʼlim jarayoningiz');
export async function init() { if (isParent()) await loadChildren(); }

async function loadChildren() {
  state.children = await api('GET', '/children');
  const ok = state.children.filter((c) => c.approved);
  if (!ok.some((c) => c.id === state.childId)) state.childId = ok[0]?.id ?? null;
}
/** Yangi baho yoki dars boshlanganda sahifa oʻzi yangilanadi. */
function autoRefresh(ctx) {
  let timer;
  const off = state.bus.on((m) => { if (m.t !== 'notif' && m.t !== 'lesson') return; clearTimeout(timer); timer = setTimeout(ctx.refresh, 400); });
  ctx.onLeave(() => { off(); clearTimeout(timer); });
}
const switcher = () => {
  const ok = state.children.filter((c) => c.approved);
  return isParent() && ok.length > 1 ? pick('child', 'Farzand', ok.map((c) => [c.id, full(c)]), state.childId) : '';
};
const bindSwitcher = (ctx) => $('#child', ctx.el)?.addEventListener('change', (e) => { state.childId = Number(e.target.value); ctx.refresh(); });
const waiting = () => html`<div class="notice">${icon('clock', 26)}<div><h2>Oʻqituvchi tasdigʻi kutilmoqda</h2>${state.children.length ? html`<p>${state.children.map(full).join(', ')}</p><p>Oʻqituvchi tasdiqlagach, baholar va jonli dars shu yerda ochiladi. Farzandingiz ham roʻyxatdan oʻtganini tekshiring.</p>` : html`<p>Farzand topilmadi. Sozlamalar boʻlimida farzandingizni qayta qoʻshing.</p>`}</div></div>`;

/** Hisobotni yuklab, sahifani chizadi; hali tasdiqlanmagan boʻlsa tushuntirish chiqaradi. */
const withReport = (title, sub, draw) => async (ctx) => {
  if (isParent()) {
    await loadChildren();
    if (!ctx.live()) return;
    if (!state.childId) { ctx.render(html`${head(title, sub)}${waiting()}`); return autoRefresh(ctx); }
  } else {
    const { user } = await api('GET', '/me');
    if (user) state.user.status = user.status;
  }
  const r = await api('GET', `/report/${isParent() ? state.childId : state.user.id}`);
  if (!ctx.live()) return;
  const body = draw(r, ctx);
  ctx.render(html`${head(title, sub, switcher())}${!isParent() && r.student.status === 'pending' ? html`<div class="notice">${icon('clock', 26)}<div><h2>Oʻqituvchi tasdigʻi kutilmoqda</h2><p>Oʻqituvchi sizni sinfga qabul qilgach, baholaringiz chiqa boshlaydi.</p></div></div>` : ''}${body.html}`);
  body.bind?.();
  bindSwitcher(ctx); autoRefresh(ctx);
};

const progressRows = (r) => r.progress.map((p) => ({ label: monthName(p.month, true), full: monthName(p.month), value: p.score }));
const statCards = (s) => html`<div class="grid g4 stats">${stat('calendar', 'Davomat', s.attendance, { suffix: '%', trend: s.trend.attendance })}${stat('star', 'Oʻrtacha baho', s.grade, { digits: 1, suffix: ' / 5', trend: s.trend.grade, unit: '' })}${stat('chart', 'Faollik', s.activity, { suffix: '%', trend: s.trend.activity })}${stat('shield', 'Intizom', s.behaviour, { suffix: '%', trend: s.trend.behaviour })}</div>`;
const liveBar = (r) => (isParent() && r.live && r.camera ? html`<a class="livebar" href="#/camera"><i class="live-dot"></i><span><b>Jonli dars ketmoqda</b><small>${r.live.topic}</small></span><span class="btn small glass">Darsni koʻrish</span></a>` : '');
const todo = (r) => r.homework.filter((h) => h.value == null && h.due >= today());
const progressCard = (r, cls = '') => card('English Progress', line(progressRows(r), { label: 'Oylar boʻyicha test natijalari', head: ['Oy', 'Natija'], none: 'Birinchi test natijasidan keyin oʻsish grafigi chiqadi.' }), { aside: html`<span class="muted">Testlarning oylik oʻrtachasi</span>`, cls });

/* ---------- 1. dashboard ---------- */
const dashboard = withReport('Dashboard', '', (r) => {
  const s = r.student;
  return { html: html`${liveBar(r)}${statCards(r.stats)}
    <div class="grid split">${progressCard(r)}
      ${card('Bugungi darslar', todayList(r.schedule), { aside: html`<a href="#/schedule">Jadval</a>` })}</div>
    <div class="grid g3">
      ${card('', html`<a class="kid" href="#/child">${avatar(s, 'xl')}<div><h3>${full(s)}</h3><p><span>${s.class_name}</span> · <span>${s.course || 'English'}</span></p><div class="row tight">${chip(s.level, 'blue')}${r.attendanceToday ? chip(ATT[r.attendanceToday], { present: 'good', late: 'warn', absent: 'bad' }[r.attendanceToday]) : chip('Bugun belgilanmagan')}</div></div></a>`)}
      ${card('Oʻqituvchi fikri', feedbackList(r.feedback.slice(0, 1)), { aside: html`<a href="#/feedback">Hammasi</a>` })}
      ${card('Uy vazifalari', todo(r).length ? html`<ul class="list">${todo(r).slice(0, 3).map((h) => html`<li class="line">${icon('book')}<div><b>${h.title}</b><small>${day(h.due)}</small></div></li>`)}</ul>` : empty('Muddati kelayotgan uy vazifasi yoʻq.', 'check'), { aside: html`<a href="#/homework">Hammasi</a>` })}
    </div>` };
});

/* ---------- 2. farzand profili ---------- */
const child = withReport(/* ota-ona uchun */ 'Profil va rivojlanish', '', (r, ctx) => {
  const s = r.student, here = r.attendance.filter((a) => a.status !== 'absent').length;
  return { html: html`<section class="card profile"><div class="pf-main">${avatar(s, 'xxl')}<div><h2>${full(s)}</h2><p><span>${s.class_name}</span> · <span>${s.course || 'English'}</span></p><div class="row tight">${chip(`Level ${s.level}`, 'blue')}</div><p class="muted"><span>Oʻqituvchi</span>: ${full(r.teacher)}</p></div></div>
    <dl class="quick"><div><dt>Darslar</dt><dd>${r.attendance.length}</dd></div><div><dt>Qatnashgan</dt><dd>${here}</dd></div><div><dt>Uy vazifalari</dt><dd>${r.homeworkDone.done}/${r.homeworkDone.total}</dd></div><div><dt>Oʻrtacha baho</dt><dd>${num(r.stats.grade)}</dd></div></dl></section>
    ${progressCard(r)}
    <div class="grid split">${card('Koʻnikmalar', html`<div class="rings">${r.skills.map((k) => ring(k.score, { size: 96, label: SKILL[k.skill] }))}</div>`)}${card('Oʻqituvchi', teacherCard(r.teacher, isParent()))}</div>`, bind: () => bindRate(ctx, r.teacher) };
});

/* ---------- 3. davomat ---------- */
let calMonth = null, attUnit = 'week';
const attendance = withReport('Davomat', 'Oxirgi toʻrt oylik qatnashish', (r, ctx) => {
  const m = calMonth || today().slice(0, 7), cur = r.attendance.filter((a) => a.date.startsWith(m));
  const c = (st, list = r.attendance) => list.filter((a) => a.status === st).length, total = r.attendance.length;
  const shift = (n) => { const [y, mm] = m.split('-').map(Number); return today(new Date(y, mm - 1 + n, 1)).slice(0, 7); };
  return {
    html: html`<div class="grid split rev">${card('Umumiy', html`<div class="attsum">${ring(total ? (100 * (total - c('absent'))) / total : null, { size: 200, label: 'Davomat' })}<ul class="legend">${Object.entries(ATT).map(([k, t]) => html`<li class="${k}"><i></i><b>${c(k)}</b><span>${t}</span></li>`)}</ul></div>`)}
      ${card('Taqvim', html`<div class="cal-nav"><button class="iconbtn" id="prev" aria-label="Oldingi oy">${icon('left')}</button><b>${monthName(m)} ${m.slice(0, 4)}</b><button class="iconbtn" id="next" aria-label="Keyingi oy" ${m >= today().slice(0, 7) ? html`disabled` : ''}>${icon('next')}</button></div>${calendar(r.attendance, m)}<ul class="legend row-l">${Object.entries(ATT).map(([k, t]) => html`<li class="${k}"><i></i><span>${t}</span><b>${c(k, cur)}</b></li>`)}</ul>`)}</div>
      ${card('Qatnashish grafigi', columns(attendanceBy(r.attendance, attUnit, attUnit === 'week' ? 8 : 4), { label: 'Davomat foizi', head: ['Davr', 'Davomat'] }), { aside: html`<div class="seg">${[['week', 'Haftalik'], ['month', 'Oylik']].map(([k, t]) => html`<label><input type="radio" name="unit" value="${k}" ${k === attUnit ? html`checked` : ''}><span>${t}</span></label>`)}</div>` })}`,
    bind: () => {
      $('#prev').onclick = () => { calMonth = shift(-1); ctx.refresh(); };
      $('#next').onclick = () => { calMonth = shift(1); ctx.refresh(); };
      $$('[name=unit]', ctx.el).forEach((i) => i.addEventListener('change', () => { attUnit = i.value; ctx.refresh(); }));
    },
  };
});

/* ---------- 4. baholar ---------- */
const grades = withReport('Baholar', 'Koʻnikmalar va test natijalari', (r, ctx) => ({
  html: html`${card('Koʻnikmalar', html`<div class="skills">${r.skills.map((k) => bar(SKILL[k.skill], k.score))}</div>`, { aside: html`<span class="muted">Oxirgi 6 oy</span>` })}
    ${card('Oxirgi testlar', assessTable(r.assessments))}
    ${card('Dars va vazifa baholari', html`<div class="seg filter">${[['all', 'Hammasi'], ...Object.entries(KIND)].map(([k, t]) => html`<label><input type="radio" name="kind" value="${k}" ${k === 'all' ? html`checked` : ''}><span>${t}</span></label>`)}</div><div id="marks">${gradeRows(r.grades)}</div>`)}`,
  bind: () => $$('[name=kind]', ctx.el).forEach((i) => i.addEventListener('change', () => put($('#marks', ctx.el), gradeRows(r.grades.filter((g) => i.value === 'all' || g.kind === i.value))))),
}));

/* ---------- 5. odob va faollik ---------- */
const behaviour = withReport('Odob va faollik', 'Oʻquvchining darsdagi faolligi', (r) => {
  const scored = r.lessons.filter((l) => l.score != null), part = scored.length ? scored.reduce((a, l) => a + l.score, 0) / scored.length : null;
  const cards = [['chart', 'Darsdagi faollik', r.stats.activity], ['shield', 'Intizom', r.stats.behaviour], ['book', 'Uy vazifasi', r.stats.homework], ['people', 'Ishtirok', part]];
  const notes = r.grades.filter((g) => g.kind !== 'homework');
  return { html: html`<div class="grid g4 stats">${cards.map(([i, t, v]) => { const [w, tone] = word(v); return html`<div class="stat"><div class="stat-top"><span class="stat-ic">${icon(i, 20)}</span><span>${t}</span></div><b class="stat-v txt ${tone}">${w}</b><div class="track"><i class="draw" style="--v:${v ?? 0}%"></i></div></div>`; })}</div>
    <div class="grid split">${card('Darsdagi diqqat', html`${columns(r.lessons.map((l) => ({ label: dayShort(l.date), full: `${day(l.date)}, ${l.topic}`, value: l.score })), { label: 'Darslar boʻyicha diqqat', head: ['Dars', 'Diqqat'], none: 'Kamera bilan oʻtilgan birinchi darsdan keyin grafik chiqadi.' })}<p class="fine">Kamera hisoblagan taxminiy koʻrsatkich, baho emas. Bola yozayotganda yoki yuzi toʻsilganda past chiqishi mumkin.</p>`)}${card('Oʻqituvchi fikri', feedbackList(r.feedback.slice(0, 2)))}</div>
    ${card('Faollik va intizom baholari', gradeRows(notes.slice(0, 20)))}` };
});

/* ---------- 6. uy vazifalari ---------- */
const homework = withReport('Uy vazifalari', '', (r) => {
  const t = today(), now = r.homework.filter((h) => h.due >= t).reverse(), old = r.homework.filter((h) => h.due < t);
  const row = (h) => html`<li class="line hw">${h.value == null ? html`<span class="nic ${h.due < t ? '' : 'blue'}">${icon('book', 20)}</span>` : mark(h.value)}<div><b>${h.title}</b>${h.details ? html`<p>${h.details}</p>` : ''}${h.note ? html`<p><i>${h.note}</i></p>` : ''}</div><div class="hw-r">${h.value == null ? chip(h.due < t ? 'Tekshirilmagan' : 'Kutilmoqda', h.due < t ? '' : 'blue') : chip('Baholandi', 'good')}<time>${day(h.due)}</time></div></li>`;
  return { html: html`<div class="grid split">${card('Hozirgi vazifalar', now.length ? html`<ul class="list">${now.map(row)}</ul>` : empty('Hozircha vazifa yoʻq.', 'check'))}${card('Bajarilishi', html`<div class="attsum">${ring(r.homeworkDone.total ? (100 * r.homeworkDone.done) / r.homeworkDone.total : null, { size: 150, label: `${r.homeworkDone.done}/${r.homeworkDone.total}` })}<p class="muted"><span>Oʻrtacha baho</span>: <b>${r.stats.homework == null ? '–' : num(r.stats.homework / 20)}</b></p></div>`)}</div>
    ${card('Oldingi vazifalar', old.length ? html`<ul class="list">${old.map(row)}</ul>` : empty('Oldingi vazifalar yoʻq.'))}` };
});

const schedule = withReport('Dars jadvali', '', (r) => ({ html: r.schedule.length ? week(r.schedule) : card('', empty('Jadval hali kiritilmagan.', 'calendar')) }));
const feedback = withReport('Oʻqituvchi fikrlari', '', (r, ctx) => ({ html: html`<div class="grid split rev">${card('Oʻqituvchi', teacherCard(r.teacher, isParent()))}${card('Fikrlar', feedbackList(r.feedback))}</div>`, bind: () => bindRate(ctx, r.teacher) }));

/* ---------- 9. jonli sinf ---------- */
const mulaw = (u8) => { const f = new Float32Array(u8.length); for (let i = 0; i < u8.length; i++) { const v = u8[i] / 127.5 - 1; f[i] = (Math.sign(v) * (256 ** Math.abs(v) - 1)) / 255; } return f; };

async function cameraPage(ctx) {
  await loadChildren();
  if (!ctx.live()) return;
  const sub = 'Jonli sinfga faqat tasdiqlangan ota-onalar kira oladi.';
  if (!state.childId) { ctx.render(html`${head('Live Classroom', sub)}${waiting()}`); return autoRefresh(ctx); }
  const kid = state.children.find((c) => c.id === state.childId);
  const r = await api('GET', `/report/${state.childId}`);
  if (!ctx.live()) return;
  const s = r.student, slotNow = r.schedule.find((x) => lessonStatus(x)?.[1] === 'live');
  const denied = !r.camera ? 'Kameraga ruxsatingiz vaqtincha toʻxtatilgan. Oʻqituvchi yoki maktab bilan bogʻlaning.' : !s.camera_on ? 'Bu xona kamerasi hozir oʻchirilgan.' : '';
  ctx.render(html`${head('Live Classroom', sub, switcher())}
    <div class="camgrid"><div><div class="cam" id="cam"><canvas id="cv" width="960" height="540" hidden></canvas><div class="cam-off" id="off">${icon(denied ? 'lock' : 'camera', 40)}<p></p></div>
      <div class="cam-top"><span class="hud live" id="tag" hidden><i class="live-dot"></i>LIVE</span><span class="hud">${s.room || s.class_name}</span><span class="hud right" id="clock"></span></div>
      <div class="cam-bar"><span class="conn" id="conn">${icon('signal', 18)}<span>Ulanmoqda</span></span><span class="grow"></span><label class="camsel"><span class="sr">Tasvir sifati</span><select id="q"><option value="high">Yuqori</option><option value="mid">Oʻrta</option><option value="low">Tejamkor</option></select></label><button class="iconbtn" id="mute" aria-label="Ovoz" aria-pressed="true" title="Ovoz">${icon('mute')}</button><button class="iconbtn" id="report" aria-label="Muammo haqida xabar berish" title="Muammo haqida xabar berish">${icon('flag')}</button><button class="iconbtn" id="fs" aria-label="Toʻliq ekran" title="Toʻliq ekran">${icon('full')}</button></div></div>
      <div class="grid g2 cam-now"><div class="nowbox" id="now"><small>${kid.first}</small><b>–</b></div><div class="nowbox"><small>Shu darsdagi diqqat</small><b id="sc">–</b></div></div></div>
    <div class="cam-side">${card('', html`<p class="online" id="online"><i></i><span>Kamera oʻchiq</span></p><dl class="facts"><div><dt>Sinf</dt><dd>${s.class_name}</dd></div><div><dt>Kurs</dt><dd>${s.course || `English ${s.level}`}</dd></div><div><dt>Oʻqituvchi</dt><dd>${full(r.teacher)}</dd></div><div><dt>Dars</dt><dd id="topic">${r.live?.topic || slotNow?.subject || '–'}</dd></div><div><dt>Boshlandi</dt><dd id="from">${r.live ? clock(r.live.started) : slotNow?.start || '–'}</dd></div><div><dt>Tugaydi</dt><dd>${slotNow?.finish || '–'}</dd></div></dl>`)}
      ${card('Kirish nazorati', html`<ul class="access"><li>${icon(denied ? 'lock' : 'check', 20)}<div><b>${denied ? 'Ruxsat yopiq' : 'Ruxsatingiz faol'}</b><small>${full(state.user)}</small></div></li><li>${icon('eye', 20)}<div><b id="priv">Boshqa oʻquvchilar yuzi yashirilgan</b><small>Faqat farzandingiz ochiq koʻrinadi</small></div></li><li>${icon('shield', 20)}<div><b>Yozib olinmaydi</b><small>Faqat oxirgi kadr turadi va dars tugagach oʻchadi</small></div></li><li>${icon('clock', 20)}<div><b>Koʻrish qayd etiladi</b><small>Maktab kim va qachon kirganini koʻradi</small></div></li></ul>`)}</div></div>`);
  bindSwitcher(ctx);
  const cv = $('#cv'), g = cv.getContext('2d'), off = $('#off'), box = $('#cam'), q = $('#q'), muteBtn = $('#mute');
  let lastAt = 0, token = '', since = '', status = '', wake = () => {}, audio = null, playAt = 0, nextSample = null, hasAudio = false;
  const conn = (text, cls) => { $('#conn').className = 'conn ' + cls; $('#conn span').textContent = tr(text); };
  const idle = () => {
    cv.hidden = true; $('#tag').hidden = true; off.hidden = false;
    $('#now').className = 'nowbox'; $('#now b').textContent = '–'; $('#sc').textContent = '–';
    $('#online').className = 'online'; $('#online span').textContent = tr('Kamera oʻchiq');
    conn('Serverga ulangan', 'ok');
    if (denied) { $('p', off).textContent = tr(denied); return; }
    const l = status === 'waiting';
    $('p', off).textContent = tr(l ? 'Dars boshlangan, kamera ulanishi kutilmoqda…' : 'Hozir dars yoʻq. Oʻqituvchi darsni boshlasa, sinf shu yerda koʻrinadi.');
  };
  idle();

  /* Har kadrda ovozning oxirgi bir necha soniyasi keladi, faqat hali eshitilmagan qismi ijro etiladi. */
  const sound = (bytes, pos) => {
    if (!audio || !bytes.length) return;
    const end = pos + bytes.length;
    if (nextSample == null || nextSample < pos || nextSample > end) nextSample = Math.max(pos, end - 24000);
    const chunk = bytes.subarray(nextSample - pos);
    if (!chunk.length) return;
    nextSample = end;
    const f = mulaw(chunk), b = audio.createBuffer(1, f.length, 16000), n = audio.createBufferSource();
    b.copyToChannel(f, 0);
    n.buffer = b; n.connect(audio.destination);
    if (playAt < audio.currentTime + 0.05) playAt = audio.currentTime + 0.4;
    if (playAt > audio.currentTime + 5) return;
    n.start(playAt); playAt += b.duration;
  };
  const show = async (m, took) => {
    try {
      const len = new DataView(m).getUint32(0);
      const h = JSON.parse(new TextDecoder().decode(new Uint8Array(m, 4, len)));
      const sc = h.scores.find((x) => x.sid === state.childId);
      if (!sc) return;
      let o = 4 + len;
      const take = (n) => { const b = new Blob([new Uint8Array(m, o, n)], { type: 'image/jpeg' }); o += n; return createImageBitmap(b); };
      const base = await take(h.base), mine = [];
      for (const p of h.patches) { const b = await take(p.len); if (p.sid === state.childId) mine.push([p, b]); }
      if (!ctx.live()) return;
      if (h.audioLen) sound(new Uint8Array(m, o, h.audioLen), h.audioPos);
      if (cv.width !== h.w || cv.height !== h.h) { cv.width = h.w; cv.height = h.h; }
      g.drawImage(base, 0, 0);
      for (const [p, b] of mine) g.drawImage(b, p.box.x, p.box.y, p.box.w, p.box.h);
      const f = h.faces.find((x) => x.sid === state.childId);
      if (f) {
        g.lineWidth = 3; g.strokeStyle = '#22d3ee';
        g.beginPath(); g.roundRect(f.box.x, f.box.y, f.box.w, f.box.h, 8); g.stroke();
        g.font = '600 18px Onest, sans-serif';
        const w = g.measureText(kid.first).width + 18, y = Math.max(0, f.box.y - 32);
        g.fillStyle = '#22d3ee'; g.beginPath(); g.roundRect(f.box.x, y, w, 26, 7); g.fill();
        g.fillStyle = '#071226'; g.fillText(kid.first, f.box.x + 9, y + 19);
      }
      $('#now').className = 'nowbox ' + sc.now;
      $('#now b').textContent = tr({ attentive: 'Darsga qarayapti', away: 'Boshqa tomonga qarayapti', unseen: 'Kamerada koʻrinmayapti' }[sc.now]);
      $('#sc').textContent = sc.score == null ? '–' : sc.score + '%';
      $('#topic').textContent = h.topic; $('#from').textContent = clock(h.started);
      $('#priv').textContent = tr(h.blur ? 'Boshqa oʻquvchilar yuzi yashirilgan' : 'Yuz yashirish oʻqituvchi tomonidan oʻchirilgan');
      hasAudio = h.audio;
      lastAt = Date.now();
      conn(took < 1500 ? 'Aloqa yaxshi' : 'Aloqa sekin', took < 1500 ? 'ok' : 'mid');
      $('#online').className = 'online on'; $('#online span').textContent = tr('Kamera onlayn');
      cv.hidden = false; off.hidden = true; $('#tag').hidden = false;
    } catch (e) { console.error(e); }
  };
  const rest = (ms) => new Promise((ok) => { const t = setTimeout(ok, ms); wake = () => { clearTimeout(t); ok(); }; });
  (async () => {
    while (ctx.live() && !denied) {
      if (document.hidden) { await rest(1500); continue; }
      let pause = state.pace.frame * { high: 1, mid: 2, low: 4 }[q.value];
      try {
        const from = performance.now();
        const r = await fetch(`/api/live/frame?student=${state.childId}&t=${encodeURIComponent(token)}&since=${since}&audio=${audio ? 1 : 0}`);
        const live = r.headers.get('X-Live');
        if (!ctx.live()) return;
        token = r.headers.get('X-Live-Token') || (live === 'frame' || live === 'same' || live === 'waiting' ? token : '');
        if (r.status === 401) return state.onAuthLost();
        if (r.status === 200) {
          const m = await r.arrayBuffer();
          status = 'frame';
          since = JSON.parse(new TextDecoder().decode(new Uint8Array(m, 4, new DataView(m).getUint32(0)))).at;
          await show(m, performance.now() - from);
        } else if (live !== 'same') {
          const was = status;
          status = live || 'none';
          if (status === 'denied' || status === 'room') { lastAt = 0; if (was !== status) return ctx.refresh(); }
          if (!lastAt || Date.now() - lastAt > 10000) { lastAt = 0; if (was !== status || !cv.hidden) idle(); }
          if (status !== 'waiting') pause = state.pace.idle;
          else pause = Math.max(pause, 1000);
        }
      } catch { conn('Aloqa yoʻq', 'bad'); pause = 3000; }
      await rest(pause);
    }
  })();
  const again = denied && setTimeout(ctx.refresh, 20000); // ruxsat qaytsa oʻzi ochiladi
  const t = setInterval(() => { $('#clock').textContent = new Date().toTimeString().slice(0, 8); }, 1000);
  ctx.onLeave(() => { clearInterval(t); clearTimeout(again); wake(); audio?.close(); audio = null; if (document.fullscreenElement) document.exitFullscreen(); });

  q.addEventListener('change', () => wake());
  muteBtn.addEventListener('click', () => {
    if (audio) { audio.close(); audio = null; } else {
      if (lastAt && !hasAudio) return toast('Oʻqituvchi bu darsda ovozni uzatmayapti.', 'info');
      audio = new AudioContext(); playAt = 0; nextSample = null;
    }
    muteBtn.setAttribute('aria-pressed', audio ? 'false' : 'true');
    put(muteBtn, icon(audio ? 'sound' : 'mute'));
    wake();
  });
  $('#fs').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (box.requestFullscreen) box.requestFullscreen().catch(() => box.classList.toggle('fs'));
    else box.classList.toggle('fs'); // iOS
  });
  $('#report').addEventListener('click', async () => {
    const text = await textBox('Muammo haqida xabar berish', '', { placeholder: 'Nima ishlamayapti?', yes: 'Yuborish', max: 500 });
    if (!text) return;
    try { await api('POST', '/camera/report', { student_id: state.childId, text }); toast('Xabar oʻqituvchi va maktabga yuborildi'); } catch (e) { toast(e.message, 'err'); }
  });
}

/* ---------- sozlamalar ---------- */
async function settings(ctx) {
  if (!isParent()) return settingsPage(ctx);
  await loadChildren();
  await settingsPage(ctx, card('Farzandlarim', html`<ul class="list">${state.children.map((c) => html`<li class="line">${avatar(c)}<div><b>${full(c)}</b><small>${c.class_name || ''}</small></div>${c.approved ? chip('Tasdiqlangan', 'good') : chip('Kutilmoqda', 'warn')}</li>`)}</ul><form id="add"><div class="two">${field('child_first', 'Farzandning ismi', { maxlength: 40 })}${field('child_last', 'Farzandning familiyasi', { maxlength: 40 })}</div><button class="btn small" type="submit">Farzand qoʻshish</button></form>`),
    () => onSubmit($('#add'), async (v) => { await api('POST', '/children', v); toast('Soʻrov oʻqituvchiga yuborildi'); ctx.refresh(); }));
}

export const bottom = () => (isParent() ? ['dashboard', 'child', 'camera', 'schedule', 'settings'] : ['dashboard', 'grades', 'homework', 'schedule', 'settings']);
export const pages = () => [
  { id: 'dashboard', uz: 'Dashboard', short: 'Bosh', icon: 'home', page: dashboard },
  { id: 'child', uz: isParent() ? 'Farzandim' : 'Profilim', short: 'Oʻsish', icon: 'child', page: child },
  { id: 'attendance', uz: 'Davomat', icon: 'calendar', page: attendance },
  { id: 'grades', uz: 'Baholar', short: 'Oʻsish', icon: 'chart', page: grades },
  { id: 'behaviour', uz: 'Odob va faollik', icon: 'star', page: behaviour },
  { id: 'homework', uz: 'Uy vazifalari', short: 'Vazifa', icon: 'book', page: homework },
  { id: 'schedule', uz: 'Dars jadvali', short: 'Jadval', icon: 'clock', page: schedule },
  ...(isParent() ? [{ id: 'camera', uz: 'Sinf kamerasi', short: 'Kamera', icon: 'camera', page: cameraPage }] : []),
  { id: 'feedback', uz: 'Oʻqituvchi fikrlari', icon: 'chat', page: feedback },
  { id: 'notifications', uz: 'Bildirishnomalar', icon: 'bell', page: (ctx) => notificationsPage(ctx) },
  { id: 'settings', uz: 'Sozlamalar', short: 'Profil', icon: 'gear', page: settings },
];
