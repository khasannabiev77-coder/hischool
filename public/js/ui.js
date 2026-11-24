/* Umumiy yordamchilar: xavfsiz shablon, API, ikonlar, shakllar, oynalar. */
import { tr, translate } from './i18n.js';

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const part = (v) => (v == null || v === false || v === true ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));
/** Qiymatlarni avtomatik ekranlaydigan shablon. */
export const html = (s, ...v) => new Raw(s.reduce((a, x, i) => a + x + (i < v.length ? part(v[i]) : ''), ''));
export const $ = (q, el = document) => el.querySelector(q);
export const $$ = (q, el = document) => [...el.querySelectorAll(q)];
export const put = (el, tpl) => { el.innerHTML = part(tpl); translate(el); animate(el); return el; };

export const state = { user: null, classes: [], rooms: [], classId: null, pending: 0, children: [], childId: null, onAuthLost: () => {}, bus: null };

export async function api(method, url, body) {
  let r;
  try {
    r = await fetch('/api' + url, { method, headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  } catch { throw Object.assign(new Error('Server bilan aloqa yoʻq. Internetni tekshiring.'), { status: 0 }); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && state.user) state.onAuthLost();
    throw Object.assign(new Error(data.error || 'Xatolik yuz berdi.'), { status: r.status, field: data.field });
  }
  return data;
}

export function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = tr(msg);
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 6000 : 3200);
}

/* ---------- ikonlar ---------- */
const I = {
  home: 'M3 10.8 12 3.500l9 7.300M5.500 9v11h13V9M9.500 20v-6h5v6', child: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.500 20.500a7.500 7.500 0 0 1 15 0', people: 'M9 11.500a3.500 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7ZM2.500 20a6.500 6.500 0 0 1 13 0M16 4.800a3.500 3.500 0 0 1 0 6.400M18 14.200a6.500 6.500 0 0 1 3.500 5.800',
  calendar: 'M4 6.500h16v14H4zM4 10.500h16M8 3.500v4M16 3.500v4', check: 'M5 12.500l4.500 4.500L19 7.500', chart: 'M4 20V4M4 20h16M8 16l4-5 3 3 5-7', bars: 'M5 20V11M12 20V4M19 20v-6', star: 'M12 3.500l2.600 5.400 5.900.8-4.300 4.100 1 5.900-5.200-2.800-5.200 2.800 1-5.900L3.500 9.700l5.900-.8z',
  book: 'M4 5.500c3-1.300 5.500-1 8 .7 2.500-1.700 5-2 8-.7v13c-3-1.300-5.500-1-8 .7-2.500-1.700-5-2-8-.7zM12 6.200v13', clock: 'M12 20.500a8.500 8.500 0 1 0 0-17 8.500 8.500 0 0 0 0 17ZM12 7.500V12l3 2', camera: 'M3.500 7h11v10h-11zM14.500 10.500l6-3v9l-6-3', chat: 'M4 5h16v11H10l-4.500 4V16H4z', bell: 'M6 16.500V11a6 6 0 0 1 12 0v5.500l1.500 2h-15zM10 21h4',
  gear: 'M12 15.200a3.200 3.200 0 1 0 0-6.400 3.200 3.200 0 0 0 0 6.400ZM19.200 12l1.600 1.500-1.700 3-2.100-.6-1.700 1-.5 2.100h-3.600l-.5-2.100-1.700-1-2.100.6-1.700-3L6.800 12 5.200 10.500l1.700-3 2.100.6 1.700-1 .5-2.100h3.600l.5 2.100 1.700 1 2.100-.6 1.700 3z',
  shield: 'M12 3l7.500 2.800V11c0 4.800-3 8-7.500 10-4.500-2-7.500-5.200-7.500-10V5.800zM8.800 11.800l2.300 2.300 4.200-4.400', lock: 'M6 11h12v9.500H6zM8.500 11V8a3.500 3.500 0 0 1 7 0v3', full: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5', sound: 'M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM15.500 9a4 4 0 0 1 0 6M18 6.500a7.500 7.500 0 0 1 0 11', mute: 'M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM16 9.500l5 5M21 9.500l-5 5',
  signal: 'M4 18v-3M9 18v-6M14 18V9M19 18V5', flag: 'M5.500 21V4h12l-2.500 4.500 2.500 4.500h-12', menu: 'M4 7h16M4 12h16M4 17h16', close: 'M6 6l12 12M18 6 6 18', right: 'M5 12h14M13 6l6 6-6 6', left: 'M15 5l-7 7 7 7', next: 'M9 5l7 7-7 7', down: 'M6 9l6 6 6-6', plus: 'M12 5v14M5 12h14', trash: 'M5 7h14M9.500 7V4.500h5V7M7 7l.8 13h8.400L17 7', edit: 'M5 19l1-4L16 5l3 3L9 18z', key: 'M8 15.500a3.500 3.500 0 1 0 0-.01zM10.500 12.500 19 4M16 7l2.500 2.500', exit: 'M10 4.500H5v15h5M14 8l4 4-4 4M18 12H9',
  room: 'M4 20.500V4h11v16.500M15 8h5v12.500M2.500 20.500h19M11 12.500h.01', cap: 'M2.500 9.500 12 5l9.500 4.500L12 14zM6.500 11.500V16c3 2.500 8 2.500 11 0v-4.500M21.500 9.500V15', eye: 'M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', mail: 'M3.500 6h17v12.500h-17zM3.500 7l8.500 6 8.500-6', send: 'M4 12 20.500 4 16 20.500l-4-6.500zM12 14l8.500-10', device: 'M3.500 5h17v11h-17zM9 20h6M12 16v4', search: 'M11 17.500a6.500 6.500 0 1 0 0-13 6.500 6.500 0 0 0 0 13ZM16 16l4.500 4.500', up: 'M12 19V5M6 11l6-6 6 6', dn: 'M12 5v14M6 13l6 6 6-6',
};
export const icon = (n, size = 22) => html`<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${I[n] || I.check}"/></svg>`;
export const logo = () => html`<span class="logo"><svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11"/><path d="M11 10v20M11 20h11M22 10v20"/><path class="i" d="M29.500 18v12"/><circle cx="29.500" cy="11.500" r="2.400"/></svg><b>HISCHOOL</b></span>`;

