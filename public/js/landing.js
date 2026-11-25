/* Bosh sahifa. Mockupdagi qiymatlar mahsulot namunasi, real raqamlar /api/public dan. */
import { html, put, $, $$, api, icon, logo, field, phoneField, onSubmit, toast, full, countUp } from './ui.js';
import { line, ring, bar } from './charts.js';
import { langPicker, bindLang } from './i18n.js';

const MENU = [['bosh', 'Bosh sahifa'], ['haqida', 'HISCHOOL haqida'], ['kurslar', 'Kurslar'], ['oqituvchilar', 'Oʻqituvchilar'], ['natijalar', 'Natijalar'], ['ota-onalar', 'Ota-onalar uchun'], ['aloqa', 'Aloqa']];
const LEVELS = [
  ['A1', 'Beginner', 'Alifbo, salomlashish, oddiy gaplar.', 20], ['A2', 'Elementary', 'Kundalik mavzular, oʻtgan va kelasi zamon.', 38], ['B1', 'Intermediate', 'Erkin suhbat, fikrni asoslash, matn bilan ishlash.', 56],
  ['B2', 'Upper-intermediate', 'Murakkab mavzular, insho, tez nutqni tushunish.', 76], ['C1', 'Advanced', 'Akademik ingliz tili va xalqaro imtihonlar.', 96],
];

const mock = () => html`<div class="mock" aria-hidden="true"><div class="mock-side">${logo()}${['home', 'calendar', 'chart', 'star', 'camera', 'chat'].map((x, i) => html`<i class="${i ? '' : 'on'}">${icon(x, 18)}</i>`)}</div>
  <div class="mock-main"><div class="mock-top"><div><small>Assalomu alaykum, Dilshod</small><b>Azizbekning bugungi darsi</b></div></div>
    <div class="mock-stats">
      <div><small>Attendance</small><b><span data-count="96">96</span>%</b><em class="up">+4.2%</em></div><div><small>English level</small><b>B1</b><em>Intermediate</em></div>
      <div><small>Homework</small><b><span data-count="92">92</span>%</b><em class="up">+2.1%</em></div><div><small>Discipline</small><b><span data-count="98">98</span>%</b><em class="up">+1.0%</em></div></div>
    <div class="mock-row"><div class="mock-chart"><small>English Progress</small><svg viewBox="0 0 300 110" preserveAspectRatio="none" class="draw"><path class="fill" d="M0 88C40 84 45 74 75 70S120 62 150 52s45-8 75-22 45-10 75-16V110H0z"/><path class="ln" pathLength="1" d="M0 88C40 84 45 74 75 70S120 62 150 52s45-8 75-22 45-10 75-16"/></svg></div>
      <div class="mock-lesson"><small>Today’s lesson</small><b>English Grammar</b><span>09:00 – 09:45</span><span>Classroom 203</span></div></div></div></div>
  <div class="float f1"><span class="ava">JS</span><div><small>Teacher feedback</small><p>“Bugun juda faol qatnashdi va barcha topshiriqlarni bajardi.”</p></div></div>
  <div class="float f2"><i class="live-dot"></i><div><small>Classroom 203</small><b>Jonli dars</b></div></div>`;

