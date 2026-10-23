// Examples. state: slice, k (on the surface) or y0 (on the line), z0, the word, and anything else
// that differs from the defaults in main.js.
export const PRESETS = [
  {
    name: 'Two islands',
    note: 'The word s₁s₂s₁s₃ on a conic of S_k. Far points escape at once; the slowest, darkest ones crowd along the Julia set.',
    state: { slice: 'surface', k: [-0.76, 0.09], z0: [-0.2, -0.88], word: '1213' },
  },
  {
    name: 'A coast, closer',
    note: 'A piece of the same Julia set, eight times closer: the same scalloped edges recur at every scale.',
    state: { slice: 'surface', k: [-0.76, 0.09], z0: [-0.2, -0.88], word: '1213', view: { cx: 0.55, cy: -0.9, half: 0.25 } },
  },
  {
    name: 'Two arms',
    note: 'The simplest hyperbolic word, s₁s₂s₃.',
    state: { slice: 'surface', k: [2.02, -0.19], z0: [-1.48, -0.42], word: '123' },
  },
  {
    name: 'Pinwheel',
    note: 's₁s₃s₂s₃ on a surface with k near 2, where the commutator has trace near 0.',
    state: { slice: 'surface', k: [2.04, 0.02], z0: [-1.32, -1.17], word: '1323', pal: 'ice', bands: 3 },
  },
  {
    name: 'Scattered bats',
    note: 's₁s₃s₂s₃ again, on another surface.',
    state: { slice: 'surface', k: [1.4, 1.31], z0: [0.28, -0.62], word: '1323' },
  },
  {
    name: 'Commas',
    note: 'A five-letter word, s₁s₂s₃s₁s₃, whose Julia set breaks into short strokes along a spiral.',
    state: { slice: 'surface', k: [3.84, -0.55], z0: [-1.75, 0.48], word: '12313' },
  },
  {
    name: 'A line through ℂ³',
    note: 'Here y and z are fixed and x runs over the plane, so every pixel lies on a different surface S_k.',
    state: { slice: 'line', y0: [0.23, -0.47], z0: [-0.65, -0.3], word: '121323', view: { cx: -0.5, cy: 0.6, half: 1.6 } },
  },
  {
    name: 'Another line',
    note: 's₁s₃s₂s₃ along a line.',
    state: { slice: 'line', y0: [0.79, 0.46], z0: [0.46, -0.69], word: '1323', pal: 'night' },
  },
];
