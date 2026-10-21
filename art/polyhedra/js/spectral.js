// Spectral layouts (docs/realization/spectral.md): a matrix built from the graph, and three of its
// eigenvectors as the x, y and z coordinates. Every such matrix commutes with the automorphisms
// acting as permutations, so each eigenspace carries a representation of the group, and a layout
// from whole eigenspaces is exactly symmetric, though in general under other matrices than the
// convex shape's: the great stellated dodecahedron lies in the adjacency eigenspace −√5 of the
// dodecahedron's graph, the dodecahedron itself in +√5.

import { fitMatrices, pointGroup } from './symmetry.js';
import { adjust } from './frame.js';

// the reduction to tridiagonal form is O(n³): all the starts take about 0.9 s at 1,000 vertices,
// 2 s at 1,300
export const SPECTRAL_MAX = 1500;

// The eigenvalues of a symmetric matrix, with eigenvectors computed only where asked for, since a
// layout needs only a few eigenspaces and all n eigenvectors would cost several times as much as
// the eigenvalues. Householder reduction to a tridiagonal T = Qᵀ A Q, keeping the reflections; the
// eigenvalues of T by the implicit QL method; an eigenvector by inverse iteration on T, then Q.
export class SymmetricEigen {
  // a: the n×n matrix, row-major; it is overwritten by the reflections
  constructor(a, n) {
    this.n = n; this.a = a;
    const d = new Float64Array(n), e = new Float64Array(n), h = new Float64Array(n), q = new Float64Array(n);
    // Step i turns row and column i of the leading block into a multiple of the last unit vector
    // by the reflection P = I − u uᵀ / h, u in row i, and updates the block to P A P = A − u qᵀ −
    // q uᵀ. Only the lower triangle is kept, and every loop runs along its rows.
    for (let i = n - 1; i > 0; i--) {
      const l = i - 1, ri = i * n;
      let scale = 0;
      for (let k = 0; k <= l; k++) scale += Math.abs(a[ri + k]);
      if (l === 0 || scale === 0) { e[i] = a[ri + l]; h[i] = 0; continue; }
      let hh = 0;
      for (let k = 0; k <= l; k++) { a[ri + k] /= scale; hh += a[ri + k] * a[ri + k]; }
      const f = a[ri + l], g = f >= 0 ? -Math.sqrt(hh) : Math.sqrt(hh);
      e[i] = scale * g; hh -= f * g; a[ri + l] = f - g;
      // p = A u / h, from the lower triangle: row j gives A_jk u_k for k ≤ j and A_kj u_j for k < j
      q.fill(0, 0, i);
      for (let j = 0; j <= l; j++) {
        const rj = j * n, uj = a[ri + j];
        let s = a[rj + j] * uj;
        for (let k = 0; k < j; k++) { s += a[rj + k] * a[ri + k]; q[k] += a[rj + k] * uj; }
        q[j] += s;
      }
      let up = 0;
      for (let j = 0; j <= l; j++) { q[j] /= hh; up += q[j] * a[ri + j]; }
      // q = p − (uᵀp / 2h) u
      const c = up / (hh + hh);
      for (let j = 0; j <= l; j++) q[j] -= c * a[ri + j];
      for (let j = 0; j <= l; j++) {
        const rj = j * n, uj = a[ri + j], qj = q[j];
        for (let k = 0; k <= j; k++) a[rj + k] -= uj * q[k] + qj * a[ri + k];
      }
      h[i] = hh;
    }
    for (let i = 0; i < n; i++) d[i] = a[i * n + i];
    this.d = d; this.e = e; this.h = h;
    this.values = tridiagonalValues(d, e);
  }

