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

  draw(time, puddle, bodies) {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    if (puddle) this._puddle(c, puddle, time);
    for (const b of bodies) this._icon(c, b);
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
