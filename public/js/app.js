import { html, put, $, $$, api, state, toast, icon, logo, field, phoneField, onSubmit, setError, passCard, full, avatar, skeleton, Poller, act } from './ui.js';
import { langPicker, bindLang, tr, ready } from './i18n.js';
import { analysePhoto, toCanvas, loadFace } from './face.js';
import { landing, isSection } from './landing.js';
import { describe } from './common.js';
import * as school from './school.js';
import * as admin from './admin.js';
import * as family from './family.js';

const app = $('#app');
let leave = null; // joriy sahifani tozalash
let token = 0;
let view = ''; // qaysi qobiq chizilgan: landing, auth, shell

/* ---------- kirish va roʻyxatdan oʻtish ---------- */
const ROLES = [['student', 'Oʻquvchi', 'Baholar, vazifalar va dars jadvali', 'book'], ['parent', 'Ota-ona', 'Farzandning taʼlim jarayoni', 'people'], ['teacher', 'Oʻqituvchi', 'Guruh, jurnal va jonli dars', 'cap']];
const remembered = () => { try { return localStorage.getItem('hs-login') || ''; } catch { return ''; } };
const remember = (l) => { try { localStorage.setItem('hs-login', l); } catch { /* ixtiyoriy */ } };

function auth(body) {
  view = 'auth';
  put(app, html`<main class="auth"><aside class="auth-art"><a href="#bosh">${logo()}</a><div><h2>Bugungi dars, bugungi natija.</h2><p>Bitta kirish bilan davomat, baholar, vazifalar va oʻqituvchi fikri.</p></div><p class="auth-safe">${icon('shield', 18)} <span>Himoyalangan ulanish va rolga asoslangan kirish</span></p></aside>
    <div class="auth-main"><div class="auth-top"><a class="back" href="#bosh">${icon('left', 18)} <span>Bosh sahifa</span></a>${langPicker()}</div><div class="auth-body">${body}</div></div></main>`);
  bindLang(app);
}

function login() {
  auth(html`<form id="login"><h1>Kirish</h1><p class="sub">Login, telefon yoki Telegram nik bilan kiring.</p>
    ${field('login', 'Login', { value: remembered(), placeholder: 'HS-1234', autocomplete: 'username', cap: 'none' })}
    ${field('password', 'Parol', { type: 'password', placeholder: 'apple-river-123', autocomplete: 'current-password', cap: 'none' })}
    <button class="btn wide" type="submit">Kirish</button><p class="fine">Parolni unutgan boʻlsangiz, administrator yangisini beradi.</p><p class="alt"><span>Hisobingiz yoʻqmi?</span> <a href="#/join">Roʻyxatdan oʻtish</a></p></form>`);
  onSubmit($('#login'), async (v) => { const { user } = await api('POST', '/login', v); remember(v.login); await enter(user); });
}
const joinPick = () => auth(html`<h1>Roʻyxatdan oʻtish</h1><p class="sub">Siz kimsiz?</p><div class="roles">${ROLES.map(([r, t, d, i]) => html`<a href="#/join/${r}">${icon(i, 26)}<span><b>${t}</b><small>${d}</small></span>${icon('next', 20)}</a>`)}</div><p class="alt"><span>Hisobingiz bormi?</span> <a href="#/login">Kirish</a></p>`);

