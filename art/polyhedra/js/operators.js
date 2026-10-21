// Conway's operators. Each takes a Polyhedron and returns a new one. The new faces are built on the
// half-edges of the old one (mesh.js), so every new face comes out counter-clockwise from outside
// without any geometry. New vertices get a first position from the old ones, a vertex, an edge
// point or a face centre, which is good enough for the realization (canonical.js) to start from.
//
// Tags record where each new face and vertex comes from. Faces that grow out of an old face keep
// its tag, faces that grow around an old vertex take that vertex's tag, and faces that grow out of
// edges get a new tag, one per operator. New vertices get that new tag too, wherever they sit;
// only the dual, which swaps vertices and faces, swaps their tags.

import { Polyhedron, topology, ring, centroids, normals, normalize } from './mesh.js';

// Collects new vertices with their position and tag.
class Verts {
  constructor() { this.pos = []; this.tags = []; }
  add(x, y, z, tag) { this.pos.push(x, y, z); this.tags.push(tag); return this.tags.length - 1; }
  done(faces, ftags, ntags) {
    return new Polyhedron(faces, Float64Array.from(this.pos), Int32Array.from(ftags), Int32Array.from(this.tags), ntags);
  }
}

// copies the old vertices, with the same indices
function keepVerts(P) {
  const V = new Verts();
  for (let v = 0; v < P.nv; v++) V.add(P.pos[3 * v], P.pos[3 * v + 1], P.pos[3 * v + 2], P.vtags[v]);
  return V;
}

// the point a third of the way along half-edge h
function third(P, T, h) {
  const a = 3 * T.from[h], b = 3 * T.to[h], p = P.pos;
  return [p[a] + (p[b] - p[a]) / 3, p[a + 1] + (p[b + 1] - p[a + 1]) / 3, p[a + 2] + (p[b + 2] - p[a + 2]) / 3];
}

// The operators start from a copy centred at the origin whose edge midpoints lie at mean distance
// 1, which for a canonical polyhedron is its midsphere. Reciprocals in that sphere then give the
// dual's vertices.
function prepare(P) {
  const Q = new Polyhedron(P.faces, normalize(Float64Array.from(P.pos)), P.ftags, P.vtags, P.ntags);
  const T = topology(Q), p = Q.pos;
  let r = 0;
  for (let h = 0; h < T.nh; h++) {
    const a = 3 * T.from[h], b = 3 * T.to[h];
    r += Math.hypot(p[a] + p[b], p[a + 1] + p[b + 1], p[a + 2] + p[b + 2]) / 2;
  }
  r /= T.nh;
  for (let i = 0; i < p.length; i++) p[i] /= r;
  return [Q, T];
}

// the reciprocal of each face centroid in the unit sphere, 3 per face
function reciprocals(P) {
  const c = centroids(P);
  for (let f = 0; f < c.length; f += 3) {
    const r2 = c[f] * c[f] + c[f + 1] * c[f + 1] + c[f + 2] * c[f + 2] || 1;
    c[f] /= r2; c[f + 1] /= r2; c[f + 2] /= r2;
  }
  return c;
}

// d: a vertex for each face, a face for each vertex. The new vertex is the reciprocal of the face
// centroid in the unit sphere, which is exact for canonical polyhedra.
export function dual(P0) {
  const [P, T] = prepare(P0);
  const c = reciprocals(P);
  const V = new Verts();
  for (let f = 0; f < P.nf; f++) V.add(c[3 * f], c[3 * f + 1], c[3 * f + 2], P.ftags[f]);
  const faces = [], ftags = [];
  for (let v = 0; v < P.nv; v++) {
    faces.push(ring(T, v).map(h => T.face[h]));
    ftags.push(P.vtags[v]);
  }
  return V.done(faces, ftags, P.ntags);
}

// k, kn: a pyramid on every face, or on the faces with n sides.
export function kis(P0, n) {
  const [P, T] = prepare(P0);
  const fresh = P.ntags;
  const c = centroids(P), nm = normals(P);
  const V = keepVerts(P);
  const faces = [], ftags = [];
  P.faces.forEach((f, i) => {
    if (n && f.length !== n) { faces.push(f.slice()); ftags.push(P.ftags[i]); return; }
    // lift the apex a little, so that it does not start in the plane of the face
    let r = 0;
    for (const v of f) r += Math.hypot(P.pos[3 * v] - c[3 * i], P.pos[3 * v + 1] - c[3 * i + 1], P.pos[3 * v + 2] - c[3 * i + 2]);
    r = 0.3 * r / f.length;
    const apex = V.add(c[3 * i] + r * nm[3 * i], c[3 * i + 1] + r * nm[3 * i + 1], c[3 * i + 2] + r * nm[3 * i + 2], fresh);
    for (let k = 0; k < f.length; k++) {
      faces.push([f[k], f[(k + 1) % f.length], apex]);
      ftags.push(P.ftags[i]);
    }
  });
  return V.done(faces, ftags, fresh + 1);
}

