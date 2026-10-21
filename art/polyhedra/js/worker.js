// Builds and realizes a polyhedron off the main thread. One job per worker: the page terminates
// the worker and starts a new one when the notation changes.
//
// in:  { text, mode, regularity, stiffness, symmetric, maxEdges }
// out: { type: 'stage', text }                      what it is doing
//      { type: 'mesh', fv, fo, ftags, ... }         the faces, once
//      { type: 'symmetry', group, order, faceOrbit, nFaceOrbits }
//      { type: 'pos', pos, it, err, moved }         positions as the realization moves, repeatedly
//      { type: 'done', it, err }                    converged or gave up
//      { type: 'error', message }

import { describe } from './notation.js';
import { check, faceCensus, topology } from './mesh.js';
import { flatten } from './canonical.js';
import { build, Realization } from './pipeline.js';
import { automorphisms, fitMatrices, pointGroup } from './symmetry.js';

const FRAME_MS = 40;

const post = (m, t) => self.postMessage(m, t || []);

self.onmessage = async e => {
  const { text, mode, regularity, stiffness, symmetric, maxEdges } = e.data;
  try {
    const { P, parsed } = build(text, mode, { maxEdges, onStage: s => post({ type: 'stage', text: s }) });
    const bad = check(P);
    if (bad) throw new Error('the result is not a polyhedron: ' + bad);

    const flat = flatten(P);
    post({
      type: 'mesh', fv: flat.fv, fo: flat.fo, edges: flat.edges, ftags: P.ftags, ntags: P.ntags,
      nv: P.nv, ne: P.ne, nf: P.nf, census: faceCensus(P), desc: describe(parsed),
      pos: Float32Array.from(P.pos),
    });

    // The operators and the canonical relaxation keep symmetric shapes symmetric, so the matrices
    // fitted to the shape as built are good enough to name the group.
    post({ type: 'stage', text: 'symmetries' });
    const sym = automorphisms(P, topology(P));
    const group = pointGroup(fitMatrices(P.pos, sym.maps).Rs);
    post({ type: 'symmetry', group, order: sym.maps.length, faceOrbit: sym.faceOrbit, nFaceOrbits: sym.nFaceOrbits });

    if (mode === 'raw') { post({ type: 'done', it: 0, err: null }); return; }
    const R = new Realization(P, flat, mode, { regularity, stiffness, maps: symmetric ? sym.maps : null });
    while (!R.done) {
      const t0 = performance.now();
      while (performance.now() - t0 < FRAME_MS && !R.done) R.step();
      const pos = Float32Array.from(P.pos);
      post({ type: 'pos', pos, it: R.it, err: R.err, moved: R.moved }, [pos.buffer]);
      // let the message go out before the next stretch
      await new Promise(r => setTimeout(r, 0));
    }
    post({ type: 'done', it: R.it, err: R.R.error() });
  } catch (err) {
    post({ type: 'error', message: err.message });
  }
};
