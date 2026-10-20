// Runs searches off the main thread. Messages:
//   { type: 'measure', id, params }  →  { type: 'measured', id, result }
//   { type: 'search', id, params }   →  { type: 'batch', id, seg, code, n, progress } …, then { type: 'done', id, stats }
//     params.method 'walk' runs the random walk (walk.js) instead of the depth-first search, and
//     its batches hold points (x, y) instead of segments
//   { type: 'probe', id, task }      →  { type: 'probed', id, task, counts }
// Errors come back as { type: 'error', id, message }. A running job is cancelled by terminating the worker.

import { search, measure } from './dfs.js';
import { probe } from './probe.js';
import { walk } from './walk.js';

self.onmessage = e => {
  const { type, id, params } = e.data;
  try {
    if (type === 'measure') {
      self.postMessage({ type: 'measured', id, result: measure(params) });
    } else if (type === 'search') {
      const stats = (params.method === 'walk' ? walk : search)(params, (seg, code, n, progress) => {
        // copy out of the search's buffers so they can be transferred
        const s = seg.slice(), c = code.slice();
        self.postMessage({ type: 'batch', id, seg: s, code: c, n, progress }, [s.buffer, c.buffer]);
      });
      self.postMessage({ type: 'done', id, stats });
    } else if (type === 'probe') {
      // task: { plane: 'a' | 'b', other: [re, im], group, opts, points: Float64Array [re, im, …], and
      // gen, level, dep, cells, which are handed back with the counts }
      const { task } = e.data;
      const pts = task.points, n = pts.length / 2;
      const counts = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        const t = [pts[2 * i], pts[2 * i + 1]];
        counts[i] = task.plane === 'a' ? probe(t, task.other, task.group, task.opts) : probe(task.other, t, task.group, task.opts);
      }
      self.postMessage({ type: 'probed', id, task: { plane: task.plane, gen: task.gen, level: task.level, dep: task.dep, cells: task.cells }, counts }, [counts.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err.message || String(err) });
  }
};
