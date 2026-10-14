// Ties the simulation to the screen: world sync from the native bridge, the
// brain, the 3D cat, mud / props layers, input handling and icon hand-off.
import * as THREE from 'three';
import { CatView } from './cat/CatView.js';
import { CatAnimator } from './cat/animator.js';
import { STAND_FEET } from './cat/pose.js';
import { World } from '../shared/sim/world.js';
import { CatBrain } from '../shared/sim/brain.js';
import { makeRng } from '../shared/sim/geometry.js';
import { MudLayer } from './overlay/mud.js';
import { PropsLayer } from './overlay/props.js';
import { CatSound } from './sound.js';

const PX_PER_UNIT = 480;
const CANVAS = 640;

export class PetApp {
  constructor({ host, catBuffer, display, settings, seed }) {
    this.host = host;
    this.settings = { size: 0.7, coat: 'ginger', playWithIcons: true, mud: true, perch: true, chase: true, sleep: true, paused: false, ...settings };
    this.display = display;
    const W = display.width, H = display.height;

    this.mudLayer = new MudLayer(document.getElementById('mud'), W, H);
    this.props = new PropsLayer(document.getElementById('props'), W, H);
    this.catCanvas = document.getElementById('cat');
    this.view = new CatView(this.catCanvas, catBuffer, { pxPerUnit: PX_PER_UNIT, size: CANVAS });
    this.anim = new CatAnimator(this.view);
    this.sound = new CatSound();

    const U = PX_PER_UNIT * this.settings.size;
    this.world = new World({ width: W, height: H, floorY: display.floorY, catH: 0.32 * U });
    this.brain = new CatBrain({ world: this.world, rng: makeRng(seed), U, settings: this.settings });
    this.applySettings(this.settings);

    this.cursor = { x: W / 2, y: H / 2 };
    this.prevCursor = { x: W / 2, y: H / 2 };
    this.interactive = false;
    this.press = null;
    this.hoverTime = 0;
    this.awayTime = 0;
    this.time = 0;
    this.running = true;
    this.iconInfo = new Map();      // name -> bridge icon info
    this.iconReady = new Map();     // name -> 'loading' | 'ready' | 'failed'
    this.parked = new Set();
    this.settleTimer = 0;
    this.dirty = false;
    this.hudEl = document.getElementById('hud');
    this.hudBtn = document.getElementById('reset');
    this.hudRect = null;
    this.last = performance.now();
    this._tmp = new THREE.Vector3();

    host.onState((s) => this.onState(s));
    host.onCursor((c) => { this.cursor = c; });
    host.onCommand((c) => this.onCommand(c));
    window.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    this.hudBtn.addEventListener('click', () => this.resetIcons());
    requestAnimationFrame((t) => this.frame(t));
  }

  get S() { return PX_PER_UNIT * this.settings.size; }

  // ------------------------------------------------------------- host data
  onState(s) {
    if (s.display) this.updateDisplay(s.display);
    if (s.windows) this.world.setWindows(s.windows);
    if (s.fields) this.world.setFields(s.fields);
    if (s.icons) {
      for (const i of s.icons) this.iconInfo.set(i.name, i);
      this.world.setIcons(s.icons);
    }
    if (s.dirty !== undefined) { this.dirty = s.dirty; this.hudEl.style.display = this.dirty ? 'block' : 'none'; }
  }

  updateDisplay(d) {
    this.display = d;
    this.world.resize(d.width, d.height, d.floorY);
    this.mudLayer.resize(d.width, d.height);
    this.props.resize(d.width, d.height);
  }

  onCommand(c) {
    switch (c.type) {
      case 'settings': this.applySettings(c.settings); break;
      case 'clear-prints': this.mudLayer.clear(); break;
      case 'reset-icons': this.dropAllIcons(); break;
      case 'poke': this.brain.poke(); break;
      case 'summon': this.brain.interrupt(this.summon()); break;
      default: break;
    }
  }

  *summon() {
    const b = this.brain;
    if (b.mode !== 'ground') yield* b.wait(0.5);
    b.lookAt = null;
    for (let i = 0; i < 400 && Math.abs(this.cursor.x - b.x) > 1.2 * b.U && b.mode === 'ground' && b.support; i++) {
      yield* b.walkTo(this.cursor.x, { run: true, timeout: 0.5 });
    }
    yield* b.wait(1.2, 'sit');
  }

