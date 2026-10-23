// The picture: the boundary curve of Ω, its ideal triangulation (the Farey triangles carried by
// the flags) and the balls of its Hilbert metric, drawn in an affine chart of ℝP².
//
// The chart. Ω is properly convex, so some line misses its closure: the sum of the tangent lines
// at 0, 1, ∞ and −1, each signed to be positive on Ω. Dividing by it puts all of Ω in view.
// An affine map then moves the centroid of Ω to the origin and makes its second moments equal,
// so that Ω looks as round as it can, and turns the point at ∞ to the top. The same projective
// freedom that the coordinates leave open is used up this way, so the picture moves continuously
// with the coordinates.

import { seed, mediant, split, apply, dot, cross, flagMap, inverse, mmul } from './flags.js';

const TOP_DEPTH = 7;          // depth of the coarse boundary used for the chart
const MAX_DEPTH = 4000, MAX_NODES = 1.5e6;
// Around a hole, the Farey triangles of a fan pile up along a straight piece of the boundary, the
// gap between the two fixed points of the loop around the hole. Splitting the chord across it then
// keeps returning the same chord: after STALL such steps it is taken as straight.
const STALL = 24;

// ---------- the chart ----------

function chartRows(flags) {
  const keys = [0, 1, 'inf', '-1'];
  const neg = v => v.map(x => -x);
  // Lift the points to one half of the cone over Ω: the half where the tangent at 0 is positive,
  // and for 0 itself, where the tangent at ∞ is positive on that half
  const l0 = flags[0][1];
  const ps = keys.map(k => { const p = flags[k][0]; return dot(l0, p) < 0 ? neg(p) : p; });
  let li = flags.inf[1];
  if (dot(li, ps[1]) < 0) li = neg(li);
  if (dot(li, ps[0]) < 0) ps[0] = neg(ps[0]);
  // sign each tangent line positive on that half of the cone; their sum is positive on all of it
  const ls = keys.map((k, i) => { const l = flags[k][1]; return dot(l, ps[(i + 2) % 4]) < 0 ? neg(l) : l; });
  const h = [0, 1, 2].map(j => ls.reduce((s, l) => s + l[j] / Math.hypot(...l), 0));
  // two rows completing h to a basis, orthogonal to it
  const t = Math.abs(h[0]) < 0.9 * Math.hypot(...h) ? [1, 0, 0] : [0, 1, 0];
  const u = cross(h, t), v = cross(h, u);
  return [u, v, h];
}

// points of the boundary at a fixed Farey depth, in order, counterclockwise from 0 (see bases())
function coarseBoundary(c, depth) {
  const { flags } = seed(c);
  const B = bases(c), out = [];
  const walk = (G, j, d) => {
    if (d === 0) return;
    const [kl, kr] = B[j].kids;
    walk(mul(G, kl.h), kl.j, d - 1);
    out.push(apply(G, B[j].pM));
    walk(mul(G, kr.h), kr.j, d - 1);
  };
  for (const j of STARTS) { out.push(B[j].pL); walk(I3, j, depth); }
  return { flags, points: out };
}

const affine = (N, p) => { const q = apply(N, p); return [q[0] / q[2], q[1] / q[2]]; };

// area, centroid and second moments of a polygon
function moments(P) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < P.length; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length];
    const w = x0 * y1 - x1 * y0;
    A += w; cx += (x0 + x1) * w; cy += (y0 + y1) * w;
  }
  A /= 2; cx /= 6 * A; cy /= 6 * A;
  let xx = 0, yy = 0, xy = 0;
  for (let i = 0; i < P.length; i++) {
    const x0 = P[i][0] - cx, y0 = P[i][1] - cy, x1 = P[(i + 1) % P.length][0] - cx, y1 = P[(i + 1) % P.length][1] - cy;
    const w = x0 * y1 - x1 * y0;
    xx += w * (x0 * x0 + x0 * x1 + x1 * x1);
    yy += w * (y0 * y0 + y0 * y1 + y1 * y1);
    xy += w * (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0);
  }
  return { A, cx, cy, xx: xx / 12 / A, yy: yy / 12 / A, xy: xy / 24 / A };
}

