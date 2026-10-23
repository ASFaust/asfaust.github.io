// Multigrid for the symmetric systems of solveImplicit: (area·diag − Σ (l/d) k̄ (x_j − x_i)).
//
// The grid levels nest (level n is a subset of level n+1), so a coarse field moves to the
// fine grid by the same linear interpolation as prolong(): a fine point that is also a coarse
// one keeps its value, a new one takes the mean of the two it is the midpoint of. The coarse
// operator is the Galerkin product Pᵀ A P, which keeps the one-ring stencil, so every level
// stores its matrix in the same six neighbour slots as the grid. A V-cycle with symmetric
// Gauss–Seidel (forward going down, backward coming up) is a symmetric preconditioner for
// conjugate gradients, and it needs a handful of iterations where Jacobi needed hundreds.
import { buildGrid, cellCoords } from '../grid.js';

const COARSEST = 1;

// interpolation from level l−1 to grid g (level l): up to two parents per fine cell
function prolongation(g, gc) {
  const N = g.count, p0 = new Int32Array(N), p1 = new Int32Array(N).fill(-1), P = gc.m + 1;
  p0[g.north] = gc.north; p0[g.south] = gc.south;
  for (let id = 0; id < g.north; id++) {
    const [d, I, J] = cellCoords(g, id), ids = gc.padIds[d], i = I >> 1, j = J >> 1;
    if (!(I & 1) && !(J & 1)) p0[id] = ids[i * P + j];
    else if (!(J & 1)) { p0[id] = ids[i * P + j]; p1[id] = ids[(i + 1) * P + j]; }
    else if (!(I & 1)) { p0[id] = ids[i * P + j]; p1[id] = ids[i * P + j + 1]; }
    else { p0[id] = ids[(i + 1) * P + j]; p1[id] = ids[i * P + j + 1]; }
  }
  return { p0, p1 };
}

export function buildHierarchy(grid) {
  const levels = [];
  let g = grid;
  for (let l = grid.level; l >= COARSEST; l--) {
    const N = g.count;
    levels.push({ g, N, Ad: new Float64Array(N), Ao: new Float64Array(6 * N), r: new Float64Array(N), x: new Float64Array(N), b: new Float64Array(N) });
    if (l > COARSEST) g = buildGrid(l - 1);
  }
  for (let k = 0; k < levels.length - 1; k++) Object.assign(levels[k], prolongation(levels[k].g, levels[k + 1].g));
  // slot of coarse neighbour c' in c's ring, per fine (f, slot): -1 for the diagonal
  for (let k = 0; k < levels.length - 1; k++) {
    const F = levels[k], C = levels[k + 1], gf = F.g, gc = C.g;
    const slot = c => { const m = new Map(); for (let s = 0; s < gc.nbrCount[c]; s++) m.set(gc.nbr[6 * c + s], s); return m; };
    const rings = new Array(C.N);
    // where an entry lands: a slot of Ao, or 6·N_c + c for the diagonal of c
    const find = (a, b) => { if (a === b) return 6 * C.N + a; const r = rings[a] || (rings[a] = slot(a)); const s = r.get(b); if (s === undefined) throw new Error('multigrid: coarse stencil grew'); return 6 * a + s; };
    // for each fine entry (f, f') and parent pair, where it lands: 4 per entry, f' = f first
    const map = new Int32Array(7 * 4 * F.N).fill(-1);
    for (let f = 0; f < F.N; f++) {
      const pa = [F.p0[f], F.p1[f]];
      for (let s = 0; s <= gf.nbrCount[f]; s++) {
        const f2 = s === 0 ? f : gf.nbr[6 * f + s - 1], pb = [F.p0[f2], F.p1[f2]];
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
          if (pa[a] < 0 || pb[b] < 0) continue;
          map[28 * f + 4 * s + 2 * a + b] = find(pa[a], pb[b]);
        }
      }
    }
    F.map = map;
  }
  return levels;
}

