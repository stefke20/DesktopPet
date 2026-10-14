// The cat's behaviour engine. Pure logic: no rendering, no Electron. Behaviours
// are generator functions that yield once per frame, which keeps long
// sequences ("walk there, jump, sit, groom") readable.
import { clamp, lerp, makeRng } from './geometry.js';
import { motionParams, plan, arc } from './nav.js';
import { IconField } from './icons.js';
import species from '../species.cjs';
const { SPECIES } = species;

const TAU = Math.PI * 2;

export class CatBrain {
  constructor({ world, rng = makeRng(), U = 336, settings = {}, species: speciesId = 'cat' }) {
    this.world = world;
    this.rng = rng;
    this.U = U;
    this.species = speciesId;
    this.traits = SPECIES[speciesId].traits;
    this.mp = motionParams(U, this.traits);
    this.icons = new IconField(world, this.mp);
    this.toys = new IconField(world, this.mp);   // yarn balls and other event props
    this.activeToy = null;
    this.butterfly = null;
    this.settings = { playWithIcons: true, mud: true, perch: true, chase: true, sleep: true, ...settings };

    this.x = world.width * 0.5;
    this.y = world.floorY;
    this.facing = 1;
    this.mode = 'ground';            // ground | air | wall | held
    this.rotZ = 0;                   // body tilt when climbing / hanging (rad)
    this.attach = { owner: 'floor', ox: 0, oy: 0 };
    this.support = null;
    this.wall = null;
    this.hidden = false;
    this.time = 0;
    this.energy = 0.8;
    this.mud = 0;
    this.events = [];
    this.puddle = null;
    this.anim = { state: 'stand', params: {} };
    this.cmd = { speed: 0, vy: 0, yaw: 0.45 };
    this.look = null;

    this.petting = false;
    this.held = false;
    this.holdTarget = { x: 0, y: 0 };
    this.iconSession = false;
    this.cool = { icons: 40, mud: 90, chase: 25, perch: 0 };
    this.lastActivity = 'start';
    this.pending = null;
    this.task = this.life();
    this._dt = 1 / 60;
  }

  // ------------------------------------------------------------------ config
  setScale(U) {
    this.U = U; this.mp = motionParams(U, this.traits); this.icons.setMotion(this.mp); this.toys.setMotion(this.mp);
    this.world.catH = 0.32 * U;
  }

  /** Swap between the cat and the dog (different jumping / climbing / sounds). */
  setSpecies(id, U = this.U) {
    this.species = id;
    this.traits = SPECIES[id].traits;
    this.lookAt = null; this.petting = false;
    this.setScale(U);
    if (this.mode === 'ground' && this.support) this.pending = this.life();
    else if (this.mode !== 'held') { this.rotZ = 0; this.wall = null; this.mode = 'air'; this.pending = this.fallRoutine(); }
  }

  get isDog() { return this.species === 'dog'; }
  get voice() { return this.traits.sound; }

  get catH() { return 0.32 * this.U; }
  get dt() { return this._dt; }

  // ------------------------------------------------------------------ owners
  originOf(owner) {
    if (owner === 'floor' || owner === 'screen') return { x: 0, y: 0 };
    if (typeof owner === 'string' && owner.startsWith('field:')) {
      const f = this.world.fields().find((q) => q.id === owner);
      return f ? { x: f.x, y: f.y } : null;
    }
    const w = this.world.getWindow(owner);
    return w ? { x: w.x, y: w.y } : null;
  }

  attachTo(owner) {
    const o = this.originOf(owner) || { x: 0, y: 0 };
    this.attach = { owner, ox: o.x, oy: o.y };
  }

  _findSupport() {
    const owner = this.attach.owner;
    let best = null, bd = Infinity;
    for (const s of this.world.horizontals()) {
      if (s.owner !== owner) continue;
      const d = this.x < s.x1 ? s.x1 - this.x : this.x > s.x2 ? this.x - s.x2 : 0;
      if (d < bd) { bd = d; best = s; }
    }
    return bd <= 0.6 * this.U ? best : null;
  }

  // ------------------------------------------------------------------ public input
  interrupt(gen) { this.pending = gen; }

  setPetting(on) {
    if (on && !this.petting && this.mode === 'ground' && !this.held) {
      this.petting = true;
      this.interrupt(this.petRoutine());
    } else if (!on) this.petting = false;
  }

  poke() {
    if (this.mode !== 'ground' || this.held) return;
    this.interrupt(this.pokeRoutine());
  }

  beginHold(x, y) {
    if (this.held) return;
    this.held = true; this.petting = false;
    this.holdTarget = { x, y };
    this.interrupt(this.holdRoutine());
  }
  moveHold(x, y) { this.holdTarget = { x, y }; }
  endHold() { this.held = false; }

  // ------------------------------------------------------------------ frame update
  update(dt) {
    dt = Math.min(dt, 0.05);
    this._dt = dt;
    this.time += dt;
    for (const k in this.cool) this.cool[k] -= dt;
    this.icons.step(dt);
    this.toys.step(dt);
    if (this.world.fullscreenActive) { this.hidden = true; return; }
    this.hidden = false;
    if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) this._reset();