/* ---------- formatlash ---------- */
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const LOC = { uz: null, en: 'en-GB', ru: 'ru-RU' };
import { lang } from './i18n.js';
export const DAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return today(new Date(y, m - 1, d + n)); };
const asDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
export const day = (s) => { const d = asDate(s); return LOC[lang] ? d.toLocaleDateString(LOC[lang], { day: 'numeric', month: 'long' }) : `${d.getDate()}-${MONTHS[d.getMonth()]}`; };
export const monthName = (s, short = false) => { const d = asDate(s); if (LOC[lang]) return d.toLocaleDateString(LOC[lang], { month: short ? 'short' : 'long' }); const n = MONTHS[d.getMonth()]; return short ? { iyun: 'iyn', iyul: 'iyl' }[n] || n.slice(0, 3) : n[0].toUpperCase() + n.slice(1); };
export const dayShort = (s) => { const [, m, d] = s.split('-'); return `${d}.${m}`; };
export const clock = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const ago = (ms) => {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return tr('hozirgina');
  if (m < 60) return `${m} ${tr('daqiqa oldin')}`;
  if (m < 1440 && today(new Date(ms)) === today()) return `${tr('bugun')}, ${clock(ms)}`;
  return `${day(today(new Date(ms)))}, ${clock(ms)}`;
};
export const phone = (p) => (p ? `+998 ${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5, 7)} ${p.slice(7)}` : '');
export const contact = (u) => (u.telegram ? '@' + u.telegram : phone(u.phone));
export const num = (x, d = 1) => (x == null ? '–' : x.toFixed(d));
export const pc = (x) => (x == null ? '–' : Math.round(x) + '%');
export const full = (u) => `${u.first} ${u.last}`;