function galerkin(F, C) {
  const gf = F.g, map = F.map, Ad = C.Ad, Ao = C.Ao, E = 6 * C.N;
  Ad.fill(0); Ao.fill(0);
  for (let f = 0; f < F.N; f++) {
    const wa = F.p1[f] < 0 ? [1, 0] : [0.5, 0.5];
    for (let s = 0; s <= gf.nbrCount[f]; s++) {
      const f2 = s === 0 ? f : gf.nbr[6 * f + s - 1], v = s === 0 ? F.Ad[f] : F.Ao[6 * f + s - 1];
      const wb = F.p1[f2] < 0 ? [1, 0] : [0.5, 0.5];
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        const t = map[28 * f + 4 * s + 2 * a + b], w = wa[a] * wb[b] * v;
        if (t < 0 || w === 0) continue;
        if (t < E) Ao[t] += w; else Ad[t - E] += w;
      }
    }
  }
}

function sweep(L, forward) {
  const { g, N, Ad, Ao, x, b } = L, nbr = g.nbr, cnt = g.nbrCount;
  for (let n = 0; n < N; n++) {
    const i = forward ? n : N - 1 - n;
    let s = b[i];
    for (let k = 0, e = 6 * i; k < cnt[i]; k++, e++) s -= Ao[e] * x[nbr[e]];
    x[i] = s / Ad[i];
  }
}

function residual(L) {
  const { g, N, Ad, Ao, x, b, r } = L, nbr = g.nbr, cnt = g.nbrCount;
  for (let i = 0; i < N; i++) {
    let s = b[i] - Ad[i] * x[i];
    for (let k = 0, e = 6 * i; k < cnt[i]; k++, e++) s -= Ao[e] * x[nbr[e]];
    r[i] = s;
  }
}

function vcycle(levels, k) {
  const L = levels[k];
  if (k === levels.length - 1) { for (let s = 0; s < 10; s++) { sweep(L, true); sweep(L, false); } return; }
  sweep(L, true);
  residual(L);
  const C = levels[k + 1];
  C.b.fill(0); C.x.fill(0);
  for (let f = 0; f < L.N; f++) {
    if (L.p1[f] < 0) C.b[L.p0[f]] += L.r[f];
    else { C.b[L.p0[f]] += 0.5 * L.r[f]; C.b[L.p1[f]] += 0.5 * L.r[f]; }
  }
  vcycle(levels, k + 1);
  for (let f = 0; f < L.N; f++) L.x[f] += L.p1[f] < 0 ? C.x[L.p0[f]] : 0.5 * (C.x[L.p0[f]] + C.x[L.p1[f]]);
  sweep(L, false);
}

// sets the fine matrix from (diag, k) and builds the coarse ones
export function setOperator(levels, ops, diag, k) {
  const F = levels[0], { N, nbr, nbrCount, lap, area } = ops;
  for (let i = 0; i < N; i++) {
    let s = area[i] * diag[i];
    for (let n = 0, e = 6 * i; n < nbrCount[i]; n++, e++) { const w = lap[e] * 0.5 * (k[i] + k[nbr[e]]); s += w; F.Ao[e] = -w; }
    F.Ad[i] = s;
  }
  for (let l = 0; l < levels.length - 1; l++) galerkin(levels[l], levels[l + 1]);
}

// z = M⁻¹ r, one V-cycle from zero
export function precondition(levels, r, z) {
  const F = levels[0];
  F.b.set(r); F.x.fill(0);
  vcycle(levels, 0);
  z.set(F.x);
}

// A preconditioner of its own, for (diag − ∇·k∇): set() once, apply() as often as needed
export function preconditioner(ops, grid) {
  const levels = buildHierarchy(grid);
  return {
    set: (diag, k) => setOperator(levels, ops, diag, k),
    apply: (r, z) => precondition(levels, r, z),
  };
}
