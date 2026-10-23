// Checks of the finite-volume operators:  node tests/ops.mjs
//  - Voronoi areas sum to 4π
//  - ∇²z = −2z and ∇²P₂ = −6P₂ (spherical harmonics), errors shrinking with the level
//  - ∇z = ẑ − z·p, and ∇·∇z = −2z
//  - the divergence of any field sums to zero over the sphere
//  - the implicit solver inverts (1 − k∇²)
import { buildGrid } from '../js/grid.js';
import { buildOps } from '../js/climate/ops.js';

let failed = 0;
const check = (ok, what) => { if (!ok) { failed++; console.log('FAIL', what); } };
const rms = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s / a.length); };

let prevErr = Infinity;
for (const level of [3, 4, 5, 6]) {
  const g = buildGrid(level), o = buildOps(g), N = g.count;
  let A = 0;
  for (let i = 0; i < N; i++) A += o.area[i];
  check(Math.abs(A - 4 * Math.PI) < 1e-2, `L${level}: areas sum to 4π (${A})`);

  const z = new Float64Array(N), p2 = new Float64Array(N);
  for (let i = 0; i < N; i++) { z[i] = g.pos[3 * i + 2]; p2[i] = (3 * z[i] ** 2 - 1) / 2; }
  const lz = o.laplacian(z), lp = o.laplacian(p2);
  const e1 = rms(lz, z.map(v => -2 * v)), e2 = rms(lp, p2.map(v => -6 * v));
  check(e1 < 0.02 && e2 < 0.06, `L${level}: Laplacian errors ${e1.toExponential(2)}, ${e2.toExponential(2)}`);
  check(e2 < prevErr, `L${level}: Laplacian error shrinks`);
  prevErr = e2;

  const gz = o.gradient(z), want = new Float64Array(3 * N);
  for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) want[3 * i + c] = (c === 2 ? 1 : 0) - z[i] * g.pos[3 * i + c];
  const eg = rms(gz, want);
  check(eg < 0.01, `L${level}: gradient error ${eg.toExponential(2)}`);
  // the divergence of the exact gradient (a numerical gradient is only first order where
  // the grid is irregular, so its divergence is not used anywhere)
  const dg = o.divergence(want);
  const ed = rms(dg, z.map(v => -2 * v));
  check(ed < 0.015, `L${level}: div grad error ${ed.toExponential(2)}`);
  // edge normals of ∇z, reconstructed into cell vectors
  const un = new Float64Array(6 * N);
  for (let i = 0; i < N; i++) for (let k = 0; k < g.nbrCount[i]; k++) { const e = 6 * i + k; un[e] = (z[g.nbr[e]] - z[i]) / o.dist[e]; }
  const er = rms(o.reconstruct(un), want);
  check(er < 0.02, `L${level}: reconstruction error ${er.toExponential(2)}`);

  // any field: the area-weighted divergence sums to zero
  const u = new Float64Array(3 * N).map((_, k) => Math.sin(k * 0.731) + g.pos[k] * 0.3);
  const du = o.divergence(u);
  let tot = 0, mag = 0;
  for (let i = 0; i < N; i++) { tot += du[i] * o.area[i]; mag += Math.abs(du[i]) * o.area[i]; }
  check(Math.abs(tot) < 1e-10 * mag, `L${level}: divergence conserves (${tot})`);

  // (1 − k∇²) x = b with b = (1 + 2k) z has the solution z
  const k = 0.3, diag = new Float64Array(N).fill(1), kk = new Float64Array(N).fill(k);
  const b = z.map(v => (1 + 2 * k) * v), x = new Float64Array(N);
  const it = o.solveImplicit(diag, kk, b, x);
  check(rms(x, z) < 0.01, `L${level}: implicit solve (${it} iterations, error ${rms(x, z).toExponential(2)})`);
  console.log(`L${level}: lap ${e1.toExponential(1)} / ${e2.toExponential(1)}, grad ${eg.toExponential(1)}, solve ${it} it`);
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