export const avatar = (u, size = '') => html`<span class="ava ${size}" aria-hidden="true">${(u.first || ' ')[0]}${(u.last || ' ')[0]}${u.has_photo ? html`<img src="/api/photo/${u.id}" alt="" loading="lazy">` : ''}</span>`;
// Rasm yuklanmasa, bosh harflar koʻrinib qoladi.
document.addEventListener('error', (e) => { if (e.target.matches?.('.ava img')) e.target.remove(); }, true);

export const KIND = { activity: 'Darsdagi faollik', behaviour: 'Intizom', homework: 'Uy vazifasi' };
export const SKILL = { grammar: 'Grammar', vocabulary: 'Vocabulary', speaking: 'Speaking', listening: 'Listening', reading: 'Reading', writing: 'Writing' };
export const ATT = { present: 'Keldi', late: 'Kechikdi', absent: 'Kelmadi' };
export const ATT_TONE = { present: 'good', late: 'warn', absent: 'bad' };
/** Konstruktiv baho: past natija ham oʻsish yoʻli sifatida aytiladi. */
export const word = (p) => (p == null ? ['Hali maʼlumot yoʻq', 'none'] : p >= 90 ? ['Aʼlo', 'good'] : p >= 78 ? ['Juda yaxshi', 'good'] : p >= 62 ? ['Yaxshi', 'blue'] : ['Rivojlanmoqda', 'warn']);

/* ---------- boʻlaklar ---------- */
export const head = (title, sub = '', actions = '') => html`<div class="phead"><div><h1>${title}</h1>${sub ? html`<p>${sub}</p>` : ''}</div>${actions ? html`<div class="row">${actions}</div>` : ''}</div>`;
export const card = (title, body, { aside = '', cls = '' } = {}) => html`<section class="card ${cls}">${title ? html`<div class="card-head"><h2>${title}</h2>${aside}</div>` : ''}${body}</section>`;
export const empty = (text, ic = 'book') => html`<div class="empty">${icon(ic, 26)}<p>${text}</p></div>`;
export const chip = (text, tone = '') => html`<span class="chip ${tone}">${text}</span>`;
export const mark = (v) => html`<span class="mark m${v == null ? 0 : Math.round(v)}">${v == null ? '–' : Number.isInteger(v) ? v : num(v)}</span>`;
export const skeleton = () => html`<div class="sk" aria-hidden="true"><i style="width:34%;height:34px"></i><i style="width:22%;height:16px"></i><div class="grid g4"><i style="height:132px"></i><i style="height:132px"></i><i style="height:132px"></i><i style="height:132px"></i></div><i style="height:300px"></i></div><p class="sr" role="status">Yuklanmoqda…</p>`;

/** Koʻrsatkich kartasi: qiymat va oldingi 30 kunga nisbatan oʻzgarish. */
export function stat(ic, label, value, { suffix = '', digits = 0, trend = null, unit = '%', sub = '' } = {}) {
  const t = trend == null ? null : Math.round(trend * 10) / 10;
  return html`<div class="stat"><div class="stat-top"><span class="stat-ic">${icon(ic, 20)}</span><span>${label}</span></div>
    <b class="stat-v">${value == null ? '–' : html`<span data-count="${value}" data-digits="${digits}">${num(value, digits)}</span>${suffix ? html`<small>${suffix}</small>` : ''}`}</b>
    <p class="stat-t">${t == null ? html`<span class="trend">${sub || 'Oldingi oy bilan solishtirish uchun maʼlumot kam'}</span>` : html`<span class="trend ${t > 0 ? 'up' : t < 0 ? 'down' : ''}">${t ? icon(t > 0 ? 'up' : 'dn', 14) : ''}${t > 0 ? '+' : ''}${t || ''}${t ? unit : ''}${t ? '' : html`<span>Oʻzgarishsiz</span>`}</span> <span>oldingi oyga nisbatan</span>`}</p></div>`;
}

