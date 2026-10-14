// Physics for the "ghost" desktop icons the cat plays with: circles that fall,
// bounce, roll along window tops / the taskbar, and bump into each other.

export class IconField {
  constructor(world, mp) {
    this.world = world;
    this.mp = mp;
    this.bodies = new Map();
    this.events = [];
  }

  setMotion(mp) { this.mp = mp; }

  get active() { return [...this.bodies.values()]; }
  has(name) { return this.bodies.has(name); }

  /** Start playing with an icon. `rect` is the icon image rect, in overlay px. */
  activate(info) {
    if (this.bodies.has(info.name)) return this.bodies.get(info.name);
    const w = info.iw ?? info.w, h = info.ih ?? info.h;
    const b = {
      name: info.name, x: info.x + w / 2, y: info.y + h / 2, vx: 0, vy: 0,
      r: Math.max(18, Math.max(w, h) * 0.48), ang: 0, av: 0,
      homeX: info.x + w / 2, homeY: info.y + h / 2, pinned: true, rest: 0, grounded: false, last: 0,
    };
    this.bodies.set(b.name, b);
    this.events.push({ type: 'activated', name: b.name });
    return b;
  }

  /** The cat bats an icon. dir is a unit vector; power in px/s. */
  swat(name, dirx, diry, power) {
    const b = this.bodies.get(name);
    if (!b) return;
    b.pinned = false; b.rest = 0; b.grounded = false;
    b.vx += dirx * power;
    b.vy += diry * power - power * 0.22;
    b.av += (dirx >= 0 ? 1 : -1) * (6 + Math.random() * 6);
  }

  /** Gentle shove when the cat walks into an icon. */
  nudge(name, vx) {
    const b = this.bodies.get(name);
    if (!b || b.pinned) return;
    b.vx += vx * 0.8; b.rest = 0;
  }

  step(dt) {
    const W = this.world.width;
    const g = this.mp.gravity;
    const surfaces = this.world.horizontals();
    for (const b of this.bodies.values()) {
      if (b.pinned) continue;
      const prevBottom = b.y + b.r;
      b.vy += g * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ang += b.av * dt;
      // screen side walls
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.5; }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.5; }
      // one-way supports (window tops, fields, taskbar)
      b.grounded = false;
      let best = null;
      for (const s of surfaces) {
        if (b.x < (s.ix1 ?? s.x1) - b.r * 0.3 || b.x > (s.ix2 ?? s.x2) + b.r * 0.3) continue;
        const bottom = b.y + b.r;
        if (prevBottom <= s.y + 3 && bottom >= s.y && b.vy >= 0 && (!best || s.y < best.y)) best = s;
      }
      if (best) {
        b.supportY = best.y;
        b.y = best.y - b.r;
        if (b.vy > 140) { b.vy = -b.vy * 0.42; b.av *= 0.9; } else b.vy = 0;
        b.grounded = Math.abs(b.vy) < 1;
      }
      // keep inside the screen vertically
      if (b.y > this.world.height - b.r) { b.y = this.world.height - b.r; b.vy = 0; b.grounded = true; }
      if (b.grounded || (b.vy === 0)) {
        b.vx *= Math.exp(-0.55 * dt);
        b.av = b.vx / b.r;
      } else {
        b.av *= Math.exp(-0.2 * dt);
      }
      if (Math.abs(b.vx) < 6 && b.grounded) { b.vx = 0; b.av *= 0.8; }
      b.rest = (b.grounded && Math.abs(b.vx) < 8 && Math.abs(b.vy) < 8) ? b.rest + dt : 0;
      if (!b.grounded) b.supportY = undefined;
    }
    // icon <-> icon collisions
    const list = [...this.bodies.values()];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], c = list[j];
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy), min = a.r + c.r;
      if (d >= min || d < 1e-3) continue;
      const nx = dx / d, ny = dy / d, pen = min - d;
      if (!a.pinned) { a.x -= nx * pen * (c.pinned ? 1 : 0.5); a.y -= ny * pen * (c.pinned ? 1 : 0.5); }
      if (!c.pinned) { c.x += nx * pen * (a.pinned ? 1 : 0.5); c.y += ny * pen * (a.pinned ? 1 : 0.5); }
      const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
      if (rv < 0) {
        const j2 = -rv * 0.9;
        if (!a.pinned) { a.vx -= nx * j2; a.vy -= ny * j2; a.rest = 0; }
        if (!c.pinned) { c.vx += nx * j2; c.vy += ny * j2; c.rest = 0; }
      }
    }
    // collision pushes must never sink an icon through what it rests on
    for (const b of list) if (b.supportY !== undefined && b.y + b.r > b.supportY) b.y = b.supportY - b.r;
  }

  /** True when every free icon has stopped moving. */
  get settled() {
    for (const b of this.bodies.values()) if (!b.pinned && b.rest < 0.7) return false;
    return true;
  }

  /** Remove a body (icon committed back to the real desktop). */
  release(name) { this.bodies.delete(name); }
}
