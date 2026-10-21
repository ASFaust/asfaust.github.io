// Experiment (goal A): readable, convex and exactly flat realizations of simple and simplicial
// polyhedra, by optimizing their faces' edge ratios and corner turns directly.
// node tests/planes.mjs [--start raw|built|canonical] [--iters N] [--tau x] [--lambda x] [--pow x]
//                       [--save prefix] [-v] strings...
//
// A simple polyhedron (every vertex of degree 3: the result of t, z, …) is fixed by its face planes
// {x : p_f·x = 1}: each vertex is where its three planes meet. Optimizing the p_f keeps every face
// flat by construction. A simplicial one (all faces triangles: k, n, …) has flat faces whatever the
// vertices do, so it is optimized in the vertex positions. Docs: docs/realization/planes.md.
//
// The loss, per face f and its edges e, corners c:
//   Σ |log ℓ_e − mean_f log ℓ|^pow                      edges of a face alike
// + λ Σ max(0, cos θ_c − cos(τ·2π/n))² / (1 − cos(τ·2π/n))²   every corner turns at least τ of regular
// minimized by L-BFGS. A step is refused if it flips an edge (planes) or makes the shape non-convex
// (any reflex edge or inward face), so the shape stays a convex polyhedron of the same graph.
//
// Starts: raw (the operators' construction, exactly convex and flat for truncations), built (as
// as build() leaves it, relaxed between operators), canonical (fully realized, up to 30,000 rounds).

import { writeFileSync } from 'node:fs';
import { build, Realization } from '../js/pipeline.js';
import { flatten } from '../js/canonical.js';
import { topology, ring, centroids, normals } from '../js/mesh.js';
import { metrics } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const start = opt('--start', 'raw'), iters = +opt('--iters', 6000);
const TAU = +opt('--tau', 0.6), LAMBDA = +opt('--lambda', 10), POW = +opt('--pow', 4);
const save = opt('--save', null), verbose = flag('-v');
const strings = args.length ? args : ['tttC', 'tktkI', 'tttttD', 'kD', 'kkD', 'kkkD'];

console.log(`start ${start}, τ ${TAU}, λ ${LAMBDA}, pow ${POW}`);
console.log('string     kind         its      ms   planar  inward reflex  fedge×  turn  round  size×   (start: fedge×  turn)');
for (const s of strings) run(s);

