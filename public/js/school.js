/* Oʻqituvchi sahifalari. Jurnal, test, vazifa, jadval va oʻquvchi sahifasini admin ham ishlatadi. */
import { html, $, $$, api, state, toast, icon, field, select, onSubmit, head, card, empty, chip, mark, avatar, full, stat, pick, day, dayShort, today, phone, contact, pc, KIND, SKILL, ATT, ATT_TONE, confirmBox, textBox, formBox, showCard, act, values } from './ui.js';
import { line, columns, ring } from './charts.js';
import { notificationsPage, week, todayList, feedbackList, gradeRows, assessTable } from './common.js';
import { camera } from './face.js';
import { settingsPage } from './app.js';
import { tr } from './i18n.js';

export const tagline = () => 'Sinflaringizning bugungi holati';
export async function init() { await loadClasses(); }
export async function beforeLogout() { if (camera.running) await stopLesson(); }
export function dispose() { camera.stop(); }

export async function loadClasses() {
  const r = await api('GET', '/t/classes');
  state.classes = r.classes; state.pending = r.pending; state.rooms = r.rooms;
  if (!state.classes.some((c) => c.id === state.classId)) state.classId = state.classes[0]?.id ?? null;
}
const isAdmin = () => state.user.role === 'admin';
export const picker = () => pick('cls', 'Sinf', state.classes.map((c) => [c.id, isAdmin() ? `${c.name}, ${c.teacher}` : c.name]), state.classId);
export function bindPicker(ctx, to) { $('#cls', ctx.el)?.addEventListener('change', (e) => { state.classId = Number(e.target.value); if (to && location.hash !== to) location.hash = to; else ctx.refresh(); }); }
/** Sinf tanlangan sahifa: sinf yoʻq boʻlsa tushuntirish chiqadi. */
export const withClass = (title, sub, fn) => async (ctx) => {
  await loadClasses();
  if (!ctx.live()) return;
  if (!state.classId) return ctx.render(html`${head(title, sub)}${card('', empty('Hali sinf yoʻq. Avval sinf oching.', 'cap'))}`);
  return fn(ctx);
};
export function bindDo(ctx) {
  $$('[data-do]', ctx.el).forEach((b) => b.addEventListener('click', act(async () => {
    const [m, url] = b.dataset.do.split(' ');
    if (b.dataset.ask && !await confirmBox(b.dataset.title || b.textContent.trim(), b.dataset.ask, b.dataset.yes || 'Tasdiqlash', m === 'DELETE')) return;
    await api(m, url);
    toast('Bajarildi');
    ctx.refresh();
  })));
}
export function bindReset(ctx) {
  $$('[data-reset]', ctx.el).forEach((b) => b.addEventListener('click', act(async () => {
    if (!await confirmBox('Yangi parol berilsinmi?', 'Eski parol ishlamay qoladi, barcha qurilmalardan chiqariladi.', 'Parol berish', false)) return;
    const x = await api('POST', `/t/users/${b.dataset.reset}/reset`);
    await showCard(b.dataset.name, x.login, x.password);
  })));
}

