// Builds a polyhedron off the main thread, then runs optimizers on it, each from wherever the
// previous one left the vertices. One shape per worker: the page terminates the worker and starts
// a new one when the notation changes.
//
// in:  { type: 'build', text, maxEdges, steps }    build, then run the steps in order
//      { type: 'run', step }                       stop what is running, run this from here
//      { type: 'stop' }                            stop what is running
// A step is { id, opt, regularity, flags, seed, it }: opt is one of OPTIMIZERS or an init, 'built'
// (back to the positions as built) or 'random' (random positions from seed); flags are the
// adjustments of frame.js; with it, the run stops after that many rounds, so a step that was
// stopped part-way can be replayed exactly.
//
// out: { type: 'stage', text }                      what it is doing
//      { type: 'mesh', fv, fo, ftags, ... }         the faces, once
//      { type: 'symmetry', group, order, faceOrbit, nFaceOrbits }
//      { type: 'start', id }                        a step starts
//      { type: 'pos', pos, it, err, moved }         positions as the step moves them, repeatedly
//      { type: 'done', id, it, err, stopped }       a step finished, or was stopped after it rounds
//      { type: 'error', message }

import { describe } from './notation.js';
import { check, faceCensus, topology } from './mesh.js';
import { flatten } from './canonical.js';
import { build, Realization } from './pipeline.js';
import { automorphisms, fitMatrices, pointGroup } from './symmetry.js';
import { randomPositions } from './frame.js';

const FRAME_MS = 40;

const post = (m, t) => self.postMessage(m, t || []);
const sendPos = (P, extra) => { const pos = Float32Array.from(P.pos); post({ type: 'pos', pos, ...extra }, [pos.buffer]); };

let P = null, flat = null, maps = null, built = null, text = '', raw = null;
// a random start has no symmetry, so the optimizers stop keeping it until the next 'built'
let symmetric = true;
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
    post({ type: 'start', id: step.id });
    if (step.opt === 'built' || step.opt === 'random') {
      if (step.opt === 'built') P.pos.set(built); else randomPositions(P.pos, step.seed);
      symmetric = step.opt === 'built';
      sendPos(P, { it: 0, err: null, moved: 0 });
      post({ type: 'done', id: step.id, it: 0, err: null, stopped: false });
      continue;
    }
    // the readable optimizer may need the operators' construction without relaxation
    if (step.opt === 'readable' && !raw) raw = build(text, { relax: false }).P.pos;
    const R = new Realization(P, flat, step.opt, { regularity: step.regularity, flags: step.flags, maps: symmetric ? maps : null, rawPos: raw });
    const limit = step.it ?? Infinity;
    let stopped = false;
    while (!R.done && R.it < limit) {
      const t0 = performance.now();
      while (performance.now() - t0 < FRAME_MS && !R.done && R.it < limit) R.step();
      sendPos(P, { it: R.it, err: R.err, moved: R.moved });
      // let the message go out, and any new request in, before the next stretch
      await new Promise(r => setTimeout(r, 0));
      if (interrupt) { interrupt = false; stopped = true; break; }
    }
    post({ type: 'done', id: step.id, it: R.it, err: R.R.error(), stopped });
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
  try {
    let parsed;
    text = m.text;
    ({ P, parsed } = build(m.text, { maxEdges: m.maxEdges, onStage: s => post({ type: 'stage', text: s }) }));
    const bad = check(P);
    if (bad) throw new Error('the result is not a polyhedron: ' + bad);
    built = Float64Array.from(P.pos);

    flat = flatten(P);
    post({
      type: 'mesh', fv: flat.fv, fo: flat.fo, edges: flat.edges, ftags: P.ftags, ntags: P.ntags,
      nv: P.nv, ne: P.ne, nf: P.nf, census: faceCensus(P), desc: describe(parsed),
      pos: Float32Array.from(P.pos),
    });

    // The operators and the canonical relaxation keep symmetric shapes symmetric, so the matrices
    // fitted to the shape as built are good enough to name the group.
    post({ type: 'stage', text: 'symmetries' });
    const sym = automorphisms(P, topology(P));
    maps = sym.maps;
    const group = pointGroup(fitMatrices(P.pos, sym.maps).Rs);
    post({ type: 'symmetry', group, order: sym.maps.length, faceOrbit: sym.faceOrbit, nFaceOrbits: sym.nFaceOrbits });
  } catch (err) {
    post({ type: 'error', message: err.message });
    return;
  }
  request(m.steps);
};
