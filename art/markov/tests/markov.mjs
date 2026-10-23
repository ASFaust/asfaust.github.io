// Checks of the dynamics, without a browser:  node tests/markov.mjs
//  - the conic slice lands on the surface S_k with the chosen z
//  - each move keeps a point on its surface, and is an involution
//  - words reduce: repeated letters cancel, also around the end
//  - escape(): bounded orbits (the fixed points of s₁s₂s₃ where they are finite) and fast escapers
import { slicer, escape, parseWord, bowditch, BUDGET } from '../js/markov.js';
import { randomPlace } from '../js/places.js';

let failed = 0;
const check = (ok, what) => { if (!ok) { failed++; console.log('FAIL', what); } };
const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const add = (...v) => v.reduce((s, a) => [s[0] + a[0], s[1] + a[1]], [0, 0]);
const neg = a => [-a[0], -a[1]];
const kOf = ([x, y, z]) => add(mul(x, x), mul(y, y), mul(z, z), neg(mul(mul(x, y), z)));
const near = (a, b, tol = 1e-8) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol * (1 + Math.hypot(...b));

let seedv = 7;
const rnd = () => (seedv = (seedv * 16807) % 2147483647) / 2147483647 * 4 - 2;

for (let n = 0; n < 50; n++) {
  const k = [rnd() * 2, rnd()], z0 = [rnd(), rnd()];
  const f = slicer({ slice: 'surface', k, z0 }), p = new Float64Array(6);
  f(rnd(), rnd(), p);
  const P = [[p[0], p[1]], [p[2], p[3]], [p[4], p[5]]];
  check(near(kOf(P), k, 1e-7), 'conic point on S_k');
  check(near(P[2], z0), 'conic point has z = z0');
  // the moves
  const moves = [
    ([x, y, z]) => [add(mul(y, z), neg(x)), y, z],
    ([x, y, z]) => [x, add(mul(x, z), neg(y)), z],
    ([x, y, z]) => [x, y, add(mul(x, y), neg(z))],
  ];
  for (const m of moves) {
    const Q = m(P);
    check(near(kOf(Q), k, 1e-7), 'a move keeps k');
    const B = m(Q);
    check(B.every((c, i) => near(c, P[i])), 'a move is an involution');
  }
}

check(JSON.stringify(parseWord('1213')) === '[0,1,0,2]', 'parse 1213');
check(JSON.stringify(parseWord('1123')) === '[1,2]', 'repeats cancel');
check(JSON.stringify(parseWord('1231')) === '[1,2]', 'cyclic repeats cancel');
check(parseWord('11').length === 0, 'empty word');

// the Markov surface k = 0 has the fixed point (3, 3, 3) of no move, but (0, 0, 0) is fixed by every move
const word = parseWord('123');
check(escape(new Float64Array([0, 0, 0, 0, 0, 0]), word, 500) === -1, 'origin stays bounded');
check(escape(new Float64Array([3, 0, 3, 0, 3, 0]), word, 500) >= 0, 'the Markov triple (3, 3, 3) escapes');
const e = escape(new Float64Array([50, 0, 40, 0, 30, 0]), word, 500);
check(e >= 0 && e < 3, 'big values escape fast: ' + e);

// the distance estimate: the derivative along the slice matches a finite difference
{
  const params = { slice: 'surface', k: [-0.76, 0.09], z0: [-0.2, -0.88] };
  const f = slicer(params), p = new Float64Array(6), dp = new Float64Array(6), q = new Float64Array(6);
  const h = 1e-6;
  f(0.7, 0.4, p, dp); f(0.7 + h, 0.4, q);
  check([0, 2].every(i => Math.hypot((q[i] - p[i]) / h - dp[i], (q[i + 1] - p[i + 1]) / h - dp[i + 1]) < 1e-4), 'slice derivative');
  const out = { d: 0 };
  f(2.5, 0.3, p, dp);
  check(escape(p, word, 200, dp, out) >= 0 && out.d > 0, 'distance estimate is positive');
}

// all words: the Fuchsian triple (3, 3, 3) and big triples are Bowditch, (1, 1, 1), with traces
// in (−2, 2), and a triple with a parabolic trace are not
{
  const out = {};
  check(bowditch([3, 0, 3, 0, 3, 0], null, BUDGET, out) > 0, '(3, 3, 3) is Bowditch');
  check(bowditch([10, 0, 10, 0, 10, 0], null, BUDGET, out) > 0, '(10, 10, 10) is Bowditch');
  check(bowditch([1, 0, 1, 0, 1, 0], null, BUDGET, out) < 0, '(1, 1, 1) is chaotic');
  check(bowditch([3, 0, 2, 0, 3, -2], null, BUDGET, out) < 0, 'a parabolic trace is not Bowditch');
  // no point of a Julia set is Bowditch: slow escapers of a word are chaotic
  const params = { slice: 'surface', k: [-0.76, 0.09], z0: [2.5, 0.3] };
  const f = slicer(params), p = new Float64Array(6), dp = new Float64Array(6);
  let slow = 0, bad = 0;
  for (let j = 0; j < 100; j++) for (let i = 0; i < 100; i++) {
    f(-8 + 0.16 * i, 8 - 0.16 * j, p, dp);
    const t = escape(p, parseWord('1323'), 200);
    if (t < 0 || t > 6) { slow++; f(-8 + 0.16 * i, 8 - 0.16 * j, p, dp); if (bowditch(p, dp, BUDGET, out) >= 0) bad++; }
  }
  check(slow > 0 && bad === 0, `slow escapers are chaotic (${slow} slow, ${bad} Bowditch)`);
}

// New place finds an edge for a few seeds, in both modes
for (const mode of ['word', 'all']) {
  let found = 0;
  for (let seed = 1; seed <= 5; seed++) if (randomPlace(seed, mode)) found++;
  check(found >= 4, `New place finds ${mode} places (${found} of 5)`);
}

console.log(failed ? `${failed} checks failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