// t, tn: cut off every vertex, or the vertices with n edges.
export function truncate(P0, n) {
  const [P, T] = prepare(P0);
  const fresh = P.ntags;
  const cut = v => !n || ring(T, v).length === n;
  // a new vertex a third along each half-edge leaving a cut vertex
  const V = new Verts();
  const at = new Int32Array(T.nh).fill(-1), keep = new Int32Array(P.nv).fill(-1);
  for (let v = 0; v < P.nv; v++) {
    if (cut(v)) {
      for (const h of ring(T, v)) at[h] = V.add(...third(P, T, h), fresh);
    } else {
      keep[v] = V.add(P.pos[3 * v], P.pos[3 * v + 1], P.pos[3 * v + 2], P.vtags[v]);
    }
  }
  const faces = [], ftags = [];
  // each old face, with each cut corner replaced by two points
  for (let f = 0; f < P.nf; f++) {
    const face = [];
    for (let h = T.first[f]; h < T.first[f + 1]; h++) {
      const v = T.from[h];
      if (keep[v] >= 0) face.push(keep[v]);
      else face.push(at[T.twin[T.prev[h]]], at[h]);
    }
    faces.push(face); ftags.push(P.ftags[f]);
  }
  // a new face for each cut vertex
  for (let v = 0; v < P.nv; v++) {
    if (keep[v] >= 0) continue;
    faces.push(ring(T, v).map(h => at[h])); ftags.push(P.vtags[v]);
  }
  return V.done(faces, ftags, fresh + 1);
}

// a: a vertex at the midpoint of each edge; the old faces shrink and the old vertices become faces.
export function ambo(P0) {
  const [P, T] = prepare(P0);
  const fresh = P.ntags;
  const V = new Verts();
  const mid = new Int32Array(T.ne);
  for (let h = 0; h < T.nh; h++) {
    if (T.from[h] > T.to[h]) continue;
    const a = 3 * T.from[h], b = 3 * T.to[h], p = P.pos;
    mid[T.edge[h]] = V.add((p[a] + p[b]) / 2, (p[a + 1] + p[b + 1]) / 2, (p[a + 2] + p[b + 2]) / 2, fresh);
  }
  const faces = [], ftags = [];
  for (let f = 0; f < P.nf; f++) {
    const face = [];
    for (let h = T.first[f]; h < T.first[f + 1]; h++) face.push(mid[T.edge[h]]);
    faces.push(face); ftags.push(P.ftags[f]);
  }
  for (let v = 0; v < P.nv; v++) {
    faces.push(ring(T, v).map(h => mid[T.edge[h]])); ftags.push(P.vtags[v]);
  }
  return V.done(faces, ftags, fresh + 1);
}

// j: the old vertices and a vertex for each face; a four-sided face across each edge. The face
// vertices go where the dual puts them: on a canonical polyhedron each edge then crosses its dual
// edge on the midsphere, and the four-sided faces come out flat.
export function join(P0) {
  const [P, T] = prepare(P0);
  const fresh = P.ntags;
  const c = reciprocals(P);
  const V = keepVerts(P);
  const fc = [];
  for (let f = 0; f < P.nf; f++) fc.push(V.add(c[3 * f], c[3 * f + 1], c[3 * f + 2], fresh));
  const faces = [], ftags = [];
  for (let h = 0; h < T.nh; h++) {
    if (T.from[h] > T.to[h]) continue;
    // u → w has its face on the left, the twin's face on the right
    faces.push([T.from[h], fc[T.face[T.twin[h]]], T.to[h], fc[T.face[h]]]); ftags.push(fresh);
  }
  return V.done(faces, ftags, fresh + 1);
}

// g: each face splits into pentagons that turn around its centre, one per side. Chiral.
export function gyro(P0) {
  const [P, T] = prepare(P0);
  const fresh = P.ntags;
  const c = centroids(P);
  const V = keepVerts(P);
  const fc = [];
  for (let f = 0; f < P.nf; f++) fc.push(V.add(c[3 * f], c[3 * f + 1], c[3 * f + 2], fresh));
  const at = new Int32Array(T.nh);
  for (let h = 0; h < T.nh; h++) at[h] = V.add(...third(P, T, h), fresh);
  const faces = [], ftags = [];
  for (let h = 0; h < T.nh; h++) {
    faces.push([fc[T.face[h]], at[h], at[T.twin[h]], T.to[h], at[T.next[h]]]); ftags.push(P.ftags[T.face[h]]);
  }
  return V.done(faces, ftags, fresh + 1);
}