  // Orthonormal eigenvectors for the m eigenvalues values[start .. start+m), as n-arrays. Inverse
  // iteration with T − λI for the mean λ of the cluster, each vector kept orthogonal to the ones
  // before it, so a multiple eigenvalue gives a basis of its eigenspace; then mapped back by Q.
  vectors(start, m) {
    const n = this.n, lu = factor(this.d, this.e, this.values.slice(start, start + m).reduce((s, x) => s + x, 0) / m);
    const out = [];
    let seed = 1 + start;
    for (let c = 0; c < m; c++) {
      let x = Float64Array.from({ length: n }, () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5);
      for (let it = 0; it < 4; it++) {
        for (const y of out) { const t = dot(x, y); for (let i = 0; i < n; i++) x[i] -= t * y[i]; }
        solve(lu, x);
        const s = Math.sqrt(dot(x, x));
        for (let i = 0; i < n; i++) x[i] /= s;
      }
      for (const y of out) { const t = dot(x, y); for (let i = 0; i < n; i++) x[i] -= t * y[i]; }
      const s = Math.sqrt(dot(x, x));
      for (let i = 0; i < n; i++) x[i] /= s;
      out.push(x);
    }
    // x = Q y = P_{n−1} ⋯ P_1 y: the reflection of the first step applied last
    const a = this.a, h = this.h;
    return out.map(y => {
      for (let i = 1; i < n; i++) {
        if (!h[i]) continue;
        const ri = i * n;
        let s = 0;
        for (let k = 0; k < i; k++) s += a[ri + k] * y[k];
        s /= h[i];
        for (let k = 0; k < i; k++) y[k] -= s * a[ri + k];
      }
      return y;
    });
  }
}

const dot = (x, y) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * y[i]; return s; };

// The eigenvalues, ascending, of the symmetric tridiagonal matrix with diagonal d and e[i] between
// i − 1 and i: the implicit QL method with Wilkinson shifts (tqli without vectors), O(n²).
function tridiagonalValues(d0, e0) {
  const n = d0.length, d = Float64Array.from(d0), e = new Float64Array(n);
  for (let i = 1; i < n; i++) e[i - 1] = e0[i];
  for (let l = 0; l < n; l++) {
    for (let iter = 0; iter < 60; iter++) {
      let m = l;
      for (; m < n - 1; m++) { const dd = Math.abs(d[m]) + Math.abs(d[m + 1]); if (Math.abs(e[m]) <= 2 ** -52 * dd) break; }
      if (m === l) break;
      let g = (d[l + 1] - d[l]) / (2 * e[l]), r = Math.hypot(g, 1);
      g = d[m] - d[l] + e[l] / (g + (g >= 0 ? r : -r));
      let s = 1, c = 1, p = 0, i = m - 1;
      for (; i >= l; i--) {
        let f = s * e[i];
        const b = c * e[i];
        e[i + 1] = r = Math.hypot(f, g);
        if (r === 0) { d[i + 1] -= p; e[m] = 0; break; }
        s = f / r; c = g / r; g = d[i + 1] - p; r = (d[i] - g) * s + 2 * c * b;
        d[i + 1] = g + (p = s * r); g = c * r - b;
      }
      if (r === 0 && i >= l) continue;
      d[l] -= p; e[l] = g; e[m] = 0;
    }
  }
  return d.sort();
}

// T − σI for the tridiagonal T, factored by Gaussian elimination with partial pivoting (LAPACK's
// dgttrf), a zero pivot replaced by a tiny one: σ is an eigenvalue, so T − σI is singular, and the
// solve then blows up exactly the eigenvector's direction.
function factor(d, e, sigma) {
  const n = d.length, dd = new Float64Array(n), dl = new Float64Array(n), du = new Float64Array(n), du2 = new Float64Array(n), piv = new Uint8Array(n);
  let norm = 0;
  for (let i = 0; i < n; i++) { dd[i] = d[i] - sigma; norm = Math.max(norm, Math.abs(d[i]) + Math.abs(e[i]) + Math.abs(e[i + 1] || 0)); }
  for (let i = 0; i < n - 1; i++) { dl[i] = e[i + 1]; du[i] = e[i + 1]; }
  const tiny = 2 ** -52 * (norm || 1);
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(dd[i]) >= Math.abs(dl[i])) {
      if (dd[i] === 0) dd[i] = tiny;
      const f = dl[i] / dd[i];
      dl[i] = f; dd[i + 1] -= f * du[i];
    } else {
      const f = dd[i] / dl[i];
      dd[i] = dl[i]; dl[i] = f;
      const t = du[i];
      du[i] = dd[i + 1]; dd[i + 1] = t - f * dd[i + 1];
      if (i < n - 2) { du2[i] = du[i + 1]; du[i + 1] = -f * du[i + 1]; }
      piv[i] = 1;
    }
  }
  if (dd[n - 1] === 0) dd[n - 1] = tiny;
  return { dd, dl, du, du2, piv };
}