    this._follow();
    this.cmd.speed = 0; this.cmd.vy = 0;
    if (this.pending) { this.task = this.pending; this.pending = null; }
    let r;
    try { r = this.task.next(); } catch (e) { console.error('[brain]', e); r = { done: true }; this._reset(); }
    if (r.done) this.task = this.life();
    this._ground();
    // safety net: whatever happened, the cat never ends up below the floor
    if (this.y > this.world.floorY + 4) {
      this.y = this.world.floorY;
      if (this.mode !== 'ground' && this.mode !== 'held') { this.mode = 'ground'; this.rotZ = 0; this.wall = null; this.attachTo('floor'); this.pending = this.life(); }
    }
    this._look();
    this.x = clamp(this.x, 0, this.world.width);
  }

  _reset() {
    this.x = this.world.width / 2; this.y = this.world.floorY; this.mode = 'ground'; this.rotZ = 0;
    this.attach = { owner: 'floor', ox: 0, oy: 0 }; this.held = false; this.petting = false;
    this.pending = this.life();
  }

  // Move along with the thing we stand on / cling to.
  _follow() {
    if (this.mode !== 'ground' && this.mode !== 'wall') { this.support = null; return; }
    const o = this.originOf(this.attach.owner);
    if (!o) { this.mode = 'ground'; this.support = null; this._startFall(); return; }
    this.x += o.x - this.attach.ox; this.y += o.y - this.attach.oy;
    this.attach.ox = o.x; this.attach.oy = o.y;
  }

  _ground() {
    if (this.mode === 'ground') {
      const s = this._findSupport();
      this.support = s;
      if (!s) { this._startFall(); return; }
      this.y = s.y;
      if (this.x < s.x1) this.x = Math.min(s.x1, this.x + 220 * this.dt);
      if (this.x > s.x2) this.x = Math.max(s.x2, this.x - 220 * this.dt);
    } else if (this.mode === 'wall' && this.wall) {
      const w = this.world.getSurface(this.wall.id) || this.world.walls().find((q) => q.owner === this.wall.owner && q.side === this.wall.side);
      if (!w) { this.mode = 'air'; this.rotZ = 0; this._startFall(); }
    }
  }

  _startFall() {
    if (this.pending) return;
    this.pending = this.fallRoutine();
  }

  // ------------------------------------------------------------------ attention
  _look() {
    this.look = null;
    const c = this.world.cursor;
    const st = this.anim.state;
    if (st === 'sleep' || this.mode === 'wall' || this.mode === 'held') return;
    let tx = null, ty = null;
    if (this.lookAt) { tx = this.lookAt.x; ty = this.lookAt.y; }
    else if (Math.hypot(c.x - this.x, c.y - this.y) < 1200) { tx = c.x; ty = c.y; }
    if (tx === null) return;
    const hx = this.x + this.facing * 0.22 * this.U, hy = this.y - 0.3 * this.U;
    this.look = { x: ((tx - hx) * this.facing) / this.U, y: (hy - ty) / this.U, z: 0.4 };
  }

  // ------------------------------------------------------------------ animation commands
  setAnim(state, params = {}, extra = {}) {
    if (this.isDog && state === 'groom') state = 'sit';   // dogs just sit and pant
    this.anim = { state, params };
    Object.assign(this.cmd, extra);
  }

  get descriptor() {
    const yawByState = { sniff: 0.3, bark: 0.6, walk: 0.3, stand: 0.5, sit: 0.7, loaf: 0.55, sleep: 0.5, pet: 1.15, groom: 0.8, jump: 0.2, crouch: 0.3, swat: 0.35, climb: 0.15, hang: 0.5, fall: 0.3, stretch: 0.45, yawn: 0.6, land: 0.3 };
    const a = this.anim;
    return {
      state: a.state, params: a.params,
      ctx: {
        speed: this.cmd.speed / this.U, vy: this.cmd.vy / this.U, facing: this.facing,
        yaw: this.cmd.yaw ?? yawByState[a.state] ?? 0.4, look: this.look, mud: this.mud,
      },
      rotZ: this.rotZ, x: this.x, y: this.y, hidden: this.hidden, mode: this.mode,
    };
  }

  // ------------------------------------------------------------------ primitives
  *wait(sec, state = 'stand', params = {}, extra = {}) {
    for (let t = 0; t < sec; t += this.dt) {
      this.setAnim(state, params, extra);
      yield;
      if (this.mode !== 'ground') return;
    }
  }

  *turn(dir) {
    if (dir === this.facing || dir === 0) return;
    this.facing = dir;
    yield* this.wait(0.16, 'stand');
  }

  /** Walk (or run) along the current surface to x. */
  *walkTo(tx, { run = false, tol = 4, timeout = 14 } = {}) {
    let t = 0;
    while (t < timeout) {
      const s = this.support;
      if (!s || this.mode !== 'ground') return false;
      const m = 0.04 * this.U;
      tx = clamp(tx, s.x1 + m, s.x2 - m);
      const dx = tx - this.x;
      if (Math.abs(dx) <= tol) return true;
      const dir = Math.sign(dx);
      if (dir !== this.facing) yield* this.turn(dir);
      let sp = run ? this.mp.run : this.mp.walk;
      if (!run) sp *= clamp(Math.abs(dx) / (0.5 * this.U), 0.5, 1);
      this.x += dir * Math.min(sp * this.dt, Math.abs(dx));
      this.setAnim('walk', {}, { speed: sp });
      this._nudgeIcons(dir * sp);
      t += this.dt;
      yield;
    }
    return false;
  }

  _nudgeIcons(vx) {
    for (const b of this.icons.bodies.values()) {
      if (b.pinned) continue;
      if (Math.abs(b.y + b.r - this.y) < 6 && Math.abs(b.x - (this.x + this.facing * 0.32 * this.U)) < b.r + 0.1 * this.U) this.icons.nudge(b.name, vx);
    }
  }

  *land(sec = 0.22) {
    for (let t = 0; t < sec; t += this.dt) { this.setAnim('land'); yield; }
  }

  *fallRoutine() {
    this.mode = 'air'; this.rotZ = 0;
    let vy = 0, vx = (this._carryVx || 0); this._carryVx = 0;
    const g = this.mp.gravity, y0 = this.y;
    let t = 0;
    while (true) {
      const py = this.y;
      vy += g * this.dt; if (vy > 18 * this.U) vy = 18 * this.U;
      this.x += vx * this.dt; this.y += vy * this.dt;
      vx *= Math.exp(-0.8 * this.dt);
      t += this.dt;
      if (this.x < 0 || this.x > this.world.width) { this.x = clamp(this.x, 0, this.world.width); vx = 0; }
      const s = this.world.landingBelow(this.x, py, this.y);
      if (s || this.y >= this.world.floorY) {
        const surf = s || this.world.getSurface('floor');
        this.y = surf.y;
        this.mode = 'ground'; this.attachTo(surf.owner);
        this.support = surf;
        if (this.y - y0 > 0.5 * this.U) this.events.push({ type: 'thud' });
        break;
      }
      const far = this.y - y0 > 0.9 * this.U && vy > 0;
      this.setAnim(far ? 'fall' : 'jump', {}, { vy: -vy });
      yield;
    }
    yield* this.land(0.28);
  }

  // Parabolic jump to a point on another surface (follows moving windows).
  *jumpTo(owner, kind, xb, { crouch = 0.3 } = {}) {
    const find = () => {
      let best = null, bd = Infinity;
      for (const s of this.world.horizontals()) {
        if (s.owner !== owner) continue;
        const d = xb < s.x1 ? s.x1 - xb : xb > s.x2 ? xb - s.x2 : 0;
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    };
    const target = find();
    if (!target) return false;
    const dir = Math.sign(xb - this.x) || this.facing;
    if (dir !== this.facing) yield* this.turn(dir);
    for (let t = 0; t < crouch; t += this.dt) { this.setAnim('crouch', { amount: 0.8 + 0.2 * (t / crouch) }); yield; if (this.mode !== 'ground') return false; }
    const o0 = this.originOf(owner) || { x: 0, y: 0 };
    const start = { x: this.x, y: this.y };
    const end0 = { x: clamp(xb, target.x1, target.x2), y: target.y };
    const { H, T } = arc(start, end0, this.mp);
    this.mode = 'air'; this.rotZ = 0;
    let t = 0;
    let px = this.x, py = this.y;
    while (t < T) {
      t += this.dt;
      const u = Math.min(1, t / T);
      const o = this.originOf(owner) || o0;
      const ex = end0.x + (o.x - o0.x), ey = end0.y + (o.y - o0.y);
      this.x = lerp(start.x, ex, u);
      this.y = lerp(start.y, ey, u) - 4 * H * u * (1 - u);
      const vy = -(this.y - py) / this.dt;
      px = this.x; py = this.y;
      this.setAnim('jump', {}, { vy });
      yield;
    }
    const s2 = find() || target;
    this.mode = 'ground'; this.attachTo(owner);
    this.x = clamp(this.x, s2.x1, s2.x2); this.y = s2.y; this.support = s2;
    yield* this.land(0.24);
    return true;
  }

  // ------------------------------------------------------------------ wall climbing
  *grabWall(wall, grabY) {
    const open = wall.open;
    const dir = -open;                       // face the wall
    if (this.facing !== dir) yield* this.turn(dir);
    const sx = this.x, sy = this.y;
    const ex = wall.x + open * 0.03 * this.U, ey = grabY;
    const T = 0.45, H = 0.2 * this.U;
    this.mode = 'air';
    const rot = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    for (let t = 0; t < T; t += this.dt) {
      const u = Math.min(1, (t + this.dt) / T);
      this.x = lerp(sx, ex, u); this.y = lerp(sy, ey, u) - 4 * H * u * (1 - u);
      this.rotZ = rot * smooth(clamp(u * 1.4, 0, 1));
      this.setAnim('jump', {}, { vy: 1 * (1 - 2 * u) * this.U });
      yield;
    }
    this.mode = 'wall'; this.wall = wall; this.rotZ = rot;
    this.x = ex; this.y = ey;
    this.attachTo(wall.owner);
  }

  *climbTo(yTarget) {
    const speed = this.mp.climb;
    while (this.mode === 'wall') {
      const dy = yTarget - this.y;
      if (Math.abs(dy) < 3) return true;
      this.y += Math.sign(dy) * Math.min(speed * this.dt, Math.abs(dy));
      this.setAnim('climb', {}, { speed, yaw: 0.12 });
      yield;
    }
    return false;
  }

  *clamber(top) {
    const dir = this.facing;                 // moving toward the window body
    const sx = this.x, sy = this.y;
    const ex = clamp(this.wall.x + dir * 0.35 * this.U, top.x1 + 4, top.x2 - 4), ey = top.y;
    const T = 0.6, H = 0.25 * this.U;
    this.mode = 'air';
    const rot0 = this.rotZ;
    for (let t = 0; t < T; t += this.dt) {
      const u = Math.min(1, (t + this.dt) / T);
      this.x = lerp(sx, ex, u); this.y = lerp(sy, ey, u) - 4 * H * u * (1 - u);
      this.rotZ = rot0 * (1 - smooth(u));
      this.setAnim('jump', {}, { vy: this.U * (1 - 1.6 * u) });
      yield;
    }
    this.rotZ = 0; this.mode = 'ground'; this.wall = null;
    this.attachTo(top.owner);
    this.x = ex; this.y = ey; this.support = top;
    yield* this.land(0.25);
  }

  *dropFromWall() {
    this.rotZ = 0; this.mode = 'air'; this.wall = null;
    this._carryVx = -this.facing * 0.15 * this.U;
    yield* this.fallRoutine();
  }

  // ------------------------------------------------------------------ navigation
  currentSurfaceId() { return this.support ? this.support.id : null; }

  /** Execute a planned route to surface `toId`. Returns true on arrival. */
  *goTo(toId, toX) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (this.mode !== 'ground' || !this.support) return false;
      const target = this.world.getSurface(toId);
      if (!target) return false;
      if (this.support.id === toId) break;
      const steps = plan(this.world, this.support.id, toId, this.mp, this.x);
      if (!steps || !steps.length) return false;
      const st = steps[0];
      if (st.type === 'jump') {
        yield* this.walkTo(st.xa, { run: this.rng.chance(0.25) });
        if (this.mode !== 'ground') return false;
        const B = this.world.getSurface(st.to);
        if (!B) return false;
        yield* this.jumpTo(B.owner, B.kind, st.xb);
      } else if (st.type === 'climb') {
        const W = this.world.getSurface(st.wall), B = this.world.getSurface(st.to);
        if (!W || !B) return false;
        yield* this.walkTo(W.x + W.open * 0.3 * this.U);
        if (this.mode !== 'ground') return false;
        yield* this.grabWall(W, st.grabY);
        yield* this.climbTo(B.y + 0.1 * this.U);
        const B2 = this.world.getSurface(st.to) || B;
        yield* this.clamber(B2);
      }
    }
    if (this.support && this.support.id === toId && toX !== undefined) yield* this.walkTo(toX);
    return !!this.support && this.support.id === toId;
  }

  // ------------------------------------------------------------------ routines
  *petRoutine() {
    const base = this.anim.state === 'sit' || this.anim.state === 'groom' || this.anim.state === 'loaf' ? 'sit' : 'sit';
    this.events.push({ type: 'purr', on: true });
    let calm = 0;
    while (this.petting && this.mode === 'ground') {
      this.setAnim('pet', { base }, { yaw: 1.1 });
      const c = this.world.cursor;
      if (c.moved > 1.5) calm += this.dt; else calm = 0;
      if (calm > 4) break;
      yield;
    }
    this.petting = false;
    this.events.push({ type: 'purr', on: false });
    yield* this.wait(0.8, 'sit');
  }

  *pokeRoutine() {
    const wasAsleep = this.anim.state === 'sleep' || this.anim.state === 'loaf';
    this.events.push({ type: this.isDog ? 'bark' : 'meow' });
    if (wasAsleep) {
      yield* this.wait(0.5, 'stand');
      yield* this.wait(1.6, 'stretch', { duration: 1.6 });
    } else {
      if (this.isDog) yield* this.wait(1.1, 'bark'); else yield* this.wait(0.9, 'yawn', { duration: 0.9 });
    }
  }

  *holdRoutine() {
    this.mode = 'held'; this.rotZ = 0; this.wall = null;
    const rotAbs = 1.15;
    this.events.push({ type: 'grab' });
    while (this.held) {
      const rot = this.facing > 0 ? rotAbs : -rotAbs;
      this.rotZ += (rot - this.rotZ) * Math.min(1, 10 * this.dt);
      // the neck (rig 0.2, 0.26) rotated by rotZ must sit under the cursor
      const nx = 0.2 * this.facing, ny = 0.26;
      const c = Math.cos(this.rotZ), sn = Math.sin(this.rotZ);
      this.x = this.holdTarget.x - (nx * c - ny * sn) * this.U;
      this.y = this.holdTarget.y + (nx * sn + ny * c) * this.U;
      this.setAnim('hang', {}, { yaw: 0.6 });
      this.x = clamp(this.x, 0, this.world.width);
      yield;
    }
    this.rotZ = 0;
    this.events.push({ type: 'release' });
    this.mode = 'air';
    yield* this.fallRoutine();
  }

  // ------------------------------------------------------------------ life
  *life() {
    while (true) {
      yield* this.decide();
    }
  }

  *decide() {
    if (this.mode !== 'ground' || !this.support) { yield; return; }
    const r = this.rng;
    const hasPerch = this.settings.perch && this.world.horizontals().some((s) => s.kind !== 'floor');
    const options = [];
    options.push({ id: 'idle', w: 2.2 });
    options.push({ id: 'wander', w: 2.0 });
    if (hasPerch && this.cool.perch <= 0) options.push({ id: 'perch', w: (1.8 + (this.world.fields().length ? 1.2 : 0)) * this.traits.perchWeight });
    if (this.settings.sleep && this.energy < 0.55) options.push({ id: 'nap', w: (0.55 - this.energy) * 9 });
    if (this.settings.playWithIcons && this.cool.icons <= 0 && this.iconCandidates().length) options.push({ id: 'icons', w: 2.6 });
    if (this.settings.mud && this.cool.mud <= 0 && this.mud <= 0) options.push({ id: 'mud', w: 0.9 });
    const c = this.world.cursor;
    if (this.settings.chase && this.cool.chase <= 0 && Math.hypot(c.vx, c.vy) > 150 && Math.hypot(c.x - this.x, c.y - this.y) < 900) options.push({ id: 'chase', w: 3.0 * this.traits.playful });
    const pick = r.weighted(options, (o) => o.w - (o.id === this.lastActivity ? 0.8 : 0));
    if (!pick) { yield* this.wait(1, 'stand'); return; }
    this.lastActivity = pick.id;
    switch (pick.id) {
      case 'idle': yield* this.idle(); break;
      case 'wander': yield* this.wander(); break;
      case 'perch': yield* this.perch(); break;
      case 'nap': yield* this.nap(); break;
      case 'icons': yield* this.playWithIcons(); break;
      case 'mud': yield* this.mudAdventure(); break;
      case 'chase': yield* this.chaseCursor(); break;
      default: break;
    }
    this.energy = clamp(this.energy - 0.03, 0, 1);
    yield;
  }

  *idle() {
    const r = this.rng;
    const kind = r.pick(this.isDog ? ['sit', 'sit', 'stand', 'sniff', 'stretch', 'yawn', 'bark'] : ['sit', 'sit', 'stand', 'groom', 'stretch', 'yawn', 'sniff']);
    switch (kind) {
      case 'sit': {
        const total = r.range(5, 12);
        for (let t = 0; t < total; t += this.dt) {
          this.setAnim('sit', { tail: 'wrap' }); yield; if (this.mode !== 'ground') return;
        }
        if (r.chance(0.5)) yield* this.wait(r.range(2.5, 4), 'groom');
        break;
      }
      case 'stand': yield* this.wait(r.range(3, 7), 'stand', { tail: r.pick(['rest', 'up', 'question']) }); break;
      case 'groom': yield* this.wait(1.0, 'sit'); yield* this.wait(r.range(3, 6), 'groom'); break;
      case 'stretch': yield* this.wait(2.4, 'stretch', { duration: 2.4 }); break;
      case 'sniff': yield* this.sniffAround(); break;
      case 'bark': { this.events.push({ type: 'bark' }); yield* this.wait(1.6, 'bark'); yield* this.wait(1, 'stand'); break; }
      case 'yawn': yield* this.wait(1.0, 'sit'); yield* this.wait(1.9, 'yawn', { duration: 1.9, sit: true }); break;
      default: break;
    }
  }

  /** Pad slowly along the surface with the nose to the ground. */
  *sniffAround() {
    const s = this.support;
    if (!s) return;
    const lo = s.x1 + 0.1 * this.U, hi = s.x2 - 0.1 * this.U;
    if (hi - lo < 0.6 * this.U) return;
    for (let leg = 0; leg < 2 && this.mode === 'ground'; leg++) {
      const tx = clamp(this.x + this.rng.pick([-1, 1]) * this.rng.range(0.8, 2.2) * this.U, lo, hi);
      const dir = Math.sign(tx - this.x) || this.facing;
      if (dir !== this.facing) yield* this.turn(dir);
      const sp = 0.32 * this.U;
      while (Math.abs(tx - this.x) > 4 && this.mode === 'ground' && this.support) {
        this.x += dir * Math.min(sp * this.dt, Math.abs(tx - this.x));
        this.setAnim('sniff', {}, { speed: sp });
        yield;
      }
      yield* this.wait(this.rng.range(0.4, 1.0), 'sniff');
    }
  }

  *wander() {
    const s = this.support;
    if (!s) return;
    const m = 0.1 * this.U;
    const lo = s.x1 + m, hi = s.x2 - m;
    if (hi - lo < 0.5 * this.U) { yield* this.wait(1, 'stand'); return; }
    let tx = this.rng.range(lo, hi);
    for (let i = 0; i < 6 && Math.abs(tx - this.x) < 0.9 * this.U; i++) tx = this.rng.range(lo, hi);
    if (this.isDog && this.rng.chance(0.35)) yield* this.sniffAround();
    yield* this.walkTo(tx, { run: this.rng.chance(this.isDog ? 0.4 : 0.2) });
    this.energy = clamp(this.energy - 0.02, 0, 1);
    yield* this.wait(this.rng.range(0.6, 2), 'stand');
  }

  pickPerch() {
    const here = this.support;
    const fields = this.world.fields();
    const focusWin = this.world.windows[0] ? this.world.windows[0].id : null;
    const cands = this.world.horizontals().filter((s) => s.kind !== 'floor' && (!here || s.id !== here.id));
    const reachable = [];
    for (const s of cands) {
      const p = here ? plan(this.world, here.id, s.id, this.mp, this.x) : null;
      if (p) reachable.push({ s, cost: p.length });
    }
    return this.rng.weighted(reachable, (c) => (c.s.kind === 'field' ? 3 : 1) * (c.s.winId === focusWin || c.s.owner === focusWin ? 1.6 : 1) / (1 + c.cost * 0.4))?.s || null;
  }

  *perch() {
    this.cool.perch = this.rng.range(15, 40);
    const target = this.pickPerch();
    if (!target) return;
    const m = 0.2 * this.U;
    const tx = this.rng.range(target.x1 + Math.min(m, (target.x2 - target.x1) / 2), target.x2 - Math.min(m, (target.x2 - target.x1) / 2));
    const ok = yield* this.goTo(target.id, tx);
    if (!ok) return;
    this.events.push({ type: 'perched', kind: target.kind });
    const total = this.rng.range(10, 40);
    const sleepy = this.energy < 0.7 && this.settings.sleep && this.rng.chance(0.5);
    if (sleepy) { yield* this.sleepOn(total); return; }
    for (let t = 0; t < total && this.mode === 'ground'; ) {
      const k = this.rng.pick(['sit', 'sit', 'groom', 'look', 'loaf']);
      const d = this.rng.range(3, 7);
      if (k === 'groom') yield* this.wait(d, 'groom');
      else if (k === 'loaf') yield* this.wait(d, 'loaf');
      else yield* this.wait(d, 'sit', { tail: 'wrap' });
      t += d;
      if (this.support && this.support.kind === 'field' && this.rng.chance(0.25)) {
        // paw at the text box
        yield* this.swatAt(this.x + this.facing * 0.5 * this.U, this.y, 'L');
      }
    }
  }

  *sleepOn(total) {
    yield* this.wait(2.5, 'sit');
    yield* this.wait(2.5, 'loaf');
    this.events.push({ type: 'sleep', on: true });
    for (let t = 0; t < total && this.mode === 'ground' && !this.pending; t += this.dt) {
      this.setAnim('sleep', {});
      this.energy = clamp(this.energy + this.dt * 0.03, 0, 1);
      yield;
    }
    this.events.push({ type: 'sleep', on: false });
    yield* this.wait(1.2, 'sit');
    yield* this.wait(2.2, 'stretch', { duration: 2.2 });
  }

  *nap() {
    // Prefer a cosy perch half the time.
    if (this.settings.perch && this.traits.napsOnPerch && this.rng.chance(0.5)) {
      const t = this.pickPerch();
      if (t) { const ok = yield* this.goTo(t.id, (t.x1 + t.x2) / 2); if (!ok) return; }
    }
    yield* this.sleepOn(this.rng.range(20, 50));
  }

  *swatAt(px, py, side = 'L', { onContact = null, dur = 0.7 } = {}) {
    let fired = false;
    for (let t = 0; t < dur; t += this.dt) {
      const u = t / dur;
      this.setAnim('swat', { t: u, side });
      if (!fired && u >= 0.4) { fired = true; if (onContact) onContact(); }
      yield;
      if (this.mode !== 'ground' && this.mode !== 'air') return;
    }
  }

  // ------------------------------------------------------------------ cursor
  *chaseCursor() {
    this.cool.chase = this.rng.range(45, 90);
    const end = this.time + this.rng.range(7, 14);
    this.events.push({ type: 'chase' });
    if (this.isDog) this.events.push({ type: 'bark' });
    while (this.time < end && this.mode === 'ground') {
      const c = this.world.cursor;
      const s = this.support;
      if (!s) return;
      const dx = c.x - this.x, dy = c.y - this.y;
      if (Math.abs(dx) > 1.1 * this.U) {
        const tx = c.x - Math.sign(dx) * 0.9 * this.U;
        const m = 0.04 * this.U;
        if (tx < s.x1 + m || tx > s.x2 - m) {
          // cursor beyond the end of this surface: try a surface below it
          const below = this.world.horizontals().filter((q) => q.kind !== 'wall' && c.x >= q.x1 && c.x <= q.x2 && q.y >= c.y - 0.2 * this.U).sort((a, b) => a.y - b.y)[0];
          if (below && below.id !== s.id && plan(this.world, s.id, below.id, this.mp, this.x)) { yield* this.goTo(below.id, c.x); continue; }
          yield* this.walkTo(clamp(c.x, s.x1, s.x2), { run: true, timeout: 1 });
          if (Math.abs(c.x - this.x) > 1.4 * this.U) break;
        }
        yield* this.walkTo(tx, { run: true, timeout: 0.6 });
      } else {
        // stalk and pounce
        const dir = Math.sign(dx) || this.facing;
        if (dir !== this.facing) yield* this.turn(dir);
        for (let t = 0; t < this.rng.range(0.7, 1.3); t += this.dt) { this.setAnim('crouch', { wiggle: true, amount: 1 }); this.lookAt = { x: c.x, y: c.y }; yield; }
        const px = this.world.cursor.x, py = this.world.cursor.y;
        yield* this.pounce(px, py);
        this.cool.chase = this.rng.range(20, 50);
        break;
      }
    }
    this.lookAt = null;
    yield* this.wait(this.rng.range(0.8, 2), 'stand');
  }

  *pounce(px, py, { onSwipe = null } = {}) {
    const start = { x: this.x, y: this.y };
    const dir = Math.sign(px - this.x) || this.facing;
    const reach = clamp(Math.abs(px - this.x), 0.25 * this.U, 1.5 * this.U);
    const end = { x: this.x + dir * reach * 0.9, y: this.y };
    const rise = clamp(this.y - py, 0, 1.2 * this.U);
    const H = 0.3 * this.U + rise * 0.9;
    const T = Math.max(0.5, Math.sqrt((8 * H) / this.mp.gravity));
    this.mode = 'air';
    for (let t = 0; t < T; t += this.dt) {
      const u = Math.min(1, (t + this.dt) / T);
      const py0 = this.y;
      this.x = lerp(start.x, end.x, u); this.y = lerp(start.y, end.y, u) - 4 * H * u * (1 - u);
      this.setAnim(u > 0.45 && u < 0.85 ? 'swat' : 'jump', { t: (u - 0.45) / 0.4, side: 'L' }, { vy: -(this.y - py0) / this.dt });
      if (onSwipe && u >= 0.62) { onSwipe(); onSwipe = null; }
      yield;
    }
    const s = this.world.landingBelow(this.x, this.y - 40, this.y + 40);
    if (s) { this.mode = 'ground'; this.attachTo(s.owner); this.y = s.y; this.support = s; yield* this.land(0.25); } else { yield* this.fallRoutine(); }
  }

  // ------------------------------------------------------------------ icons
  iconCandidates() {
    const out = [];
    for (const ic of this.world.icons) {
      if (this.icons.has(ic.name)) continue;
      const rect = { x: ic.ix ?? ic.x, y: ic.iy ?? ic.y, w: ic.iw ?? ic.w, h: ic.ih ?? ic.h };
      if (this.world.rectCovered(rect)) continue;
      if (!this.mp.climbs && this.world.floorY - (rect.y + rect.h / 2) > this.mp.maxRise * 0.95) continue;   // too high to reach
      out.push(ic);
    }
    return out;
  }

  /** Surface the cat should stand on to reach an icon at (cx, cy). */
  _standFor(cx, cy) {
    const surfs = this.world.horizontals().filter((s) => s.y >= cy && s.x2 > cx - 1.5 * this.U && s.x1 < cx + 1.5 * this.U);
    surfs.sort((a, b) => a.y - b.y);
    for (const s of surfs) {
      if (this.support && (s.id === this.support.id || plan(this.world, this.support.id, s.id, this.mp, this.x))) return s;
    }
    return null;
  }

  *playWithIcons() {
    this.cool.icons = this.rng.range(120, 240);
    const end = this.time + this.rng.range(25, 45);
    this.iconSession = true;
    this.events.push({ type: 'iconSession', on: true });
    let hits = 0;
    while (this.time < end && hits < 16 && this.mode === 'ground') {
      const t = this.pickIconTarget();
      if (!t) break;
      const ok = t.body ? yield* this.chaseIcon(t.body) : yield* this.knockDesktopIcon(t.icon);
      if (ok) hits++; else if (!t.body) break;
      yield* this.wait(this.rng.range(0.1, 0.5), 'stand');
    }
    this.iconSession = false;
    this.lookAt = null;
    this.events.push({ type: 'iconSession', on: false });
    yield* this.wait(1.0, 'sit');
    yield* this.wait(2.2, 'groom');
  }

  pickIconTarget() {
    // free icons that have come to rest are fair game; otherwise knock a new one
    const free = [...this.icons.bodies.values()].filter((b) => !b.pinned && !(b.ignoreUntil > this.time));
    const movingNear = free.filter((b) => !b.grounded || b.rest < 0.4);
    const pool = free.length ? free : [];
    if (pool.length && (this.icons.bodies.size >= 3 || this.rng.chance(0.75))) {
      const sorted = pool.sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x));
      return { body: sorted[0] };
    }
    const cands = this.iconCandidates();
    if (!cands.length) return pool.length ? { body: pool[0] } : null;
    const near = cands.sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y));
    return { icon: near[Math.min(near.length - 1, Math.floor(this.rng() * 3))] };
  }

  *chaseIcon(b) { return yield* this.chaseBody(b, this.icons); }

  *chaseBody(b, field = this.icons) {
    const s = this.world.supportAt(b.x, b.y + b.r, 14);
    if (s && this.support && s.id !== this.support.id) { const ok = yield* this.goTo(s.id); if (!ok) { b.ignoreUntil = this.time + 10; return false; } }
    if (this.support && (b.x < this.support.x1 - 0.4 * this.U || b.x > this.support.x2 + 0.4 * this.U)) { b.ignoreUntil = this.time + 10; return false; }
    // wait for the icon to slow down, run toward it
    const sendDir = b.x < this.world.width / 2 ? 1 : -1;
    for (let t = 0; t < 6 && this.mode === 'ground'; t += this.dt) {
      this.lookAt = { x: b.x, y: b.y };
      const standX = b.x - sendDir * 0.62 * this.U;
      const dx = standX - this.x;
      if (Math.abs(b.x - this.x) < 0.75 * this.U && Math.abs(b.x - this.x) > 0.35 * this.U && Math.abs(b.vx) < 0.9 * this.U) break;
      if (Math.abs(dx) < 6) {
        if (sendDir !== this.facing) yield* this.turn(sendDir);
        this.setAnim('crouch', { amount: 0.5, wiggle: true });
        yield; continue;
      }
      const dir = Math.sign(b.x - this.x) || this.facing;
      if (dir !== this.facing && Math.abs(b.x - this.x) > 0.3 * this.U) yield* this.turn(dir);
      const sp = Math.abs(dx) > 1.2 * this.U ? this.mp.run : this.mp.walk;
      const sup = this.support; if (!sup) return false;
      this.x = clamp(this.x + Math.sign(dx) * Math.min(sp * this.dt, Math.abs(dx)), sup.x1 + 4, sup.x2 - 4);
      this.setAnim('walk', {}, { speed: sp });
      yield;
    }
    if (this.mode !== 'ground') return false;
    const dir = Math.sign(b.x - this.x) || sendDir;
    if (dir !== this.facing) yield* this.turn(dir);
    let done = false;
    yield* this.swatAt(b.x, b.y, 'L', {
      dur: 0.6,
      onContact: () => {
        if (!field.has(b.name)) return;
        if (Math.abs(b.x - this.x) < 1.1 * this.U) {
          const p = this.rng.range(0.9, 1.5) * this.U * 2.2;
          field.swat(b.name, dir * 0.94, -0.35, p);
          this.events.push({ type: 'swat', name: b.name });
          done = true;
        }
      },
    });
    return done;
  }

  *knockDesktopIcon(ic) {
    const iw = ic.iw ?? ic.w, ih = ic.ih ?? ic.h;
    const cx = (ic.ix ?? ic.x) + iw / 2, cy = (ic.iy ?? ic.y) + ih / 2;
    const stand = this._standFor(cx, cy);
    if (!stand) return false;
    if (this.support.id !== stand.id) { const ok = yield* this.goTo(stand.id); if (!ok) return false; }
    const dir = cx < this.world.width / 2 ? 1 : -1;           // knock toward the middle of the screen
    const body = this.icons.activate({ name: ic.name, x: ic.ix ?? ic.x, y: ic.iy ?? ic.y, w: iw, h: ih, iw, ih });
    this.lookAt = { x: cx, y: cy };
    const h = stand.y - cy;
    const target = { x: cx - dir * 0.5 * this.U, y: cy + 0.05 * this.U };
    let launch = null;
    if (h <= 0.5 * this.U) {
      // low icon: just walk up to it and bat it from the ground
      yield* this.walkTo(clamp(cx - dir * 0.55 * this.U, stand.x1 + 6, stand.x2 - 6));
      if (this.mode !== 'ground') return false;
      if (dir !== this.facing) yield* this.turn(dir);
      let hit = false;
      yield* this.swatAt(cx, cy, 'L', {
        dur: 0.6,
        onContact: () => { hit = true; this.icons.swat(ic.name, dir * 0.9, -0.3, this.rng.range(1.0, 1.5) * this.U * 2.2); this.events.push({ type: 'swat', name: ic.name }); },
      });
      this.lookAt = null;
      return hit;
    }
    if (h <= 0.86 * this.mp.maxRise) {
      yield* this.walkTo(clamp(target.x - dir * 0.2 * this.U, stand.x1 + 6, stand.x2 - 6), { run: false });
      if (this.mode !== 'ground') return false;
      if (dir !== this.facing) yield* this.turn(dir);
      yield* this.wait(0.35, 'crouch', { amount: 1 });
      launch = 'ground';
    } else {
      // too high to jump: climb the screen edge next to the icons, then leap off the wall
      if (!this.mp.climbs) return false;
      const wall = this.world.getSurface(cx < this.world.width / 2 ? 'wall:screen:L' : 'wall:screen:R');
      const floor = this.world.getSurface('floor');
      if (!wall || !floor) return false;
      if (this.support.id !== 'floor') { const ok = yield* this.goTo('floor'); if (!ok) return false; }
      yield* this.walkTo(wall.x + wall.open * 0.3 * this.U);
      yield* this.grabWall(wall, this.y - 0.25 * this.U);
      yield* this.climbTo(cy + 0.55 * this.U);
      launch = 'wall';
    }
    // leap-swat toward the icon
    const start = { x: this.x, y: this.y };
    const end = { x: target.x, y: Math.min(target.y + (launch === 'wall' ? 0.45 * this.U : 0.55 * this.U), this.world.floorY - 0.1 * this.U) };
    const { H, T } = arc(start, end, this.mp, 0.12 * this.U);
    this.mode = 'air';
    const leapDir = Math.sign(cx - this.x) || dir;
    this.facing = leapDir;
    let fired = false, py = this.y;
    for (let t = 0; t < T + 0.05; t += this.dt) {
      const u = Math.min(1, (t + this.dt) / T);
      this.x = lerp(start.x, end.x, u); this.y = lerp(start.y, end.y, u) - 4 * H * u * (1 - u);
      this.rotZ *= 1 - Math.min(1, 6 * this.dt);
      const vy = -(this.y - py) / this.dt; py = this.y;
      if (u > 0.55) this.setAnim('swat', { t: (u - 0.55) / 0.45, side: 'L' }, { vy });
      else this.setAnim('jump', {}, { vy });
      if (!fired && u >= 0.88) {
        fired = true;
        const p = this.rng.range(1.1, 1.6) * this.U * 2.2;
        this.icons.swat(ic.name, leapDir * 0.9, -0.3, p);
        this.events.push({ type: 'swat', name: ic.name });
      }
      yield;
    }
    this._carryVx = leapDir * 0.25 * this.U;
    this.lookAt = null;
    yield* this.fallRoutine();
    return true;
  }

  // ------------------------------------------------------------------ mud
  *mudAdventure() {
    this.cool.mud = this.rng.range(200, 420);
    if (this.support.id !== 'floor') { const ok = yield* this.goTo('floor'); if (!ok) return; }
    const W = this.world.width;
    let px = this.rng.range(0.15 * W, 0.85 * W);
    for (let i = 0; i < 8 && Math.abs(px - this.x) < 2 * this.U; i++) px = this.rng.range(0.15 * W, 0.85 * W);
    this.puddle = { x: px, y: this.world.floorY, w: 1.25 * this.U, h: 0.2 * this.U, born: this.time, life: 420 };
    this.events.push({ type: 'puddle', puddle: this.puddle });
    const dir = Math.sign(px - this.x) || 1;
    yield* this.walkTo(px - dir * 1.1 * this.U);
    this.lookAt = { x: px, y: this.world.floorY };
    yield* this.wait(1.2, 'stand', { tail: 'question' });
    yield* this.walkTo(px - dir * 0.3 * this.U, { tol: 8 });
    for (let i = 0; i < 3; i++) {
      yield* this.swatAt(px, this.y, i % 2 ? 'R' : 'L', { dur: 0.5, onContact: () => this.events.push({ type: 'splash', x: px, y: this.y }) });
    }
    this.mud = 1;
    this.events.push({ type: 'muddy' });
    yield* this.walkTo(px + dir * 0.6 * this.U, { tol: 8 });
    this.lookAt = null;
    yield* this.wait(0.8, 'stand');
    yield* this.swatAt(this.x, this.y, 'R', { dur: 0.6 });   // shake a paw
    // walk away across the floor leaving prints
    const far = clamp(this.x + dir * this.rng.range(2.5, 5) * this.U, 40, W - 40);
    yield* this.walkTo(far);
    yield* this.wait(1.0, 'sit');
  }

  // ------------------------------------------------------------------ random events
  /** A visitor arrived (butterfly, yarn ball ...). The pet may drop what it is doing. */
  onEvent(ev) {
    const busy = this.mode !== 'ground' || this.held || this.petting || this.iconSession;
    if (busy) return;
    const sleeping = this.anim.state === 'sleep';
    if (sleeping && this.rng.chance(0.5)) return;       // sound asleep: ignores it
    if (ev.type === 'butterfly') { this.butterfly = ev; this.interrupt(this.chaseButterfly(ev)); }
    else if (ev.type === 'yarn') { this.interrupt(this.playWithBall(ev)); }
  }

  onEventEnd(ev) { if (this.butterfly === ev) this.butterfly = null; if (this.lookAt && this.lookAt.event === ev) this.lookAt = null; }

  /** Chase a butterfly: stalk, pounce, miss. Always misses. */
  *chaseButterfly(bf) {
    const maxAttempts = this.rng.pick([2, 3, 3, 4]);
    let attempts = 0, watch = 0;
    this.events.push({ type: 'notice', what: 'butterfly' });
    if (this.isDog) this.events.push({ type: 'bark' });
    const look = () => { this.lookAt = { x: bf.x, y: bf.y, event: bf }; };
    // freeze and stare for a moment
    for (let t = 0; t < 0.9 && !bf.done; t += this.dt) { look(); this.setAnim('stand', { ears: 'alert', tail: 'question' }); yield; if (this.mode !== 'ground') return; }
    while (!bf.done && attempts < maxAttempts && this.mode === 'ground' && this.support) {
      look();
      const s = this.support;
      const dx = bf.x - this.x, rise = this.y - bf.y;
      const m = 0.05 * this.U;
      if (rise > this.mp.maxRise * 1.25 + 0.2 * this.U) {
        // too high for a pounce right now: sit and follow it with the eyes
        this.setAnim('sit', { ears: 'alert', tail: 'question' });
        watch += this.dt; yield;
        if (watch > 6) break;
        continue;
      }
      watch = 0;
      if (Math.abs(dx) > 0.95 * this.U) {
        const dir = Math.sign(dx);
        if (dir !== this.facing) yield* this.turn(dir);
        const tx = clamp(bf.x - dir * 0.75 * this.U, s.x1 + m, s.x2 - m);
        if (Math.abs(tx - this.x) < 6) { this.setAnim('crouch', { amount: 0.6 }); yield; watch += this.dt; if (watch > 5) break; continue; }
        const sp = this.mp.run * (Math.abs(dx) > 2 * this.U ? 1 : 0.6);
        this.x += Math.sign(tx - this.x) * Math.min(sp * this.dt, Math.abs(tx - this.x));
        this.setAnim('walk', {}, { speed: sp });
        yield;
        continue;
      }
      // in range: crouch, wiggle, pounce -- the butterfly slips away at the last moment
      const dir = Math.sign(dx) || this.facing;
      if (dir !== this.facing) yield* this.turn(dir);
      for (let t = 0, d = this.rng.range(0.6, 1.0); t < d && !bf.done; t += this.dt) { look(); this.setAnim('crouch', { wiggle: true, amount: 1 }); yield; }
      if (bf.done || this.mode !== 'ground') break;
      yield* this.pounce(bf.x, bf.y, { onSwipe: () => { bf.dodge(this.x + this.facing * 0.3 * this.U, this.y - 0.4 * this.U); this.events.push({ type: 'miss' }); } });
      attempts++;
      // "...it got away" moment
      for (let t = 0; t < 1.1 && !bf.done; t += this.dt) { look(); this.setAnim('stand', { ears: 'back', tail: 'low' }); yield; if (this.mode !== 'ground') return; }
    }
    bf.leave();
    // watch it go, then sulk a little
    for (let t = 0; t < 2.6 && !bf.done && this.mode === 'ground'; t += this.dt) { look(); this.setAnim('sit', { ears: 'normal' }); yield; }
    this.lookAt = null;
    if (this.mode === 'ground') {
      if (this.isDog) yield* this.wait(1.2, 'sit', { tail: 'low' }); else yield* this.wait(1.6, 'groom');
    }
  }

  /** Bat a rolling ball of yarn around for a while. */
  *playWithBall(ev) {
    const b = ev.body;
    this.events.push({ type: 'notice', what: 'yarn' });
    const end = this.time + this.rng.range(18, 32);
    this.activeToy = b;
    let hits = 0;
    while (this.time < end && hits < 14 && this.mode === 'ground' && this.toys.has(b.name) && !ev.done) {
      const ok = yield* this.chaseBody(b, this.toys);
      if (ok) hits++;
      else {
        // couldn't reach it (it's on another surface): wait a beat, then maybe give up
        this.lookAt = { x: b.x, y: b.y, event: ev };
        yield* this.wait(0.5, 'stand');
        if (b.ignoreUntil > this.time) break;
      }
      yield* this.wait(this.rng.range(0.05, 0.3), 'stand');
    }
    this.activeToy = null;
    this.lookAt = null;
    yield* this.wait(1.0, 'sit');
  }

  /** Called by the renderer each time a paw print is stamped. */
  consumeMud(amount = 0.06) { this.mud = Math.max(0, this.mud - amount); }
}

const smooth = (t) => t * t * (3 - 2 * t);
