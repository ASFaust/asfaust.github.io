// Shared helpers for the tests: plain Node, importing the page's modules directly.

import { centroids, normals, topology } from '../js/mesh.js';

// a seeded random generator (mulberry32), so the random strings are the same every run
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
      const ux = p[a] - c[3 * i], uy = p[a + 1] - c[3 * i + 1], uz = p[a + 2] - c[3 * i + 2];
      const vx = p[b] - c[3 * i], vy = p[b + 1] - c[3 * i + 1], vz = p[b + 2] - c[3 * i + 2];
      ax += uy * vz - uz * vy; ay += uz * vx - ux * vz; az += ux * vy - uy * vx;
    }
    const area = Math.hypot(ax, ay, az) / 2;
    amin = Math.min(amin, area); amax = Math.max(amax, area);
  });
  // a reflex edge: the centre of the face on one side lies above the plane of the other
  let reflex = 0;
  for (let h = 0; h < T.nh; h++) {
    if (T.from[h] > T.to[h]) continue;
    const f = T.face[h], g = T.face[T.twin[h]];
    const d = (c[3 * g] - c[3 * f]) * n[3 * f] + (c[3 * g + 1] - c[3 * f + 1]) * n[3 * f + 1] + (c[3 * g + 2] - c[3 * f + 2]) * n[3 * f + 2];
    if (d > 1e-6 * elen) reflex++;
  }
  return {
    planarMax: pmax / elen, planarMean: psum / pn / elen,
    inward, reflex, edgeRatio: emax / emin, areaRatio: amax / amin,
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
