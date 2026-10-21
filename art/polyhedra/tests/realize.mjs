// Benchmark of the realizations: how long they take and how good the result is.
// node tests/realize.mjs [--mode canonical|faces|planar] [--sym] [--random N] [--max-it N] [strings...]
//
// Columns: rounds and time of the final realization (after the build, which relaxes between
// operators), then the metrics of tests/lib.mjs: planarity (max, relative to the mean edge),
// faces pointing inward, reflex edges, longest/shortest edge, largest/smallest face.

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
console.log('string        edges  rounds      ms   planar  inward reflex  edge×   area×');
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
  console.log(`${s.padEnd(12)} ${String(P.ne).padStart(6)} ${String(R.it).padStart(7)} ${ms.toFixed(0).padStart(7)}  ${f(m.planarMax)} ${String(m.inward).padStart(7)} ${String(m.reflex).padStart(6)} ${m.edgeRatio.toFixed(1).padStart(6)} ${m.areaRatio.toFixed(1).padStart(7)}`);
}
console.log(`total ${(total / 1000).toFixed(1)} s`);