// The 3×3 matrix N taking a point of ℝ³ to homogeneous chart coordinates.
export function chart(c) {
  const { flags, points } = coarseBoundary(c, TOP_DEPTH);
  const R = chartRows(flags);
  let P = points.map(p => affine(R, p));
  let m = moments(P);
  if (m.A < 0) { R[0] = R[0].map(v => -v); P = P.map(([x, y]) => [-x, y]); m = moments(P); }
  // whiten: the inverse square root of the moment matrix
  const tr = m.xx + m.yy, dt = m.xx * m.yy - m.xy * m.xy, s = Math.sqrt(dt), t = Math.sqrt(tr + 2 * s);
  // sqrt of [[xx, xy], [xy, yy]] is ([[xx, xy], [xy, yy]] + s I) / t
  const a = (m.xx + s) / t, b = m.xy / t, d = (m.yy + s) / t, id = a * d - b * b;
  let W = [[d / id, -b / id], [-b / id, a / id]];
  // a disk has second moments r²/4: scale so that a round Ω has radius 1
  W = W.map(r => r.map(v => v / 2));
  // turn ∞ to the top
  const pi = affine(R, flags.inf[0]);
  const ux = W[0][0] * (pi[0] - m.cx) + W[0][1] * (pi[1] - m.cy), uy = W[1][0] * (pi[0] - m.cx) + W[1][1] * (pi[1] - m.cy);
  const ang = Math.PI / 2 - Math.atan2(uy, ux), co = Math.cos(ang), si = Math.sin(ang);
  const Rt = [[co, -si], [si, co]];
  const T = [0, 1].map(i => [0, 1].map(j => Rt[i][0] * W[0][j] + Rt[i][1] * W[1][j]));
  // homogeneous: x' = T (x/h − c), as rows acting on [u, v, h]
  const A3 = [
    [T[0][0], T[0][1], -(T[0][0] * m.cx + T[0][1] * m.cy)],
    [T[1][0], T[1][1], -(T[1][0] * m.cx + T[1][1] * m.cy)],
    [0, 0, 1],
  ];
  return A3.map(r => [0, 1, 2].map(j => r[0] * R[0][j] + r[1] * R[1][j] + r[2] * R[2][j]));
}

// ---------- the traversal ----------

// The Farey tree modulo the group. An interval is a Farey edge seen from one side, and the group
// acts freely and transitively on the intervals with the same edge class and type below, so every
// interval is g · B for one of six base intervals B (index 2k + type) and a group element g. The two
// halves of a base interval are again such images, h · B', with fixed h. Carrying the matrices g
// down the tree keeps full precision near the cusps, where the flags of an interval nearly coincide
// and building them one from the next (flags.js, across) would lose it.

export function bases(c) {
  const { flags: f, intervals } = seed(c);
  const B = new Array(6);
  for (const iv of intervals) B[2 * iv.k + iv.type] = iv;
  B[0] = { L: f.inf, R: f[0], O: f[1], k: 0, type: 0 }; // e1 with T1 = (∞, −1, 0) below
  B[1] = { L: f[0], R: f.inf, O: f['-1'], k: 0, type: 1 }; // e1 with T2 = (0, 1, ∞) below
  return B.map(iv => {
    const M = mediant(c, iv);
    const kids = split(c, iv, M).map(ch => {
      const j = 2 * ch.k + ch.type, src = B[j];
      const h = flagMap([src.L, src.R, src.O], [ch.L, ch.R, ch.O]);
      return { j, h, hi: inverse(h) };
    });
    return { pL: iv.L[0], pR: iv.R[0], pM: M[0], lL: iv.L[1], lR: iv.R[1], lM: M[1], type: iv.type, kids };
  });
}

const STARTS = [3, 5, 2, 4]; // the four intervals of seed(): e2 T1, e3 T1, e2 T2, e3 T2
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

