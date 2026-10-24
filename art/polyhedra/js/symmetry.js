// The symmetries of a polyhedron's graph, and what to do with them.
//
// An automorphism of a 3-connected planar graph is fixed by where it sends one half-edge, and
// whether it keeps or reverses the orientation. So the search tries every half-edge that could be
// the image of one fixed half-edge h0 and grows the map from there along next and twin; a clash
// means no automorphism. Keeping orientation, next goes to next; reversing it (a mirror), next goes
// to prev, and a half-edge u → v goes to φ(v) → φ(u).
//
// The canonical realization shows every automorphism as an isometry (Mani), so fitting a matrix to
// each one names the point group, and averaging a shape over the group makes it exactly symmetric.

import { topology } from './mesh.js';

// Returns { maps: [{ v: Int32Array (vertex permutation), flip }], faceOrbit: Int32Array,
// nFaceOrbits }. The identity is maps[0].
export function automorphisms(P, T = topology(P)) {
  const { nh, from, to, face, next, prev, twin } = T;
  const vdeg = new Int32Array(T.nv), fdeg = new Int32Array(T.nf);
  for (let h = 0; h < nh; h++) { vdeg[from[h]]++; fdeg[face[h]]++; }
  // what a half-edge looks like locally; an automorphism must preserve it
  const sig = (h, flip) => {
    const a = vdeg[from[h]], b = vdeg[to[h]], f = fdeg[face[h]], g = fdeg[face[twin[h]]];
    return flip ? `${b},${a},${f},${g}` : `${a},${b},${f},${g}`;
  };
  // the half-edge with the rarest look keeps the number of candidates small
  const count = new Map();
  for (let h = 0; h < nh; h++) { const s = sig(h, false); count.set(s, (count.get(s) || 0) + 1); }
  let h0 = 0;
  for (let h = 1; h < nh; h++) if (count.get(sig(h, false)) < count.get(sig(h0, false))) h0 = h;

  const map = new Int32Array(nh), used = new Uint8Array(nh), stack = new Int32Array(nh);
  const maps = [];
  // union-find over faces, for the orbits
  const parent = Int32Array.from({ length: T.nf }, (_, i) => i);
  const root = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };

  for (const flip of [false, true]) {
    const want = sig(h0, flip);
    for (let c = 0; c < nh; c++) {
      if (sig(c, false) !== want) continue;
      map.fill(-1); used.fill(0);
      map[h0] = c; used[c] = 1;
      let top = 0, ok = true;
      stack[top++] = h0;
      while (top && ok) {
        const a = stack[--top], b = map[a];
        for (let k = 0; k < 2 && ok; k++) {
          const x = k ? twin[a] : next[a];
          const y = k ? twin[b] : flip ? prev[b] : next[b];
          if (map[x] < 0) {
            if (used[y]) { ok = false; break; }
            map[x] = y; used[y] = 1; stack[top++] = x;
          } else if (map[x] !== y) ok = false;
        }
      }
      if (!ok) continue;
      const v = new Int32Array(T.nv);
      for (let h = 0; h < nh; h++) {
        v[from[h]] = flip ? to[map[h]] : from[map[h]];
        const f = root(face[h]), g = root(face[map[h]]);
        if (f !== g) parent[f] = g;
      }
      const m = { v, flip };
      // the identity first
      if (!flip && c === h0) maps.unshift(m); else maps.push(m);
    }
  }
  const label = new Map(), faceOrbit = new Int32Array(T.nf);
  for (let f = 0; f < T.nf; f++) {
    const r = root(f);
    if (!label.has(r)) label.set(r, label.size);
    faceOrbit[f] = label.get(r);
  }
  return { maps, faceOrbit, nFaceOrbits: label.size };
}