/* ---------- dashboard ---------- */
const dashboard = withClass('Dashboard', '', async (ctx) => {
  const r = await api('GET', `/t/dashboard/${state.classId}`);
  if (!ctx.live()) return;
  const st = r.students, marked = st.filter((s) => s.attendance), here = marked.filter((s) => s.attendance !== 'absent').length;
  const mean = (k) => { const v = st.map((s) => s[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  ctx.render(html`${head('Dashboard', '', picker())}
    ${r.live ? html`<a class="livebar" href="#/live"><i class="live-dot"></i><span><b>Jonli dars ketmoqda</b><small>${r.live.topic}</small></span><span class="btn small glass">Darsga oʻtish</span></a>` : ''}
    ${state.pending ? html`<a class="livebar wait" href="#/students">${icon('people')}<span><b>${state.pending} <span>ta soʻrov tasdiq kutmoqda</span></b></span><span class="btn small">Koʻrish</span></a>` : ''}
    <div class="grid g4 stats">${stat('people', 'Oʻquvchilar', st.length, { sub: r.class.name })}${stat('calendar', 'Bugun darsda', marked.length ? (100 * here) / marked.length : null, { suffix: '%', sub: `${here} / ${st.length}` })}${stat('star', 'Faollik', mean('activity'), { digits: 1, suffix: ' / 5', sub: 'Oxirgi 30 kun' })}${stat('shield', 'Intizom', mean('behaviour'), { digits: 1, suffix: ' / 5', sub: 'Oxirgi 30 kun' })}</div>
    <div class="grid split">${card('Sinfning darsdagi diqqati', columns(r.lessons.map((l) => ({ label: dayShort(l.date), full: `${day(l.date)}, ${l.topic}`, value: l.score })), { label: 'Darslar boʻyicha sinf diqqati', head: ['Dars', 'Diqqat'], none: 'Kamera bilan oʻtilgan birinchi darsdan keyin grafik chiqadi.' }), { aside: html`<span class="muted">Kamera taxmini</span>` })}${card('Bugungi darslar', todayList(r.schedule), { aside: html`<a href="#/schedule">Jadval</a>` })}</div>
    ${card('Oʻquvchilar', st.length ? html`<div class="scroll"><table class="tbl cards"><thead><tr><th>Oʻquvchi</th><th>Daraja</th><th>Bugun</th><th>Faollik</th><th>Intizom</th><th>Vazifa</th><th>Test</th></tr></thead><tbody>${st.map((s) => html`<tr><td><a class="who" href="#/students/${s.id}">${avatar(s)}<b>${full(s)}</b></a></td><td data-l="Daraja">${chip(s.level, 'blue')}</td><td data-l="Bugun">${s.attendance ? chip(ATT[s.attendance], ATT_TONE[s.attendance]) : '–'}</td><td data-l="Faollik">${mark(s.activity)}</td><td data-l="Intizom">${mark(s.behaviour)}</td><td data-l="Vazifa">${mark(s.homework)}</td><td data-l="Test">${pc(s.test)}</td></tr>`)}</tbody></table></div>` : empty('Bu sinfda hali oʻquvchi yoʻq. Oʻquvchilar roʻyxatdan oʻtib, sinfni tanlaydi, siz tasdiqlaysiz.', 'people'))}`);
  bindPicker(ctx);
});

/* ---------- jonli dars ---------- */
async function stopLesson() {
  const l = camera.lesson;
  await camera.stop();
  if (l) await api('POST', `/t/lessons/${l.id}/end`);
  camera.lesson = null;
}
const livePage = withClass('Jonli dars', '', async (ctx) => {
  if (camera.running) state.classId = camera.lesson.class_id;
  const cls = state.classes.find((c) => c.id === state.classId), open = cls.live, on = camera.running;
  const students = on ? camera.students : await api('GET', `/t/faces/${state.classId}`);
  if (!ctx.live()) return;
  ctx.render(html`${head('Jonli dars', '', on ? chip(cls.name, 'blue') : picker())}
    <div class="camgrid"><div>
      ${on ? '' : card('', html`<form id="start" class="inline">${open ? html`<p class="grow"><span>Yakunlanmagan dars bor</span>: <b>${open.topic}</b></p>` : field('topic', 'Dars mavzusi', { placeholder: 'Unit 5: My favourite season', maxlength: 120 })}<button class="btn" type="submit">${open ? 'Kamerani ulash' : 'Darsni boshlash'}</button>${open ? html`<button type="button" class="btn ghost" id="endopen">Darsni yakunlash</button>` : ''}</form>`)}
      <div class="cam" id="cam"><canvas id="cv" width="960" height="540" ${on ? '' : html`hidden`}></canvas><div class="cam-off" ${on ? html`hidden` : ''}>${icon('camera', 40)}<p>Kamera oʻchiq. Uni butun sinf koʻrinadigan joyga qoʻying.</p></div>
        <div class="cam-top">${on ? html`<span class="hud live"><i class="live-dot"></i>LIVE</span>` : ''}<span class="hud">${cls.room || cls.name}</span>${on ? html`<span class="hud right">${icon('eye', 16)} <span id="vw">${cls.viewers}</span></span>` : ''}</div>
        ${on ? html`<div class="cam-bar"><b class="ell">${camera.lesson.topic}</b><span class="grow"></span><button class="btn small danger solid" id="stop">Darsni yakunlash</button></div>` : ''}</div>
      <p id="st" class="status" role="status"></p></div>
    <div class="cam-side">${card('Kamera sozlamasi', html`<div class="stack">${select('dev', 'Kamera', [['', 'Standart']])}${select('tiles', 'Sinf kattaligi', [[1, 'Kichik (tez)'], [4, 'Katta, orqa partalar (sekin)']], camera.opts.tiles)}${select('width', 'Tasvir sifati', [[640, 'Tejamkor'], [960, 'Oʻrta'], [1280, 'Yuqori']], camera.opts.width)}
        <label class="switch"><input type="checkbox" id="blur" ${camera.opts.blur ? html`checked` : ''}><i></i><span>Boshqa bolalar yuzini yashirish</span></label><label class="switch"><input type="checkbox" id="audio" ${camera.opts.audio ? html`checked` : ''}><i></i><span>Ovozni uzatish</span></label></div>`)}</div></div>
    ${card('Kim koʻrinyapti', students.length ? html`<ul class="seats" id="seats">${students.map((s) => html`<li data-id="${s.id}">${avatar(s)}<div><b>${full(s)}</b><small>${s.descriptor ? 'Kutilmoqda' : s.has_photo ? 'Rasm dars boshida tekshiriladi' : 'Rasmi yoʻq'}</small></div><span class="pc">–</span></li>`)}</ul><p class="fine">Kamera oʻquvchini tanisa, davomatda «Keldi» deb oʻzi belgilaydi. Boshqa boʻlimga oʻtsangiz ham kamera ishlaydi, lekin brauzer oynasini yopmang.</p>` : empty('Bu sinfda tasdiqlangan oʻquvchi yoʻq.', 'people'))}`);
  bindPicker(ctx);

  const cv = $('#cv'), g = cv.getContext('2d'), st = $('#st');
  const draw = () => {
    if (!camera.running) return;
    const F = camera.full, k = Math.min(1, 1280 / F.width);
    if (!F.width) return;
    cv.width = F.width * k; cv.height = F.height * k;
    g.drawImage(F, 0, 0, cv.width, cv.height);
    g.lineWidth = 3; g.font = '600 17px Onest, sans-serif';
    for (const t of camera.tracks) {
      const s = t.votes >= 2 && camera.students.find((x) => x.id === t.sid), b = t.box, x = b.x * k, y = b.y * k;
      g.strokeStyle = !s ? 'rgba(255,255,255,.75)' : t.attentive ? '#22c55e' : '#f5b73a';
      g.beginPath(); g.roundRect(x, y, b.w * k, b.h * k, 8); g.stroke();
      if (s) {
        const label = `${s.first} ${s.last[0]}.`, w = g.measureText(label).width + 16, ty = Math.max(0, y - 30);
        g.fillStyle = g.strokeStyle; g.beginPath(); g.roundRect(x, ty, w, 25, 7); g.fill();
        g.fillStyle = '#071226'; g.fillText(label, x + 8, ty + 18);
      }
    }
    for (const li of $$('#seats li')) {
      const id = Number(li.dataset.id), s = camera.stats.get(id), who = camera.students.find((x) => x.id === id);
      if (!s) continue;
      li.className = s.now;
      $('small', li).textContent = tr(who.descriptor ? { attentive: 'Darsga qarayapti', away: 'Boshqa tomonga qarayapti', unseen: 'Koʻrinmayapti' }[s.now] : 'Yuz maʼlumoti yoʻq, rasmni yangilash kerak');
      $('.pc', li).textContent = camera.score(id) == null ? '–' : camera.score(id) + '%';
    }
  };
  const onStatus = (e) => { st.textContent = tr(e.detail); };
  camera.addEventListener('tick', draw); camera.addEventListener('status', onStatus);
  const poll = on && setInterval(async () => { try { const r = await api('GET', '/t/classes'); const v = r.classes.find((c) => c.id === state.classId)?.viewers; if ($('#vw')) $('#vw').textContent = v; } catch { /* keyingi safar */ } }, 8000);
  ctx.onLeave(() => { camera.removeEventListener('tick', draw); camera.removeEventListener('status', onStatus); clearInterval(poll); });

  const dev = $('[name=dev]');
  navigator.mediaDevices?.enumerateDevices().then((list) => list.filter((d) => d.kind === 'videoinput' && d.deviceId).forEach((d, i) => dev.add(new Option(d.label || `${tr('Kamera')} ${i + 1}`, d.deviceId, false, d.deviceId === camera.opts.deviceId)))).catch(() => {});
  dev.addEventListener('change', async (e) => { camera.opts.deviceId = e.target.value; if (camera.running) try { await camera.openCamera(); } catch (x) { toast(x.message, 'err'); } });
  $('[name=tiles]').addEventListener('change', (e) => { camera.opts.tiles = Number(e.target.value); });
  $('[name=width]').addEventListener('change', (e) => { camera.opts.width = Number(e.target.value); });
  $('#blur').addEventListener('change', (e) => { camera.opts.blur = e.target.checked; });
  $('#audio').addEventListener('change', async (e) => {
    camera.opts.audio = e.target.checked;
    if (!camera.running) return;
    if (!e.target.checked) return camera.stopAudio();
    try { await camera.startAudio(); } catch (x) { e.target.checked = false; toast(x.message, 'err'); }
  });
  $('#stop')?.addEventListener('click', act(async () => {
    if (!await confirmBox('Darsni yakunlaysizmi?', 'Kamera oʻchadi va ota-onalar uchun translyatsiya toʻxtaydi.', 'Yakunlash')) return;
    await stopLesson(); toast('Dars yakunlandi'); ctx.refresh();
  }));
  $('#endopen')?.addEventListener('click', act(async () => { await api('POST', `/t/lessons/${open.id}/end`); ctx.refresh(); }));
  const form = $('#start');
  if (form) {
    onSubmit(form, async (v) => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Kamera faqat localhost yoki HTTPS manzilda ishlaydi.');
      $('#cls').disabled = true;
      try {
        // Dars serverda kamera ochilgandan keyingina boshlanadi.
        st.textContent = tr('Kamera ochilmoqda…');
        await camera.openCamera();
        const lesson = await api('POST', '/t/lessons', { class_id: state.classId, topic: v.topic });
        await camera.start(lesson, students);
      } catch (e) { st.textContent = tr(e.message); camera.closeCamera(); if ($('#cls')) $('#cls').disabled = false; throw e; }
      ctx.refresh();
    });
  }
});

/* ---------- jurnal: all | attendance | behaviour ---------- */
const jdate = { v: today(), auto: true };
const scale = (value, label) => html`<div class="scale" role="group" aria-label="${label}">${[1, 2, 3, 4, 5].map((n) => html`<button type="button" data-v="${n}" class="m${n}" aria-pressed="${value === n ? 'true' : 'false'}">${n}</button>`)}</div>`;
const noteBtn = (has) => html`<button type="button" class="iconbtn sm ${has ? 'has' : ''}" data-notebtn aria-label="Izoh" title="Izoh">${icon('edit', 18)}</button>`;
const press = (group, b) => $$('button', group).forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
async function gradeClick(b, cell, base) {
  const cur = $('.scale [aria-pressed=true]', cell);
  if (b.dataset.notebtn !== undefined) {
    const note = await textBox('Izoh', cell.dataset.note, { placeholder: 'Ota-ona koʻradigan izoh' });
    if (note === null) return;
    await api('PUT', '/t/grade', { ...base, value: cur ? Number(cur.dataset.v) : null, note });
    cell.dataset.note = note; b.classList.toggle('has', !!note);
  } else if (b.dataset.v) {
    const off = b === cur;
    await api('PUT', '/t/grade', { ...base, value: off ? null : Number(b.dataset.v), note: cell.dataset.note });
    press(b.closest('.scale'), off ? null : b);
  }
}
export const journal = (title, mode = 'all') => withClass(title, '', async (ctx) => {
  if (jdate.auto) jdate.v = today();
  const date = jdate.v, rows = await api('GET', `/t/journal/${state.classId}?date=${date}`);
  if (!ctx.live()) return;
  const kinds = { all: ['activity', 'behaviour'], attendance: [], behaviour: ['activity', 'behaviour'] }[mode];
  const n = (s) => rows.filter((x) => x.attendance === s).length;
  ctx.render(html`${head(title, '', html`${picker()}<label class="pick"><span>Sana</span><input type="date" id="date" value="${date}" max="${today()}"></label>`)}
    ${card(day(date), rows.length ? html`<ul class="journal k${kinds.length + (mode === 'behaviour' ? 0 : 1)}">${rows.map((s) => html`<li data-id="${s.id}"><a class="who" href="#/students/${s.id}">${avatar(s)}<span><b>${full(s)}</b>${s.camera == null ? '' : html`<small><span>Kamera: diqqat</span> ${s.camera}%</small>`}</span></a>
      ${mode === 'behaviour' ? '' : html`<div class="jc"><span>Davomat</span><div class="scale att" role="group" aria-label="Davomat">${Object.entries(ATT).map(([k, t]) => html`<button type="button" data-att="${k}" class="${k}" aria-pressed="${s.attendance === k ? 'true' : 'false'}">${t}</button>`)}</div></div>`}
      ${kinds.map((k) => html`<div class="jc" data-kind="${k}" data-note="${s.grades[k]?.note || ''}"><span>${KIND[k]}</span><div class="row tight nowrap">${scale(s.grades[k]?.value ?? null, KIND[k])}${noteBtn(s.grades[k]?.note)}</div></div>`)}</li>`)}</ul>` : empty('Bu sinfda tasdiqlangan oʻquvchi yoʻq.', 'people'),
    { aside: mode === 'behaviour' ? '' : html`<ul class="legend row-l" id="sum">${Object.entries(ATT).map(([k, t]) => html`<li class="${k}"><i></i><span>${t}</span><b>${n(k)}</b></li>`)}</ul>` })}
    <p class="fine">Bosilgan belgi darhol saqlanadi va ota-onaga xabar boradi. Olib tashlash uchun yana bir marta bosing.</p>`);
  bindPicker(ctx);
  $('#date').addEventListener('change', (e) => { if (!e.target.value) return; jdate.v = e.target.value; jdate.auto = e.target.value === today(); ctx.refresh(); });
  $('.journal', ctx.el)?.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const id = Number(b.closest('li').dataset.id), was = b.getAttribute('aria-pressed') === 'true';
    try {
      if (b.dataset.att) {
        await api('PUT', '/t/attendance', { student_id: id, date, status: was ? null : b.dataset.att });
        press(b.closest('.scale'), was ? null : b);
        $$('#sum li').forEach((li) => { $('b', li).textContent = $$(`.att .${li.className}[aria-pressed=true]`, ctx.el).length; });
      } else { const cell = b.closest('[data-kind]'); await gradeClick(b, cell, { student_id: id, kind: cell.dataset.kind, date }); }
    } catch (x) { toast(x.message, 'err'); }
  });
});

