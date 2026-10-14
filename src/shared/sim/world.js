// The cat's view of the screen: windows, text fields, desktop icons, cursor.
// Everything is in overlay (screen) pixels, y pointing down.
import { subtractIntervals, rectsOverlap, pointInRect } from './geometry.js';

export class World {
  /**
   * @param {{width:number,height:number,floorY:number,catH:number}} o
   *   catH is the cat's standing height in px (used to discard useless perches).
   */
  constructor({ width, height, floorY, catH = 110 }) {
    this.width = width;
    this.height = height;
    this.floorY = floorY ?? height;
    this.catH = catH;
    this.windows = [];      // top-most first: {id,x,y,w,h,title,fullscreen,focused}
    this.fieldDefs = [];    // {winId,rx,ry,w,h}
    this.icons = [];        // {name,x,y,w,h}
    this.cursor = { x: width / 2, y: height / 2, vx: 0, vy: 0, t: 0, moved: 0 };
    this._surfaces = null;
    this.version = 0;
  }

  resize(width, height, floorY) {
    this.width = width; this.height = height; this.floorY = floorY ?? height; this._dirty();
  }

  _dirty() { this._surfaces = null; this.version++; }

  setWindows(list) {
    this.windows = list.map((w) => ({ ...w }));
    this._dirty();
  }

  /** Smoothly adopt new window rects so a perched cat follows without jitter. */
  setFields(defs) { this.fieldDefs = defs; this._dirty(); }
  setIcons(list) { this.icons = list; }

  setCursor(x, y, dt = 1 / 60) {
    const c = this.cursor;
    const vx = (x - c.x) / Math.max(dt, 1e-3), vy = (y - c.y) / Math.max(dt, 1e-3);
    const sp = Math.hypot(vx, vy);
    c.vx += (vx - c.vx) * 0.35; c.vy += (vy - c.vy) * 0.35;
    c.x = x; c.y = y;
    if (sp > 40) c.moved = 0; else c.moved += dt;
  }

  getWindow(id) { return this.windows.find((w) => w.id === id) || null; }
  get fullscreenActive() { return this.windows.some((w) => w.fullscreen); }

  fields() {
    const out = [];
    for (const d of this.fieldDefs) {
      const w = this.getWindow(d.winId);
      if (!w) continue;
      out.push({ id: `field:${d.winId}:${d.rx}:${d.ry}`, winId: d.winId, x: w.x + d.rx, y: w.y + d.ry, w: d.w, h: d.h });
    }
    return out;
  }

  /** Is the point covered by any window (optionally only those above `aboveIndex`)? */
  windowAt(x, y, aboveIndex = this.windows.length) {
    for (let i = 0; i < Math.min(aboveIndex, this.windows.length); i++) if (pointInRect(x, y, this.windows[i])) return this.windows[i];
    return null;
  }

  rectCovered(rect) {
    return this.windows.some((w) => rectsOverlap(w, rect));
  }

  /** Walkable horizontal pieces and climbable walls, occlusion-aware. */
  get surfaces() {
    if (this._surfaces) return this._surfaces;
    const S = [];
    const minW = this.catH * 0.9;
    // Floor (taskbar top / bottom of the work area): fully visible.
    const edge = this.catH * 1.6;      // keep the cat's whole body (nose to tail) on screen
    S.push({ id: 'floor', kind: 'floor', owner: 'floor', y: this.floorY, x1: edge, x2: this.width - edge, ix1: 0, ix2: this.width });
    // Screen-side walls
    S.push({ id: 'wall:screen:L', kind: 'wall', owner: 'screen', x: 0, y1: 0, y2: this.floorY, side: 'L', open: 1 });
    S.push({ id: 'wall:screen:R', kind: 'wall', owner: 'screen', x: this.width, y1: 0, y2: this.floorY, side: 'R', open: -1 });

    const wins = this.windows;
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i];
      if (w.fullscreen) continue;
      const above = wins.slice(0, i);
      // top edge
      if (w.y > this.catH * 0.6 && w.y < this.floorY - 20) {
        const cuts = above.filter((o) => w.y >= o.y && w.y <= o.y + o.h).map((o) => [o.x, o.x + o.w]);
        const pieces = subtractIntervals(w.x, w.x + w.w, cuts).filter(([a, b]) => b - a >= minW);
        pieces.forEach(([a, b], k) => S.push({ id: `win:${w.id}:top:${k}`, kind: 'top', owner: w.id, y: w.y, x1: a, x2: b }));
      }
      // side walls (outer edges), visible parts only
      for (const side of ['L', 'R']) {
        const x = side === 'L' ? w.x : w.x + w.w;
        const cuts = above.filter((o) => x >= o.x && x <= o.x + o.w).map((o) => [o.y, o.y + o.h]);
        const y1 = Math.max(w.y, 0), y2 = Math.min(w.y + w.h, this.floorY);
        const pieces = subtractIntervals(y1, y2, cuts).filter(([a, b]) => b - a >= this.catH);
        pieces.forEach(([a, b], k) => S.push({ id: `win:${w.id}:wall${side}:${k}`, kind: 'wall', owner: w.id, x, y1: a, y2: b, side, open: side === 'L' ? -1 : 1 }));
      }
    }
    // Text fields of the foreground window act as small shelves.
    const minField = this.catH * 0.7;
    for (const f of this.fields()) {
      const wi = wins.findIndex((w) => w.id === f.winId);
      if (wi < 0 || f.w < minField) continue;
      const w = wins[wi];
      if (f.y < w.y || f.y > w.y + w.h) continue;
      const cuts = wins.slice(0, wi).filter((o) => f.y >= o.y && f.y <= o.y + o.h).map((o) => [o.x, o.x + o.w]);
      const pieces = subtractIntervals(f.x, f.x + f.w, cuts).filter(([a, b]) => b - a >= minField);
      pieces.forEach(([a, b], k) => S.push({ id: `${f.id}:${k}`, kind: 'field', owner: f.id, winId: f.winId, y: f.y, x1: a, x2: b }));
    }
    this._surfaces = S;
    return S;
  }

  horizontals() { return this.surfaces.filter((s) => s.kind !== 'wall'); }
  walls() { return this.surfaces.filter((s) => s.kind === 'wall'); }

  getSurface(id) { return this.surfaces.find((s) => s.id === id) || null; }

  /**
   * Horizontal surface whose y is within `tol` of `y` and whose interval holds x.
   * Prefers the closest in y.
   */
  supportAt(x, y, tol = 6) {
    let best = null, bd = Infinity;
    for (const s of this.horizontals()) {
      if (x < s.x1 - 2 || x > s.x2 + 2) continue;
      const d = Math.abs(s.y - y);
      if (d <= tol && d < bd) { best = s; bd = d; }
    }
    return best;
  }

  /** First horizontal surface at/below y that holds x (for landing). */
  landingBelow(x, yFrom, yTo) {
    let best = null;
    for (const s of this.horizontals()) {
      if (x < s.x1 || x > s.x2) continue;
      if (s.y >= yFrom - 0.5 && s.y <= yTo + 0.5 && (!best || s.y < best.y)) best = s;
    }
    return best;
  }
}