const room = () => html`<div class="lroom" aria-hidden="true"><svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice"><rect width="640" height="360" fill="#0e2146"/><rect x="150" y="38" width="340" height="120" rx="6" fill="#15305f"/><path d="M190 78h150M190 100h220M190 122h110" stroke="#4f86ff" stroke-width="5" stroke-linecap="round" opacity=".7"/><g fill="#1b3a70">${[0, 1, 2].map((r) => [0, 1, 2, 3].map((k) => html`<rect x="${70 + k * 130 - r * 6}" y="${196 + r * 56}" width="${100 + r * 6}" height="14" rx="4"/>`))}</g>
  ${[0, 1].map((r) => [0, 1, 2, 3].map((k) => html`<g transform="translate(${118 + k * 130} ${178 + r * 56})"><path d="M-24 34c2-18 12-24 24-24s22 6 24 24z" fill="${(k + r) % 2 ? '#31589c' : '#274a86'}"/><circle r="14" fill="#d9b08c"/>${r === 1 && k === 1 ? html`<path d="M-14-3c2-14 26-14 28 0-8-5-20-5-28 0z" fill="#2a1a10"/><circle cx="-5" cy="1" r="1.600" fill="#2a1a10"/><circle cx="5" cy="1" r="1.600" fill="#2a1a10"/><path d="M-4 6q4 3 8 0" stroke="#2a1a10" fill="none" stroke-width="1.500"/><rect x="-24" y="-24" width="48" height="50" rx="6" fill="none" stroke="#22d3ee" stroke-width="3"/>` : html`<g>${[0, 1, 2, 3].map((a) => [0, 1, 2, 3].map((b) => html`<rect x="${-16 + a * 8}" y="${-16 + b * 8}" width="8" height="8" fill="${['#7d93b8', '#9fb0cc', '#b9a994', '#6d84ab'][(a * 3 + b * 5 + k) % 4]}"/>`))}</g>`}</g>`))}</svg>
  <span class="hud tl"><i class="live-dot"></i>LIVE</span><span class="hud tr">Classroom 203</span><span class="hud bl">English · Intermediate</span><span class="hud br">${icon('shield', 16)} Himoyalangan</span></div>`;

