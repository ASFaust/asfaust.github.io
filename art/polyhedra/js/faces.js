// The detached-faces realization, from PolyOp. Each round:
//   1. detach the faces: every face gets its own copy of its vertices,
//   2. make each face nice on its own: flat, and pulled towards the regular polygon that fits it
//      best,
//   3. merge again: each vertex goes to the mean of its copies.
// Vertices whose copies disagree a lot get more weight in the next round's fit, so they move
// less there and the face's other vertices take up the difference. Without that, the big faces
// of shapes like tttttD stay big and crowd out the small ones.

export class FaceRelaxer {
  // regularity: 0 only flattens the faces, 1 replaces them by regular polygons.
  // stiffness: how much more weight a vertex with a large disagreement gets.
  constructor(pos, { fv, fo }, { regularity = 1, stiffness = 2 } = {}) {
    this.pos = pos;
    this.fv = fv; this.fo = fo;
    this.regularity = regularity;
    this.stiffness = stiffness;
    const nv = pos.length / 3;
    this.sum = new Float64Array(pos.length);    // sum of the copies of each vertex
    this.count = new Float64Array(nv);          // number of faces at each vertex
    for (let i = 0; i < fv.length; i++) this.count[fv[i]]++;
    this.copies = new Float64Array(3 * fv.length); // the detached copies, in face order
    this.weight = new Float64Array(nv).fill(1);
    this.spread = new Float64Array(nv);         // mean distance of a vertex's copies from it
    this.old = new Float64Array(pos.length);
  }

  // One round; returns the largest distance a vertex moved, relative to the size of the shape.
  step() {
    const p = this.pos, fv = this.fv, fo = this.fo, q = this.copies, w = this.weight;
    const alpha = this.regularity;
    for (let f = 0; f < fo.length - 1; f++) {
      const s = fo[f], t = fo[f + 1], n = t - s;
      // weighted centre and Newell normal
      let cx = 0, cy = 0, cz = 0, ws = 0, nx = 0, ny = 0, nz = 0;
      for (let i = s; i < t; i++) {
        const a = 3 * fv[i], b = 3 * fv[i + 1 < t ? i + 1 : s], wa = w[fv[i]];
        cx += wa * p[a]; cy += wa * p[a + 1]; cz += wa * p[a + 2]; ws += wa;
        nx += (p[a + 1] - p[b + 1]) * (p[a + 2] + p[b + 2]);
        ny += (p[a + 2] - p[b + 2]) * (p[a] + p[b]);
        nz += (p[a] - p[b]) * (p[a + 1] + p[b + 1]);
      }
      cx /= ws; cy /= ws; cz /= ws;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      // two axes in the plane of the face, e1 × e2 = normal, so counter-clockwise is positive
      let ex = 0, ey = 0, ez = 0;
      if (Math.abs(nx) < 0.9) ex = 1; else ey = 1;
      const d = ex * nx + ey * ny + ez * nz;
      ex -= d * nx; ey -= d * ny; ez -= d * nz;
      const el = Math.hypot(ex, ey, ez);
      ex /= el; ey /= el; ez /= el;
      const fx = ny * ez - nz * ey, fy = nz * ex - nx * ez, fz = nx * ey - ny * ex;
      // The regular n-gon that fits best: corners m + a · ζᵏ, with ζ the n-th root of unity and
      // the complex numbers m (centre) and a (size and turn) chosen by weighted least squares:
      //   W m + S a = Z0,  conj(S) m + W a = Z1,
      // with W = Σ w, S = Σ w ζᵏ, Z0 = Σ w z, Z1 = Σ w z conj(ζᵏ).
      let Sr = 0, Si = 0, z0r = 0, z0i = 0, z1r = 0, z1i = 0;
      for (let i = s, k = 0; i < t; i++, k++) {
        const a = 3 * fv[i], wa = w[fv[i]];
        const x = (p[a] - cx) * ex + (p[a + 1] - cy) * ey + (p[a + 2] - cz) * ez;
        const y = (p[a] - cx) * fx + (p[a + 1] - cy) * fy + (p[a + 2] - cz) * fz;
        const th = 2 * Math.PI * k / n, c = Math.cos(th), sn = Math.sin(th);
        Sr += wa * c; Si += wa * sn;
        z0r += wa * x; z0i += wa * y;
        z1r += wa * (x * c + y * sn); z1i += wa * (y * c - x * sn);
      }
      const det = ws * ws - (Sr * Sr + Si * Si);
      // m = (W Z0 − S Z1) / det,  a = (W Z1 − conj(S) Z0) / det
      const mr = (ws * z0r - (Sr * z1r - Si * z1i)) / det, mi = (ws * z0i - (Sr * z1i + Si * z1r)) / det;
      const ar = (ws * z1r - (Sr * z0r + Si * z0i)) / det, ai = (ws * z1i - (Sr * z0i - Si * z0r)) / det;
      for (let i = s, k = 0; i < t; i++, k++) {
        const a = 3 * fv[i];
        const x = (p[a] - cx) * ex + (p[a + 1] - cy) * ey + (p[a + 2] - cz) * ez;
        const y = (p[a] - cx) * fx + (p[a + 1] - cy) * fy + (p[a + 2] - cz) * fz;
        const th = 2 * Math.PI * k / n, c = Math.cos(th), sn = Math.sin(th);
        const rx = mr + ar * c - ai * sn, ry = mi + ar * sn + ai * c;
        // between the flattened corner and the regular one
        const u = x + alpha * (rx - x), v = y + alpha * (ry - y);
        q[3 * i] = cx + u * ex + v * fx;
        q[3 * i + 1] = cy + u * ey + v * fy;
        q[3 * i + 2] = cz + u * ez + v * fz;
      }
    }

    // merge
    const sum = this.sum, cnt = this.count, old = this.old;
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

    // how much each vertex's copies disagree, and from that the weights for the next round
    const spread = this.spread;
    spread.fill(0);
    for (let i = 0; i < fv.length; i++) {
      const a = 3 * fv[i];
      spread[fv[i]] += Math.hypot(q[3 * i] - p[a], q[3 * i + 1] - p[a + 1], q[3 * i + 2] - p[a + 2]) / cnt[fv[i]];
    }
    let mean = 0;
    for (let v = 0; v < cnt.length; v++) mean += spread[v];
    mean = mean / cnt.length || 1;
    for (let v = 0; v < cnt.length; v++) w[v] = 1 + this.stiffness * spread[v] / mean;

    let m = 0, r = 0;
    for (let i = 0; i < p.length; i += 3) {
      m = Math.max(m, Math.hypot(p[i] - old[i], p[i + 1] - old[i + 1], p[i + 2] - old[i + 2]));
      r = Math.max(r, Math.hypot(p[i], p[i + 1], p[i + 2]));
    }
    return m / (r || 1);
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
