// The cat's body as a smooth union of primitives (stylised "toon" proportions:
// big round head, chubby body, thick limbs and tail).
import { smin, roundCone, ellipsoid, stretch } from './sdf.js';
import { BONES } from './rig-def.js';

const J = Object.fromEntries(BONES.map((b) => [b.name, b.pos]));
const E = Object.fromEntries(BONES.map((b) => [b.name, b.end]));

const parts = [];
// k: smooth-union radius used when merging this part into the accumulated body.
const add = (name, k, fn, pad = 0.03) => parts.push({ name, k, fn, pad });

// ---- torso (round and chubby) ---------------------------------------------
add('chest', 0.05, ellipsoid([0.085, 0.19, 0], [0.105, 0.098, 0.088], 0.05));
add('belly', 0.06, roundCone([-0.01, 0.185, 0], [0.09, 0.185, 0], 0.088, 0.092));
add('rump', 0.06, ellipsoid([-0.08, 0.2, 0], [0.108, 0.1, 0.09], -0.1));
add('back', 0.05, roundCone([-0.09, 0.214, 0], [0.12, 0.222, 0], 0.07, 0.07));
add('neck', 0.05, roundCone([0.17, 0.245, 0], [0.265, 0.29, 0], 0.075, 0.07));

// ---- head: big, wide and round --------------------------------------------
add('skull', 0.04, ellipsoid([0.312, 0.305, 0], [0.092, 0.08, 0.098], 0.04));
add('muzzle', 0.025, ellipsoid([0.382, 0.283, 0], [0.026, 0.021, 0.03], 0.0));

// ---- ears (big rounded triangles) ------------------------------------------
for (const s of ['L', 'R']) {
  const a = J['ear' + s], b = E['ear' + s];
  const base = [a[0], a[1], a[2] * 0.85];
  add('ear' + s, 0.014, stretch(roundCone(a, b, 0.04, 0.007), base, [2.4, 1, 1]), 0.05);
}

// ---- tail (thick, rounded tip) -------------------------------------------------
{
  const names = Object.keys(J).filter((n) => n.startsWith('tail'));
  const pts = names.map((n) => J[n]);
  pts.push(E[names[names.length - 1]]);
  for (let i = 0; i < pts.length - 1; i++) {
    const r1 = 0.034 - i * 0.002, r2 = 0.034 - (i + 1) * 0.002 + (i === pts.length - 2 ? 0.004 : 0);
    add('tail' + i, 0.02, roundCone(pts[i], pts[i + 1], Math.max(r1, 0.02), Math.max(r2, 0.02)));
  }
}

// ---- legs (thick tubes, round mitten paws) ---------------------------------------
for (const s of ['L', 'R']) {
  const z = s === 'L' ? 1 : -1;
  add('shoulder' + s, 0.04, ellipsoid([0.1, 0.19, 0.055 * z], [0.056, 0.078, 0.038], 0.1));
  add('fu' + s, 0.03, roundCone(J['fu' + s], J['ff' + s], 0.04, 0.034));
  add('ff' + s, 0.025, roundCone(J['ff' + s], J['fp' + s], 0.034, 0.03));
  add('fp' + s, 0.02, ellipsoid([0.122, 0.018, 0.041 * z], [0.038, 0.022, 0.03], 0.0), 0.03);
  add('fpw' + s, 0.015, roundCone(J['fp' + s], [0.124, 0.016, 0.041 * z], 0.03, 0.03));
  add('thigh' + s, 0.045, ellipsoid([-0.085, 0.16, 0.058 * z], [0.078, 0.09, 0.046], -0.2));
  add('ht' + s, 0.03, roundCone(J['ht' + s], J['hs' + s], 0.048, 0.034));
  add('hs' + s, 0.025, roundCone(J['hs' + s], J['hm' + s], 0.034, 0.03));
  add('hm' + s, 0.02, roundCone(J['hm' + s], [-0.09, 0.016, 0.044 * z], 0.03, 0.028));
  add('hp' + s, 0.018, ellipsoid([-0.07, 0.018, 0.044 * z], [0.04, 0.022, 0.03], 0.0), 0.03);
}

export function bodySdf(x, y, z) {
  let d = 1e9;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.bb && (x < p.bb[0] || x > p.bb[3] || y < p.bb[1] || y > p.bb[4] || z < p.bb[2] || z > p.bb[5])) continue;
    d = i === 0 ? p.fn(x, y, z) : smin(d, p.fn(x, y, z), p.k);
  }
  return d;
}

export const catSdf = bodySdf;

export const BOUNDS = { lo: [-0.52, -0.02, -0.14], hi: [0.46, 0.5, 0.14] };

// Compute loose bounding boxes per part by sampling each part's own sdf.
export function prepareBounds(step = 0.01) {
  const { lo, hi } = BOUNDS;
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

export const PART_NAMES = parts.map((p) => p.name);
