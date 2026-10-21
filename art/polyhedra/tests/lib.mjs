// Shared helpers for the tests: plain Node, importing the page's modules directly.

import { centroids, normals, topology } from '../js/mesh.js';
import { readability } from '../js/readable.js';

// a seeded random generator (mulberry32), so the random strings are the same every run
import { rng } from '../js/frame.js';
export { rng };

const SEEDS = ['T', 'C', 'O', 'D', 'I', 'P5', 'A4', 'Y6', 'U4', 'J17', 'J29', 'J45'];
const OPS = 'datkjgpcresobmnz';

// n random operator strings of one to three operators, some with degree numbers
export function randomStrings(n, seed = 12345) {
  const r = rng(seed), out = [];
  for (let i = 0; i < n; i++) {
    let s = SEEDS[Math.floor(r() * SEEDS.length)];
    const k = 1 + Math.floor(r() * 3);
    for (let j = 0; j < k; j++) {
      const o = OPS[Math.floor(r() * OPS.length)];
      s = o + ((o === 't' || o === 'k') && r() < 0.3 ? 3 + Math.floor(r() * 3) : '') + s;
    }
    out.push(s);
  }
  return out;
}

// '12×5 20×6' style census of a polyhedron
export const census = P => {
  const m = new Map();
  for (const f of P.faces) m.set(f.length, (m.get(f.length) || 0) + 1);
  return [...m].sort((a, b) => a[0] - b[0]).map(([s, k]) => `${k}×${s}`).join(' ');
};

// the area of a regular n-gon with side l
const regularArea = (n, l) => n * l * l / (4 * Math.tan(Math.PI / n));

// Balance, per face (docs/realization/README.md#balance). The minimal definition is that every
// corner of every face can be seen, so that a hexagon never reads as a pentagon:
// - edge: longest / shortest edge of the face. 1 for a regular face; large when two corners nearly
//   merge. Two faces sharing an edge then differ in mean edge by at most edge_f · edge_g, so a bound
//   on it also makes sizes change gradually from face to face.
// - turn: the smallest turn at a corner, over the turn of the regular n-gon (2π/n). 1 for a regular
//   face, 0 where a corner is straight and vanishes. Relative, because a regular 160-gon's corners
//   are nearly straight too. It is the unsigned angle between the two edges in space, so that it
//   means the same on bent faces; a reflex corner is still a visible corner (convexity is counted
//   apart, by inward and reflex in metrics()).
// edge and turn come from readability() in js/readable.js, which the readable mode optimizes.
// Descriptive, not part of the definition (they cannot reach 1 for most graphs):
// - round: area / area of the regular n-gon with the same perimeter. The regular n-gon has the most
//   area for its perimeter, so this is 1 for a regular face and falls towards 0 for a sliver.
// - size: sqrt(area / area of the regular n-gon whose side is the mean edge length). It is 1 for
//   every face of a regular-faced solid, so it says how much bigger or smaller a face is than its
//   degree alone accounts for.
export function balance(P, area, perimeter, elen) {
  const { edge, turn } = readability(P.faces, P.pos);
  const round = new Float64Array(P.nf), size = new Float64Array(P.nf);
  P.faces.forEach((f, i) => {
    const n = f.length;
    round[i] = area[i] / regularArea(n, perimeter[i] / n);
    size[i] = Math.sqrt(area[i] / regularArea(n, elen));
  });
  // the slope of log size against log degree, over the mean log size of each degree: 0 when big
  // faces are as big as regular ones would be, positive when they take more than that
  const byDeg = new Map();
  P.faces.forEach((f, i) => { const e = byDeg.get(f.length) || [0, 0]; e[0] += Math.log(size[i]); e[1]++; byDeg.set(f.length, e); });
  const pts = [...byDeg].map(([n, [s, k]]) => [Math.log(n), s / k]);
  let slope = NaN;
  if (pts.length > 1) {
    const mx = pts.reduce((a, q) => a + q[0], 0) / pts.length, my = pts.reduce((a, q) => a + q[1], 0) / pts.length;
    slope = pts.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0) / pts.reduce((a, q) => a + (q[0] - mx) ** 2, 0);
  }
  let emax = 0, tmin = Infinity, rmin = Infinity, smin = Infinity, smax = 0;
  for (let i = 0; i < P.nf; i++) {
    emax = Math.max(emax, edge[i]); tmin = Math.min(tmin, turn[i]);
    rmin = Math.min(rmin, round[i]); smin = Math.min(smin, size[i]); smax = Math.max(smax, size[i]);
  }
  return { edge, turn, round, size, faceEdgeMax: emax, turnMin: tmin, roundMin: rmin, sizeRatio: smax / smin, degreeSlope: slope };
}

