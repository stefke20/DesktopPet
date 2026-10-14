'use strict';
// Development stand-in for the native helper (used with --mock, and on non-Windows
// systems): a few fake windows, text boxes and desktop icons held in memory.
class MockBridge {
  constructor({ display, log = () => {} }) {
    this.log = log;
    this.display = display;       // {bounds, workArea, scaleFactor}
    this.uia = true;
    this.ready = true;
    this.t0 = Date.now();
    const sf = display.scaleFactor || 1;
    const W = display.bounds.width, H = display.bounds.height;
    this.sf = sf;
    this.fake = [
      { id: '101', title: 'Browser - Google', x: W * 0.28, y: H * 0.18, w: W * 0.42, h: H * 0.55, focused: true },
      { id: '102', title: 'Notes', x: W * 0.74, y: H * 0.38, w: W * 0.22, h: H * 0.34 },
      { id: '103', title: 'Terminal', x: W * 0.04, y: H * 0.42, w: W * 0.2, h: H * 0.36 },
    ];
    this.iconsList = [];
    for (let i = 0; i < 7; i++) this.iconsList.push({ name: `Icon ${i + 1}`, x: 16, y: 16 + i * 100, iw: 48, ih: 48 });
  }
  async start() {}
  stop() {}
  _phys(v) { return Math.round(v * this.sf); }
  async windows() {
    const d = this.display.bounds;
    const wob = Math.sin((Date.now() - this.t0) / 4000) * 0; // static; set >0 to test following a moving window
    return this.fake.map((w) => ({ id: w.id, hwnd: Number(w.id), title: w.title, cls: 'Mock', pid: 1, x: this._phys(d.x + w.x + wob), y: this._phys(d.y + w.y), w: this._phys(w.w), h: this._phys(w.h), focused: !!w.focused, maximized: false, fullscreen: false }));
  }
  async fields(hwnd) {
    const w = this.fake.find((q) => Number(q.id) === Number(hwnd));
    if (!w) return [];
    const d = this.display.bounds;
    return [0.3, 0.55].map((k) => ({ x: this._phys(d.x + w.x + w.w * 0.12), y: this._phys(d.y + w.y + w.h * k), w: this._phys(w.w * 0.76), h: this._phys(44) }));
  }
  async icons() {
    const d = this.display.bounds;
    return {
      auto: false,
      bounds: { x: this._phys(d.x), y: this._phys(d.y), w: this._phys(d.width), h: this._phys(this.display.workArea.height) },
      list: this.iconsList.map((i) => ({
        name: i.name, x: this._phys(d.x + i.x), y: this._phys(d.y + i.y),
        ix: this._phys(d.x + i.x + 12), iy: this._phys(d.y + i.y), iw: this._phys(i.iw), ih: this._phys(i.ih),
        bx: this._phys(d.x + i.x), by: this._phys(d.y + i.y), bw: this._phys(76), bh: this._phys(90),
      })),
    };
  }
  async iconImage(name) {
    // tiny coloured square PNG generated from an SVG-free canvas-less encoder
    const { encodePng } = require('../png.cjs');
    const n = Number(name.replace(/\D/g, '')) || 1;
    const size = 64, px = Buffer.alloc(size * size * 4);
    const hue = (n * 57) % 360;
    const [r, g, b] = hsl(hue / 360, 0.65, 0.55);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const inside = Math.min(x, y, size - 1 - x, size - 1 - y) > 5 && !(corner(x, y, size));
      const o = (y * size + x) * 4;
      if (inside) { px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255; }
    }
    return encodePng(size, size, px).toString('base64');
  }
  async moveIcon(name, left, top) {
    const i = this.iconsList.find((q) => q.name === name);
    if (!i) throw new Error('icon not found');
    const d = this.display.bounds;
    i.x = left / this.sf - d.x - 12; i.y = top / this.sf - d.y;
    return { ok: true };
  }
  async parkIcon(name) { return this.moveIcon(name, -5000, -5000); }
}
function corner(x, y, s) { const r = 12; const cx = x < r ? r : x > s - r - 1 ? s - r - 1 : x, cy = y < r ? r : y > s - r - 1 ? s - r - 1 : y; return Math.hypot(x - cx, y - cy) > r - 6; }
function hsl(h, s, l) {
  const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
module.exports = { MockBridge };
