// Checks of the geometry, without a browser:  node tests/math.mjs
//  - the coordinates read back from the flags they build
//  - all coordinates 1 puts the flags on a conic
//  - the generators a, b carry the flags to the flags at the images of the fractions
//  - the loop ABab around the puncture is unipotent exactly when t1·t2 = 1 and the edge ratios multiply to 1
//  - the search ends, without running into its caps, for cusps, holes and extreme coordinates,
//    and its boundary is a convex polygon
import { seed, mediant, split, generators, readBack, apply, cross, mmul } from '../js/flags.js';
import { chart, traverse, bases } from '../js/draw.js';

let failed = 0;
const check = (ok, what) => { if (!ok) { failed++; console.log('FAIL', what); } };
let seedv = 12345;
const rnd = () => (seedv = (seedv * 16807) % 2147483647) / 2147483647;
const coords = x => {
  const e = x.map(Math.exp);
  return { t1: e[0], t2: e[1], e1: [e[2], e[3]], e2: [e[4], e[5]], e3: [e[6], e[7]] };
};
const randomX = (r = 1.5) => Array.from({ length: 8 }, () => (rnd() * 2 - 1) * r);
const flat = c => [c.t1, c.t2, ...c.e1, ...c.e2, ...c.e3];

for (let n = 0; n < 20; n++) {
  const c = coords(randomX());
  const back = flat(readBack(c)), want = flat(c);
  check(back.every((v, i) => Math.abs(v / want[i] - 1) < 1e-9), 'read back ' + JSON.stringify(c));
}

{
  const { flags } = seed(coords([0, 0, 0, 0, 0, 0, 0, 0]));
  for (const k in flags) { const p = flags[k][0]; check(Math.abs(p[0] * p[2] - p[1] * p[1]) < 1e-12, 'conic at ' + k); }
}

// flags at the fractions down to depth 7, labelled p/q
function flagsByFraction(c, depth) {
  const { flags, intervals } = seed(c);
  const key = ([p, q]) => (q < 0 ? [-p, -q] : q === 0 ? [1, 0] : [p, q]).join('/');
  const map = new Map([['0/1', flags[0]], ['1/1', flags[1]], ['1/0', flags.inf], ['-1/1', flags['-1']]]);
  const ends = [[[0, 1], [1, 1]], [[1, 1], [1, 0]], [[-1, 0], [-1, 1]], [[-1, 1], [0, 1]]];
  const stack = intervals.map((iv, i) => ({ iv, L: ends[i][0], R: ends[i][1], d: 0 }));
  while (stack.length) {
    const s = stack.pop();
    if (s.d >= depth) continue;
    const M = mediant(c, s.iv), m = [s.L[0] + s.R[0], s.L[1] + s.R[1]];
    map.set(key(m), M);
    const [l, r] = split(c, s.iv, M);
    stack.push({ iv: l, L: s.L, R: m, d: s.d + 1 }, { iv: r, L: m, R: s.R, d: s.d + 1 });
  }
  return { map, key };
}
const same = (p, q) => Math.hypot(...cross(p, q)) / (Math.hypot(...p) * Math.hypot(...q)) < 1e-6;
for (let n = 0; n < 5; n++) {
  const c = coords(randomX(1));
  const { map, key } = flagsByFraction(c, 7);
  const g = generators(c);
  const mob = { a: ([p, q]) => [p + q, p + 2 * q], b: ([p, q]) => [p - q, 2 * q - p] };
  let tested = 0;
  for (const [k, F] of map) {
    const pq = k.split('/').map(Number);
    for (const name of ['a', 'b']) {
      const im = map.get(key(mob[name](pq)));
      if (!im) continue;
      tested++;
      check(same(apply(g[name], F[0]), im[0]), `${name} moves the flag at ${k}`);
    }
  }
  check(tested > 100, 'equivariance tested');
}

// the loop around the puncture fixes the flag at ∞ = ([0,0,1], [1,0,0]), so it is triangular
for (let n = 0; n < 10; n++) {
  const x = randomX(1);
  const cusp = n % 2 === 0;
  if (cusp) { x[1] = -x[0]; x[7] = -(x[2] + x[3] + x[4] + x[5] + x[6]); }
  const g = generators(coords(x));
  const P = mmul(mmul(g.A, g.B), mmul(g.a, g.b));
  const l = [P[0][0], P[1][1], P[2][2]];
  const r1 = Math.log(l[0] / l[1]), r2 = Math.log(l[1] / l[2]);
  const sz = x[2] + x[3] + x[4] + x[5] + x[6] + x[7];
  check(Math.abs(r1 - sz) < 1e-6 && Math.abs(r2 - (sz - 3 * (x[0] + x[1]))) < 1e-6, 'eigenvalues of the loop');
  if (cusp) check(Math.abs(r1) < 1e-6 && Math.abs(r2) < 1e-6, 'unipotent loop');
}

// the search
const cases = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0.6, -0.6, 0.3, -0.2, 0.5, 0.1, -0.4, -0.3].map(v => 2 * v),
  [0, 0, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9],
  [0, 0, -0.9, -0.9, -0.9, -0.9, -0.9, -0.9],
  [3, 0, 1.5, -1, 1.5, 1.5, -2, 1.5],
  [4, -4, 4, -4, 4, -4, 4, -4],
  [0, 0, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5],
  [0, 0, 6, 6, 6, 6, 6, 6],
  ...Array.from({ length: 10 }, () => randomX(3)),
];
for (const x of cases) {
  const c = coords(x), N = chart(c), B = bases(c);
  const pts = [];
  const t0 = Date.now();
  const res = traverse(c, N, (u, v) => [500 + 450 * u, 500 - 450 * v], { eps: 0.5, minTile: 2, sliver: 0.02, w: 1000, h: 1000 },
    (x0, y0) => pts.push([x0, y0]), () => {}, B);
  const ms = Date.now() - t0;
  const name = JSON.stringify(x.map(v => +v.toFixed(2)));
  check(!res.truncated && ms < 2000, `search ends for ${name}: ${JSON.stringify(res)} in ${ms} ms`);
  check(pts.every(p => p.every(isFinite)), 'finite points for ' + name);
  // convex: every turn has the same sign (screen y points down, so clockwise there)
  let bad = 0;
  for (let i = 0; i < pts.length; i++) {
    const [a, b, d] = [pts[i], pts[(i + 1) % pts.length], pts[(i + 2) % pts.length]];
    const turn = (b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]);
    if (turn > 1e-6 * Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(d[0] - b[0], d[1] - b[1]) + 1e-9) bad++;
  }
  check(bad === 0, `convex boundary for ${name}: ${bad} wrong turns of ${pts.length}`);
}

console.log(failed ? `${failed} checks failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