/* ---------- testlar ---------- */
export const assessments = withClass('Test natijalari', '', async (ctx) => {
  const r = await api('GET', `/t/assessments/${state.classId}`);
  if (!ctx.live()) return;
  const cur = r.items.find((a) => a.id === Number(ctx.param)), base = `#/${location.hash.slice(2).split('/')[0]}`;
  const mean = (a) => { const v = Object.values(a.results).map((x) => x.score); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  if (cur) {
    ctx.render(html`<a class="back" href="${base}">${icon('left', 18)} <span>Barcha testlar</span></a>${head(cur.title, html`<span>${SKILL[cur.skill]}</span> · <span>${day(cur.date)}</span>`, html`<button class="btn small ghost" id="del">Testni oʻchirish</button>`)}
      ${card('Natijalar', r.students.length ? html`<ul class="list scores">${r.students.map((s) => { const x = cur.results[s.id]; return html`<li><form data-id="${s.id}" class="line"><span class="who">${avatar(s)}<b>${full(s)}</b></span><label class="score"><span class="sr">Natija, foiz</span><input name="score" type="number" min="0" max="100" inputmode="numeric" value="${x?.score ?? ''}" placeholder="0–100"><i>%</i></label><input name="comment" maxlength="300" aria-label="Izoh" placeholder="Izoh (ixtiyoriy)" value="${x?.comment || ''}"><button class="btn small" type="submit" disabled>Saqlash</button></form></li>`; })}</ul>` : empty('Bu sinfda tasdiqlangan oʻquvchi yoʻq.', 'people'))}`);
    $$('.scores form').forEach((f) => {
      const b = $('button', f);
      f.noValidate = true;
      f.addEventListener('input', () => { b.disabled = false; });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (b.disabled) return;
        b.disabled = true;
        const v = values(f);
        try { await api('PUT', '/t/result', { assessment_id: cur.id, student_id: Number(f.dataset.id), score: v.score === '' ? null : Number(v.score), comment: v.comment }); toast('Saqlandi'); } catch (x) { b.disabled = false; toast(x.message, 'err'); }
      });
    });
    $('#del').addEventListener('click', act(async () => { if (!await confirmBox('Testni oʻchirasizmi?', 'Shu testdagi natijalar ham oʻchadi.', 'Oʻchirish')) return; await api('DELETE', `/t/assessments/${cur.id}`); location.hash = base; }));
    return;
  }
  ctx.render(html`${head('Test natijalari', '', html`${picker()}<button class="btn" id="add">${icon('plus', 20)} <span>Yangi test</span></button>`)}
    ${card('', r.items.length ? html`<ul class="list">${r.items.map((a) => html`<li><a class="line link" href="${base}/${a.id}"><span class="nic blue">${icon('chart', 20)}</span><div><b>${a.title}</b><small><span>${SKILL[a.skill]}</span> · ${day(a.date)}</small></div><span class="muted">${Object.keys(a.results).length} / ${r.students.length}</span><b>${pc(mean(a))}</b>${icon('next', 18)}</a></li>`)}</ul>` : empty('Hali test kiritilmagan. Birinchi testni qoʻshing, natijalar oʻsish grafigiga tushadi.', 'chart'))}`);
  bindPicker(ctx);
  $('#add').addEventListener('click', () => formBox('Yangi test', html`${field('title', 'Test nomi', { placeholder: 'Unit 4 test', maxlength: 120 })}${select('skill', 'Koʻnikma', Object.entries(SKILL))}${field('date', 'Sana', { type: 'date', value: today() })}`, 'Qoʻshish',
    async (v) => { const x = await api('POST', '/t/assessments', { ...v, class_id: state.classId }); location.hash = `${base}/${x.id}`; }));
});

