// Checks of the dynamics, without a browser:  node tests/markov.mjs
//  - the conic slice lands on the surface S_k with the chosen z
//  - each move keeps a point on its surface, and is an involution
//  - words reduce: repeated letters cancel, also around the end
//  - escape(): bounded orbits (the fixed points of s₁s₂s₃ where they are finite) and fast escapers
import { slicer, escape, parseWord } from '../js/markov.js';

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

console.log(failed ? `${failed} checks failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
