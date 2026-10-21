// Random walk through the group, after qFstochastic.m in Chris King's toolbox. A handful of points
// of the limit set, the fixed points of short words, are moved together by randomly chosen
// generators, and every image is plotted. Each image is again a point of the limit set, so the
// walk needs no tree and no closeness test. It gives a rough picture of any group, even one that
// is not discrete or whose words contract too slowly for the depth-first search to finish.
// The next letter is never the inverse of the last one. With probability `stay` it repeats the
// last letter, which carries the walk deep into the whorls around the fixed points of the
// generators; otherwise it turns to one of the other two.
//
// Points are emitted in pixel coordinates (x, y pairs) with the same 32-bit code as the segments of
// dfs.js. The word is read outside in, so the letter applied most recently comes first; the "last
// letter" is that of the word whose fixed point seeded the walk, and the length is the number of
// steps since the walk left the seeds. Only the first point to land in each pixel is kept.

import { grandma, fixedPoints, fixp, mmul, trace } from './group.js';
import { quincuncial, MAX_LEVEL } from './dfs.js';

const WALK = 512; // steps before the walk returns to the seeds

// Fixed points on the limit set, as [re, im, last letter]: those of loxodromic and parabolic words.
// An elliptic word (real trace in (−2, 2)) turns about its fixed points, which lie off the limit set.
// With an elliptic commutator (the non-free relations) that rules out the commutators' fixed points.
function seeds(gens) {
  const elliptic = M => { const t = trace(M); return Math.abs(t[1]) < 1e-9 && Math.abs(t[0]) < 2 - 1e-9; };
  const fix = fixedPoints(gens);
  const out = [];
  const nonfree = elliptic(mmul(mmul(gens[0], gens[1]), mmul(gens[2], gens[3])));
  for (let i = 0; i < 4; i++) {
    if (!elliptic(gens[i])) out.push([...fix[1][i], i]);
    if (!nonfree) out.push([...fix[0][i], i], [...fix[2][i], i]);
  }
  // two-letter words, in case both generators are elliptic
  for (const [i, j] of [[0, 1], [0, 3], [2, 1], [2, 3]]) {
    const M = mmul(gens[i], gens[j]);
    if (!elliptic(M)) out.push([...fixp(M), j]);
  }
  return out.filter(s => isFinite(s[0]) && isFinite(s[1]));
}

