// Detached faces, from PolyOp, grown into a mixer. Each round:
//   1. detach: every face (or edge, or vertex) gets its own copy of its vertices,
//   2. make each copy nice on its own, ignoring all the others; what "nice" means is the target,
//   3. merge again: each vertex goes to the weighted mean of all its copies.
// One target with weight 1 is the page's single buttons; several with weights are its Mix. The
// weighted mean is the method of averaged projections: it settles where the weighted pulls
// balance, a local minimum of Σ w · (squared distance to what each target wants).
//
// Face targets:
// - 'flat': projected onto the face's plane;
// - 'regular': flat, and pulled towards the regular polygon that fits it best (regularity 0 only
//   flattens, 1 replaces it by that regular polygon);
// - 'star': replaced by the star polygon {n/k} that fits it best, with k from the pointedness
//   (starK below; k = 1 is the regular polygon). A convex face has nothing of a star in it, so
//   from a convex shape every copy goes to the centroid and nothing happens: start from a spectral
//   layout that is already stellated, or stellate first (docs/realization/regular-faces.md);
// - 'affine': replaced by the affine-regular polygon that fits it best, an evenly spaced polygon
//   on an ellipse (docs/realization/nozono.md). Triangles are always affine-regular, so they
//   only follow their neighbours;
// - 'stellate': the same with the star's Fourier mode k for mode 1: an affine image of the star
//   {n/k}. Linear, like 'mean', so with whitening every round it is subspace iteration, towards
//   the layouts whose faces are closest to affine stars: a stellation, when one exists;
// - 'mean': shrunk to its centroid, so the merge puts each vertex at the mean of its faces'
//   centres (PolyOp's move_to_face_centers). Repeating that is power iteration with the face-mean
//   matrix of docs/realization/spectral.md: with only the normalization below the shape tends to
//   its strongest eigenvector, a line, unless that eigenvalue is threefold (Platonic solids); with
//   frame.js's whitening it is subspace iteration towards the three strongest, the spectral
//   face-mean layout.
// Edge targets:
// - 'edges': scaled about its midpoint to the mean edge length;
// - 'tangent': moved along its point nearest the centre until that point is at the mean distance
//   of those points, canonical.js's tangency step: edges all touching one sphere.
// Vertex target:
// - 'sphere': each vertex pushed out or in to the mean radius.
// The result need not be convex, and often is not: that is the point of it.

import { tangentPoint } from './canonical.js';

export const FACE_TARGETS = ['flat', 'regular', 'star', 'affine', 'stellate', 'mean'];
export const EDGE_TARGETS = ['edges', 'tangent'];
export const TARGETS = [...FACE_TARGETS, ...EDGE_TARGETS, 'sphere'];

// The k of the star {n/k} a face of n sides takes at pointedness t (0 to ½): the k nearest t·n
// among 1 and the true stars, k coprime to n and 1 < k < n/2, ties going to the more pointed one.
// Triangles, squares and hexagons have no star and stay regular; at t = 0.3 pentagons become
// {5/2}, octagons {8/3} and decagons {10/3}.
export function starK(n, t) {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  let best = 1;
  for (let k = 2; 2 * k < n; k++) if (gcd(k, n) === 1 && Math.abs(t * n - k) <= Math.abs(t * n - best)) best = k;
  return best;
}

export class FaceRelaxer {
  // weights: { target: weight }, or target alone for weight 1
  constructor(pos, { fv, fo, edges }, { target = 'regular', weights = null, regularity = 1, pointedness = 0.3 } = {}) {
    this.pos = pos;
    this.fv = fv; this.fo = fo; this.edges = edges;
    this.regularity = regularity;
    const nv = pos.length / 3;
    this.targets = Object.entries(weights || { [target]: 1 }).filter(([name, w]) => w > 0 && TARGETS.includes(name)).map(([name, w]) => ({
      name, w,
      // the copies, in face order, in edge order, or one per vertex
      q: new Float64Array(FACE_TARGETS.includes(name) ? 3 * fv.length : EDGE_TARGETS.includes(name) ? 3 * edges.length : pos.length),
    }));
    this.k = new Map();
    for (let f = 0; f < fo.length - 1; f++) { const n = fo[f + 1] - fo[f]; if (!this.k.has(n)) this.k.set(n, starK(n, pointedness)); }
    this.sum = new Float64Array(pos.length);    // weighted sum of the copies of each vertex
    this.count = new Float64Array(nv);          // their total weight
    for (const { name, w } of this.targets) {
      if (FACE_TARGETS.includes(name)) for (let i = 0; i < fv.length; i++) this.count[fv[i]] += w;
      else if (EDGE_TARGETS.includes(name)) for (let i = 0; i < edges.length; i++) this.count[edges[i]] += w;
      else for (let v = 0; v < nv; v++) this.count[v] += w;
    }
    this.spread = new Float64Array(nv);         // mean distance of a vertex's copies from it
    this.old = new Float64Array(pos.length);
  }

