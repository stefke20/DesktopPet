// Procedural animation: picks a target pose for the current action, adds
// life-like overlays, damps toward it and hands the result to the rig.
import * as THREE from 'three';
import { newPose, copyPose, dampPose, STAND_FEET, clonePose } from './pose.js';
import { CatRig } from './rig.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

// Tail shapes as per-segment [pitch, yaw] offsets from the rest curve.
const TAIL = {
  rest: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  low: [-0.25, 0, -0.18, 0, -0.14, 0, -0.1, 0, -0.1, 0, -0.1, 0],
  up: [0.35, 0, 0.12, 0, 0.0, 0, -0.1, 0, -0.18, 0, -0.2, 0],
  question: [0.6, 0, 0.2, 0, -0.05, 0, -0.35, 0, -0.5, 0, -0.5, 0],
  curl: [-0.9, 0.05, -0.35, 0.3, -0.1, 0.45, 0, 0.5, 0, 0.55, 0, 0.5],
  wrap: [-0.55, 0.15, -0.2, 0.5, 0, 0.7, 0, 0.7, 0, 0.6, 0, 0.5],
  puff: [0.5, 0, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  hang: [-1.2, 0, -0.3, 0, -0.25, 0, -0.2, 0, -0.2, 0, -0.2, 0],
};

export class CatAnimator {
  constructor(view) {
    this.view = view;
    this.rig = new CatRig(view);
    this.cur = newPose();
    this.target = newPose();
    this.gaitFeet = newPose();
    this.state = 'stand';
    this.stateTime = 0;
    this.time = 0;
    this.phase = 0;
    this.gaitW = 0;
    this.runW = 0;
    this.speed = 0;
    this.facing = 1;
    this.yawCam = 0.35;          // 3D yaw toward camera (rad)
    this.yawCur = 0.35;
    this.heading = -0.35;        // current Y rotation (turns through the camera)
    this.blink = { next: 2, t: -1 };
    this.earTwitch = { L: { next: 3, t: -1 }, R: { next: 5, t: -1 } };
    this.look = { yaw: 0, pitch: 0, eyeYaw: 0, eyePitch: 0 };
    this.purr = 0;
    this.tailSeed = Math.random() * 10;
    this.events = [];             // {type:'step', leg, x, y(ground), phase}
    this._stance = { fL: true, fR: true, hL: true, hR: true };
    this.params = {};
    this.prevRoot = new THREE.Vector3();
  }

  setState(name, params = {}) {
    if (name !== this.state) { this.state = name; this.stateTime = 0; }
    this.params = params;
  }

  // ---------------------------------------------------------------- helpers
  _tail(p, shape, wave = 0, waveSpeed = 1.4, lateral = 1) {
    const base = TAIL[shape] || TAIL.rest;
    for (let i = 0; i < 12; i++) p.tail[i] = base[i];
    if (wave) {
      for (let i = 0; i < 6; i++) {
        const ph = this.time * waveSpeed * TAU + i * 0.55 + this.tailSeed;
        p.tail[i * 2 + 1] += wave * Math.sin(ph) * (0.35 + i * 0.12) * lateral;
        p.tail[i * 2] += wave * 0.25 * Math.sin(ph * 0.5 + 1);
      }
    }
  }

  _ears(p, mode, t) {
    const set = (side, out, back, twist = 0) => { p['ear' + side][0] = out; p['ear' + side][1] = back; p['ear' + side][2] = twist; };
    switch (mode) {
      case 'flat': set('L', 0.9, 1.0); set('R', 0.9, 1.0); break;
      case 'back': set('L', 0.4, 0.5); set('R', 0.4, 0.5); break;
      case 'alert': set('L', -0.05, -0.1); set('R', -0.05, -0.1); break;
      default: set('L', 0.08, 0.0); set('R', 0.08, 0.0);
    }
  }

  // ---------------------------------------------------------------- gaits
  _walkFeet(out, phase, speed, W) {
    // lateral sequence walk, blended to a bounding gallop with `W` (0..1)
    const feet = ['hL', 'fL', 'hR', 'fR'];
    const walkOff = { hL: 0, fL: 0.25, hR: 0.5, fR: 0.75 };
    const runOff = { fL: 0, fR: 0.06, hL: 0.45, hR: 0.5 };
    const sweepWalk = 0.15, sweepRun = 0.24;
    const betaWalk = 0.62, betaRun = 0.42;
    const sweep = lerp(sweepWalk, sweepRun, W), beta = lerp(betaWalk, betaRun, W);
    const lift = lerp(0.045, 0.07, W);
    for (const f of feet) {
      const off = lerp(walkOff[f], runOff[f], W);
      const ph = (((phase + off) % 1) + 1) % 1;
      const front = f[0] === 'f';
      const x0 = front ? 0.118 : -0.078;
      const z = STAND_FEET[f][2];
      let x, y, pawA;
      if (ph < beta) {
        const u = ph / beta;
        x = x0 + sweep * 0.5 - sweep * u;
        y = 0;
        pawA = lerp(front ? 0.0 : 0.05, front ? -0.15 : -0.1, u) + (u > 0.85 ? (u - 0.85) * 3.5 : 0);
      } else {
        const u = (ph - beta) / (1 - beta);
        const ease = smooth(u);
        x = x0 - sweep * 0.5 + sweep * ease;
        y = lift * Math.sin(Math.PI * Math.pow(u, 0.85)) * (front ? 1.0 : 0.85);
        pawA = front ? lerp(0.5, -0.35, u) : lerp(0.35, -0.4, u);
      }
      out[f][0] = x; out[f][1] = y; out[f][2] = z; out[f][3] = pawA;
      // report touch-downs
      const planted = ph < beta;
      if (planted && !this._stance[f]) this.events.push({ type: 'step', leg: f, x, front });
      this._stance[f] = planted;
    }
  }

  // ---------------------------------------------------------------- actions
  _applyAction(p, dt, ctx) {
    const st = this.state, t = this.stateTime, P = this.params;
    const breathe = Math.sin(this.time * 2.1);
    switch (st) {
      case 'stand': {
        p.ch[0] = 0.012 * breathe;
        this._tail(p, P.tail || 'rest', 0.5, 0.45);
        this._ears(p, P.ears || 'normal', t);
        break;
      }
      case 'walk': {
        const W = this.runW;
        const ph = this.phase * TAU;
        p.bodyY = -0.006 + (-0.012 * W) + 0.006 * Math.cos(ph * 2 + 0.6) * (1 - W) + 0.03 * W * Math.sin(ph - 1.4);
        p.pitch = 0.02 + 0.1 * W * Math.sin(ph - 0.6);
        p.roll = 0.04 * Math.sin(ph) * (1 - W);
        p.yaw = 0.05 * Math.sin(ph) * (1 - W);
        p.s1[1] = -0.05 * Math.sin(ph) * (1 - W);
        p.s1[0] = -0.15 * W * Math.sin(ph - 0.6);
        p.ch[1] = -0.06 * Math.sin(ph) * (1 - W);
        p.ch[0] = -0.12 * W * Math.sin(ph - 0.6);
        p.n1[1] = 0.04 * Math.sin(ph) * (1 - W);
        p.hd[0] = -0.06 + 0.1 * W * Math.sin(ph - 0.6);
        this._tail(p, W > 0.5 ? 'up' : 'rest', 0.35 * (1 - W) + 0.1, 0.8);
        this._ears(p, W > 0.5 ? 'back' : 'normal', t);
        p.whisk = 0.1;
        break;
      }
      case 'sit': {
        const sh = P.upright === undefined ? 1 : P.upright;
        p.bodyX = 0.03 * sh; p.bodyY = -0.115 * sh; p.pitch = 0.98 * sh;
        p.s1[0] = -0.1 * sh; p.ch[0] = -0.12 * sh;
        p.n1[0] = -0.3 * sh; p.n2[0] = -0.28 * sh; p.hd[0] = -0.12 * sh;
        p.ch[0] += 0.012 * breathe;
        p.hL = [0.035, 0, 0.062, 0.0]; p.hR = [0.035, 0, -0.062, 0.0];
        p.fL = [0.06, 0, 0.035, 0.1]; p.fR = [0.06, 0, -0.035, 0.1];
        this._tail(p, P.tail || 'wrap', 0.25, 0.5);
        this._ears(p, P.ears || 'normal', t);
        break;
      }
      case 'loaf': {
        p.bodyY = -0.1; p.pitch = 0.05; p.s1[0] = 0; p.ch[0] = 0.04;
        p.n1[0] = -0.2; p.n2[0] = -0.1; p.hd[0] = -0.15;
        p.fL = [0.12, 0, 0.045, 0.2]; p.fR = [0.12, 0, -0.045, 0.2];
        p.hL = [-0.02, 0, 0.075, 0.3]; p.hR = [-0.02, 0, -0.075, 0.3];
        p.ch[0] += 0.016 * breathe; p.s1[0] += 0.01 * breathe;
        this._tail(p, 'wrap', 0.1, 0.3);
        this._ears(p, P.ears || 'normal', t);
        break;
      }
      case 'sleep': {
        p.bodyY = -0.108; p.pitch = 0.02; p.ch[0] = 0.06; p.s1[1] = 0.12; p.ch[1] = 0.2;
        p.n1[0] = -0.55; p.n2[0] = -0.4; p.hd[0] = -0.3; p.n1[1] = 0.35; p.n2[1] = 0.25; p.hd[1] = 0.3;
        p.fL = [0.1, 0, 0.05, 0.2]; p.fR = [0.115, 0, -0.04, 0.2];
        p.hL = [-0.01, 0, 0.082, 0.3]; p.hR = [-0.01, 0, -0.082, 0.3];
        const sl = Math.sin(this.time * 1.4);
        p.ch[0] += 0.02 * sl; p.s1[0] = 0.012 * sl; p.bodyY += 0.003 * sl;
        p.eye = 0.0; p.pupil = 0.9;
        this._tail(p, 'wrap', 0.04, 0.2);
        this._ears(p, 'back', t);
        break;
      }
      case 'crouch': { // pre-pounce / pre-jump
        const k = P.amount === undefined ? 1 : P.amount;
        p.bodyY = -0.09 * k; p.pitch = -0.05 * k; p.ch[0] = 0.12 * k; p.s1[0] = 0.05 * k;
        p.n1[0] = -0.1; p.hd[0] = 0;
        p.fL = [0.13, 0, 0.042, 0.2]; p.fR = [0.13, 0, -0.042, 0.2];
        p.hL = [-0.05, 0, 0.055, 0.1]; p.hR = [-0.05, 0, -0.055, 0.1];
        p.pupil = 0.95;
        p.roll = (P.wiggle ? 0.06 * Math.sin(this.time * 24) : 0);
        p.yaw = (P.wiggle ? 0.1 * Math.sin(this.time * 24) : 0);
        this._tail(p, 'rest', P.wiggle ? 1.2 : 0.3, P.wiggle ? 3.2 : 1.0);
        this._ears(p, 'alert', t);
        break;
      }
      case 'jump': { // airborne; ctx.vy>0 means rising (in cat units/s)
        const vy = ctx.vy || 0;
        const rise = clamp(vy / 1.6, -1, 1);
        p.pitch = 0.45 * rise; p.s1[0] = 0.1 * rise; p.ch[0] = 0.2 * rise;
        p.bodyY = 0.0;
        p.n1[0] = -0.1 * rise; p.hd[0] = -0.1 * rise;
        if (rise > 0) {
          p.fL = [0.24, 0.1, 0.05, -0.2]; p.fR = [0.22, 0.09, -0.05, -0.2];
          p.hL = [-0.19, 0.02, 0.05, 0.4]; p.hR = [-0.2, 0.04, -0.05, 0.4];
        } else {
          p.fL = [0.22, 0.04, 0.05, -0.3]; p.fR = [0.2, 0.05, -0.05, -0.3];
          p.hL = [-0.09, 0.02, 0.055, 0.3]; p.hR = [-0.1, 0.03, -0.055, 0.3];
        }
        this._tail(p, 'rest', 0.1, 1);
        this._ears(p, 'back', t);
        break;
      }
      case 'fall': {
        const k = Math.min(1, t * 4);
        p.pitch = -0.1; p.ch[0] = 0.1;
        p.fL = [0.2, 0.12, 0.08, -0.5]; p.fR = [0.18, 0.1, -0.08, -0.5];
        p.hL = [-0.15, 0.1, 0.08, 0.5]; p.hR = [-0.15, 0.1, -0.08, 0.5];
        p.eye = 1; p.pupil = 1.0;
        this._tail(p, 'puff', 0.8 * k, 2.2);
        this._ears(p, 'flat', t);
        break;
      }
      case 'land': {
        const k = 1 - clamp(t / 0.22, 0, 1);
        p.bodyY = -0.06 * k; p.ch[0] = 0.08 * k; p.pitch = -0.04 * k;
        this._tail(p, 'rest', 0.3, 1);
        break;
      }
      case 'hang': { // carried by the scruff: everything dangles along world-down
        const d = this.down;
        const sw = Math.sin(this.time * 2.4) * 0.025;
        p.pitch = 0.1; p.ch[0] = -0.1; p.n1[0] = -0.3; p.n2[0] = -0.2; p.hd[0] = -0.15;
        const limb = (x, y, z, len, extra) => [x + d.x * len + extra, y + d.y * len, z, 0.5];
        p.fL = limb(0.105, 0.19, 0.05, 0.15, sw); p.fR = limb(0.105, 0.19, -0.05, 0.15, -sw);
        p.hL = limb(-0.1, 0.178, 0.055, 0.2, -sw); p.hR = limb(-0.1, 0.178, -0.055, 0.2, sw);
        p.eye = 0.55; p.pupil = 0.8;
        this._tail(p, 'low', 0.08, 1.4);
        this._ears(p, 'back', t);
        break;
      }
      case 'swat': { // P.hand: 0/1 -> which front paw, P.t: 0..1 progress
        const u = clamp(P.t === undefined ? (t % 0.7) / 0.7 : P.t, 0, 1);
        const hit = Math.sin(Math.PI * Math.min(1, u * 1.15));
        const side = P.side === 'R' ? 'fR' : 'fL';
        p.bodyY = -0.02; p.ch[0] = 0.06 + 0.06 * hit; p.pitch = -0.02;
        p.n1[0] = -0.1; p.hd[0] = -0.08;
        p[side] = [0.14 + 0.17 * hit, 0.075 * (1 - Math.abs(u - 0.4) * 1.4) + 0.02, STAND_FEET[side][2] * 0.6, -0.5 + 0.3 * hit];
        p.pupil = 0.9;
        p.s1[1] = -0.2 * hit * (side === 'fL' ? 1 : -1);
        this._tail(p, 'rest', 0.9, 2.5);
        this._ears(p, 'alert', t);
        break;
      }
      case 'stretch': {
        const k = smooth(clamp(t / 0.7, 0, 1)) * (1 - smooth(clamp((t - (P.duration || 2.2) + 0.6) / 0.6, 0, 1)));
        p.pitch = lerp(0, -0.3, k); p.bodyY = lerp(0, -0.075, k);
        p.ch[0] = 0.25 * k; p.s1[0] = 0.12 * k; p.n1[0] = -0.2 * k; p.hd[0] = -0.2 * k;
        p.fL = [lerp(0.125, 0.3, k), 0, 0.042, 0.2 * k]; p.fR = [lerp(0.125, 0.3, k), 0, -0.042, 0.2 * k];
        this._tail(p, 'up', 0.2, 0.8);
        p.eye = 1 - 0.75 * k;
        break;
      }
      case 'yawn': {
        const u = clamp(t / (P.duration || 1.8), 0, 1);
        const k = Math.sin(Math.PI * smooth(u));
        p.hd[0] = 0.55 * k; p.n2[0] = 0.15 * k; p.n1[0] = 0.12 * k;
        p.mouth = k; p.eye = 1 - 0.9 * k;
        p.ch[0] = 0.015 * breathe - 0.04 * k;
        this._tail(p, 'rest', 0.2, 0.5);
        if (P.sit) { const s = {}; this.state = 'sit'; this._applyAction(p, dt, ctx); this.state = 'yawn'; p.hd[0] += 0.55 * k; }
        break;
      }
      case 'groom': { // sit and wash the face with a front paw
        this.state = 'sit'; this._applyAction(p, dt, ctx); this.state = 'groom';
        const w = Math.sin(this.time * 9);
        const hp = this.rig.joints.head;
        const side = 'fL';
        const hx = hp ? hp.x : 0.1, hy = hp ? hp.y : 0.3;
        p[side] = [hx + 0.07 + 0.012 * w, hy - 0.04 + 0.015 * Math.cos(this.time * 9), 0.05, -0.8];
        p.hd[0] += -0.3 + 0.05 * w; p.n1[0] += -0.05;
        p.eye = 0.12; p.mouth = 0;
        this._tail(p, 'wrap', 0.12, 0.6);
        break;
      }
      case 'pet': { // content: eyes shut, leaning into the hand
        this.state = P.base === 'stand' ? 'stand' : 'sit'; this._applyAction(p, dt, ctx); this.state = 'pet';
        p.eye = 0.08 + 0.05 * Math.sin(this.time * 0.7); p.pupil = 0.7;
        p.hd[0] += -0.1; p.n1[0] += 0.05;
        p.pitch += 0.0;
        this._tail(p, 'question', 0.5, 0.7);
        this._ears(p, 'normal', t);
        p.whisk = 0.4;
        this.purr = 1;
        break;
      }
      case 'climb': { // body is rotated by the controller; feet cycle like a walk
        p.bodyY = -0.02; p.pitch = 0.05; p.ch[0] = 0.05;
        p.s1[1] = -0.05 * Math.sin(this.phase * TAU);
        this._tail(p, 'low', 0.3, 0.8);
        this._ears(p, 'back', t);
        break;
      }
      default: break;
    }
  }

  _overlays(p, dt, ctx) {
    const st = this.state;
    // purr vibration
    if (this.purr > 0.01) {
      const v = Math.sin(this.time * 52) * 0.006 * this.purr;
      p.ch[0] += v; p.bodyY += v * 0.15;
      this.purr *= 0.0;
    }
    // blink
    this.blink.next -= dt;
    if (this.blink.next <= 0 && this.blink.t < 0) this.blink.t = 0;
    if (this.blink.t >= 0) {
      this.blink.t += dt;
      const b = Math.sin(clamp(this.blink.t / 0.17, 0, 1) * Math.PI);
      p.eye = Math.min(p.eye, 1 - b);
      if (this.blink.t > 0.17) { this.blink.t = -1; this.blink.next = 1.5 + Math.random() * 4.5; if (Math.random() < 0.15) this.blink.next = 0.2; }
    }
    // ear twitches
    for (const s of ['L', 'R']) {
      const tw = this.earTwitch[s];
      tw.next -= dt;
      if (tw.next <= 0 && tw.t < 0) tw.t = 0;
      if (tw.t >= 0) {
        tw.t += dt;
        const k = Math.sin(clamp(tw.t / 0.22, 0, 1) * Math.PI);
        p['ear' + s][1] += 0.5 * k; p['ear' + s][2] += 0.35 * k; p['ear' + s][0] += 0.12 * k;
        if (tw.t > 0.22) { tw.t = -1; tw.next = 2 + Math.random() * 7; }
      }
    }
    // look at target (rig space vector from head)
    const lt = ctx.look;
    let ty = 0, tp = 0;
    if (lt && !['sleep', 'hang', 'groom', 'yawn', 'pet'].includes(st)) {
      const d = new THREE.Vector3(lt.x, lt.y, lt.z === undefined ? 0.35 : lt.z).normalize();
      ty = Math.atan2(-d.z, d.x);
      tp = Math.atan2(d.y, Math.hypot(d.x, d.z));
      ty = clamp(ty, -1.35, 1.35);
      tp = clamp(tp, -0.7, 0.8);
    }
    const kk = 1 - Math.exp(-7 * dt);
    this.look.yaw += (ty - this.look.yaw) * kk;
    this.look.pitch += (tp - this.look.pitch) * kk;
    // yaw is relative to the already-yawed torso: keep neck motion modest
    const w = st === 'sleep' ? 0 : 1;
    p.n1[1] += this.look.yaw * 0.28 * w; p.n2[1] += this.look.yaw * 0.32 * w; p.hd[1] += this.look.yaw * 0.4 * w;
    p.n1[0] += this.look.pitch * 0.25 * w; p.n2[0] += this.look.pitch * 0.3 * w; p.hd[0] += this.look.pitch * 0.45 * w;
    // eyes lead the head a little
    const ee = this.rig.view.eyes;
    const ey = clamp(ty - this.look.yaw, -0.5, 0.5) + this.look.yaw * 0.0;
    const ep = clamp(tp - this.look.pitch, -0.4, 0.4);
    this.look.eyeYaw += (ey - this.look.eyeYaw) * kk;
    this.look.eyePitch += (ep - this.look.eyePitch) * kk;
    for (const s of ['L', 'R']) ee[s].pivot.rotation.set(0, -this.look.eyeYaw * 0.8, this.look.eyePitch * 0.8);
  }

  // ---------------------------------------------------------------- main
  update(dt, ctx = {}) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.stateTime += dt;
    this.events.length = 0;
    const speed = ctx.speed || 0;
    this.speed = speed;
    const locomoting = (this.state === 'walk' || this.state === 'climb') && speed > 0.02;

    // orientation first: the 3D heading turns *through* the camera, and some poses
    // (hanging) need "down" expressed in rig space
    const yawGoal = ctx.yaw === undefined ? this.yawCam : ctx.yaw;
    this.yawCur += (yawGoal - this.yawCur) * (1 - Math.exp(-5 * dt));
    const face = ctx.facing === undefined ? this.facing : ctx.facing;
    this.facing = face;
    const o = this.view.orient;
    o.rotation.order = 'ZYX';
    const goal = face >= 0 ? -this.yawCur : -Math.PI + this.yawCur;
    this.heading += (goal - this.heading) * (1 - Math.exp(-9 * dt));
    o.rotation.y = this.heading;
    o.updateMatrixWorld(true);
    this.down = this.down || new THREE.Vector3();
    this.down.set(0, -1, 0).transformDirection(o.matrixWorld.clone().invert());

    const tgt = this.target;
    copyPose(tgt, newPose());
    this._applyAction(tgt, dt, ctx);
    this._overlays(tgt, dt, ctx);

    // gait
    const runTarget = clamp((speed - 1.0) / 0.7, 0, 1);
    this.runW += (runTarget - this.runW) * (1 - Math.exp(-6 * dt));
    this.gaitW += ((locomoting ? 1 : 0) - this.gaitW) * (1 - Math.exp(-(locomoting ? 14 : 18) * dt));
    if (locomoting) {
      const W = this.runW;
      const sweep = lerp(0.15, 0.24, W), beta = lerp(0.62, 0.42, W);
      const f = Math.max(0.2, (speed * beta) / sweep);
      this.phase = (this.phase + f * dt) % 1;
    }
    this._walkFeet(this.gaitFeet, this.phase, speed, this.runW);

    // damp body toward target, snap feet via gait weight
    const rates = { bodyX: 7, bodyY: 9, pitch: 8, roll: 10, yaw: 10, s1: 9, ch: 9, n1: 9, n2: 9, hd: 10, tail: 8, earL: 14, earR: 14, eye: 28, pupil: 6, mouth: 10, whisk: 6, fL: 12, fR: 12, hL: 12, hR: 12 };
    const feetCur = {};
    for (const k of ['fL', 'fR', 'hL', 'hR']) feetCur[k] = this.cur[k].slice();
    dampPose(this.cur, tgt, 10, dt, rates);
    const gw = this.gaitW;
    if (gw > 0.001) {
      for (const k of ['fL', 'fR', 'hL', 'hR']) for (let i = 0; i < 4; i++) this.cur[k][i] = lerp(this.cur[k][i], this.gaitFeet[k][i], gw);
    }

    this.view.mud = ctx.mud || 0;

    this.rig.apply(this.cur);
  }
}
