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
