// Benchmark of the realizations: how long they take and how good the result is.
// node tests/realize.mjs [--mode canonical|faces|planar] [--sym] [--random N] [--max-it N] [strings...]
//
// Columns: rounds and time of the final realization (after the build, which relaxes between
// operators), then the metrics of tests/lib.mjs: planarity (max, relative to the mean edge),
// faces pointing inward, reflex edges, longest/shortest edge, and balance: the worst longest/shortest
// edge within one face, the smallest corner turn relative to a regular face's, the least round face,
// largest/smallest face size against a regular polygon of its degree, and the slope of size
// against degree.

import { build, Realization } from '../js/pipeline.js';
import { flatten } from '../js/canonical.js';
import { topology } from '../js/mesh.js';
import { automorphisms } from '../js/symmetry.js';
import { metrics, randomStrings } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const mode = opt('--mode', 'canonical');
const random = +opt('--random', 0);
const maxIt = +opt('--max-it', 60000);
const sym = flag('--sym');
const regularity = +opt('--regularity', 1), stiffness = +opt('--stiffness', 2);
const LIST = ['tI', 'tttC', 'gpD', 'pgI', 'cccC', 'tktkI', 'dkdkdkdkI', 'tttttD', 'kkkD', 'jsdJ29', 'aoeU4'];
const strings = [...(args.length ? args : random ? [] : LIST), ...randomStrings(random)];

const f = (x, d = 1) => x.toExponential(d);
console.log(`mode ${mode}${sym ? ', symmetric' : ''}${mode === 'faces' ? `, regularity ${regularity}, stiffness ${stiffness}` : ''}`);
console.log('string        edges  rounds      ms   planar  inward reflex  edge×  fedge×  turn  round  size×  slope');
let total = 0;
for (const s of strings) {
  const { P } = build(s, mode);
  const maps = sym ? automorphisms(P, topology(P)).maps : null;
  const R = new Realization(P, flatten(P), mode, { regularity, stiffness, maps });
  const t0 = performance.now();
  while (!R.done && R.it < maxIt) R.step();
  const ms = performance.now() - t0;
  total += ms;
  const m = metrics(P);
  console.log(`${s.padEnd(12)} ${String(P.ne).padStart(6)} ${String(R.it).padStart(7)} ${ms.toFixed(0).padStart(7)}  ${f(m.planarMax)} ${String(m.inward).padStart(7)} ${String(m.reflex).padStart(6)} ${m.edgeRatio.toFixed(1).padStart(6)} ${m.faceEdgeMax.toFixed(1).padStart(7)} ${m.turnMin.toFixed(2).padStart(5)}   ${m.roundMin.toFixed(2)} ${m.sizeRatio.toFixed(1).padStart(6)} ${(isNaN(m.degreeSlope) ? '—' : m.degreeSlope.toFixed(2)).padStart(6)}`);
}
console.log(`total ${(total / 1000).toFixed(1)} s`);