// How good a realization is. Lengths are relative to the mean edge length.
export function metrics(P) {
  const T = topology(P), p = P.pos, c = centroids(P), n = normals(P);
  let elen = 0, emin = Infinity, emax = 0;
  for (let h = 0; h < T.nh; h++) {
    if (T.from[h] > T.to[h]) continue;
    const a = 3 * T.from[h], b = 3 * T.to[h];
    const l = Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
    elen += l; emin = Math.min(emin, l); emax = Math.max(emax, l);
  }
  elen /= T.ne;
  // planarity: distance of each vertex from its face's mean plane
  let pmax = 0, psum = 0, pn = 0, inward = 0, amin = Infinity, amax = 0;
  const area = new Float64Array(P.nf), perimeter = new Float64Array(P.nf);
  P.faces.forEach((f, i) => {
    for (const v of f) {
      const d = Math.abs((p[3 * v] - c[3 * i]) * n[3 * i] + (p[3 * v + 1] - c[3 * i + 1]) * n[3 * i + 1] + (p[3 * v + 2] - c[3 * i + 2]) * n[3 * i + 2]);
      pmax = Math.max(pmax, d); psum += d; pn++;
    }
    if (n[3 * i] * c[3 * i] + n[3 * i + 1] * c[3 * i + 1] + n[3 * i + 2] * c[3 * i + 2] < 0) inward++;
    // area by the fan from the centroid
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < f.length; k++) {
      const a = 3 * f[k], b = 3 * f[(k + 1) % f.length];
      perimeter[i] += Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
      const ux = p[a] - c[3 * i], uy = p[a + 1] - c[3 * i + 1], uz = p[a + 2] - c[3 * i + 2];
      const vx = p[b] - c[3 * i], vy = p[b + 1] - c[3 * i + 1], vz = p[b + 2] - c[3 * i + 2];
      ax += uy * vz - uz * vy; ay += uz * vx - ux * vz; az += ux * vy - uy * vx;
    }
    area[i] = Math.hypot(ax, ay, az) / 2;
    amin = Math.min(amin, area[i]); amax = Math.max(amax, area[i]);
  });
  // a reflex corner: the face turns the wrong way there, about its own normal (a twisted or
  // non-convex face, which the edge test below can miss)
  let reflexCorners = 0;
  P.faces.forEach((f, i) => {
    const d = f.length;
    for (let k = 0; k < d; k++) {
      const a = 3 * f[(k + d - 1) % d], b = 3 * f[k], e = 3 * f[(k + 1) % d];
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const wx = p[e] - p[b], wy = p[e + 1] - p[b + 1], wz = p[e + 2] - p[b + 2];
      if ((uy * wz - uz * wy) * n[3 * i] + (uz * wx - ux * wz) * n[3 * i + 1] + (ux * wy - uy * wx) * n[3 * i + 2] < 0) reflexCorners++;
    }
  });
  // a reflex edge: the centre of the face on one side lies above the plane of the other
  let reflex = 0;
  for (let h = 0; h < T.nh; h++) {
    if (T.from[h] > T.to[h]) continue;
    const f = T.face[h], g = T.face[T.twin[h]];
    const d = (c[3 * g] - c[3 * f]) * n[3 * f] + (c[3 * g + 1] - c[3 * f + 1]) * n[3 * f + 1] + (c[3 * g + 2] - c[3 * f + 2]) * n[3 * f + 2];
    if (d > 1e-6 * elen) reflex++;
  }
  const { faceEdgeMax, turnMin, roundMin, sizeRatio, degreeSlope } = balance(P, area, perimeter, elen);
  return {
    planarMax: pmax / elen, planarMean: psum / pn / elen,
    inward, reflex, reflexCorners, edgeRatio: emax / emin, areaRatio: amax / amin,
    faceEdgeMax, turnMin, roundMin, sizeRatio, degreeSlope,
  };
}

let failures = 0;
export function expect(ok, what) {
  if (!ok) { failures++; console.log('FAIL', what); }
}
export function finish(name) {
  console.log(failures ? `${name}: ${failures} failure(s)` : `${name}: all passed`);
  process.exit(failures ? 1 : 0);
}
