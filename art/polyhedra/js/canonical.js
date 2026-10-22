// Realizing a polyhedron in space. Steinitz's theorem says every 3-connected planar graph is the
// graph of a convex polyhedron, and the Koebe–Andreev–Thurston theorem picks a nice one: the
// canonical polyhedron, whose edges all touch the unit sphere, whose faces are flat, and whose
// edge tangent points are centred on the origin. It is unique up to rotation and has all the
// symmetries of the graph.
//
// George Hart's iteration gets there: push each edge towards tangency, recentre, push each vertex
// towards the planes of its faces, repeat. The "planar" mode only does the last step, which keeps
// the shape close to how the operators left it.

// Flattens a Polyhedron's faces and edges into typed arrays for the loop.
export function flatten(P) {
  const fo = new Int32Array(P.nf + 1);
  let n = 0;
  P.faces.forEach((f, i) => { fo[i] = n; n += f.length; });
  fo[P.nf] = n;
  const fv = new Int32Array(n);
  P.faces.forEach((f, i) => fv.set(f, fo[i]));
  const edges = new Int32Array(n);
  let e = 0;
  P.faces.forEach(f => {
    for (let k = 0; k < f.length; k++) {
      const a = f[k], b = f[(k + 1) % f.length];
      if (a < b) { edges[e++] = a; edges[e++] = b; }
    }
  });
  return { fv, fo, edges: edges.subarray(0, e) };
}

const TANGENT_RATE = 0.2;
const PLANAR_RATE = 0.3;
const MOMENTUM = 0.75;

export class Realizer {
  constructor(pos, { fv, fo, edges }, mode) {
    this.pos = pos;
    this.fv = fv; this.fo = fo; this.edges = edges;
    this.mode = mode;
    this.delta = new Float64Array(pos.length);
    this.old = new Float64Array(pos.length);
    this.vel = new Float64Array(pos.length);
    this.last = Infinity;
  }

  // One round; returns the largest distance a vertex moved, relative to the size of the shape.
  // The plain rounds converge slowly on big shapes, so each round also keeps going in the
  // direction of the last one (heavy-ball momentum), and drops that whenever the plain rounds
  // start to move more than before.
  step() {
    const p = this.pos, old = this.old, vel = this.vel;
    old.set(p);
    if (this.mode === 'canonical') { this.tangentify(); this.recentre(); }
    this.planarize();
    let m = 0, r = 0;
    for (let i = 0; i < p.length; i += 3) {
      m = Math.max(m, Math.hypot(p[i] - old[i], p[i + 1] - old[i + 1], p[i + 2] - old[i + 2]));
      r = Math.max(r, Math.hypot(p[i], p[i + 1], p[i + 2]));
    }
    m /= r || 1;
    if (m > this.last) vel.fill(0);
    this.last = m;
    for (let i = 0; i < p.length; i++) {
      p[i] += MOMENTUM * vel[i];
      vel[i] = p[i] - old[i];
    }
    return m;
  }

  // moves both ends of each edge along the edge's closest point to the origin, towards radius 1
  tangentify() {
    const p = this.pos, E = this.edges;
    for (let e = 0; e < E.length; e += 2) {
      const a = 3 * E[e], b = 3 * E[e + 1];
      const [tx, ty, tz] = tangentPoint(p, a, b);
      const s = TANGENT_RATE / 2 * (1 - Math.hypot(tx, ty, tz));
      p[a] += s * tx; p[a + 1] += s * ty; p[a + 2] += s * tz;
      p[b] += s * tx; p[b + 1] += s * ty; p[b + 2] += s * tz;
    }
  }

  // moves everything so that the mean of the edge tangent points is the origin
  recentre() {
    const p = this.pos, E = this.edges;
    let x = 0, y = 0, z = 0;
    for (let e = 0; e < E.length; e += 2) {
      const t = tangentPoint(p, 3 * E[e], 3 * E[e + 1]);
      x += t[0]; y += t[1]; z += t[2];
    }
    const n = E.length / 2;
    x /= n; y /= n; z /= n;
    for (let i = 0; i < p.length; i += 3) { p[i] -= x; p[i + 1] -= y; p[i + 2] -= z; }
  }

  // moves each vertex part of the way towards the planes of its faces
  planarize() {
    const p = this.pos, d = this.delta, fv = this.fv, fo = this.fo;
    d.fill(0);
    for (let f = 0; f < fo.length - 1; f++) {
      const s = fo[f], t = fo[f + 1], k = t - s;
      let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
      for (let i = s; i < t; i++) {
        const a = 3 * fv[i], b = 3 * fv[i + 1 < t ? i + 1 : s];
        nx += (p[a + 1] - p[b + 1]) * (p[a + 2] + p[b + 2]);
        ny += (p[a + 2] - p[b + 2]) * (p[a] + p[b]);
        nz += (p[a] - p[b]) * (p[a + 1] + p[b + 1]);
        cx += p[a]; cy += p[a + 1]; cz += p[a + 2];
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l; cx /= k; cy /= k; cz /= k;
      for (let i = s; i < t; i++) {
        const a = 3 * fv[i];
        const h = PLANAR_RATE * (nx * (cx - p[a]) + ny * (cy - p[a + 1]) + nz * (cz - p[a + 2]));
        d[a] += h * nx; d[a + 1] += h * ny; d[a + 2] += h * nz;
      }
    }
    for (let i = 0; i < p.length; i++) p[i] += d[i];
  }

  // How far the shape is from its goal: the largest distance of a vertex from the plane of one of
  // its faces and, when canonical, the largest distance of an edge from the unit sphere.
  error() {
    const p = this.pos, fv = this.fv, fo = this.fo, E = this.edges;
    let planar = 0, tangent = 0;
    for (let f = 0; f < fo.length - 1; f++) {
      const s = fo[f], t = fo[f + 1], k = t - s;
      let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
      for (let i = s; i < t; i++) {
        const a = 3 * fv[i], b = 3 * fv[i + 1 < t ? i + 1 : s];
        nx += (p[a + 1] - p[b + 1]) * (p[a + 2] + p[b + 2]);
        ny += (p[a + 2] - p[b + 2]) * (p[a] + p[b]);
        nz += (p[a] - p[b]) * (p[a + 1] + p[b + 1]);
        cx += p[a]; cy += p[a + 1]; cz += p[a + 2];
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      for (let i = s; i < t; i++) {
        const a = 3 * fv[i];
        planar = Math.max(planar, Math.abs(nx * (cx / k - p[a]) + ny * (cy / k - p[a + 1]) + nz * (cz / k - p[a + 2])) / l);
      }
    }
    if (this.mode === 'canonical') {
      for (let e = 0; e < E.length; e += 2) tangent = Math.max(tangent, Math.abs(1 - Math.hypot(...tangentPoint(p, 3 * E[e], 3 * E[e + 1]))));
    }
    return { planar, tangent };
  }
}

// The point of the edge between vertices a and b closest to the origin. Hart uses the whole line
// through the edge; but when that point lies beyond an end, as for the apex of a very flat
// pyramid, pushing it out to the sphere pushes the apex further out, and the apex runs away.
export function tangentPoint(p, a, b) {
  const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
  const s = Math.min(1, Math.max(0, -(dx * p[a] + dy * p[a + 1] + dz * p[a + 2]) / (dx * dx + dy * dy + dz * dz || 1)));
  return [p[a] + s * dx, p[a + 1] + s * dy, p[a + 2] + s * dz];
}
