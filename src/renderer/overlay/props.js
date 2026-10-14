// Things drawn on a 2-D canvas above the mud: the puddle and the "ghost" icons
// the cat is batting around.

export class PropsLayer {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.resize(width, height);
    this.images = new Map();     // icon name -> HTMLImageElement | null
    this.puddle = null;
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx = this.canvas.getContext('2d');
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setImage(name, img) { this.images.set(name, img); }
  hasImage(name) { return this.images.has(name); }

  draw(time, puddle, bodies, extras = {}) {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    if (puddle) this._puddle(c, puddle, time);
    for (const b of bodies) this._icon(c, b);
    if (extras.laser) this._laser(c, extras.laser, extras.U || 300, time);
    if (extras.visitor) this._doorbell(c, extras.visitor, extras.U || 300);
  }

  /** The laser pointer's red dot: toon outline, glow and a little highlight. */
  _laser(c, l, U, time) {
    const r = Math.max(5, 0.032 * U);
    c.save();
    c.globalAlpha = Math.max(0, l.fade);
    const g = c.createRadialGradient(l.x, l.y, r * 0.4, l.x, l.y, r * 4.2);
    g.addColorStop(0, 'rgba(255,60,60,0.55)'); g.addColorStop(1, 'rgba(255,60,60,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(l.x, l.y, r * 4.2, 0, Math.PI * 2); c.fill();
    const pulse = 1 + 0.12 * Math.sin(time * 30);
    c.lineWidth = Math.max(2, r * 0.35); c.strokeStyle = '#5a0c14'; c.fillStyle = '#ff3b45';
    c.beginPath(); c.arc(l.x, l.y, r * pulse, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(l.x - r * 0.3, l.y - r * 0.3, r * 0.28, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  /** Comic speech bubble: "DING-DONG!" next to the screen edge where someone is at the door. */
  _doorbell(c, v, U) {
    const k = Math.min(1, v.t / 0.25) * Math.min(1, (v.life - v.t) / 0.5);
    if (k <= 0) return;
    const fs = Math.max(14, 0.13 * U);
    const text = 'DING-DONG!';
    c.save();
    c.font = `900 ${fs}px "Segoe UI", system-ui, sans-serif`;
    const tw = c.measureText(text).width, pad = fs * 0.55, w = tw + pad * 2, h = fs + pad * 1.3;
    const left = v.side === 'L';
    const x = left ? v.x + 6 : v.x - w - 6, y = v.y - h / 2;
    const wob = Math.sin(v.t * 24) * 0.03 * Math.min(1, (1.2 - v.t));
    c.translate(x + w / 2, y + h / 2); c.rotate(wob); c.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k); c.globalAlpha = k;
    c.lineJoin = 'round'; c.lineWidth = Math.max(3, fs * 0.12); c.strokeStyle = '#3a2214'; c.fillStyle = '#fffaf0';
    c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, h * 0.45); c.fill(); c.stroke();
    // tail toward the edge
    c.beginPath();
    const tx = left ? -w / 2 : w / 2, dir = left ? -1 : 1;
    c.moveTo(tx, -h * 0.1); c.lineTo(tx + dir * h * 0.55, h * 0.15); c.lineTo(tx, h * 0.22); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ff8a3d'; c.strokeStyle = '#3a2214'; c.lineWidth = Math.max(2, fs * 0.1);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.strokeText(text, 0, fs * 0.04); c.fillText(text, 0, fs * 0.04);
    c.restore();
  }

  _puddle(c, p, time) {
    const age = time - p.born;
    const fade = Math.max(0, Math.min(1, (p.life - age) / 40));
    const dry = Math.min(1, age / 200);                       // shrinks as it dries
    const w = p.w * (1 - 0.45 * dry) * 0.5, h = p.h * (1 - 0.5 * dry) * 0.5;
    c.save();
    c.globalAlpha = fade;
    c.translate(p.x, p.y - h * 0.15);
    const g = c.createRadialGradient(0, 0, h * 0.2, 0, 0, w);
    g.addColorStop(0, 'rgba(86,58,32,0.95)');
    g.addColorStop(0.75, 'rgba(70,46,26,0.92)');
    g.addColorStop(1, 'rgba(70,46,26,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); c.fill();
    // sheen + ripples
    c.strokeStyle = `rgba(190,160,120,${0.35 * (1 - dry)})`;
    c.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      const r = ((time * 0.35 + i * 0.5) % 1);
      c.beginPath(); c.ellipse(Math.sin(i * 3) * w * 0.2, 0, w * 0.5 * r, h * 0.5 * r, 0, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
  }

  _icon(c, b) {
    const img = this.images.get(b.name);
    const s = b.r * 2.1;
    c.save();
    // contact shadow
    if (b.grounded || b.pinned) {
      c.globalAlpha = 0.28;
      c.fillStyle = '#000';
      c.beginPath(); c.ellipse(b.x, b.y + b.r * 0.95, b.r * 0.8, b.r * 0.16, 0, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    }
    c.translate(b.x, b.y);
    c.rotate(b.ang);
    c.shadowColor = 'rgba(0,0,0,0.35)';
    c.shadowBlur = 6; c.shadowOffsetY = 2;
    if (img) c.drawImage(img, -s / 2, -s / 2, s, s);
    else { // placeholder
      c.fillStyle = '#e8edf5'; c.strokeStyle = '#7a8aa5'; c.lineWidth = 2;
      c.beginPath(); c.roundRect(-s * 0.35, -s * 0.45, s * 0.7, s * 0.9, 6); c.fill(); c.stroke();
    }
    c.restore();
  }
}
