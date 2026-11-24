/* Yuzni tanish. Modellar shu serverdan yuklanadi, rasm tashqi xizmatga yuborilmaydi. */
import { api, state } from './ui.js';

let fa, loading;
export function loadFace() {
  loading ??= (async () => {
    fa = await import('/vendor/face/face-api.esm.js');
    fa.tf.setWasmPaths('/vendor/wasm/');
    // Videokarta boʻlmasa WASM, u ham boʻlmasa oddiy protsessor.
    for (const name of ['webgl', 'wasm', 'cpu']) {
      const ok = await fa.tf.setBackend(name).catch(() => false);
      if (ok) break;
    }
    await fa.tf.ready();
    const url = '/vendor/model';
    await Promise.all([fa.nets.ssdMobilenetv1.loadFromUri(url), fa.nets.faceLandmark68Net.loadFromUri(url), fa.nets.faceRecognitionNet.loadFromUri(url)]);
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

export function toCanvas(src, maxSide) {
  const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Roʻyxatdan oʻtish rasmi: bitta, tiniq va yetarlicha katta yuz boʻlishi shart. */
export async function analysePhoto(canvas) {
  await loadFace();
  const found = await fa.detectAllFaces(canvas, new fa.SsdMobilenetv1Options({ minConfidence: 0.5 })).withFaceLandmarks().withFaceDescriptors();
  const byArea = found.sort((a, b) => b.detection.box.area - a.detection.box.area);
  if (!byArea.length) throw new Error('Rasmda yuz topilmadi. Yuzni yoritib, kameraga toʻgʻri qarang.');
  if (byArea[1] && byArea[1].detection.box.area > byArea[0].detection.box.area * 0.35) throw new Error('Rasmda bir nechta odam bor. Faqat oʻquvchi koʻrinsin.');
  if (byArea[0].detection.box.width < canvas.width * 0.14) throw new Error('Yuz juda kichik. Kameraga yaqinroq keling.');
  if (Math.abs(yaw(byArea[0].landmarks.positions)) > 0.3) throw new Error('Yuz yon tomonga burilgan. Kameraga toʻgʻri qarang.');
  return Array.from(byArea[0].descriptor);
}

/** Bosh burilishi: 0 = toʻgʻri, ±0.5 = toʻliq yon tomonga. Burun uchining jagʻ chetlari orasidagi oʻrni. */
function yaw(p) {
  const l = p[0], r = p[16], n = p[30];
  const dx = r.x - l.x, dy = r.y - l.y, len = dx * dx + dy * dy;
  return len ? ((n.x - l.x) * dx + (n.y - l.y) * dy) / len - 0.5 : 0.5;
}
const YAW_LIMIT = 0.32;

const dist = (a, b) => { let s = 0; for (let i = 0; i < 128; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };
function iou(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const i = x * y;
  return i / (a.w * a.h + b.w * b.h - i || 1);
}
const grow = (b, W, H) => {
  const x = Math.max(0, b.x - b.w * 0.3), y = Math.max(0, b.y - b.h * 0.45);
  return { x, y, w: Math.min(W - x, b.w * 1.6), h: Math.min(H - y, b.h * 1.75) };
};

const MATCH = 0.48, MARGIN = 0.03, KEEP_MS = 2500;

/** Dars kamerasi. Sahifalar almashsa ham ishlashda davom etadi. */
class ClassCamera extends EventTarget {
  running = false;
  stats = new Map(); // oʻquvchi -> {samples, seen, attentive, now}
  pendingStats = new Map();
  tracks = [];
  opts = { tiles: 1, blur: true, deviceId: '', width: 960, audio: false };
  full = document.createElement('canvas');
  out = document.createElement('canvas');
  mini = document.createElement('canvas');
  viewers = 0;
  sound = [];
  soundEnd = 0;

  async start(lesson, students) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Kamera faqat localhost yoki HTTPS manzilda ishlaydi.');
    this.lesson = lesson; this.students = students; this.tracks = [];
    this.stats = new Map(students.map((s) => [s.id, { samples: 0, seen: 0, attentive: 0, now: 'unseen', strong: 0 }]));
    this.pendingStats = new Map();
    if (!this.stream) await this.openCamera();
    this.emit('status', 'Yuzni tanish modeli yuklanmoqda…');
    try {
      await loadFace();
      await this.fillDescriptors();
    } catch (e) { this.closeCamera(); throw e; }
    this.running = true;
    this.lastError = null;
    try { this.lock = await navigator.wakeLock?.request('screen'); } catch { /* ixtiyoriy */ }
    await this.beat();
    this.beater = setInterval(() => this.beat(), state.pace.beat);
    if (this.opts.audio) await this.startAudio().catch((e) => this.emit('status', e.message));
    this.loop();
  }

  /** Ovoz faqat oʻqituvchi yoqsa uzatiladi, yozib olinmaydi. */
  async startAudio() {
    this.stopAudio();
    this.sound = []; this.soundEnd = 0;
    try { this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { this.opts.audio = false; throw new Error('Mikrofonga ruxsat berilmadi.'); }
    this.actx = new AudioContext();
    await this.actx.audioWorklet.addModule('/js/mic-worklet.js');
    const node = new AudioWorkletNode(this.actx, 'mic');
    this.actx.createMediaStreamSource(this.mic).connect(node);
    node.port.onmessage = ({ data }) => {
      if (!this.running) return;
      this.sound.push(data); this.soundEnd += data.length;
      while (this.sound.length > 60) this.sound.shift(); // oxirgi 6 soniya
    };
  }
  stopAudio() { this.mic?.getTracks().forEach((t) => t.stop()); this.actx?.close(); this.mic = this.actx = null; }

  async openCamera() {
    this.closeCamera();
    const { deviceId } = this.opts;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1920 }, height: { ideal: 1080 }, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) } });
    } catch (e) {
      throw new Error(e.name === 'NotAllowedError' ? 'Kameraga ruxsat berilmadi. Brauzer sozlamasidan ruxsat bering.' : 'Kamera topilmadi yoki boshqa dasturda band.');
    }
    this.video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, srcObject: this.stream });
    await this.video.play();
    this.stream.getVideoTracks()[0].onended = () => { if (this.running) this.emit('status', 'Kamera uzildi. Darsni yakunlab, qayta boshlang.'); };
  }
  closeCamera() { this.stream?.getTracks().forEach((t) => { t.onended = null; t.stop(); }); this.stream = null; }

  /** Roʻyxatdan oʻtishda yuz hisoblanmagan boʻlsa (eski telefon), rasmdan hozir hisoblanadi. */
  async fillDescriptors() {
    for (const s of this.students) {
      if (s.descriptor || !s.has_photo) continue;
      try {
        const img = new Image();
        img.src = `/api/photo/${s.id}`;
        await img.decode();
        s.descriptor = await analysePhoto(toCanvas(img, 800));
        await api('PUT', `/t/faces/${s.id}`, { descriptor: s.descriptor });
      } catch { s.noFace = true; }
    }
  }

  async loop() {
    while (this.running) {
      const t = performance.now();
      try { await this.tick(); this.lastError = null; } catch (e) { console.error(e); if (!this.lastError) this.emit('status', 'Kadrni tahlil qilishda xatolik: ' + e.message); this.lastError = e; }
      await new Promise((r) => setTimeout(r, Math.max(50, 350 - (performance.now() - t))));
    }
  }

  regions() {
    const { width: W, height: H } = this.full;
    if (this.opts.tiles === 1) return [{ x: 0, y: 0, w: W, h: H }];
    const w = Math.round(W * 0.58), h = Math.round(H * 0.58);
    return [[0, 0], [W - w, 0], [0, H - h], [W - w, H - h]].map(([x, y]) => ({ x, y, w, h }));
  }

  async detect() {
    const faces = [];
    for (const r of this.regions()) {
      let src = this.full;
      if (this.opts.tiles > 1) {
        src = document.createElement('canvas');
        src.width = r.w; src.height = r.h;
        src.getContext('2d').drawImage(this.full, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      }
      const found = await fa.detectAllFaces(src, new fa.SsdMobilenetv1Options({ minConfidence: 0.45, maxResults: 60 })).withFaceLandmarks();
      for (const f of found) {
        const b = f.detection.box;
        const box = { x: b.x + r.x, y: b.y + r.y, w: b.width, h: b.height };
        if (faces.some((x) => iou(x.box, box) > 0.35)) continue; // boʻlaklar chegarasidagi takror
        faces.push({ box, src, aligned: f.alignedRect, yaw: yaw(f.landmarks.positions) });
      }
    }
    return faces;
  }

  async tick() {
    const v = this.video;
    if (!v?.videoWidth) return;
    const k = Math.min(1, 1920 / v.videoWidth);
    this.full.width = Math.round(v.videoWidth * k); this.full.height = Math.round(v.videoHeight * k);
    this.full.getContext('2d').drawImage(v, 0, 0, this.full.width, this.full.height);
    const faces = await this.detect();
    if (!this.running) return;
    const now = Date.now();

    for (const t of this.tracks) t.face = null;
    const pairs = [];
    faces.forEach((f) => this.tracks.forEach((t) => { const s = iou(f.box, t.box); if (s > 0.2) pairs.push([s, f, t]); }));
    pairs.sort((a, b) => b[0] - a[0]);
    const used = new Set();
    for (const [, f, t] of pairs) { if (t.face || used.has(f)) continue; used.add(f); Object.assign(t, { face: f, box: f.box, last: now, attentive: Math.abs(f.yaw) < YAW_LIMIT }); }
    for (const f of faces) if (!used.has(f)) this.tracks.push({ face: f, box: f.box, last: now, attentive: Math.abs(f.yaw) < YAW_LIMIT, sid: null, votes: 0, miss: 0, checked: 0, d: 9 });
    this.tracks = this.tracks.filter((t) => now - t.last < KEEP_MS);

    const queue = this.tracks.filter((t) => t.face && now - t.checked > (t.votes >= 2 ? 6000 : 300)).sort((a, b) => a.checked - b.checked).slice(0, 6);
    for (const t of queue) {
      t.checked = now;
      const [crop] = await fa.extractFaces(t.face.src, [t.face.aligned]);
      if (crop) this.vote(t, await fa.nets.faceRecognitionNet.computeFaceDescriptor(crop));
    }
    if (!this.running) return;

    const active = new Map(this.tracks.filter((t) => t.sid && t.votes >= 2).map((t) => [t.sid, t]));
    for (const s of this.students) {
      if (!s.descriptor) continue;
      const st = this.stats.get(s.id), t = active.get(s.id);
      const p = this.pendingStats.get(s.id) || { samples: 0, seen: 0, attentive: 0 };
      st.samples++; p.samples++;
      if (t) { st.seen++; p.seen++; if (t.face) st.strong++; if (t.attentive) { st.attentive++; p.attentive++; } }
      st.now = t ? (t.attentive ? 'attentive' : 'away') : 'unseen';
      this.pendingStats.set(s.id, p);
    }
    // Hech kim koʻrmayotgan boʻlsa kadr yuborilmaydi.
    if (this.viewers && this.token && !this.sending && now - (this.sentAt || 0) >= state.pace.frame) {
      this.sending = true; this.sentAt = now;
      this.publish().catch((e) => console.error(e)).finally(() => { this.sending = false; });
    }
    this.emit('tick');
  }

  /** Bir bola bitta yuzga biriktiriladi; ikki marta mos kelsagina tasdiqlanadi. */
  vote(t, desc) {
    const ranked = this.students.filter((s) => s.descriptor).map((s) => ({ id: s.id, d: dist(desc, s.descriptor) })).sort((a, b) => a.d - b.d);
    const [a, b] = ranked;
    const ok = a && a.d < MATCH && (!b || b.d - a.d > MARGIN);
    if (!ok) { if (t.sid && ++t.miss >= 3) Object.assign(t, { sid: null, votes: 0, miss: 0 }); return; }
    const rival = this.tracks.find((x) => x !== t && x.sid === a.id);
    if (rival) {
      if (rival.face && rival.d <= a.d) return;
      Object.assign(rival, { sid: null, votes: 0 });
    }
    if (t.sid === a.id) t.votes++; else Object.assign(t, { sid: a.id, votes: 1 });
    t.miss = 0; t.d = a.d;
  }

  score(sid) { const s = this.stats.get(sid); return s && s.seen ? Math.round(100 * s.attentive / s.samples) : null; }

  async publish() {
    const F = this.full, O = this.out, k = Math.min(1, this.opts.width / F.width), blur = this.opts.blur;
    O.width = Math.round(F.width * k); O.height = Math.round(F.height * k);
    const c = O.getContext('2d');
    c.drawImage(F, 0, 0, O.width, O.height);
    const sc = (b) => ({ x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k });
    const areas = this.tracks.map((t) => ({ t, b: grow(sc(t.box), O.width, O.height) }));
    const known = areas.filter(({ t }) => t.sid && t.votes >= 2);
    const patches = [];
    if (blur) {
      for (const { t, b } of known) {
        if (!t.face) continue;
        const p = document.createElement('canvas');
        p.width = Math.max(1, Math.round(b.w)); p.height = Math.max(1, Math.round(b.h));
        p.getContext('2d').drawImage(F, b.x / k, b.y / k, b.w / k, b.h / k, 0, 0, p.width, p.height);
        patches.push({ sid: t.sid, box: b, canvas: p });
      }
      for (const { b } of areas) {
        const M = this.mini;
        M.width = 6; M.height = 7;
        M.getContext('2d').drawImage(F, b.x / k, b.y / k, b.w / k, b.h / k, 0, 0, 6, 7);
        c.imageSmoothingEnabled = false;
        c.drawImage(M, b.x, b.y, b.w, b.h);
        c.imageSmoothingEnabled = true;
      }
    }
    // Bu yergacha hammasi bir zumda chizildi; keyingi kadr kelsa ham yuz va fon mos qoladi.
    const faces = known.map(({ t }) => ({ sid: t.sid, box: sc(t.box), attentive: t.attentive }));
    const scores = [...this.stats].map(([sid, s]) => ({ sid, score: this.score(sid), now: s.now }));
    const sound = this.mic ? this.sound.slice() : [], audioLen = sound.reduce((n, x) => n + x.length, 0), audioPos = this.soundEnd - audioLen;
    for (const p of patches) p.blob = await jpeg(p.canvas, 0.75);
    const base = await jpeg(O, 0.6);
    if (!this.running) return;
    const head = new TextEncoder().encode(JSON.stringify({
      w: O.width, h: O.height, base: base.size, blur, audio: !!this.mic, audioPos, audioLen, faces, scores,
      patches: patches.map((p) => ({ sid: p.sid, box: p.box, len: p.blob.size })),
    }));
    const len = new DataView(new ArrayBuffer(4));
    len.setUint32(0, head.length);
    const r = await fetch('/api/live/frame?t=' + encodeURIComponent(this.token), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: new Blob([len, head, base, ...patches.map((p) => p.blob), ...sound]) });
    if (!r.ok && r.status === 403) this.token = null; // keyingi "beat" yangisini beradi
  }

  /** Serverga hisob yuboradi, tomoshabinlar soni va yuborish ruxsatini oladi. */
  async beat() {
    if (!this.running || this.beating) return;
    this.beating = true;
    const sent = this.pendingStats;
    this.pendingStats = new Map();
    const items = [...sent].filter(([, p]) => p.samples).map(([sid, p]) => ({ sid, ...p, arrived: this.stats.get(sid).strong >= 3 }));
    try {
      const r = await api('POST', '/live/beat', { lesson: this.lesson.id, items });
      if (this.offline) { this.offline = false; this.emit('status', ''); }
      this.viewers = r.viewers; this.token = r.token;
      if (!r.camera_on) { this.offline = true; this.emit('status', 'Bu xona kamerasi admin tomonidan oʻchirilgan. Ota-onalarga tasvir bormayapti.'); }
    } catch (e) {
      for (const [sid, p] of sent) { const q = this.pendingStats.get(sid) || { samples: 0, seen: 0, attentive: 0 }; this.pendingStats.set(sid, { samples: p.samples + q.samples, seen: p.seen + q.seen, attentive: p.attentive + q.attentive }); }
      this.offline = true;
      this.emit('status', e.message);
      if (e.status === 409 && this.running) { this.halt(); this.emit('ended'); }
    }
    this.beating = false;
  }

  async stop() {
    if (!this.running) { this.closeCamera(); return; }
    const last = this.beat(); // oxirgi hisob
    this.halt();
    await last;
    this.emit('tick');
  }
  halt() {
    clearInterval(this.beater);
    this.running = false;
    this.viewers = 0;
    this.closeCamera();
    this.stopAudio();
    this.lock?.release?.().catch(() => {});
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}
const jpeg = (c, q) => new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('kadr boʻsh'))), 'image/jpeg', q));
export const camera = new ClassCamera();
