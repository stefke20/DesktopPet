// Character bodies as smooth unions of primitives (stylised "toon" proportions).
// makeShape('cat' | 'dog') returns the signed distance function used to mesh them.
import { smin, roundCone, ellipsoid, stretch } from './sdf.js';
import { getRig } from './rig-def.js';

export function makeShape(species) {
  const rig = getRig(species);
  const J = Object.fromEntries(rig.BONES.map((b) => [b.name, b.pos]));
  const E = Object.fromEntries(rig.BONES.map((b) => [b.name, b.end]));
  const dog = species === 'dog';
  const parts = [];
  // k: smooth-union radius used when merging this part into the accumulated body.
  const add = (name, k, fn, pad = 0.03) => parts.push({ name, k, fn, pad });

  // ---- torso ---------------------------------------------------------------
  if (dog) {
    add('chest', 0.05, ellipsoid([0.09, 0.19, 0], [0.108, 0.104, 0.084], 0.05));
    add('belly', 0.06, roundCone([-0.01, 0.185, 0], [0.09, 0.184, 0], 0.082, 0.088));
    add('rump', 0.06, ellipsoid([-0.08, 0.2, 0], [0.106, 0.098, 0.082], -0.1));
    add('back', 0.05, roundCone([-0.09, 0.214, 0], [0.12, 0.224, 0], 0.066, 0.068));
    add('neck', 0.05, roundCone([0.17, 0.245, 0], [0.27, 0.295, 0], 0.074, 0.06));
  } else {
    add('chest', 0.05, ellipsoid([0.085, 0.19, 0], [0.105, 0.098, 0.088], 0.05));
    add('belly', 0.06, roundCone([-0.01, 0.185, 0], [0.09, 0.185, 0], 0.088, 0.092));
    add('rump', 0.06, ellipsoid([-0.08, 0.2, 0], [0.108, 0.1, 0.09], -0.1));
    add('back', 0.05, roundCone([-0.09, 0.214, 0], [0.12, 0.222, 0], 0.07, 0.07));
    add('neck', 0.05, roundCone([0.17, 0.245, 0], [0.265, 0.29, 0], 0.075, 0.07));
  }

  // ---- head ----------------------------------------------------------------
  if (dog) {
    add('skull', 0.04, ellipsoid([0.31, 0.308, 0], [0.078, 0.072, 0.076], 0.04));
    add('snout', 0.035, ellipsoid([0.425, 0.283, 0], [0.062, 0.036, 0.042], 0.05));
    add('jaw', 0.03, ellipsoid([0.415, 0.258, 0], [0.052, 0.022, 0.03], 0.0));
    add('cheekL', 0.03, ellipsoid([0.35, 0.285, 0.04], [0.04, 0.034, 0.03], 0.1));
    add('cheekR', 0.03, ellipsoid([0.35, 0.285, -0.04], [0.04, 0.034, 0.03], 0.1));
  } else {
    add('skull', 0.04, ellipsoid([0.312, 0.305, 0], [0.092, 0.08, 0.098], 0.04));
    add('muzzle', 0.025, ellipsoid([0.382, 0.283, 0], [0.026, 0.021, 0.03], 0.0));
  }

  // ---- ears ----------------------------------------------------------------
  for (const s of ['L', 'R']) {
    const a = J['ear' + s], b = E['ear' + s];
    if (dog) {
      // floppy ear: a flat plate hanging beside the head (thin in Z)
      const base = [a[0], a[1], a[2]];
      add('ear' + s, 0.016, stretch(roundCone(a, b, 0.034, 0.024), base, [1, 1, 2.6]), 0.05);
    } else {
      const base = [a[0], a[1], a[2] * 0.85];
      add('ear' + s, 0.014, stretch(roundCone(a, b, 0.04, 0.007), base, [2.4, 1, 1]), 0.05);
    }
  }

  // ---- tail ----------------------------------------------------------------
  {
    const names = Object.keys(J).filter((n) => n.startsWith('tail'));
    const pts = names.map((n) => J[n]);
    pts.push(E[names[names.length - 1]]);
    for (let i = 0; i < pts.length - 1; i++) {
      const t0 = dog ? 0.032 - i * 0.0022 : 0.034 - i * 0.002;
      const t1 = dog ? 0.032 - (i + 1) * 0.0022 : 0.034 - (i + 1) * 0.002;
      const last = i === pts.length - 2;
      add('tail' + i, 0.02, roundCone(pts[i], pts[i + 1], Math.max(t0, 0.02), Math.max(t1 + (last ? 0.004 : 0), 0.02)));
    }
  }

  // ---- legs ----------------------------------------------------------------
  for (const s of ['L', 'R']) {
    const z = s === 'L' ? 1 : -1;
    const g = dog ? 1.1 : 1;   // dogs: sturdier legs and bigger paws
    add('shoulder' + s, 0.04, ellipsoid([0.1, 0.19, 0.055 * z], [0.056, 0.078, 0.038], 0.1));
    add('fu' + s, 0.03, roundCone(J['fu' + s], J['ff' + s], 0.04 * g, 0.034 * g));
    add('ff' + s, 0.025, roundCone(J['ff' + s], J['fp' + s], 0.034 * g, 0.03 * g));
    add('fp' + s, 0.02, ellipsoid([0.122, 0.018, 0.041 * z], [0.038 * g, 0.022, 0.03 * g], 0.0), 0.03);
    add('fpw' + s, 0.015, roundCone(J['fp' + s], [0.124, 0.016, 0.041 * z], 0.03 * g, 0.03 * g));
    add('thigh' + s, 0.045, ellipsoid([-0.085, 0.16, 0.058 * z], [0.078, 0.09, 0.046], -0.2));
    add('ht' + s, 0.03, roundCone(J['ht' + s], J['hs' + s], 0.048 * g, 0.034 * g));
    add('hs' + s, 0.025, roundCone(J['hs' + s], J['hm' + s], 0.034 * g, 0.03 * g));
    add('hm' + s, 0.02, roundCone(J['hm' + s], [-0.09, 0.016, 0.044 * z], 0.03 * g, 0.028 * g));
    add('hp' + s, 0.018, ellipsoid([-0.07, 0.018, 0.044 * z], [0.04 * g, 0.022, 0.03 * g], 0.0), 0.03);
  }

  const bounds = { lo: [-0.52, -0.02, -0.14], hi: [0.54, 0.54, 0.14] };

  function sdf(x, y, z) {
    let d = 1e9;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.bb && (x < p.bb[0] || x > p.bb[3] || y < p.bb[1] || y > p.bb[4] || z < p.bb[2] || z > p.bb[5])) continue;
      d = i === 0 ? p.fn(x, y, z) : smin(d, p.fn(x, y, z), p.k);
    }
    return d;
  }

  // Loose bounding boxes per part (sampled) so the sdf can skip far-away parts.
  function prepare(step = 0.01) {
    const { lo, hi } = bounds;
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

  return { species, rig, sdf, bounds, prepare };
}