function mul(A, B) {
  const C = A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  let m = 0;
  for (const r of C) for (const v of r) m = Math.max(m, Math.abs(v));
  return C.map(r => r.map(v => v / m));
}

// Walks the Farey tree depth first, counterclockwise, calling
//   seg(x0, y0, x1, y1, quarter)   for each piece of the boundary curve, a chord within eps / 4 of its arc
//   tri(xs, depth, type, quarter)  for each triangle (L, M, R) wider than minTile and thicker than
//                                  sliver, xs = [xL, yL, xM, yM, xR, yR]
// in screen pixels, for an affine map toScreen from the chart to the screen.
//
// The arc between L and R, and every triangle under it, lies in the triangle formed by the chord and
// the tangents at its ends, which meet at T. It strays from the chord by at most about the distance
// from R to the tangent at L, and from L to the tangent at R: once both are below eps / 4, the chord
// stands for the arc. A branch whose triangle LRT lies outside the view is skipped.
//
// Each interval g · B passes its ends, points and tangent lines on the screen, down to its halves,
// and only the flag at the mediant is moved by g: the ends of a deep interval may lie close to a
// repelling fixed point of g, where g would crush them, but its mediant lies on the arc that g
// contracts. Lines move by the inverse of g.
export function traverse(c, N, toScreen, { eps, minTile, sliver = 0.3, w, h, cull = true }, seg, tri, B = bases(c)) {
  // toScreen in homogeneous coordinates, as a matrix S: screen points S N G p, screen lines l G⁻¹ (S N)⁻¹
  const [ax, ay] = toScreen(0, 0), [ux, uy] = toScreen(1, 0), [vx, vy] = toScreen(0, 1);
  const SN = mmul([[ux - ax, vx - ax, ax], [uy - ay, vy - ay, ay], [0, 0, 1]], N), K = inverse(SN);
  const pt = (G, p) => { const q = apply(SN, apply(G, p)); return [q[0] / q[2], q[1] / q[2]]; };
  const line = (Gi, l) => {
    const m = rowMul(rowMul(l, Gi), K), n = Math.hypot(m[0], m[1]);
    return [m[0] / n, m[1] / n, m[2] / n];
  };
  const dist = (l, p) => Math.abs(l[0] * p[0] + l[1] * p[1] + l[2]);
  let nodes = 0, maxDepth = 0, truncated = false;
  const tile2 = minTile * minTile, tol = eps / 4;
  const stack = [];
  for (let qi = 3; qi >= 0; qi--) {
    const b = B[STARTS[qi]];
    stack.push({ G: I3, Gi: I3, j: STARTS[qi], sL: pt(I3, b.pL), sR: pt(I3, b.pR), tL: line(I3, b.lL), tR: line(I3, b.lR), d: 0, q: qi, stall: 0 });
  }
  while (stack.length) {
    const { G, Gi, j, sL, sR, tL, tR, d, q, stall } = stack.pop();
    const b = B[j];
    const dx = sR[0] - sL[0], dy = sR[1] - sL[1], len2 = dx * dx + dy * dy;
    let sag = Infinity, bend = Infinity;
    if (d >= 2) {
      const dR = dist(tL, sR), dL = dist(tR, sL);
      bend = Math.max(dL, dR);
      sag = Math.min(dL, dR);
      // cull, when T is a finite point beyond the chord from the centre
      const t = cross(tL, tR);
      if (cull && Math.abs(t[2]) > 1e-300) {
        const Tx = t[0] / t[2], Ty = t[1] / t[2];
        const side = (x, y) => dx * (y - sL[1]) - dy * (x - sL[0]);
        if (side(Tx, Ty) * side(ax, ay) < 0) {
          const x0 = Math.min(sL[0], sR[0], Tx), x1 = Math.max(sL[0], sR[0], Tx);
          const y0 = Math.min(sL[1], sR[1], Ty), y1 = Math.max(sL[1], sR[1], Ty);
          if (x1 < 0 || y1 < 0 || x0 > w || y0 > h) continue;
        }
      }
    }
    // Recurse for the tiles while the region under the chord is long and thick enough to hold one
    // that is not a sliver.
    const wantTiles = tri && len2 > tile2 && sag > sliver;
    const capped = d >= MAX_DEPTH || nodes > MAX_NODES;
    // (a chord far below tol is a point: with Ω round and its boundary C¹, so is the arc over it)
    if (capped || stall >= STALL || (!wantTiles && (bend < tol || (d >= 2 && len2 < tol * tol / 64)))) {
      if (capped) truncated = true;
      seg(sL[0], sL[1], sR[0], sR[1], q);
      continue;
    }
    nodes++;
    if (d > maxDepth) maxDepth = d;
    const sM = pt(G, b.pM), tM = line(Gi, b.lM);
    if (wantTiles) {
      const area2 = Math.abs((sM[0] - sL[0]) * dy - (sM[1] - sL[1]) * dx);
      if (area2 > sliver * Math.sqrt(len2)) tri([sL[0], sL[1], sM[0], sM[1], sR[0], sR[1]], d, b.type, q);
    }
    // a half whose chord is the same as this one, up to tol, has stalled
    const near = (u, v) => Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]) < tol;
    const [kl, kr] = b.kids;
    stack.push(
      { G: mul(G, kr.h), Gi: mul(kr.hi, Gi), j: kr.j, sL: sM, sR, tL: tM, tR, d: d + 1, q, stall: near(sM, sL) ? stall + 1 : 0 },
      { G: mul(G, kl.h), Gi: mul(kl.hi, Gi), j: kl.j, sL, sR: sM, tL, tR: tM, d: d + 1, q, stall: near(sM, sR) ? stall + 1 : 0 });
  }
  return { nodes, maxDepth, truncated };
}

