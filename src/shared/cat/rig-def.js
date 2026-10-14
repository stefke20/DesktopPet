// Rest-pose skeletons shared by the mesh generator (build time) and the
// animator (run time). Cat and dog use the same bone names and topology, so
// one animator drives both; only some joint positions (ears, tail, snout) differ.
//
// Units are "cat units" (~metres). Characters face +X, up is +Y, and the side that
// faces the camera is +Z ("L" bones). Every bone has identity rotation in the
// rest pose; a bone points from its own joint to the joint of its first child
// (or to `end` for leaf bones).

const mirror = (p) => [p[0], p[1], -p[2]];

const SPECIES_RIG = {
  cat: {
    headEnd: [0.4, 0.28, 0], headR: 0.07,
    ears: { base: [0.28, 0.36, 0.05], end: [0.262, 0.455, 0.066], r: 0.02 },
    tail: [[-0.175, 0.205, 0], [-0.235, 0.222, 0], [-0.29, 0.243, 0], [-0.34, 0.268, 0], [-0.382, 0.298, 0], [-0.408, 0.335, 0], [-0.416, 0.378, 0]],
    tailR: 0.02,
    face: { eyeL: [0.386, 0.315, 0.047], eyeR: [0.386, 0.315, -0.047], eyeRadius: 0.027, nose: [0.404, 0.292, 0], muzzle: [0.382, 0.283, 0], whiskerRoot: [0.39, 0.278, 0.024], tongue: [0.39, 0.262, 0] },
  },
  dog: {
    headEnd: [0.47, 0.275, 0], headR: 0.075,
    ears: { base: [0.285, 0.352, 0.064], end: [0.268, 0.262, 0.112], r: 0.028 },
    tail: [[-0.175, 0.215, 0], [-0.218, 0.245, 0], [-0.248, 0.285, 0], [-0.262, 0.33, 0], [-0.258, 0.372, 0], [-0.24, 0.408, 0], [-0.212, 0.434, 0]],
    tailR: 0.024,
    face: { eyeL: [0.37, 0.322, 0.044], eyeR: [0.37, 0.322, -0.044], eyeRadius: 0.021, nose: [0.478, 0.29, 0], muzzle: [0.43, 0.28, 0], whiskerRoot: [0.45, 0.272, 0.03], tongue: [0.43, 0.252, 0] },
  },
};

function build(species) {
  const sp = SPECIES_RIG[species];
  const core = [
    ['pelvis', null, [-0.105, 0.19, 0], null, 0.078],
    ['spine1', 'pelvis', [-0.015, 0.2, 0], null, 0.082],
    ['chest', 'spine1', [0.085, 0.205, 0], null, 0.08],
    ['neck1', 'chest', [0.185, 0.245, 0], null, 0.052],
    ['neck2', 'neck1', [0.245, 0.28, 0], null, 0.048],
    ['head', 'neck2', [0.295, 0.295, 0], sp.headEnd, sp.headR],
  ];
  const ears = [
    ['earL', 'head', sp.ears.base, sp.ears.end, sp.ears.r],
    ['earR', 'head', mirror(sp.ears.base), mirror(sp.ears.end), sp.ears.r],
  ];
  const tailPts = sp.tail;
  const tail = tailPts.slice(0, -1).map((p, i) => [
    'tail' + i, i === 0 ? 'pelvis' : 'tail' + (i - 1), p,
    i === tailPts.length - 2 ? tailPts[tailPts.length - 1] : null, sp.tailR - i * 0.0015,
  ]);
  const legs = [];
  for (const side of ['L', 'R']) {
    const m = side === 'L' ? (p) => p : mirror;
    legs.push([`sc${side}`, 'chest', m([0.088, 0.262, 0.03]), null, 0.03]);
    legs.push([`fu${side}`, `sc${side}`, m([0.105, 0.19, 0.043]), null, 0.034]);
    legs.push([`ff${side}`, `fu${side}`, m([0.09, 0.112, 0.04]), null, 0.024]);
    legs.push([`fp${side}`, `ff${side}`, m([0.108, 0.044, 0.04]), m([0.136, 0.004, 0.04]), 0.02]);
    legs.push([`ht${side}`, 'pelvis', m([-0.1, 0.178, 0.05]), null, 0.04]);
    legs.push([`hs${side}`, `ht${side}`, m([-0.04, 0.115, 0.048]), null, 0.024]);
    legs.push([`hm${side}`, `hs${side}`, m([-0.118, 0.064, 0.045]), m([-0.088, 0.004, 0.044]), 0.02]);
  }
  const BONES = [...core, ...ears, ...tail, ...legs].map(([name, parent, pos, end, r]) => ({ name, parent, pos, end, r }));
  const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b.name, i]));

  const firstChild = {};
  for (const b of BONES) if (b.parent && !(b.parent in firstChild)) firstChild[b.parent] = b;
  const boneSegments = () => BONES.map((b) => {
    const c = firstChild[b.name];
    const end = c ? c.pos : b.end;
    return { a: b.pos, b: end || [b.pos[0] + 0.02, b.pos[1], b.pos[2]], r: b.r };
  });

  return {
    species, BONES, BONE_INDEX, boneSegments,
    LEGS: { fL: ['fuL', 'ffL', 'fpL'], fR: ['fuR', 'ffR', 'fpR'], hL: ['htL', 'hsL', 'hmL'], hR: ['htR', 'hsR', 'hmR'] },
    TAIL_BONES: tail.map((t) => t[0]),
    FACE: sp.face,
  };
}

const cache = {};
export function getRig(species = 'cat') {
  if (!SPECIES_RIG[species]) throw new Error('unknown species ' + species);
  return (cache[species] ||= build(species));
}
export const SPECIES_LIST = Object.keys(SPECIES_RIG);
