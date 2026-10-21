// From a string to a realized polyhedron: the steps the worker runs, kept apart from the worker so
// that the tests in ../tests run exactly the same thing.

import { parse, estimate } from './notation.js';
import { OPS } from './operators.js';
import { seed } from './seeds.js';
import { flatten, Realizer } from './canonical.js';
import { FaceRelaxer } from './faces.js';
import { symmetrize } from './symmetry.js';

// relaxing after each operator, so the next one starts from a good shape
export const STEP_TOL = 1e-3, STEP_MAX = 2000;
// the final realization: until faces are flat and edges touch the sphere to this tolerance, or
// (detached faces, which need not reach a perfect shape) until nothing moves any more
export const TOL = 1e-6, STILL = 1e-8, MAX_IT = 60000;
// how often the symmetry is restored, in rounds
const SYM_EVERY = 10;

export const MODES = ['canonical', 'faces', 'planar', 'raw'];

// Parses and builds the polyhedron, relaxing between operators as the mode needs. Refuses, before
// doing the work, anything that would end up with more than maxEdges edges.
export function build(text, mode, { maxEdges = Infinity, onStage } = {}) {
  const p = parse(text);
  let P = seed(p.letter, p.n);
  const [, edges] = estimate([P.nv, P.ne, P.nf], p.ops);
  if (edges > maxEdges) throw new Error(`that would have up to ${edges.toLocaleString('en')} edges; the limit here is ${maxEdges.toLocaleString('en')}`);
  for (let i = 0; i < p.ops.length; i++) {
    const { op, n } = p.ops[i];
    if (onStage) onStage(`${OPS[op].name} (${i + 1} of ${p.ops.length})`);
    P = OPS[op].run(P, n);
    // detached faces starts from a canonical shape too
    if ((mode === 'canonical' && i < p.ops.length - 1) || mode === 'faces') relaxCanonical(P);
  }
  return { P, parsed: p };
}

export function relaxCanonical(P, tol = STEP_TOL, max = STEP_MAX) {
  const R = new Realizer(P.pos, flatten(P), 'canonical');
  for (let it = 0; it < max; it++) {
    R.step();
    if (it % 50 === 49) { const err = R.error(); if (err.planar < tol && err.tangent < tol) break; }
  }
}

// The final realization of P in place, one round per step(). With maps (the automorphisms) the
// shape is made exactly symmetric every few rounds, which also stops it drifting.
export class Realization {
  constructor(P, flat, mode, { regularity = 1, stiffness = 2, maps = null } = {}) {
    this.P = P;
    this.mode = mode;
    this.R = mode === 'faces' ? new FaceRelaxer(P.pos, flat, { regularity, stiffness }) : new Realizer(P.pos, flat, mode);
    this.maps = maps && maps.length > 1 ? maps : null;
    this.it = 0;
    this.moved = Infinity;
    this.err = this.R.error();
  }
  step() {
    this.moved = this.R.step();
    this.it++;
    if (this.maps && this.it % SYM_EVERY === 0) symmetrize(this.P.pos, this.maps);
    if (this.it % 50 === 0) this.err = this.R.error();
    return this.moved;
  }
  get done() {
    if (this.it >= MAX_IT) return true;
    if (this.mode === 'faces') return this.moved < STILL;
    if (this.it % 50 !== 0) return false;
    return this.err.planar < TOL && this.err.tangent < TOL;
  }
}