function run(s) {
  const { P } = build(s, { relax: start !== 'raw' });
  if (start === 'canonical') { const R = new Realization(P, flatten(P), 'canonical'); while (!R.done && R.it < 30000) R.step(); }
  const T = topology(P), nv = P.nv, nf = P.nf;
  const simplicial = P.faces.every(f => f.length === 3);
  // the three faces at each vertex, for simple polyhedra
  const vf = new Int32Array(3 * nv);
  let x;
  if (simplicial) x = Float64Array.from(P.pos);
  else {
    for (let v = 0; v < nv; v++) {
      const r = ring(T, v);
      if (r.length !== 3) { console.log(`${s.padEnd(10)} neither simple nor simplicial`); return; }
      r.forEach((h, k) => vf[3 * v + k] = T.face[h]);
    }
    const c = centroids(P), n = normals(P);
    x = new Float64Array(3 * nf);
    for (let f = 0; f < nf; f++) {
      const d = n[3 * f] * c[3 * f] + n[3 * f + 1] * c[3 * f + 1] + n[3 * f + 2] * c[3 * f + 2];
      for (let k = 0; k < 3; k++) x[3 * f + k] = n[3 * f + k] / d;
    }
  }
  const E = [];
  for (let h = 0; h < T.nh; h++) if (T.from[h] < T.to[h]) E.push(h);
  const pos = new Float64Array(3 * nv), inv = new Float64Array(9 * nv), llen = new Float64Array(T.nh);

  // vertices from planes: v = M⁻¹·(1, 1, 1), with M the rows p_a, p_b, p_c; M⁻¹ is kept for the gradient
  function vertices(x) {
    if (simplicial) { pos.set(x); return; }
    for (let v = 0; v < nv; v++) {
      const a = 3 * vf[3 * v], b = 3 * vf[3 * v + 1], c = 3 * vf[3 * v + 2];
      const m0 = x[a], m1 = x[a + 1], m2 = x[a + 2], m3 = x[b], m4 = x[b + 1], m5 = x[b + 2], m6 = x[c], m7 = x[c + 1], m8 = x[c + 2];
      const det = m0 * (m4 * m8 - m5 * m7) - m1 * (m3 * m8 - m5 * m6) + m2 * (m3 * m7 - m4 * m6);
      const I = [(m4 * m8 - m5 * m7) / det, (m2 * m7 - m1 * m8) / det, (m1 * m5 - m2 * m4) / det,
        (m5 * m6 - m3 * m8) / det, (m0 * m8 - m2 * m6) / det, (m2 * m3 - m0 * m5) / det,
        (m3 * m7 - m4 * m6) / det, (m1 * m6 - m0 * m7) / det, (m0 * m4 - m1 * m3) / det];
      for (let k = 0; k < 9; k++) inv[9 * v + k] = I[k];
      for (let r = 0; r < 3; r++) pos[3 * v + r] = I[3 * r] + I[3 * r + 1] + I[3 * r + 2];
    }
  }
  // each edge's direction against p_a × p_b; a change of sign means the edge has flipped
  function edgeSigns(x) {
    const out = new Float64Array(E.length);
    E.forEach((h, i) => {
      const a = 3 * T.face[h], b = 3 * T.face[T.twin[h]], u = 3 * T.from[h], w = 3 * T.to[h];
      const cx = x[a + 1] * x[b + 2] - x[a + 2] * x[b + 1], cy = x[a + 2] * x[b] - x[a] * x[b + 2], cz = x[a] * x[b + 1] - x[a + 1] * x[b];
      out[i] = (pos[w] - pos[u]) * cx + (pos[w + 1] - pos[u + 1]) * cy + (pos[w + 2] - pos[u + 2]) * cz;
    });
    return out;
  }
  function loss(x, grad) {
    vertices(x);
    for (let h = 0; h < T.nh; h++) {
      const u = 3 * T.from[h], w = 3 * T.to[h];
      llen[h] = Math.log(Math.hypot(pos[w] - pos[u], pos[w + 1] - pos[u + 1], pos[w + 2] - pos[u + 2]));
    }
    let L = 0;
    const gl = new Float64Array(T.nh);   // dL / d log ℓ, per half-edge
    for (let f = 0; f < nf; f++) {
      let m = 0;
      for (let h = T.first[f]; h < T.first[f + 1]; h++) m += llen[h];
      m /= T.first[f + 1] - T.first[f];
      // each log ℓ also moves the mean, so the face's mean derivative is taken off every edge
      let gm = 0;
      for (let h = T.first[f]; h < T.first[f + 1]; h++) {
        const d = llen[h] - m;
        L += Math.abs(d) ** POW; gl[h] = POW * Math.sign(d) * Math.abs(d) ** (POW - 1); gm += gl[h];
      }
      gm /= T.first[f + 1] - T.first[f];
      for (let h = T.first[f]; h < T.first[f + 1]; h++) gl[h] -= gm;
    }
    const corners = [];
    for (let f = 0; f < nf; f++) {
      const F = P.faces[f], d = F.length, cmin = Math.cos(TAU * 2 * Math.PI / d), sc = LAMBDA / (1 - cmin) ** 2;
      for (let k = 0; k < d; k++) {
        const a = 3 * F[(k + d - 1) % d], b = 3 * F[k], c = 3 * F[(k + 1) % d];
        const u = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
        const w = [pos[c] - pos[b], pos[c + 1] - pos[b + 1], pos[c + 2] - pos[b + 2]];
        const lu = Math.hypot(...u), lw = Math.hypot(...w), co = (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (lu * lw);
        const e = co - cmin;
        if (e > 0) { L += sc * e * e; corners.push([a, b, c, u, w, lu, lw, co, 2 * sc * e]); }
      }
    }
    if (!grad) return L;
    const gv = new Float64Array(3 * nv);
    for (let h = 0; h < T.nh; h++) {
      const u = 3 * T.from[h], w = 3 * T.to[h], l2 = Math.exp(2 * llen[h]);
      for (let k = 0; k < 3; k++) { const d = gl[h] * (pos[w + k] - pos[u + k]) / l2; gv[w + k] += d; gv[u + k] -= d; }
    }
    // d cos θ / du = (ŵ − cos θ û) / |u|, and the same with u and w swapped
    for (const [a, b, c, u, w, lu, lw, co, k2] of corners) {
      for (let k = 0; k < 3; k++) {
        const du = k2 * (w[k] / lw - co * u[k] / lu) / lu, dw = k2 * (u[k] / lu - co * w[k] / lw) / lw;
        gv[a + k] -= du; gv[b + k] += du - dw; gv[c + k] += dw;
      }
    }
    if (simplicial) { grad.set(gv); return L; }
    // M v = 1 gives dv = −M⁻¹ e_j (v · dp_j), so dL/dp_j = −v (column j of M⁻¹ · dL/dv)
    grad.fill(0);
    for (let v = 0; v < nv; v++) for (let j = 0; j < 3; j++) {
      const f = 3 * vf[3 * v + j];
      const t = inv[9 * v + j] * gv[3 * v] + inv[9 * v + 3 + j] * gv[3 * v + 1] + inv[9 * v + 6 + j] * gv[3 * v + 2];
      for (let k = 0; k < 3; k++) grad[f + k] -= t * pos[3 * v + k];
    }
    return L;
  }
  function valid(x) {
    vertices(x);
    for (let i = 0; i < pos.length; i++) if (!isFinite(pos[i])) return false;
    if (!simplicial) { const sg = edgeSigns(x); for (let i = 0; i < sg.length; i++) if (sg[i] * signs0[i] <= 0) return false; }
    P.pos.set(pos);
    const m = metrics(P);
    return m.reflex === 0 && m.inward === 0;
  }

  vertices(x);
  const signs0 = simplicial ? null : edgeSigns(x);
  P.pos.set(pos);
  const m0 = metrics(P);
  if (!valid(x)) { console.log(`${s.padEnd(10)} the start is not convex (${m0.reflex} reflex edges, ${m0.inward} inward faces)`); return; }

  // L-BFGS, with a backtracking line search that also refuses invalid steps
  const N = x.length, MEM = 10, S = [], Y = [], g = new Float64Array(N), g2 = new Float64Array(N);
  const dot = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += a[i] * b[i]; return t; };
  const axpy = (a, u, y) => { for (let i = 0; i < y.length; i++) y[i] += a * u[i]; };
  let L = loss(x, g), it = 0;
  const t0 = performance.now();
  while (it < iters) {
    it++;
    const q = Float64Array.from(g), al = [];
    for (let i = S.length - 1; i >= 0; i--) { al[i] = dot(S[i], q) / dot(Y[i], S[i]); axpy(-al[i], Y[i], q); }
    const gamma = S.length ? dot(S.at(-1), Y.at(-1)) / dot(Y.at(-1), Y.at(-1)) : 1e-3 / Math.sqrt(dot(g, g));
    for (let k = 0; k < N; k++) q[k] *= gamma;
    for (let i = 0; i < S.length; i++) axpy(al[i] - dot(Y[i], q) / dot(Y[i], S[i]), S[i], q);
    const gd = -dot(g, q);
    if (gd >= 0) { S.length = 0; Y.length = 0; continue; }
    let step = 1, xn, Ln, ok = false;
    for (let k = 0; k < 30 && !ok; k++, step /= 2) {
      xn = Float64Array.from(x); axpy(-step, q, xn);
      if (valid(xn)) { Ln = loss(xn, g2); ok = Ln <= L + 1e-4 * step * gd; }
    }
    // a failed search first drops the curvature memory, then gives up
    if (!ok) { if (S.length) { S.length = 0; Y.length = 0; continue; } break; }
    const sv = new Float64Array(N), yv = new Float64Array(N);
    for (let k = 0; k < N; k++) { sv[k] = xn[k] - x[k]; yv[k] = g2[k] - g[k]; }
    if (dot(sv, yv) > 1e-12) { S.push(sv); Y.push(yv); if (S.length > MEM) { S.shift(); Y.shift(); } }
    x.set(xn); g.set(g2);
    const dL = L - Ln; L = Ln;
    if (verbose && it % 200 === 0) { P.pos.set(pos); const m = metrics(P); console.log(`  ${it}: fedge× ${m.faceEdgeMax.toFixed(2)} turn ${m.turnMin.toFixed(2)} loss ${L.toFixed(3)}`); }
    if (dL < 1e-12 * Math.max(1, L)) break;
  }
  const ms = performance.now() - t0;
  vertices(x); P.pos.set(pos);
  const m = metrics(P);
  console.log(`${s.padEnd(10)} ${(simplicial ? 'simplicial' : 'simple').padEnd(10)} ${String(it).padStart(5)} ${ms.toFixed(0).padStart(7)}  ${m.planarMax.toExponential(1)} ${String(m.inward).padStart(7)} ${String(m.reflex).padStart(6)} ${m.faceEdgeMax.toFixed(2).padStart(7)} ${m.turnMin.toFixed(2).padStart(5)}   ${m.roundMin.toFixed(2)} ${m.sizeRatio.toFixed(1).padStart(6)}   (${m0.faceEdgeMax.toFixed(2)} ${m0.turnMin.toFixed(2)})`);
  if (save) writeFileSync(`${save}${s}.json`, JSON.stringify({ faces: P.faces, pos: Array.from(pos) }));
}
