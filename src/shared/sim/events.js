// Random events that visit the desktop: a butterfly that flutters across the
// screen (and always escapes the pet), a ball of yarn / tennis ball that rolls in,
// a laser dot, a toy mouse, a bird, someone at the door ...
// Pure logic; rendering lives in src/renderer/props/.
import { clamp } from './geometry.js';

export const EVENT_TYPES = ['butterfly', 'toy', 'laser', 'mouse', 'bird', 'visitor'];
// how likely each visitor is, per species
const WEIGHTS = {
  cat: { butterfly: 3, toy: 2, laser: 3, mouse: 3, bird: 2, visitor: 1 },
  dog: { butterfly: 2, toy: 3, laser: 2, mouse: 1, bird: 2, visitor: 3 },
};

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


/** Horizontal surface of `owner` that is closest to x (or null). */
function surfaceOf(world, owner, x) {
  let best = null, bd = Infinity;
  for (const s of world.horizontals()) {
    if (s.owner !== owner) continue;
    const d = x < s.x1 ? s.x1 - x : x > s.x2 ? x - s.x2 : 0;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

const sgn = (v, d = 1) => (v > 0 ? 1 : v < 0 ? -1 : d);

/** A laser-pointer dot that skitters along surfaces and always escapes the pounce. */
export class Laser {
  constructor({ world, rng, U, surface }) {
    this.type = 'laser';
    this.world = world; this.rng = rng; this.U = U;
    this.owner = surface.owner;
    const lo = surface.x1 + 0.4 * U, hi = Math.max(lo, surface.x2 - 0.4 * U);
    this.x = rng.range(lo, hi);
    this.y = surface.y - 0.03 * U;
    this.state = 'rest'; this.pause = 0.9;
    this.t = 0; this.life = rng.range(16, 26);
    this.target = this.x; this.speed = 2.5 * U;
    this.fade = 1; this.dodges = 0; this.done = false;
  }

  _surface() { return surfaceOf(this.world, this.owner, this.x) || surfaceOf(this.world, 'floor', this.x); }

  _pick() {
    const U = this.U, rng = this.rng;
    const s = this._surface();
    if (rng.chance(0.2)) {   // hop to another surface
      const others = this.world.horizontals().filter((q) => q !== s);
      if (others.length) { const o = rng.pick(others); this.owner = o.owner; this.target = rng.range(o.x1 + 0.4 * U, Math.max(o.x1 + 0.4 * U, o.x2 - 0.4 * U)); this.speed = 4 * U; this.state = 'move'; return; }
    }
    const lo = s.x1 + 0.3 * U, hi = Math.max(lo, s.x2 - 0.3 * U);
    this.target = clamp(this.x + rng.pick([-1, 1]) * rng.range(0.8, 2.6) * U, lo, hi);
    this.speed = rng.range(2.2, 3.8) * U;
    this.state = 'move';
  }

  /** The pet pounced: the dot darts away. */
  dodge(fromX) {
    const s = this._surface(); if (!s) return;
    const U = this.U, lo = s.x1 + 0.3 * U, hi = Math.max(lo, s.x2 - 0.3 * U);
    const dir = sgn(this.x - fromX, this.rng() < 0.5 ? -1 : 1);
    this.target = clamp(this.x + dir * this.rng.range(1.6, 3) * U, lo, hi);
    if (Math.abs(this.target - this.x) < 0.8 * U) this.target = clamp(this.x - dir * 2 * U, lo, hi);
    this.speed = 6.5 * U; this.state = 'move'; this.dodges++;
  }

  update(dt) {
    this.t += dt;
    const s = this._surface();
    if (s) { this.y += (s.y - 0.03 * this.U - this.y) * Math.min(1, 14 * dt); }
    if (this.t > this.life && this.state !== 'off') this.state = 'off';
    if (this.state === 'off') { this.fade -= dt * 2.2; if (this.fade <= 0) this.done = true; return; }
    if (this.state === 'rest') { this.pause -= dt; if (this.pause <= 0) this._pick(); return; }
    const dx = this.target - this.x;
    const step = this.speed * dt;
    if (Math.abs(dx) <= step) { this.x = this.target; this.state = 'rest'; this.pause = this.rng.range(0.55, 1.3); } else this.x += sgn(dx) * step;
  }
}

/** A toy mouse zig-zagging along the floor; it bolts whenever the pet gets close. */
export class Mouse {
  constructor({ world, rng, U }) {
    this.type = 'mouse';
    this.world = world; this.rng = rng; this.U = U;
    const fromLeft = rng() < 0.5;
    this.x = fromLeft ? -0.25 * U : world.width + 0.25 * U;
    this.y = world.floorY;
    this.dir = fromLeft ? 1 : -1; this.facing = this.dir;
    this.state = 'run'; this.timer = rng.range(0.8, 1.6);
    this.speed = 1.25 * U; this.t = 0; this.life = rng.range(18, 28);
    this.phase = 0; this.dodges = 0; this.entered = false; this.done = false;
  }

  dodge(fromX) {
    this.dir = sgn(this.x - fromX, this.dir);
    this.facing = this.dir;
    this.state = 'dart'; this.timer = 0.55; this.dodges++;
  }

  update(dt, pet) {
    const U = this.U, W = this.world.width;
    this.t += dt;
    if (!this.entered && this.x > 0.04 * W && this.x < 0.96 * W) this.entered = true;
    if (this.state !== 'exit' && (this.t > this.life || this.dodges >= 4)) { this.state = 'exit'; this.dir = this.x < W / 2 ? -1 : 1; this.facing = this.dir; }
    // too close to the pet's nose: bolt
    if (pet && this.state !== 'dart' && this.state !== 'exit' && Math.abs(pet.x - this.x) < 0.45 * U && Math.abs(pet.y - this.y) < 0.8 * U) this.dodge(pet.x);
    let v = 0;
    if (this.state === 'run') {
      v = this.speed;
      this.timer -= dt;
      if (this.timer <= 0) { this.state = 'pause'; this.timer = this.rng.range(0.45, 1.1); }
    } else if (this.state === 'pause') {
      this.timer -= dt;
      if (this.timer <= 0) { this.state = 'run'; this.timer = this.rng.range(0.8, 1.8); if (this.rng.chance(0.45)) { this.dir = -this.dir; this.facing = this.dir; } }
    } else if (this.state === 'dart') {
      v = 3.6 * U;
      this.timer -= dt;
      if (this.timer <= 0) { this.state = 'run'; this.timer = this.rng.range(0.8, 1.6); }
    } else if (this.state === 'exit') {
      v = 2.2 * U;
      if (this.x < -0.5 * U || this.x > W + 0.5 * U) this.done = true;
    }
    if (this.entered && this.state !== 'exit') {
      if (this.x < 0.06 * W && this.dir < 0) { this.dir = 1; this.facing = 1; }
      if (this.x > 0.94 * W && this.dir > 0) { this.dir = -1; this.facing = -1; }
    }
    this.x += this.dir * v * dt;
    this.phase += dt * (v / U) * 14;
    this.moving = v > 0;
  }
}

/** A bird: flies over, sometimes lands on a window edge until the pet creeps too close. */
export class Bird {
  constructor({ world, rng, U, pet = null }) {
    this.type = 'bird';
    this.world = world; this.rng = rng; this.U = U;
    const fromLeft = rng() < 0.5;
    this.dir = fromLeft ? 1 : -1; this.facing = this.dir;
    this.x = fromLeft ? -0.4 * U : world.width + 0.4 * U;
    this.baseY = rng.range(0.1 * world.height, Math.max(0.2 * world.height, Math.min(0.4 * world.height, world.floorY - 3.6 * U)));
    this.y = this.baseY;
    this.vx = this.dir * 1.6 * U; this.vy = 0;
    this.t = 0; this.phase = rng.range(0, 6); this.state = 'fly';
    this.perch = null; this.timer = 0; this.flushed = false; this.done = false;
    this.palette = rng.pick(['bluebird', 'robin', 'sparrow']);
    // maybe land on a window edge
    const tops = world.horizontals().filter((q) => q.kind === 'top' && q.x2 - q.x1 > 1.2 * U);
    if (tops.length && rng.chance(0.65)) {
      const q = rng.pick(tops);
      let px = rng.range(q.x1 + 0.5 * U, q.x2 - 0.5 * U);
      // don't land on the pet's head: if it is on this window, pick a spot well away from it
      if (pet && pet.owner === q.owner) for (let i = 0; i < 8 && Math.abs(px - pet.x) < 3 * U; i++) px = rng.range(q.x1 + 0.5 * U, q.x2 - 0.5 * U);
      this.perch = { owner: q.owner, x: px };
    }
  }

  _perchY() {
    const s = this.perch && surfaceOf(this.world, this.perch.owner, this.perch.x);
    return s ? s.y - 0.1 * this.U : null;
  }

  /** The pet came too close / pounced: take off. */
  flush(fromX) {
    if (this.state === 'perched' || this.state === 'approach') {
      this.state = 'takeoff'; this.flushed = true;
      this.dir = sgn(this.x - (fromX ?? this.x - 1), this.dir); this.facing = this.dir;
      this.vx = this.dir * 1.6 * this.U; this.vy = -2.4 * this.U;
    }
  }

  update(dt, pet) {
    const U = this.U, W = this.world.width;
    this.t += dt;
    this.phase += dt * (this.state === 'perched' ? 0 : 15);
    if (this.state === 'fly') {
      this.x += this.vx * dt;
      this.y = this.baseY + Math.sin(this.t * 2.1) * 0.22 * U;
      if (this.perch && ((this.dir > 0 && this.x > this.perch.x - 2.8 * U) || (this.dir < 0 && this.x < this.perch.x + 2.8 * U))) this.state = 'approach';
      if (this.x < -0.8 * U || this.x > W + 0.8 * U) this.done = true;
    } else if (this.state === 'approach') {
      const py = this._perchY();
      if (py === null) { this.flush(); return; }
      const dx = this.perch.x - this.x, dy = py - this.y;
      const d = Math.hypot(dx, dy);
      const sp = Math.max(0.5 * U, Math.min(1.6 * U, d * 1.4));
      this.x += (dx / (d || 1)) * sp * dt; this.y += (dy / (d || 1)) * sp * dt;
      this.dir = sgn(dx, this.dir); this.facing = this.dir;
      if (d < 0.08 * U) { this.state = 'perched'; this.timer = this.rng.range(7, 11); }
    } else if (this.state === 'perched') {
      const py = this._perchY();
      if (py === null) { this.flush(); return; }
      this.y = py;
      this.timer -= dt;
      if (pet && Math.abs(pet.x - this.x) < 1.1 * U && Math.abs(pet.y - (py + 0.1 * U)) < 1.4 * U) this.flush(pet.x);
      else if (this.timer <= 0) this.flush(this.x - this.dir);
    } else if (this.state === 'takeoff') {
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vy += -0.2 * U * dt;
      this.vx *= Math.exp(-0.2 * dt);
      if (this.x < -0.8 * U || this.x > W + 0.8 * U || this.y < -0.8 * U) this.done = true;
    }
  }
}

/** Somebody rang the doorbell (shown as a comic "Ding-dong!" bubble at a screen edge). */
export class Visitor {
  constructor({ world, rng, U }) {
    this.type = 'visitor';
    this.side = rng() < 0.5 ? 'L' : 'R';
    this.x = this.side === 'L' ? 0.2 * U : world.width - 0.2 * U;
    this.y = world.floorY - 1.7 * U;
    this.t = 0; this.life = 9; this.done = false;
  }
  update(dt) { this.t += dt; if (this.t > this.life) this.done = true; }
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

  /** Start an event now (random type unless named). `yarn` / `ball` name a specific toy. */
  trigger(type) {
    const b = this.brain, w = this.world;
    const weights = WEIGHTS[b.species] || WEIGHTS.cat;
    let t = type || this.rng.weighted(EVENT_TYPES, (k) => weights[k]);
    let kind = null;
    if (t === 'yarn' || t === 'ball') { kind = t; t = 'toy'; }
    let ev = null;
    if (t === 'butterfly') ev = new Butterfly({ world: w, rng: this.rng, U: b.U });
    else if (t === 'toy') ev = this._toy(kind || (b.isDog ? 'ball' : 'yarn'));
    else if (t === 'laser') {
      const here = b.support || w.getSurface('floor');
      ev = new Laser({ world: w, rng: this.rng, U: b.U, surface: here });
    } else if (t === 'mouse') ev = new Mouse({ world: w, rng: this.rng, U: b.U });
    else if (t === 'bird') ev = new Bird({ world: w, rng: this.rng, U: b.U, pet: { x: b.x, owner: b.attach.owner } });
    else if (t === 'visitor') ev = new Visitor({ world: w, rng: this.rng, U: b.U });
    if (!ev) return null;
    this.active.push(ev);
    b.onEvent(ev);
    return ev;
  }

  _toy(kind) {
    const b = this.brain, W = this.world.width;
    const fromLeft = this.rng() < 0.5;
    const r = 0.065 * b.U;           // a toy about as big as the pet's head
    const body = b.toys.activate({ name: kind, x: fromLeft ? -3 * r : W + 2 * r, y: this.world.floorY - 2.5 * r, w: 2 * r, h: 2 * r });
    body.pinned = false; body.vx = (fromLeft ? 1 : -1) * 1.6 * b.U; body.vy = -0.3 * b.U; body.r = r;
    return { type: 'toy', kind, body, t: 0, life: 70, done: false };
  }

  update(dt) {
    if (!this.enabled) { this._drop(); return; }
    const pet = { x: this.brain.x, y: this.brain.y };
    for (const ev of this.active) {
      if (ev.type === 'toy') {
        ev.t += dt;
        if (ev.t > ev.life) ev.done = true;
        if (ev.t > 6 && ev.body.rest > 3 && this.brain.activeToy !== ev.body) ev.life = Math.min(ev.life, ev.t + 25);
      } else ev.update(dt, pet);
    }
    for (const ev of this.active.filter((e) => e.done)) this._end(ev);
    this.active = this.active.filter((e) => !e.done);
    if (!this.active.length && this.canSpawn()) {
      this.timer -= dt;
      if (this.timer <= 0) { this.trigger(); this.timer = this.rng.range(110, 260); }
    }
  }

  _end(ev) { if (ev.type === 'toy') this.brain.toys.release(ev.body.name); this.brain.onEventEnd(ev); }
  _drop() { for (const ev of this.active) this._end(ev); this.active = []; }
}
