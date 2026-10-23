// Examples: coordinates as logarithms, in the order of main.js (t1, t2, e1 at 0, e1 at ∞, e2 at 1,
// e2 at 0, e3 at ∞, e3 at 1), and the drawing settings that differ from the defaults.
export const PRESETS = [
  {
    name: 'A convex projective torus',
    note: 'A generic choice of the eight coordinates. Ω is strictly convex with a tangent line at every point of its boundary, but it is no ellipse, and no projective map makes it one.',
    state: { x: [0.6, -0.6, 0.3, -0.2, 0.5, 0.1, -0.4, -0.3], scale: 2 },
  },
  {
    name: 'Hyperbolic torus',
    note: 'All coordinates 1. The flags lie on a conic, Ω is the disk of the Klein model and the triangles are the Farey tessellation, with straight sides.',
    state: { x: [0, 0, 0, 0, 0, 0, 0, 0] },
  },
  {
    name: 'Sheared hyperbolic torus',
    note: 'Triple ratios 1 and equal ratios at the two ends of each edge: the group stays in SO(2,1), so Ω stays a disk, and only the triangles slide along their edges.',
    state: { x: [0, 0, 0.8, 0.8, -0.5, -0.5, -0.3, -0.3] },
  },
  {
    name: 'Bulging triangles',
    note: 'Only the triple ratios move, one up and one down. The disk swells towards T1 and flattens towards T2.',
    state: { x: [1.2, -1.2, 0, 0, 0, 0, 0, 0] },
  },
  {
    name: 'Twisted edges',
    note: 'The two ratios of each edge pull in opposite directions.',
    state: { x: [0, 0, 1.2, -1.2, 1.2, -1.2, 1.2, -1.2], fill: 'quarter' },
  },
  {
    name: 'Hilbert balls',
    note: 'Balls of the Hilbert metric around the centre. In the disk they would be circles; here they take on the shape of Ω towards its boundary.',
    state: { x: [0.6, -0.6, 0.3, -0.2, 0.5, 0.1, -0.4, -0.3], scale: 2, fill: 'none', hilbert: true },
  },
  {
    name: 'Towards a triangle',
    note: 'All coordinates far from 1. Ω tends to a triangle, the triangles of the tessellation crowd into its corners, and the generators’ translation lengths grow.',
    state: { x: [1, -1, 1, -1, 1, -1, 1, -1], scale: 2.5, fill: 'depth' },
  },
  {
    name: 'A hole instead of a cusp',
    note: 'The edge ratios multiply to more than 1, so the loop around the puncture is no longer unipotent and the puncture opens into a hole. The fans of triangles at each corner pile up along straight gaps of the boundary.',
    state: { x: [0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], cusp: false },
  },
];
