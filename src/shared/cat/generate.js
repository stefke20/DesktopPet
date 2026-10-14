// Build the skinned cat mesh from the SDF: surface nets -> projection ->
// smoothing -> normals -> skin weights -> per-vertex fur attributes.
import { makeShape } from './shape.js';

function surfaceNets(f, nx, ny, nz, lo, h) {
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const cellIdx = new Int32Array(nx * ny * nz).fill(-1);
  const verts = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const val = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = f[idx(i + corner[c][0], j + corner[c][1], k + corner[c][2])];
          val[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of edges) {
          const va = val[a], vb = val[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          sx += corner[a][0] + t * (corner[b][0] - corner[a][0]);
          sy += corner[a][1] + t * (corner[b][1] - corner[a][1]);
          sz += corner[a][2] + t * (corner[b][2] - corner[a][2]);
          n++;
        }
        cellIdx[idx(i, j, k)] = verts.length / 3;
        verts.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
      }
  const tris = [];
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const s0 = f[idx(i, j, k)] < 0;
        for (let axis = 0; axis < 3; axis++) {
          const ni = i + (axis === 0), nj = j + (axis === 1), nk = k + (axis === 2);
          const s1 = f[idx(ni, nj, nk)] < 0;
          if (s0 === s1) continue;
          const u = (axis + 1) % 3, v = (axis + 2) % 3;
          const p = [i, j, k];
          const cell = (du, dv) => {
            const q = [p[0], p[1], p[2]];
            q[u] -= du; q[v] -= dv;
            return cellIdx[idx(q[0], q[1], q[2])];
          };
          const c0 = cell(0, 0), c1 = cell(1, 0), c2 = cell(1, 1), c3 = cell(0, 1);
          if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) continue;
          if (s0) tris.push(c0, c1, c2, c0, c2, c3);
          else tris.push(c0, c2, c1, c0, c3, c2);
        }
      }
  return { verts: new Float32Array(verts), tris: new Uint32Array(tris) };
}

function gradient(sdf, x, y, z, e = 0.0015) {
  const gx = sdf(x + e, y, z) - sdf(x - e, y, z);
  const gy = sdf(x, y + e, z) - sdf(x, y - e, z);
  const gz = sdf(x, y, z + e) - sdf(x, y, z - e);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}

function project(sdf, verts, iterations = 2) {
  for (let it = 0; it < iterations; it++)
    for (let i = 0; i < verts.length; i += 3) {
      const d = sdf(verts[i], verts[i + 1], verts[i + 2]);
      const g = gradient(sdf, verts[i], verts[i + 1], verts[i + 2]);
      verts[i] -= g[0] * d; verts[i + 1] -= g[1] * d; verts[i + 2] -= g[2] * d;
    }
}

function smooth(verts, tris, iterations, lambda) {
  const n = verts.length / 3;
  const nbr = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < tris.length; t += 3)
    for (let a = 0; a < 3; a++) {
      nbr[tris[t + a]].add(tris[t + (a + 1) % 3]);
      nbr[tris[t + a]].add(tris[t + (a + 2) % 3]);
    }
  const tmp = new Float32Array(verts.length);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0, sz = 0;
      for (const j of nbr[i]) { sx += verts[j * 3]; sy += verts[j * 3 + 1]; sz += verts[j * 3 + 2]; }
      const c = nbr[i].size || 1;
      tmp[i * 3] = verts[i * 3] + lambda * (sx / c - verts[i * 3]);
      tmp[i * 3 + 1] = verts[i * 3 + 1] + lambda * (sy / c - verts[i * 3 + 1]);
      tmp[i * 3 + 2] = verts[i * 3 + 2] + lambda * (sz / c - verts[i * 3 + 2]);
    }
    verts.set(tmp);
  }
}

function distSeg(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const t = Math.min(1, Math.max(0, (apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz || 1)));
  return Math.hypot(apx - abx * t, apy - aby * t, apz - abz * t);
}

