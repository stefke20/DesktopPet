// Random events that visit the desktop: a butterfly that flutters across the
// screen (and always escapes the pet), a ball of yarn that rolls in, ...
// Pure logic; rendering lives in src/renderer/props/.
import { clamp } from './geometry.js';

export const EVENT_TYPES = ['butterfly', 'yarn'];

const PALETTES = [
  { wing: '#ffa63d', wing2: '#ff6f3c', spot: '#fff4d6', edge: '#3a1d12' },   // monarch
  { wing: '#6fc3ff', wing2: '#3f7fe0', spot: '#eaf7ff', edge: '#16284a' },   // blue
  { wing: '#ff9ccf', wing2: '#e0589c', spot: '#fff0f8', edge: '#4a1535' },   // pink
  { wing: '#ffe45e', wing2: '#f0b429', spot: '#fffbe0', edge: '#4a3510' },   // brimstone
];

export class Butterfly {
  constructor({ world, rng, U, fromLeft = rng() < 0.5, life = rng.range(26, 42) }) {
    this.type = 'butterfly';
    this.world = world; this.rng = rng; this.U = U;
    const W = world.width;
    this.x = fromLeft ? -0.3 * U : W + 0.3 * U;
    this.y = rng.range(Math.max(0.12 * world.height, world.floorY - 2.1 * U), world.floorY - 0.9 * U);
    this.heading = fromLeft ? rng.range(-0.3, 0.2) : Math.PI + rng.range(-0.2, 0.3);
    this.vx = Math.cos(this.heading) * 0.6 * U; this.vy = Math.sin(this.heading) * 0.6 * U;
    this.t = 0; this.life = life;
    this.state = 'flying';           // flying | dodge | leaving
    this.evade = 0;
    this.dodges = 0;
    this.phase = rng.range(0, 6);    // wing-flap phase
    this.seed = [rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)];
    this.palette = rng.pick(PALETTES);
    this.entered = false;
    this.done = false;
    this.facing = 1;
  }

  /** The pet swipes at us: zip away from the paw. */
  dodge(fromX, fromY) {
    let dx = this.x - fromX, dy = this.y - fromY;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    const side = Math.abs(dx) < 0.3 ? (this.rng() < 0.5 ? -1 : 1) : Math.sign(dx);
    this.vx = (side * 0.8 + dx * 0.6) * 2.6 * this.U;
    this.vy = -(0.9 + Math.abs(dy) * 0.5) * 2.0 * this.U;
    this.state = 'dodge'; this.evade = 0.75; this.dodges++;
    this.heading = Math.atan2(this.vy, this.vx);
  }

  leave() { if (this.state !== 'leaving') this.state = 'leaving'; }

  update(dt) {
    const U = this.U, W = this.world.width, floor = this.world.floorY;
    this.t += dt;
    this.phase += dt * (this.state === 'dodge' ? 32 : 19);
    if (this.t > this.life && this.state === 'flying') this.state = 'leaving';

    if (this.state === 'dodge') {
      this.evade -= dt;
      this.vx *= Math.exp(-2.2 * dt); this.vy *= Math.exp(-2.2 * dt);
      if (this.evade <= 0) { this.state = 'flying'; this.heading = Math.atan2(this.vy, this.vx) || this.heading; }
    } else if (this.state === 'leaving') {
      const dir = this.x < W / 2 ? -1 : 1;
      const tvx = dir * 1.1 * U, tvy = -0.45 * U;
      const k = Math.min(1, 2.5 * dt);
      this.vx += (tvx - this.vx) * k; this.vy += (tvy - this.vy) * k;
      this.heading = Math.atan2(this.vy, this.vx);
      if (this.x < -0.5 * U || this.x > W + 0.5 * U || this.y < -0.5 * U) this.done = true;
    } else {
      // lazy, erratic wandering: heading drifts with a mix of slow sines
      const turn = 1.5 * Math.sin(this.t * 0.9 + this.seed[0]) + 1.0 * Math.sin(this.t * 2.3 + this.seed[1]);
      let steer = 0;
      const minY = Math.max(0.1 * this.world.height, floor - 2.4 * U), maxY = floor - 0.7 * U;
      if (!this.entered && this.x > 0.04 * W && this.x < 0.96 * W) this.entered = true;
      if (this.entered) {
        // outside the playground? aim for a point back inside it
        const out = this.x < 0.08 * W || this.x > 0.92 * W || this.y < minY || this.y > maxY;
        if (out) {
          const tx = this.x < 0.08 * W ? 0.3 * W : this.x > 0.92 * W ? 0.7 * W : this.x;
          const ty = this.y < minY ? minY + U : this.y > maxY ? maxY - U : this.y;
          let diff = Math.atan2(ty - this.y, tx - this.x) - this.heading;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          steer = diff * 2.5;
        }
      }
      this.heading += (turn * 0.8 + steer) * dt;
      const sp = (0.55 + 0.25 * Math.sin(this.t * 3.1 + this.seed[2])) * U;
      const k = Math.min(1, 3 * dt);
      this.vx += (Math.cos(this.heading) * sp - this.vx) * k;
      this.vy += (Math.sin(this.heading) * sp - this.vy) * k;
    }
    // flutter: little vertical bobs on top of the path
    this.x += this.vx * dt;
    this.y += this.vy * dt + Math.sin(this.t * 9 + this.seed[0]) * 0.22 * U * dt;
    if (this.vx > 8) this.facing = 1; else if (this.vx < -8) this.facing = -1;
    if (this.state !== 'leaving') this.y = clamp(this.y, 0.05 * this.world.height, floor - 0.35 * U);
  }
}

