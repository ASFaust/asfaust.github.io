// The icosahedral grid: every field of the globe lives on the vertices of a subdivided
// icosahedron. Level n has 10·4ⁿ + 2 cells; seen from above, each cell is a hexagon of the
// dual mesh, except the 12 pentagons at the icosahedron's own vertices.
//
// Layout. The 20 faces pair up into 10 diamonds: diamond d < 5 is the north cap face
// (N, Uᵢ, Uᵢ₊₁) with the band face below it, diamond d ≥ 5 is the south cap face with the
// band face above it. Each diamond is an (m+1)×(m+1) "padded" lattice, m = 2ⁿ, with corners
//   P00 = pole, P10 = (i, 0), P01 = (0, m), P11 = opposite corner,
// split into triangles along the diagonal P10–P01. A diamond owns the lattice points with
// 0 ≤ i < m and 0 < j ≤ m, which is m² cells, so the cells of diamond d are a plain m×m array
//   id = d·m² + i·m + (j − 1),
// and the two poles come last: N = 10m², S = 10m² + 1. The other padded points (j = 0 or
// i = m) belong to a neighbouring diamond, found once through their exact position.
//
// Positions come from recursive bisection, as in ICON: each new point is the normalised
// midpoint of two points of the level above, so level n is a subset of level n+1, with
// padded point (i, j) at (2i, 2j). Cell areas stay within 1.56× of each other at every level.
// Shared edges come out bitwise identical on both diamonds, since x + y = y + x exactly.

const PHI = Math.atan(0.5);