/* ---------- uy vazifasi ---------- */
export const homework = withClass('Uy vazifalari', '', async (ctx) => {
  const r = await api('GET', `/t/homework/${state.classId}`);
  if (!ctx.live()) return;
  const cur = r.items.find((h) => h.id === Number(ctx.param));
  if (cur) {
    ctx.render(html`<a class="back" href="#/homework">${icon('left', 18)} <span>Barcha vazifalar</span></a>${head(cur.title, html`<span>Muddat</span>: ${day(cur.due)}`, html`<button class="btn small ghost" id="del">Vazifani oʻchirish</button>`)}${cur.details ? card('', html`<p class="pre">${cur.details}</p>`) : ''}
      ${card('Baholash', r.students.length ? html`<ul class="journal k1">${r.students.map((s) => html`<li data-id="${s.id}"><span class="who">${avatar(s)}<b>${full(s)}</b></span><div class="jc" data-note="${cur.grades[s.id]?.note || ''}"><div class="row tight nowrap">${scale(cur.grades[s.id]?.value ?? null, 'Baho')}${noteBtn(cur.grades[s.id]?.note)}</div></div></li>`)}</ul>` : empty('Bu sinfda tasdiqlangan oʻquvchi yoʻq.', 'people'))}`);
    $('.journal', ctx.el)?.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      try { await gradeClick(b, b.closest('.jc'), { student_id: Number(b.closest('li').dataset.id), kind: 'homework', homework_id: cur.id }); } catch (x) { toast(x.message, 'err'); }
    });
    $('#del').addEventListener('click', act(async () => { if (!await confirmBox('Vazifani oʻchirasizmi?', 'Shu vazifaga qoʻyilgan baholar ham oʻchadi.', 'Oʻchirish')) return; await api('DELETE', `/t/homework/${cur.id}`); location.hash = '#/homework'; }));
    return;
  }
  ctx.render(html`${head('Uy vazifalari', '', html`${picker()}<button class="btn" id="add">${icon('plus', 20)} <span>Yangi vazifa</span></button>`)}
    ${card('', r.items.length ? html`<ul class="list">${r.items.map((h) => { const n = Object.values(h.grades).filter((g) => g.value != null).length, done = r.students.length && n >= r.students.length; return html`<li><a class="line link" href="#/homework/${h.id}"><span class="nic ${done ? 'good' : 'blue'}">${icon('book', 20)}</span><div><b>${h.title}</b><small>${day(h.due)}</small></div>${chip(`${n} / ${r.students.length}`, done ? 'good' : '')}${icon('next', 18)}</a></li>`; })}</ul>` : empty('Hali vazifa berilmagan.', 'book'))}`);
  bindPicker(ctx);
  const due = new Date(); due.setDate(due.getDate() + 2);
  $('#add').addEventListener('click', () => formBox('Yangi vazifa', html`${field('title', 'Vazifa', { placeholder: 'Workbook, page 34, ex. 2', maxlength: 120 })}${field('details', 'Tavsif (ixtiyoriy)', { type: 'textarea', maxlength: 1000 })}${field('due', 'Topshirish muddati', { type: 'date', value: today(due) })}`, 'Vazifa berish',
    async (v) => { await api('POST', '/t/homework', { ...v, class_id: state.classId }); toast('Vazifa berildi'); ctx.refresh(); }));
});