  // One round; returns the largest distance a vertex moved, relative to the size of the shape.
  step() {
    const fo = this.fo;
    for (const T of this.targets) {
      const q = T.q;
      if (T.name === 'edges') this.equalEdges(q);
      else if (T.name === 'tangent') this.tangent(q);
      else if (T.name === 'sphere') this.sphere(q);
      else for (let f = 0; f < fo.length - 1; f++) {
        const s = fo[f], t = fo[f + 1];
        if (T.name === 'affine') this.affine(s, t, q);
        else if (T.name === 'stellate') this.affine(s, t, q, this.k.get(t - s));
        else if (T.name === 'mean') this.mean(s, t, q);
        else if (T.name === 'flat') this.regular(s, t, q, 1, 0);
        else this.regular(s, t, q, T.name === 'star' ? this.k.get(t - s) : 1, T.name === 'star' ? 1 : this.regularity);
      }
    }

    // merge
    const p = this.pos, sum = this.sum, cnt = this.count, old = this.old;
    old.set(p);
    sum.fill(0);
    this.each((v, q, j, w) => {
      const a = 3 * v;
      sum[a] += w * q[j]; sum[a + 1] += w * q[j + 1]; sum[a + 2] += w * q[j + 2];
    });
    for (let v = 0; v < cnt.length; v++) {
      p[3 * v] = sum[3 * v] / cnt[v]; p[3 * v + 1] = sum[3 * v + 1] / cnt[v]; p[3 * v + 2] = sum[3 * v + 2] / cnt[v];
    }
    this.normalize();

    // how much each vertex's copies disagree
    const spread = this.spread;
    spread.fill(0);
    this.each((v, q, j, w) => {
      const a = 3 * v;
      spread[v] += w * Math.hypot(q[j] - p[a], q[j + 1] - p[a + 1], q[j + 2] - p[a + 2]) / cnt[v];
    });

    let m = 0, r = 0;
    for (let i = 0; i < p.length; i += 3) {
      m = Math.max(m, Math.hypot(p[i] - old[i], p[i + 1] - old[i + 1], p[i + 2] - old[i + 2]));
      r = Math.max(r, Math.hypot(p[i], p[i + 1], p[i + 2]));
    }
    return m / (r || 1);
  }

  // calls fn(vertex, copies, index of the copy's x, weight) for every copy of every target
  each(fn) {
    const fv = this.fv, E = this.edges;
    for (const { name, w, q } of this.targets) {
      const list = FACE_TARGETS.includes(name) ? fv : EDGE_TARGETS.includes(name) ? E : null;
      if (list) for (let i = 0; i < list.length; i++) fn(list[i], q, 3 * i, w);
      else for (let v = 0; v < q.length / 3; v++) fn(v, q, 3 * v, w);
    }
  }

