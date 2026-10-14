// Rest-pose skeleton definition shared by the mesh generator (build time) and
// the animator (run time).
//
// Units are "cat units" (~metres). The cat faces +X, up is +Y, and the side that
// faces the camera is +Z ("L" bones). Every bone has identity rotation in the
// rest pose; a bone points from its own joint to the joint of its first child
// (or to `end` for leaf bones).

const mirror = (p) => [p[0], p[1], -p[2]];

// name, parent, joint position, optional end (leaf only), influence radius used
// for skin weights (distance to bone *surface* decides who moves a vertex).
const core = [
  ['pelvis', null, [-0.105, 0.19, 0], null, 0.078],
  ['spine1', 'pelvis', [-0.015, 0.2, 0], null, 0.082],
  ['chest', 'spine1', [0.085, 0.205, 0], null, 0.08],
  ['neck1', 'chest', [0.185, 0.245, 0], null, 0.052],
  ['neck2', 'neck1', [0.245, 0.28, 0], null, 0.048],
  ['head', 'neck2', [0.295, 0.295, 0], [0.4, 0.28, 0], 0.07],
];

const ears = [
  ['earL', 'head', [0.28, 0.36, 0.05], [0.262, 0.455, 0.066], 0.02],
  ['earR', 'head', [0.28, 0.36, -0.05], [0.262, 0.455, -0.066], 0.02],
];

const tailPts = [
  [-0.175, 0.205, 0], [-0.235, 0.222, 0], [-0.29, 0.243, 0],
  [-0.34, 0.268, 0], [-0.382, 0.298, 0], [-0.408, 0.335, 0], [-0.416, 0.378, 0],
];
const tail = tailPts.slice(0, -1).map((p, i) => [
  'tail' + i, i === 0 ? 'pelvis' : 'tail' + (i - 1), p,
  i === tailPts.length - 2 ? tailPts[tailPts.length - 1] : null, 0.02 - i * 0.0015,
]);

function legs() {
  const out = [];
  for (const side of ['L', 'R']) {
    const m = side === 'L' ? (p) => p : mirror;
    // Front leg: shoulder -> elbow -> wrist -> toe
    out.push([`sc${side}`, 'chest', m([0.088, 0.262, 0.03]), null, 0.03]);
    out.push([`fu${side}`, `sc${side}`, m([0.105, 0.19, 0.043]), null, 0.034]);
    out.push([`ff${side}`, `fu${side}`, m([0.09, 0.112, 0.04]), null, 0.024]);
    out.push([`fp${side}`, `ff${side}`, m([0.108, 0.044, 0.04]), m([0.136, 0.004, 0.04]), 0.02]);
    // Hind leg: hip -> knee -> hock -> toe
    out.push([`ht${side}`, 'pelvis', m([-0.1, 0.178, 0.05]), null, 0.04]);
    out.push([`hs${side}`, `ht${side}`, m([-0.04, 0.115, 0.048]), null, 0.024]);
    out.push([`hm${side}`, `hs${side}`, m([-0.118, 0.064, 0.045]), m([-0.088, 0.004, 0.044]), 0.02]);
  }
  return out;
}

export const BONES = [...core, ...ears, ...tail, ...legs()].map(([name, parent, pos, end, r]) => ({
  name, parent, pos, end, r,
}));

export const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b.name, i]));

// Segment (start,end) of each bone in rest pose, for skin weighting / lengths.
export function boneSegments() {
  const firstChild = {};
  for (const b of BONES) if (b.parent && !(b.parent in firstChild)) firstChild[b.parent] = b;
  return BONES.map((b) => {
    const c = firstChild[b.name];
    const end = c ? c.pos : b.end;
    return { a: b.pos, b: end || [b.pos[0] + 0.02, b.pos[1], b.pos[2]], r: b.r };
  });
}

export const LEGS = {
  fL: ['fuL', 'ffL', 'fpL'], fR: ['fuR', 'ffR', 'fpR'],
  hL: ['htL', 'hsL', 'hmL'], hR: ['htR', 'hsR', 'hmR'],
};
export const TAIL_BONES = tail.map((t) => t[0]);

// Eye / nose anchor points on the head (rest pose, world == head-bone space + head joint).
export const FACE = {
  eyeL: [0.386, 0.315, 0.047],
  eyeR: [0.386, 0.315, -0.047],
  eyeRadius: 0.027,
  nose: [0.404, 0.292, 0],
  muzzle: [0.382, 0.283, 0],
  whiskerRoot: [0.39, 0.278, 0.024],
};
