// From a string to a realized polyhedron: the steps the worker runs, kept apart from the worker so
// that the tests in ../tests run exactly the same thing.

import { parse, estimate } from './notation.js';
import { OPS } from './operators.js';
import { seed } from './seeds.js';
import { flatten, Realizer } from './canonical.js';
import { FaceRelaxer } from './faces.js';
import { Readable } from './readable.js';
import { automorphisms, symmetrize, fitMatrices, subgroup, project, pointGroup } from './symmetry.js';
import { check, topology } from './mesh.js';
import { adjust, whiten, randomPositions, shake, shapeDistance } from './frame.js';
import { spectralStarts, density, SPECTRAL_MAX } from './spectral.js';

// relaxing after each operator, so the next one starts from a good shape
export const STEP_TOL = 1e-3, STEP_MAX = 2000;
// an optimizer is done when faces are flat (and, for canonical, edges touch the sphere) to this
// tolerance, or, for the detached-faces ones, which need not reach a perfect shape, when nothing
// moves any more
export const TOL = 1e-6, STILL = 1e-8, MAX_IT = 60000;
// how often the symmetry is restored, in rounds
const SYM_EVERY = 10;

// The optimizers the page offers. Each starts from wherever the vertices are, so they can be used
// one after another. The inits put the vertices somewhere to start from; shake moves them a little
// from where they are. Inits and shake take no rounds.
export const OPTIMIZERS = ['canonical', 'readable', 'regular', 'star', 'affine', 'mean', 'flat', 'stellate', 'edges', 'mix'];
// symmetric: random points made symmetric under a subgroup (O1), which the optimizers then keep
export const INITS = ['built', 'random', 'symmetric', 'spectral'];
export const INSTANT = [...INITS, 'shake'];
// the optimizers of faces.js: detached faces (and edges) with targets
const FACES = ['regular', 'star', 'affine', 'mean', 'stellate', 'edges', 'mix'];
// Stellate starts from the current shape shaken by this much (in mean edge lengths), from a fixed
// seed: an exactly convex face has nothing of a star in it, so without the shake nothing happens.
const STELLATE_SHAKE = 0.1, STELLATE_SEED = 1;

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
// (the automorphisms), the optimizers of faces.js make the shape exactly symmetric every few rounds,
// which stops them drifting and makes them settle much sooner. Canonical and flat keep the symmetry
// by themselves, and averaging fights their momentum (2× slower); readable keeps its own.
export class Realization {
  // rawPos: the operators' construction without any relaxation, a possible start for readable;
  // flags: the adjustment of frame.js to apply after every round, whiten, or the old centre,
  // orthogonalise and normalise (not to readable, which keeps its own variables); weights: the
  // targets of a mix
  constructor(P, flat, opt, { regularity = 1, pointedness = 0.3, weights = null, maps = null, rawPos = null, flags = null } = {}) {
    this.P = P;
    this.opt = opt;
    if (opt === 'stellate') {
      // Linear, so it needs whitening, and it leaves the start's symmetry: the stellation shows the
      // automorphisms by other matrices than the convex shape, so averaging with the convex ones
      // would pull it back. Where the strongest eigenspace is a single irreducible one (D, tD, tI)
      // the result is exactly symmetric anyway.
      flags = { whiten: true };
      maps = null;
      shake(P.pos, flat.edges, STELLATE_SEED, STELLATE_SHAKE);
      this.faces = P.faces;
    }
    this.R = FACES.includes(opt) ? new FaceRelaxer(P.pos, flat, {
      target: opt, regularity, pointedness, weights: opt === 'mix' ? weights : opt === 'edges' ? { edges: 1 } : null,
    })
      : opt === 'readable' ? new Readable(P, { maps, rawPos })
      : new Realizer(P.pos, flat, opt === 'flat' ? 'planar' : 'canonical');
    this.maps = maps && maps.length > 1 && FACES.includes(opt) ? maps : null;
    this.flags = opt === 'readable' || !flags || !(flags.centre || flags.orthogonalise || flags.normalise || flags.whiten) ? null : flags;
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
      if (this.flags.whiten) whiten(p); else adjust(p, this.flags);
      let m = 0, r = 0;
      for (let i = 0; i < p.length; i += 3) {
        m = Math.max(m, Math.hypot(p[i] - old[i], p[i + 1] - old[i + 1], p[i + 2] - old[i + 2]));
        r = Math.max(r, Math.hypot(p[i], p[i + 1], p[i + 2]));
      }
      this.moved = m / (r || 1);
    }
    this.it++;
    if (this.maps && this.it % SYM_EVERY === 0) symmetrize(this.P.pos, this.maps);
    if (this.it % 50 === 0) {
      this.err = this.R.error();
      // a mirror image of a stellation winds the other way round; reflections commute with the
      // round, so turning it the right way out changes nothing else
      if (this.faces && density(this.faces, this.P.pos) < 0) for (let i = 0; i < this.P.pos.length; i += 3) this.P.pos[i] = -this.P.pos[i];
    }
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

// One polyhedron and the chain of steps run on it, shared by the worker and the tests: the build,
// the automorphisms, and every step, which may be an init (built, random, spectral), a shake, or
// an optimizer run to its end or to the round it was stopped at. A step is
// { opt, regularity, pointedness, weights, seed, index, matrix, flags, keep, it }; keep: false runs
// it without averaging over the symmetries.
export class Session {
  constructor(text, { maxEdges = Infinity, onStage } = {}) {
    const { P, parsed } = build(text, { maxEdges, onStage });
    const bad = check(P);
    if (bad) throw new Error('the result is not a polyhedron: ' + bad);
    this.text = text;
    this.P = P;
    this.parsed = parsed;
    this.built = Float64Array.from(P.pos);
    this.flat = flatten(P);
    this.maps = null;
    // a random start has no symmetry, so the optimizers stop keeping it until the next 'built' or
    // 'spectral'; a spectral start is exactly symmetric, though often under other matrices than the
    // shape as built, which symmetrize() refits every time
    this.symmetric = true;
    // the subgroup a symmetric random start keeps, null for the whole group
    this.sub = null;
    // the spectral starts of each matrix, computed when first asked for
    this.starts = new Map();
    // the operators' construction without relaxation, for readable, built when first needed
    this.raw = null;
  }

