// Full-screen 2-D layer holding muddy paw prints. Wiping with the cursor erases
// them (destination-out), so a print only disappears once it's really rubbed.

export class MudLayer {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.resize(width, height);
    this.count = 0;
    this._dryTimer = 0;
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

  clear() {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
    this.count = 0;
  }

  /** One muddy paw print. `s` is the paw size in px, toes point along +x before rotation. */
  stamp(x, y, angle, s, strength = 1, rnd = Math.random) {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(angle + (rnd() - 0.5) * 0.25);
    const a = Math.min(1, 0.45 + 0.55 * strength);
    const blob = (cx, cy, rx, ry, rot, alpha) => {
      c.beginPath();
      c.ellipse(cx * s, cy * s, rx * s, ry * s, rot, 0, Math.PI * 2);
      c.fillStyle = `rgba(62,40,22,${alpha})`;
      c.fill();
    };
    // soft smear first, crisp print on top
    for (const pass of [0, 1]) {
      const g = pass === 0 ? 1.18 : 1;
      const al = pass === 0 ? 0.22 * a : 0.78 * a;
      blob(-0.12, 0, 0.36 * g, 0.3 * g, 0, al);
      blob(-0.3, -0.16, 0.18 * g, 0.16 * g, 0, al);
      blob(-0.3, 0.16, 0.18 * g, 0.16 * g, 0, al);
      for (const [tx, ty, r] of [[0.42, -0.15, 0.13], [0.46, 0.15, 0.13], [0.27, -0.4, 0.12], [0.27, 0.4, 0.12]]) blob(tx, ty, r * g * 1.15, r * g, ty > 0 ? 0.3 : -0.3, al);
    }
    // splatter
    for (let i = 0; i < 5; i++) {
      const ang = rnd() * Math.PI * 2, d = (0.7 + rnd() * 0.5) * s;
      c.beginPath();
      c.arc(Math.cos(ang) * d, Math.sin(ang) * d, (0.03 + rnd() * 0.06) * s, 0, Math.PI * 2);
      c.fillStyle = `rgba(62,40,22,${0.4 * a})`;
      c.fill();
    }
    c.restore();
    this.count++;
  }

  /** A splash of mud (puddle stomp). */
  splat(x, y, s, rnd = Math.random) {
    const c = this.ctx;
    for (let i = 0; i < 14; i++) {
      const ang = -Math.PI * (0.1 + 0.8 * rnd()), d = rnd() * s * 1.4;
      c.beginPath();
      c.arc(x + Math.cos(ang) * d, y + Math.sin(ang) * d * 0.6, (0.04 + rnd() * 0.12) * s, 0, Math.PI * 2);
      c.fillStyle = `rgba(70,45,24,${0.35 + rnd() * 0.4})`;
      c.fill();
    }
  }

  /** Erase mud along a cursor segment. Returns true if the segment touched anything. */
  wipe(x0, y0, x1, y1, radius = 22) {
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.lineCap = 'round';
    c.lineWidth = radius * 2;
    c.strokeStyle = 'rgba(0,0,0,0.34)';
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
    c.restore();
  }

  /** Mud slowly dries and fades so the screen doesn't stay dirty forever. */
  dry(dt) {
    this._dryTimer += dt;
    if (this._dryTimer < 5) return;
    this._dryTimer = 0;
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = 'rgba(0,0,0,0.012)';
    c.fillRect(0, 0, this.w, this.h);
    c.restore();
  }
}
