// The optimizer machinery added for the owner's requests of 2026-10-22 (docs/user-experience.md):
// whitening, the shape distance, stellate, the mix, shake and pruning a chain for a link.
// node tests/optimizers.mjs

import { Session, prune, SAME_SHAPE } from '../js/pipeline.js';
import { whiten, shapeDistance, randomPositions } from '../js/frame.js';
import { fitMatrices, pointGroup, symmetrize } from '../js/symmetry.js';
import { density } from '../js/spectral.js';
import { metrics, expect, finish } from './lib.mjs';

// how far the shape is from symmetric under the automorphisms, relative to its size
function asymmetry(pos, maps) {
  const q = Float64Array.from(pos);
  symmetrize(q, maps);
  return shapeDistance(pos, q);
}

// Whitening gives equal, uncorrelated spreads, and commutes with rotations (so it keeps a symmetry).
{
  const p = new Float64Array(300);
  randomPositions(p, 3);
  for (let i = 0; i < p.length; i += 3) { p[i] *= 3; p[i + 1] += 0.5 * p[i]; }
  const a = Float64Array.from(p);
  whiten(a);
  const C = new Float64Array(9);
  for (let i = 0; i < a.length; i += 3) for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) C[3 * x + y] += a[i + x] * a[i + y];
  expect(Math.abs(C[1]) + Math.abs(C[2]) + Math.abs(C[5]) < 1e-9 * C[0] && Math.abs(C[0] - C[4]) < 1e-9 * C[0] && Math.abs(C[0] - C[8]) < 1e-9 * C[0], 'whiten: covariance not a multiple of I');
  const th = 0.7, c = Math.cos(th), s = Math.sin(th), b = Float64Array.from(p);
  for (let i = 0; i < b.length; i += 3) { const x = b[i], y = b[i + 1]; b[i] = 2 * (c * x - s * y) + 5; b[i + 1] = 2 * (s * x + c * y); b[i + 2] *= 2; }
  expect(shapeDistance(p, b) < 1e-6, 'shapeDistance: a moved, scaled, turned copy is not the same shape');
  whiten(b);
  expect(shapeDistance(a, b) < 1e-6, 'whiten does not commute with rotation');
  const m = Float64Array.from(p);
  for (let i = 0; i < m.length; i += 3) m[i] = -m[i];
  expect(shapeDistance(p, m) > 0.1, 'shapeDistance: a mirror image counts as the same shape');
}

// Face mean with whitening keeps the symmetry, on a shape not aligned with the axes.
{
  const S = new Session('tkD');
  S.symmetries();
  // turn it off the axes, where Gram–Schmidt would shear it
  const p = S.P.pos, c = Math.cos(0.5), s = Math.sin(0.5);
  for (let i = 0; i < p.length; i += 3) { const x = p[i], z = p[i + 2]; p[i] = c * x - s * z; p[i + 2] = s * x + c * z; }
  S.run({ opt: 'mean', flags: { whiten: true }, keep: false });
  expect(asymmetry(S.P.pos, S.maps) < 1e-6, `face mean with whiten broke the symmetry of tkD (${asymmetry(S.P.pos, S.maps).toExponential(1)})`);
}

// Stellate finds the great stellated dodecahedron and the great stellated truncated
// dodecahedron from the built shapes: flat faces, equal edges, the right density and group.
for (const [text, d] of [['D', 7], ['tD', 13], ['tI', 7]]) {
  const S = new Session(text);
  S.symmetries();
  S.run({ opt: 'stellate' });
  const m = metrics(S.P), dens = density(S.P.faces, S.P.pos);
  expect(Math.abs(dens - d) < 1e-3, `stellate ${text}: density ${dens.toFixed(3)}, expected ${d}`);
  expect(m.planarMax < 1e-5 && m.edgeRatio < 1.001, `stellate ${text}: planar ${m.planarMax.toExponential(1)}, edge ratio ${m.edgeRatio.toFixed(4)}`);
  expect(pointGroup(fitMatrices(S.P.pos, S.maps).Rs) === 'Ih', `stellate ${text}: not Ih`);
}

// A mix of regular α and flat 1 − α is the regular button at regularity α: the same copies.
{
  const run = step => { const S = new Session('tttC'); S.symmetries(); S.run({ opt: 'canonical' }); S.run(step); return S.P.pos; };
  const a = run({ opt: 'regular', regularity: 0.4 }), b = run({ opt: 'mix', weights: { regular: 0.4, flat: 0.6 } });
  expect(shapeDistance(a, b) < 1e-6, `mix regular 0.4 + flat 0.6 differs from regular 0.4 (${shapeDistance(a, b).toExponential(1)})`);
}

// Equal edges makes the edges equal (on its own it may bend faces).
{
  const S = new Session('tkD');
  S.symmetries();
  S.run({ opt: 'edges' });
  const m = metrics(S.P);
  expect(m.edgeRatio < 1.01, `equal edges on tkD: edge ratio ${m.edgeRatio.toFixed(3)}`);
}

// Shake keeps the symmetry when asked to, and breaks it when not.
{
  const S = new Session('tI');
  S.symmetries();
  S.run({ opt: 'shake', seed: 3 });
  expect(asymmetry(S.P.pos, S.maps) < 1e-9, 'shake with the symmetry kept broke it');
  S.run({ opt: 'shake', seed: 3, keep: false });
  expect(asymmetry(S.P.pos, S.maps) > 1e-3, 'shake without the symmetry kept it');
}

// Pruning: steps that later ones undo go, and the shorter chain gives the same shape.
{
  const steps = [{ opt: 'regular' }, { opt: 'mean', flags: { whiten: true } }, { opt: 'affine' }, { opt: 'regular' }, { opt: 'flat' }];
  steps.forEach((t, i) => { t.id = i + 1; });
  const S = new Session('tkD');
  S.symmetries();
  const keep = prune(S, steps);
  expect(keep.map(t => t.opt).join() === 'regular,flat', `prune tkD: kept ${keep.map(t => t.opt).join()}, expected regular,flat`);
  const run = list => { const T = new Session('tkD'); T.symmetries(); for (const t of list) T.run(t); return T.P.pos; };
  expect(shapeDistance(run(steps), run(keep)) < SAME_SHAPE, 'prune tkD: the shorter chain gives another shape');
}

finish('optimizers');
