// The readable realization: convex, exactly flat, and every corner of every face easy to see. A
// face reads wrong when two of its corners nearly merge (very unequal edges) or when a corner is
// nearly straight; the loss asks for equal edges within each face and for every corner to turn at
// least TAU of a regular polygon's turn. Sizes may differ as much as the graph needs.
//
// Flatness is kept by the choice of variables, so it never has to be traded off:
// - a simple polyhedron (every vertex has three edges, as after t or z) is fixed by its face planes
//   {x : p_f·x = 1}, each vertex being where its three planes meet, so the variables are the p_f;
// - a simplicial one (all faces triangles, as after k or n) has flat faces whatever its vertices
//   do, so the variables are the vertex positions.
// Other graphs are not covered; for them this falls back to the canonical shape.
//
// Each round is one L-BFGS iteration whose line search refuses any step that would make the shape
// non-convex, so it stays a convex polyhedron of the same graph throughout. It starts from the shape
// as it is if that is convex, else from the operators' own construction if that is, else it runs
// the canonical iteration until the shape becomes convex.
// Details and findings: docs/realization/readable.md.

import { topology, ring } from './mesh.js';
import { Realizer, flatten } from './canonical.js';
import { symmetrize } from './symmetry.js';

// MU is only a tie-breaker: at 0.1 it already undoes half of what readability gains on tttttD
const TAU = 0.6, LAMBDA = 10, POW = 4, MU = 0.001;
// L-BFGS memory; how often the shape is made exactly symmetric again; how often the canonical
// start is tested for convexity
const MEMORY = 10, SYM_EVERY = 50, START_EVERY = 100;
// done when this many rounds improve the loss by less than this fraction: it keeps creeping for a
// long time after the shape has stopped changing visibly
const STALL_ROUNDS = 100, STALL = 1e-3;

// For each face: its longest edge over its shortest, and its smallest turn at a corner over the
// regular n-gon's turn 2π/n. The turn is the unsigned angle between the two edges in space.
export function readability(faces, p) {
  const edge = new Float64Array(faces.length), turn = new Float64Array(faces.length);
  faces.forEach((f, i) => {
    const n = f.length;
    let lmin = Infinity, lmax = 0, tmin = Infinity;
    for (let k = 0; k < n; k++) {
      const a = 3 * f[(k + n - 1) % n], b = 3 * f[k], c = 3 * f[(k + 1) % n];
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[b], vy = p[c + 1] - p[b + 1], vz = p[c + 2] - p[b + 2];
      const l = Math.hypot(vx, vy, vz);
      lmin = Math.min(lmin, l); lmax = Math.max(lmax, l);
      tmin = Math.min(tmin, Math.atan2(Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx), ux * vx + uy * vy + uz * vz));
    }
    edge[i] = lmax / lmin;
    turn[i] = tmin / (2 * Math.PI / n);
  });
  return { edge, turn };
}

export class Readable {
  constructor(P, { maps = null, rawPos = null } = {}) {
    this.P = P;
    this.pos = P.pos;
    this.maps = maps && maps.length > 1 ? maps : null;
    const T = this.T = topology(P);
    this.simplicial = P.faces.every(f => f.length === 3);
    this.vf = new Int32Array(3 * T.nv);
    let simple = !this.simplicial;
    for (let v = 0; v < T.nv && simple; v++) {
      const r = ring(T, v);
      if (r.length !== 3) simple = false;
      else r.forEach((h, k) => this.vf[3 * v + k] = T.face[h]);
    }
    this.supported = this.simplicial || simple;
    this.E = [];
    for (let h = 0; h < T.nh; h++) if (T.from[h] < T.to[h]) this.E.push(h);
    this.inv = new Float64Array(9 * T.nv);
    this.llen = new Float64Array(T.nh);
    this.c = new Float64Array(3 * T.nf);
    this.n = new Float64Array(3 * T.nf);
    this.old = new Float64Array(P.pos.length);
    this.stage = 'start';
    this.finished = false;
    this.rounds = 0;
    if (!this.supported) { this.canonical = new Realizer(P.pos, flatten(P), 'canonical'); return; }
    // The shape as it is, if convex; else the operators' own construction, if convex (truncations
    // are true plane cuts: tttttD needs it, as canonical is still tangled there after 60,000
    // rounds); else the canonical iteration from the shape as it is.
    const here = Float64Array.from(P.pos);
    for (const s of [here, rawPos]) if (s && this.tryStart(s)) return;
    P.pos.set(here);
    this.canonical = new Realizer(P.pos, flatten(P), 'canonical');
  }

