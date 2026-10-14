// Small 1-D interval helpers used for window occlusion.

/** Subtract the intervals in `cuts` from [a, b]; returns the remaining pieces. */
export function subtractIntervals(a, b, cuts) {
  let pieces = [[a, b]];
  for (const [c1, c2] of cuts) {
    const next = [];
    for (const [p1, p2] of pieces) {
      if (c2 <= p1 || c1 >= p2) { next.push([p1, p2]); continue; }
      if (c1 > p1) next.push([p1, c1]);
      if (c2 < p2) next.push([c2, p2]);
    }
    pieces = next;
    if (!pieces.length) break;
  }
  return pieces;
}

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const lerp = (a, b, t) => a + (b - a) * t;

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function pointInRect(px, py, r, pad = 0) {
  return px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad;
}

/** Distance between two 1-D intervals (0 when they overlap). */
export function intervalGap(a1, a2, b1, b2) {
  if (a2 < b1) return b1 - a2;
  if (b2 < a1) return a1 - b2;
  return 0;
}

/** Mulberry32 seeded RNG so simulations are reproducible in tests. */
export function makeRng(seed = Date.now() >>> 0) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rnd.range = (lo, hi) => lo + (hi - lo) * rnd();
  rnd.pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  rnd.chance = (p) => rnd() < p;
  rnd.weighted = (items, weightOf) => {
    const ws = items.map(weightOf);
    const total = ws.reduce((s, w) => s + Math.max(0, w), 0);
    if (total <= 0) return null;
    let r = rnd() * total;
    for (let i = 0; i < items.length; i++) { r -= Math.max(0, ws[i]); if (r <= 0) return items[i]; }
    return items[items.length - 1];
  };
  return rnd;
}