// The symmetric ways to stand the shape: one per orbit of faces, vertices and edges, each with the
// order of the rotation axis through it (the rotations that fix one member: n for an n-fold axis).
// A view is { key, kind, rep, order, size, sides }: key names the orbit for links ('f2', 'v0',
// 'e1'), rep is one member (a face index, a vertex, or an edge's two vertices). Axes with a
// rotation come first; a shape without any gets its largest faces only.
export function views(P, maps, faceOrbit) {
  const nv = P.nv, faces = P.faces;
  const union = n => {
    const parent = Int32Array.from({ length: n }, (_, i) => i);
    const root = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    return { root, join: (a, b) => { a = root(a); b = root(b); if (a !== b) parent[a] = b; } };
  };
  // edges, numbered by their sorted ends
  const edgeOf = new Map(), ends = [];
  for (const f of faces) for (let k = 0; k < f.length; k++) {
    const a = f[k], b = f[(k + 1) % f.length], key = a < b ? a * nv + b : b * nv + a;
    if (!edgeOf.has(key)) { edgeOf.set(key, ends.length); ends.push([a, b]); }
  }
  const V = union(nv), E = union(ends.length);
  for (const { v } of maps) {
    for (let i = 0; i < nv; i++) V.join(i, v[i]);
    ends.forEach(([a, b], e) => { const x = v[a], y = v[b]; E.join(e, edgeOf.get(x < y ? x * nv + y : y * nv + x)); });
  }
  const rotations = maps.filter(m => !m.flip);
  const out = [];
  const collect = (kind, n, orbitOf, fixed, extra) => {
    const seen = new Map();
    for (let i = 0; i < n; i++) {
      const o = orbitOf(i);
      if (seen.has(o)) { seen.get(o).size++; continue; }
      const w = { key: kind + seen.size, kind, rep: i, size: 1, order: rotations.filter(m => fixed(i, m.v)).length, ...extra(i) };
      seen.set(o, w);
      out.push(w);
    }
  };
  collect('f', faces.length, f => faceOrbit[f], (f, v) => faces[f].every(u => faces[f].includes(v[u])), f => ({ sides: faces[f].length }));
  collect('v', nv, V.root, (i, v) => v[i] === i, () => ({}));
  collect('e', ends.length, E.root, (e, v) => { const [a, b] = ends[e]; return (v[a] === a && v[b] === b) || (v[a] === b && v[b] === a); }, e => ({ rep: ends[e] }));
  const rank = { f: 0, v: 1, e: 2 };
  out.sort((a, b) => b.order - a.order || rank[a.kind] - rank[b.kind] || a.size - b.size);
  const axes = out.filter(w => w.order > 1);
  return (axes.length ? axes : out.filter(w => w.kind === 'f').sort((a, b) => b.sides - a.sides).slice(0, 3)).slice(0, 16);
}

// ---------- 3 × 3 matrices, row-major Float64Array(9) ----------

const mul = (A, B) => {
  const C = new Float64Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j];
  return C;
};
const det = A => A[0] * (A[4] * A[8] - A[5] * A[7]) - A[1] * (A[3] * A[8] - A[5] * A[6]) + A[2] * (A[3] * A[7] - A[4] * A[6]);
function inverse(A) {
  const d = det(A);
  if (Math.abs(d) < 1e-300) return null;
  return Float64Array.from([
    A[4] * A[8] - A[5] * A[7], A[2] * A[7] - A[1] * A[8], A[1] * A[5] - A[2] * A[4],
    A[5] * A[6] - A[3] * A[8], A[0] * A[8] - A[2] * A[6], A[2] * A[3] - A[0] * A[5],
    A[3] * A[7] - A[4] * A[6], A[1] * A[6] - A[0] * A[7], A[0] * A[4] - A[1] * A[3],
  ].map(x => x / d));
}
const transpose = A => Float64Array.from([A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]]);