  // The operators and the canonical relaxation keep symmetric shapes symmetric, so the matrices
  // fitted to the shape as built are good enough to name the group.
  symmetries() {
    const sym = automorphisms(this.P, topology(this.P));
    this.maps = sym.maps;
    return sym;
  }

  // An init or a shake, in place. A spectral init returns { spectral: what the page shows }.
  instant(step, onStage) {
    const P = this.P;
    if (step.opt === 'built') { P.pos.set(this.built); this.symmetric = true; this.sub = null; return {}; }
    if (step.opt === 'random') { randomPositions(P.pos, step.seed); this.symmetric = false; this.sub = null; return {}; }
    if (step.opt === 'symmetric') {
      // the matrices of the shape as built, where every automorphism is an isometry; fitted to
      // the random points they would mean nothing
      randomPositions(P.pos, step.seed);
      const all = this.maps || this.symmetries().maps;
      const { maps, Rs } = subgroup(P.faces, all, fitMatrices(this.built, all).Rs, step.group || 'all');
      project(P.pos, maps, Rs);
      this.symmetric = true;
      this.sub = maps;
      return { group: pointGroup(Rs) };
    }
    if (step.opt === 'shake') {
      shake(P.pos, this.flat.edges, step.seed);
      // the noise averaged over the symmetries keeps them; without, it breaks them. The matrices
      // are fitted to the shaken shape, so one pass leaves about 1e-5; the next ones make it exact.
      const maps = this.sub || this.maps;
      if (this.symmetric && step.keep !== false && maps && maps.length > 1) for (let k = 0; k < 3; k++) symmetrize(P.pos, maps);
      return {};
    }
    if (P.nv > SPECTRAL_MAX) return { spectral: { tooBig: true } };
    const kind = step.matrix || 'adjacency';
    if (!this.starts.has(kind)) { if (onStage) onStage('eigenvectors'); this.starts.set(kind, spectralStarts(P, this.maps, kind)); }
    const list = this.starts.get(kind);
    if (!list.length) return { spectral: { index: 0, count: 0 } };
    // past the last start it wraps round, so the stepper can go on
    const index = ((Math.round(step.index || 1) - 1) % list.length + list.length) % list.length + 1, s = list[index - 1];
    P.pos.set(s.pos);
    this.symmetric = true;
    this.sub = null;
    return { spectral: { index, count: list.length, values: s.values, dims: s.dims, density: s.density, group: s.group } };
  }

