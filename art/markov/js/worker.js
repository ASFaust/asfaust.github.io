// Computes the escape times of every step-th row of an image, starting at row first.
//   { id, params, view: {cx, cy, half}, W, first, step, maxIt }
//     → { id, first, step, data: Float32Array of those rows, in order, −1 for bounded orbits }
import { slicer, escape, parseWord } from './markov.js';

self.onmessage = e => {
  const { id, params, view, W, first, step, maxIt } = e.data;
  try {
    const start = slicer(params), word = parseWord(params.word);
    const rows = Math.max(0, Math.ceil((W - first) / step));
    const data = new Float32Array(rows * W);
    const p = new Float64Array(6), px = 2 * view.half / W;
    for (let j = 0; j < rows; j++) {
      const wi = view.cy + view.half - (first + j * step + 0.5) * px;
      for (let i = 0; i < W; i++) {
        start(view.cx - view.half + (i + 0.5) * px, wi, p);
        data[j * W + i] = escape(p, word, maxIt);
      }
    }
    self.postMessage({ id, first, step, data }, [data.buffer]);
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