  // Takes the variables from a shape and keeps them if the resulting polyhedron is convex.
  tryStart(s) {
    const x = this.simplicial ? Float64Array.from(s) : this.planesOf(s);
    if (!x) return false;
    this.vertices(x);
    if (!this.simplicial) this.signs0 = this.edgeSigns(x);
    if (!this.valid(x)) { this.pos.set(s); return false; }
    this.x = x;
    this.loss0 = this.lossAt(x);
    this.restart();
    this.stage = 'optimize';
    return true;
  }

  restart() {
    this.g = new Float64Array(this.x.length);
    this.L = this.loss(this.x, this.g);
    this.S = []; this.Y = [];
    this.fails = 0;
    this.Lcheck = this.L;
  }

  // the planes of a shape's faces, through each face's centroid along its Newell normal; null if
  // the origin is not inside every face plane
  planesOf(s) {
    const { faces } = this.P, x = new Float64Array(3 * faces.length);
    for (let f = 0; f < faces.length; f++) {
      const F = faces[f];
      let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < F.length; k++) {
        const a = 3 * F[k], b = 3 * F[(k + 1) % F.length];
        nx += (s[a + 1] - s[b + 1]) * (s[a + 2] + s[b + 2]);
        ny += (s[a + 2] - s[b + 2]) * (s[a] + s[b]);
        nz += (s[a] - s[b]) * (s[a + 1] + s[b + 1]);
        cx += s[a]; cy += s[a + 1]; cz += s[a + 2];
      }
      const d = (nx * cx + ny * cy + nz * cz) / F.length;
      if (!(d > 0)) return null;
      x[3 * f] = nx / d; x[3 * f + 1] = ny / d; x[3 * f + 2] = nz / d;
    }
    return x;
  }

  // vertices from the variables: v = M⁻¹·(1, 1, 1), with M the rows p_a, p_b, p_c of its faces;
  // M⁻¹ is kept for the gradient
  vertices(x) {
    const pos = this.pos;
    if (this.simplicial) { pos.set(x); return; }
    const vf = this.vf, inv = this.inv;
    for (let v = 0; v < this.T.nv; v++) {
      const a = 3 * vf[3 * v], b = 3 * vf[3 * v + 1], c = 3 * vf[3 * v + 2];
      const m0 = x[a], m1 = x[a + 1], m2 = x[a + 2], m3 = x[b], m4 = x[b + 1], m5 = x[b + 2], m6 = x[c], m7 = x[c + 1], m8 = x[c + 2];
      const i0 = m4 * m8 - m5 * m7, i3 = m5 * m6 - m3 * m8, i6 = m3 * m7 - m4 * m6;
      const det = m0 * i0 + m1 * i3 + m2 * i6;
      const I = inv.subarray(9 * v, 9 * v + 9);
      I[0] = i0 / det; I[1] = (m2 * m7 - m1 * m8) / det; I[2] = (m1 * m5 - m2 * m4) / det;
      I[3] = i3 / det; I[4] = (m0 * m8 - m2 * m6) / det; I[5] = (m2 * m3 - m0 * m5) / det;
      I[6] = i6 / det; I[7] = (m1 * m6 - m0 * m7) / det; I[8] = (m0 * m4 - m1 * m3) / det;
      for (let r = 0; r < 3; r++) pos[3 * v + r] = I[3 * r] + I[3 * r + 1] + I[3 * r + 2];
    }
  }

  // each edge's direction against p_a × p_b; a change of sign means the edge has flipped over
  edgeSigns(x) {
    const T = this.T, pos = this.pos, out = new Float64Array(this.E.length);
    this.E.forEach((h, i) => {
      const a = 3 * T.face[h], b = 3 * T.face[T.twin[h]], u = 3 * T.from[h], w = 3 * T.to[h];
      const cx = x[a + 1] * x[b + 2] - x[a + 2] * x[b + 1], cy = x[a + 2] * x[b] - x[a] * x[b + 2], cz = x[a] * x[b + 1] - x[a + 1] * x[b];
      out[i] = (pos[w] - pos[u]) * cx + (pos[w + 1] - pos[u + 1]) * cy + (pos[w + 2] - pos[u + 2]) * cz;
    });
    return out;
  }

  // Convex and the same graph: no vertex at infinity, no flipped edge, no face facing inward, and
  // no edge where the centre of one face lies above the plane of the other.
  valid(x) {
    this.vertices(x);
    const p = this.pos, T = this.T, faces = this.P.faces, c = this.c, n = this.n;
    for (let i = 0; i < p.length; i++) if (!isFinite(p[i])) return false;
    if (!this.simplicial) {
      const sg = this.edgeSigns(x);
      for (let i = 0; i < sg.length; i++) if (sg[i] * this.signs0[i] <= 0) return false;
      // every corner turns the right way about its face's outward normal p_f; without this, a start
      // whose faces were not flat can cut into a tangled polyhedron that passes the tests below
      for (let f = 0; f < faces.length; f++) {
        const F = faces[f], d = F.length;
        for (let k = 0; k < d; k++) {
          const a = 3 * F[(k + d - 1) % d], b = 3 * F[k], c = 3 * F[(k + 1) % d];
          const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
          const wx = p[c] - p[b], wy = p[c + 1] - p[b + 1], wz = p[c + 2] - p[b + 2];
          if ((uy * wz - uz * wy) * x[3 * f] + (uz * wx - ux * wz) * x[3 * f + 1] + (ux * wy - uy * wx) * x[3 * f + 2] <= 0) return false;
        }
      }
    } else {
      // the face angles at each vertex add up to less than 2π: convex edges alone allow a surface
      // that winds round a vertex several times (in an experiment kkD reached one covering the
      // sphere 49 times), and convex edges and vertices together make it convex (van Heijenoort)
      const s = this.asum ??= new Float64Array(T.nv);
      s.fill(0);
      for (const F of faces) for (let k = 0; k < 3; k++) {
        const a = 3 * F[(k + 2) % 3], b = 3 * F[k], c = 3 * F[(k + 1) % 3];
        const ux = p[a] - p[b], uy = p[a + 1] - p[b + 1], uz = p[a + 2] - p[b + 2];
        const wx = p[c] - p[b], wy = p[c + 1] - p[b + 1], wz = p[c + 2] - p[b + 2];
        s[F[k]] += Math.atan2(Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx), ux * wx + uy * wy + uz * wz);
      }
      for (let v = 0; v < T.nv; v++) if (!(s[v] < 2 * Math.PI)) return false;
    }
    let ox = 0, oy = 0, oz = 0;
    for (let i = 0; i < p.length; i += 3) { ox += p[i]; oy += p[i + 1]; oz += p[i + 2]; }
    ox /= T.nv; oy /= T.nv; oz /= T.nv;
    let elen = 0;
    for (const h of this.E) { const a = 3 * T.from[h], b = 3 * T.to[h]; elen += Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]); }
    elen /= this.E.length;
    for (let f = 0; f < faces.length; f++) {
      const F = faces[f];
      let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < F.length; k++) {
        const a = 3 * F[k], b = 3 * F[(k + 1) % F.length];
        nx += (p[a + 1] - p[b + 1]) * (p[a + 2] + p[b + 2]);
        ny += (p[a + 2] - p[b + 2]) * (p[a] + p[b]);
        nz += (p[a] - p[b]) * (p[a + 1] + p[b + 1]);
        cx += p[a]; cy += p[a + 1]; cz += p[a + 2];
      }
      const l = Math.hypot(nx, ny, nz);
      c[3 * f] = cx / F.length; c[3 * f + 1] = cy / F.length; c[3 * f + 2] = cz / F.length;
      n[3 * f] = nx / l; n[3 * f + 1] = ny / l; n[3 * f + 2] = nz / l;
      if (n[3 * f] * (c[3 * f] - ox) + n[3 * f + 1] * (c[3 * f + 1] - oy) + n[3 * f + 2] * (c[3 * f + 2] - oz) < 0) return false;
    }
    for (const h of this.E) {
      const f = 3 * T.face[h], g = 3 * T.face[T.twin[h]];
      if ((c[g] - c[f]) * n[f] + (c[g + 1] - c[f + 1]) * n[f + 1] + (c[g + 2] - c[f + 2]) * n[f + 2] > 1e-6 * elen) return false;
    }
    return true;
  }

  lossAt(x) { return this.loss(x, null); }

  //   Σ_f Σ_e |log ℓ_e − mean_f log ℓ|^POW                         edges of a face alike
  // + LAMBDA Σ_corners max(0, cos θ − cos θ_min)² / (1 − cos θ_min)²   no corner nearly straight
  // + MU Σ_corners (cos θ − cos θ_reg)² / (1 − cos θ_reg)²             corners alike
  // with θ the turn at a corner, θ_reg = 2π/n and θ_min = TAU·θ_reg. Alike edges and alike corners
  // together make a regular polygon, so the last term picks regular faces where the graph allows
  // them; without it, any equal-edged shape whose corners pass θ_min would do, and on czD the
  // hexagons came out lopsided. With grad, also the gradient in x.
  loss(x, grad) {
    this.vertices(x);
    const T = this.T, pos = this.pos, llen = this.llen, faces = this.P.faces;
    for (let h = 0; h < T.nh; h++) {
      const u = 3 * T.from[h], w = 3 * T.to[h];
      llen[h] = Math.log(Math.hypot(pos[w] - pos[u], pos[w + 1] - pos[u + 1], pos[w + 2] - pos[u + 2]));
    }
    let L = 0;
    const gl = grad ? new Float64Array(T.nh) : null;   // dL / d log ℓ, per half-edge
    for (let f = 0; f < T.nf; f++) {
      let m = 0;
      for (let h = T.first[f]; h < T.first[f + 1]; h++) m += llen[h];
      m /= T.first[f + 1] - T.first[f];
      // each log ℓ also moves the mean, so the face's mean derivative is taken off every edge
      let gm = 0;
      for (let h = T.first[f]; h < T.first[f + 1]; h++) {
        const d = llen[h] - m;
        L += Math.abs(d) ** POW;
        if (gl) { gl[h] = POW * Math.sign(d) * Math.abs(d) ** (POW - 1); gm += gl[h]; }
      }
      if (gl) { gm /= T.first[f + 1] - T.first[f]; for (let h = T.first[f]; h < T.first[f + 1]; h++) gl[h] -= gm; }
    }
    const gv = grad ? new Float64Array(pos.length) : null;
    for (let f = 0; f < T.nf; f++) {
      const F = faces[f], d = F.length, cmin = Math.cos(TAU * 2 * Math.PI / d), sc = LAMBDA / (1 - cmin) ** 2;
      const creg = Math.cos(2 * Math.PI / d), sr = MU / (1 - creg) ** 2;
      for (let k = 0; k < d; k++) {
        const a = 3 * F[(k + d - 1) % d], b = 3 * F[k], c = 3 * F[(k + 1) % d];
        const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
        const wx = pos[c] - pos[b], wy = pos[c + 1] - pos[b + 1], wz = pos[c + 2] - pos[b + 2];
        const lu = Math.hypot(ux, uy, uz), lw = Math.hypot(wx, wy, wz), co = (ux * wx + uy * wy + uz * wz) / (lu * lw);
        const e = Math.max(0, co - cmin), r = co - creg;
        L += sc * e * e + sr * r * r;
        if (!gv) continue;
        // d cos θ / du = (ŵ − cos θ û) / |u|, and the same with u and w swapped
        const k2 = 2 * (sc * e + sr * r), u = [ux, uy, uz], w = [wx, wy, wz];
        for (let j = 0; j < 3; j++) {
          const du = k2 * (w[j] / lw - co * u[j] / lu) / lu, dw = k2 * (u[j] / lu - co * w[j] / lw) / lw;
          gv[a + j] -= du; gv[b + j] += du - dw; gv[c + j] += dw;
        }
      }
    }
    if (!grad) return L;
    for (let h = 0; h < T.nh; h++) {
      const u = 3 * T.from[h], w = 3 * T.to[h], l2 = Math.exp(2 * llen[h]);
      for (let j = 0; j < 3; j++) { const d = gl[h] * (pos[w + j] - pos[u + j]) / l2; gv[w + j] += d; gv[u + j] -= d; }
    }
    if (this.simplicial) { grad.set(gv); return L; }
    // M v = 1 gives dv = −M⁻¹ e_j (v · dp_j), so dL/dp_j = −v (column j of M⁻¹ · dL/dv)
    grad.fill(0);
    const vf = this.vf, inv = this.inv;
    for (let v = 0; v < T.nv; v++) for (let j = 0; j < 3; j++) {
      const f = 3 * vf[3 * v + j];
      const t = inv[9 * v + j] * gv[3 * v] + inv[9 * v + 3 + j] * gv[3 * v + 1] + inv[9 * v + 6 + j] * gv[3 * v + 2];
      for (let k = 0; k < 3; k++) grad[f + k] -= t * pos[3 * v + k];
    }
    return L;
  }

  // One round; returns the largest distance a vertex moved, relative to the size of the shape.
  step() {
    const p = this.pos, old = this.old;
    old.set(p);
    this.rounds++;
    if (this.stage === 'start' || !this.supported) {
      this.canonical.step();
      if (this.supported && this.rounds % START_EVERY === 0) this.tryStart(Float64Array.from(p));
    } else if (!this.finished) this.iterate();
    let m = 0, r = 0;
    for (let i = 0; i < p.length; i += 3) {
      m = Math.max(m, Math.hypot(p[i] - old[i], p[i + 1] - old[i + 1], p[i + 2] - old[i + 2]));
      r = Math.max(r, Math.hypot(p[i], p[i + 1], p[i + 2]));
    }
    return m / (r || 1);
  }

  // one L-BFGS iteration, with a backtracking line search that also refuses non-convex steps
  iterate() {
    const x = this.x, g = this.g, S = this.S, Y = this.Y, N = x.length;
    const dot = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += a[i] * b[i]; return t; };
    const q = Float64Array.from(g), al = [];
    for (let i = S.length - 1; i >= 0; i--) { al[i] = dot(S[i], q) / dot(Y[i], S[i]); for (let k = 0; k < N; k++) q[k] -= al[i] * Y[i][k]; }
    const gamma = S.length ? dot(S.at(-1), Y.at(-1)) / dot(Y.at(-1), Y.at(-1)) : 1e-3 / Math.sqrt(dot(g, g));
    for (let k = 0; k < N; k++) q[k] *= gamma;
    for (let i = 0; i < S.length; i++) { const b = al[i] - dot(Y[i], q) / dot(Y[i], S[i]); for (let k = 0; k < N; k++) q[k] += b * S[i][k]; }
    const gd = -dot(g, q);
    const xn = new Float64Array(N), g2 = new Float64Array(N);
    let ok = false, Ln = this.L;
    if (gd < 0) {
      for (let k = 0, step = 1; k < 30 && !ok; k++, step /= 2) {
        for (let i = 0; i < N; i++) xn[i] = x[i] - step * q[i];
        if (this.valid(xn)) { Ln = this.loss(xn, g2); ok = Ln <= this.L + 1e-4 * step * gd; }
      }
    }
    if (!ok) {
      // a failed search first drops the curvature memory, then gives up
      this.vertices(x);
      S.length = 0; Y.length = 0;
      if (++this.fails >= 2) this.finish();
      return;
    }
    this.fails = 0;
    const sv = new Float64Array(N), yv = new Float64Array(N);
    for (let k = 0; k < N; k++) { sv[k] = xn[k] - x[k]; yv[k] = g2[k] - g[k]; }
    if (dot(sv, yv) > 1e-12) { S.push(sv); Y.push(yv); if (S.length > MEMORY) { S.shift(); Y.shift(); } }
    x.set(xn); g.set(g2); this.L = Ln;
    this.vertices(x);
    if (this.maps && this.rounds % SYM_EVERY === 0) this.symmetrize();
    if (this.rounds % STALL_ROUNDS === 0) {
      if (this.Lcheck - this.L < STALL * this.L || this.L < 1e-12 * this.P.nf) this.finish();
      this.Lcheck = this.L;
    }
  }

  // Makes the shape exactly symmetric: average the vertices over the symmetries, then (for simple
  // polyhedra) take the planes of the averaged faces. Round-off otherwise grows slowly into a
  // visible asymmetry on big shapes. The move is tiny, so the curvature memory stays.
  symmetrize() {
    const s = Float64Array.from(this.pos);
    symmetrize(s, this.maps);
    const x = this.simplicial ? s : this.planesOf(s);
    if (x && this.valid(x)) { this.x.set(x); this.L = this.loss(this.x, this.g); }
    this.vertices(this.x);
  }

  finish() {
    if (this.maps) this.symmetrize();
    this.finished = true;
  }

  error() {
    const { edge, turn } = readability(this.P.faces, this.pos);
    let e = 0, t = Infinity;
    for (let i = 0; i < edge.length; i++) { e = Math.max(e, edge[i]); t = Math.min(t, turn[i]); }
    const err = { supported: this.supported, stage: this.stage, edge: e, turn: t };
    if (this.canonical && (this.stage === 'start' || !this.supported)) Object.assign(err, this.canonical.error());
    return err;
  }
}
