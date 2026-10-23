// Examples. state: the map (mode, slice, k on the surface or y0 on the line, z0, the word) and the
// view; anything left out takes the defaults in main.js. The colour stays as it is.
export const PRESETS = [
  {
    name: 'Two islands',
    note: 'The word s₁s₂s₁s₃ on a conic of S_k. Far points escape at once; the slowest crowd along the Julia set, a dust of islands.',
    state: { slice: 'surface', k: [-0.76, 0.09], z0: [-0.2, -0.88], word: '1213' },
  },
  {
    name: 'A coast, closer',
    note: 'A piece of the same Julia set, twelve times closer: the same scalloped edges recur at every scale.',
    state: { slice: 'surface', k: [-0.76, 0.09], z0: [-0.2, -0.88], word: '1213', view: { cx: 0.55, cy: -0.9, r: 0.25 } },
  },
  {
    name: 'Two arms',
    note: 'The simplest hyperbolic word, s₁s₂s₃.',
    state: { slice: 'surface', k: [2.02, -0.19], z0: [-1.48, -0.42], word: '123' },
  },
  {
    name: 'Pinwheel',
    note: 's₁s₃s₂s₃ on a surface with k near 2, where the commutator has trace near 0.',
    state: { slice: 'surface', k: [2.04, 0.02], z0: [-1.32, -1.17], word: '1323' },
  },
  {
    name: 'Commas',
    note: 'A five-letter word, s₁s₂s₃s₁s₃, whose Julia set breaks into short strokes along a spiral.',
    state: { slice: 'surface', k: [3.84, -0.55], z0: [-1.75, 0.48], word: '12313' },
  },
  {
    name: 'A line through ℂ³',
    note: 'Here y and z are fixed and x runs over the plane, so every pixel lies on a different surface S_k.',
    state: { slice: 'line', y0: [0.23, -0.47], z0: [-0.65, -0.3], word: '121323', view: { cx: -0.5, cy: 0.6, r: 1.6 } },
  },
  {
    name: 'Every word: the Markov surface',
    note: 'The Bowditch set on S_0, the punctured tori, along the conic z = 2.5. In the light part every word escapes; in the black part the moves are chaotic, and every Julia set lies there. Bowditch conjectured that for k = 0 the light part is exactly the quasi-Fuchsian groups.',
    state: { mode: 'all', slice: 'surface', k: [0, 0], z0: [2.5, 0], view: { cx: 0, cy: 0, r: 8 } },
  },
  {
    name: 'Every word: a pinwheel',
    note: 'The same surface along the conic z = 2.2 + 0.6i, where the two halves turn into a pinwheel.',
    state: { mode: 'all', slice: 'surface', k: [0, 0], z0: [2.2, 0.6], view: { cx: 0, cy: 0, r: 6 } },
  },
  {
    name: 'Every word: lace',
    note: 'On a surface with k = −2.5 + 0.1i the chaotic part frays into filaments, and islands where every word escapes float among them.',
    state: { mode: 'all', slice: 'surface', k: [-2.5, 0.1], z0: [3, 0.5], view: { cx: 0, cy: 0, r: 6 } },
  },
  {
    name: 'Every word: a coastline',
    note: 'A close look at the edge of a Bowditch set, found by “New place”.',
    state: { mode: 'all', slice: 'surface', k: [-2.951, -0.029], z0: [-1.479, 2.24], view: { cx: -0.7807464545326752, cy: -0.5625, r: 0.0129 } },
  },
];