// the nearest orthogonal matrix (polar factor), by Newton's iteration R ← (R + R⁻ᵀ) / 2
function orthonormalize(R) {
  for (let i = 0; i < 20; i++) {
    const inv = inverse(R);
    if (!inv) break;
    const it = transpose(inv);
    let change = 0;
    for (let k = 0; k < 9; k++) { const x = (R[k] + it[k]) / 2; change = Math.max(change, Math.abs(x - R[k])); R[k] = x; }
    if (change < 1e-14) break;
  }
  return R;
}

// For each automorphism the orthogonal matrix R that best maps the shape onto itself, R x_i ≈
// x_φ(i), by least squares around the vertex centroid. Null where the shape is too flat to tell.
export function fitMatrices(pos, maps) {
  const n = pos.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += pos[3 * i]; cy += pos[3 * i + 1]; cz += pos[3 * i + 2]; }
  cx /= n; cy /= n; cz /= n;
  const x = new Float64Array(pos.length);
  for (let i = 0; i < n; i++) { x[3 * i] = pos[3 * i] - cx; x[3 * i + 1] = pos[3 * i + 1] - cy; x[3 * i + 2] = pos[3 * i + 2] - cz; }
  const XX = new Float64Array(9);
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) XX[3 * a + b] += x[3 * i + a] * x[3 * i + b];
  const XXi = inverse(XX);
  const Rs = maps.map(({ v }) => {
    if (!XXi) return null;
    const YX = new Float64Array(9);
    for (let i = 0; i < n; i++) {
      const j = 3 * v[i];
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) YX[3 * a + b] += x[j + a] * x[3 * i + b];
    }
    return orthonormalize(mul(YX, XXi));
  });
  return { Rs, centre: [cx, cy, cz] };
}

// Makes the shape exactly symmetric under the automorphisms, in place: each vertex becomes the
// mean of R⁻¹ x_φ(i) over the group, which is x_i itself for a shape that already is symmetric.
export function symmetrize(pos, maps) {
  const { Rs, centre } = fitMatrices(pos, maps);
  if (Rs.some(R => !R)) return;
  const n = pos.length / 3, out = new Float64Array(pos.length), g = maps.length;
  for (let k = 0; k < g; k++) {
    const R = Rs[k], v = maps[k].v;
    for (let i = 0; i < n; i++) {
      const j = 3 * v[i];
      const x = pos[j] - centre[0], y = pos[j + 1] - centre[1], z = pos[j + 2] - centre[2];
      // Rᵀ (x, y, z)
      out[3 * i] += R[0] * x + R[3] * y + R[6] * z;
      out[3 * i + 1] += R[1] * x + R[4] * y + R[7] * z;
      out[3 * i + 2] += R[2] * x + R[5] * y + R[8] * z;
    }
  }
  for (let i = 0; i < pos.length; i++) pos[i] = out[i] / g + centre[i % 3];
}

// ---------- subgroups (O1) ----------

// The subgroups a symmetric random start can keep: all of them; the rotations only; the ones that
// map the most symmetric face, or vertex, to itself (the polygon's own symmetry, Cnv or Cn round its
// axis), and their rotations.
export const SUBGROUPS = ['all', 'rot', 'face', 'facerot', 'vertex', 'vertexrot'];

// The automorphisms of the subgroup kind, with the matrices Rs (fitted to the symmetric shape as
// built, one per map) that go with them.
export function subgroup(faces, maps, Rs, kind) {
  let keep = maps.map((m, k) => k);
  if (kind.startsWith('face') || kind.startsWith('vertex')) {
    // the stabilizer of each face (as a set of vertices) or vertex; the largest wins, the first of equals
    const fixes = kind.startsWith('face')
      ? faces.map(f => keep.filter(k => { const v = maps[k].v, s = new Set(f); return f.every(i => s.has(v[i])); }))
      : Array.from(maps[0].v, (_, i) => keep.filter(k => maps[k].v[i] === i));
    keep = fixes.reduce((a, b) => (b.length > a.length ? b : a));
  }
  if (kind === 'rot' || kind.endsWith('rot')) keep = keep.filter(k => det(Rs[k]) > 0);
  return { maps: keep.map(k => maps[k]), Rs: keep.map(k => Rs[k]) };
}

