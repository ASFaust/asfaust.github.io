// Checks of the icosahedral grid, without a browser:  node tests/grid.mjs [maxLevel]
//  - 10·4ⁿ + 2 cells, all on the unit sphere, no two at the same place
//  - 12 pentagons, the rest hexagons; neighbours are mutual and ordered around the cell
//  - 20·4ⁿ triangles, counter-clockwise from outside; Euler's V − E + F = 2
//  - dual areas sum to 4π and stay within a small ratio of each other
//  - level n sits inside level n+1; prolong and restrict keep constants
import { buildGrid, cellCount, cellCoords, prolong, restrict } from '../js/grid.js';

const maxLevel = +(process.argv[2] || 6);
let failed = 0;
const check = (ok, what) => { if (!ok) { failed++; console.log('FAIL', what); } };

let prev = null;
for (let n = 0; n <= maxLevel; n++) {
  const t0 = performance.now();
  const g = buildGrid(n);
  const ms = performance.now() - t0;
  const N = g.count, p = g.pos;
  check(N === cellCount(n), `level ${n}: count`);

  let maxNorm = 0;
  for (let i = 0; i < N; i++) maxNorm = Math.max(maxNorm, Math.abs(Math.hypot(p[3 * i], p[3 * i + 1], p[3 * i + 2]) - 1));
  check(maxNorm < 1e-12, `level ${n}: unit vectors (${maxNorm})`);
  const keys = new Set();
  for (let i = 0; i < N; i++) keys.add(`${p[3 * i].toFixed(12)},${p[3 * i + 1].toFixed(12)},${p[3 * i + 2].toFixed(12)}`);
  check(keys.size === N, `level ${n}: distinct positions`);

  let pent = 0, hex = 0, mutual = true, ordered = true;
  for (let a = 0; a < N; a++) {
    const k = g.nbrCount[a];
    if (k === 5) pent++; else if (k === 6) hex++;
    const ax = p[3 * a], ay = p[3 * a + 1], az = p[3 * a + 2];
    for (let s = 0; s < k; s++) {
      const b = g.nbr[6 * a + s], c = g.nbr[6 * a + (s + 1) % k];
      let back = false;
      for (let r = 0; r < g.nbrCount[b]; r++) if (g.nbr[6 * b + r] === a) back = true;
      if (!back) mutual = false;
      // b then c turns counter-clockwise around a, seen from outside
      const ux = p[3 * b] - ax, uy = p[3 * b + 1] - ay, uz = p[3 * b + 2] - az;
      const vx = p[3 * c] - ax, vy = p[3 * c + 1] - ay, vz = p[3 * c + 2] - az;
      if (ax * (uy * vz - uz * vy) + ay * (uz * vx - ux * vz) + az * (ux * vy - uy * vx) <= 0) ordered = false;
    }
  }
  check(pent === 12 && hex === N - 12, `level ${n}: 12 pentagons (${pent}, ${hex})`);
  check(mutual, `level ${n}: neighbours mutual`);
  check(ordered, `level ${n}: neighbours counter-clockwise`);

  const T = g.tris.length / 3;
  check(T === 20 * 4 ** n, `level ${n}: triangle count`);
  let edges = 0;
  for (let a = 0; a < N; a++) edges += g.nbrCount[a];
  check(N - edges / 2 + T === 2, `level ${n}: Euler characteristic`);

  let sum = 0, lo = Infinity, hi = 0;
  for (let i = 0; i < N; i++) { sum += g.area[i]; lo = Math.min(lo, g.area[i]); hi = Math.max(hi, g.area[i]); }
  check(Math.abs(sum - 4 * Math.PI) < 1e-9, `level ${n}: areas sum to 4π (${sum})`);
  if (n >= 2) check(hi / lo < 1.6, `level ${n}: area ratio ${hi / lo}`);

  if (prev) {
    // every coarse cell is a fine cell at the doubled lattice point
    let nested = true;
    const Pf = g.m + 1;
    for (let id = 0; id < prev.count; id++) {
      const [d, i, j] = cellCoords(prev, id);
      const f = d < 0 ? (id === prev.north ? g.north : g.south) : g.padIds[d][2 * i * Pf + 2 * j];
      for (let c = 0; c < 3; c++) if (p[3 * f + c] !== prev.pos[3 * id + c]) nested = false;
    }
    check(nested, `level ${n}: level ${n - 1} nested inside`);
    const ones = new Float32Array(prev.count).fill(1);
    const up = prolong(ones, prev, g), down = restrict(new Float32Array(N).fill(1), g, prev);
    check(up.every(v => Math.abs(v - 1) < 1e-6) && down.every(v => Math.abs(v - 1) < 1e-6), `level ${n}: prolong/restrict keep constants`);
    // prolonging z and comparing with the fine z: off by at most the chord sag
    const zc = new Float32Array(prev.count);
    for (let i = 0; i < prev.count; i++) zc[i] = prev.pos[3 * i + 2];
    const zf = prolong(zc, prev, g);
    let err = 0;
    for (let i = 0; i < N; i++) err = Math.max(err, Math.abs(zf[i] - p[3 * i + 2]));
    check(err < 2 / 4 ** n + 1e-6, `level ${n}: prolong error ${err}`);
  }
  console.log(`level ${n}: ${N} cells, area ratio ${(hi / lo).toFixed(3)}, built in ${ms.toFixed(0)} ms`);
  prev = g;
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
