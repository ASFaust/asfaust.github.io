// A polyhedron is a list of faces, each a list of vertex indices in counter-clockwise order seen
// from outside, and a position per vertex. Faces and vertices carry a tag, a small integer that
// says where they came from (see operators.js); the viewer can colour faces by it. Everything else,
// edges and the rings of faces around a vertex, is derived on demand by topology().

export class Polyhedron {
  constructor(faces, pos, ftags, vtags, ntags) {
    this.faces = faces;                 // array of arrays of vertex indices
    this.pos = pos;                     // Float64Array, 3 per vertex
    this.ftags = ftags || new Int32Array(faces.length);
    this.vtags = vtags || new Int32Array(pos.length / 3);
    this.ntags = ntags || 1;            // tags run from 0 to ntags - 1
  }
  get nv() { return this.pos.length / 3; }
  get nf() { return this.faces.length; }
  get ne() { let s = 0; for (const f of this.faces) s += f.length; return s / 2; }
}

// Half-edges: one per (face, side), running counter-clockwise around its face. For half-edge h,
// from[h] → to[h] lies on face[h]; next/prev walk around that face, twin is the same edge seen
// from the face on the other side. edge[h] numbers the undirected edges, the same for h and its
// twin. out[v] is some half-edge leaving v.
export function topology(P) {
  const nv = P.nv, nh = 2 * P.ne;
  const from = new Int32Array(nh), to = new Int32Array(nh), face = new Int32Array(nh);
  const next = new Int32Array(nh), prev = new Int32Array(nh), twin = new Int32Array(nh).fill(-1);
  const edge = new Int32Array(nh), out = new Int32Array(nv).fill(-1);
  const first = new Int32Array(P.nf + 1);
  const key = new Map();
  let h = 0;
  P.faces.forEach((f, fi) => {
    first[fi] = h;
    const d = f.length;
    for (let i = 0; i < d; i++) {
      const a = f[i], b = f[(i + 1) % d];
      from[h + i] = a; to[h + i] = b; face[h + i] = fi;
      next[h + i] = h + (i + 1) % d; prev[h + i] = h + (i + d - 1) % d;
      out[a] = h + i;
      const k = a * nv + b;
      if (key.has(k)) throw new Error('an edge is used twice in the same direction');
      key.set(k, h + i);
    }
    h += d;
  });
  first[P.nf] = h;
  let ne = 0;
  for (let i = 0; i < nh; i++) {
    const t = key.get(to[i] * nv + from[i]);
    if (t === undefined) throw new Error('an edge has only one face');
    twin[i] = t;
    if (from[i] < to[i]) { edge[i] = ne; edge[t] = ne; ne++; }
  }
  return { nv, nf: P.nf, ne, nh, from, to, face, next, prev, twin, edge, out, first };
}

// The half-edges leaving v, counter-clockwise seen from outside. The face of each lies between it
// and the next one.
export function ring(T, v) {
  const r = [];
  let h = T.out[v];
  do {
    r.push(h);
    h = T.twin[T.prev[h]];
    if (r.length > T.nh) throw new Error('a vertex is not surrounded by a single ring of faces');
  } while (h !== T.out[v]);
  return r;
}

// Checks that P is a closed oriented surface of genus 0 with every vertex in one ring of faces.
// Returns null, or a sentence saying what is wrong.
export function check(P) {
  let T;
  try { T = topology(P); } catch (e) { return e.message; }
  for (let v = 0; v < T.nv; v++) {
    if (T.out[v] < 0) return 'a vertex lies on no face';
    try { if (ring(T, v).length < 3) return 'a vertex has fewer than three edges'; } catch (e) { return e.message; }
  }
  for (const f of P.faces) if (f.length < 3) return 'a face has fewer than three sides';
  if (T.nv - T.ne + T.nf !== 2) return `V − E + F = ${T.nv - T.ne + T.nf}, not 2`;
  return null;
}

// centroid of each face, 3 per face
export function centroids(P) {
  const c = new Float64Array(3 * P.nf), p = P.pos;
  P.faces.forEach((f, i) => {
    let x = 0, y = 0, z = 0;
    for (const v of f) { x += p[3 * v]; y += p[3 * v + 1]; z += p[3 * v + 2]; }
    c[3 * i] = x / f.length; c[3 * i + 1] = y / f.length; c[3 * i + 2] = z / f.length;
  });
  return c;
}

// Newell's normal of each face, unit length, 3 per face. It is well defined for faces that are
// not quite planar.
export function normals(P) {
  const n = new Float64Array(3 * P.nf), p = P.pos;
  P.faces.forEach((f, i) => {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < f.length; k++) {
      const a = 3 * f[k], b = 3 * f[(k + 1) % f.length];
      x += (p[a + 1] - p[b + 1]) * (p[a + 2] + p[b + 2]);
      y += (p[a + 2] - p[b + 2]) * (p[a] + p[b]);
      z += (p[a] - p[b]) * (p[a + 1] + p[b + 1]);
    }
    const l = Math.hypot(x, y, z) || 1;
    n[3 * i] = x / l; n[3 * i + 1] = y / l; n[3 * i + 2] = z / l;
  });
  return n;
}

// Moves the vertex centroid to the origin and scales the mean distance from it to 1, in place.
export function normalize(pos) {
  const n = pos.length / 3;
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < n; i++) { x += pos[3 * i]; y += pos[3 * i + 1]; z += pos[3 * i + 2]; }
  x /= n; y /= n; z /= n;
  let r = 0;
  for (let i = 0; i < n; i++) {
    pos[3 * i] -= x; pos[3 * i + 1] -= y; pos[3 * i + 2] -= z;
    r += Math.hypot(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
  }
  r = r / n || 1;
  for (let i = 0; i < pos.length; i++) pos[i] /= r;
  return pos;
}

// How many faces of each number of sides, as [[sides, count], ...] sorted by sides.
export function faceCensus(P) {
  const m = new Map();
  for (const f of P.faces) m.set(f.length, (m.get(f.length) || 0) + 1);
  return [...m].sort((a, b) => a[0] - b[0]);
}