/** Sonlar sanab chiqadi, chiziqlar toʻladi. Harakat kamaytirilgan boʻlsa, darhol oxirgi holat. */
const calm = matchMedia('(prefers-reduced-motion: reduce)');
export function countUp(el) {
  const to = Number(el.dataset.count), d = Number(el.dataset.digits || 0), from = performance.now();
  if (calm.matches) return;
  const step = (t) => {
    const k = Math.min(1, (t - from) / 900), e = 1 - (1 - k) ** 3;
    el.textContent = (to * e).toFixed(d);
    if (k < 1 && el.isConnected) requestAnimationFrame(step); else el.textContent = to.toFixed(d);
  };
  requestAnimationFrame(step);
}
const seen = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  seen.unobserve(e.target);
  e.target.classList.add('in');
  if (e.target.dataset.count !== undefined) countUp(e.target);
}), { threshold: 0.15 });
export function animate(el) { $$('[data-count], .reveal, .draw', el).forEach((x) => seen.observe(x)); }

/* ---------- maydonlar ---------- */
export const field = (name, label, a = {}) => html`<label class="field" data-field="${name}"><span>${label}</span>${
  a.type === 'textarea' ? html`<textarea name="${name}" rows="${a.rows || 3}" maxlength="${a.maxlength || 500}" placeholder="${a.placeholder || ''}">${a.value || ''}</textarea>`
    : html`<input name="${name}" type="${a.type || 'text'}" value="${a.value ?? ''}" placeholder="${a.placeholder || ''}" autocomplete="${a.autocomplete || 'off'}" maxlength="${a.maxlength || 160}" autocapitalize="${a.cap || 'sentences'}" spellcheck="false" ${a.min !== undefined ? html`min="${a.min}" max="${a.max}"` : ''}>`
}<em class="err"></em>${a.hint ? html`<small>${a.hint}</small>` : ''}</label>`;
export const select = (name, label, options, value = '') => html`<label class="field" data-field="${name}"><span>${label}</span><select name="${name}">${options.map(([v, t]) => html`<option value="${v}" ${String(v) === String(value) ? html`selected` : ''}>${t}</option>`)}</select><em class="err"></em></label>`;
export const pick = (id, label, options, value) => html`<label class="pick"><span>${label}</span><select id="${id}">${options.map(([v, t]) => html`<option value="${v}" ${String(v) === String(value) ? html`selected` : ''}>${t}</option>`)}</select></label>`;

export const phoneField = (name, label) => html`<label class="field" data-field="${name}"><span>${label}</span>
  <span class="phone"><b>+998</b><input name="${name}" data-phone inputmode="numeric" autocomplete="tel-national" placeholder="90 123 45 67" maxlength="16"></span>
  <em class="err"></em><small data-digits-left>9 ta raqam</small></label>`;
document.addEventListener('input', (e) => {
  const i = e.target;
  if (i.dataset?.phone === undefined) return;
  let d = i.value.replace(/\D/g, '');
  if (d.length > 9 && d.startsWith('998')) d = d.slice(3);
  d = d.slice(0, 9);
  i.value = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7)].filter(Boolean).join(' ');
  const c = $('[data-digits-left]', i.closest('.field'));
  if (!c) return;
  c.textContent = `${d.length} / 9`;
  c.classList.toggle('full', d.length === 9);
});

export function setError(form, name, msg) {
  const f = $(`[data-field="${name}"]`, form);
  if (!f) return false;
  f.classList.add('bad');
  $('.err', f).textContent = tr(msg);
  $('input,select,textarea,button', f)?.focus();
  return true;
}
export function clearErrors(form) { for (const f of $$('.field.bad', form)) { f.classList.remove('bad'); $('.err', f).textContent = ''; } }
export const values = (form) => Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));

/** Shaklni yuborish: xatolar oʻz maydoni ostida chiqadi, tugma qayta bosilmaydi. */
export function onSubmit(form, fn) {
  form.noValidate = true;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('[type=submit]', form);
    if (btn.disabled) return;
    clearErrors(form);
    for (const i of $$('[data-phone]', form)) {
      if (i.offsetParent === null) continue;
      if (i.value.replace(/\D/g, '').length !== 9) return setError(form, i.name, 'Raqam aynan 9 xonali boʻlishi kerak.');
    }
    btn.disabled = true;
    try { await fn(values(form)); } catch (err) { if (!err.field || !setError(form, err.field, err.message)) toast(err.message, 'err'); }
    btn.disabled = false;
  });
}

