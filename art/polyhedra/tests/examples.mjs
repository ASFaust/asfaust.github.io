// Replays every example of the menu (js/examples.js) as the page does, and checks the numbers
// docs/catalogue.md gives for it (and that it does not pass through itself), so that a change to the optimizers or to the chain format that
// would change an old link shows up. Slow: a few minutes, most of it in the near misses.
// node tests/examples.mjs [--print] [name filter]

import { Session } from '../js/pipeline.js';
import { parseSteps, message } from '../js/chain.js';
import { EXAMPLES } from '../js/examples.js';
import { metrics, expect, finish } from './lib.mjs';

// faces, inward faces and reflex edges, from the catalogue
const EXPECTED = {
  'n=scnC&m=regular,flat': [434, 120, 312],
  'n=jtJ37&m=regular,flat': [144, 16, 96],
  'n=csJ45&m=regular,flat': [450, 0, 560],
  'n=oD&m=regular,flat': [60, null, 60],
  'n=okzD&m=regular,flat&e=0.2': [540, null, 180],
  'n=jcaJ29&m=regular,flat&e=0.2': [256, null, 128],
  'n=ocI&m=regular/w,flat/w&e=0.2': [240, null, 120],
  'n=jJ46&m=regular,flat&e=0.2': [70, null, 70],
  'n=josJ37&m=regular,flat&e=0.2': [960, null, 1152],
  'n=okA7&m=regular,flat': [168, null, 126],
  'n=pU5&m=regular/w,flat/w': [62, 10, 60],
  'n=ogdJ37&m=regular/w,flat/w&h=79&e=0.15&ink=dark&fov=19': [480, null, 336],
  'n=decY5&m=mean/w,regular/w,flat/w': [80, null, 30],
  'n=caU5&m=regular/w,affine/w,regular/w,flat/w&c=orbit&pal=earth&h=79&e=0.45&ink=dark&fov=19': [77, null, 105],
  'n=ebC&m=regular/w': [146, 0, 96],
  'n=knJ17&m=regular': [144, 8, 72],
  'n=dosmA5&m=regular': [1202, 0, 919],
  'n=dosmA5&m=regular/w&e=0.2': [null, 160, 980],
  'n=dosmA5&m=regular/w,regular&e=0.2': [null, null, 1080],
  'n=ontJ17&m=regular/w,affine/w': [432, null, 288],
  'n=ozJ45&m=affine': [null, null, 240],
  'n=peC&m=affine/w': [122, null, 0],
  'n=caI&m=affine/w': [92, null, 120],
  'n=jpD&m=affine/w': [150, null, 60],
  'n=ocA6&m=spectral:1,flat': [192, null, 228],
  'n=okD&m=spectral:1,flat': [180, null, 180],
  'n=anzD&m=flat&e=0.2': [272, null, null],
};

const args = process.argv.slice(2), print = args.includes('--print'), filter = args.find(a => !a.startsWith('--'));
const NAMES = ['faces', 'inward', 'reflex'];
// none of the owner's shapes passes through itself (X1, 2026-10-23)
for (const [, list] of EXAMPLES) {
  for (const [name, link] of list) {
    if (filter && !name.includes(filter) && !link.includes(filter)) continue;
    const q = Object.fromEntries(link.split('&').map(kv => kv.split('=').map(decodeURIComponent)));
    const t0 = performance.now();
    const S = new Session(q.n);
    S.symmetries();
    const rounds = parseSteps(q.m || 'canonical').map(t => S.run(message(t))?.it ?? 0);
    const m = metrics(S.P), got = [S.P.nf, m.inward, m.reflex];
    if (print) console.log(`${name.padEnd(28)} ${link.split('&').slice(0, 2).join('&').padEnd(44)} faces ${got[0]}, inward ${got[1]}, reflex ${got[2]}, selfX ${m.selfX}, planar ${m.planarMax.toExponential(1)}, rounds ${rounds.join('+')}, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    const want = EXPECTED[link];
    if (want) want.forEach((w, i) => expect(w === null || w === got[i], `${name} (${link}): ${NAMES[i]} ${got[i]}, catalogue ${w}`));
    expect(m.selfX === 0, `${name} (${link}): ${m.selfX} pairs of faces pass through each other`);
  }
}
finish('examples');
