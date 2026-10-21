// Complex arithmetic, Möbius maps and Grandma's recipes for two-generator Kleinian groups.
// Ported from Chris King's depthfirst.c / grandma.m (after Mumford, Series & Wright, "Indra's Pearls").
// Complex numbers are [re, im] pairs; a 2x2 matrix [p q; r s] is a flat array of 8 numbers
// [pr, pi, qr, qi, rr, ri, sr, si] so it can be copied straight into typed arrays.

export const c = (re, im = 0) => [re, im];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const scale = (a, k) => [a[0] * k, a[1] * k];
export const abs = a => Math.hypot(a[0], a[1]);
export const I = [0, 1];

export function div(a, b) {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}

// principal square root, as C's csqrt and Matlab's sqrt
export function sqrt(a) {
  const r = abs(a);
  if (r === 0) return [0, 0];
  const re = Math.sqrt((r + a[0]) / 2);
  const im = Math.sqrt(Math.max(0, (r - a[0]) / 2));
  return [re, a[1] < 0 ? -im : im];
}

// Accepts "1.6169-0.70567i", "2", "-i", "1.5 + 0.866i", "1.6168866453−1.29432650i" (unicode minus).
export function parse(str) {
  const s = String(str).replace(/[−–]/g, '-').replace(/\s+/g, '').replace(/[jI]/g, 'i');
  if (!s) return null;
  const m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)?(?:([+-])((?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)?i)?$/i);
  if (m && (m[1] !== undefined || m[2] !== undefined)) {
    const re = m[1] !== undefined ? +m[1] : 0;
    const im = m[2] !== undefined ? (m[2] === '-' ? -1 : 1) * (m[3] !== undefined ? +m[3] : 1) : 0;
    return [re, im];
  }
  const pure = s.match(/^([+-]?)((?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)?i$/i);
  if (pure) return [0, (pure[1] === '-' ? -1 : 1) * (pure[2] !== undefined ? +pure[2] : 1)];
  return null;
}

export function format(z, digits = 10) {
  const f = v => String(+v.toPrecision(digits));
  const re = Math.abs(z[0]) < 1e-15 ? 0 : z[0];
  const im = Math.abs(z[1]) < 1e-15 ? 0 : z[1];
  if (im === 0) return f(re);
  return f(re) + (im < 0 ? '-' : '+') + f(Math.abs(im)) + 'i';
}

const el = (M, k) => [M[2 * k], M[2 * k + 1]];
const mat = (p, q, r, s) => [p[0], p[1], q[0], q[1], r[0], r[1], s[0], s[1]];

export function mmul(A, B) {
  const [a, b, c_, d] = [0, 1, 2, 3].map(k => el(A, k));
  const [e, f, g, h] = [0, 1, 2, 3].map(k => el(B, k));
  return mat(add(mul(a, e), mul(b, g)), add(mul(a, f), mul(b, h)),
             add(mul(c_, e), mul(d, g)), add(mul(c_, f), mul(d, h)));
}

export function minv(A) {
  const [a, b, c_, d] = [0, 1, 2, 3].map(k => el(A, k));
  const det = sub(mul(a, d), mul(b, c_));
  return mat(div(d, det), div(scale(b, -1), det), div(scale(c_, -1), det), div(a, det));
}

export const trace = A => add(el(A, 0), el(A, 3));

// Attracting fixed point of a Möbius map, as fixp() in depthfirst.c
export function fixp(T) {
  const [a, b, c_, d] = [0, 1, 2, 3].map(k => el(T, k));
  const tr = add(a, d);
  const tr2 = add(add(mul(a, a), scale(mul(b, c_), 2)), mul(d, d));
  const h = scale(add(tr, sqrt(sub(tr2, [4, 0]))), 0.5);
  const k = mul(h, h);
  const dma = sub(d, a);
  const disc = sqrt(add(mul(dma, dma), scale(mul(b, c_), 4)));
  const num = abs(k) > 1 ? add(scale(dma, -1), disc) : sub(scale(dma, -1), disc);
  return div(num, scale(c_, 2));
}

// Trace of ab from the Markov-type identity tr[a,b] = ta² + tb² + tab² − ta·tb·tab − 2
export function traceAB(ta, tb, tcomm, altroot) {
  const p = scale(mul(ta, tb), -1);
  const q = sub(add(mul(ta, ta), mul(tb, tb)), [tcomm + 2, 0]);
  const disc = sqrt(sub(mul(p, p), scale(q, 4)));
  return scale(altroot ? add(scale(p, -1), disc) : sub(scale(p, -1), disc), 0.5);
}

