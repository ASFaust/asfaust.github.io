// Benchmark of the realizations: how long they take and how good the result is.
// node tests/realize.mjs [--mode chain] [--sym] [--flags con] [--random N] [--max-it N] [--regularity x] [--pointedness t] [strings...]
//
// The chain is optimizers run one after another from the shape as built, as the page's buttons do:
// canonical, readable, regular, star, affine, mean, flat, comma-separated (default canonical);
// "random" puts the vertices at random points (seed 1) and drops the symmetry from there on;
// "spectral:i" puts them at the i-th spectral start (js/spectral.js) and keeps the symmetry,
// "spectral:i:facemean" the same from another matrix. --sym keeps the
// symmetry in regular and affine faces (the page always does). --flags applies the page's
// per-round adjustments to every optimizer step: c centre, o orthogonalise, n normalise.
//
// Columns: rounds and time of the last step (after the build, which relaxes between operators,
// and the earlier steps, which are not timed), then the metrics of tests/lib.mjs: planarity (max, relative to the mean edge),
// faces pointing inward, reflex edges, reflex corners (faces turning the wrong way), longest/shortest edge, and balance: the worst longest/shortest
// edge within one face, the smallest corner turn relative to a regular face's, the least round face,
// largest/smallest face size against a regular polygon of its degree, and the slope of size
// against degree.

import { build, Realization } from '../js/pipeline.js';
import { flatten } from '../js/canonical.js';
import { topology } from '../js/mesh.js';
import { automorphisms } from '../js/symmetry.js';
import { metrics, randomStrings } from './lib.mjs';
import { randomPositions } from '../js/frame.js';
import { spectralStarts } from '../js/spectral.js';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const mode = opt('--mode', 'canonical');
const random = +opt('--random', 0);
const maxIt = +opt('--max-it', 60000);
const sym = flag('--sym');
const regularity = +opt('--regularity', 1);
const pointedness = +opt('--pointedness', 0.3);
const fl = opt('--flags', '');
const flags = { centre: fl.includes('c'), orthogonalise: fl.includes('o'), normalise: fl.includes('n') };
const chain = mode.split(',');
const LIST = ['tI', 'tttC', 'gpD', 'pgI', 'cccC', 'tktkI', 'dkdkdkdkI', 'tttttD', 'kkkD', 'jsdJ29', 'aoeU4'];
const strings = [...(args.length ? args : random ? [] : LIST), ...randomStrings(random)];

const f = (x, d = 1) => x.toExponential(d);
console.log(`steps ${chain.join(' → ')}${sym ? ', symmetric' : ''}${chain.includes('regular') ? `, regularity ${regularity}` : ''}`);
console.log('string        edges  rounds      ms   planar  inward reflex corner  edge×  fedge×  turn  round  size×  slope');
let total = 0;
for (const s of strings) {
  const { P } = build(s);
  // the readable optimizer always keeps the symmetry
  const maps = sym || chain.includes('readable') ? automorphisms(P, topology(P)).maps : null;
  let R, ms, symmetric = true;
  for (const o of chain) {
    if (o === 'random') { randomPositions(P.pos, 1); symmetric = false; continue; }
    if (o.startsWith('spectral')) {
      const [, idx, kind] = o.split(':');
      const starts = spectralStarts(P, maps || automorphisms(P, topology(P)).maps, kind || 'adjacency'), i = (+idx || 1) - 1;
      if (starts[i]) P.pos.set(starts[i].pos);
      symmetric = true;
      continue;
    }
    const rawPos = o === 'readable' ? build(s, { relax: false }).P.pos : null;
    R = new Realization(P, flatten(P), o, { regularity, pointedness, rawPos, flags, maps: symmetric && (sym || o === 'readable') ? maps : null });
    const t0 = performance.now();
    while (!R.done && R.it < maxIt) R.step();
    ms = performance.now() - t0;
  }
  total += ms;
  const m = metrics(P);
  console.log(`${s.padEnd(12)} ${String(P.ne).padStart(6)} ${String(R.it).padStart(7)} ${ms.toFixed(0).padStart(7)}  ${f(m.planarMax)} ${String(m.inward).padStart(7)} ${String(m.reflex).padStart(6)} ${String(m.reflexCorners).padStart(6)} ${m.edgeRatio.toFixed(1).padStart(6)} ${m.faceEdgeMax.toFixed(1).padStart(7)} ${m.turnMin.toFixed(2).padStart(5)}   ${m.roundMin.toFixed(2)} ${m.sizeRatio.toFixed(1).padStart(6)} ${(isNaN(m.degreeSlope) ? '—' : m.degreeSlope.toFixed(2)).padStart(6)}`);
}
console.log(`total ${(total / 1000).toFixed(1)} s`);
