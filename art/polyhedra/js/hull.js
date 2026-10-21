// The convex hull of a set of points, with coplanar triangles merged into polygons. The seeds are
// all given by their vertex coordinates and built through this, so each needs no face list of its
// own. Incremental and quadratic, which is plenty for a few hundred points.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(a[0], a[1], a[2]);

// Returns { pos: [[x, y, z], ...], faces: [[i, j, k, ...], ...] }, faces counter-clockwise seen
// from outside, with only the points that are corners of the hull.
export function hull(pts) {
  const scale = Math.max(...pts.map(norm), 1e-12);
  const eps = 1e-9 * scale;

  // a first tetrahedron of four points far apart
  const i0 = 0;
  let i1 = 0, best = -1;
  pts.forEach((p, i) => { const d = norm(sub(p, pts[i0])); if (d > best) { best = d; i1 = i; } });
  let i2 = 0; best = -1;
  const u = sub(pts[i1], pts[i0]);
  pts.forEach((p, i) => { const d = norm(cross(u, sub(p, pts[i0]))); if (d > best) { best = d; i2 = i; } });
  let i3 = 0; best = -1;
  const n0 = cross(u, sub(pts[i2], pts[i0]));
  pts.forEach((p, i) => { const d = Math.abs(dot(n0, sub(p, pts[i0]))); if (d > best) { best = d; i3 = i; } });
  if (best <= eps * norm(n0)) throw new Error('the points are coplanar');

  const faces = [];
  const inside = [0, 1, 2].map(k => (pts[i0][k] + pts[i1][k] + pts[i2][k] + pts[i3][k]) / 4);
  const addFace = (a, b, c) => {
    const n = cross(sub(pts[b], pts[a]), sub(pts[c], pts[a]));
    const l = norm(n);
    const f = { v: [a, b, c], n: [n[0] / l, n[1] / l, n[2] / l], alive: true };
    f.d = dot(f.n, pts[a]);
    faces.push(f);
    return f;
  };
  for (const [a, b, c] of [[i0, i1, i2], [i0, i1, i3], [i0, i2, i3], [i1, i2, i3]]) {
    const f = addFace(a, b, c);
    if (dot(f.n, inside) - f.d > 0) { f.alive = false; addFace(a, c, b); }
  }

  pts.forEach((p, i) => {
    if (i === i0 || i === i1 || i === i2 || i === i3) return;
    const visible = faces.filter(f => f.alive && dot(f.n, p) - f.d > eps);
    if (!visible.length) return;
    const edges = new Set();
    for (const f of visible) for (let k = 0; k < 3; k++) edges.add(f.v[k] + ',' + f.v[(k + 1) % 3]);
    for (const f of visible) {
      f.alive = false;
      for (let k = 0; k < 3; k++) {
        const a = f.v[k], b = f.v[(k + 1) % 3];
        if (!edges.has(b + ',' + a)) addFace(a, b, i);
      }
    }
  });
  const tris = faces.filter(f => f.alive);

  // merge neighbouring triangles that lie in one plane
  const owner = new Map();
  tris.forEach((f, t) => { for (let k = 0; k < 3; k++) owner.set(f.v[k] + ',' + f.v[(k + 1) % 3], t); });
  const group = tris.map((_, t) => t);
  const root = t => (group[t] === t ? t : (group[t] = root(group[t])));
  tris.forEach((f, t) => {
    for (let k = 0; k < 3; k++) {
      const o = owner.get(f.v[(k + 1) % 3] + ',' + f.v[k]);
      const g = tris[o];
      if (dot(f.n, g.n) > 1 - 1e-9 && Math.abs(f.d - g.d) < 1e-7 * scale) group[root(t)] = root(o);
    }
  });
  const members = new Map();
  tris.forEach((_, t) => { const r = root(t); if (!members.has(r)) members.set(r, []); members.get(r).push(t); });
  const polys = [];
  for (const ts of members.values()) {
    // the boundary of a group: its directed edges whose reverse is not in the group
    const nxt = new Map();
    const inGroup = new Set(ts);
    for (const t of ts) {
      const f = tris[t];
      for (let k = 0; k < 3; k++) {
        const a = f.v[k], b = f.v[(k + 1) % 3];
        if (!inGroup.has(owner.get(b + ',' + a))) nxt.set(a, b);
      }
    }
    const start = nxt.keys().next().value;
    const poly = [start];
    for (let v = nxt.get(start); v !== start; v = nxt.get(v)) poly.push(v);
    polys.push(poly);
  }

  // keep only the corners, renumbered
  const index = new Map();
  const pos = [];
  const out = polys.map(f => f.map(v => {
    if (!index.has(v)) { index.set(v, pos.length); pos.push(pts[v]); }
    return index.get(v);
  }));
  return { pos, faces: out };
}
