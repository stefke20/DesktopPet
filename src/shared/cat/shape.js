// The cat's body as a smooth union of primitives, each owned by a bone group.
import { smin, smax, roundCone, ellipsoid, stretch } from './sdf.js';
import { BONES, FACE } from './rig-def.js';

const J = Object.fromEntries(BONES.map((b) => [b.name, b.pos]));
const E = Object.fromEntries(BONES.map((b) => [b.name, b.end]));

const parts = [];
// k: smooth-union radius used when merging this part into the accumulated body.
const add = (name, k, fn, pad = 0.03) => parts.push({ name, k, fn, pad });

// ---- torso -------------------------------------------------------------
add('chest', 0.05, ellipsoid([0.09, 0.192, 0], [0.098, 0.084, 0.07], 0.05));
add('belly', 0.06, roundCone([-0.035, 0.19, 0], [0.09, 0.186, 0], 0.07, 0.074));
add('rump', 0.06, ellipsoid([-0.135, 0.2, 0], [0.102, 0.085, 0.074], -0.12));
add('back', 0.05, roundCone([-0.14, 0.215, 0], [0.12, 0.222, 0], 0.062, 0.06));
add('neck', 0.05, roundCone([0.17, 0.24, 0], [0.265, 0.285, 0], 0.066, 0.05));

// ---- head --------------------------------------------------------------
add('skull', 0.03, ellipsoid([0.308, 0.296, 0], [0.058, 0.05, 0.044], 0.05));
add('cheekL', 0.025, ellipsoid([0.326, 0.274, 0.03], [0.04, 0.03, 0.024], 0.1));
add('cheekR', 0.025, ellipsoid([0.326, 0.274, -0.03], [0.04, 0.03, 0.024], 0.1));
add('muzzle', 0.022, ellipsoid([0.356, 0.272, 0], [0.032, 0.025, 0.026], -0.05));
add('chin', 0.02, ellipsoid([0.345, 0.248, 0], [0.024, 0.016, 0.02], -0.15));

// ---- ears (flat plates; wide in Z, thin in X) -------------------------------
for (const s of ['L', 'R']) {
  const a = J['ear' + s], b = E['ear' + s];
  const base = [a[0], a[1], a[2] * 0.85];
  add('ear' + s, 0.012, stretch(roundCone(a, b, 0.027, 0.004), base, [2.3, 1, 1]), 0.04);
}

// ---- tail --------------------------------------------------------------
{
  const names = Object.keys(J).filter((n) => n.startsWith('tail'));
  const pts = names.map((n) => J[n]);
  pts.push(E[names[names.length - 1]]);
  for (let i = 0; i < pts.length - 1; i++) {
    const r1 = 0.022 - i * 0.0018, r2 = 0.022 - (i + 1) * 0.0018 + (i === pts.length - 2 ? 0.0 : 0);
    add('tail' + i, 0.02, roundCone(pts[i], pts[i + 1], Math.max(r1, 0.01), Math.max(r2, 0.009)));
  }
}

// ---- legs ----------------------------------------------------------------
for (const s of ['L', 'R']) {
  const z = s === 'L' ? 1 : -1;
  // Front: shoulder bulge, upper arm, forearm, paw
  add('shoulder' + s, 0.04, ellipsoid([0.1, 0.19, 0.05 * z], [0.05, 0.072, 0.032], 0.1));
  add('fu' + s, 0.03, roundCone(J['fu' + s], J['ff' + s], 0.034, 0.024));
  add('ff' + s, 0.025, roundCone(J['ff' + s], J['fp' + s], 0.024, 0.0165));
  add('fp' + s, 0.018, ellipsoid([0.125, 0.014, 0.041 * z], [0.032, 0.0165, 0.0195], 0.0), 0.03);
  add('fpw' + s, 0.015, roundCone(J['fp' + s], [0.128, 0.012, 0.041 * z], 0.0165, 0.0165));
  // Hind: thigh muscle, thigh, shin, metatarsal, paw
  add('thigh' + s, 0.045, ellipsoid([-0.135, 0.16, 0.052 * z], [0.07, 0.084, 0.038], -0.2));
  add('ht' + s, 0.03, roundCone(J['ht' + s], J['hs' + s], 0.04, 0.0235));
  add('hs' + s, 0.025, roundCone(J['hs' + s], J['hm' + s], 0.0235, 0.0165));
  add('hm' + s, 0.02, roundCone(J['hm' + s], [-0.14, 0.012, 0.044 * z], 0.0165, 0.0135));
  add('hp' + s, 0.018, ellipsoid([-0.122, 0.0135, 0.044 * z], [0.034, 0.0155, 0.0185], 0.0), 0.03);
}

// Nostril/eye sockets are carved so the eyeballs sit in recesses.
const eyeCarve = [FACE.eyeL, FACE.eyeR].map((c) =>
  ellipsoid([c[0] - 0.002, c[1], c[2]], [FACE.eyeRadius * 0.98, FACE.eyeRadius * 0.98, FACE.eyeRadius * 0.98]));

// Evaluate the whole body SDF.
export function bodySdf(x, y, z) {
  let d = 1e9;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    // Cheap reject: parts only matter within their influence margin.
    if (p.bb && (x < p.bb[0] || x > p.bb[3] || y < p.bb[1] || y > p.bb[4] || z < p.bb[2] || z > p.bb[5])) continue;
    d = i === 0 ? p.fn(x, y, z) : smin(d, p.fn(x, y, z), p.k);
  }
  return d;
}

// Final SDF used for meshing: body minus tiny eye sockets.
export function catSdf(x, y, z) {
  let d = bodySdf(x, y, z);
  for (let i = 0; i < eyeCarve.length; i++) d = smax(d, -eyeCarve[i](x, y, z) + 0.003, 0.006);
  return d;
}

// Compute loose bounding boxes per part by sampling each part's own sdf.
export function prepareBounds(step = 0.01) {
  const lo = [-0.52, -0.02, -0.12], hi = [0.44, 0.46, 0.12];
  for (const p of parts) {
    const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (let x = lo[0]; x <= hi[0]; x += step)
      for (let y = lo[1]; y <= hi[1]; y += step)
        for (let z = lo[2]; z <= hi[2]; z += step)
          if (p.fn(x, y, z) < p.pad + p.k) {
            if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (z < bb[2]) bb[2] = z;
            if (x > bb[3]) bb[3] = x; if (y > bb[4]) bb[4] = y; if (z > bb[5]) bb[5] = z;
          }
    const m = step + 0.012;
    p.bb = [bb[0] - m, bb[1] - m, bb[2] - m, bb[3] + m, bb[4] + m, bb[5] + m];
  }
}

export const BOUNDS = { lo: [-0.52, -0.02, -0.125], hi: [0.44, 0.45, 0.125] };
export const PART_NAMES = parts.map((p) => p.name);