export function generateCat({ species = 'cat', voxel = 0.0055, log = () => {} } = {}) {
  const t0 = Date.now();
  const shape = makeShape(species);
  const sdf = shape.sdf;
  shape.prepare();
  const lo = shape.bounds.lo, hi = shape.bounds.hi;
  const nx = Math.ceil((hi[0] - lo[0]) / voxel) + 2;
  const ny = Math.ceil((hi[1] - lo[1]) / voxel) + 2;
  const nz = Math.ceil((hi[2] - lo[2]) / voxel) + 2;
  const f = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        f[i + nx * (j + ny * k)] = sdf(lo[0] + i * voxel, lo[1] + j * voxel, lo[2] + k * voxel);
  log(`field ${nx}x${ny}x${nz} in ${Date.now() - t0}ms`);

  let { verts, tris } = surfaceNets(f, nx, ny, nz, lo, voxel);
  smooth(verts, tris, 3, 0.5);
  project(sdf, verts, 3);
  log(`mesh ${verts.length / 3} verts, ${tris.length / 3} tris in ${Date.now() - t0}ms`);

  // Orientation check: face normals should agree with the SDF gradient.
  let agree = 0;
  for (let t = 0; t < tris.length; t += 90) {
    const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
    const e1 = [verts[b] - verts[a], verts[b + 1] - verts[a + 1], verts[b + 2] - verts[a + 2]];
    const e2 = [verts[c] - verts[a], verts[c + 1] - verts[a + 1], verts[c + 2] - verts[a + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const g = gradient(sdf, verts[a], verts[a + 1], verts[a + 2]);
    agree += n[0] * g[0] + n[1] * g[1] + n[2] * g[2] > 0 ? 1 : -1;
  }
  if (agree < 0) for (let t = 0; t < tris.length; t += 3) { const x = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = x; }

  const n = verts.length / 3;
  const normals = new Float32Array(n * 3);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const segs = shape.rig.boneSegments();
  const tau = 0.011;

  for (let v = 0; v < n; v++) {
    const p = [verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]];
    normals.set(gradient(sdf, p[0], p[1], p[2]), v * 3);

    // skin weights: nearest bones by distance to the bone *surface*, soft-blended
    const ds = segs.map((sg) => distSeg(p, sg.a, sg.b) - sg.r);
    let dmin = Infinity;
    for (const d of ds) dmin = Math.min(dmin, d);
    const ws = ds.map((d) => Math.exp(-(d - dmin) / tau));
    const order = ws.map((w, i) => i).sort((a, b) => ws[b] - ws[a]).slice(0, 4);
    let sum = 0;
    for (const i of order) sum += ws[i];
    order.forEach((bi, slot) => { skinIndex[v * 4 + slot] = bi; skinWeight[v * 4 + slot] = ws[bi] / sum; });
  }
  log(`attributes done in ${Date.now() - t0}ms`);
  return { positions: verts, normals, skinIndex, skinWeight, indices: tris };
}

// Compact binary container: header [magic, nVerts, nIdx] + typed arrays.
export function packCat(m) {
  const n = m.positions.length / 3, ni = m.indices.length;
  const header = new Uint32Array([0x43415432, n, ni, 0]);
  const parts = [header, m.positions, m.normals, m.skinIndex, m.skinWeight, m.indices];
  const total = parts.reduce((s, a) => s + a.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of parts) { out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), o); o += a.byteLength; }
  return out;
}

export function unpackCat(buffer) {
  const h = new Uint32Array(buffer, 0, 4);
  if (h[0] !== 0x43415432) throw new Error('bad cat model');
  const n = h[1], ni = h[2];
  let o = 16;
  const take = (Type, count) => { const a = new Type(buffer, o, count); o += a.byteLength; return a; };
  return {
    positions: take(Float32Array, n * 3), normals: take(Float32Array, n * 3),
    skinIndex: take(Uint16Array, n * 4), skinWeight: take(Float32Array, n * 4), indices: take(Uint32Array, ni),
  };
}
