// Other forms of the shape for the looks (R1, R13, R14): smooth (Catmull–Clark subdivision of the
// faces, the soft look and the glowing lines' inset) and tubes (a lattice along the edges, then
// subdivided, as Blender's Wireframe and Subdivision modifiers make it: the tubes look, and the
// glowing lines thin). Plain arrays in and out: faces as lists of vertex indices, positions flat.

// One Catmull–Clark step of a closed mesh: every face becomes quads round its centroid.
export function catmullClark(faces, pos) {
  const P = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
  const nv = pos.length / 3;
  const out = [];
  const push = p => { out.push(p[0], p[1], p[2]); return out.length / 3 - 1; };
  // the face points
  const fp = faces.map(f => { const c = [0, 0, 0]; for (const v of f) for (let j = 0; j < 3; j++) c[j] += pos[3 * v + j] / f.length; return c; });
  // the edges, each with its two faces
  const edges = new Map(), key = (a, b) => a < b ? a * nv + b : b * nv + a;
  faces.forEach((f, i) => f.forEach((v, k) => {
    const w = f[(k + 1) % f.length], e = key(v, w);
    if (!edges.has(e)) edges.set(e, { a: v, b: w, faces: [] });
    edges.get(e).faces.push(i);
  }));
  // the vertices: (F + 2R + (n − 3) P) / n, with F the mean of the face points round it, R of the
  // edge midpoints, n the valence
  const F = Array.from({ length: nv }, () => [0, 0, 0, 0]), R = Array.from({ length: nv }, () => [0, 0, 0, 0]);
  faces.forEach((f, i) => { for (const v of f) { for (let j = 0; j < 3; j++) F[v][j] += fp[i][j]; F[v][3]++; } });
  for (const { a, b } of edges.values()) for (const v of [a, b]) {
    for (let j = 0; j < 3; j++) R[v][j] += (pos[3 * a + j] + pos[3 * b + j]) / 2;
    R[v][3]++;
  }
  const vi = [];
  for (let v = 0; v < nv; v++) {
    const n = R[v][3], p = P(v);
    if (!n) { vi.push(push(p)); continue; }
    vi.push(push([0, 1, 2].map(j => (F[v][j] / F[v][3] + 2 * R[v][j] / n + (n - 3) * p[j]) / n)));
  }
  const fi = fp.map(push);
  // the edge points: the mean of its ends and its faces' points (the midpoint on a border)
  const ei = new Map();
  for (const [e, { a, b, faces: fs }] of edges) {
    const pts = [P(a), P(b), ...(fs.length === 2 ? fs.map(i => fp[i]) : [])];
    ei.set(e, push([0, 1, 2].map(j => pts.reduce((s, q) => s + q[j], 0) / pts.length)));
  }
  const quads = [];
  faces.forEach((f, i) => f.forEach((v, k) => {
    const d = f.length, next = f[(k + 1) % d], prev = f[(k + d - 1) % d];
    quads.push([vi[v], ei.get(key(v, next)), fi[i], ei.get(key(prev, v))]);
  }));
  return { faces: quads, pos: Float32Array.from(out) };
}

// Subdivided `levels` times, but no more than about maxFaces quads.
export function smooth(faces, pos, levels, maxFaces = 150000) {
  let m = { faces, pos };
  for (let i = 0; i < levels; i++) {
    const next = m.faces.reduce((s, f) => s + f.length, 0);
    if (next > maxFaces) break;
    m = catmullClark(m.faces, m.pos);
  }
  return m;
}

