// The chain of steps in the URL ("m=regular/w,flat/w"): reading it, writing it, and the message
// that runs a step in the worker. Shared by the page and the tests, so a test replays a link
// exactly as the page does.

import { OPTIMIZERS } from './pipeline.js';
import { TARGETS } from './faces.js';
import { MATRICES } from './spectral.js';

export const NUM = (v, lo, hi, d) => (isFinite(+v) && v !== '' && v !== null && v !== undefined ? Math.min(hi, Math.max(lo, +v)) : d);
export const ONE = (v, list, d) => (list.includes(v) ? v : d);

// The chain of steps applied since the shape was built, in the URL as
// "random:83121,affine/w,shake:5120,regular:0.8/wa@340": a random start with its seed (or
// "spectral:3", the third spectral start, "spectral:3:facemean" from another matrix than the
// adjacency), then optimizers and shakes, each with its regularity (star, stellate: its
// pointedness; shake: its seed) after a colon, its switches after a slash (w whiten, a without
// the symmetry; c centre, o orthogonalise, n normalise in old links) and after an at sign the round
// at which it was stopped, so that the chain replays to exactly the same shape. A mix lists its
// weights: "mix:regular=1+flat=0.5+pt=0.25/w", pt the pointedness when star or stellate is in it.
// "built" is the empty chain: the shape as built.
export const POINTED = ['star', 'stellate'];
export const weightsText = t => TARGETS.filter(k => t.weights[k] > 0).map(k => k + '=' + t.weights[k]).join('+')
  + (POINTED.some(k => t.weights[k] > 0) && t.pointedness !== 0.3 ? '+pt=' + t.pointedness : '');
export function stepsText(steps) {
  if (!steps.length) return 'built';
  return steps.map(t => t.opt + (t.opt === 'random' || t.opt === 'shake' ? ':' + t.seed : t.opt === 'spectral' ? ':' + t.index + (t.matrix && t.matrix !== 'adjacency' ? ':' + t.matrix : '')
    : t.opt === 'mix' ? ':' + weightsText(t)
    : t.opt === 'regular' && t.regularity !== 1 ? ':' + t.regularity : POINTED.includes(t.opt) && t.pointedness !== 0.3 ? ':' + t.pointedness : '')
    + (t.flags ? '/' + t.flags : '') + (t.it !== undefined ? '@' + t.it : '')).join(',');
}

// Also reads the old single modes: faces (with its regularity rg), planar, raw.
const OLD = { faces: 'regular', planar: 'flat' };
export function parseSteps(text, rg) {
  const steps = [];
  for (const tok of text.split(',')) {
    const x = tok.match(/^mix:([a-z]+=[\d.]+(?:\+[a-z]+=[\d.]+)*)(?:\/([conwa]+))?(?:@(\d+))?$/);
    if (x) {
      const step = { opt: 'mix', weights: {}, pointedness: 0.3 };
      for (const kv of x[1].split('+')) {
        const [k, v] = kv.split('=');
        if (k === 'pt') step.pointedness = NUM(v, 0, 0.5, 0.3);
        else if (TARGETS.includes(k) && +v > 0) step.weights[k] = NUM(v, 0, 1, 1);
      }
      if (!Object.keys(step.weights).length) continue;
      if (x[2]) step.flags = flagsText(x[2]);
      if (x[3] !== undefined) step.it = +x[3];
      steps.push(step);
      continue;
    }
    const m = tok.match(/^([a-z]+)(?::([\d.]+))?(?::([a-z]+))?(?:\/([conwa]+))?(?:@(\d+))?$/);
    if (!m) continue;
    if (m[1] === 'built' || m[1] === 'raw') { steps.length = 0; continue; }
    if (m[1] === 'random') { steps.length = 0; steps.push({ opt: 'random', seed: Math.floor(+m[2]) || 1 }); continue; }
    if (m[1] === 'spectral') { steps.length = 0; steps.push({ opt: 'spectral', index: Math.floor(+m[2]) || 1, matrix: ONE(m[3], MATRICES, 'adjacency') }); continue; }
    const opt = OLD[m[1]] || m[1];
    if (opt === 'shake') { steps.push({ opt, seed: Math.floor(+m[2]) || 1, ...(m[4] ? { flags: flagsText(m[4]) } : {}) }); continue; }
    if (!OPTIMIZERS.includes(opt) || opt === 'mix') continue;
    // the old faces mode started from a canonical shape
    if (m[1] === 'faces') steps.push({ opt: 'canonical' });
    const step = { opt };
    if (opt === 'regular') step.regularity = NUM(m[2] ?? (m[1] === 'faces' ? rg : undefined), 0, 1, 1);
    if (POINTED.includes(opt)) step.pointedness = NUM(m[2], 0, 0.5, 0.3);
    if (m[4]) step.flags = flagsText(m[4]);
    if (m[5] !== undefined) step.it = +m[5];
    steps.push(step);
  }
  return steps;
}

export const message = t => ({
  id: t.id, opt: t.opt, regularity: t.regularity ?? 1, pointedness: t.pointedness ?? 0.3, weights: t.weights, seed: t.seed, index: t.index, matrix: t.matrix, it: t.it,
  flags: { centre: !!t.flags?.includes('c'), orthogonalise: !!t.flags?.includes('o'), normalise: !!t.flags?.includes('n'), whiten: !!t.flags?.includes('w') },
  keep: !t.flags?.includes('a'),
});
// the switches as letters, in a fixed order, or undefined for none: w whiten, a without the
// symmetry (c, o, n: the adjustments of old links)
export const flagsText = s => [...'conwa'].filter(c => s.includes(c)).join('') || undefined;
