// The shape as a cloud of points: a random start, a shake, the per-round adjustment the page offers
// as a toggle, and comparing two shapes. With X the n×3 matrix of positions, whose columns are the
// x, y and z coordinates, whiten (the page's switch) replaces X by X C^{-1/2}, rescaled to keep
// the size, with C the 3×3 covariance of the centred positions: symmetric (ZCA) whitening. The
// shape cannot collapse into a plane or a line, and since a rotation R turns C into RᵀCR, whitening
// commutes with rotations and never breaks a symmetry. It keeps the span of the three columns, so
// with a linear optimizer (face mean, stellate) every round is a step of subspace iteration.
//
// The three adjustments the page had before (2026-10-21), still read from old links so that they
// replay exactly:
// - centre: subtract the mean, so the columns have mean 0;
// - orthogonalise: Gram–Schmidt on the centred columns, in the order x, y, z, so they become
//   uncorrelated. It is a shear: it changes the shape unless the columns already are uncorrelated,
//   as they are for a symmetric shape aligned with the axes;
// - normalise: scale each centred column to the same spread, the mean of the three, so the size
//   stays and the shape cannot collapse into a plane or a line. With orthogonalise this is whitening.
// All three are affine maps, so they commute with the affine-faces step and do not change its
// fixed points; for the other optimizers they change what can be reached, on purpose. Gram–Schmidt
// is not symmetric in x, y and z, so it breaks the symmetry of a shape that is not aligned with the
// axes; that is why whiten replaced them.

// a seeded random generator (mulberry32), so a random start replays from its seed
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// every coordinate independently normal, with mean 0 and spread 1 (Box–Muller)
export function randomPositions(pos, seed) {
  const r = rng(seed);
  for (let i = 0; i < pos.length; i += 2) {
    const u = 1 - r(), v = r(), m = Math.sqrt(-2 * Math.log(u));
    pos[i] = m * Math.cos(2 * Math.PI * v);
    if (i + 1 < pos.length) pos[i + 1] = m * Math.sin(2 * Math.PI * v);
  }
}

// Applies the adjustments that flags asks for ({ centre, orthogonalise, normalise }) in place.
export function adjust(pos, { centre = false, orthogonalise = false, normalise = false } = {}) {
  if (!centre && !orthogonalise && !normalise) return;
  const n = pos.length / 3, m = [0, 0, 0];
  for (let i = 0; i < pos.length; i += 3) for (let j = 0; j < 3; j++) m[j] += pos[i + j] / n;
  for (let i = 0; i < pos.length; i += 3) for (let j = 0; j < 3; j++) pos[i + j] -= m[j];
  const dot = (a, b) => { let s = 0; for (let i = 0; i < pos.length; i += 3) s += pos[i + a] * pos[i + b]; return s; };
  if (orthogonalise) {
    for (let b = 1; b < 3; b++) for (let a = 0; a < b; a++) {
      const aa = dot(a, a);
      if (!(aa > 0)) continue;
      const k = dot(a, b) / aa;
      for (let i = 0; i < pos.length; i += 3) pos[i + b] -= k * pos[i + a];
    }
  }
  if (normalise) {
    const s = [0, 1, 2].map(j => Math.sqrt(dot(j, j) / n)), mean = (s[0] + s[1] + s[2]) / 3;
    for (let j = 0; j < 3; j++) if (s[j] > 0) for (let i = 0; i < pos.length; i += 3) pos[i + j] *= mean / s[j];
  }
  if (!centre) for (let i = 0; i < pos.length; i += 3) for (let j = 0; j < 3; j++) pos[i + j] += m[j];
}

// Whitens in place (see the top of this file). A shape flat to rounding error is left alone.
export function whiten(pos) {
  const n = pos.length / 3, m = [0, 0, 0];
  for (let i = 0; i < pos.length; i += 3) for (let j = 0; j < 3; j++) m[j] += pos[i + j] / n;
  const C = new Float64Array(9);
  for (let i = 0; i < pos.length; i += 3) {
    for (let j = 0; j < 3; j++) pos[i + j] -= m[j];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[3 * a + b] += pos[i + a] * pos[i + b] / n;
  }
  const { values, vectors: V } = jacobi(C, 3), size = Math.sqrt((values[0] + values[1] + values[2]) / 3);
  if (!(values[2] > 1e-24 * values[0])) return;
  // W = V diag(size / √λ) Vᵀ
  const d = values.map(l => size / Math.sqrt(l)), W = new Float64Array(9);
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let k = 0; k < 3; k++) W[3 * a + b] += V[3 * a + k] * d[k] * V[3 * b + k];
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    for (let a = 0; a < 3; a++) pos[i + a] = W[3 * a] * x + W[3 * a + 1] * y + W[3 * a + 2] * z;
  }
}

