// Applies a pose to the Three.js skeleton: FK for spine/neck/tail/ears, 2-bone
// IK (plus a gliding scapula) for the legs.
import * as THREE from 'three';

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const e = new THREE.Euler();

function twoBone(H, W, l1, l2, pole, outKnee, outWrist) {
  const d = H.distanceTo(W);
  const dir = W.clone().sub(H).normalize();
  const maxD = (l1 + l2) * 0.998, minD = Math.abs(l1 - l2) + 0.004;
  const dd = Math.min(maxD, Math.max(minD, d));
  const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-8) p.set(0, 0, 1).addScaledVector(dir, -dir.z);
  p.normalize();
  outKnee.copy(H).addScaledVector(dir, a).addScaledVector(p, h);
  outWrist.copy(H).addScaledVector(dir, dd);
}

export class CatRig {
  constructor(view) {
    const BONES = view.def.BONES;
    const def = Object.fromEntries(BONES.map((b) => [b.name, b]));
    // Child joint position for each bone (first child, or its end point).
    const childPos = {};
    for (const b of BONES) if (b.parent && !(b.parent in childPos)) childPos[b.parent] = b.pos;
    const restDir = (name) => {
      const b = def[name];
      return V(childPos[name] || b.end).sub(V(b.pos)).normalize();
    };
    this.view = view;
    this.b = view.bones;
    this.rig = view.rig;
    this.restPelvis = V(def.pelvis.pos);
    this.dir = {};
    this.len = {};
    for (const b of BONES) {
      this.dir[b.name] = restDir(b.name);
      const c = childPos[b.name] || b.end;
      this.len[b.name] = c ? V(c).distanceTo(V(b.pos)) : 0.02;
    }
    this.legs = {};
    for (const [key, names, pole, front] of [
      ['fL', ['scL', 'fuL', 'ffL', 'fpL'], [-1, 0, -0.25], true],
      ['fR', ['scR', 'fuR', 'ffR', 'fpR'], [-1, 0, 0.25], true],
      ['hL', ['htL', 'hsL', 'hmL'], [1, 0, 0.2], false],
      ['hR', ['htR', 'hsR', 'hmR'], [1, 0, -0.2], false],
    ]) {
      this.legs[key] = { names, pole: V(pole), front };
    }
    this._tmp = { q: new THREE.Quaternion(), q2: new THREE.Quaternion(), m: new THREE.Matrix4() };
    this.rigInv = new THREE.Matrix4();
    this.joints = {}; // rig-space joint positions for events/targets (head, feet...)
  }

  _setEuler(bone, pitch, yaw, roll) {
    e.set(roll, yaw, pitch, 'YZX');
    bone.quaternion.setFromEuler(e);
  }

  _worldQuatRig(obj, out) {
    obj.getWorldQuaternion(out);
    const rq = this._rigQ || (this._rigQ = new THREE.Quaternion());
    this.rig.getWorldQuaternion(rq);
    return out.premultiply(rq.invert());
  }

  _posRig(obj, out) {
    obj.getWorldPosition(out);
    return out.applyMatrix4(this.rigInv);
  }

  // Orient `bone` so it points along `dir` (rig space); returns its world quat in rig space.
  _aim(bone, name, dir, parentQ, outQ) {
    outQ.setFromUnitVectors(this.dir[name], dir);
    bone.quaternion.copy(parentQ).invert().multiply(outQ);
    return outQ;
  }

