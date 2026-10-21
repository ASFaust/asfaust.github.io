// A cheap numerical discreteness test, for shading the trace planes.
// It runs the same depth-first search as dfs.js, coarsely and without drawing, and measures
// closeness in the chordal metric of the Riemann sphere, so the result does not depend on the
// size or position of the limit set. For a discrete group the search closes up after a modest
// number of nodes; for a non-discrete one the words never contract and the node budget runs out.
// The node count rises towards the edge of the discrete region, which gives a natural shading.

import { grandma, fixedPoints, RELATIONS } from './group.js';

// Two scales: a non-discrete group can close up at a coarse tolerance and only fall apart below it.
// Halving ε multiplies the work of a discrete group by about 2^D, where D ≤ 2 is the dimension of
// its limit set; for a non-discrete group the work explodes. So the finer pass gets a budget of
// `growth` times the coarse one. Returns the node count of the finer pass, or −1.
export function probe(ta, tb, group = {}, { eps = 0.04, maxNodes = 8000, levmax = 120, growth = 5.5 } = {}) {
  const n1 = probeOnce(ta, tb, group, { eps, maxNodes, levmax });
  if (n1 < 0) return -1;
  return probeOnce(ta, tb, group, { eps: eps / 2, maxNodes: Math.ceil(growth * n1), levmax: 2 * levmax });
}

// Returns the number of nodes visited, or −1 if the budget ran out (or the recipe broke down).
export function probeOnce(ta, tb, { comm = 'free', altroot = false, symm = false, neck = true } = {},
                      { eps = 0.04, maxNodes = 12000, levmax = 120 } = {}) {
  let gens, fix;
  try {
    gens = grandma(ta, tb, { comm, altroot, symm });
    fix = fixedPoints(gens);
  } catch (e) { return -1; }
  const G = new Float64Array(32), F = new Float64Array(24);
  for (let g = 0; g < 4; g++) for (let j = 0; j < 8; j++) G[8 * g + j] = gens[g][j];
  for (let t = 0; t < 3; t++) for (let g = 0; g < 4; g++) { F[(t * 4 + g) * 2] = fix[t][g][0]; F[(t * 4 + g) * 2 + 1] = fix[t][g][1]; }
  for (let j = 0; j < 32; j++) if (!isFinite(G[j])) return -1;
  for (let j = 0; j < 24; j++) if (!isFinite(F[j])) return -1;
  const FSA = (RELATIONS[comm] || RELATIONS.free).fsa, nonfree = !!FSA;

  const W = new Float64Array((levmax + 1) * 8);
  const tags = new Int8Array(levmax + 2), state = new Int16Array(levmax + 2);
  const eps2 = eps * eps;
  let lev = 0, nodes = 0;

  function compose() {
    nodes++;
    const o = 8 * lev, g = 8 * tags[lev];
    if (lev === 0) { for (let j = 0; j < 8; j++) W[j] = G[g + j]; return; }
    const q = o - 8;
    const ar = W[q], ai = W[q + 1], br = W[q + 2], bi = W[q + 3], cr = W[q + 4], ci = W[q + 5], dr = W[q + 6], di = W[q + 7];
    const er = G[g], ei = G[g + 1], fr = G[g + 2], fi = G[g + 3], gr = G[g + 4], gi = G[g + 5], hr = G[g + 6], hi = G[g + 7];
    W[o] = ar * er - ai * ei + br * gr - bi * gi;
    W[o + 1] = ar * ei + ai * er + br * gi + bi * gr;
    W[o + 2] = ar * fr - ai * fi + br * hr - bi * hi;
    W[o + 3] = ar * fi + ai * fr + br * hi + bi * hr;
    W[o + 4] = cr * er - ci * ei + dr * gr - di * gi;
    W[o + 5] = cr * ei + ci * er + dr * gi + di * gr;
    W[o + 6] = cr * fr - ci * fi + dr * hr - di * hi;
    W[o + 7] = cr * fi + ci * fr + dr * hi + di * hr;
  }

  // image of fixed point t under the current word, as a point (x, y) and |z|²
  const P = new Float64Array(9);
  function image(t, slot) {
    const o = 8 * lev, f = (t * 4 + tags[lev]) * 2;
    const zr = F[f], zi = F[f + 1];
    const nr = W[o] * zr - W[o + 1] * zi + W[o + 2], ni = W[o] * zi + W[o + 1] * zr + W[o + 3];
    const dr = W[o + 4] * zr - W[o + 5] * zi + W[o + 6], di = W[o + 4] * zi + W[o + 5] * zr + W[o + 7];
    const d = dr * dr + di * di;
    const x = (nr * dr + ni * di) / d, y = (ni * dr - nr * di) / d;
    P[3 * slot] = x; P[3 * slot + 1] = y; P[3 * slot + 2] = x * x + y * y;
  }
  // squared chordal distance between two slots
  function chord2(s, t) {
    const dx = P[3 * s] - P[3 * t], dy = P[3 * s + 1] - P[3 * t + 1];
    const v = 4 * (dx * dx + dy * dy) / ((1 + P[3 * s + 2]) * (1 + P[3 * t + 2]));
    return v === v ? v : 0; // both at ∞ (NaN) counts as the same point
  }

  tags[0] = 0; state[0] = 0;
  compose();
  for (;;) {
    let fl = nonfree && state[lev] === -1;
    while (!fl) {
      image(0, 0); image(2, 1);
      let close;
      if (neck) { image(1, 2); close = chord2(0, 2) < eps2 && chord2(2, 1) < eps2; }
      else close = chord2(0, 1) < eps2;
      if (close) break;
      if (lev === levmax) return -1; // a branch that never contracts
      lev++;
      tags[lev] = (tags[lev - 1] + 1) % 4;
      compose();
      if (nonfree) { state[lev] = FSA[state[lev - 1]][tags[lev]]; if (state[lev] === -1) fl = true; }
      if (nodes > maxNodes) return -1;
    }
    do { lev--; } while (lev !== -1 && (tags[lev + 1] + 3) % 4 === (tags[lev] + 2) % 4);
    if (lev === -1 && tags[0] === 1) return nodes;
    lev++;
    tags[lev] = (tags[lev] + 3) % 4;
    compose();
    if (nonfree && lev > 0) state[lev] = FSA[state[lev - 1]][tags[lev]];
    if (nodes > maxNodes) return -1;
  }
}
