// Detached faces, from PolyOp. Each round:
//   1. detach the faces: every face gets its own copy of its vertices,
//   2. make each face nice on its own, ignoring all the others,
//   3. merge again: each vertex goes to the mean of its copies.
// What "nice" means is the target:
// - 'regular': flat, and pulled towards the regular polygon that fits it best (regularity 0 only
//   flattens, 1 replaces it by that regular polygon);
// - 'affine': replaced by the affine-regular polygon that fits it best, an evenly spaced polygon
//   on an ellipse (docs/realization/nozono.md). Triangles are always affine-regular, so they
//   only follow their neighbours;
// - 'mean': shrunk to its centroid, so the merge puts each vertex at the mean of its faces'
//   centres (PolyOp's move_to_face_centers). Repeating that is power iteration with the face-mean
//   matrix of docs/realization/spectral.md: with only the normalization below the shape tends to
//   its strongest eigenvector, a line, unless that eigenvalue is threefold (Platonic solids); with
//   frame.js's orthogonalise and normalise it is subspace iteration towards the three strongest,
//   the spectral face-mean layout.
// The result need not be convex, and often is not: that is the point of it.

export class FaceRelaxer {
  constructor(pos, { fv, fo }, { target = 'regular', regularity = 1 } = {}) {
    this.pos = pos;
    this.fv = fv; this.fo = fo;
    this.target = target;
    this.regularity = regularity;
    const nv = pos.length / 3;
    this.sum = new Float64Array(pos.length);    // sum of the copies of each vertex
    this.count = new Float64Array(nv);          // number of faces at each vertex
    for (let i = 0; i < fv.length; i++) this.count[fv[i]]++;
    this.copies = new Float64Array(3 * fv.length); // the detached copies, in face order
    this.spread = new Float64Array(nv);         // mean distance of a vertex's copies from it
    this.old = new Float64Array(pos.length);
  }

  // One round; returns the largest distance a vertex moved, relative to the size of the shape.
  step() {
    const fo = this.fo;
    for (let f = 0; f < fo.length - 1; f++) {
      if (this.target === 'affine') this.affine(fo[f], fo[f + 1]);
      else if (this.target === 'mean') this.mean(fo[f], fo[f + 1]);
      else this.regular(fo[f], fo[f + 1]);
    }

    // merge
    const p = this.pos, fv = this.fv, q = this.copies, sum = this.sum, cnt = this.count, old = this.old;
    old.set(p);
    sum.fill(0);
    for (let i = 0; i < fv.length; i++) {
      const a = 3 * fv[i];
      sum[a] += q[3 * i]; sum[a + 1] += q[3 * i + 1]; sum[a + 2] += q[3 * i + 2];
    }
    for (let v = 0; v < cnt.length; v++) {
      p[3 * v] = sum[3 * v] / cnt[v]; p[3 * v + 1] = sum[3 * v + 1] / cnt[v]; p[3 * v + 2] = sum[3 * v + 2] / cnt[v];
    }
    this.normalize();

    // how much each vertex's copies disagree
    const spread = this.spread;
    spread.fill(0);
    for (let i = 0; i < fv.length; i++) {
      const a = 3 * fv[i];
      spread[fv[i]] += Math.hypot(q[3 * i] - p[a], q[3 * i + 1] - p[a + 1], q[3 * i + 2] - p[a + 2]) / cnt[fv[i]];
    }

    let m = 0, r = 0;
    for (let i = 0; i < p.length; i += 3) {
      m = Math.max(m, Math.hypot(p[i] - old[i], p[i + 1] - old[i + 1], p[i + 2] - old[i + 2]));
      r = Math.max(r, Math.hypot(p[i], p[i + 1], p[i + 2]));
    }
    return m / (r || 1);
  }

  // The copies of face s..t: its corners projected onto its plane (through the centroid, along the
  // Newell normal), then moved towards the regular polygon that fits them best. In complex
  // coordinates z_k in the plane, centred on the centroid, that polygon is a·ζᵏ with ζ = e^{2πi/n}
  // and a = (1/n) Σ z_k conj(ζᵏ), the least-squares fit: the Fourier coefficient of mode 1.
  regular(s, t) {
    const p = this.pos, fv = this.fv, q = this.copies, n = t - s, alpha = this.regularity;
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
      const th = 2 * Math.PI * k / n, c = Math.cos(th), sn = Math.sin(th);
      ar += x * c + y * sn; ai += y * c - x * sn;
    }
    ar /= n; ai /= n;
    for (let i = s, k = 0; i < t; i++, k++) {
      const a = 3 * fv[i];
      const x = (p[a] - cx) * ex + (p[a + 1] - cy) * ey + (p[a + 2] - cz) * ez;
      const y = (p[a] - cx) * fx + (p[a + 1] - cy) * fy + (p[a + 2] - cz) * fz;
      const th = 2 * Math.PI * k / n, c = Math.cos(th), sn = Math.sin(th);
      // between the flattened corner and the regular one
      const u = x + alpha * (ar * c - ai * sn - x), v = y + alpha * (ar * sn + ai * c - y);
      q[3 * i] = cx + u * ex + v * fx;
      q[3 * i + 1] = cy + u * ey + v * fy;
      q[3 * i + 2] = cz + u * ez + v * fz;
    }
  }

  // The copies of face s..t: the orthogonal projection of its corners onto Fourier modes 0 and ±1,
  //   y_j = c + a cos θ_j + b sin θ_j,  c = mean,  a = (2/n) Σ x cos θ,  b = (2/n) Σ x sin θ,
  // with θ_j = 2πj/n: the limit of the midpoint iteration. It is flat by itself, so no plane is
  // needed.
  affine(s, t) {
    const p = this.pos, fv = this.fv, q = this.copies, n = t - s;
    const c = [0, 0, 0], A = [0, 0, 0], B = [0, 0, 0];
    for (let i = s, k = 0; i < t; i++, k++) {
      const a = 3 * fv[i], th = 2 * Math.PI * k / n, co = Math.cos(th), sn = Math.sin(th);
      for (let j = 0; j < 3; j++) { c[j] += p[a + j] / n; A[j] += 2 / n * p[a + j] * co; B[j] += 2 / n * p[a + j] * sn; }
    }
    // a triangle has only these three modes, so it is kept as it is
    for (let i = s, k = 0; i < t; i++, k++) {
      const th = 2 * Math.PI * k / n, co = Math.cos(th), sn = Math.sin(th);
      for (let j = 0; j < 3; j++) q[3 * i + j] = c[j] + A[j] * co + B[j] * sn;
    }
  }

  // every copy of face s..t at the face's centroid
  mean(s, t) {
    const p = this.pos, fv = this.fv, q = this.copies, n = t - s, c = [0, 0, 0];
    for (let i = s; i < t; i++) for (let j = 0; j < 3; j++) c[j] += p[3 * fv[i] + j] / n;
    for (let i = s; i < t; i++) for (let j = 0; j < 3; j++) q[3 * i + j] = c[j];
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