  // The copies of face s..t: its corners projected onto its plane (through the centroid, along the
  // Newell normal), then moved by alpha towards the regular polygon that fits them best. In complex
  // coordinates z_k in the plane, centred on the centroid, that polygon is a·ζᵏ with ζ = e^{2πi/n}
  // and a = (1/n) Σ z_k conj(ζᵏ), the least-squares fit: the Fourier coefficient of mode 1. The star
  // {n/m} is the same with ζ^{mk} for ζᵏ: mode m.
  regular(s, t, q, m, alpha) {
    const p = this.pos, fv = this.fv, n = t - s;
    let cx = 0, cy = 0, cz = 0, nx = 0, ny = 0, nz = 0;
    for (let i = s; i < t; i++) {
      const a = 3 * fv[i], b = 3 * fv[i + 1 < t ? i + 1 : s];
      cx += p[a]; cy += p[a + 1]; cz += p[a + 2];
      nx += (p[a + 1] - p[b + 1]) * (p[a + 2] + p[b + 2]);
      ny += (p[a + 2] - p[b + 2]) * (p[a] + p[b]);
      nz += (p[a] - p[b]) * (p[a + 1] + p[b + 1]);
    }
    cx /= n; cy /= n; cz /= n;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    // two axes in the plane of the face, e × f = normal, so counter-clockwise is positive
    let ex = 0, ey = 0, ez = 0;
    if (Math.abs(nx) < 0.9) ex = 1; else ey = 1;
    const d = ex * nx + ey * ny + ez * nz;
    ex -= d * nx; ey -= d * ny; ez -= d * nz;
    const el = Math.hypot(ex, ey, ez);
    ex /= el; ey /= el; ez /= el;
    const fx = ny * ez - nz * ey, fy = nz * ex - nx * ez, fz = nx * ey - ny * ex;
    let ar = 0, ai = 0;
    for (let i = s, k = 0; i < t; i++, k++) {
      const a = 3 * fv[i];
      const x = (p[a] - cx) * ex + (p[a + 1] - cy) * ey + (p[a + 2] - cz) * ez;
      const y = (p[a] - cx) * fx + (p[a + 1] - cy) * fy + (p[a + 2] - cz) * fz;
      const th = 2 * Math.PI * (m * k % n) / n, c = Math.cos(th), sn = Math.sin(th);
      ar += x * c + y * sn; ai += y * c - x * sn;
    }
    ar /= n; ai /= n;
    for (let i = s, k = 0; i < t; i++, k++) {
      const a = 3 * fv[i];
      const x = (p[a] - cx) * ex + (p[a + 1] - cy) * ey + (p[a + 2] - cz) * ez;
      const y = (p[a] - cx) * fx + (p[a + 1] - cy) * fy + (p[a + 2] - cz) * fz;
      const th = 2 * Math.PI * (m * k % n) / n, c = Math.cos(th), sn = Math.sin(th);
      // between the flattened corner and the regular one
      const u = x + alpha * (ar * c - ai * sn - x), v = y + alpha * (ar * sn + ai * c - y);
      q[3 * i] = cx + u * ex + v * fx;
      q[3 * i + 1] = cy + u * ey + v * fy;
      q[3 * i + 2] = cz + u * ez + v * fz;
    }
  }

  // The copies of face s..t: the orthogonal projection of its corners onto Fourier modes 0 and ±m,
  //   y_j = c + a cos θ_j + b sin θ_j,  c = mean,  a = (2/n) Σ x cos θ,  b = (2/n) Σ x sin θ,
  // with θ_j = 2πmj/n. For m = 1 this is the limit of the midpoint iteration, the affine-regular
  // polygon; for the m of a star, an affine image of the star {n/m}. It is flat by itself, so no
  // plane is needed.
  affine(s, t, q, m = 1) {
    const p = this.pos, fv = this.fv, n = t - s;
    const c = [0, 0, 0], A = [0, 0, 0], B = [0, 0, 0];
    for (let i = s, k = 0; i < t; i++, k++) {
      const a = 3 * fv[i], th = 2 * Math.PI * (m * k % n) / n, co = Math.cos(th), sn = Math.sin(th);
      for (let j = 0; j < 3; j++) { c[j] += p[a + j] / n; A[j] += 2 / n * p[a + j] * co; B[j] += 2 / n * p[a + j] * sn; }
    }
    // a triangle has only these three modes, so it is kept as it is
    for (let i = s, k = 0; i < t; i++, k++) {
      const th = 2 * Math.PI * (m * k % n) / n, co = Math.cos(th), sn = Math.sin(th);
      for (let j = 0; j < 3; j++) q[3 * i + j] = c[j] + A[j] * co + B[j] * sn;
    }
  }