  realization(step) {
    // the readable optimizer may need the operators' construction without relaxation
    if (step.opt === 'readable' && !this.raw) this.raw = build(this.text, { relax: false }).P.pos;
    return new Realization(this.P, this.flat, step.opt, {
      regularity: step.regularity, pointedness: step.pointedness, weights: step.weights, flags: step.flags,
      maps: this.symmetric && step.keep !== false ? this.sub || this.maps : null, rawPos: this.raw,
    });
  }

  // runs one step to its end, or to its stop round
  run(step) {
    if (INSTANT.includes(step.opt)) return this.instant(step);
    const R = this.realization(step), limit = step.it ?? Infinity;
    while (!R.done && R.it < limit) R.step();
    return R;
  }

  state() { return { pos: Float64Array.from(this.P.pos), symmetric: this.symmetric, sub: this.sub }; }
  restore(s) { this.P.pos.set(s.pos); this.symmetric = s.symmetric; this.sub = s.sub ?? null; }
}

// Two shapes count as the same when shapeDistance (frame.js: up to position, size and rotation)
// is below this; invisible on screen.
export const SAME_SHAPE = 1e-3;

// The shortest chain found that gives the same shape as steps, for a link to share: steps that
// later ones undo are dropped. Converged optimizers forget most of where they started, so first
// the shortest tail of the chain that still gives the shape (with the init kept), then each
// remaining step on its own, earliest first, then the init. Every candidate is replayed, from the
// state before the first step it changes. Returns the steps kept, in order. onProgress(tries) is
// called before every replay.
export function prune(S, steps, onProgress = () => {}) {
  const built = S.state();
  const init = steps.length && INITS.includes(steps[0].opt) ? [steps[0]] : [], rest = steps.slice(init.length);
  let tries = 0;
  // runs list from state, recording the state after each step in states
  const replay = (from, list, states = []) => {
    onProgress(++tries);
    S.restore(from);
    for (const t of list) { S.run(t); states.push(S.state()); }
    return S.state().pos;
  };
  S.restore(built);
  for (const t of init) S.run(t);
  const start = S.state();
  let states = [];
  const target = replay(start, rest, states);
  const same = pos => shapeDistance(pos, target) < SAME_SHAPE;

  let keep = rest;
  if (rest.length && same(start.pos)) keep = [];
  for (let j = rest.length - 1; j >= 1 && keep.length > 1; j--) {
    const st = [];
    if (same(replay(start, rest.slice(j), st))) { keep = rest.slice(j); states = st; break; }
  }
  for (let i = 0; i < keep.length && keep.length > 1;) {
    const st = [];
    if (same(replay(i ? states[i - 1] : start, keep.slice(i + 1), st))) {
      keep = keep.slice(0, i).concat(keep.slice(i + 1));
      states = states.slice(0, i).concat(st);
    } else i++;
  }
  if (init.length && same(replay(built, keep))) return keep;
  return [...init, ...keep];
}
