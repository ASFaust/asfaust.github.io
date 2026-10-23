// Line drawing export. A search streams its segments into a SegmentStore, as it would into the
// renderer, and buildSvg writes them out as an SVG for pen plotters, cutters and 3D programs:
// - coordinates in millimetres, rounded to 1 µm, with no background, so nothing but the curve is drawn
// - one Inkscape layer per colour, so each colour can go to its own pen
// - the segments are clipped to the view and chained into long paths through their shared end
//   points, with repeated segments dropped, so a pen draws each piece once and seldom lifts

import { colouring, GEN_NAMES } from './renderer.js';

export class SegmentStore {
  constructor() { this.chunks = []; this.maxLen = 1; }

  add(seg, code, n) {
    if (!n) return;
    this.chunks.push({ seg, code, n });
    for (let i = 0; i < n; i++) this.maxLen = Math.max(this.maxLen, code[i] >>> 18);
  }

  get segments() { let s = 0; for (const c of this.chunks) s += c.n; return s; }
}

// Clip the segment to the square [0, w]² (Liang–Barsky); false if it misses.
const CL = new Float64Array(4);
function clip(ax, ay, bx, by, w) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  for (const [p, q] of [[-dx, ax], [dx, w - ax], [-dy, ay], [dy, w - ay]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  CL[0] = ax + t0 * dx; CL[1] = ay + t0 * dy; CL[2] = ax + t1 * dx; CL[3] = ay + t1 * dy;
  return true;
}

// Chain segments [x0, y0, x1, y1, …] into paths. End points closer than about tol are one vertex,
// and segments shorter than merge are contracted to a point.
// Returns the vertices and the paths as lists of vertex ids, in the order the segments came.
function chain(pts, tol, merge) {
  const ids = new Map(), vx = [], vy = [];
  const vertex = (x, y) => {
    const key = Math.round(x / tol) * 262144 + Math.round(y / tol);
    let id = ids.get(key);
    if (id === undefined) { id = vx.length; ids.set(key, id); vx.push(x); vy.push(y); }
    return id;
  };
  const ends = new Int32Array(pts.length / 2);
  for (let i = 0; i < ends.length; i++) ends[i] = vertex(pts[2 * i], pts[2 * i + 1]);
  // Branches stopped at the maximum word length jitter in place, in steps of float precision.
  // Contracting them, as long as each cluster stays within merge of its first point, joins paths
  // they would cut. A coarser merge does harm: whole whorl tips collapse, and the edges into
  // them become duplicates.
  const root = Int32Array.from(vx, (_, i) => i);
  const find = a => { while (root[a] !== a) a = root[a] = root[root[a]]; return a; };
  for (let i = 0; i < ends.length; i += 2) {
    const a = find(ends[i]), b = find(ends[i + 1]);
    if (a !== b && Math.hypot(vx[a] - vx[b], vy[a] - vy[b]) < merge) root[b] = a;
  }
  const eu = [], ev = [], seen = new Set();
  for (let i = 0; i < ends.length; i += 2) {
    const u = find(ends[i]), v = find(ends[i + 1]);
    if (u === v) continue;
    const key = u < v ? u * 67108864 + v : v * 67108864 + u;
    if (seen.has(key)) continue;
    seen.add(key);
    eu.push(u); ev.push(v);
  }
  // The fewest paths that draw every edge once: join each vertex of odd degree to an extra vertex X,
  // which makes all degrees even, walk an Euler circuit through each connected part (Hierholzer),
  // and cut the circuits at X. That leaves half as many paths as there are odd vertices in a
  // part, or a single closed one.
  const X = vx.length, nv = X + 1;
  const deg = new Int32Array(nv);
  for (let e = 0; e < eu.length; e++) { deg[eu[e]]++; deg[ev[e]]++; }
  for (let v = 0; v < X; v++) if (deg[v] & 1) { eu.push(v); ev.push(X); }
  const ne = eu.length;
  const start = new Int32Array(nv + 1);
  for (let e = 0; e < ne; e++) { start[eu[e] + 1]++; start[ev[e] + 1]++; }
  for (let v = 0; v < nv; v++) start[v + 1] += start[v];
  const adj = new Int32Array(2 * ne), fill = start.slice(0, nv);
  for (let e = 0; e < ne; e++) { adj[fill[eu[e]]++] = e; adj[fill[ev[e]]++] = e; }
  // the far end of an unused edge out of v, marking it used, or −1
  const used = new Uint8Array(ne), next = start.slice(0, nv);
  const step = v => {
    for (let j = next[v]; j < start[v + 1]; j++) {
      const e = adj[j];
      if (used[e]) continue;
      next[v] = j + 1;
      used[e] = 1;
      return eu[e] === v ? ev[e] : eu[e];
    }
    next[v] = start[v + 1];
    return -1;
  };
  const paths = [];
  let path = [];
  const cut = () => { if (path.length > 1) paths.push(path); path = []; };
  const circuit = v0 => {
    const stack = [v0];
    while (stack.length) {
      const w = step(stack[stack.length - 1]);
      if (w >= 0) { stack.push(w); continue; }
      const v = stack.pop();
      if (v === X) cut(); else path.push(v);
    }
    cut();
  };
  circuit(X);
  for (let e = 0; e < ne; e++) if (!used[e]) circuit(eu[e]);
  return { vx, vy, paths };
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// store: the segments, in pixels of a px × px view. size: the drawing's width in mm.
// style: { mode, depth } as for the renderer. lineWidth: in mm. tiles: the renderer's pixel maps.
// title, desc: text for the file. Returns { text, paths, points }.
export function buildSvg(store, { px, size, style, lineWidth, tiles = [[1, 0, 0]], title = '', desc = '' }) {
  const { colors, index } = colouring({ ...style, theme: 'light' }, store.maxLen);
  const layers = colors.map(() => []);
  for (const { seg, code, n } of store.chunks) {
    for (let i = 0; i < n; i++) {
      const L = layers[index(code[i])], o = 4 * i;
      for (const [s, ox, oy] of tiles) {
        if (!clip(s * seg[o] + ox, s * seg[o + 1] + oy, s * seg[o + 2] + ox, s * seg[o + 3] + oy, px)) continue;
        L.push(CL[0], CL[1], CL[2], CL[3]);
      }
    }
  }
  const f = 1000 * size / px; // pixels to µm
  const num = u => String(u / 1000);
  const label = i => style.mode === 'mono' ? 'limit set'
    : style.mode === 'level' ? `word length, band ${i + 1} of ${colors.length}`
    : `${style.mode === 'last' ? 'last letter' : `letter ${style.depth}`} ${GEN_NAMES[i]}`;
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${size}mm" height="${size}mm" viewBox="0 0 ${size} ${size}">`,
    `<title>${esc(title)}</title>`,
    `<desc>${esc(desc)}</desc>`,
  ];
  let paths = 0, points = 0;
  layers.forEach((L, i) => {
    if (!L.length) return;
    // A fine grid: a coarse one would also join nearby points that no segment connects.
    const { vx, vy, paths: P } = chain(L, px * 1e-5, px * 2e-5);
    const els = [], d = [];
    let count = 0;
    const flush = () => {
      if (d.length) els.push(`<path d="${d.join(' ')}"/>`);
      d.length = 0; count = 0;
    };
    for (const p of P) {
      // in whole µm, relative to the previous point; steps that round to nothing are dropped
      let X = Math.round(vx[p[0]] * f), Y = Math.round(vy[p[0]] * f);
      const parts = [`M${num(X)} ${num(Y)}l`];
      for (let j = 1; j < p.length; j++) {
        const x = Math.round(vx[p[j]] * f), y = Math.round(vy[p[j]] * f);
        if (x === X && y === Y) continue;
        parts.push(`${num(x - X)} ${num(y - Y)}`);
        X = x; Y = y;
      }
      if (parts.length < 2) continue;
      d.push(parts.join(' '));
      paths++; points += parts.length;
      // keep each path element to a size every program reads
      if ((count += parts.length) > 20000) flush();
    }
    flush();
    if (!els.length) return;
    out.push(`<g inkscape:groupmode="layer" inkscape:label="${esc(label(i))}" id="layer${i + 1}" fill="none" stroke="${colors[i]}" stroke-width="${+lineWidth.toPrecision(3)}" stroke-linecap="round" stroke-linejoin="round">`,
      ...els, '</g>');
  });
  out.push('</svg>', '');
  return { text: out.join('\n'), paths, points };
}