/** Schedules random events and tells the pet about them. */
export class EventDirector {
  constructor({ world, brain, rng, enabled = true }) {
    this.world = world; this.brain = brain; this.rng = rng;
    this.enabled = enabled;
    this.active = [];
    this.timer = rng.range(35, 70);      // the first visitor arrives fairly soon
  }

  get butterfly() { return this.active.find((e) => e.type === 'butterfly') || null; }

  canSpawn() {
    const b = this.brain;
    return this.enabled && !this.world.fullscreenActive && !b.held && b.mode !== 'held' && this.active.length === 0;
  }

  /** Start an event now (random type unless named). */
  trigger(type) {
    const t = type || this.rng.weighted(EVENT_TYPES, (k) => (k === 'butterfly' ? 3 : 2));
    const b = this.brain;
    let ev = null;
    if (t === 'butterfly') ev = new Butterfly({ world: this.world, rng: this.rng, U: b.U });
    else if (t === 'yarn') ev = this._yarn();
    if (!ev) return null;
    this.active.push(ev);
    b.onEvent(ev);
    return ev;
  }

  _yarn() {
    const b = this.brain, W = this.world.width;
    const fromLeft = this.rng() < 0.5;
    const r = 0.13 * b.U;
    const body = b.toys.activate({ name: 'yarn', x: fromLeft ? -2 * r : W + r, y: this.world.floorY - 2.5 * r, w: 2 * r, h: 2 * r });
    body.pinned = false; body.vx = (fromLeft ? 1 : -1) * 1.6 * b.U; body.vy = -0.3 * b.U; body.r = r;
    return { type: 'yarn', body, t: 0, life: 70, done: false };
  }

  update(dt) {
    if (!this.enabled) { this._drop(); return; }
    for (const ev of this.active) {
      if (ev.type === 'butterfly') ev.update(dt);
      else if (ev.type === 'yarn') {
        ev.t += dt;
        if (ev.t > ev.life) ev.done = true;
        if (ev.t > 6 && ev.body.rest > 3 && this.brain.activeToy !== ev.body) ev.life = Math.min(ev.life, ev.t + 25);
      }
    }
    for (const ev of this.active.filter((e) => e.done || (e.type === 'butterfly' && e.done))) this._end(ev);
    this.active = this.active.filter((e) => !e.done);
    if (!this.active.length && this.canSpawn()) {
      this.timer -= dt;
      if (this.timer <= 0) { this.trigger(); this.timer = this.rng.range(110, 260); }
    }
  }

  _end(ev) { if (ev.type === 'yarn') this.brain.toys.release('yarn'); this.brain.onEventEnd(ev); }
  _drop() { for (const ev of this.active) this._end(ev); this.active = []; }
}
