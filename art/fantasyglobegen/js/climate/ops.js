// Finite-volume operators on the grid, on the unit sphere (divide by R or R² for metres).
//
// Each cell is the Voronoi region of its point. Across the edge to neighbour j it has
//   d   the great-circle distance between the two points,
//   l   the length of the shared Voronoi edge: the distance between the circumcentres of
//       the two triangles that share the grid edge i–j,
//   n   the unit chord from i to j, which is the edge's normal where it crosses the edge.
// The cell area is Σ l·d/4 over its edges, which makes the Laplacian below exact for the
// lowest harmonics in the limit and keeps every flux antisymmetric, so totals are conserved:
//   ∇²f   = (1/A) Σ (l/d)(f_j − f_i)
//   ∇·u   = (1/A) Σ l (u_i + u_j)/2 · n
//   ∇f    = (1/A) Σ l (f_j − f_i)/2 n        (Green–Gauss, then projected onto the tangent plane)

import { buildHierarchy, setOperator, precondition } from './multigrid.js';

function circumcentre(p, a, b, c) {
  const ax = p[3 * a], ay = p[3 * a + 1], az = p[3 * a + 2];
  const ux = p[3 * b] - ax, uy = p[3 * b + 1] - ay, uz = p[3 * b + 2] - az;
  const vx = p[3 * c] - ax, vy = p[3 * c + 1] - ay, vz = p[3 * c + 2] - az;
  // on the unit sphere the circumcentre is along the normal of the triangle's plane
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const r = Math.hypot(nx, ny, nz);
  nx /= r; ny /= r; nz /= r;
  if (nx * ax + ny * ay + nz * az < 0) { nx = -nx; ny = -ny; nz = -nz; }
  return [nx, ny, nz];
}

const arc = (a, b) => Math.atan2(Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);

