// Every seed and operator gives a valid polyhedron with the right faces.
// node tests/topology.mjs

import { parse, estimate } from '../js/notation.js';
import { seed } from '../js/seeds.js';
import { OPS } from '../js/operators.js';
import { check } from '../js/mesh.js';
import { census, randomStrings, expect, finish } from './lib.mjs';

// build without any relaxation: topology only
function make(text) {
  const p = parse(text);
  let P = seed(p.letter, p.n);
  const counts = estimate([P.nv, P.ne, P.nf], p.ops);
  for (const { op, n } of p.ops) P = OPS[op].run(P, n);
  return { P, counts, selective: p.ops.some(o => o.n) };
}

const KNOWN = {
  // Platonic
  T: '4×3', C: '6×4', O: '8×3', D: '12×5', I: '20×3',
  // Archimedean
  tT: '4×3 4×6', aC: '8×3 6×4', tC: '8×3 6×8', tO: '6×4 8×6', eC: '8×3 18×4', bC: '12×4 8×6 6×8',
  sC: '32×3 6×4', aD: '20×3 12×5', tD: '20×3 12×10', tI: '12×5 20×6', eD: '20×3 30×4 12×5',
  bD: '30×4 20×6 12×10', sD: '80×3 12×5',
  // Catalan
  kT: '12×3', jC: '12×4', kO: '24×3', kC: '24×3', oC: '24×4', mC: '48×3', gC: '24×5',
  jD: '30×4', kD: '60×3', kI: '60×3', oD: '60×4', mD: '120×3', gD: '60×5',
  // more
  cD: '12×5 30×6', tkD: '12×5 80×6', pC: '30×4', cC: '6×4 12×6',
  P7: '7×4 2×7', A5: '10×3 2×5', Y6: '6×3 1×6', U5: '5×3 5×4 1×5 1×10',
  k4P5: '20×3 2×5', t3jC: '8×3 12×6',
  // Johnson
  J1: '4×3 1×4', J2: '5×3 1×5', J3: '4×3 3×4 1×6', J4: '4×3 5×4 1×8', J5: '5×3 5×4 1×5 1×10',
  J7: '4×3 3×4', J8: '4×3 5×4', J9: '5×3 5×4 1×5', J10: '12×3 1×4', J11: '15×3 1×5',
  J12: '6×3', J13: '10×3', J14: '6×3 3×4', J15: '8×3 4×4', J16: '10×3 5×4', J17: '16×3',
  J18: '4×3 9×4 1×6', J19: '4×3 13×4 1×8', J20: '5×3 15×4 1×5 1×10',
  J22: '16×3 3×4 1×6', J23: '20×3 5×4 1×8', J24: '25×3 5×4 1×5 1×10',
  J27: '8×3 6×4', J28: '8×3 10×4', J29: '8×3 10×4', J30: '10×3 10×4 2×5', J31: '10×3 10×4 2×5',
  J35: '8×3 12×4', J36: '8×3 12×4', J37: '8×3 18×4', J38: '10×3 20×4 2×5', J39: '10×3 20×4 2×5',
  J44: '20×3 6×4', J45: '24×3 10×4', J46: '30×3 10×4 2×5',
};

for (const [text, want] of Object.entries(KNOWN)) {
  const { P } = make(text);
  const bad = check(P);
  expect(!bad, `${text}: ${bad}`);
  expect(census(P) === want, `${text}: faces ${census(P)}, expected ${want}`);
}

// the size estimate is exact for operators without a degree, and an upper bound otherwise
for (const text of [...randomStrings(200), 'tttC', 'gpD', 'ccD', 'pkA5', 'dkdkD']) {
  const { P, counts, selective } = make(text);
  const bad = check(P);
  expect(!bad, `${text}: ${bad}`);
  const got = [P.nv, P.ne, P.nf];
  if (selective) expect(got.every((x, i) => x <= counts[i]), `${text}: ${got} exceeds estimate ${counts}`);
  else expect(got.every((x, i) => x === counts[i]), `${text}: ${got}, estimated ${counts}`);
}

// d and r are involutions on the faces
for (const s of ['C', 'tI', 'gpD', 'J45']) {
  expect(census(make('dd' + s).P) === census(make(s).P), `dd${s} ≠ ${s}`);
  expect(census(make('rr' + s).P) === census(make(s).P), `rr${s} ≠ ${s}`);
}

finish('topology');
