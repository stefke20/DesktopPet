// Pose data model: a plain tree of numbers/arrays so poses can be lerped and
// damped generically.

export const FEET = ['fL', 'fR', 'hL', 'hR'];

// Rest/standing toe positions (rig space; y = ground).
export const STAND_FEET = {
  fL: [0.125, 0, 0.042], fR: [0.125, 0, -0.042],
  hL: [-0.085, 0, 0.046], hR: [-0.085, 0, -0.046],
};

export function newPose() {
  return {
    bodyX: 0, bodyY: 0, pitch: 0, roll: 0, yaw: 0,
    s1: [0, 0, 0], ch: [0, 0, 0],
    n1: [0, 0, 0], n2: [0, 0, 0], hd: [0, 0, 0],
    tail: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],   // (pitch, yaw) x 6
    earL: [0, 0, 0], earR: [0, 0, 0],             // outward, back, twist
    eye: 1, pupil: 0.5, mouth: 0, whisk: 0,
    // feet: [x, y, z, pawAngle]
    fL: [...STAND_FEET.fL, 0], fR: [...STAND_FEET.fR, 0],
    hL: [...STAND_FEET.hL, 0], hR: [...STAND_FEET.hR, 0],
  };
}

export function clonePose(p) {
  const o = {};
  for (const k in p) o[k] = Array.isArray(p[k]) ? p[k].slice() : p[k];
  return o;
}

export function copyPose(dst, src) {
  for (const k in src) {
    if (Array.isArray(src[k])) { const d = dst[k]; const s = src[k]; for (let i = 0; i < s.length; i++) d[i] = s[i]; } else dst[k] = src[k];
  }
  return dst;
}

export function lerpPose(out, a, b, t) {
  for (const k in a) {
    if (Array.isArray(a[k])) { const o = out[k], x = a[k], y = b[k]; for (let i = 0; i < x.length; i++) o[i] = x[i] + (y[i] - x[i]) * t; } else out[k] = a[k] + (b[k] - a[k]) * t;
  }
  return out;
}

// Exponential approach of `cur` toward `target` (frame-rate independent).
export function dampPose(cur, target, rate, dt, rates) {
  for (const k in cur) {
    const r = (rates && rates[k]) || rate;
    const t = 1 - Math.exp(-r * dt);
    if (Array.isArray(cur[k])) { const c = cur[k], g = target[k]; for (let i = 0; i < c.length; i++) c[i] += (g[i] - c[i]) * t; } else cur[k] += (target[k] - cur[k]) * t;
  }
}
