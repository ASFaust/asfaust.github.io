// Depth-first search of the word tree, as in depthfirst.c (Chris King) and Indra's Pearls, ch. 7.
// The search walks the tree of reduced words in the generators a, b, A, B "corkscrew-wise", so it
// sweeps once around the limit set. A branch ends when the images under the current word of the
// fixed points of its two neighbouring commutators are ε-close, and a line joins them.
//
// Segments are emitted in pixel coordinates of the target view together with a 32-bit code:
//   bits 0–15  the first 8 letters of the word (2 bits each), bits 16–17 the last letter,
//   bits 18–31 the word length. The renderer can then recolour without running the search again.

import { grandma, fixedPoints, FSA } from './group.js';

export const MAX_LEVEL = 16383;

// p: { ta, tb, nonfree, altroot, levmax, eps (pixels), neck, view: {x0, y0, k, w, h}, bound, all }
//   view maps the plane to pixels: px = (re − x0)·k, py = (y0 − im)·k on a w × h canvas.
//   bound: { m, disks } from measure(). disks[s] = [x, y, r] bounds the part of the limit set whose
//   addresses start with the m letters s (base 4). Below a word W·s that part becomes W(disk);
//   if that disk misses the view the branch is skipped, which makes zoomed renders fast. Optional.
//   all: keep segments outside the view as well (used to measure the limit set).
//   root: 0–3 to search only the words starting with a, b, A or B.
// sink(seg: Float32Array, code: Uint32Array, n, progress) is called with batches.
// Returns { segments, done, ms, levmaxHits }.
export function search(p, sink, { batch = 8192, flushMs = 60, timeLimit = Infinity, checkTime = null } = {}) {
  const t0 = performance.now();
  const gens = grandma(p.ta, p.tb, { nonfree: p.nonfree, altroot: p.altroot });
  const fix = fixedPoints(gens);
  const levmax = Math.max(1, Math.min(MAX_LEVEL, p.levmax | 0));
  const nonfree = !!p.nonfree;
  const neck = !!p.neck;
  const all = !!p.all;
  const { x0, y0, k, w, h } = p.view;

  // generator matrices and fixed points in flat arrays for the inner loop
  const G = new Float64Array(32);
  for (let g = 0; g < 4; g++) for (let j = 0; j < 8; j++) G[8 * g + j] = gens[g][j];
  const F = new Float64Array(24); // F[(table·4 + gen)·2 + re/im]
  for (let t = 0; t < 3; t++) for (let g = 0; g < 4; g++) {
    F[(t * 4 + g) * 2] = fix[t][g][0];
    F[(t * 4 + g) * 2 + 1] = fix[t][g][1];
  }
  for (let j = 0; j < 32; j++) if (!isFinite(G[j])) throw new Error('No group for these traces: the recipe divides by zero.');
  for (let j = 0; j < 24; j++) if (!isFinite(F[j])) throw new Error('No group for these traces: a fixed point lies at infinity.');

  const W = new Float64Array((levmax + 1) * 8); // word matrices down the current branch
  const tags = new Int8Array(levmax + 2);
  const state = new Int16Array(levmax + 2);

  let seg = new Float32Array(batch * 4), code = new Uint32Array(batch), n = 0, total = 0;
  let levmaxHits = 0, iter = 0, aborted = false, lastFlush = t0;

  // view rectangle with a margin, in pixels and in the plane
  const margin = Math.max(2, p.eps * 2);
  const left = -margin, right = w + margin, top = -margin, bottom = h + margin;
  const vx0 = x0 + left / k, vx1 = x0 + right / k, vy0 = y0 - bottom / k, vy1 = y0 - top / k;

  // Culling only pays when the view shows part of the limit set.
  const B = p.bound;
  const cull = !all && !!B && !(B.x0 >= vx0 && B.x1 <= vx1 && B.y0 >= vy0 && B.y1 <= vy1);
  const cm = cull ? B.m : 0, CD = cull ? Float64Array.from(B.disks.flat()) : null;

  function progress() {
    // position in the tree from the first few turns: top level goes a, B, A, b; each node has 3 children
    let f = ((4 - tags[0]) % 4) / 4, unit = 0.25;
    for (let j = 1; j <= Math.min(lev, 6); j++) {
      unit /= 3;
      f += (((tags[j - 1] + 1 - tags[j]) % 4 + 4) % 4) * unit;
    }
    return f;
  }

  function flush() {
    sink(seg.subarray(0, 4 * n), code.subarray(0, n), n, progress());
    seg = new Float32Array(batch * 4);
    code = new Uint32Array(batch);
    n = 0;
  }

  function wordCode() {
    let c = 0;
    const m = Math.min(lev, 7);
    for (let j = 0; j <= m; j++) c |= tags[j] << (2 * j);
    return (c | (tags[lev] << 16) | (Math.min(lev + 1, MAX_LEVEL) << 18)) >>> 0;
  }

  function emit(ax, ay, bx_, by_) {
    const i = 4 * n;
    seg[i] = ax; seg[i + 1] = ay; seg[i + 2] = bx_; seg[i + 3] = by_;
    code[n] = wordCode();
    total++;
    if (++n === batch) flush();
  }

  // word[lev] = word[lev−1] · gen[tags[lev]]
  function compose() {
    const o = 8 * lev, g = 8 * tags[lev];
    if (lev === 0) { for (let j = 0; j < 8; j++) W[j] = G[g + j]; return; }
    const q = o - 8;
    const ar = W[q], ai = W[q + 1], br_ = W[q + 2], bi = W[q + 3], cr = W[q + 4], ci = W[q + 5], dr = W[q + 6], di = W[q + 7];
    const er = G[g], ei = G[g + 1], fr = G[g + 2], fi = G[g + 3], gr = G[g + 4], gi = G[g + 5], hr = G[g + 6], hi = G[g + 7];
    W[o] = ar * er - ai * ei + br_ * gr - bi * gi;
    W[o + 1] = ar * ei + ai * er + br_ * gi + bi * gr;
    W[o + 2] = ar * fr - ai * fi + br_ * hr - bi * hi;
    W[o + 3] = ar * fi + ai * fr + br_ * hi + bi * hr;
    W[o + 4] = cr * er - ci * ei + dr * gr - di * gi;
    W[o + 5] = cr * ei + ci * er + dr * gi + di * gr;
    W[o + 6] = cr * fr - ci * fi + dr * hr - di * hi;
    W[o + 7] = cr * fi + ci * fr + dr * hi + di * hr;
  }

  // Möbius image of (zr, zi) under word[lev], left in (ir, ii)
  let ir = 0, ii = 0;
  function apply(zr, zi) {
    const o = 8 * lev;
    const nr = W[o] * zr - W[o + 1] * zi + W[o + 2], ni = W[o] * zi + W[o + 1] * zr + W[o + 3];
    const dr = W[o + 4] * zr - W[o + 5] * zi + W[o + 6], di = W[o + 4] * zi + W[o + 5] * zr + W[o + 7];
    const d = dr * dr + di * di;
    ir = (nr * dr + ni * di) / d;
    ii = (ni * dr - nr * di) / d;
  }

  // image of fixed point (table t, generator of the current level), in pixels
  let px = 0, py = 0;
  function image(t) {
    const f = (t * 4 + tags[lev]) * 2;
    apply(F[f], F[f + 1]);
    px = (ir - x0) * k;
    py = (y0 - ii) * k;
  }

  // Does word[lev − m] map the disk around the last m letters' part of the limit set to a disk
  // that misses the view?
  function outside() {
    if (lev < cm - 1) return false;
    let si = 0;
    for (let j = lev - cm + 1; j <= lev; j++) si = si * 4 + tags[j];
    const bx = CD[3 * si], by = CD[3 * si + 1], br = CD[3 * si + 2];
    let mx, my, rad;
    if (lev < cm) { mx = bx; my = by; rad = br; }
    else {
      const o = 8 * (lev - cm);
      const ar = W[o], ai = W[o + 1], cr = W[o + 4], ci = W[o + 5], dr = W[o + 6], di = W[o + 7];
      const c2 = cr * cr + ci * ci;
      const map = (zr, zi) => {
        const nr = ar * zr - ai * zi + W[o + 2], ni = ar * zi + ai * zr + W[o + 3];
        const er = cr * zr - ci * zi + dr, ei = cr * zi + ci * zr + di;
        const d = er * er + ei * ei;
        ir = (nr * er + ni * ei) / d; ii = (ni * er - nr * ei) / d;
      };
      if (c2 === 0) {
        map(bx, by); mx = ir; my = ii;
        rad = br * Math.sqrt((ar * ar + ai * ai) / (dr * dr + di * di));
      } else {
        // pole z = −d/c; if it is inside the disk the image contains ∞
        const zr = -(dr * cr + di * ci) / c2, zi = -(di * cr - dr * ci) / c2;
        const ux = zr - bx, uy = zi - by, u2 = ux * ux + uy * uy;
        if (u2 <= br * br * 1.0001) return false;
        // the image centre is the image of the pole's reflection in the circle
        const s = br * br / u2;
        map(bx + ux * s, by + uy * s); mx = ir; my = ii;
        map(bx + br, by);
        rad = Math.hypot(ir - mx, ii - my);
      }
    }
    const dx = Math.max(vx0 - mx, mx - vx1, 0), dy = Math.max(vy0 - my, my - vy1, 0);
    return dx * dx + dy * dy > rad * rad;
  }

  // root: search only the subtree of words starting with this generator (for parallel workers)
  const single = p.root !== undefined && p.root !== null;
  let lev = 0;
  tags[0] = single ? p.root : 0; state[0] = 0;
  compose();
  let haveLast = false, lastX = 0, lastY = 0; // previous "new" point, to close gaps in the non-free case
  const eps2 = p.eps * p.eps;

  for (;;) {
    let fl = nonfree && state[lev] === -1;
    while (!fl) {
      if (cull && outside()) { haveLast = false; break; }
      image(0); const nx = px, ny = py;
      image(2); const ox = px, oy = py;
      let mx = 0, my = 0;
      if (neck) { image(1); mx = px; my = py; }
      const atMax = lev === levmax;
      const close = neck
        ? (nx - mx) * (nx - mx) + (ny - my) * (ny - my) < eps2 && (mx - ox) * (mx - ox) + (my - oy) * (my - oy) < eps2
        : (nx - ox) * (nx - ox) + (ny - oy) * (ny - oy) < eps2;
      if (atMax || close) {
        if (atMax) levmaxHits++;
        if (all || !(nx < left || nx > right || ny < top || ny > bottom)) {
          // with the neck test the whorl tip lies between: draw through it (closes the gasket's gaps)
          if (neck) { emit(ox, oy, mx, my); emit(mx, my, nx, ny); }
          else emit(ox, oy, nx, ny);
          if (nonfree && haveLast) {
            const dx = ox - lastX, dy = oy - lastY;
            if (dx * dx + dy * dy < 100 * eps2) emit(lastX, lastY, ox, oy);
          }
        }
        lastX = nx; lastY = ny; haveLast = true;
        break;
      }
      // go forward
      lev++;
      tags[lev] = (tags[lev - 1] + 1) % 4;
      compose();
      if (nonfree) {
        state[lev] = FSA[state[lev - 1]][tags[lev]];
        if (state[lev] === -1) fl = true;
      }
    }
    // go backward until there is an untried turn
    do { lev--; } while (lev !== -1 && (tags[lev + 1] + 3) % 4 === (tags[lev] + 2) % 4);
    if (lev === -1 && (single || tags[0] === 1)) break; // finished
    lev++;
    tags[lev] = (tags[lev] + 3) % 4; // turn and go forward
    compose();
    if (nonfree && lev > 0) state[lev] = FSA[state[lev - 1]][tags[lev]];

    if ((++iter & 4095) === 0) {
      const now = performance.now();
      if (now - t0 > timeLimit || (checkTime && checkTime())) { aborted = true; break; }
      if (now - lastFlush > flushMs) { flush(); lastFlush = now; }
    }
  }
  flush();
  return { segments: total, done: !aborted, ms: performance.now() - t0, levmaxHits };
}

