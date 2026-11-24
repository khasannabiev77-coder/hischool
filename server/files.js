/* Fayllar (rasm va jonli kadr) uch joyda turishi mumkin: lokalda disk va xotira, Netlify da Blobs, boshqa serverless muhitda Postgres. */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA, SERVERLESS, get, run } from './db.js';

let stores = null; // Netlify: { photos, fallback, live }
export async function useBlobs(production) {
  if (stores) return;
  const { getStore } = await import('@netlify/blobs');
  const open = (name) => getStore({ name, consistency: 'strong' });
  // Sinov deploylari (Deploy Preview) asosiy saytning rasmlarini oʻchira olmaydi.
  stores = production ? { photos: open('photos'), live: open('live') } : { photos: open('photos-preview'), fallback: open('photos'), live: open('live-preview') };
}

const dir = path.join(DATA, 'photos');
const safe = (name) => /^[\w-]+\.jpg$/.test(name || '');

const netlify = {
  save: (name, buf) => stores.photos.set(name, new Blob([buf])),
  async read(name) {
    const one = (s) => s?.get(name, { type: 'arrayBuffer' });
    const data = (await one(stores.photos)) || (await one(stores.fallback));
    return data ? Buffer.from(data) : null;
  },
  remove: (name) => stores.photos.delete(name),
  put: (lesson, buf, at) => stores.live.set('l' + lesson, new Blob([buf]), { metadata: { at } }),
  async frame(lesson) {
    const r = await stores.live.getWithMetadata('l' + lesson, { type: 'arrayBuffer' });
    return r?.data ? { at: Number(r.metadata.at), buf: Buffer.from(r.data) } : null;
  },
  drop: (lesson) => stores.live.delete('l' + lesson),
};
/* frames jadvali UNLOGGED: kadrlar baza jurnaliga ham, zaxirasiga ham tushmaydi. */
const database = {
  save: (name, buf) => run('INSERT INTO photos VALUES (?, ?)', name, buf),
  read: async (name) => (await get('SELECT data FROM photos WHERE name = ?', name))?.data || null,
  remove: (name) => run('DELETE FROM photos WHERE name = ?', name),
  put: (lesson, buf, at) => run('INSERT INTO frames VALUES (?, ?, ?) ON CONFLICT (lesson_id) DO UPDATE SET at = excluded.at, data = excluded.data', lesson, at, buf),
  async frame(lesson, since) {
    const r = await get('SELECT at, CASE WHEN at::text = ? THEN NULL ELSE data END AS data FROM frames WHERE lesson_id = ?', String(since || ''), lesson);
    return r ? { at: r.at, buf: r.data && Buffer.from(r.data) } : null;
  },
  drop: (lesson) => run('DELETE FROM frames WHERE lesson_id = ?', lesson),
};
const memory = new Map();
const disk = {
  async save(name, buf) { await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, name), buf); },
  read: (name) => readFile(path.join(dir, name)).catch(() => null),
  remove: (name) => rm(path.join(dir, name), { force: true }),
  put: async (lesson, buf, at) => { memory.set(lesson, { at, buf }); },
  frame: async (lesson) => memory.get(lesson) || null,
  drop: async (lesson) => { memory.delete(lesson); },
};
const be = () => (stores ? netlify : SERVERLESS ? database : disk);

export async function savePhoto(buf) { const name = randomUUID() + '.jpg'; await be().save(name, buf); return name; }
export async function readPhoto(name) { return safe(name) ? be().read(name) : null; }
export async function removePhoto(name) { if (safe(name)) await be().remove(name).catch((e) => console.error('photo:', e.message)); }

/* Jonli dars: faqat eng oxirgi kadr turadi, har yangi kadr eskisining oʻrniga yoziladi. */
export const putFrame = (lesson, buf) => be().put(lesson, buf, Date.now());
/** `since` dagi kadr hali ham oxirgisi boʻlsa, buf boʻsh qaytishi mumkin. */
export const getFrame = (lesson, since) => be().frame(lesson, since);
export async function dropFrame(lesson) { await be().drop(lesson).catch((e) => console.error('frame:', e.message)); }
