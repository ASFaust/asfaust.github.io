// Files to take the shape elsewhere: OBJ keeps the polygons, binary STL (for 3D printing) needs
// triangles, so each face becomes a fan around its centroid.

export function obj(m, pos, title) {
  const lines = [`# ${title}`, `# ${m.nv} vertices, ${m.ne} edges, ${m.nf} faces`];
  for (let i = 0; i < pos.length; i += 3) lines.push(`v ${pos[i].toFixed(6)} ${pos[i + 1].toFixed(6)} ${pos[i + 2].toFixed(6)}`);
  for (let f = 0; f < m.nf; f++) {
    const vs = [];
    for (let i = m.fo[f]; i < m.fo[f + 1]; i++) vs.push(m.fv[i] + 1);
    lines.push('f ' + vs.join(' '));
  }
  return new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
}

export function stl(m, pos) {
  let tris = 0;
  for (let f = 0; f < m.nf; f++) { const d = m.fo[f + 1] - m.fo[f]; tris += d === 3 ? 1 : d; }
  const buf = new ArrayBuffer(84 + 50 * tris), dv = new DataView(buf);
  dv.setUint32(80, tris, true);
  let o = 84;
  const vec = (x, y, z) => { dv.setFloat32(o, x, true); dv.setFloat32(o + 4, y, true); dv.setFloat32(o + 8, z, true); o += 12; };
  const tri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
    vec(nx / l, ny / l, nz / l); vec(...a); vec(...b); vec(...c);
    o += 2;
  };
  const P = v => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]];
  for (let f = 0; f < m.nf; f++) {
    const a = m.fo[f], b = m.fo[f + 1], d = b - a;
    if (d === 3) { tri(P(m.fv[a]), P(m.fv[a + 1]), P(m.fv[a + 2])); continue; }
    const c = [0, 0, 0];
    for (let i = a; i < b; i++) for (let k = 0; k < 3; k++) c[k] += pos[3 * m.fv[i] + k] / d;
    for (let i = a; i < b; i++) tri(c, P(m.fv[i]), P(m.fv[i + 1 < b ? i + 1 : a]));
  }
  return new Blob([buf], { type: 'model/stl' });
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