// p: each face turns a little inside a ring of four-sided blades, one per corner. Chiral.
export function propeller(P0) {
  const [P, T] = prepare(P0);
  const fresh = P.ntags;
  const V = keepVerts(P);
  const at = new Int32Array(T.nh);
  for (let h = 0; h < T.nh; h++) at[h] = V.add(...third(P, T, h), fresh);
  const faces = [], ftags = [];
  for (let f = 0; f < P.nf; f++) {
    const face = [];
    for (let h = T.first[f]; h < T.first[f + 1]; h++) face.push(at[h]);
    faces.push(face); ftags.push(P.ftags[f]);
  }
  for (let h = 0; h < T.nh; h++) {
    faces.push([T.to[h], at[T.next[h]], at[h], at[T.twin[h]]]); ftags.push(fresh);
  }
  return V.done(faces, ftags, fresh + 1);
}

// c: each edge becomes a hexagon; the old faces shrink and stay.
export function chamfer(P0) {
  const [P, T] = prepare(P0);
  const fresh = P.ntags;
  const c = centroids(P);
  const V = keepVerts(P);
  // a new vertex in each corner, a third of the way from the corner to the face centre
  const at = new Int32Array(T.nh);
  for (let h = 0; h < T.nh; h++) {
    const v = 3 * T.from[h], f = 3 * T.face[h], p = P.pos;
    at[h] = V.add(p[v] + (c[f] - p[v]) / 3, p[v + 1] + (c[f + 1] - p[v + 1]) / 3, p[v + 2] + (c[f + 2] - p[v + 2]) / 3, fresh);
  }
  const faces = [], ftags = [];
  for (let f = 0; f < P.nf; f++) {
    const face = [];
    for (let h = T.first[f]; h < T.first[f + 1]; h++) face.push(at[h]);
    faces.push(face); ftags.push(P.ftags[f]);
  }
  for (let h = 0; h < T.nh; h++) {
    if (T.from[h] > T.to[h]) continue;
    const t = T.twin[h];
    faces.push([T.from[h], at[T.next[t]], at[t], T.to[h], at[T.next[h]], at[h]]); ftags.push(fresh);
  }
  return V.done(faces, ftags, fresh + 1);
}

// r: the mirror image.
export function reflect(P) {
  const pos = Float64Array.from(P.pos);
  for (let i = 0; i < pos.length; i += 3) pos[i] = -pos[i];
  return new Polyhedron(P.faces.map(f => f.slice().reverse()), pos, P.ftags, P.vtags, P.ntags);
}

// The operators by letter. `base` lists the composites by what they are made of, applied right
// to left as in the notation. `n` marks the ones that take a number. `grow` gives the counts of
// vertices, edges and faces afterwards (at most, for the ones with a number), to refuse a shape
// before it gets too big.
export const OPS = {
  d: { name: 'dual', run: dual, grow: ([v, e, f]) => [f, e, v] },
  a: { name: 'ambo', run: ambo, grow: ([v, e, f]) => [e, 2 * e, f + v] },
  t: { name: 'truncate', run: truncate, n: true, grow: ([v, e, f]) => [2 * e, 3 * e, f + v] },
  k: { name: 'kis', run: kis, n: true, grow: ([v, e, f]) => [v + f, 3 * e, 2 * e] },
  j: { name: 'join', run: join, grow: ([v, e, f]) => [v + f, 2 * e, e] },
  g: { name: 'gyro', run: gyro, grow: ([v, e, f]) => [v + f + 2 * e, 5 * e, 2 * e] },
  p: { name: 'propeller', run: propeller, grow: ([v, e, f]) => [v + 2 * e, 5 * e, f + 2 * e] },
  c: { name: 'chamfer', run: chamfer, grow: ([v, e, f]) => [v + 2 * e, 4 * e, f + e] },
  r: { name: 'reflect', run: reflect, grow: x => x },
  e: { name: 'expand', base: 'aa' },
  o: { name: 'ortho', base: 'jj' },
  b: { name: 'bevel', base: 'ta' },
  m: { name: 'meta', base: 'kj' },
  n: { name: 'needle', base: 'kd' },
  z: { name: 'zip', base: 'dk' },
  s: { name: 'snub', base: 'dg' },
};
