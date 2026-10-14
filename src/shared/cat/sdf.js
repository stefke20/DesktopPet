// Signed distance primitives (plain numbers, no allocations in the hot path).

export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Smooth subtraction: removes `b` from `a`.
export function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

// Iñigo Quílez's round cone between two points with radii r1 (at a) and r2 (at b).
export function roundCone(a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const sr = Math.sign(rr);
  return (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = sr * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}

// Axis-aligned ellipsoid, optionally rotated about Z (pitch in the side view).
export function ellipsoid(c, r, rotZ = 0, rotY = 0) {
  const cz = Math.cos(rotZ), sz = Math.sin(rotZ);
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  const rx = r[0], ry = r[1], rz = r[2];
  return (x, y, z) => {
    let px = x - c[0], py = y - c[1], pz = z - c[2];
    if (rotZ) { const t = px * cz + py * sz; py = -px * sz + py * cz; px = t; }
    if (rotY) { const t = px * cy - pz * sy; pz = px * sy + pz * cy; px = t; }
    const ax = px / rx, ay = py / ry, az = pz / rz;
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const bx = ax / rx, by = ay / ry, bz = az / rz;
    const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  };
}

// Wrap any sdf so space is stretched around `c` (used to flatten ear cones).
export function stretch(fn, c, s) {
  const m = Math.min(s[0], s[1], s[2]);
  return (x, y, z) => fn(c[0] + (x - c[0]) * s[0], c[1] + (y - c[1]) * s[1], c[2] + (z - c[2]) * s[2]) / m;
}
