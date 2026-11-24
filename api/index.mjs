/* Vercel funksiyasi. Barcha /api/* soʻrovlar shu yerga keladi (vercel.json). */
import { api } from '../server/app.js';

export default {
  fetch(req) {
    const url = new URL(req.url);
    // Rewrite asl yoʻlni __path ga yozadi.
    const path = url.searchParams.get('__path');
    if (path !== null) { url.pathname = '/api/' + path; url.searchParams.delete('__path'); }
    const ip = (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body;
    return api(new Request(url, { method: req.method, headers: req.headers, body, duplex: body ? 'half' : undefined }), { ip, secure: true, serverless: true });
  },
};