// p: as for search() in dfs.js, without eps, levmax and bound, plus
//   budget: number of points to compute, stay: probability of repeating the last letter,
//   root: the worker's number, 0–3. Progress is reported as the depth-first search reports its
//     place in the whole tree, so worker r fills the quarter [r/4, (r+1)/4).
// sink(seg: Float32Array [x, y, …], code: Uint32Array, n, progress) is called with batches.
// Returns { segments: points drawn, samples: points computed, done, ms, levmaxHits: 0 }.
export function walk(p, sink, { batch = 8192, flushMs = 60 } = {}) {
  const t0 = performance.now();
  const gens = grandma(p.ta, p.tb, { comm: p.comm, altroot: p.altroot, symm: p.symm });
  const G = new Float64Array(32);
  for (let g = 0; g < 4; g++) for (let j = 0; j < 8; j++) G[8 * g + j] = gens[g][j];
  for (let j = 0; j < 32; j++) if (!isFinite(G[j])) throw new Error('No group for these traces: the recipe divides by zero.');
  const S = seeds(gens);
  if (!S.length) throw new Error('No point of the limit set to start from: all short words are elliptic.');

  const m = S.length;
  const zr = new Float64Array(m), zi = new Float64Array(m);
  const budget = Math.max(m, Math.floor(p.budget) || 0);
  const stay = Math.min(1, Math.max(0, +p.stay || 0));
  const root = (p.root | 0) & 3;
  const { x0, y0, k, w, h } = p.view;
  const sphere = p.sphere || null;
  const tiles = p.tiles || [[1, 0, 0]];
  const BIG = 1e100; // beyond this a point counts as ∞

  // one bit per pixel of the view: has a point landed there yet?
  const W = Math.ceil(w), H = Math.ceil(h);
  const seen = new Uint8Array(Math.ceil(W * H / 8));

  let seg = new Float32Array(batch * 2), code = new Uint32Array(batch), n = 0, drawn = 0, done = 0;
  let lastFlush = t0;

  function flush() {
    sink(seg.subarray(0, 2 * n), code.subarray(0, n), n, (root + done / budget) / 4);
    seg = new Float32Array(batch * 2);
    code = new Uint32Array(batch);
    n = 0;
  }

  function plot(x, y, c) {
    let px, py;
    if (sphere) {
      const q = quincuncial((x - sphere.cx) / sphere.r, (y - sphere.cy) / sphere.r);
      px = (q[0] - x0) * k; py = (y0 - q[1]) * k;
    } else {
      if (x === Infinity) return;
      px = (x - x0) * k; py = (y0 - y) * k;
    }
    // the first copy of the point that lands in the view decides its pixel
    for (const [sg, ox, oy] of tiles) {
      const tx = sg * px + ox, ty = sg * py + oy;
      if (!(tx >= 0 && tx < W && ty >= 0 && ty < H)) continue;
      const i = Math.floor(ty) * W + Math.floor(tx);
      if (seen[i >> 3] & (1 << (i & 7))) return;
      seen[i >> 3] |= 1 << (i & 7);
      const o = 2 * n;
      seg[o] = px; seg[o + 1] = py;
      code[n] = c;
      drawn++;
      if (++n === batch) flush();
      return;
    }
  }

  let step = WALK, last = -1, hist = 0;
  while (done < budget) {
    if (step === WALK) {
      for (let s = 0; s < m; s++) { zr[s] = S[s][0]; zi[s] = S[s][1]; }
      step = 0; last = -1; hist = 0;
    }
    // next letter: any to begin with, then never the inverse (g + 2) of the last one
    let g;
    if (last < 0) g = Math.floor(Math.random() * 4);
    else if (Math.random() < stay) g = last;
    else g = (last + (Math.random() < 0.5 ? 1 : 3)) % 4;
    last = g;
    step++;
    hist = ((hist << 2) | g) & 0xffff; // newest letter first
    const head = (hist | (Math.min(step, MAX_LEVEL) << 18)) >>> 0;

    const o = 8 * g;
    const ar = G[o], ai = G[o + 1], br = G[o + 2], bi = G[o + 3], cr = G[o + 4], ci = G[o + 5], dr = G[o + 6], di = G[o + 7];
    for (let s = 0; s < m; s++) {
      const x = zr[s], y = zi[s];
      let X, Y;
      if (x === Infinity) {
        // ∞ goes to a/c
        const c2 = cr * cr + ci * ci;
        if (c2 === 0) { X = Infinity; Y = 0; }
        else { X = (ar * cr + ai * ci) / c2; Y = (ai * cr - ar * ci) / c2; }
      } else {
        const nr = ar * x - ai * y + br, ni = ar * y + ai * x + bi;
        const er = cr * x - ci * y + dr, ei = cr * y + ci * x + di;
        const d = er * er + ei * ei;
        X = (nr * er + ni * ei) / d; Y = (ni * er - nr * ei) / d;
        if (!(Math.abs(X) < BIG && Math.abs(Y) < BIG)) { X = Infinity; Y = 0; }
      }
      zr[s] = X; zi[s] = Y;
      plot(X, Y, (head | (S[s][2] << 16)) >>> 0);
    }
    done += m;

    if ((step & 255) === 0) {
      const now = performance.now();
      if (now - lastFlush > flushMs) { flush(); lastFlush = now; }
    }
  }
  flush();
  return { segments: drawn, samples: done, done: true, ms: performance.now() - t0, levmaxHits: 0 };
}
