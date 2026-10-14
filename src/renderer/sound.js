// Tiny WebAudio synthesiser for meows and purring (no audio files needed).
export class CatSound {
  constructor() { this.ctx = null; this.enabled = false; this.purrNodes = null; }

  _ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; } }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return true;
  }

  meow(pitch = 1) {
    if (!this.enabled || !this._ensure()) return;
    const c = this.ctx, t = c.currentTime, dur = 0.55 + Math.random() * 0.2;
    const osc = c.createOscillator(), osc2 = c.createOscillator();
    osc.type = 'sawtooth'; osc2.type = 'triangle';
    const base = 520 * pitch * (0.9 + Math.random() * 0.2);
    for (const o of [osc, osc2]) {
      o.frequency.setValueAtTime(base * 0.8, t);
      o.frequency.linearRampToValueAtTime(base * 1.35, t + dur * 0.35);
      o.frequency.linearRampToValueAtTime(base * 0.7, t + dur);
    }
    osc2.detune.value = 8;
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5;
    f1.frequency.setValueAtTime(700, t); f1.frequency.linearRampToValueAtTime(1500, t + dur * 0.4); f1.frequency.linearRampToValueAtTime(800, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.06);
    g.gain.setValueAtTime(0.2, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f1); osc2.connect(f1); f1.connect(g); g.connect(c.destination);
    osc.start(t); osc2.start(t); osc.stop(t + dur + 0.05); osc2.stop(t + dur + 0.05);
  }

  bark(pitch = 1) {
    if (!this.enabled || !this._ensure()) return;
    const c = this.ctx;
    const burst = (at, f0) => {
      const t = c.currentTime + at, dur = 0.16;
      const osc = c.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f0 * pitch, t); osc.frequency.exponentialRampToValueAtTime(f0 * 0.55 * pitch, t + dur);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(500, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(bp); bp.connect(g); g.connect(c.destination); osc.start(t); osc.stop(t + dur + 0.02);
    };
    burst(0, 330); if (Math.random() < 0.7) burst(0.24, 300);
  }

  /** Cats chattering at a bird: a rapid little "ek-ek-ek". */
  chatter() {
    if (!this.enabled || !this._ensure()) return;
    const c = this.ctx;
    for (let i = 0; i < 5; i++) {
      const t = c.currentTime + i * 0.085, dur = 0.05;
      const o = c.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(1300 + Math.random() * 200, t); o.frequency.exponentialRampToValueAtTime(900, t + dur);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 4;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(bp); bp.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    }
  }

  /** Two-tone doorbell. */
  ding() {
    if (!this.enabled || !this._ensure()) return;
    const c = this.ctx;
    for (const [f, at] of [[880, 0], [659, 0.45]]) {
      const t = c.currentTime + at;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.01;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      const g2 = c.createGain(); g2.gain.value = 0.25;
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(c.destination);
      o.start(t); o2.start(t); o.stop(t + 1); o2.stop(t + 1);
    }
  }

  purr(on) {
    if (!on) {
      if (this.purrNodes) { const { src, g } = this.purrNodes; const t = this.ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.linearRampToValueAtTime(0, t + 0.4); setTimeout(() => { try { src.stop(); } catch { /* ignore */ } }, 500); this.purrNodes = null; }
      return;
    }
    if (!this.enabled || !this._ensure() || this.purrNodes) return;
    const c = this.ctx;
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const am = c.createGain(); am.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.frequency.value = 24; const lfoGain = c.createGain(); lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain); lfoGain.connect(am.gain); lfo.start();
    const g = c.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.35, c.currentTime + 0.6);
    src.connect(lp); lp.connect(am); am.connect(g); g.connect(c.destination);
    src.start();
    this.purrNodes = { src, g };
  }
}