// solves (T − σI) x = b in place, with the factors of factor() (LAPACK's dgttrs)
function solve({ dd, dl, du, du2, piv }, b) {
  const n = b.length;
  for (let i = 0; i < n - 1; i++) {
    if (!piv[i]) b[i + 1] -= dl[i] * b[i];
    else { const t = b[i]; b[i] = b[i + 1]; b[i + 1] = t - dl[i] * b[i]; }
  }
  b[n - 1] /= dd[n - 1];
  if (n > 1) b[n - 2] = (b[n - 2] - du[n - 2] * b[n - 1]) / dd[n - 2];
  for (let i = n - 3; i >= 0; i--) b[i] = (b[i] - du[i] * b[i + 1] - du2[i] * b[i + 2]) / dd[i];
}

// the adjacency matrix of P, dense, row-major
export function adjacency(P) {
  const n = P.nv, m = new Float64Array(n * n);
  for (const f of P.faces) for (let i = 0; i < f.length; i++) {
    const a = f[i], b = f[(i + 1) % f.length];
    m[a * n + b] = 1; m[b * n + a] = 1;
  }
  return m;
}

// The matrices a layout can come from (docs/realization/spectral.md), with A the adjacency, D the
// vertex degrees and B_ij = Σ_{f ∋ i,j} 1/|f|:
// - 'adjacency': A;
// - 'laplacian': D − A, whose smoothest eigenvectors have the smallest eigenvalues, so the solver
//   gets A − D (sign −1 turns the eigenvalues back for display);
// - 'vertexmean': D⁻¹A, each vertex to the mean of its neighbours;
// - 'facemean': D⁻¹B, each vertex to the mean of its faces' centres (PolyOp's best).
// The mean matrices are not symmetric; the solver gets the similar D^{-1/2} M D^{1/2}, whose
// eigenvectors w give M's as D^{-1/2} w (back). That keeps a layout exactly symmetric, since a
// symmetry maps each vertex to one of the same degree. On graphs with one vertex degree the first
// three have the same eigenvectors; face mean also depends on the faces, so it differs.
export const MATRICES = ['adjacency', 'laplacian', 'vertexmean', 'facemean'];
export function graphMatrix(P, kind = 'adjacency') {
  const n = P.nv, m = kind === 'facemean' ? new Float64Array(n * n) : adjacency(P);
  const deg = new Float64Array(n);
  for (const f of P.faces) for (const a of f) deg[a]++;
  if (kind === 'adjacency') return { m, back: null, sign: 1 };
  if (kind === 'laplacian') {
    for (let i = 0; i < n; i++) m[i * n + i] = -deg[i];
    return { m, back: null, sign: -1 };
  }
  if (kind === 'facemean') for (const f of P.faces) for (const a of f) for (const b of f) m[a * n + b] += 1 / f.length;
  const s = Float64Array.from(deg, x => 1 / Math.sqrt(x));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) m[i * n + j] *= s[i] * s[j];
  return { m, back: s, sign: 1 };
}

// The eigenspaces, from the largest eigenvalue down: { value, dim, start } into the sorted spectrum.
export function eigenspaces(values, tol = 1e-6) {
  const out = [];
  for (let k = values.length - 1; k >= 0;) {
    let j = k;
    while (j > 0 && Math.abs(values[j - 1] - values[k]) < tol * Math.max(1, Math.abs(values[k]))) j--;
    out.push({ value: values[k], dim: k - j + 1, start: j });
    k = j - 1;
  }
  return out;
}

// How many times the surface winds around the origin: the signed solid angles of its faces (each
// as a fan from its centroid, so star faces count right), over 4π. 1 for a convex shape seen from
// inside, 7 for the great stellated dodecahedron; not a whole number when faces are not flat.
export function density(faces, pos) {
  let w = 0;
  for (const f of faces) {
    let cx = 0, cy = 0, cz = 0;
    for (const i of f) { cx += pos[3 * i] / f.length; cy += pos[3 * i + 1] / f.length; cz += pos[3 * i + 2] / f.length; }
    for (let i = 0; i < f.length; i++) {
      const a = 3 * f[i], b = 3 * f[(i + 1) % f.length];
      w += solidAngle(cx, cy, cz, pos[a], pos[a + 1], pos[a + 2], pos[b], pos[b + 1], pos[b + 2]);
    }
  }
  return w / (4 * Math.PI);
}

