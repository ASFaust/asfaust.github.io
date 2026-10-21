// Spectral starts and the star target (docs/realization/spectral.md, regular-faces.md).
// node tests/spectral.mjs [-v] [strings...]
//
// Checks the eigensolver on a random matrix, that the spectral starts include the convex shape and
// the known stellations (great stellated dodecahedron, great icosahedron), and that star faces from
// a stellated start settles on the uniform star polyhedra, with the symmetry kept. With strings, it
// lists their spectral starts instead: eigenvalues, density, symmetry, flatness, reflex edges.

import { build, Realization } from '../js/pipeline.js';
import { flatten } from '../js/canonical.js';
import { topology } from '../js/mesh.js';
import { automorphisms } from '../js/symmetry.js';
import { SymmetricEigen, adjacency, graphMatrix, eigenspaces, spectralStarts, MATRICES } from '../js/spectral.js';
import { starK } from '../js/faces.js';
import { metrics, rng } from './lib.mjs';

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const strings = args.filter(a => a !== '-v');
let failed = 0;
const ok = (cond, what) => { if (!cond) { failed++; console.log('FAIL', what); } else if (verbose) console.log('ok  ', what); };

const startsOf = s => {
  const { P } = build(s);
  const maps = automorphisms(P, topology(P)).maps;
  return { P, maps, starts: spectralStarts(P, maps) };
};
const radii = pos => { const r = []; for (let i = 0; i < pos.length; i += 3) r.push(Math.hypot(pos[i], pos[i + 1], pos[i + 2])); return r; };
const show = (s, i, st, P) => {
  P.pos.set(st.pos);
  const m = metrics(P);
  console.log(`${s.padEnd(8)} ${String(i + 1).padStart(3)}  ${st.values.map((v, j) => v.toFixed(3) + (st.dims[j] > 1 ? '×' + st.dims[j] : '')).join(' + ').padEnd(22)} density ${st.density.toFixed(2).padStart(6)}  ${st.group.padEnd(4)} planar ${m.planarMax.toExponential(0)}  reflex ${String(m.reflex).padStart(4)}  edge× ${m.edgeRatio.toFixed(2)}`);
};

if (strings.length) {
  for (const s of strings) { const { P, starts } = startsOf(s); starts.forEach((st, i) => show(s, i, st, P)); }
  process.exit(0);
}

// the eigensolver: A v = λ v and orthonormal vectors, on a random matrix and on a graph with
// multiple eigenvalues (the dodecahedron: 1, 3, 5, 4, 4, 3)
for (const [name, n, A] of [['random 40×40', 40, (() => {
  const n = 40, r = rng(7), a = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) a[i * n + j] = a[j * n + i] = r() - 0.5;
  return a;
})()], ['D adjacency', 20, adjacency(build('D').P)]]) {
  const E = new SymmetricEigen(Float64Array.from(A), n);
  const vecs = eigenspaces(E.values).flatMap(e => E.vectors(e.start, e.dim).map(v => [E.values[e.start], v]));
  let res = 0, orth = 0;
  for (const [l, v] of vecs) for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += A[i * n + j] * v[j];
    res = Math.max(res, Math.abs(s - l * v[i]));
  }
  for (let k = 0; k < n; k++) for (let l = 0; l < n; l++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += vecs[k][1][i] * vecs[l][1][i];
    orth = Math.max(orth, Math.abs(s - (k === l)));
  }
  ok(vecs.length === n && res < 1e-10 && orth < 1e-10, `eigensolver, ${name}: residual ${res.toExponential(1)}, orthogonality ${orth.toExponential(1)}`);
  ok(E.values.every((v, i) => !i || E.values[i - 1] <= v), `eigenvalues ascending, ${name}`);
}
{
  const dims = eigenspaces(new SymmetricEigen(adjacency(build('D').P), 20).values).map(e => e.dim).join();
  ok(dims === '1,3,5,4,4,3', `D adjacency eigenspaces ${dims}`);
}

// the mean matrices go through a similar symmetric one: the mapped-back vectors must be
// eigenvectors of the real, non-symmetric matrix (here built directly: row i of D⁻¹A, D⁻¹B)
for (const kind of ['vertexmean', 'facemean']) {
  const { P } = build('kD'), n = P.nv;
  const M = new Float64Array(n * n), deg = new Float64Array(n);
  for (const f of P.faces) for (const a of f) deg[a]++;
  if (kind === 'vertexmean') { const A = adjacency(P); for (let i = 0; i < n * n; i++) M[i] = A[i] / deg[Math.floor(i / n)]; }
  else for (const f of P.faces) for (const a of f) for (const b of f) M[a * n + b] += 1 / f.length / deg[a];
  const { m, back } = graphMatrix(P, kind), E = new SymmetricEigen(m, n);
  let res = 0;
  for (const e of eigenspaces(E.values)) for (const w of E.vectors(e.start, e.dim)) {
    const v = w.map((x, i) => x * back[i]);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += M[i * n + j] * v[j]; res = Math.max(res, Math.abs(s - E.values[e.start] * v[i])); }
  }
  ok(res < 1e-10, `${kind} on kD: mapped-back eigenvectors, residual ${res.toExponential(1)}`);
}