async function join(role) {
  const info = ROLES.find((r) => r[0] === role);
  if (!info) return joinPick();
  const names = html`<div class="two">${field('first', 'Ism', { autocomplete: 'given-name', maxlength: 40 })}${field('last', 'Familiya', { autocomplete: 'family-name', maxlength: 40 })}</div>`;
  const body = {
    student: () => html`${names}
      <fieldset class="field"><legend>Qanday bogʻlanamiz?</legend><div class="seg"><label><input type="radio" name="contact" value="phone" checked><span>Telefon raqam</span></label><label><input type="radio" name="contact" value="telegram"><span>Telegram nik</span></label></div></fieldset>
      <div data-contact="phone">${phoneField('phone', 'Telefon raqamingiz')}</div><div data-contact="telegram" hidden>${field('telegram', 'Telegram nik', { placeholder: '@ali_valiyev', cap: 'none', maxlength: 33 })}</div>
      ${field('address', 'Turar joy', { placeholder: 'Shahar, mahalla, koʻcha, uy', autocomplete: 'street-address' })}${phoneField('parent_phone', 'Ota-onaning telefon raqami')}
      <div class="field" data-field="photo"><span>Rasm (kamera sizni tanishi uchun)</span><div class="selfie"><div class="selfie-view" id="view">${icon('child', 88)}</div><div class="selfie-side"><p id="photo-msg">Bitta oʻzingiz, yorugʻ joyda, kameraga toʻgʻri qarab.</p><div class="row tight"><button type="button" class="btn small" id="cam">Kamerani yoqish</button><label class="btn small ghost"><span>Fayldan tanlash</span><input type="file" id="file" accept="image/*" capture="user" hidden></label></div></div></div><em class="err"></em></div>
      <label class="check field" data-field="consent"><input type="checkbox" name="consent" value="1"><span>Ota-onam rozi: rasmim dars kamerasida meni tanish uchun shu toʻgarak serverida saqlanadi.</span><em class="err"></em></label>`,
    parent: () => html`${names}${phoneField('phone', 'Telefon raqamingiz')}<h2 class="sub2">Farzandingiz</h2><div class="two">${field('child_first', 'Farzandning ismi', { maxlength: 40 })}${field('child_last', 'Farzandning familiyasi', { maxlength: 40 })}</div><p class="fine">Administrator tasdiqlagach, farzandingizning baholari va jonli dars ochiladi.</p>`,
    teacher: () => html`${names}${phoneField('phone', 'Telefon raqamingiz')}`,
  }[role]();
  auth(html`<form id="join"><a class="back" href="#/join">${icon('left', 18)} <span>Orqaga</span></a><h1>${info[1]}</h1><p class="sub">${info[2]}</p>${body}<button class="btn wide" type="submit">Soʻrov yuborish</button><p class="fine">Soʻrov administratorga boradi. U tasdiqlagach, ilova ochiladi.</p></form>`);
  const form = $('#join');
  const photo = role === 'student' ? selfie(form) : null;
  leave = () => photo?.stop();
  $$('[name=contact]', form).forEach((r) => r.addEventListener('change', () => $$('[data-contact]', form).forEach((d) => { d.hidden = d.dataset.contact !== r.value; })));
  onSubmit(form, async (v) => {
    if (photo) {
      if (!photo.data) return setError(form, 'photo', 'Oʻquvchining rasmi kerak.');
      Object.assign(v, { photo: photo.data, descriptor: photo.descriptor, consent: v.consent === '1' });
    }
    const r = await api('POST', '/register/' + role, v);
    photo?.stop();
    remember(r.login);
    auth(html`<h1>Soʻrov yuborildi</h1><p class="sub">Bu login va parolni saqlab qoʻying. Keyingi safar shu bilan tez kirasiz. Parol boshqa koʻrsatilmaydi.</p>${passCard(full(r.user), r.login, r.password)}<button class="btn wide" id="go">Saqladim, davom etish</button><p class="fine">Shu qurilmada 180 kungacha parolsiz ochiladi.</p>`);
    $('#go').addEventListener('click', () => enter(r.user));
  });
}