// the signed solid angle of the triangle abc seen from the origin (Van Oosterom and Strackee)
function solidAngle(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), lc = Math.hypot(cx, cy, cz);
  const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  const ab = ax * bx + ay * by + az * bz, ac = ax * cx + ay * cy + az * cz, bc = bx * cx + by * cy + bz * cz;
  return 2 * Math.atan2(det, la * lb * lc + ab * lc + ac * lb + bc * la);
}

// The spectral starts of P: layouts from the eigenvectors of one of MATRICES that show every
// automorphism (maps) as its own orthogonal matrix, a faithful representation. They are whole
// eigenspaces, so that the layout is exactly symmetric: a 3-dimensional one, a 2-dimensional one
// with a 1-dimensional one (prisms), or, for groups without such representations, three
// 1-dimensional ones among the strongest few. The top eigenspace is the trivial representation (the
// Perron vector, or the constant one), never a layout. Each start is centred, its x, y and z scaled to the same spread,
// and mirrored if need be so that its density is positive. Smoothest first: by the mean of the
// three eigenvalues. On graphs with little symmetry the pairs of eigenspaces run into the
// thousands (`zcmJ17`: 72,000 faithful ones), so the candidates are tried in that order and the
// list stops at MAX_STARTS starts, or after MAX_TRIES candidates.
const MAX_STARTS = 100, MAX_TRIES = 3000;
export function spectralStarts(P, maps, kind = 'adjacency') {
  const n = P.nv, { m, back, sign } = graphMatrix(P, kind), E = new SymmetricEigen(m, n);
  const spaces = eigenspaces(E.values).slice(1);
  const cache = new Map();
  const vecs = e => {
    if (!cache.has(e.start)) cache.set(e.start, E.vectors(e.start, e.dim).map(v => (back ? v.map((x, i) => x * back[i]) : v)));
    return cache.get(e.start);
  };
  const out = [];
  const add = from => {
    if (out.length >= MAX_STARTS) return;
    const cols = from.flatMap(vecs), pos = new Float64Array(3 * n);
    cols.forEach((c, j) => { for (let i = 0; i < n; i++) pos[3 * i + j] = c[i]; });
    adjust(pos, { centre: true, normalise: true });
    const { Rs } = fitMatrices(pos, maps);
    if (Rs.some(R => !R)) return;
    if (new Set(Rs.map(R => Array.from(R, x => x.toFixed(3)).join())).size < maps.length) return;
    if (coincident(pos)) return;
    let d = density(P.faces, pos);
    if (d < 0) { for (let i = 2; i < pos.length; i += 3) pos[i] = -pos[i]; d = -d; }
    out.push({ pos, values: from.map(e => sign * e.value), dims: from.map(e => e.dim), density: d, group: pointGroup(Rs) });
  };
  const three = spaces.filter(e => e.dim === 3), two = spaces.filter(e => e.dim === 2), one = spaces.filter(e => e.dim === 1);
  const cands = three.map(e => [e]);
  for (const a of two) for (const b of one) cands.push([a, b]);
  const few = one.slice(0, 6);
  for (let i = 0; i < few.length; i++) for (let j = i + 1; j < few.length; j++) for (let k = j + 1; k < few.length; k++) cands.push([few[i], few[j], few[k]]);
  const mean = c => c.reduce((s, e) => s + e.value * e.dim, 0) / 3;
  cands.sort((a, b) => mean(b) - mean(a));
  for (let i = 0; i < cands.length && i < MAX_TRIES && out.length < MAX_STARTS; i++) add(cands[i]);
  return out;
}

// whether two vertices (nearly) coincide: sorted by x, only neighbours within the tolerance in x
// need comparing
function coincident(pos, tol = 1e-6) {
  const n = pos.length / 3, idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => pos[3 * i] - pos[3 * j]);
  for (let a = 0; a < n; a++) {
    const i = 3 * idx[a];
    for (let b = a + 1; b < n && pos[3 * idx[b]] - pos[i] < tol; b++) {
      const j = 3 * idx[b];
      if (Math.hypot(pos[i] - pos[j], pos[i + 1] - pos[j + 1], pos[i + 2] - pos[j + 2]) < tol) return true;
    }
  }
  return false;
}