export function landing(app) {
  put(app, html`<div class="land">
  <header class="nav" id="nav"><a href="#bosh" class="nav-logo" aria-label="HISCHOOL">${logo()}</a><nav aria-label="Asosiy menyu">${MENU.map(([id, t]) => html`<a href="#${id}">${t}</a>`)}</nav>
    <div class="nav-end">${langPicker()}<a class="btn text" href="#/login">Kirish</a><a class="btn small" href="#/join">Roʻyxatdan oʻtish</a><button class="iconbtn burger" id="burger" aria-label="Menyu" aria-expanded="false">${icon('menu')}</button></div></header>
  <div class="sheetnav" id="sheetnav" hidden>${MENU.map(([id, t]) => html`<a href="#${id}">${t}</a>`)}<a class="btn" href="#/join">Roʻyxatdan oʻtish</a><a class="btn ghost" href="#/login">Kirish</a></div>

  <section class="hero" id="bosh"><div class="wrap hero-in"><div class="hero-text"><h1>Farzandingizning ingliz tilidagi rivojlanishini har kuni kuzating.</h1>
    <p>HISCHOOL — ingliz tilini oʻrganish, natijalarni kuzatish va ota-onalar uchun farzandining taʼlim jarayonini nazorat qilish imkonini beruvchi zamonaviy taʼlim platformasi.</p>
    <div class="row"><a class="btn big" href="#/join">Hoziroq boshlash</a><a class="btn big glass" href="#ota-onalar">Platformani koʻrish</a></div></div>
    <div class="stage" id="stage">${mock()}</div></div></section>

  <section class="sec" id="haqida"><div class="wrap"><div class="sec-h reveal"><h2>Oʻquvchi, oʻqituvchi va ota-ona bitta tizimda</h2><p>Darsda sodir boʻlgan har bir muhim narsa oʻsha kuniyoq ota-onaga yetib boradi. Telefon qilish yoki majlis kutish shart emas.</p></div>
    <ol class="flow reveal"><li>${icon('cap', 26)}<b>Oʻqituvchi</b><p>Darsni oʻtadi, davomat, baho va fikrini bir necha soniyada kiritadi.</p></li><li class="mid">${logo()}<p>Maʼlumot himoyalangan holda saqlanadi va faqat tegishli odamga ochiladi.</p></li><li>${icon('people', 26)}<b>Ota-ona va oʻquvchi</b><p>Natijani, vazifani va tavsiyani oʻz telefonida koʻradi.</p></li></ol></div></section>

  <section class="sec soft"><div class="wrap"><div class="sec-h reveal"><h2>Bitta platformada oltita imkoniyat</h2></div>
    <div class="bento">
      <article class="b1 reveal"><div><h3>Academic Progress</h3><p>Farzandingizning baholari va rivojlanishini kuzating.</p></div><div class="b-vis">${bar('Vocabulary', 95)}${bar('Listening', 94)}${bar('Grammar', 92)}</div></article>
      <article class="b2 reveal"><div><h3>Attendance</h3><p>Darslarga qatnashish holatini real vaqtga yaqin koʻrib boring.</p></div><div class="b-vis dots">${Array.from({ length: 28 }, (_, i) => html`<i class="${[9, 22].includes(i) ? 'late' : i === 17 ? 'absent' : 'present'}"></i>`)}</div></article>
      <article class="b3 reveal"><div><h3>Discipline</h3><p>Oʻquvchining darsdagi odobi va faolligi haqida maʼlumot oling.</p></div><div class="b-vis">${ring(98, { size: 112 })}</div></article>
      <article class="b4 dark reveal"><div><h3>Classroom Monitoring</h3><p>Dars kamerasi orqali farzandingizning dars jarayonidagi holatini kuzatish imkoniyati.</p></div>${room()}</article>
      <article class="b5 reveal"><div><h3>Teacher Feedback</h3><p>Oʻqituvchining farzandingiz haqidagi fikr va tavsiyalarini koʻring.</p></div><div class="b-vis quote"><span class="ava">JS</span><p>“Speaking boʻyicha katta oʻsish bor. Uyda 10 daqiqa ovoz chiqarib oʻqish tavsiya qilinadi.”</p></div></article>
      <article class="b6 reveal"><div><h3>Progress Analytics</h3><p>Farzandingizning vaqt davomida qanday rivojlanayotganini grafiklarda koʻring.</p></div><svg viewBox="0 0 300 110" preserveAspectRatio="none" class="draw spark" aria-hidden="true"><path class="fill" d="M0 92C50 86 60 60 100 66s60-28 100-30 60-16 100-22V110H0z"/><path class="ln" pathLength="1" d="M0 92C50 86 60 60 100 66s60-28 100-30 60-16 100-22"/></svg></article>
    </div></div></section>

  <section class="sec" id="ota-onalar"><div class="wrap parents"><div class="parents-text reveal"><h2>Ota-onalar uchun: kuniga bir daqiqa yetarli</h2><p>Telefoningizda bitta ekran. Bugun farzandingiz darsga keldimi, qanday qatnashdi va uyga nima berildi.</p>
    <ul class="ticks"><li>${icon('bell', 20)}<div><b>Darhol xabar</b><p>Davomat, yangi baho va oʻqituvchi fikri kelishi bilan bilasiz.</p></div></li><li>${icon('chart', 20)}<div><b>Oydan oyga solishtirish</b><p>Har bir koʻrsatkich oldingi oyga nisbatan qanday oʻzgargani koʻrinadi.</p></div></li><li>${icon('star', 20)}<div><b>Konstruktiv fikr</b><p>Maʼlumot bolani ayblash uchun emas, unga yordam berish uchun.</p></div></li></ul><a class="btn" href="#/join/parent">Ota-ona sifatida boshlash</a></div>
    <div class="phonewrap reveal" aria-hidden="true"><div class="phonebox"><div class="ph-top"><small>Bugun, 14:20</small><b>Azizbek</b></div><div class="ph-grid"><div><small>Davomat</small><b>96%</b></div><div><small>Oʻrtacha baho</small><b>4.8</b></div><div><small>Faollik</small><b>92%</b></div><div><small>Intizom</small><b>98%</b></div></div>
      <div class="ph-list"><p><i class="good"></i>Azizbek bugungi English darsiga qatnashdi.</p><p><i class="blue"></i>Yangi test natijasi: Grammar, 94%</p><p><i class="blue"></i>John Smith yangi fikr yubordi.</p></div><div class="ph-nav">${['home', 'chart', 'camera', 'calendar', 'child'].map((x, i) => html`<span class="${i ? '' : 'on'}">${icon(x, 20)}</span>`)}</div></div></div></div></section>

  <section class="sec navy"><div class="wrap liveblock"><div class="reveal"><h2>Live Classroom: shaffof va xavfsiz</h2><p>Jonli darsga faqat tasdiqlangan ota-onalar kira oladi. Har bir ota-ona faqat oʻz farzandining yuzini ochiq koʻradi.</p>
      <ul class="plain"><li>${icon('shield', 20)} Ruxsatni administrator beradi va istalgan payt bekor qiladi</li><li>${icon('eye', 20)} Boshqa oʻquvchilarning yuzi avtomatik xiralashtiriladi</li><li>${icon('lock', 20)} Video va ovoz serverga yozib olinmaydi</li><li>${icon('clock', 20)} Kim, qachon koʻrgani qayd etiladi</li></ul></div><div class="reveal">${room()}</div></div></section>

  <section class="sec" id="kurslar"><div class="wrap"><div class="sec-h reveal"><h2>Kurslar: A1 dan C1 gacha aniq yoʻl</h2><p>Darajalar xalqaro CEFR shkalasi boʻyicha. Oʻquvchining hozirgi darajasi profilida koʻrinib turadi.</p></div>
    <ol class="ladder">${LEVELS.map(([l, n, d, v]) => html`<li class="reveal" style="--h:${v}"><div class="step"><b>${l}</b></div><h3>${n}</h3><p>${d}</p></li>`)}</ol></div></section>

  <section class="sec soft" id="oqituvchilar"><div class="wrap"><div class="sec-h reveal"><h2>Oʻqituvchilar</h2><p>Tajriba va ota-onalar bahosi ochiq. Bahoni faqat shu oʻqituvchining guruhida farzandi oʻqiydigan ota-ona qoʻyadi.</p></div><div id="teachers" class="teachers"></div></div></section>

  <section class="sec" id="natijalar"><div class="wrap results"><div class="reveal"><h2>Natija raqamlarda koʻrinadi</h2><p>Oltita koʻnikma alohida oʻlchanadi: Grammar, Vocabulary, Speaking, Listening, Reading va Writing. Har oy grafikka yangi nuqta qoʻshiladi.</p><div id="numbers" class="numbers"></div></div>
    <div class="card reveal"><div class="card-head"><h3>English Progress</h3><span class="chip">Namuna</span></div>${line([['Yan', 58], ['Fev', 64], ['Mar', 71], ['Apr', 79], ['May', 88]].map(([label, value]) => ({ label, value })), { label: 'Namuna: besh oylik oʻsish' })}</div></div></section>

  <section class="sec navy secure"><div class="wrap"><div class="sec-h reveal"><h2>Maʼlumot faqat egasiga ochiladi</h2></div><div class="secgrid">${[['people', 'Rolga asoslangan kirish', 'Admin, oʻqituvchi, ota-ona va oʻquvchi faqat oʻziga tegishli maʼlumotni koʻradi.'], ['key', 'Himoyalangan parollar', 'Parollar shifrlangan holda saqlanadi, xato urinishlar cheklanadi.'], ['device', 'Sessiya nazorati', 'Qaysi qurilmadan kirilganini koʻrasiz va bir bosishda chiqarib yuborasiz.'], ['shield', 'Administrator tasdigʻi', 'Har bir foydalanuvchini administrator tasdiqlaydi. Tasdiqsiz ilova ochilmaydi.']].map(([i, t, d]) => html`<div class="reveal">${icon(i, 26)}<h3>${t}</h3><p>${d}</p></div>`)}</div></div></section>

  <section class="sec" id="aloqa"><div class="wrap contact"><div class="reveal"><h2>Savolingiz bormi?</h2><p>Raqamingizni qoldiring, toʻgarak administratori siz bilan bogʻlanadi.</p></div><form class="card reveal" id="msg">${field('name', 'Ismingiz', { autocomplete: 'name', maxlength: 40 })}${phoneField('phone', 'Telefon raqamingiz')}${field('text', 'Xabar', { type: 'textarea', maxlength: 1000 })}<button class="btn wide" type="submit">Xabar yuborish</button></form></div></section>

  <section class="final"><div class="wrap reveal"><h2>Farzandingizning bugungi darsidan boshlang.</h2><a class="btn big" href="#/join">Roʻyxatdan oʻtish</a></div></section>
  <footer class="foot"><div class="wrap">${logo()}<nav aria-label="Pastki menyu">${MENU.slice(1).map(([id, t]) => html`<a href="#${id}">${t}</a>`)}</nav><p>© ${new Date().getFullYear()} HISCHOOL</p></div></footer></div>`);

  bindLang(app);
  const nav = $('#nav'), sheet = $('#sheetnav'), burger = $('#burger');
  const onScroll = () => nav.classList.toggle('solid', scrollY > 24);
  const close = () => { sheet.hidden = true; burger.setAttribute('aria-expanded', 'false'); nav.classList.remove('open'); };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  burger.addEventListener('click', () => { sheet.hidden = !sheet.hidden; burger.setAttribute('aria-expanded', String(!sheet.hidden)); nav.classList.toggle('open', !sheet.hidden); });
  sheet.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });

  // Mockup sichqonchaga yengil ergashadi.
  const stage = $('#stage');
  const move = (e) => {
    const r = stage.getBoundingClientRect();
    stage.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -5}deg`);
    stage.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 7}deg`);
  };
  if (matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) stage.addEventListener('pointermove', move);

  const spy = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) $$('nav a', nav).forEach((a) => a.classList.toggle('on', a.hash === '#' + e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  MENU.forEach(([id]) => { const s = document.getElementById(id); if (s) spy.observe(s); });

  onSubmit($('#msg'), async (v) => { await api('POST', '/public/message', v); $('#msg').reset(); toast('Xabaringiz yuborildi. Tez orada bogʻlanamiz.'); });
  api('GET', '/public').then((r) => {
    if (!$('#teachers')) return;
    put($('#teachers'), r.teachers.length ? html`${r.teachers.map((t) => html`<article class="tcard"><span class="ava xl" aria-hidden="true">${t.first[0]}${t.last[0]}${t.has_photo ? html`<img src="/api/public/photo/${t.id}" alt="">` : ''}</span><h3>${full(t)}</h3><p>${t.position || 'English Teacher'}</p><dl>${t.experience != null ? html`<div><dt>Tajriba</dt><dd>${t.experience} <span>yil</span></dd></div>` : ''}<div><dt>Oʻquvchilar</dt><dd>${t.students}</dd></div>${t.rating ? html`<div><dt>Mamnun ota-onalar</dt><dd>${t.rating.pct}%</dd></div>` : ''}</dl>${t.bio ? html`<p class="bio">${t.bio}</p>` : ''}</article>`)}`
      : html`<p class="note">Oʻqituvchilar profillari tayyorlanmoqda. Har bir oʻqituvchi roziligi bilan shu yerda chiqadi.</p>`);
    const s = r.stats;
    if (s.students >= 5) put($('#numbers'), html`<div><b data-count="${s.students}">${s.students}</b><span>oʻquvchi</span></div><div><b data-count="${s.teachers}">${s.teachers}</b><span>oʻqituvchi</span></div><div><b data-count="${s.lessons}">${s.lessons}</b><span>jonli dars</span></div>`);
  }).catch(() => {});
  $$('.mock [data-count]').forEach(countUp);
  return () => { removeEventListener('scroll', onScroll); spy.disconnect(); };
}
export const isSection = (hash) => MENU.some(([id]) => '#' + id === hash);