/** Roʻyxatdan oʻtish rasmi: kamera yoki fayl, yuz darhol tekshiriladi. */
function selfie(form) {
  const p = { data: null, descriptor: null, stop };
  const viewEl = $('#view', form), msg = $('#photo-msg', form), btn = $('#cam', form);
  let stream, busy = false;
  const tell = (text, cls = '') => { msg.className = cls; msg.textContent = tr(text); };
  function stop() { stream?.getTracks().forEach((t) => t.stop()); stream = null; }
  if (!navigator.mediaDevices?.getUserMedia) btn.hidden = true;
  async function accept(src) {
    if (busy) return;
    busy = true; btn.disabled = true;
    $('[data-field=photo]', form).classList.remove('bad');
    const c = toCanvas(src, 800);
    viewEl.replaceChildren(c);
    stop();
    p.data = p.descriptor = null;
    tell('Yuz tekshirilmoqda…');
    try {
      let okModel = true;
      try { await loadFace(); } catch { okModel = false; }
      if (okModel) p.descriptor = await analysePhoto(c);
      p.data = c.toDataURL('image/jpeg', 0.88);
      tell(okModel ? 'Yuz aniq koʻrindi. Rasm tayyor.' : 'Rasm saqlandi. Yuz oʻqituvchi kompyuterida tekshiriladi.', 'good');
    } catch (e) { tell(e.message, 'wrong'); }
    btn.textContent = tr('Qayta olish'); btn.disabled = false; busy = false;
  }
  btn.addEventListener('click', async () => {
    const live = $('video', viewEl);
    if (live && stream) return accept(live);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
      const v = Object.assign(document.createElement('video'), { muted: true, playsInline: true, srcObject: stream });
      viewEl.replaceChildren(v);
      await v.play();
      loadFace().catch(() => {});
      btn.textContent = tr('Rasmga olish'); tell('Kameraga toʻgʻri qarang va «Rasmga olish»ni bosing.');
    } catch { tell('Kamera ochilmadi. Rasmni fayldan tanlang.', 'wrong'); }
  });
  $('#file', form).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.src = url;
    try { await img.decode(); await accept(img); } catch { tell('Bu faylni ochib boʻlmadi. JPG yoki PNG tanlang.', 'wrong'); }
    URL.revokeObjectURL(url);
    e.target.value = '';
  });
  return p;
}

/* ---------- ilova qobigʻi ---------- */
const book = () => ({ admin, teacher: school }[state.user.role] || family);
const ROLE_NAME = { admin: 'Administrator', teacher: 'Oʻqituvchi', parent: 'Ota-ona', student: 'Oʻquvchi' };

async function start(user) {
  state.user = user;
  const listeners = new Set();
  state.bus = { on: (f) => (listeners.add(f), () => listeners.delete(f)) };
  state.bus.poller = new Poller((d) => {
    if (d.t === 'unread') { state.user.unread = d.n; badges(); }
    if (d.t === 'notif') toast(describe(d).text, 'info');
    listeners.forEach((f) => f(d));
  });
  await book().init?.();
}
/** Administrator tasdiqlamaguncha faqat shu sahifa koʻrinadi. Tasdiqlangach, ilova oʻzi ochiladi. */
function waitPage() {
  const u = state.waiting;
  auth(html`<div class="wait">${icon('clock', 44)}<h1>Soʻrovingiz yuborildi</h1><p class="sub">Administrator tasdiqlagach, ilova shu yerda oʻzi ochiladi. Sahifani yopib, keyinroq kirsangiz ham boʻladi.</p>
    <dl class="facts"><div><dt>Ism</dt><dd>${full(u)}</dd></div><div><dt>Siz</dt><dd>${ROLE_NAME[u.role]}</dd></div><div><dt>Login</dt><dd class="mono">${u.login}</dd></div></dl>
    <button class="btn wide" id="check">Holatni tekshirish</button><button class="btn ghost wide" id="out">Chiqish</button></div>`);
  const check = async (loud) => {
    try {
      const { user } = await api('GET', '/me');
      if (!state.waiting) return;
      if (!user) { state.waiting = null; toast('Soʻrov rad etilgan. Administrator bilan bogʻlaning.', 'err'); location.hash = '#/login'; return; }
      if (user.status === 'approved') { state.waiting = null; toast('Administrator tasdiqladi. Xush kelibsiz!'); await enter(user); } else if (loud) toast('Hali tasdiqlanmagan.', 'info');
    } catch (e) { if (loud) toast(e.message, 'err'); }
  };
  const t = setInterval(() => { if (!document.hidden) check(); }, Math.max(5000, state.pace.idle));
  const b = leave;
  leave = () => { b?.(); clearInterval(t); };
  $('#check').addEventListener('click', act(() => check(true)));
  $('#out').addEventListener('click', act(async () => { await api('POST', '/logout'); state.waiting = null; location.hash = '#/login'; }));
}
async function enter(user) {
  if (user.status !== 'approved') { state.waiting = user; if (location.hash === '#/wait') route(); else location.hash = '#/wait'; return; }
  await start(user);
  if (location.hash === '#/dashboard') route(); else location.hash = '#/dashboard';
}

