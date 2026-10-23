// Random places and colours, for "New place" and "Recolour". Shared by the page and the tests.

import { parseWord, slicer, escape, bowditch, BUDGET } from './markov.js';

// Seeded generator (mulberry32): the same seed always picks the same place.
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

// Smallest radius at which plain doubles still resolve the picture.
export const MIN_RADIUS = 1e-10;
export const MAX_IT = 200;

// The value of a point as in the worker (growing towards the set, −1 inside) and its distance
// estimate, for a fixed map.
export function probe(params, maxIt = MAX_IT) {
  const start = slicer(params), p = new Float64Array(6), dp = new Float64Array(6), out = { d: 0 };
  const word = parseWord(params.word);
  const f = params.mode === 'all'
    ? (wr, wi) => { start(wr, wi, p, dp); const l = bowditch(p, dp, BUDGET, out); return l < 0 ? -1 : Math.log(1 + 1 / l); }
    : (wr, wi) => { start(wr, wi, p, dp); return escape(p, word, maxIt, dp, out); };
  return (wr, wi) => { const v = f(wr, wi); return [v, out.d]; };
}

// A random word in the three moves, using all three, with no letter twice in a row (cyclically).
function randomWord(rand) {
  for (;;) {
    const n = 3 + Math.floor(rand() * 4);
    let w = '';
    for (let i = 0; i < n; i++) w += '123'[Math.floor(rand() * 3)];
    const r = parseWord(w);
    if (r.length >= 3 && new Set(r).size === 3) return r.map(l => l + 1).join('');
  }
}

const frand = (rand, a, b) => a + (b - a) * rand();
const two = v => [+v[0].toFixed(3), +v[1].toFixed(3)];

// Map parameters where pictures tend to be found: for one word, any surface and conic near the
// origin; for all words, surfaces with k near the real axis below 2 and hyperbolic z, where the
// group can act like a Kleinian group.
function randomParams(rand, mode) {
  const slice = rand() < 0.7 || mode === 'all' ? 'surface' : 'line';
  const word = randomWord(rand);
  if (mode === 'all') {
    const a = frand(rand, 0, 2 * Math.PI), r = frand(rand, 2, 3.5);
    return { mode, slice, word, k: two([frand(rand, -3, 1.5), frand(rand, -1, 1)]), z0: two([r * Math.cos(a), r * Math.sin(a)]), y0: [0.5, 0.3] };
  }
  return {
    mode, slice, word,
    k: two([frand(rand, -2, 4.5), frand(rand, -1.5, 1.5)]),
    z0: two([frand(rand, -2.5, 2.5), frand(rand, -1.5, 1.5)]),
    y0: two([frand(rand, -2, 2), frand(rand, -1.5, 1.5)]),
  };
}

// Walk towards the edge of the set: propose points around the current one and move whenever one
// has a larger value (escapes later, or comes closer to a parabolic trace). The step shrinks
// towards the distance estimate; bias is how fast. As in the Minimal Mandelbrot.
function search(f, depth, bias, rand) {
  let re = 0, im = 0, value = -1, d = 0, tries = 0;
  do { re = frand(rand, -4, 4); im = frand(rand, -4, 4); [value, d] = f(re, im); } while (value < 0 && ++tries < 200);
  if (value < 0) return null;
  let dist = 1;
  for (let i = 0; i < depth; i++) {
    const re2 = re + frand(rand, -2, 2) * dist, im2 = im + frand(rand, -2, 2) * dist;
    const [v2, d2] = f(re2, im2);
    if (v2 >= 0 && v2 > value) {
      re = re2; im = im2; value = v2;
      dist = d2 * bias + dist * (1 - bias);
    }
  }
  return { re, im, value, d: f(re, im)[1] };
}

// For all words, walking up the value finds the smooth curves where one trace turns elliptic, which
// are dull to zoom into. Instead look for chaotic points with chaotic neighbours, which lie in
// regions of positive area, and halve the way from one of them to a Bowditch neighbour until it
// sits on the edge of the region.
function edge(f, rand) {
  const N = 32, R = 6, h = 2 * R / N, grid = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) grid.push(f(-R + (i + 0.5) * h, R - (j + 0.5) * h)[0] < 0);
  const chaotic = (i, j) => i >= 0 && j >= 0 && i < N && j < N && grid[j * N + i];
  const pairs = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!chaotic(i, j) || !chaotic(i - 1, j) || !chaotic(i + 1, j) || !chaotic(i, j - 1) || !chaotic(i, j + 1)) continue;
    for (const [di, dj] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < N && b < N && !grid[b * N + a]) pairs.push([i, j, a, b]);
    }
  }
  if (!pairs.length) return null;
  const [i, j, a, b] = pairs[Math.floor(rand() * pairs.length)];
  let ax = -R + (i + 0.5) * h, ay = R - (j + 0.5) * h, bx = -R + (a + 0.5) * h, by = R - (b + 0.5) * h;
  for (let k = 0; k < 44; k++) {
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (f(mx, my)[0] < 0) { ax = mx; ay = my; } else { bx = mx; by = my; }
  }
  return { re: bx, im: by, d: Math.hypot(ax - bx, ay - by) };
}

// A place from a seed: the map, where to look and how far to zoom.
export function randomPlace(seed, mode) {
  const rand = rng(seed);
  for (let attempt = 0; attempt < 12; attempt++) {
    const params = randomParams(rand, mode);
    const f = probe(params);
    let s;
    if (mode === 'all') s = edge(f, rand);
    else {
      s = search(f, 600, rand() * 0.9 + 0.09, rand);
      // a walk that ended far from any edge found nothing: try another map
      if (s && (!(s.d > 0) || s.d > 0.05 || Math.hypot(s.re, s.im) > 6)) s = null;
    }
    if (!s) continue;
    // zoom somewhere between twice the distance to the set and a view 2 wide, evenly on a log scale
    const lo = Math.log(Math.max(MIN_RADIUS * 100, s.d * 2)), hi = Math.log(1);
    const r = Math.exp(lo + rand() * (hi - lo));
    return { ...params, view: { cx: s.re, cy: s.im, r } };
  }
  return null;
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