  applySettings(st) {
    Object.assign(this.settings, st);
    const f = this.settings.size;
    this.view.setCoat(this.settings.coat);
    this.view.setSizeFactor(f);
    this.brain.setScale(PX_PER_UNIT * f);
    Object.assign(this.brain.settings, this.settings);
    this.sound.enabled = !!this.settings.sound;
    if (!this.settings.sound) this.sound.purr(false);
  }

  // ------------------------------------------------------------- input
  hitCat(p) {
    const v = this._tmp, S = this.S;
    const pts = [];
    for (const n of ['pelvis', 'spine1', 'chest', 'neck2', 'head']) {
      this.view.bones[n].getWorldPosition(v);
      pts.push([this.brain.x + v.x * S, this.brain.y - v.y * S]);
    }
    const r = 0.1 * S;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(p.x - (ax + dx * t), p.y - (ay + dy * t)) <= r) return true;
    }
    return false;
  }

  onDown(e) {
    if (this.hudRect && this.pointInHud(e)) return;
    if (this.brain.hidden || !this.hitCat({ x: e.clientX, y: e.clientY })) return;
    this.press = { x: e.clientX, y: e.clientY, held: false };
    this.brain.setPetting(false);
  }

  onMove(e) {
    if (!this.press) return;
    if (!this.press.held && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 8) {
      this.press.held = true;
      this.brain.beginHold(e.clientX, e.clientY);
    }
    if (this.press.held) this.brain.moveHold(e.clientX, e.clientY);
  }

  onUp() {
    if (!this.press) return;
    if (this.press.held) this.brain.endHold(); else this.brain.poke();
    this.press = null;
  }

  pointInHud(p) {
    const r = this.hudRect;
    return r && (p.clientX ?? p.x) >= r.left && (p.clientX ?? p.x) <= r.right && (p.clientY ?? p.y) >= r.top && (p.clientY ?? p.y) <= r.bottom;
  }

  updateInteraction(dt) {
    const c = this.cursor;
    const over = !this.brain.hidden && this.hitCat(c);
    this.hudRect = this.dirty ? this.hudBtn.getBoundingClientRect() : null;
    const overHud = this.hudRect && this.pointInHud({ x: c.x, y: c.y });
    const want = !!(over || overHud || this.press);
    if (want !== this.interactive) { this.interactive = want; this.host.setInteractive(want); }
    // stroking: hover slowly over the cat
    const speed = Math.hypot(c.x - this.prevCursor.x, c.y - this.prevCursor.y) / Math.max(dt, 1e-3);
    if (over && !this.press && speed < 380) { this.hoverTime += dt; this.awayTime = 0; } else if (!over) { this.awayTime += dt; if (this.awayTime > 0.7) this.hoverTime = 0; }
    if (this.hoverTime > 0.6 && this.brain.mode === 'ground') this.brain.setPetting(true);
    if (this.awayTime > 0.9) this.brain.setPetting(false);
  }

  // ------------------------------------------------------------- icons
  async loadIcon(name) {
    this.iconReady.set(name, 'loading');
    try {
      const url = await this.host.iconImage(name);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      this.props.setImage(name, img);
      this.iconReady.set(name, 'ready');
    } catch (e) {
      this.iconReady.set(name, 'failed');
    }
  }

  syncIcons() {
    const field = this.brain.icons;
    for (const e of field.events) if (e.type === 'activated') this.loadIcon(e.name);
    field.events.length = 0;
    // park the real icon as soon as its ghost can replace it
    for (const b of field.bodies.values()) {
      if (this.parked.has(b.name)) continue;
      const st = this.iconReady.get(b.name);
      if (st === 'ready' || st === 'failed' || !b.pinned) {
        this.parked.add(b.name);
        this.host.parkIcon(b.name);
        this.dirty = true; this.hudEl.style.display = 'block';
      }
    }
    // when the game is over and everything stopped, put the real icons where the ghosts ended up
    if (!this.brain.iconSession && field.bodies.size && field.settled) {
      this.settleTimer += 1 / 60;
      if (this.settleTimer > 1.5) this.commitIcons();
    } else this.settleTimer = 0;
  }

  commitIcons() {
    const field = this.brain.icons;
    for (const b of [...field.bodies.values()]) {
      const info = this.iconInfo.get(b.name);
      if (this.parked.has(b.name)) {
        if (b.pinned) this.host.restoreIcon(b.name);
        else this.host.moveIcon(b.name, Math.round(b.x), Math.round(b.y));
        this.parked.delete(b.name);
      }
      field.release(b.name);
      void info;
    }
    this.settleTimer = 0;
  }

  dropAllIcons() {
    const field = this.brain.icons;
    for (const n of [...field.bodies.keys()]) field.release(n);
    this.parked.clear();
    if (this.brain.iconSession) { this.brain.iconSession = false; this.brain.interrupt(this.brain.life()); }
    this.dirty = false; this.hudEl.style.display = 'none';
  }

  resetIcons() {
    this.dropAllIcons();
    this.host.resetIcons();
  }

  // ------------------------------------------------------------- frame
  handleStep(ev) {
    const b = this.brain;
    if (b.mud <= 0.05 || b.mode !== 'ground') return;
    this.view.orient.updateMatrixWorld(true);
    const z = STAND_FEET[ev.leg][2];
    const v = new THREE.Vector3(ev.x, 0.004, z).applyMatrix4(this.view.orient.matrixWorld);
    const S = this.S;
    const px = b.x + v.x * S, py = b.y - v.y * S + (z > 0 ? 3 : -3);
    const size = 0.07 * S;
    this._stamps = this._stamps || [];
    if (this._stamps.some((q) => Math.hypot(q[0] - px, q[1] - py) < size * 0.95)) return;   // don't pile prints up
    this._stamps.push([px, py]);
    if (this._stamps.length > 4) this._stamps.shift();
    this.mudLayer.stamp(px, py, b.facing > 0 ? 0 : Math.PI, size, b.mud);
    b.consumeMud(0.05);
  }

  handleBrainEvents() {
    for (const e of this.brain.events) {
      if (e.type === 'puddle') this.props.puddle = e.puddle;
      else if (e.type === 'splash') this.mudLayer.splat(e.x, e.y, 0.09 * this.S);
      else if (e.type === 'muddy') this.view.mud = 1;
      else if (e.type === 'meow') this.sound.meow(this.settings.size < 0.6 ? 1.15 : 1);
      else if (e.type === 'purr') this.sound.purr(e.on);
    }
    this.brain.events.length = 0;
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) return;
    if (this.settings.paused || !this.running) return;
    // a calm cat doesn't need 60 fps: render every other frame to spare the GPU
    const calm = this.brain.mode === 'ground' && ['sit', 'groom', 'sleep', 'loaf', 'stand', 'pet'].includes(this.brain.anim.state);
    this.skip = !this.skip;
    this.tick(Math.min(dt, 0.05), !(calm && this.skip));
  }

  /** Advance the whole app by dt seconds (render=false fast-forwards for tests). */
  tick(dt, render = true) {
    this.time += dt;
    const c = this.cursor;
    this.world.setCursor(c.x, c.y, dt);
    this.updateInteraction(dt);
    // rubbing wipes mud
    if (this.mudLayer.count > 0) {
      const sp = Math.hypot(c.x - this.prevCursor.x, c.y - this.prevCursor.y) / dt;
      if (sp > 40) this.mudLayer.wipe(this.prevCursor.x, this.prevCursor.y, c.x, c.y, 0.07 * this.S);
    }
    this.prevCursor = { x: c.x, y: c.y };
    this.mudLayer.dry(dt);

    this.brain.update(dt);
    this.syncIcons();
    const d = this.brain.descriptor;
    this.anim.setState(d.state, d.params);
    this.view.orient.rotation.z = d.rotZ;
    this.anim.update(dt, d.ctx);
    for (const ev of this.anim.events) if (ev.type === 'step') this.handleStep(ev);
    this.handleBrainEvents();
    if (render) {
      this.catCanvas.style.display = d.hidden ? 'none' : 'block';
      if (!d.hidden) {
        const half = (CANVAS * this.settings.size) / 2;
        this.catCanvas.style.transform = `translate3d(${Math.round(d.x - half)}px, ${Math.round(d.y - half)}px, 0)`;
        this.view.render(dt);
      }
      this.props.draw(this.brain.time, this.props.puddle, this.brain.icons.bodies.values());
    }
    this.updateExpiredPuddle();
  }

  updateExpiredPuddle() {
    const p = this.props.puddle;
    if (p && this.brain.time - p.born > p.life) this.props.puddle = null;
  }
}