const rowMul = (l, M) => [0, 1, 2].map(j => l[0] * M[0][j] + l[1] * M[1][j] + l[2] * M[2][j]);

// ---------- the Hilbert metric ----------

// Ω as a polar table around the origin of the chart, which is its centroid: radius per angle
export function polar(c, N, n = 2048, B = bases(c)) {
  const pts = [];
  traverse(c, N, (x, y) => [x, y], { eps: 0.002, minTile: Infinity, cull: false },
    (x0, y0) => pts.push([x0, y0]), null, B);
  const r = new Float64Array(n);
  // for each angle, intersect the ray with the polygon
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    let a0 = Math.atan2(y0, x0), a1 = Math.atan2(y1, x1);
    if (a1 < a0) a1 += 2 * Math.PI;
    if (a1 - a0 > Math.PI) continue; // never for a polygon around the origin
    const k0 = Math.ceil(a0 / (2 * Math.PI) * n), k1 = Math.floor(a1 / (2 * Math.PI) * n);
    for (let k = k0; k <= k1; k++) {
      const a = k / n * 2 * Math.PI, ux = Math.cos(a), uy = Math.sin(a);
      // solve (x0, y0) + t (x1 − x0, y1 − y0) = ρ (ux, uy)
      const ex = x1 - x0, ey = y1 - y0, den = ux * ey - uy * ex;
      if (Math.abs(den) < 1e-300) continue;
      r[((k % n) + n) % n] = (x0 * ey - y0 * ex) / den;
    }
  }
  return r;
}

// Hilbert distance from the centre to the point (x, y): with a, b where the line through them
// leaves Ω behind the centre and beyond the point, d = ½ log(|ax| |bc| / (|ac| |bx|))
export function hilbert(r, x, y) {
  const n = r.length, s = Math.hypot(x, y);
  const look = a => { // linear in the angle
    let t = (a / (2 * Math.PI)) * n;
    t = ((t % n) + n) % n;
    const i = Math.floor(t), f = t - i;
    return r[i] * (1 - f) + r[(i + 1) % n] * f;
  };
  const a = Math.atan2(y, x), rb = look(a), ra = look(a + Math.PI);
  if (s >= rb) return Infinity;
  return 0.5 * Math.log((ra + s) * rb / (ra * (rb - s)));
}