// Eigenvalues (descending) and eigenvectors (the columns of vectors, row-major) of the symmetric
// k×k matrix A, by cyclic Jacobi rotations; for the 3×3 and 4×4 matrices of this file.
export function jacobi(A, k) {
  const a = Float64Array.from(A), v = new Float64Array(k * k);
  for (let i = 0; i < k; i++) v[i * k + i] = 1;
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < k; p++) for (let q = p + 1; q < k; q++) off += a[p * k + q] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < k; p++) for (let q = p + 1; q < k; q++) {
      const apq = a[p * k + q];
      if (Math.abs(apq) < 1e-300) continue;
      const th = (a[q * k + q] - a[p * k + p]) / (2 * apq);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let r = 0; r < k; r++) {
        const x = a[r * k + p], y = a[r * k + q];
        a[r * k + p] = c * x - s * y; a[r * k + q] = s * x + c * y;
      }
      for (let r = 0; r < k; r++) {
        const x = a[p * k + r], y = a[q * k + r];
        a[p * k + r] = c * x - s * y; a[q * k + r] = s * x + c * y;
      }
      for (let r = 0; r < k; r++) {
        const x = v[r * k + p], y = v[r * k + q];
        v[r * k + p] = c * x - s * y; v[r * k + q] = s * x + c * y;
      }
    }
  }
  const order = [...Array(k).keys()].sort((i, j) => a[j * k + j] - a[i * k + i]);
  const vectors = new Float64Array(k * k);
  order.forEach((o, j) => { for (let r = 0; r < k; r++) vectors[r * k + j] = v[r * k + o]; });
  return { values: order.map(o => a[o * k + o]), vectors };
}

// Moves every coordinate by a normal random amount, amount × the mean edge length (edges: the
// flat pairs of canonical.js), from a seed, so a shake replays.
export function shake(pos, edges, seed, amount = 0.1) {
  let l = 0;
  for (let e = 0; e < edges.length; e += 2) {
    const a = 3 * edges[e], b = 3 * edges[e + 1];
    l += Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
  }
  l /= edges.length / 2 || 1;
  const noise = new Float64Array(pos.length);
  randomPositions(noise, seed);
  for (let i = 0; i < pos.length; i++) pos[i] += amount * l * noise[i];
}

// How different two shapes are, regardless of where they are, how big and how they are turned:
// both centred and scaled to root-mean-square radius 1, then b turned onto a by the best rotation
// (Horn's quaternion method; no mirroring); the root-mean-square distance that remains. 0 for the
// same shape; a few 1e-3 is invisible.
export function shapeDistance(a, b) {
  const n = a.length / 3;
  const norm = p => {
    const m = [0, 0, 0];
    for (let i = 0; i < p.length; i += 3) for (let j = 0; j < 3; j++) m[j] += p[i + j] / n;
    const q = new Float64Array(p.length);
    let r = 0;
    for (let i = 0; i < p.length; i++) { q[i] = p[i] - m[i % 3]; r += q[i] * q[i]; }
    r = Math.sqrt(r / n) || 1;
    for (let i = 0; i < q.length; i++) q[i] /= r;
    return q;
  };
  const A = norm(a), B = norm(b), S = new Float64Array(9);
  for (let i = 0; i < A.length; i += 3) for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) S[3 * x + y] += B[i + x] * A[i + y];
  const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = S;
  const N = [
    xx + yy + zz, yz - zy, zx - xz, xy - yx,
    yz - zy, xx - yy - zz, xy + yx, zx + xz,
    zx - xz, xy + yx, -xx + yy - zz, yz + zy,
    xy - yx, zx + xz, yz + zy, -xx - yy + zz,
  ];
  // the best rotation leaves |A|² + |B|² − 2λ_max, with |A|² = |B|² = n
  const lmax = jacobi(N, 4).values[0];
  return Math.sqrt(Math.max(0, 2 * n - 2 * lmax) / n);
}
