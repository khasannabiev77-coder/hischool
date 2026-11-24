/* Netlify uchun dist/ papkasini yigʻadi: sayt fayllari, yuz modeli, shrift va sarlavhalar. */
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SECURITY, USED, VENDOR } from '../server/static.js';

const root = path.resolve(import.meta.dirname, '..'), dist = path.join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
cpSync(path.join(root, 'public'), dist, { recursive: true });
let n = 0;
for (const [url, dir] of VENDOR) {
  const from = path.join(root, 'node_modules', dir), to = path.join(dist, url);
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) if (USED.some((r) => r.test(f))) { cpSync(path.join(from, f), path.join(to, f)); n++; }
}
const block = (p, h) => `${p}\n${Object.entries(h).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n`;
writeFileSync(path.join(dist, '_headers'), [
  block('/*', SECURITY), block('/vendor/*', { 'Cache-Control': 'public, max-age=604800' }), block('/js/*', { 'Cache-Control': 'no-cache' }), block('/css/*', { 'Cache-Control': 'no-cache' }),
].join('\n'));
console.log(`dist tayyor, ${n} ta kutubxona fayli.`);
