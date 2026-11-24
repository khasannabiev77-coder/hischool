/* Mikrofon ovozini 16 kHz, 8 bitli mu-law ga oʻtkazadi. */
class Mic extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Uint8Array(1600); this.n = 0; this.pos = 0; }
  process([input]) {
    const x = input[0];
    if (!x) return true;
    const step = sampleRate / 16000;
    for (; this.pos < x.length; this.pos += step) {
      const s = Math.max(-1, Math.min(1, x[Math.floor(this.pos)]));
      const y = (Math.sign(s) * Math.log(1 + 255 * Math.abs(s))) / Math.log(256);
      this.buf[this.n++] = Math.round((y + 1) * 127.5);
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice()); this.n = 0; }
    }
    this.pos -= x.length;
    return true;
  }
}
registerProcessor('mic', Mic);