// Generators [a, b, A, B] for traces ta, tb and the relation comm (a key of RELATIONS).
// free: commutator trace −2 (parabolic), Grandma's special parabolic commutator recipe.
// Otherwise Grandma's three-parameter "double alarm" recipe with tr ab solved for the commutator
// trace of the relation. symm: the symmetric inverse normalization of Chris King's depthfirstFSA.c,
// which changes the generators to (AB, A) and conjugates by [1 1; −1 1], so that the rotation of an
// elliptic commutator shows as a rotational symmetry of the limit set.
export function grandma(ta, tb, { comm = 'free', altroot = false, symm = false } = {}) {
  const rel = RELATIONS[comm] || RELATIONS.free;
  let a, b;
  if (!rel.fsa) {
    const tab = traceAB(ta, tb, -2, altroot);
    const z0 = div(mul(sub(tab, [2, 0]), tb), add(sub(mul(tb, tab), scale(ta, 2)), mul([0, 2], tab)));
    const ab = mat(scale(tab, 0.5), div(sub(tab, [2, 0]), scale(z0, 2)),
                   scale(mul(add(tab, [2, 0]), z0), 0.5), scale(tab, 0.5));
    b = mat(scale(sub(tb, [0, 2]), 0.5), scale(tb, 0.5), scale(tb, 0.5), scale(add(tb, [0, 2]), 0.5));
    a = mmul(ab, minv(b));
  } else {
    const tab = traceAB(ta, tb, rel.tcomm, altroot);
    const tC = sub(add(add(mul(ta, ta), mul(tb, tb)), mul(tab, tab)), add(mul(mul(ta, tb), tab), [2, 0]));
    const Q = sqrt(sub([2, 0], tC));
    const r = sqrt(add(tC, [2, 0]));
    const R = abs(add(tC, mul(mul(I, Q), r))) >= 2 + rel.rtol ? r : scale(r, -1);
    const iQ = mul(I, Q);
    const zo = div(mul(sub(tab, [2, 0]), sub(tb, R)), add(sub(mul(tb, tab), scale(ta, 2)), mul(iQ, tab)));
    const tatab = sub(mul(ta, tab), scale(tb, 2));
    const tbtab = sub(mul(tb, tab), scale(ta, 2));
    const den1 = mul(add(scale(tab, 2), [4, 0]), zo);
    const den2 = sub(scale(tab, 2), [4, 0]);
    a = mat(scale(ta, 0.5), div(add(tatab, scale(iQ, 2)), den1),
            div(mul(sub(tatab, scale(iQ, 2)), zo), den2), scale(ta, 0.5));
    b = mat(scale(sub(tb, iQ), 0.5), div(sub(tbtab, mul(iQ, tab)), den1),
            div(mul(add(tbtab, mul(iQ, tab)), zo), den2), scale(add(tb, iQ), 0.5));
  }
  if (symm) {
    const A = minv(a);
    a = mmul(A, minv(b));
    b = A;
    const C = [1, 0, 1, 0, -1, 0, 1, 0], Ci = minv(C);
    a = mmul(mmul(C, a), Ci);
    b = mmul(mmul(C, b), Ci);
  }
  return [a, b, minv(a), minv(b)];
}

// The three fixed-point tables of the depth-first search, index = generator (a, b, A, B):
// fix[0][i]: attracting fixed point of the commutator ending the address on the left,  g(i−1)g(i−2)g(i−3)g(i)
// fix[1][i]: attracting fixed point of the generator itself (the tip of a whorl)
// fix[2][i]: attracting fixed point of the commutator on the right,                  g(i+1)g(i+2)g(i+3)g(i)
export function fixedPoints(gens) {
  const g = k => gens[((k % 4) + 4) % 4];
  const fix = [[], [], []];
  for (let i = 0; i < 4; i++) {
    fix[0][i] = fixp(mmul(mmul(mmul(g(i - 1), g(i - 2)), g(i - 3)), g(i)));
    fix[1][i] = fixp(g(i));
    fix[2][i] = fixp(mmul(mmul(mmul(g(i + 1), g(i + 2)), g(i + 3)), g(i)));
  }
  return fix;
}

// Automatic group table (Indra's Pearls) for the non-free group with (abAB)² = I.
// Rows are states, columns the letters a, b, A, B; −1 marks a forbidden word.
export const FSA = [
  [1, 2, 3, 4], [1, 5, -1, 4], [7, 2, 8, -1], [-1, 2, 3, 6], [9, -1, 10, 4], [7, 2, 11, -1],
  [12, -1, 10, 4], [1, 5, -1, 13], [-1, 2, 3, 14], [1, 15, -1, 4], [-1, 16, 3, 4], [-1, 2, 3, 17],
  [1, 18, -1, 4], [9, -1, -1, 4], [-1, -1, 10, 4], [7, 2, -1, -1], [-1, 2, 8, -1], [-1, -1, 10, 4],
  [7, 2, -1, -1],
];