// Coarse pass over the whole limit set: its extent, for framing the view, and bounding disks of
// the parts of the limit set by their first m letters, for culling. bound is null if the set runs
// off towards infinity or the search did not finish in time.
export function measure(p, { timeLimit = 1500, m = 2 } = {}) {
  // two passes: a rough one for the size of the set, then one with ε at 1/300 of that size
  const t0 = performance.now();
  let xs, ys, cs, r, eps = 0.05;
  for (let pass = 0; pass < 2; pass++) {
    xs = []; ys = []; cs = [];
    r = search({ ...p, eps, levmax: Math.min(p.levmax || 1000, pass ? 400 : 60), all: true, bound: null,
                 view: { x0: 0, y0: 0, k: 1, w: 0, h: 0 } },
      (seg, code, n) => {
        for (let i = 0; i < n; i++) for (let e = 0; e < 2; e++) {
          xs.push(seg[4 * i + 2 * e]); ys.push(-seg[4 * i + 2 * e + 1]); cs.push(code[i]);
        }
      },
      { timeLimit: pass ? Math.max(200, timeLimit - (performance.now() - t0)) : timeLimit / 3 });
    if (!xs.length) return null;
    const sx = Float64Array.from(xs).sort(), sy = Float64Array.from(ys).sort();
    const q = (a, f) => a[Math.floor(f * (a.length - 1))];
    const size = Math.max(q(sx, 0.95) - q(sx, 0.05), q(sy, 0.95) - q(sy, 0.05), 1e-6);
    eps = Math.min(0.05, size / 300);
  }
  r.ms = performance.now() - t0;
  if (!xs.length) return null;
  const sx = Float64Array.from(xs).sort(), sy = Float64Array.from(ys).sort();
  const q = (a, f) => a[Math.min(a.length - 1, Math.max(0, Math.floor(f * (a.length - 1))))];
  const frame = { x0: q(sx, 0.002), x1: q(sx, 0.998), y0: q(sy, 0.002), y1: q(sy, 0.998) };
  const ex = sx[sx.length - 1] - sx[0], ey = sy[sy.length - 1] - sy[0];
  const fw = Math.max(frame.x1 - frame.x0, frame.y1 - frame.y0, 1e-9);
  let bound = null;
  if (r.done && Math.max(ex, ey) < 50 * fw && Math.max(ex, ey) < 1e6) {
    // per address prefix: bounding box centre, then the farthest point, padded for the arcs a
    // coarse pass misses. Prefixes that never occur get an infinite disk (never culled).
    const nd = 4 ** m, box = [];
    for (let s = 0; s < nd; s++) box.push([Infinity, -Infinity, Infinity, -Infinity]);
    const key = c => { let s = 0; for (let j = 0; j < m; j++) s = s * 4 + ((c >>> (2 * j)) & 3); return s; };
    for (let i = 0; i < xs.length; i++) {
      const b = box[key(cs[i])];
      if (xs[i] < b[0]) b[0] = xs[i]; if (xs[i] > b[1]) b[1] = xs[i];
      if (ys[i] < b[2]) b[2] = ys[i]; if (ys[i] > b[3]) b[3] = ys[i];
    }
    const disks = box.map(b => isFinite(b[0]) ? [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, 0] : [0, 0, 1e300]);
    for (let i = 0; i < xs.length; i++) {
      const d = disks[key(cs[i])];
      d[2] = Math.max(d[2], Math.hypot(xs[i] - d[0], ys[i] - d[1]));
    }
    for (const d of disks) if (d[2] < 1e300) d[2] = d[2] * 1.1 + 0.03 * fw;
    bound = { m, disks, x0: sx[0], x1: sx[sx.length - 1], y0: sy[0], y1: sy[sy.length - 1] };
  }
  return { frame, bound, done: r.done, ms: r.ms };
}