/* ---------- jadval ---------- */
export const schedule = withClass('Dars jadvali', '', async (ctx) => {
  const list = (await api('GET', '/t/schedule')).filter((x) => x.class_id === state.classId);
  if (!ctx.live()) return;
  ctx.render(html`${head('Dars jadvali', '', html`${picker()}<button class="btn" id="add">${icon('plus', 20)} <span>Dars qoʻshish</span></button>`)}${list.length ? week(list, true) : card('', empty('Bu sinfning jadvali boʻsh. Birinchi darsni qoʻshing.', 'calendar'))}`);
  bindPicker(ctx);
  $$('[data-delslot]').forEach((b) => b.addEventListener('click', act(async () => { if (!await confirmBox('Dars jadvaldan olinsinmi?', 'Ota-onalar jadvalida ham koʻrinmaydi.', 'Olib tashlash')) return; await api('DELETE', `/t/schedule/${b.dataset.delslot}`); ctx.refresh(); })));
  const DAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
  $('#add').addEventListener('click', () => formBox('Dars qoʻshish', html`${select('dow', 'Kun', DAYS.map((d, i) => [i + 1, d]))}${field('subject', 'Dars', { placeholder: 'English Grammar', maxlength: 60 })}<div class="two">${field('start', 'Boshlanishi', { type: 'time', value: '09:00' })}${field('finish', 'Tugashi', { type: 'time', value: '09:45' })}</div>${select('room_id', 'Xona', [['', 'Sinf xonasi'], ...state.rooms.map((r) => [r.id, r.name])])}`, 'Qoʻshish',
    async (v) => { await api('POST', '/t/schedule', { ...v, dow: Number(v.dow), class_id: state.classId }); ctx.refresh(); }));
});