// Automata generated with MAF (Alun Williams) for Chris King's depthfirstFSA.c, same layout.
// (abAB)³ = I
const FSA3 = [
  [1, 2, 3, 4], [1, 5, -1, 4], [6, 2, 7, -1], [-1, 8, 3, 4], [9, -1, 10, 4], [6, 2, 11, -1], [1, 5, -1, 12], [-1, 8, 3, 13],
  [14, 2, 7, -1], [1, 15, -1, 4], [-1, 16, 3, 4], [-1, 8, 3, 17], [9, -1, 18, 4], [19, -1, 10, 4], [1, 5, -1, 20], [6, 2, 21, -1],
  [22, 2, 7, -1], [23, -1, 10, 4], [-1, 24, 3, 4], [1, 25, -1, 4], [9, -1, 26, 4], [-1, 8, 3, 27], [1, 5, -1, 28], [1, 29, -1, 4],
  [-1, 2, 7, -1], [6, 2, 30, -1], [-1, -1, 3, 4], [-1, -1, 10, 4], [9, -1, -1, 4], [6, 5, -1, -1], [-1, 8, 7, -1],
];
// (abAB)⁵ = I and b⁴ = I
const FSA5 = [
  [1, 2, 3, 4], [1, 5, -1, 4], [6, 7, 8, -1], [-1, 9, 3, 4], [10, -1, 11, -1], [6, 7, 12, -1], [1, 5, -1, 13], [14, -1, 8, -1],
  [-1, 9, 3, 15], [16, 7, 8, -1], [1, 17, -1, 18], [-1, 19, 3, 15], [-1, 9, 3, 20], [10, -1, 21, -1], [1, 22, -1, 13], [23, -1, 11, -1],
  [1, 5, -1, 24], [6, 7, 25, -1], [10, -1, 26, -1], [27, 7, 8, -1], [28, -1, 11, -1], [-1, 29, 3, 15], [6, 7, 30, -1], [1, 31, -1, 18],
  [10, -1, 32, -1], [-1, 9, 3, 33], [-1, 34, 3, 15], [1, 5, -1, 35], [1, 36, -1, 18], [37, 7, 8, -1], [-1, 9, 3, 38], [6, 7, 39, -1],
  [-1, 40, 3, 15], [41, -1, 11, -1], [42, 7, 8, -1], [10, -1, 43, -1], [6, 7, 44, -1], [1, 5, -1, 45], [46, -1, 11, -1], [-1, 9, 3, 47],
  [48, 7, 8, -1], [1, 49, -1, 18], [1, 5, -1, 50], [-1, 51, 3, 15], [-1, 9, 3, 52], [10, -1, 53, -1], [1, 54, -1, 18], [55, -1, 11, -1],
  [1, 5, -1, 56], [6, 7, 57, -1], [10, -1, 58, -1], [59, 7, 8, -1], [60, -1, 11, -1], [-1, 61, 3, 15], [6, 7, 62, -1], [1, 63, -1, 18],
  [10, -1, 64, -1], [-1, 65, 3, 66], [-1, 67, 3, 15], [1, 68, -1, 69], [1, 70, -1, 18], [-1, 7, 8, -1], [-1, 9, 3, 71], [6, 7, 72, -1],
  [-1, -1, 3, 15], [16, 73, 8, -1], [-1, -1, 11, -1], [74, 7, 8, -1], [6, 75, 12, -1], [10, -1, -1, -1], [6, 76, -1, -1], [77, -1, 11, -1],
  [-1, 78, 8, -1], [79, -1, 8, -1], [80, 76, -1, -1], [14, -1, 11, -1], [14, -1, 12, -1], [81, -1, -1, 18], [82, -1, 8, -1], [1, 17, -1, 13],
  [1, 5, -1, 18], [1, 22, -1, 4], [1, 22, -1, 24],
];

// The relations the commutator can satisfy: its trace, and the automaton for the reduced words
// (null: the group is free). The plane of cusps (cusps.js) is only known for free and nonfree.
// rtol: the recipe picks the root R = ±√(tC + 2) by |tC + iQR| ≥ 2 + rtol. For a real commutator
// trace in (−2, 2) both roots give exactly 2, and rounding decides: rtol = 1e-15 keeps the choice
// the Ta = Tb = 2 gasket needs, −1e-9 takes +√ as depthfirstFSA.c happened to for its examples.
export const RELATIONS = {
  free: { tcomm: -2, fsa: null },
  nonfree: { tcomm: 0, fsa: FSA, rtol: 1e-15 },
  order3: { tcomm: -1, fsa: FSA3, rtol: -1e-9 },
  // tr abAB = 2 − (2i·cos π/5)², the commutator of a square root of order 5
  pent: { tcomm: 2 + 4 * Math.cos(Math.PI / 5) ** 2, fsa: FSA5, rtol: 1e-15 },
};
