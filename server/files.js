/* Fayllar: Netlify da Blobs, lokalda disk (rasmlar) va xotira (jonli kadr). */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA } from './db.js';

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

export async function savePhoto(buf) {
  const name = randomUUID() + '.jpg';
  if (stores) await stores.photos.set(name, new Blob([buf]));
  else { await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, name), buf); }
  return name;
}
export async function readPhoto(name) {
  if (!safe(name)) return null;
  if (!stores) return readFile(path.join(dir, name)).catch(() => null);
  const get = (s) => s?.get(name, { type: 'arrayBuffer' });
  const data = (await get(stores.photos)) || (await get(stores.fallback));
  return data ? Buffer.from(data) : null;
}
export async function removePhoto(name) {
  if (!safe(name)) return;
  if (stores) await stores.photos.delete(name).catch((e) => console.error('blob:', e.message));
  else await rm(path.join(dir, name), { force: true });
}

/* Jonli dars: faqat eng oxirgi kadr turadi, har yangi kadr eskisining oʻrniga yoziladi. */
const memory = new Map();
export async function putFrame(lesson, buf) {
  const at = Date.now();
  if (stores) await stores.live.set('l' + lesson, new Blob([buf]), { metadata: { at } });
  else memory.set(lesson, { at, buf });
}
export async function getFrame(lesson) {
  if (!stores) return memory.get(lesson) || null;
  const r = await stores.live.getWithMetadata('l' + lesson, { type: 'arrayBuffer' });
  return r?.data ? { at: Number(r.metadata.at), buf: Buffer.from(r.data) } : null;
}
export async function dropFrame(lesson) {
  if (stores) await stores.live.delete('l' + lesson).catch((e) => console.error('blob:', e.message));
  else memory.delete(lesson);
}