/* ---------- oʻquvchilar ---------- */
const yes = (ok, a, b) => chip(ok ? a : b, ok ? 'good' : 'bad');
export async function pendingCards() {
  const p = await api('GET', '/t/pending');
  return html`${p.students.length ? card('Yangi oʻquvchilar', html`<ul class="list">${p.students.map((s) => html`<li class="line wrap">${avatar(s, 'lg')}<div><b>${full(s)}</b><small>${s.class_name} · ${contact(s)}</small><small>${s.address}</small><small><span>Ota-onasi</span>: ${phone(s.parent_phone)}</small></div><div class="row tight"><button class="btn small" data-do="POST /t/students/${s.id}/approve">Qabul qilish</button><button class="btn small ghost" data-do="DELETE /t/students/${s.id}" data-ask="Soʻrov va oʻquvchining rasmi oʻchiriladi." data-yes="Rad etish">Rad etish</button></div></li>`)}</ul>`) : ''}
    ${p.parents.length ? card('Ota-ona soʻrovlari', html`<ul class="list">${p.parents.map((l) => html`<li class="line wrap">${avatar(l, 'lg')}<div><b>${full(l)}</b><small>${phone(l.phone)}</small><small><span>Yozgan farzandi</span>: ${l.child_first} ${l.child_last}</small><small><span>Oʻquvchi</span>: ${l.s_first} ${l.s_last}, ${l.class_name}</small><p class="row tight">${yes(l.phone_ok, 'Telefon mos', 'Telefon mos emas')}${yes(l.name_ok, 'Ism mos', 'Ism mos emas')}</p></div><div class="row tight"><button class="btn small" data-do="POST /t/links/${l.id}/approve" ${l.phone_ok ? '' : html`data-ask="Telefon raqami oʻquvchi yozgan raqamga mos emas. Bu odam haqiqatan ota-onasi ekanini tekshirdingizmi?"`}>Tasdiqlash</button><button class="btn small ghost" data-do="DELETE /t/links/${l.id}" data-ask="Ota-ona soʻrovi oʻchiriladi." data-yes="Rad etish">Rad etish</button></div></li>`)}</ul><p class="fine">Tasdiqlangan ota-ona sinf kamerasini koʻra oladi. Faqat tanigan odamingizni tasdiqlang.</p>`) : ''}`;
}
const students = async (ctx) => {
  if (ctx.param) return studentPage(ctx);
  await loadClasses();
  const pend = await pendingCards(), r = state.classId ? await api('GET', `/t/dashboard/${state.classId}`) : null;
  if (!ctx.live()) return;
  ctx.render(html`${head('Oʻquvchilar', '', picker())}${pend}${card('Sinf roʻyxati', r?.students.length ? html`<ul class="list">${r.students.map((s) => html`<li><a class="line link" href="#/students/${s.id}">${avatar(s)}<div><b>${full(s)}</b><small>${s.level}</small></div><span class="row tight">${mark(s.activity)}${mark(s.behaviour)}${mark(s.homework)}</span>${icon('next', 18)}</a></li>`)}</ul>` : empty('Hali oʻquvchi yoʻq.', 'people'))}`);
  bindPicker(ctx); bindDo(ctx);
};
export async function studentPage(ctx) {
  const r = await api('GET', `/t/students/${Number(ctx.param) || 0}`);
  if (!ctx.live()) return;
  const s = r.student, st = r.stats;
  ctx.render(html`<a class="back" href="#/students">${icon('left', 18)} <span>Oʻquvchilar</span></a>
    <section class="card profile"><div class="pf-main">${avatar(s, 'xxl')}<div><h2>${full(s)}</h2><p>${s.class_name} · <span class="mono">${r.login}</span></p><div class="row tight">${chip(`Level ${s.level}`, 'blue')}<button class="btn small ghost" id="edit">Daraja va sinf</button></div></div></div>
      <dl class="quick"><div><dt>Davomat</dt><dd>${pc(st.attendance)}</dd></div><div><dt>Faollik</dt><dd>${pc(st.activity)}</dd></div><div><dt>Intizom</dt><dd>${pc(st.behaviour)}</dd></div><div><dt>Uy vazifalari</dt><dd>${r.homeworkDone.done}/${r.homeworkDone.total}</dd></div></dl></section>
    <div class="grid split">${card('English Progress', line(r.progress.map((p) => ({ label: p.month.slice(5), full: p.month, value: p.score })), { label: 'Oylik natija', head: ['Oy', 'Natija'] }))}
      ${card('Fikr yozish', html`<form id="fb">${field('text', 'Ota-ona va oʻquvchi koʻradi', { type: 'textarea', rows: 4, maxlength: 800, placeholder: 'Nima yaxshi chiqdi va uyda nimaga eʼtibor berish kerak?' })}<button class="btn small" type="submit">Yuborish</button></form>${feedbackList(r.feedback.slice(0, 5), true)}`)}</div>
    ${card('Koʻnikmalar', html`<div class="rings six">${r.skills.map((k) => ring(k.score, { size: 96, label: SKILL[k.skill] }))}</div>`)}
    <div class="grid split">${card('Baholar', gradeRows(r.grades.slice(0, 10)))}${card('Aloqa', html`<dl class="facts"><div><dt>Oʻquvchi</dt><dd>${contact(s)}</dd></div><div><dt>Turar joy</dt><dd>${s.address}</dd></div><div><dt>Ota-ona raqami</dt><dd><a href="tel:+998${s.parent_phone}">${phone(s.parent_phone)}</a></dd></div></dl>
      <ul class="list">${r.parents.map((p) => html`<li class="line wrap">${avatar(p)}<div><b>${full(p)}</b><small>${phone(p.phone)} · ${p.login}</small></div>${p.status === 'approved' ? html`<label class="switch"><input type="checkbox" data-cam="${p.link_id}" ${p.camera ? html`checked` : ''}><i></i><span>Kamera</span></label><button class="btn small ghost" data-reset="${p.id}" data-name="${full(p)}">Yangi parol</button>` : chip('Kutilmoqda', 'warn')}<button class="btn small ghost" data-do="DELETE /t/links/${p.link_id}" data-ask="Bu odam oʻquvchi maʼlumotlarini va kamerani koʻra olmaydi." data-yes="Uzish">Uzish</button></li>`)}</ul><button class="btn small ghost" data-reset="${s.id}" data-name="${full(s)}">${icon('key', 18)} <span>Oʻquvchiga yangi parol</span></button>`)}</div>
    ${card('Testlar', assessTable(r.assessments))}
    ${card('Roʻyxatdan chiqarish', html`<p class="mb">Oʻquvchining rasmi, baholari va kamera maʼlumotlari butunlay oʻchiriladi.</p><button class="btn danger" id="rm">Oʻquvchini oʻchirish</button>`)}`);
  bindDo(ctx); bindReset(ctx);
  onSubmit($('#fb'), async (v) => { await api('POST', '/t/feedback', { student_id: s.id, text: v.text }); toast('Fikr yuborildi'); ctx.refresh(); });
  $$('[data-delfb]').forEach((b) => b.addEventListener('click', act(async () => { if (!await confirmBox('Fikr oʻchirilsinmi?', 'Ota-ona ham koʻrmaydi.', 'Oʻchirish')) return; await api('DELETE', `/t/feedback/${b.dataset.delfb}`); ctx.refresh(); })));
  $$('[data-cam]').forEach((i) => i.addEventListener('change', async () => { try { await api('PUT', `/t/links/${i.dataset.cam}/camera`, { on: i.checked }); toast(i.checked ? 'Kameraga ruxsat berildi' : 'Kameraga ruxsat yopildi'); } catch (e) { i.checked = !i.checked; toast(e.message, 'err'); } }));
  $('#edit').addEventListener('click', () => formBox('Daraja va sinf', html`${select('level', 'Daraja', ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((x) => [x, x]), s.level)}${select('class_id', 'Sinf', state.classes.map((c) => [c.id, c.name]), s.class_id)}`, 'Saqlash', async (v) => { await api('PATCH', `/t/students/${s.id}`, v); ctx.refresh(); }));
  $('#rm').addEventListener('click', act(async () => {
    if (!await confirmBox('Oʻquvchini oʻchirasizmi?', `${full(s)}: barcha maʼlumot qaytarib boʻlmaydigan qilib oʻchiriladi.`, 'Oʻchirish')) return;
    await api('DELETE', `/t/students/${s.id}`); toast('Oʻchirildi'); location.hash = '#/students';
  }));
}

