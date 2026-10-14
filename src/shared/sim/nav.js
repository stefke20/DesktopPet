// Surface-to-surface navigation: which jumps / climbs the cat can do, and a
// Dijkstra planner over them. All distances in px; U = px per cat unit.
import { clamp, intervalGap } from './geometry.js';

export function motionParams(U, traits = {}) {
  const t = { maxRise: 1.45, climbs: true, walk: 0.75, run: 2.1, climb: 0.55, ...traits };
  return {
    U,
    walk: t.walk * U,
    run: t.run * U,
    climb: t.climb * U,
    climbs: !!t.climbs,
    gravity: 7.0 * U,
    maxRise: t.maxRise * U,   // how high the animal can jump
    margin: 0.22 * U,         // keep landing/take-off away from edges
  };
}

/** Pick take-off / landing x so the jump between two surfaces is shortest. */
function jumpPoints(A, B, m) {
  const a1 = A.x1 + Math.min(m, (A.x2 - A.x1) / 2), a2 = A.x2 - Math.min(m, (A.x2 - A.x1) / 2);
  const b1 = B.x1 + Math.min(m, (B.x2 - B.x1) / 2), b2 = B.x2 - Math.min(m, (B.x2 - B.x1) / 2);
  const lo = Math.max(a1, b1), hi = Math.min(a2, b2);
  if (lo <= hi) { const x = (lo + hi) / 2; return { xa: x, xb: x, gap: 0 }; }
  if (a2 < b1) return { xa: a2, xb: b1, gap: b1 - a2 };
  return { xa: a1, xb: b2, gap: a1 - b2 };
}

/** Jump edge A -> B, or null if the cat cannot make it. */
export function jumpEdge(A, B, mp) {
  if (A === B || A.kind === 'wall' || B.kind === 'wall') return null;
  const rise = A.y - B.y;                       // >0: B is higher
  if (rise > mp.maxRise) return null;
  const { xa, xb, gap } = jumpPoints(A, B, mp.margin);
  const reach = rise > 0 ? mp.U * (2.4 - 1.2 * (rise / mp.maxRise)) : mp.U * (3.2 + Math.min(1.5, -rise / mp.U * 0.25));
  if (gap > reach) return null;
  if (B.kind === 'floor' && rise > -10) return null; // nothing to gain
  const time = 0.9 + Math.hypot(gap, Math.max(0, rise)) / (2 * mp.U) * 0.4;
  return { type: 'jump', from: A.id, to: B.id, xa, xb, time };
}

/** Climb edge A -> top surface B via a visible side wall of the same window. */
export function climbEdge(A, B, walls, mp) {
  if (!mp.climbs || B.kind !== 'top' || A.kind === 'wall') return null;
  let best = null;
  for (const W of walls) {
    if (W.owner !== B.owner) continue;
    if (W.y1 > B.y + 6) continue;                                // wall must reach the top edge
    const grabY = Math.min(A.y, W.y2 - 0.15 * mp.U);             // where the cat grabs on
    if (A.y - grabY > mp.maxRise * 0.8) continue;
    if (grabY <= B.y) continue;
    const gap = intervalGap(A.x1, A.x2, W.x - mp.margin, W.x + mp.margin);
    if (gap > 0) continue;
    const cost = (grabY - B.y) / mp.climb + 1.5;
    if (!best || cost < best.time) best = { type: 'climb', from: A.id, to: B.id, wall: W.id, grabY, time: cost, xa: clamp(W.x + W.open * 0.1 * mp.U, A.x1, A.x2), xb: W.x };
  }
  return best;
}

/**
 * Plan a route between two horizontal surfaces (by id). Returns an array of
 * steps (each: {type,'jump'|'climb', from, to, ...}) or null when unreachable.
 */
export function plan(world, fromId, toId, mp, fromX) {
  if (fromId === toId) return [];
  const nodes = world.horizontals();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const walls = world.walls();
  if (!byId.has(fromId) || !byId.has(toId)) return null;
  const dist = new Map([[fromId, 0]]);
  const prev = new Map();
  const done = new Set();
  const startX = new Map([[fromId, fromX ?? (byId.get(fromId).x1 + byId.get(fromId).x2) / 2]]);
  while (true) {
    let cur = null, cd = Infinity;
    for (const [id, d] of dist) if (!done.has(id) && d < cd) { cur = id; cd = d; }
    if (cur === null) return null;
    if (cur === toId) break;
    done.add(cur);
    const A = byId.get(cur);
    for (const B of nodes) {
      if (done.has(B.id)) continue;
      const e = jumpEdge(A, B, mp) || climbEdge(A, B, walls, mp);
      if (!e) continue;
      const walkCost = Math.abs(startX.get(cur) - e.xa) / mp.walk;
      const nd = cd + walkCost + e.time;
      if (nd < (dist.get(B.id) ?? Infinity)) { dist.set(B.id, nd); prev.set(B.id, e); startX.set(B.id, e.xb); }
    }
  }
  const steps = [];
  for (let id = toId; id !== fromId; id = prev.get(id).from) steps.unshift(prev.get(id));
  return steps;
}

/** Ballistic hop parameters between two points (screen px, y down). */
export function arc(from, to, mp, extra = 0) {
  const dx = to.x - from.x;
  const rise = from.y - to.y;
  const H = clamp(0.28 * Math.abs(dx) + Math.max(0, rise) * 0.55 + 0.32 * mp.U + extra, 0.3 * mp.U, mp.maxRise * 1.25);
  const T = Math.max(0.42, Math.sqrt((8 * H) / mp.gravity) * 0.9);
  return { H, T };
}
