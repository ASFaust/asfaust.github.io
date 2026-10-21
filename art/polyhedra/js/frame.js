// The shape as a cloud of points: a random start, and the per-round adjustments the page offers
// as toggles. With X the n×3 matrix of positions, whose columns are the x, y and z coordinates:
// - centre: subtract the mean, so the columns have mean 0;
// - orthogonalise: Gram–Schmidt on the centred columns, in the order x, y, z, so they become
//   uncorrelated. It is a shear: it changes the shape unless the columns already are uncorrelated,
//   as they are for a symmetric shape aligned with the axes;
// - normalise: scale each centred column to the same spread, the mean of the three, so the size
//   stays and the shape cannot collapse into a plane or a line. With orthogonalise this is whitening.
// All three are affine maps, so they commute with the affine-faces step and do not change its
// fixed points; for the other optimizers they change what can be reached, on purpose.

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