const badges = () => $$('[data-bell]').forEach((b) => { b.textContent = state.user.unread > 99 ? '99+' : state.user.unread || ''; b.hidden = !state.user.unread; });
const link = (x) => html`<a href="#/${x.id}" data-nav="${x.id}">${icon(x.icon, 21)}<span>${x.uz}</span>${x.badge ? html`<em data-badge="${x.id}"></em>` : ''}</a>`;

function frame() {
  view = 'shell';
  const pages = book().pages(), u = state.user;
  const bottom = book().bottom().map((id) => pages.find((p) => p.id === id));
  put(app, html`<div class="app"><aside class="side" id="side"><a class="side-logo" href="#/dashboard">${logo()}</a><nav aria-label="Boʻlimlar">${pages.filter((p) => !p.hidden).map(link)}</nav><div class="side-foot">${icon('shield', 18)}<span><b>${ROLE_NAME[u.role]}</b><small>Himoyalangan sessiya</small></span></div></aside>
    <div class="scrim" id="scrim"></div>
    <div class="main"><header class="top"><button class="iconbtn only-m" id="menu" aria-label="Menyu">${icon('menu')}</button><div class="hi"><b><span>Assalomu alaykum</span>, ${u.first}</b><small>${book().tagline()}</small></div>${langPicker()}<a class="iconbtn bell" href="#/notifications" aria-label="Bildirishnomalar">${icon('bell')}<em data-bell hidden></em></a><a href="#/settings" aria-label="Sozlamalar">${avatar(u)}</a></header>
    <main id="page" tabindex="-1"></main></div>
    <nav class="bottom" aria-label="Asosiy boʻlimlar">${bottom.map((p) => html`<a href="#/${p.id}" data-nav="${p.id}">${icon(p.icon)}<span>${p.short || p.uz}</span></a>`)}</nav></div>`);
  bindLang(app);
  badges();
  const side = $('#side'), drawer = (o) => { side.classList.toggle('open', o); $('#scrim').classList.toggle('open', o); };
  $('#menu').addEventListener('click', () => drawer(true));
  $('#scrim').addEventListener('click', () => drawer(false));
  side.addEventListener('click', (e) => { if (e.target.closest('a')) drawer(false); });
}

async function shell() {
  if (view !== 'shell') frame();
  const pages = book().pages();
  const [id, param] = location.hash.slice(2).split('/');
  const p = pages.find((x) => x.id === id) || pages[0];
  $$('[data-nav]').forEach((a) => (a.dataset.nav === (p.parent || p.id) ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.title = `${tr(p.uz)} · HISCHOOL`;
  const el = $('#page');
  let first = true;
  // Yangilash sahifani joyida qayta chizadi, oʻqilayotgan joy saqlanadi.
  const draw = async () => {
    leave?.(); leave = null;
    const mine = ++token, live = () => mine === token;
    const slow = first && setTimeout(() => { if (live()) put(el, skeleton()); }, 140);
    const ctx = {
      el, param, live, refresh: () => { if (live()) draw(); }, onLeave: (fn) => { const b = leave; leave = () => { b?.(); fn(); }; },
      render: (tpl) => { clearTimeout(slow); put(el, tpl); if (first) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); first = false; } },
    };
    try { await p.page(ctx); } catch (e) {
      if (!live() || !state.user) return;
      console.error(e);
      ctx.render(html`<div class="empty">${icon('signal', 26)}<p>${e.message}</p><button class="btn" id="retry">Qayta urinish</button></div>`);
      $('#retry').onclick = draw;
    }
    clearTimeout(slow);
    if (live()) pages.forEach((x) => { if (x.badge) { const b = $(`[data-badge="${x.id}"]`); if (b) { b.textContent = x.badge() || ''; b.hidden = !x.badge(); } } });
  };
  await draw();
}

