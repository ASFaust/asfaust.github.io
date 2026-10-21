// Seed polyhedra, by their vertex coordinates; hull.js finds the faces. The prisms, antiprisms,
// pyramids, cupolae and the Johnson solids among them are stacks of regular polygons ("rings")
// around one axis, with every edge of length 1.

import { hull } from './hull.js';
import { Polyhedron } from './mesh.js';

const PHI = (1 + Math.sqrt(5)) / 2;

// all sign combinations of the non-zero entries of p, under cyclic permutations of the axes
function cyclic(list) {
  const out = [];
  for (const p of list) {
    for (let r = 0; r < 3; r++) {
      const q = [p[r % 3], p[(r + 1) % 3], p[(r + 2) % 3]];
      const signs = q.map(x => (x === 0 ? [0] : [x, -x]));
      for (const a of signs[0]) for (const b of signs[1]) for (const c of signs[2]) out.push([a, b, c]);
    }
  }
  // the cyclic permutations repeat points with all three entries equal in size
  const seen = new Set();
  return out.filter(p => { const k = p.join(); if (seen.has(k)) return false; seen.add(k); return true; });
}

const PLATONIC = {
  T: () => [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
  C: () => cyclic([[1, 1, 1]]),
  O: () => cyclic([[1, 0, 0]]),
  I: () => cyclic([[0, 1, PHI]]),
  D: () => cyclic([[1, 1, 1], [0, 1 / PHI, PHI]]),
};

// circumradius of a regular n-gon with sides of length 1
const R = n => 1 / (2 * Math.sin(Math.PI / n));

// A stack of rings from bottom to top. Each ring is [n, angle of its first vertex]; n = 1 is a
// single point on the axis. Each ring sits above the one below so that the shortest edges between
// them have length 1 (or, where that is impossible, half that height).
function tower(rings) {
  const flat = rings.map(([n, a]) => {
    const r = n === 1 ? 0 : R(n);
    return Array.from({ length: n }, (_, k) => [r * Math.cos(a + 2 * Math.PI * k / n), r * Math.sin(a + 2 * Math.PI * k / n)]);
  });
  const pts = [];
  let z = 0;
  flat.forEach((ring, i) => {
    if (i > 0) {
      let d = Infinity;
      for (const p of ring) for (const q of flat[i - 1]) d = Math.min(d, Math.hypot(p[0] - q[0], p[1] - q[1]));
      z += d < 0.999 ? Math.sqrt(1 - d * d) : 0.5;
    }
    for (const [x, y] of ring) pts.push([x, y, z]);
  });
  return pts;
}

const P = n => tower([[n, 0], [n, 0]]);
const A = n => tower([[n, 0], [n, Math.PI / n]]);
const Y = n => tower([[n, 0], [1, 0]]);
// a cupola: an n-gon on top of a 2n-gon, joined by alternating squares and triangles
const U = n => tower([[2 * n, Math.PI / (2 * n)], [n, 0]]);

// The Johnson solids that are stacks of rings. Rotundae and the augmented and diminished solids
// are missing.
const g = n => Math.PI / n;          // half a step of an n-gon
const h2 = n => Math.PI / (2 * n);   // half a step of a 2n-gon
const JOHNSON = {
  1: ['square pyramid', () => Y(4)],
  2: ['pentagonal pyramid', () => Y(5)],
  3: ['triangular cupola', () => U(3)],
  4: ['square cupola', () => U(4)],
  5: ['pentagonal cupola', () => U(5)],
  7: ['elongated triangular pyramid', () => tower([[3, 0], [3, 0], [1, 0]])],
  8: ['elongated square pyramid', () => tower([[4, 0], [4, 0], [1, 0]])],
  9: ['elongated pentagonal pyramid', () => tower([[5, 0], [5, 0], [1, 0]])],
  10: ['gyroelongated square pyramid', () => tower([[4, 0], [4, g(4)], [1, 0]])],
  11: ['gyroelongated pentagonal pyramid', () => tower([[5, 0], [5, g(5)], [1, 0]])],
  12: ['triangular bipyramid', () => tower([[1, 0], [3, 0], [1, 0]])],
  13: ['pentagonal bipyramid', () => tower([[1, 0], [5, 0], [1, 0]])],
  14: ['elongated triangular bipyramid', () => tower([[1, 0], [3, 0], [3, 0], [1, 0]])],
  15: ['elongated square bipyramid', () => tower([[1, 0], [4, 0], [4, 0], [1, 0]])],
  16: ['elongated pentagonal bipyramid', () => tower([[1, 0], [5, 0], [5, 0], [1, 0]])],
  17: ['gyroelongated square bipyramid', () => tower([[1, 0], [4, 0], [4, g(4)], [1, 0]])],
  18: ['elongated triangular cupola', () => tower([[6, h2(3)], [6, h2(3)], [3, 0]])],
  19: ['elongated square cupola', () => tower([[8, h2(4)], [8, h2(4)], [4, 0]])],
  20: ['elongated pentagonal cupola', () => tower([[10, h2(5)], [10, h2(5)], [5, 0]])],
  22: ['gyroelongated triangular cupola', () => tower([[6, 0], [6, h2(3)], [3, 0]])],
  23: ['gyroelongated square cupola', () => tower([[8, 0], [8, h2(4)], [4, 0]])],
  24: ['gyroelongated pentagonal cupola', () => tower([[10, 0], [10, h2(5)], [5, 0]])],
  27: ['triangular orthobicupola', () => tower([[3, 0], [6, h2(3)], [3, 0]])],
  28: ['square orthobicupola', () => tower([[4, 0], [8, h2(4)], [4, 0]])],
  29: ['square gyrobicupola', () => tower([[4, 0], [8, h2(4)], [4, g(4)]])],
  30: ['pentagonal orthobicupola', () => tower([[5, 0], [10, h2(5)], [5, 0]])],
  31: ['pentagonal gyrobicupola', () => tower([[5, 0], [10, h2(5)], [5, g(5)]])],
  35: ['elongated triangular orthobicupola', () => tower([[3, 0], [6, h2(3)], [6, h2(3)], [3, 0]])],
  36: ['elongated triangular gyrobicupola', () => tower([[3, 0], [6, h2(3)], [6, h2(3)], [3, g(3)]])],
  37: ['elongated square gyrobicupola', () => tower([[4, 0], [8, h2(4)], [8, h2(4)], [4, g(4)]])],
  38: ['elongated pentagonal orthobicupola', () => tower([[5, 0], [10, h2(5)], [10, h2(5)], [5, 0]])],
  39: ['elongated pentagonal gyrobicupola', () => tower([[5, 0], [10, h2(5)], [10, h2(5)], [5, g(5)]])],
  44: ['gyroelongated triangular bicupola', () => tower([[3, 0], [6, h2(3)], [6, 2 * h2(3)], [3, h2(3)]])],
  45: ['gyroelongated square bicupola', () => tower([[4, 0], [8, h2(4)], [8, 2 * h2(4)], [4, h2(4)]])],
  46: ['gyroelongated pentagonal bicupola', () => tower([[5, 0], [10, h2(5)], [10, 2 * h2(5)], [5, h2(5)]])],
};
export const JOHNSON_NAMES = Object.fromEntries(Object.entries(JOHNSON).map(([k, [name]]) => [k, name]));

const PLATONIC_NAMES = { T: 'tetrahedron', C: 'cube', O: 'octahedron', D: 'dodecahedron', I: 'icosahedron' };
const FAMILY = {
  P: ['prism', P, 3], A: ['antiprism', A, 3], Y: ['pyramid', Y, 3], U: ['cupola', U, 2],
};
export const MAX_N = 64;

// The name of a seed symbol such as 'C', 'P5' or 'J27', or throws.
export function seedName(letter, n) {
  if (PLATONIC_NAMES[letter]) return PLATONIC_NAMES[letter];
  if (letter === 'J') {
    if (!JOHNSON[n]) throw new Error(`J${n} is not among the Johnson solids here (J1–5, 7–20, 22–24, 27–31, 35–39, 44–46)`);
    return `${JOHNSON[n][0]} (J${n})`;
  }
  const fam = FAMILY[letter];
  if (!fam) throw new Error(`no seed called ${letter}`);
  if (!Number.isInteger(n)) throw new Error(`${letter} needs a number of sides, as in ${letter}5`);
  if (n < fam[2] || n > MAX_N) throw new Error(`${letter} takes ${fam[2]} to ${MAX_N} sides`);
  return `${n}-sided ${fam[0]}`;
}

// The seed as a Polyhedron. Faces are tagged by their number of sides (the smallest gets 0), and
// all vertices get one more tag, so that a seed already shows its kinds of faces in colour.
export function seed(letter, n) {
  seedName(letter, n);
  const pts = PLATONIC[letter] ? PLATONIC[letter]() : letter === 'J' ? JOHNSON[n][1]() : FAMILY[letter][1](n);
  const { pos, faces } = hull(pts);
  const sides = [...new Set(faces.map(f => f.length))].sort((a, b) => a - b);
  const ftags = Int32Array.from(faces, f => sides.indexOf(f.length));
  const vtags = new Int32Array(pos.length).fill(sides.length);
  return new Polyhedron(faces, Float64Array.from(pos.flat()), ftags, vtags, sides.length + 1);
}