function ringPoint(lat, lon) {
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

// corners [P00, P10, P01, P11] of diamond d
export function diamondCorners(d) {
  const N = [0, 0, 1], S = [0, 0, -1];
  const U = k => ringPoint(PHI, 2 * Math.PI * ((k % 5 + 5) % 5) / 5);
  const L = k => ringPoint(-PHI, 2 * Math.PI * ((k % 5 + 5) % 5) / 5 + Math.PI / 5);
  if (d < 5) return [N, U(d), U(d + 1), L(d)];
  const k = d - 5;
  return [S, L(k), L(k + 1), U(k + 1)];
}

// The padded lattice of one diamond as a Float64Array of (m+1)² unit vectors.
function paddedPositions(d, m) {
  const P = m + 1, out = new Float64Array(P * P * 3);
  const set = (i, j, v) => { const o = (i * P + j) * 3; out[o] = v[0]; out[o + 1] = v[1]; out[o + 2] = v[2]; };
  const mid = (i, j, a, b, c, e) => {
    const oa = (a * P + b) * 3, ob = (c * P + e) * 3;
    const x = out[oa] + out[ob], y = out[oa + 1] + out[ob + 1], z = out[oa + 2] + out[ob + 2];
    const r = Math.sqrt(x * x + y * y + z * z);
    const o = (i * P + j) * 3;
    out[o] = x / r; out[o + 1] = y / r; out[o + 2] = z / r;
  };
  const [c00, c10, c01, c11] = diamondCorners(d);
  set(0, 0, c00); set(m, 0, c10); set(0, m, c01); set(m, m, c11);
  for (let s = m; s > 1; s >>= 1) {
    const h = s >> 1;
    for (let i = 0; i <= m; i += s) {
      for (let j = 0; j <= m; j += s) {
        if (i + s <= m) mid(i + h, j, i, j, i + s, j);
        if (j + s <= m) mid(i, j + h, i, j, i, j + s);
        if (i + s <= m && j + s <= m) mid(i + h, j + h, i + s, j, i, j + s);
      }
    }
  }
  return out;
}

// spherical triangle area (unit sphere)
function triArea(p, a, b, c) {
  const ax = p[3 * a], ay = p[3 * a + 1], az = p[3 * a + 2];
  const bx = p[3 * b], by = p[3 * b + 1], bz = p[3 * b + 2];
  const cx = p[3 * c], cy = p[3 * c + 1], cz = p[3 * c + 2];
  const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  const den = 1 + (ax * bx + ay * by + az * bz) + (bx * cx + by * cy + bz * cz) + (cx * ax + cy * ay + cz * az);
  return 2 * Math.atan2(Math.abs(det), den);
}

export function cellCount(level) { return 10 * 4 ** level + 2; }

// Builds the grid of one level:
//   pos        Float64Array(3N)  unit vectors
//   nbr        Int32Array(6N)    neighbours, counter-clockwise seen from outside; −1 pads pentagons
//   nbrCount   Uint8Array(N)     5 or 6
//   area       Float64Array(N)   dual cell areas on the unit sphere (they sum to 4π)
//   tris       Uint32Array(3T)   T = 20·4ⁿ triangles, counter-clockwise seen from outside
//   padIds     Int32Array[10]    padded lattice point → cell id, per diamond
export function buildGrid(level) {
  const m = 1 << level, P = m + 1, mm = m * m;
  const N = 10 * mm + 2, north = 10 * mm, south = north + 1;
  const pos = new Float64Array(3 * N);
  const pads = [], padIds = [];
  for (let d = 0; d < 10; d++) pads.push(paddedPositions(d, m));

  // owned points first, remembering the boundary ones by exact position
  const byKey = new Map();
  const key = (p, o) => p[o] + ',' + p[o + 1] + ',' + p[o + 2];
  for (let d = 0; d < 10; d++) {
    const p = pads[d], ids = new Int32Array(P * P).fill(-1);
    for (let i = 0; i < m; i++) {
      for (let j = 1; j <= m; j++) {
        const id = d * mm + i * m + (j - 1), o = (i * P + j) * 3;
        ids[i * P + j] = id;
        pos[3 * id] = p[o]; pos[3 * id + 1] = p[o + 1]; pos[3 * id + 2] = p[o + 2];
        if (i === 0 || j === m) byKey.set(key(p, o), id);
      }
    }
    padIds.push(ids);
  }
  pos[3 * north + 2] = 1; pos[3 * south + 2] = -1;
  byKey.set(key(pos, 3 * north), north);
  byKey.set(key(pos, 3 * south), south);
  for (let d = 0; d < 10; d++) {
    const p = pads[d], ids = padIds[d];
    for (let i = 0; i <= m; i++) {
      for (let j = 0; j <= m; j++) {
        if (ids[i * P + j] >= 0) continue;
        const id = byKey.get(key(p, (i * P + j) * 3));
        if (id === undefined) throw new Error(`grid: no owner for diamond ${d} point (${i}, ${j})`);
        ids[i * P + j] = id;
      }
    }
  }

  // triangles, oriented counter-clockwise seen from outside
  const T = 20 * mm, tris = new Uint32Array(3 * T);
  let t = 0;
  for (let d = 0; d < 10; d++) {
    const ids = padIds[d];
    const flip = orientation(pos, ids[0], ids[m * P], ids[m]) < 0;
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        const a = ids[i * P + j], b = ids[(i + 1) * P + j], c = ids[i * P + j + 1], e = ids[(i + 1) * P + j + 1];
        if (flip) { tris[t++] = a; tris[t++] = c; tris[t++] = b; tris[t++] = b; tris[t++] = c; tris[t++] = e; }
        else { tris[t++] = a; tris[t++] = b; tris[t++] = c; tris[t++] = b; tris[t++] = e; tris[t++] = c; }
      }
    }
  }

  // dual areas and neighbour rings from the triangles: around vertex a, a CCW triangle
  // (a, b, c) says c follows b
  const area = new Float64Array(N);
  const from = new Int32Array(6 * N), to = new Int32Array(6 * N), cnt = new Uint8Array(N);
  const link = (a, b, c) => { const k = 6 * a + cnt[a]++; from[k] = b; to[k] = c; };
  for (let k = 0; k < T; k++) {
    const a = tris[3 * k], b = tris[3 * k + 1], c = tris[3 * k + 2];
    const A = triArea(pos, a, b, c) / 3;
    area[a] += A; area[b] += A; area[c] += A;
    link(a, b, c); link(b, c, a); link(c, a, b);
  }
  const nbr = new Int32Array(6 * N).fill(-1);
  for (let a = 0; a < N; a++) {
    const n = cnt[a], o = 6 * a;
    let cur = from[o];
    for (let s = 0; s < n; s++) {
      nbr[o + s] = cur;
      let next = -1;
      for (let r = 0; r < n; r++) if (from[o + r] === cur) { next = to[o + r]; break; }
      cur = next;
    }
  }

  return { level, m, count: N, north, south, pos, nbr, nbrCount: cnt, area, tris, padIds };
}