export function buildOps(grid) {
  const { count: N, pos: p, nbr, nbrCount } = grid;
  const len = new Float64Array(6 * N), dist = new Float64Array(6 * N), nrm = new Float64Array(18 * N);
  const area = new Float64Array(N);
  // the neighbours before and after j around i: with i and j they make the two triangles
  // whose circumcentres end the edge, side1 at its start and side2 at its end, the end
  // being the side that k × n points to (k the outward normal)
  const side1 = new Int32Array(6 * N), side2 = new Int32Array(6 * N);
  const P = i => [p[3 * i], p[3 * i + 1], p[3 * i + 2]];
  for (let i = 0; i < N; i++) {
    const k = nbrCount[i], pi = P(i);
    for (let s = 0; s < k; s++) {
      const j = nbr[6 * i + s], prev = nbr[6 * i + (s + k - 1) % k], next = nbr[6 * i + (s + 1) % k];
      // the two triangles on either side of edge i–j: (i, prev, j) and (i, j, next)
      const c1 = circumcentre(p, i, prev, j), c2 = circumcentre(p, i, j, next);
      const e = 6 * i + s, pj = P(j);
      side1[e] = prev; side2[e] = next;
      len[e] = arc(c1, c2);
      dist[e] = arc(pi, pj);
      // the chord from i to j: the edge's normal where the edge crosses it, and exactly
      // opposite from j's side, so every flux is antisymmetric
      const tx = pj[0] - pi[0], ty = pj[1] - pi[1], tz = pj[2] - pi[2], tl = Math.hypot(tx, ty, tz);
      nrm[3 * e] = tx / tl; nrm[3 * e + 1] = ty / tl; nrm[3 * e + 2] = tz / tl;
      area[i] += len[e] * dist[e] / 4;
    }
  }
  // per-edge weights used everywhere
  const lap = new Float64Array(6 * N);
  for (let e = 0; e < 6 * N; e++) lap[e] = dist[e] > 0 ? len[e] / dist[e] : 0;

  // local east and north unit vectors, for showing and setting winds
  const east = new Float64Array(3 * N), north = new Float64Array(3 * N), lat = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const x = p[3 * i], y = p[3 * i + 1], z = p[3 * i + 2], h = Math.hypot(x, y);
    lat[i] = Math.asin(Math.max(-1, Math.min(1, z)));
    if (h < 1e-12) { east[3 * i] = 0; east[3 * i + 1] = 1; north[3 * i] = z > 0 ? -1 : 1; continue; }
    east[3 * i] = -y / h; east[3 * i + 1] = x / h;
    north[3 * i] = -z * x / h; north[3 * i + 1] = -z * y / h; north[3 * i + 2] = h;
  }

  const ops = { N, nbr, nbrCount, len, dist, nrm, lap, area, east, north, lat, pos: p, side1, side2 };

  // Cell vectors from normal components on the edges (Perot's reconstruction), projected
  // onto the tangent plane: un holds one value per edge slot, 6 per cell.
  ops.reconstruct = (un, out = new Float64Array(3 * N)) => {
    for (let i = 0; i < N; i++) {
      let x = 0, y = 0, z = 0;
      for (let k = 0, e = 6 * i; k < nbrCount[i]; k++, e++) {
        const w = len[e] * dist[e] * 0.5 * un[e];
        x += w * nrm[3 * e]; y += w * nrm[3 * e + 1]; z += w * nrm[3 * e + 2];
      }
      const px = p[3 * i], py = p[3 * i + 1], pz = p[3 * i + 2], r = x * px + y * py + z * pz;
      out[3 * i] = (x - r * px) / area[i]; out[3 * i + 1] = (y - r * py) / area[i]; out[3 * i + 2] = (z - r * pz) / area[i];
    }
    return out;
  };

  ops.laplacian = (f, out = new Float64Array(N)) => {
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = 0, e = 6 * i; k < nbrCount[i]; k++, e++) s += lap[e] * (f[nbr[e]] - f[i]);
      out[i] = s / area[i];
    }
    return out;
  };

  // u: Float64Array(3N) of tangent vectors
  ops.divergence = (u, out = new Float64Array(N)) => {
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = 0, e = 6 * i; k < nbrCount[i]; k++, e++) {
        const j = nbr[e];
        s += len[e] * 0.5 * ((u[3 * i] + u[3 * j]) * nrm[3 * e] + (u[3 * i + 1] + u[3 * j + 1]) * nrm[3 * e + 1] + (u[3 * i + 2] + u[3 * j + 2]) * nrm[3 * e + 2]);
      }
      out[i] = s / area[i];
    }
    return out;
  };

  ops.gradient = (f, out = new Float64Array(3 * N)) => {
    for (let i = 0; i < N; i++) {
      let gx = 0, gy = 0, gz = 0;
      for (let k = 0, e = 6 * i; k < nbrCount[i]; k++, e++) {
        const w = len[e] * 0.5 * (f[nbr[e]] - f[i]);
        gx += w * nrm[3 * e]; gy += w * nrm[3 * e + 1]; gz += w * nrm[3 * e + 2];
      }
      const x = p[3 * i], y = p[3 * i + 1], z = p[3 * i + 2], r = gx * x + gy * y + gz * z;
      out[3 * i] = (gx - r * x) / area[i]; out[3 * i + 1] = (gy - r * y) / area[i]; out[3 * i + 2] = (gz - r * z) / area[i];
    }
    return out;
  };

  // Solves (diag_i − ∇·k∇) x = b for x by conjugate gradients with a multigrid
  // preconditioner (multigrid.js), with per-cell k ≥ 0 (the edge value is the mean of its two
  // cells'; the system is symmetric once multiplied by the cell areas). x holds the first
  // guess. Returns the number of iterations.
  let levels = null;
  const r = new Float64Array(N), d = new Float64Array(N), q = new Float64Array(N), z = new Float64Array(N);
  ops.solveImplicit = (diag, k, b, x, tol = 1e-8, maxIter = 100) => {
    if (!levels) levels = buildHierarchy(grid);
    setOperator(levels, ops, diag, k);
    const Ad = levels[0].Ad, Ao = levels[0].Ao;
    const apply = (v, o) => {
      for (let i = 0; i < N; i++) {
        let s = Ad[i] * v[i];
        for (let n = 0, e = 6 * i; n < nbrCount[i]; n++, e++) s += Ao[e] * v[nbr[e]];
        o[i] = s;
      }
    };
    apply(x, q);
    let bb = 0, rr = 0;
    for (let i = 0; i < N; i++) { r[i] = area[i] * b[i] - q[i]; rr += r[i] * r[i]; bb += (area[i] * b[i]) ** 2; }
    if (rr <= tol * tol * bb) return 0;
    precondition(levels, r, z);
    d.set(z);
    let rz = 0;
    for (let i = 0; i < N; i++) rz += r[i] * z[i];
    let it = 0;
    for (; it < maxIter && rr > tol * tol * bb; it++) {
      apply(d, q);
      let dq = 0;
      for (let i = 0; i < N; i++) dq += d[i] * q[i];
      const a = rz / dq;
      rr = 0;
      for (let i = 0; i < N; i++) { x[i] += a * d[i]; r[i] -= a * q[i]; rr += r[i] * r[i]; }
      if (rr <= tol * tol * bb) { it++; break; }
      precondition(levels, r, z);
      let rz2 = 0;
      for (let i = 0; i < N; i++) rz2 += r[i] * z[i];
      const beta = rz2 / rz;
      rz = rz2;
      for (let i = 0; i < N; i++) d[i] = z[i] + beta * d[i];
    }
    return it;
  };

  return ops;
}