// Averages the shape over the given maps with fixed matrices, in place (symmetrize() fits them to
// the shape instead, which means nothing for random points): each vertex becomes the mean of
// R⁻¹ x_φ(i), so the result is exactly symmetric under them.
export function project(pos, maps, Rs) {
  const n = pos.length / 3, out = new Float64Array(pos.length), c = [0, 0, 0];
  for (let i = 0; i < pos.length; i++) c[i % 3] += pos[i] / n;
  for (let k = 0; k < maps.length; k++) {
    const R = Rs[k], v = maps[k].v;
    for (let i = 0; i < n; i++) {
      const j = 3 * v[i], x = pos[j] - c[0], y = pos[j + 1] - c[1], z = pos[j + 2] - c[2];
      out[3 * i] += R[0] * x + R[3] * y + R[6] * z;
      out[3 * i + 1] += R[1] * x + R[4] * y + R[7] * z;
      out[3 * i + 2] += R[2] * x + R[5] * y + R[8] * z;
    }
  }
  for (let i = 0; i < pos.length; i++) pos[i] = out[i] / maps.length;
}

// ---------- naming the point group ----------

// the unit vector R leaves fixed (s = 1) or flips (s = −1): a null vector of R − sI
function axis(R, s) {
  const M = Float64Array.from(R);
  M[0] -= s; M[4] -= s; M[8] -= s;
  const r = [[M[0], M[1], M[2]], [M[3], M[4], M[5]], [M[6], M[7], M[8]]];
  let best = null, bl = 0;
  for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) {
    const c = [r[a][1] * r[b][2] - r[a][2] * r[b][1], r[a][2] * r[b][0] - r[a][0] * r[b][2], r[a][0] * r[b][1] - r[a][1] * r[b][0]];
    const l = Math.hypot(...c);
    if (l > bl) { bl = l; best = c.map(t => t / l); }
  }
  return best;
}
const parallel = (a, b) => a && b && Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) > 0.99;

// Schoenflies symbol of the group the matrices form, such as 'Ih', 'D5d', 'C3v'.
export function pointGroup(Rs) {
  if (!Rs.length || Rs.some(R => !R)) return '?';
  const proper = [], mirrors = [];
  let inversion = false;
  for (const R of Rs) {
    const t = R[0] + R[4] + R[8];
    if (det(R) > 0) {
      const theta = Math.acos(Math.max(-1, Math.min(1, (t - 1) / 2)));
      proper.push({ order: theta < 1e-3 ? 1 : Math.round(2 * Math.PI / theta), axis: theta < 1e-3 ? null : axis(R, 1) });
    } else if (t < -2.99) inversion = true;
    else if (Math.abs(t - 1) < 1e-3) mirrors.push(axis(R, -1));
  }
  const N = proper.length, improper = Rs.length > N;
  const maxOrder = Math.max(...proper.map(p => p.order));
  const threes = proper.filter(p => p.order === 3).length;
  if (N === 60) return improper ? 'Ih' : 'I';
  if (N === 24 && maxOrder === 4) return improper ? 'Oh' : 'O';
  if (N === 12 && maxOrder === 3 && threes === 8) return !improper ? 'T' : inversion ? 'Th' : 'Td';
  const top = proper.filter(p => p.order === maxOrder).map(p => p.axis);
  const horizontal = mirrors.some(m => top.some(a => parallel(m, a)));
  if (N === maxOrder) {
    const n = N;
    if (!improper) return `C${n}`;
    if (n === 1) return mirrors.length ? 'Cs' : 'Ci';
    if (horizontal) return `C${n}h`;
    if (mirrors.length) return `C${n}v`;
    return `S${2 * n}`;
  }
  const n = N / 2;
  if (!improper) return `D${n}`;
  return horizontal ? `D${n}h` : `D${n}d`;
}
