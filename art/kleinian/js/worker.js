// Runs searches off the main thread. Messages:
//   { type: 'measure', id, params }  →  { type: 'measured', id, result }
//   { type: 'search', id, params }   →  { type: 'batch', id, seg, code, n, progress } …, then { type: 'done', id, stats }
// Errors come back as { type: 'error', id, message }. A running job is cancelled by terminating the worker.

import { search, measure } from './dfs.js';

self.onmessage = e => {
  const { type, id, params } = e.data;
  try {
    if (type === 'measure') {
      self.postMessage({ type: 'measured', id, result: measure(params) });
    } else if (type === 'search') {
      const stats = search(params, (seg, code, n, progress) => {
        // copy out of the search's buffers so they can be transferred
        const s = seg.slice(), c = code.slice();
        self.postMessage({ type: 'batch', id, seg: s, code: c, n, progress }, [s.buffer, c.buffer]);
      });
      self.postMessage({ type: 'done', id, stats });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err.message || String(err) });
  }
};
