// Self-intersection (X1): which pairs of faces pass through each other. Every face is split into
// the fan round its centroid that the viewer draws, and every pair of triangles from different
// faces that come near each other (a uniform grid of their bounding boxes) is tested edge by edge:
// two triangles cross when an edge of one passes through the other. Faces that share a corner or a
// side touch there by construction, so for them a crossing counts only away from what they share.
// Triangles in the same plane, or degenerate ones (collapsed faces), are skipped.
//
// selfIntersections(faces, pos) → { pairs: number of face pairs that cross, faces: how many faces
// take part, list: the pairs as [f, g] }.

const EPS = 1e-9;

// Where the segment p→q passes through the triangle a b c: the parameter along the segment, or -1.
function crossing(p, q, a, b, c) {
  const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
  const fx = c[0] - a[0], fy = c[1] - a[1], fz = c[2] - a[2];
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
  const hx = dy * fz - dz * fy, hy = dz * fx - dx * fz, hz = dx * fy - dy * fx;
  const det = ex * hx + ey * hy + ez * hz;
  const scale = Math.hypot(ex, ey, ez) * Math.hypot(fx, fy, fz) * Math.hypot(dx, dy, dz);
  if (Math.abs(det) <= 1e-9 * scale || scale === 0) return -1;   // parallel, or degenerate
  const inv = 1 / det;
  const sx = p[0] - a[0], sy = p[1] - a[1], sz = p[2] - a[2];
  const u = (sx * hx + sy * hy + sz * hz) * inv;
  if (u < -EPS || u > 1 + EPS) return -1;
  const qx = sy * ez - sz * ey, qy = sz * ex - sx * ez, qz = sx * ey - sy * ex;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -EPS || u + v > 1 + EPS) return -1;
  const t = (fx * qx + fy * qy + fz * qz) * inv;
  return t >= -EPS && t <= 1 + EPS ? t : -1;
}

// distance from x to the segment a b
function segDist(x, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = dx * dx + dy * dy + dz * dz;
  let t = l > 0 ? ((x[0] - a[0]) * dx + (x[1] - a[1]) * dy + (x[2] - a[2]) * dz) / l : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x[0] - a[0] - t * dx, x[1] - a[1] - t * dy, x[2] - a[2] - t * dz);
}

export function selfIntersections(faces, pos) {
  const P = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
  // the fans: each triangle as [face, corner a, b, c] with the corners as points
  const tris = [];
  let len = 0, ne = 0;
  faces.forEach((f, i) => {
    const d = f.length;
    for (let k = 0; k < d; k++) { const a = P(f[k]), b = P(f[(k + 1) % d]); len += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); ne++; }
    if (d === 3) { tris.push([i, P(f[0]), P(f[1]), P(f[2])]); return; }
    const c = [0, 0, 0];
    for (const v of f) for (let j = 0; j < 3; j++) c[j] += pos[3 * v + j] / d;
    for (let k = 0; k < d; k++) tris.push([i, c, P(f[k]), P(f[(k + 1) % d])]);
  });
  const edge = len / ne, near = 1e-3 * edge;
  // what two faces share: their common corners, and their common sides as point pairs
  const shared = (f, g) => {
    const F = faces[f], G = new Set(faces[g]), common = F.filter(v => G.has(v));
    if (!common.length) return null;
    const sides = [];
    for (let k = 0; k < F.length; k++) {
      const u = F[k], w = F[(k + 1) % F.length];
      if (G.has(u) && G.has(w)) sides.push([P(u), P(w)]);
    }
    return { corners: common.map(P), sides };
  };
  // a crossing point counts unless it is where the two faces meet anyway
  const away = (x, s) => !s || (s.corners.every(c => Math.hypot(x[0] - c[0], x[1] - c[1], x[2] - c[2]) > near)
    && s.sides.every(([a, b]) => segDist(x, a, b) > near));
  const cross = (A, B, s) => {
    for (let k = 0; k < 3; k++) {
      const p = A[1 + k], q = A[1 + (k + 1) % 3];
      const t = crossing(p, q, B[1], B[2], B[3]);
      if (t >= 0 && away([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])], s)) return true;
    }
    return false;
  };

  // a uniform grid of cells about two mean edges wide over the triangles' bounding boxes
  const h = 2 * edge, grid = new Map(), cell = (x, y, z) => `${x},${y},${z}`;
  tris.forEach((T, i) => {
    const lo = [0, 1, 2].map(j => Math.floor(Math.min(T[1][j], T[2][j], T[3][j]) / h));
    const hi = [0, 1, 2].map(j => Math.floor(Math.max(T[1][j], T[2][j], T[3][j]) / h));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const k = cell(x, y, z);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
  });
  const found = new Set(), tried = new Set(), sharedOf = new Map();
  for (const list of grid.values()) {
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const A = tris[list[a]], B = tris[list[b]];
      if (A[0] === B[0]) continue;
      const f = Math.min(A[0], B[0]), g = Math.max(A[0], B[0]), fg = f * faces.length + g;
      if (found.has(fg)) continue;
      const ab = list[a] < list[b] ? list[a] * tris.length + list[b] : list[b] * tris.length + list[a];
      if (tried.has(ab)) continue;
      tried.add(ab);
      if (!sharedOf.has(fg)) sharedOf.set(fg, shared(f, g));
      const s = sharedOf.get(fg);
      if (cross(A, B, s) || cross(B, A, s)) found.add(fg);
    }
  }
  const list = [...found].map(k => [Math.floor(k / faces.length), k % faces.length]);
  return { pairs: list.length, faces: new Set(list.flat()).size, list };
}