/* ---------- sozlamalar (hamma uchun umumiy) ---------- */
const device = (ua) => `${/Edg/.test(ua) ? 'Edge' : /OPR/.test(ua) ? 'Opera' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Brauzer'}, ${/iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '–'}`;
export async function settingsPage(ctx, extra = '', bind) {
  const { head, card, contact, chip, ago } = await import('./ui.js');
  const u = state.user;
  const sessions = await api('GET', '/me/sessions');
  if (!ctx.live()) return;
  ctx.render(html`${head('Sozlamalar')}
    <div class="grid g2 atop">${card('Profil', html`<div class="idrow">${avatar(u, 'xl')}<div><h3>${full(u)}</h3><p>${ROLE_NAME[u.role]}</p><dl class="facts"><div><dt>Login</dt><dd class="mono">${u.login}</dd></div>${contact(u) ? html`<div><dt>Aloqa</dt><dd>${contact(u)}</dd></div>` : ''}</dl>${u.role === 'student' ? '' : html`<label class="btn small ghost"><span>Rasm yuklash</span><input type="file" id="myphoto" accept="image/*" hidden></label>`}</div></div>`)}
    ${card('Parolni almashtirish', html`<form id="pw">${field('old', 'Hozirgi parol', { type: 'password', autocomplete: 'current-password' })}${field('next', 'Yangi parol', { type: 'password', autocomplete: 'new-password', hint: 'Kamida 8 belgi. Katta-kichik harf farqi yoʻq.' })}<button class="btn" type="submit">Parolni saqlash</button></form>`)}
    ${extra}
    ${card('Faol qurilmalar', html`<ul class="list">${sessions.map((s) => html`<li class="line">${icon('device')}<div><b>${device(s.ua)}</b><small>${ago(s.seen || s.created)}</small></div>${s.current ? chip('Shu qurilma', 'good') : html`<button class="btn small ghost" data-session="${s.id}">Chiqarish</button>`}</li>`)}</ul>`)}
    ${card('Chiqish', html`<p class="mb">Bu qurilmada keyingi safar login va parol soʻraladi.</p><button class="btn ghost" id="out">${icon('exit', 20)} <span>Hisobdan chiqish</span></button>`)}</div>`);
  onSubmit($('#pw'), async (v) => { await api('POST', '/me/password', v); toast('Parol almashtirildi. Boshqa qurilmalar chiqarildi.'); ctx.refresh(); });
  $$('[data-session]').forEach((b) => b.addEventListener('click', act(async () => { await api('DELETE', `/me/sessions/${b.dataset.session}`); toast('Qurilma chiqarildi'); ctx.refresh(); })));
  $('#myphoto')?.addEventListener('change', async (e) => {
    const img = new Image(), url = URL.createObjectURL(e.target.files[0]);
    img.src = url;
    try {
      await img.decode();
      await api('PUT', '/me/photo', { photo: toCanvas(img, 600).toDataURL('image/jpeg', 0.88) });
      u.has_photo = true;
      toast('Rasm saqlandi'); view = ''; route();
    } catch (x) { toast(x.message || 'Rasmni ochib boʻlmadi', 'err'); }
    URL.revokeObjectURL(url);
  });
  $('#out').addEventListener('click', act(async () => { await book().beforeLogout?.(); await api('POST', '/logout'); signedOut(); }));
  bind?.();
}

function signedOut() {
  if (!state.user) return;
  book().dispose?.();
  state.bus?.poller.close();
  Object.assign(state, { user: null, classes: [], classId: null, children: [], childId: null, pending: 0, bus: null });
  if (location.hash === '#/login') route(); else location.hash = '#/login';
}
state.onAuthLost = () => { toast('Sessiya tugadi. Qayta kiring.', 'err'); signedOut(); };

function route() {
  const h = location.hash;
  if (!state.user && isSection(h) && view === 'landing') {
    document.getElementById(h.slice(1))?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    return;
  }
  leave?.(); leave = null; token++;
  scrollTo(0, 0);
  if (state.user) return shell();
  document.title = 'HISCHOOL';
  if (state.waiting) return waitPage();
  const m = /^#\/join\/(\w+)$/.exec(h);
  if (m) return join(m[1]);
  if (h === '#/join') return joinPick();
  if (h.startsWith('#/')) return login();
  view = 'landing';
  leave = landing(app);
  if (isSection(h) && h !== '#bosh') document.getElementById(h.slice(1))?.scrollIntoView();
}
addEventListener('hashchange', route);
addEventListener('hs-lang', () => { view = ''; route(); });

await ready;
try {
  const { user, pace } = await api('GET', '/me');
  state.pace = pace;
  if (user && user.status !== 'approved') state.waiting = user;
  else if (user) await start(user);
} catch (e) { toast(e.message, 'err'); }
route();