function orientation(pos, a, b, c) {
  const ax = pos[3 * a], ay = pos[3 * a + 1], az = pos[3 * a + 2];
  const ux = pos[3 * b] - ax, uy = pos[3 * b + 1] - ay, uz = pos[3 * b + 2] - az;
  const vx = pos[3 * c] - ax, vy = pos[3 * c + 1] - ay, vz = pos[3 * c + 2] - az;
  return ax * (uy * vz - uz * vy) + ay * (uz * vx - ux * vz) + az * (ux * vy - uy * vx);
}

// diamond and padded lattice coordinates (d, i, j) of a cell; the poles give d = −1
export function cellCoords(grid, id) {
  const mm = grid.m * grid.m;
  if (id >= 10 * mm) return [-1, 0, 0];
  const d = Math.floor(id / mm), r = id - d * mm;
  return [d, Math.floor(r / grid.m), r % grid.m + 1];
}

export function lonLat(grid, id) {
  const x = grid.pos[3 * id], y = grid.pos[3 * id + 1], z = grid.pos[3 * id + 2];
  return [Math.atan2(y, x), Math.asin(Math.max(-1, Math.min(1, z)))];
}

// Coarse → fine: points both grids share keep their value; a new point is the mean of the
// two coarse points it is the midpoint of.
export function prolong(coarse, gc, gf) {
  const out = new Float32Array(gf.count), P = gc.m + 1;
  out[gf.north] = coarse[gc.north]; out[gf.south] = coarse[gc.south];
  for (let id = 0; id < gf.north; id++) {
    const [d, I, J] = cellCoords(gf, id), ids = gc.padIds[d];
    const i = I >> 1, j = J >> 1;
    if (!(I & 1) && !(J & 1)) out[id] = coarse[ids[i * P + j]];
    else if (!(J & 1)) out[id] = 0.5 * (coarse[ids[i * P + j]] + coarse[ids[(i + 1) * P + j]]);
    else if (!(I & 1)) out[id] = 0.5 * (coarse[ids[i * P + j]] + coarse[ids[i * P + j + 1]]);
    else out[id] = 0.5 * (coarse[ids[(i + 1) * P + j]] + coarse[ids[i * P + j + 1]]);
  }
  return out;
}

// Fine → coarse: each coarse cell takes its own fine cell plus half of each fine neighbour,
// area-weighted.
export function restrict(fine, gf, gc) {
  const out = new Float32Array(gc.count), Pf = gf.m + 1;
  const one = (fid) => {
    let s = fine[fid] * gf.area[fid], w = gf.area[fid];
    for (let k = 0; k < gf.nbrCount[fid]; k++) {
      const n = gf.nbr[6 * fid + k], a = 0.5 * gf.area[n];
      s += fine[n] * a; w += a;
    }
    return s / w;
  };
  for (let id = 0; id < gc.north; id++) {
    const [d, i, j] = cellCoords(gc, id);
    out[id] = one(gf.padIds[d][2 * i * Pf + 2 * j]);
  }
  out[gc.north] = one(gf.north); out[gc.south] = one(gf.south);
  return out;
}