/* ---------- oynalar ---------- */
export function dialog(body, { onOpen, wide } = {}) {
  return new Promise((ok) => {
    const d = document.createElement('dialog');
    if (wide) d.className = 'wide';
    put(d, body);
    document.body.append(d);
    d.addEventListener('close', () => { const v = d.returnValue; d.remove(); ok(v); });
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(''); });
    d.showModal();
    onOpen?.(d);
  });
}
export const confirmBox = async (title, text, yes = 'Ha', danger = true) =>
  (await dialog(html`<form method="dialog"><h2>${title}</h2><p>${text}</p><div class="row end"><button class="btn ghost" value="">Bekor qilish</button><button class="btn ${danger ? 'danger' : ''}" value="yes">${yes}</button></div></form>`)) === 'yes';
export async function textBox(title, value = '', { placeholder = '', yes = 'Saqlash', max = 300 } = {}) {
  let text = null;
  const v = await dialog(html`<form method="dialog"><h2>${title}</h2><textarea rows="4" maxlength="${max}" placeholder="${placeholder}">${value}</textarea><div class="row end"><button class="btn ghost" value="">Bekor qilish</button><button class="btn" value="yes">${yes}</button></div></form>`,
    { onOpen: (d) => { const t = $('textarea', d); t.focus(); t.addEventListener('input', () => { text = t.value.trim(); }); } });
  return v === 'yes' ? text ?? value : null;
}
/** Shaklli oyna: saqlangach yopiladi, xato boʻlsa ochiq qoladi. */
export function formBox(title, fields, yes, fn) {
  return dialog(html`<form><h2>${title}</h2>${fields}<div class="row end"><button type="button" class="btn ghost" data-close>Bekor qilish</button><button class="btn" type="submit">${yes}</button></div></form>`,
    { onOpen: (d) => onSubmit($('form', d), async (v) => { await fn(v); d.close('yes'); }) });
}

/** Login-parol kartasi. */
export const passCard = (name, login, password) => html`<div class="passcard"><div class="passcard-top">${logo()}<span>Shaxsiy kirish kartasi</span></div><p>${name}</p>
  <dl><div><dt>Login</dt><dd>${login}</dd></div><div><dt>Parol</dt><dd>${password}</dd></div></dl>
  <button type="button" class="btn glass small" data-copy="HISCHOOL\nLogin: ${login}\nParol: ${password}">Nusxa olish</button></div>`;
document.addEventListener('click', async (e) => {
  const b = e.target.closest?.('[data-copy]');
  if (!b) return;
  const text = b.dataset.copy.replace(/\\n/g, '\n');
  try { await navigator.clipboard.writeText(text); } catch {
    const t = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
  }
  toast('Nusxa olindi');
});
export const showCard = (name, login, password) => dialog(html`<form method="dialog"><h2>Yangi parol</h2><p>Parol faqat bir marta koʻrsatiladi. Uni egasiga bering.</p>${passCard(name, login, password)}<div class="row end"><button class="btn">Tayyor</button></div></form>`);
export const act = (fn) => async (e) => { const b = e.currentTarget; b.disabled = true; try { await fn(b, e); } catch (x) { toast(x.message, 'err'); } b.disabled = false; };

/* ---------- jonli aloqa ---------- */
export class Socket {
  constructor(onMessage, onOpen = () => {}) { this.onMessage = onMessage; this.onOpen = onOpen; this.closed = false; this.open(); }
  open() {
    this.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/live`);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => this.onOpen();
    this.ws.onmessage = (e) => this.onMessage(e.data);
    this.ws.onclose = () => { if (!this.closed) this.timer = setTimeout(() => this.open(), 2000); };
  }
  get ready() { return this.ws.readyState === 1; }
  send(x) { if (!this.ready || this.ws.bufferedAmount > 1.5e6) return false; this.ws.send(x); return true; }
  close() { this.closed = true; clearTimeout(this.timer); this.ws.close(); }
}
