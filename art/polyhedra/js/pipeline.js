// From a string to a realized polyhedron: the steps the worker runs, kept apart from the worker so
// that the tests in ../tests run exactly the same thing.

import { parse, estimate } from './notation.js';
import { OPS } from './operators.js';
import { seed } from './seeds.js';
import { flatten, Realizer } from './canonical.js';
import { FaceRelaxer } from './faces.js';
import { Readable } from './readable.js';
import { symmetrize } from './symmetry.js';
import { adjust } from './frame.js';

// relaxing after each operator, so the next one starts from a good shape
export const STEP_TOL = 1e-3, STEP_MAX = 2000;
// an optimizer is done when faces are flat (and, for canonical, edges touch the sphere) to this
// tolerance, or, for the detached-faces ones, which need not reach a perfect shape, when nothing
// moves any more
export const TOL = 1e-6, STILL = 1e-8, MAX_IT = 60000;
// how often the symmetry is restored, in rounds
const SYM_EVERY = 10;

// The optimizers the page offers. Each starts from wherever the vertices are, so they can be used
// one after another. The inits put the vertices somewhere to start from.
export const OPTIMIZERS = ['canonical', 'readable', 'regular', 'affine', 'mean', 'flat'];
export const INITS = ['built', 'random'];
// the optimizers of faces.js: detached faces with a per-face target
const FACES = ['regular', 'affine', 'mean'];

// Parses and builds the polyhedron, relaxing canonically between operators (not after the last), so
// that each operator starts from a good shape: without it long strings start from degenerate
// geometry. relax: false leaves every vertex where the operators put it. Refuses, before doing the
// work, anything that would end up with more than maxEdges edges.
export function build(text, { maxEdges = Infinity, onStage, relax = true } = {}) {
  const p = parse(text);
  let P = seed(p.letter, p.n);
  const [, edges] = estimate([P.nv, P.ne, P.nf], p.ops);
  if (edges > maxEdges) throw new Error(`that would have up to ${edges.toLocaleString('en')} edges; the limit here is ${maxEdges.toLocaleString('en')}`);
  for (let i = 0; i < p.ops.length; i++) {
    const { op, n } = p.ops[i];
    if (onStage) onStage(`${OPS[op].name} (${i + 1} of ${p.ops.length})`);
    P = OPS[op].run(P, n);
    if (relax && i < p.ops.length - 1) relaxCanonical(P);
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

// One optimizer run on P in place, from its current positions, one round per step(). With maps
// (the automorphisms), regular and affine faces make the shape exactly symmetric every few rounds,
// which stops them drifting and makes them settle much sooner. Canonical and flat keep the symmetry
// by themselves, and averaging fights their momentum (2× slower); readable keeps its own.
export class Realization {
  // rawPos: the operators' construction without any relaxation, a possible start for readable;
  // flags: the adjustments of frame.js to apply after every round (not to readable, which keeps
  // its own variables)
  constructor(P, flat, opt, { regularity = 1, maps = null, rawPos = null, flags = null } = {}) {
    this.P = P;
    this.opt = opt;
    this.R = FACES.includes(opt) ? new FaceRelaxer(P.pos, flat, { target: opt, regularity })
      : opt === 'readable' ? new Readable(P, { maps, rawPos })
      : new Realizer(P.pos, flat, opt === 'flat' ? 'planar' : 'canonical');
    this.maps = maps && maps.length > 1 && FACES.includes(opt) ? maps : null;
    this.flags = opt === 'readable' || !flags || !(flags.centre || flags.orthogonalise || flags.normalise) ? null : flags;
    if (this.flags) this.old = new Float64Array(P.pos.length);
    this.it = 0;
    this.moved = Infinity;
    this.err = this.R.error();
  }
  step() {
    if (!this.flags) this.moved = this.R.step();
    else {
      // the adjustments move vertices too, and may fight the optimizer: count the whole round
      const p = this.P.pos, old = this.old;
      old.set(p);
      this.R.step();
      adjust(p, this.flags);
      let m = 0, r = 0;
      for (let i = 0; i < p.length; i += 3) {
        m = Math.max(m, Math.hypot(p[i] - old[i], p[i + 1] - old[i + 1], p[i + 2] - old[i + 2]));
        r = Math.max(r, Math.hypot(p[i], p[i + 1], p[i + 2]));
      }
      this.moved = m / (r || 1);
    }
    this.it++;
    if (this.maps && this.it % SYM_EVERY === 0) symmetrize(this.P.pos, this.maps);
    if (this.it % 50 === 0) this.err = this.R.error();
    return this.moved;
  }
  get done() {
    if (this.it >= MAX_IT) return true;
    if (FACES.includes(this.opt)) return this.moved < STILL;
    if (this.opt === 'readable' && this.R.supported) return this.R.finished;
    // with adjustments, canonical and flat may never reach their tolerance; they also stop when still
    if (this.flags && this.moved < STILL) return true;
    if (this.it % 50 !== 0) return false;
    return this.err.planar < TOL && this.err.tangent < TOL;
  }
}