  // every copy of face s..t at the face's centroid
  mean(s, t, q) {
    const p = this.pos, fv = this.fv, n = t - s, c = [0, 0, 0];
    for (let i = s; i < t; i++) for (let j = 0; j < 3; j++) c[j] += p[3 * fv[i] + j] / n;
    for (let i = s; i < t; i++) for (let j = 0; j < 3; j++) q[3 * i + j] = c[j];
  }

  // the copies of every edge, scaled about its midpoint to the mean edge length
  equalEdges(q) {
    const p = this.pos, E = this.edges;
    let L = 0;
    for (let e = 0; e < E.length; e += 2) {
      const a = 3 * E[e], b = 3 * E[e + 1];
      L += Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
    }
    L /= E.length / 2;
    for (let e = 0; e < E.length; e += 2) {
      const a = 3 * E[e], b = 3 * E[e + 1];
      const l = Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]) || 1, s = L / l / 2;
      for (let j = 0; j < 3; j++) {
        const m = (p[a + j] + p[b + j]) / 2, d = (p[b + j] - p[a + j]) * s;
        q[3 * e + j] = m - d; q[3 * e + 3 + j] = m + d;
      }
    }
  }

  // the copies of every edge, moved along its point nearest the centre until that point lies at
  // the mean distance of those points
  tangent(q) {
    const p = this.pos, E = this.edges, T = new Float64Array(3 * E.length / 2);
    let R = 0;
    for (let e = 0; e < E.length; e += 2) {
      const t = tangentPoint(p, 3 * E[e], 3 * E[e + 1]);
      T[3 * e / 2] = t[0]; T[3 * e / 2 + 1] = t[1]; T[3 * e / 2 + 2] = t[2];
      R += Math.hypot(t[0], t[1], t[2]);
    }
    R /= E.length / 2;
    for (let e = 0; e < E.length; e += 2) {
      const a = 3 * E[e], b = 3 * E[e + 1], tx = T[3 * e / 2], ty = T[3 * e / 2 + 1], tz = T[3 * e / 2 + 2];
      const r = Math.hypot(tx, ty, tz), s = r > 0 ? R / r - 1 : 0;
      for (let j = 0; j < 3; j++) {
        const d = s * T[3 * e / 2 + j];
        q[3 * e + j] = p[a + j] + d; q[3 * e + 3 + j] = p[b + j] + d;
      }
    }
  }

  // every vertex's copy at the mean radius, in its own direction
  sphere(q) {
    const p = this.pos, n = p.length / 3;
    let R = 0;
    for (let i = 0; i < p.length; i += 3) R += Math.hypot(p[i], p[i + 1], p[i + 2]) / n;
    for (let i = 0; i < p.length; i += 3) {
      const r = Math.hypot(p[i], p[i + 1], p[i + 2]), s = r > 0 ? R / r : 1;
      q[i] = s * p[i]; q[i + 1] = s * p[i + 1]; q[i + 2] = s * p[i + 2];
    }
  }

  // centre on the origin with the vertices at mean distance 1, so the shape cannot drift or shrink
  normalize() {
    const p = this.pos, n = p.length / 3;
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < p.length; i += 3) { x += p[i]; y += p[i + 1]; z += p[i + 2]; }
    x /= n; y /= n; z /= n;
    let r = 0;
    for (let i = 0; i < p.length; i += 3) {
      p[i] -= x; p[i + 1] -= y; p[i + 2] -= z;
      r += Math.hypot(p[i], p[i + 1], p[i + 2]);
    }
    r = r / n || 1;
    for (let i = 0; i < p.length; i++) p[i] /= r;
  }

  // the largest distance of a copy from its merged vertex, relative to the mean edge length; zero
  // means every face is exactly as the per-face step wants it
  error() {
    let s = 0;
    for (let v = 0; v < this.spread.length; v++) s = Math.max(s, this.spread[v]);
    return { spread: s / (this.meanEdge() || 1) };
  }

  meanEdge() {
    const p = this.pos, fv = this.fv, fo = this.fo;
    let l = 0;
    for (let f = 0; f < fo.length - 1; f++) {
      for (let i = fo[f]; i < fo[f + 1]; i++) {
        const a = 3 * fv[i], b = 3 * fv[i + 1 < fo[f + 1] ? i + 1 : fo[f]];
        l += Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
      }
    }
    return l / fv.length;
  }
}