// The lattice along the edges: every face keeps a frame round its border, `width` wide, and the
// frames are `thick` deep (half to each side of the surface). A closed mesh of quads.
export function lattice(faces, pos, width, thick) {
  const nv = pos.length / 3, out = [];
  const push = (x, y, z) => { out.push(x, y, z); return out.length / 3 - 1; };
  // face normals (Newell) and centroids, and the vertex normals as their mean
  const vn = new Float32Array(3 * nv);
  const fn = faces.map(f => {
    let x = 0, y = 0, z = 0;
    f.forEach((v, k) => {
      const w = f[(k + 1) % f.length], a = 3 * v, b = 3 * w;
      x += (pos[a + 1] - pos[b + 1]) * (pos[a + 2] + pos[b + 2]);
      y += (pos[a + 2] - pos[b + 2]) * (pos[a] + pos[b]);
      z += (pos[a] - pos[b]) * (pos[a + 1] + pos[b + 1]);
    });
    const l = Math.hypot(x, y, z) || 1;
    for (const v of f) { vn[3 * v] += x / l; vn[3 * v + 1] += y / l; vn[3 * v + 2] += z / l; }
    return [x / l, y / l, z / l];
  });
  const h = thick / 2, up = [], down = [];
  for (let v = 0; v < nv; v++) {
    const a = 3 * v, l = Math.hypot(vn[a], vn[a + 1], vn[a + 2]) || 1;
    const n = [vn[a] / l, vn[a + 1] / l, vn[a + 2] / l];
    up.push(push(pos[a] + h * n[0], pos[a + 1] + h * n[1], pos[a + 2] + h * n[2]));
    down.push(push(pos[a] - h * n[0], pos[a + 1] - h * n[1], pos[a + 2] - h * n[2]));
  }
  const quads = [];
  faces.forEach((f, i) => {
    const d = f.length, n = fn[i], c = [0, 0, 0];
    for (const v of f) for (let j = 0; j < 3; j++) c[j] += pos[3 * v + j] / d;
    // the inner corners: each corner moved towards the centroid by the width, at most most of the way
    const iu = [], id = [];
    for (const v of f) {
      const t = [0, 1, 2].map(j => c[j] - pos[3 * v + j]), l = Math.hypot(...t) || 1, s = Math.min(width, 0.8 * l) / l;
      const p = [0, 1, 2].map(j => pos[3 * v + j] + s * t[j]);
      iu.push(push(p[0] + h * n[0], p[1] + h * n[1], p[2] + h * n[2]));
      id.push(push(p[0] - h * n[0], p[1] - h * n[1], p[2] - h * n[2]));
    }
    for (let k = 0; k < d; k++) {
      const v = f[k], w = f[(k + 1) % d], K = (k + 1) % d;
      quads.push([up[v], up[w], iu[K], iu[k]]);       // the frame's top
      quads.push([down[w], down[v], id[k], id[K]]);   // its underside
      quads.push([iu[k], iu[K], id[K], id[k]]);       // the wall round the hole
    }
  });
  return { faces: quads, pos: Float32Array.from(out) };
}

// Triangles with smooth (area-weighted) vertex normals, for drawing: { position, normal, index }.
export function triangles(faces, pos) {
  const normal = new Float32Array(pos.length), idx = [];
  for (const f of faces) {
    for (let k = 1; k + 1 < f.length; k++) idx.push(f[0], f[k], f[k + 1]);
    // the face's Newell normal, its length twice the area
    let x = 0, y = 0, z = 0;
    f.forEach((v, k) => {
      const w = f[(k + 1) % f.length], a = 3 * v, b = 3 * w;
      x += (pos[a + 1] - pos[b + 1]) * (pos[a + 2] + pos[b + 2]);
      y += (pos[a + 2] - pos[b + 2]) * (pos[a] + pos[b]);
      z += (pos[a] - pos[b]) * (pos[a + 1] + pos[b + 1]);
    });
    for (const v of f) { normal[3 * v] += x; normal[3 * v + 1] += y; normal[3 * v + 2] += z; }
  }
  for (let i = 0; i < normal.length; i += 3) {
    const l = Math.hypot(normal[i], normal[i + 1], normal[i + 2]) || 1;
    normal[i] /= l; normal[i + 1] /= l; normal[i + 2] /= l;
  }
  return { position: pos, normal, index: Uint32Array.from(idx) };
}
