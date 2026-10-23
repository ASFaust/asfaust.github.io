// Detached solid faces (R7): every face shrunk towards its centroid and extruded inwards into a
// slab, so each face becomes a solid of its own with sides. A pass over the drawn geometry, not a
// change to the polyhedron: the viewer draws, colours, traces and exports the tiles in place of the
// faces.
//
// A tile of a face with d corners has the shrunk face on top (as the face, facing out), the same
// moved inwards along the face's normal underneath (reversed, facing in), and d quadrilaterals
// round the sides. With no thickness the tile is the shrunk face alone.

// The faces of the tiles, as the viewer's meshes have them (nf, nv, ne, fo, fv), and src: the face
// of the polyhedron each one belongs to.
export function tileMesh(m, solid) {
  const fo = [0], fv = [], src = [];
  let nv = 0;
  const face = (f, vs) => { fv.push(...vs); fo.push(fv.length); src.push(f); };
  for (let f = 0; f < m.nf; f++) {
    const d = m.fo[f + 1] - m.fo[f], top = k => nv + (k % d), bot = k => nv + d + (k % d);
    face(f, Array.from({ length: d }, (_, k) => top(k)));
    if (solid) {
      face(f, Array.from({ length: d }, (_, k) => bot(d - 1 - k)));
      // each side runs along its top edge backwards, as the face next to it must
      for (let k = 0; k < d; k++) face(f, [top(k + 1), top(k), bot(k), bot(k + 1)]);
    }
    nv += solid ? 2 * d : d;
  }
  return { nf: src.length, nv, ne: fv.length / 2, fo: Int32Array.from(fo), fv: Int32Array.from(fv), src: Int32Array.from(src) };
}

// The corners of the tiles for the positions p of the polyhedron m: scale is how far each face
// shrinks towards its centroid (1 not at all), depth how far the underside lies below it.
export function tilePositions(m, p, solid, scale, depth) {
  const out = new Float32Array(3 * tileMesh.count(m, solid));
  let o = 0;
  for (let f = 0; f < m.nf; f++) {
    const a = m.fo[f], d = m.fo[f + 1] - a, V = k => 3 * m.fv[a + (k % d)];
    // centroid and Newell normal, as the viewer shades the face
    let cx = 0, cy = 0, cz = 0, nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < d; k++) {
      const u = V(k), w = V(k + 1);
      nx += (p[u + 1] - p[w + 1]) * (p[u + 2] + p[w + 2]);
      ny += (p[u + 2] - p[w + 2]) * (p[u] + p[w]);
      nz += (p[u] - p[w]) * (p[u + 1] + p[w + 1]);
      cx += p[u] / d; cy += p[u + 1] / d; cz += p[u + 2] / d;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    for (let k = 0; k < d; k++, o += 3) {
      const u = V(k);
      out[o] = cx + scale * (p[u] - cx); out[o + 1] = cy + scale * (p[u + 1] - cy); out[o + 2] = cz + scale * (p[u + 2] - cz);
    }
    if (solid) {
      const dx = depth * nx / l, dy = depth * ny / l, dz = depth * nz / l;
      for (let k = 0; k < d; k++, o += 3) {
        const t = o - 3 * d;
        out[o] = out[t] - dx; out[o + 1] = out[t + 1] - dy; out[o + 2] = out[t + 2] - dz;
      }
    }
  }
  return out;
}

// the number of tile corners
tileMesh.count = (m, solid) => (solid ? 2 : 1) * m.fo[m.nf];
