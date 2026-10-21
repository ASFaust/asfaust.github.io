// The automorphism search finds the right groups, and the shapes are named correctly.
// node tests/symmetry.mjs

import { build } from '../js/pipeline.js';
import { topology } from '../js/mesh.js';
import { automorphisms, fitMatrices, pointGroup, symmetrize } from '../js/symmetry.js';
import { expect, finish } from './lib.mjs';

const KNOWN = {
  T: ['Td', 24], C: ['Oh', 48], O: ['Oh', 48], D: ['Ih', 120], I: ['Ih', 120],
  tT: ['Td', 24], tI: ['Ih', 120], sC: ['O', 24], sD: ['I', 60], gC: ['O', 24], pC: ['O', 24], gpD: ['I', 60],
  P4: ['Oh', 48], A3: ['Oh', 48], Y3: ['Td', 24],
  P5: ['D5h', 20], A5: ['D5d', 20], Y5: ['C5v', 10], U4: ['C4v', 8], P7: ['D7h', 28], A8: ['D8d', 32],
  J17: ['D4d', 16], J27: ['D3h', 12], J28: ['D4h', 16], J29: ['D4d', 16], J36: ['D3d', 12],
  J44: ['D3', 6], J45: ['D4', 8], J46: ['D5', 10],
  k4P5: ['D5h', 20], t3U3: ['C3v', 6], gP5: ['D5', 10], k4gP5: ['D5', 10],
  // the gyro'd square pyramid's graph has a symmetry swapping the apex end with the base end
  gY4: ['D4d', 16],
};

for (const [text, [group, order]] of Object.entries(KNOWN)) {
  const t0 = performance.now();
  const { P } = build(text, 'canonical');
  const sym = automorphisms(P, topology(P));
  const name = pointGroup(fitMatrices(P.pos, sym.maps).Rs);
  expect(sym.maps.length === order, `${text}: ${sym.maps.length} automorphisms, expected ${order}`);
  expect(name === group, `${text}: named ${name}, expected ${group}`);
  if (process.argv.includes('-v')) console.log(text.padEnd(6), name.padEnd(4), sym.maps.length, `${sym.nFaceOrbits} face orbits`, `${(performance.now() - t0).toFixed(0)}ms`);
}

// after symmetrizing a disturbed shape, every automorphism maps it exactly onto itself
for (const text of ['tI', 'gpD', 'J45']) {
  const { P } = build(text, 'canonical');
  const sym = automorphisms(P, topology(P));
  for (let i = 0; i < P.pos.length; i++) P.pos[i] += 1e-2 * Math.sin(17 * i);
  // the matrices are fitted to the disturbed shape, so each pass squares the error
  for (let k = 0; k < 3; k++) symmetrize(P.pos, sym.maps);
  const { Rs, centre } = fitMatrices(P.pos, sym.maps);
  let err = 0;
  sym.maps.forEach(({ v }, k) => {
    const R = Rs[k];
    for (let i = 0; i < v.length; i++) {
      const x = [0, 1, 2].map(a => P.pos[3 * i + a] - centre[a]);
      for (let a = 0; a < 3; a++) {
        const y = R[3 * a] * x[0] + R[3 * a + 1] * x[1] + R[3 * a + 2] * x[2];
        err = Math.max(err, Math.abs(y - (P.pos[3 * v[i] + a] - centre[a])));
      }
    }
  });
  expect(err < 1e-9, `symmetrize ${text}: still off by ${err}`);
  const name = pointGroup(Rs);
  const want = { tI: 'Ih', gpD: 'I', J45: 'D4' }[text];
  expect(name === want, `symmetrized ${text} named ${name}, expected ${want}`);
}

// a big one, for time
{
  const t0 = performance.now();
  const { P } = build('tkdkdkD', 'raw');
  const sym = automorphisms(P, topology(P));
  const ms = performance.now() - t0;
  expect(sym.maps.length === 120, `tkdkdkD: ${sym.maps.length} automorphisms`);
  console.log(`tkdkdkD: ${P.ne} edges, ${sym.maps.length} automorphisms, ${sym.nFaceOrbits} face orbits in ${ms.toFixed(0)}ms`);
}

finish('symmetry');