  apply(p) {
    const b = this.b;
    // ---- body & spine (FK) ----
    b.pelvis.position.set(this.restPelvis.x + p.bodyX, this.restPelvis.y + p.bodyY, 0);
    this._setEuler(b.pelvis, p.pitch, p.yaw, p.roll);
    this._setEuler(b.spine1, p.s1[0], p.s1[1], p.s1[2]);
    this._setEuler(b.chest, p.ch[0], p.ch[1], p.ch[2]);
    this._setEuler(b.neck1, p.n1[0], p.n1[1], p.n1[2]);
    this._setEuler(b.neck2, p.n2[0], p.n2[1], p.n2[2]);
    this._setEuler(b.head, p.hd[0], p.hd[1], p.hd[2]);
    for (let i = 0; i < 6; i++) this._setEuler(b['tail' + i], p.tail[i * 2], p.tail[i * 2 + 1], 0);
    for (const s of ['L', 'R']) {
      const ear = p['ear' + s];
      const sign = s === 'L' ? 1 : -1;
      // cat ears point up, dog ears hang down: the same "outward"/"back" angles flip sign
      const ed = this.view.dog ? -1 : 1;
      e.set(sign * ed * ear[0], 0, ed * ear[1], 'XYZ');
      b['ear' + s].quaternion.setFromEuler(e);
      b['ear' + s].rotateY(sign * ear[2]);
    }

    this.rig.updateMatrixWorld(true);
    this.rigInv.copy(this.rig.matrixWorld).invert();

    // ---- legs ----
    const H = new THREE.Vector3(), W = new THREE.Vector3(), K = new THREE.Vector3(), T = new THREE.Vector3(), W2 = new THREE.Vector3();
    const pq = new THREE.Quaternion(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion();
    const d3 = new THREE.Vector3(), dd = new THREE.Vector3();
    for (const key of ['fL', 'fR', 'hL', 'hR']) {
      const leg = this.legs[key];
      const f = p[key];
      T.set(f[0], f[1], f[2]);
      const n = leg.names;
      const [bh, bk, bw] = leg.front ? [n[1], n[2], n[3]] : [n[0], n[1], n[2]];
      // paw bone direction: rest direction pitched by f[3] about Z
      d3.copy(this.dir[bw]);
      const ang = f[3];
      const c = Math.cos(ang), s = Math.sin(ang);
      d3.set(d3.x * c - d3.y * s, d3.x * s + d3.y * c, d3.z);
      W.copy(T).addScaledVector(d3, -this.len[bw]);

      if (leg.front) {
        // scapula glides the shoulder toward the paw
        const sc = b[n[0]];
        this._worldQuatRig(sc.parent, pq);
        const base = this._posRig(sc, new THREE.Vector3());
        const rest = this.dir[n[0]];
        const lenSc = this.len[n[0]];
        // desired shoulder = rest shoulder shifted toward target in x
        sc.quaternion.identity();
        sc.updateMatrixWorld(true);
        const restShoulder = this._posRig(b[bh], new THREE.Vector3());
        const shift = THREE.MathUtils.clamp((W.x - restShoulder.x) * 0.55, -0.05, 0.05);
        const lift = THREE.MathUtils.clamp((W.y - 0.09) * 0.0, -0.02, 0.02);
        dd.set(restShoulder.x + shift, restShoulder.y + lift, restShoulder.z).sub(base).normalize();
        this._aim(sc, n[0], dd, pq, q1);
        // quaternion q1 is in rig space (restDir->dd); local set inside _aim
        sc.updateMatrixWorld(true);
      }
      b[bh].updateMatrixWorld(true);
      this._posRig(b[bh], H);
      twoBone(H, W, this.len[bh], this.len[bk], leg.pole, K, W2);
      // bones
      this._worldQuatRig(b[bh].parent, pq);
      this._aim(b[bh], bh, K.clone().sub(H).normalize(), pq, q1);
      this._aim(b[bk], bk, W2.clone().sub(K).normalize(), q1, q2);
      const toe = W2.clone().addScaledVector(d3, this.len[bw]);
      this._aim(b[bw], bw, d3.clone(), q2, q3);
      this.joints[key] = toe;
    }

    // ---- eyes / face ----
    const v = this.view;
    v.setMouth(p.mouth);
    for (const side of ['L', 'R']) v.eyes[side].mat.uniforms.uBlink.value = 1 - p.eye;
    v.eyes.L.mat.uniforms.uPupil.value = v.eyes.R.mat.uniforms.uPupil.value = p.pupil;
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? 1 : -1;
      v.whiskers[side].rotation.set(0, sign * p.whisk * -0.35, 0);
    }
    this.rig.updateMatrixWorld(true);
    this.joints.head = this._posRig(this.b.head, new THREE.Vector3());
  }
}
