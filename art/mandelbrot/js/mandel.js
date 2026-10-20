// The Mandelbrot iteration and the random choice of a scene, ported from the Mandelbounty
// generator. Shared by the page and the workers.

// Seeded generator (mulberry32): the same seed always picks the same scene.
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

// Points in the main cardioid or the period-2 bulb never escape: skip their iterations.
function inBulbs(cr, ci) {
  const x = cr - 0.25, ci2 = ci * ci, q = x * x + ci2;
  return q * (q + x) <= 0.25 * ci2 || (cr + 1) * (cr + 1) + ci2 <= 0.0625;
}

// Escape time and distance estimate of c = cr + ci·i, with z₀ = c and dz₀ = 1. Writes the
// estimate to out.d and returns the iteration count, maxIt for points taken to be inside (with
// out.d = 0). tol2 > 0 turns on periodicity checking: an orbit that comes back within √tol2 of
// an earlier point (Brent's method) is cycling and stays bounded.
export function timeDistance(cr, ci, maxIt, bailout, tol2, out) {
  out.d = 0;
  if (tol2 > 0 && inBulbs(cr, ci)) return maxIt;
  const sq = bailout * bailout;
  let zr = cr, zi = ci, dr = 1, di = 0, n = 0;
  let rr = zr * zr, ii = zi * zi;
  let pr = zr, pi = zi, period = 8, k = 0;
  do {
    // dz ← 2·z·dz + 1, z ← z² + c
    const t = 2 * (zr * dr - zi * di) + 1;
    di = 2 * (zi * dr + zr * di);
    dr = t;
    zi = 2 * zr * zi + ci;
    zr = rr - ii + cr;
    n++;
    rr = zr * zr;
    ii = zi * zi;
    if (rr + ii >= sq) break;
    if (tol2 > 0) {
      const ex = zr - pr, ey = zi - pi;
      if (ex * ex + ey * ey < tol2) return maxIt;
      if (++k === period) { k = 0; period *= 2; pr = zr; pi = zi; }
    }
  } while (n < maxIt);
  if (n >= maxIt) return maxIt;
  const m2 = rr + ii;
  const d = Math.log(m2) * Math.sqrt(m2) / Math.hypot(dr, di);
  // |dz| overflows on very slow orbits; those lie right at the border
  out.d = d > 0 ? d : 0;
  return n;
}

const scratch = { d: 0 };
export const escapeTime = (cr, ci, maxIt, bailout) => timeDistance(cr, ci, maxIt, bailout, 0, scratch);
export function distance(cr, ci, maxIt, bailout) {
  timeDistance(cr, ci, maxIt, bailout, 0, scratch);
  return scratch.d;
}

// Walk towards the border: propose points around the current one and move whenever a point takes
// longer to escape. The step shrinks towards the distance to the set; bias is how fast.
export function search(depth, bias, rand, maxIt, bailout) {
  const frand = (a, b) => rand() * (b - a) + a;
  let re, im, value;
  do {
    re = frand(-3, 3);
    im = frand(-3, 3);
    value = escapeTime(re, im, maxIt, bailout);
  } while (value === maxIt);
  let dist = 1;
  for (let i = 0; i < depth; i++) {
    let re2, im2, value2, tries = 0;
    do {
      re2 = re + frand(-1, 1) * dist * 2;
      im2 = im + frand(-1, 1) * dist * 2;
      value2 = escapeTime(re2, im2, maxIt, bailout);
    } while (value2 === maxIt && ++tries < 10000);
    if (value2 !== maxIt && value2 > value) {
      value = value2;
      re = re2;
      im = im2;
      dist = distance(re, im, maxIt, bailout) * bias + dist * (1 - bias);
    }
  }
  return [re, im];
}

// Smallest radius at which plain doubles still resolve the picture.
export const MIN_RADIUS = 1e-11;

// A place from a seed: where to look and how far to zoom.
export function randomPlace(seed, maxIt, bailout) {
  const rand = rng(seed);
  const bias = rand() * 0.9 + 0.09;
  const [cx, cy] = search(1000, bias, rand, maxIt, bailout);
  // zoom in somewhere between 0.001 and twice the distance to the set, evenly on a log scale
  const minR = Math.max(MIN_RADIUS, distance(cx, cy, maxIt, bailout) * 2);
  const lo = Math.log(minR), hi = Math.log(0.001);
  const r = Math.exp(lo + rand() * (hi - lo));
  return { cx, cy, r };
}

// A random colour ramp (see colour.js): near black at the set, a pale tint far out, and the colour
// strongest in between.
export function randomColour(rand) {
  const q = (v, step) => +(Math.round(v / step) * step).toFixed(3);
  return {
    hue: Math.floor(rand() * 360),
    l0: q(rand() * 0.1, 0.01),
    l1: q(0.85 + rand() * 0.14, 0.01),
    c0: q(0.04 + rand() * 0.16, 0.005),
    c1: q(rand() * 0.06, 0.005),
  };
}
