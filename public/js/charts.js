/* Grafiklar: bitta rang, bitta oʻq, sichqoncha va klaviatura uchun qiymatlar, jadval koʻrinishi. */
import { html, empty, ATT, day, monthName, today } from './ui.js';
import { tr } from './i18n.js';

const table = (rows, head, fmt) => html`<details><summary>Jadval koʻrinishi</summary><table class="tbl"><thead><tr><th>${head[0]}</th><th>${head[1]}</th></tr></thead><tbody>${rows.map((r) => html`<tr><td>${r.full || r.label}</td><td>${r.value == null ? '–' : fmt(r.value)}</td></tr>`)}</tbody></table></details>`;
const ticks = (min, max, fmt) => html`<div class="ch-grid" aria-hidden="true">${[max, (max + min) / 2, min].map((v) => html`<span>${fmt(v)}</span>`)}</div>`;
const thin = (i, n) => (n > 8 && i % Math.ceil(n / 7) !== (n - 1) % Math.ceil(n / 7) ? 'thin' : '');

/** Chiziqli grafik. rows: {label, full?, value|null} */
export function line(rows, { max = 100, min = 0, fmt = (v) => Math.round(v) + '%', label = '', head = ['Davr', 'Qiymat'], none = 'Hali maʼlumot yoʻq.' } = {}) {
  const pts = rows.map((r, i) => ({ ...r, i, x: rows.length > 1 ? (i / (rows.length - 1)) * 100 : 50, y: r.value == null ? null : 100 - ((r.value - min) / (max - min || 1)) * 100 }));
  const on = pts.filter((p) => p.y != null);
  if (!on.length) return empty(none, 'chart');
  const d = on.map((p, i) => {
    if (!i) return `M${p.x} ${p.y}`;
    const q = on[i - 1], m = (q.x + p.x) / 2;
    return `C${m} ${q.y} ${m} ${p.y} ${p.x} ${p.y}`;
  }).join('');
  const last = on.at(-1);
  return html`<figure class="chart"><div class="ch-plot">${ticks(min, max, fmt)}<div class="ch-area" role="img" aria-label="${label}">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="draw" aria-hidden="true"><path class="fill" d="${d}L${last.x} 100L${on[0].x} 100Z"/><path class="ln" pathLength="1" d="${d}"/></svg>
    ${pts.map((p) => html`<div class="pt ${thin(p.i, pts.length)}" style="left:${p.x}%;width:${100 / Math.max(1, rows.length)}%" ${p.y == null ? '' : html`tabindex="0" data-tip="${p.full || p.label}: ${fmt(p.value)}"`}>${p.y == null ? '' : html`<i style="--y:${p.y}"></i>${p === last ? html`<b style="--y:${p.y}">${fmt(p.value)}</b>` : ''}`}<span>${p.label}</span></div>`)}
  </div></div>${table(rows, head, fmt)}</figure>`;
}

/** Ustunli grafik. */
export function columns(rows, { max = 100, fmt = (v) => Math.round(v) + '%', label = '', head = ['Davr', 'Qiymat'], none = 'Hali maʼlumot yoʻq.' } = {}) {
  if (!rows.some((r) => r.value != null)) return empty(none, 'bars');
  const last = rows.findLastIndex((r) => r.value != null);
  return html`<figure class="chart"><div class="ch-plot">${ticks(0, max, fmt)}<div class="ch-area cols" role="img" aria-label="${label}">
    ${rows.map((r, i) => html`<div class="col ${thin(i, rows.length)}" tabindex="0" data-tip="${r.full || r.label}: ${r.value == null ? '–' : fmt(r.value)}">${r.value == null ? '' : html`<i class="draw" style="--n:${Math.min(100, (r.value / max) * 100)}">${i === last ? html`<b>${fmt(r.value)}</b>` : ''}</i>`}<span>${r.label}</span></div>`)}
  </div></div>${table(rows, head, fmt)}</figure>`;
}

export function ring(value, { size = 120, label = '', tone = '', digits = 0 } = {}) {
  const r = 44, c = 2 * Math.PI * r, v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return html`<div class="ring ${tone}" style="--s:${size}px"><svg viewBox="0 0 100 100" class="draw" aria-hidden="true"><circle cx="50" cy="50" r="${r}"/>${v ? html`<circle class="v" cx="50" cy="50" r="${r}" style="--c:${c};--o:${c * (1 - v / 100)}"/>` : ''}</svg><div><b>${value == null ? '–' : html`<span data-count="${value}" data-digits="${digits}">${value.toFixed(digits)}</span>%`}</b>${label ? html`<small>${label}</small>` : ''}</div></div>`;
}
export const bar = (label, value, right = '') => html`<div class="pbar"><div><span>${label}</span><b>${value == null ? '–' : right || Math.round(value) + '%'}</b></div><div class="track"><i class="draw" style="--v:${value ?? 0}%"></i></div></div>`;

/** Oylik davomat taqvimi. */
export function calendar(rows, month) {
  const map = new Map(rows.map((r) => [r.date, r.status]));
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1), n = new Date(y, m, 0).getDate(), pad = (first.getDay() + 6) % 7, now = today();
  return html`<div class="cal" role="table" aria-label="${monthName(month)}"><div class="cal-h" aria-hidden="true">${['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'].map((d) => html`<span>${d}</span>`)}</div><div class="cal-b">${Array.from({ length: pad }, () => html`<i></i>`)}${Array.from({ length: n }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`, s = map.get(date);
    return html`<span class="${s || ''} ${date === now ? 'now' : ''}" ${s ? html`tabindex="0" data-tip="${day(date)}: ${tr(ATT[s])}" aria-label="${day(date)}: ${tr(ATT[s])}"` : ''}>${i + 1}</span>`;
  })}</div></div>`;
}
const here = (a) => a.filter((x) => x.status !== 'absent').length;
/** Davomatni hafta yoki oy boʻyicha foizga yigʻadi. */
export function attendanceBy(rows, unit, count) {
  const out = [], now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    let from, to, label, fullLabel;
    if (unit === 'week') {
      const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - i * 7);
      from = today(mon); to = today(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6));
      label = `${String(mon.getDate()).padStart(2, '0')}.${String(mon.getMonth() + 1).padStart(2, '0')}`; fullLabel = `${day(from)} – ${day(to)}`;
    } else {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      from = today(d); to = today(new Date(d.getFullYear(), d.getMonth() + 1, 0)); label = monthName(from, true); fullLabel = monthName(from);
    }
    const a = rows.filter((r) => r.date >= from && r.date <= to);
    out.push({ label, full: fullLabel, value: a.length ? (100 * here(a)) / a.length : null });
  }
  return out;
}
