// Builds a polyhedron off the main thread, then runs optimizers on it, each from wherever the
// previous one left the vertices. One shape per worker: the page terminates the worker and starts
// a new one when the notation changes. The page starts a second one, for a moment, to tidy the
// chain for a link.
//
// in:  { type: 'build', text, maxEdges, steps }    build, then run the steps in order
//      { type: 'run', step }                       stop what is running, run this from here
//      { type: 'stop' }                            stop what is running
//      { type: 'goto', id }                        stop what is running, go back to the shape
//                                                  after step id (0: as built)
//      { type: 'prune', text, maxEdges, steps }    find a shorter chain giving the same shape
// A step is { id, opt, regularity, pointedness, weights, flags, keep, seed, index, matrix, it }:
// opt is one of OPTIMIZERS, 'shake' (move the vertices a little, from seed) or an init, 'built'
// (back to the positions as built), 'random' (random positions from seed) or 'spectral' (the
// index-th spectral start, from 1, of the matrix named by matrix); flags are the adjustments of
// frame.js; keep: false runs it without the symmetry; weights are a mix's; with it, the run stops
// after that many rounds, so a step that was stopped part-way can be replayed exactly.
//
// out: { type: 'stage', text }                      what it is doing
//      { type: 'mesh', fv, fo, ftags, ... }         the faces, once
//      { type: 'symmetry', group, order, faceOrbit, nFaceOrbits, views }
//      { type: 'start', id }                        a step starts
//      { type: 'pos', pos, it, err, moved }         positions as the step moves them, repeatedly
//      { type: 'done', id, it, err, stopped }       a step finished, or was stopped after it rounds;
//                                                   stellate adds density;
//                                                   a spectral init adds spectral: { index, count,
//                                                   values, dims, density, group } or { tooBig }
//      { type: 'restored', id }                     back at the shape after step id
//      { type: 'pruned', keep, tries }              the ids of the steps a shorter chain keeps
//      { type: 'error', message }

import { describe } from './notation.js';
import { faceCensus } from './mesh.js';
import { Session, INSTANT, prune } from './pipeline.js';
import { fitMatrices, pointGroup, views } from './symmetry.js';
import { density } from './spectral.js';

const FRAME_MS = 40;

const post = (m, t) => self.postMessage(m, t || []);
const sendPos = (P, extra) => { const pos = Float32Array.from(P.pos); post({ type: 'pos', pos, ...extra }, [pos.buffer]); };

let S = null;
// the state after each step, by id, so that the page can go back to it at once; 0 is as built
let states = new Map();
let queue = [], busy = false, interrupt = false;

// Runs the queued steps one after another. A message arriving in between frames sets interrupt and
// replaces the queue; the running step then reports how far it got.
async function drive() {
  if (busy) return;
  busy = true;
  try { await runQueue(); } catch (err) { queue = []; post({ type: 'error', message: err.message }); }
  busy = false;
}

async function runQueue() {
  while (queue.length) {
    const step = queue.shift();
    if (step.opt === 'goto') {
      const s = states.get(step.id);
      if (s) { S.restore(s); sendPos(S.P, { it: 0, err: null, moved: 0 }); }
      post({ type: 'restored', id: step.id });
      continue;
    }
    post({ type: 'start', id: step.id });
    if (INSTANT.includes(step.opt)) {
      // an init starts a new chain; the old one's states are no use any more
      if (step.opt !== 'shake') states = new Map([[0, states.get(0)]]);
      const extra = S.instant(step, text => post({ type: 'stage', text }));
      states.set(step.id, S.state());
      sendPos(S.P, { it: 0, err: null, moved: 0 });
      post({ type: 'done', id: step.id, it: 0, err: null, stopped: false, ...extra });
      continue;
    }
    const R = S.realization(step);
    const limit = step.it ?? Infinity;
    let stopped = false;
    while (!R.done && R.it < limit) {
      const t0 = performance.now();
      while (performance.now() - t0 < FRAME_MS && !R.done && R.it < limit) R.step();
      sendPos(S.P, { it: R.it, err: R.err, moved: R.moved });
      // let the message go out, and any new request in, before the next stretch
      await new Promise(r => setTimeout(r, 0));
      if (interrupt) { interrupt = false; stopped = true; break; }
    }
    states.set(step.id, S.state());
    // stellate reports how often the result winds round its centre, which tells a stellation
    post({ type: 'done', id: step.id, it: R.it, err: R.R.error(), stopped, ...(step.opt === 'stellate' ? { density: density(S.P.faces, S.P.pos) } : {}) });
  }
}

function request(list) {
  if (busy) interrupt = true;
  queue = list;
  drive();
}

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'run') return request([m.step]);
  if (m.type === 'stop') return request([]);
  if (m.type === 'goto') return request([{ opt: 'goto', id: m.id }]);
  if (m.type === 'prune') {
    try {
      const T = new Session(m.text, { maxEdges: m.maxEdges });
      T.symmetries();
      const keep = prune(T, m.steps, tries => post({ type: 'stage', text: `trying chain ${tries}` }));
      post({ type: 'pruned', keep: keep.map(t => t.id) });
    } catch (err) {
      post({ type: 'error', message: err.message });
    }
    return;
  }
  try {
    S = new Session(m.text, { maxEdges: m.maxEdges, onStage: s => post({ type: 'stage', text: s }) });
    const { P, flat } = S;
    states = new Map([[0, S.state()]]);
    post({
      type: 'mesh', fv: flat.fv, fo: flat.fo, edges: flat.edges, ftags: P.ftags, ntags: P.ntags,
      nv: P.nv, ne: P.ne, nf: P.nf, census: faceCensus(P), desc: describe(S.parsed),
      pos: Float32Array.from(P.pos),
    });
    post({ type: 'stage', text: 'symmetries' });
    const sym = S.symmetries();
    const group = pointGroup(fitMatrices(P.pos, sym.maps).Rs);
    post({ type: 'symmetry', group, order: sym.maps.length, faceOrbit: sym.faceOrbit, nFaceOrbits: sym.nFaceOrbits, views: views(P, sym.maps, sym.faceOrbit) });
  } catch (err) {
    post({ type: 'error', message: err.message });
    return;
  }
  request(m.steps);
};