/* ---------- sozlamalar ---------- */
async function settings(ctx) {
  await loadClasses();
  const [{ code }, { user: u }] = await Promise.all([api('GET', '/t/code'), api('GET', '/me')]);
  if (!ctx.live()) return;
  await settingsPage(ctx, html`${card('Ommaviy profil', html`<form id="prof">${field('position', 'Lavozim', { value: u.position, placeholder: 'Senior English Teacher', maxlength: 80 })}${field('experience', 'Tajriba (yil)', { type: 'number', value: u.experience, min: 0, max: 60 })}${field('bio', 'Oʻzi haqida', { type: 'textarea', value: u.bio, maxlength: 400 })}<label class="switch"><input type="checkbox" name="public" value="1" ${u.public ? html`checked` : ''}><i></i><span>Profilimni bosh sahifada koʻrsatish</span></label><button class="btn" type="submit">Saqlash</button></form>`)}
    ${card('Sinflarim', html`<ul class="list">${state.classes.map((c) => html`<li class="line"><div><b>${c.name}</b><small><span>${c.course || 'English'}</span> · ${c.students} <span>oʻquvchi</span>${c.room ? ` · ${c.room}` : ''}</small></div><button class="iconbtn sm" data-editcls="${c.id}" aria-label="Tahrirlash">${icon('edit', 18)}</button><button class="iconbtn sm" data-do="DELETE /t/classes/${c.id}" data-title="Sinf oʻchirilsinmi?" data-ask="Boʻsh sinf roʻyxatdan oʻchadi." data-yes="Oʻchirish" aria-label="Oʻchirish">${icon('trash', 18)}</button></li>`)}</ul><button class="btn small ghost" id="addc">${icon('plus', 18)} <span>Sinf ochish</span></button><p class="fine"><span>Hamkasbingiz roʻyxatdan oʻtishi uchun maktab kodi</span>: <b class="mono">${code}</b></p>`)}`, () => {
    onSubmit($('#prof'), async (v) => { await api('PUT', '/me/profile', { ...v, public: v.public === '1' }); toast('Saqlandi'); });
    bindDo(ctx);
    $('#addc').addEventListener('click', () => formBox('Sinf ochish', html`${field('name', 'Sinf nomi', { placeholder: '8-B', cap: 'characters', maxlength: 16 })}${field('course', 'Kurs', { placeholder: 'English Intermediate', maxlength: 60 })}`, 'Ochish', async (v) => { await api('POST', '/t/classes', v); ctx.refresh(); }));
    $$('[data-editcls]').forEach((b) => b.addEventListener('click', () => editClass(ctx, state.classes.find((c) => c.id === Number(b.dataset.editcls)))));
  });
}
export const editClass = (ctx, c, teachers) => formBox('Sinfni tahrirlash', html`${field('name', 'Sinf nomi', { value: c.name, cap: 'characters', maxlength: 16 })}${field('course', 'Kurs', { value: c.course, placeholder: 'English Intermediate', maxlength: 60 })}${select('room_id', 'Xona', [['', 'Belgilanmagan'], ...state.rooms.map((r) => [r.id, r.name])], c.room_id || '')}${teachers ? select('teacher_id', 'Oʻqituvchi', teachers.map((t) => [t.id, full(t)]), c.teacher_id) : ''}`, 'Saqlash', async (v) => { await api('PATCH', `/t/classes/${c.id}`, v); ctx.refresh(); });

export const bottom = () => ['dashboard', 'register', 'live', 'schedule', 'settings'];
export const pages = () => [
  { id: 'dashboard', uz: 'Dashboard', short: 'Bosh', icon: 'home', page: dashboard },
  { id: 'live', uz: 'Jonli dars', short: 'Kamera', icon: 'camera', page: livePage, badge: () => (camera.running ? 'LIVE' : '') },
  { id: 'register', uz: 'Jurnal', icon: 'calendar', page: journal('Jurnal') },
  { id: 'assessments', uz: 'Test natijalari', icon: 'chart', page: assessments },
  { id: 'homework', uz: 'Uy vazifalari', icon: 'book', page: homework },
  { id: 'students', uz: 'Oʻquvchilar', icon: 'people', page: students, badge: () => state.pending || '' },
  { id: 'schedule', uz: 'Dars jadvali', short: 'Jadval', icon: 'clock', page: schedule },
  { id: 'notifications', uz: 'Bildirishnomalar', icon: 'bell', page: (ctx) => notificationsPage(ctx) },
  { id: 'settings', uz: 'Sozlamalar', short: 'Profil', icon: 'gear', page: settings },
];
