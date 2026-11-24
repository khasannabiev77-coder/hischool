/* Til: oʻzbekcha asosiy matn, boshqa tillar lugʻatdan. Foydalanuvchi yozgan matnlar tarjima qilinmaydi. */
import { html } from './ui.js';

const NAMES = { uz: 'Oʻzbekcha', en: 'English', ru: 'Русский' };
let saved = 'uz';
try { saved = localStorage.getItem('hs-lang') || 'uz'; } catch { /* ixtiyoriy */ }
export let lang = NAMES[saved] ? saved : 'uz';
let dict = null;

async function load(l) {
  dict = null;
  if (l !== 'uz') { try { dict = (await import('./lang.js')).default[l]; } catch (e) { console.error(e); } }
  document.documentElement.lang = l;
}
export const ready = load(lang);
export const tr = (s) => (dict && typeof s === 'string' && dict[s]) || s;

/** Chizilgan boʻlakdagi matn va yozuvlarni joriy tilga oʻtkazadi. */
export function translate(root) {
  if (!dict) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    const k = n.data.trim();
    if (k && dict[k]) n.data = n.data.replace(k, dict[k]);
  }
  for (const a of ['placeholder', 'aria-label', 'title', 'data-l', 'data-ask', 'data-title', 'data-yes']) {
    root.querySelectorAll(`[${a}]`).forEach((el) => { const v = dict[el.getAttribute(a)]; if (v) el.setAttribute(a, v); });
  }
}

export const langPicker = () => html`<label class="langsel"><span class="sr">Til / Language</span><select data-lang>${Object.entries(NAMES).map(([k, t]) => html`<option value="${k}" ${k === lang ? html`selected` : ''}>${t}</option>`)}</select><b aria-hidden="true">${lang.toUpperCase()}</b></label>`;
export function bindLang(root) {
  root.querySelectorAll('[data-lang]').forEach((s) => s.addEventListener('change', async () => {
    try { localStorage.setItem('hs-lang', s.value); } catch { /* ixtiyoriy */ }
    lang = s.value;
    await load(lang);
    dispatchEvent(new Event('hs-lang'));
  }));
}