// every matrix: the first start convex on graphs with one degree (where all four agree) and the
// Laplacian's eigenvalues shown as those of D − A, so non-negative
for (const kind of MATRICES) for (const s of ['D', 'tI', 'P6']) {
  const { P, maps } = startsOf(s), starts = spectralStarts(P, maps, kind);
  P.pos.set(starts[0].pos);
  const m = metrics(P);
  ok(m.reflex === 0 && m.inward === 0 && (kind !== 'laplacian' || starts.every(t => t.values.every(v => v > 0))), `${kind}, ${s}: first of ${starts.length} starts convex`);
}

ok([3, 4, 5, 6, 7, 8, 10, 12].map(n => starK(n, 0.3)).join() === '1,1,2,1,2,3,3,5', 'starK at pointedness 0.3');
ok([5, 7, 8].every(n => starK(n, 0) === 1), 'starK at pointedness 0 is regular');

// exact, uniform: flat faces, all edges equal, all vertices at one radius
const uniform = (P, pos) => {
  P.pos.set(pos);
  const m = metrics(P), r = radii(pos);
  return m.planarMax < 1e-9 && m.edgeRatio < 1 + 1e-6 && Math.max(...r) / Math.min(...r) < 1 + 1e-6;
};

// Platonic: the convex shape and the stellation, both exact
for (const [s, star] of [['D', 'great stellated dodecahedron'], ['I', 'great icosahedron']]) {
  const { P, starts } = startsOf(s);
  const d = starts.map(t => Math.round(t.density));
  ok(starts.length === 2 && d[0] === 1 && d[1] === 7, `${s}: two starts, densities ${d.join(', ')}`);
  ok(starts.every(t => uniform(P, t.pos) && t.group === 'Ih'), `${s}: the convex shape and the ${star}, exact, Ih`);
  P.pos.set(starts[0].pos);
  ok(metrics(P).reflex === 0, `${s}: the first start is convex`);
}

// the first start is convex on prisms, antiprisms, pyramids and Archimedean solids
for (const s of ['P6', 'A5', 'Y5', 'tI', 'aC', 'sC']) {
  const { P, starts } = startsOf(s);
  P.pos.set(starts[0].pos);
  const m = metrics(P);
  ok(Math.abs(starts[0].density - 1) < 1e-6 && m.reflex === 0 && m.inward === 0, `${s}: first of ${starts.length} starts convex (reflex ${m.reflex}, inward ${m.inward})`);
}

// star faces from the stellated start, symmetry kept: the uniform star polyhedra
for (const [s, density, name] of [['D', 7, 'great stellated dodecahedron'], ['aD', 7, 'great icosidodecahedron'], ['tI', 7, 'truncated great icosahedron'],
  ['tC', 7, 'stellated truncated hexahedron'], ['tD', 13, 'great stellated truncated dodecahedron'], ['sD', 37, 'great retrosnub icosidodecahedron']]) {
  const { P, maps, starts } = startsOf(s);
  const i = starts.findIndex(t => Math.round(t.density) === density);
  if (i < 0) { ok(false, `${s}: no start of density ${density}`); continue; }
  P.pos.set(starts[i].pos);
  const R = new Realization(P, flatten(P), 'star', { pointedness: 0.3, maps });
  while (!R.done) R.step();
  const spread = R.R.error().spread;
  ok(spread < 1e-6 && uniform(P, P.pos), `${s} → ${name}: start ${i + 1}, ${R.it} rounds, spread ${spread.toExponential(1)}`);
}

// from the convex shape, the star target cannot start (a regular face has no star in it)
{
  const { P, maps, starts } = startsOf('D');
  P.pos.set(starts[0].pos);
  const R = new Realization(P, flatten(P), 'star', { pointedness: 0.3, maps });
  while (!R.done) R.step();
  ok(R.R.error().spread > 0.5, `D convex → star faces stays stuck (spread ${R.R.error().spread.toFixed(2)})`);
}

console.log(failed ? `spectral: ${failed} failed` : 'spectral: all passed');
process.exit(failed ? 1 : 0);
