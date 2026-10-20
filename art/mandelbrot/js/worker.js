// Computes and colours every step-th row of the image, starting at row k, and keeps the raw
// samples so a new colouring needs no new iterations. Messages, each answered with the same rid:
//   { type: 'compute', view: {cx, cy, r}, W, aa, k, step, maxIt, bailout }
//       → { type: 'progress', done } …, then { type: 'computed', tmin, tmax }
//   { type: 'range', tmin, tmax, lw }  →  { type: 'ranged', imin, imax }
//   { type: 'colour', tmin, tmax, imin, imax, lw, rgb, lab, invert, circle }
//       (rgb, lab: the colour ramp as sRGB bytes and as OKLab; invert: white inside instead of black)
//       → { type: 'coloured', data } (RGBA of this worker's rows, in order)
//   { type: 'render', …compute's fields, …colour's fields, k: first row, step: 1, rows }
//       → { type: 'rendered', data }: computes and colours a strip of rows at once, keeping nothing,
//       for exports too big to hold every sample
// Errors come back as { type: 'error', message }.

import { timeDistance } from './mandel.js';
import { srgb } from './colour.js';

const D_MAX = 4;            // distances are stored in sample pixels up to this, enough for any line width
const D_SCALE = 65535 / D_MAX;

let job = null; // { W, aa, k, step, rows, maxIt, counts: Uint16Array, dist: Uint16Array }

// Iterate the samples of the rows k, k + step, … (m.rows of them, else down to the bottom).
function sample(m, rid) {
  const { view, W, aa, k, step, maxIt, bailout } = m;
  const S = W * aa, px = 2 * view.r / S;
  const rows = m.rows ?? Math.max(0, Math.ceil((W - k) / step));
  const counts = new Uint16Array(rows * aa * S);
  const dist = new Uint16Array(rows * aa * S);
  // periodicity tolerance well below the sample spacing, so slow escapers are not mistaken for cycles
  const tol2 = Math.min(1e-20, (px * 1e-3) ** 2);
  const out = { d: 0 };
  let tmin = Infinity, tmax = -Infinity, last = 0;
  for (let j = 0; j < rows; j++) {
    const y = k + j * step;
    for (let a = 0; a < aa; a++) {
      const sy = y * aa + a;
      const ci = view.cy + (1 - 2 * (sy + 0.5) / S) * view.r;
      let idx = (j * aa + a) * S;
      for (let sx = 0; sx < S; sx++, idx++) {
        const cr = view.cx + (2 * (sx + 0.5) / S - 1) * view.r;
        const n = timeDistance(cr, ci, maxIt, bailout, tol2, out);
        counts[idx] = n;
        dist[idx] = Math.min(D_MAX, out.d / px) * D_SCALE;
        if (n < tmin) tmin = n;
        if (n > tmax) tmax = n;
      }
    }
    const now = performance.now();
    if (rid && now - last > 100) { last = now; self.postMessage({ type: 'progress', rid, done: j + 1 }); }
  }
  return { W, aa, k, step, rows, maxIt, counts, dist, tmin, tmax };
}

function compute(m, rid) {
  job = sample(m, rid);
  self.postMessage({ type: 'computed', rid, tmin: job.tmin, tmax: job.tmax });
}

// The grey value of a sample: the escape time, light far out and dark towards the set, cut down
// to the distance estimate within one (scaled) pixel of the border. Far from it, at least 0.2.
function grey(counts, dist, idx, t0, tk, lw) {
  const i = 1 - (counts[idx] - t0) * tk;
  const d = dist[idx] / D_SCALE / lw;
  return d >= 1 ? Math.max(0.2, i) : Math.min(d, i);
}

// The range of grey values outside the set; the colour ramp spans it, the inside stays black.
function range(m, rid) {
  if (!job) throw new Error('Nothing computed yet.');
  const { counts, dist, maxIt } = job;
  const tk = 1 / (m.tmax - m.tmin || 1);
  let imin = Infinity, imax = -Infinity;
  for (let idx = 0; idx < counts.length; idx++) {
    if (counts[idx] === maxIt) continue;
    const g = grey(counts, dist, idx, m.tmin, tk, m.lw);
    if (g < imin) imin = g;
    if (g > imax) imax = g;
  }
  self.postMessage({ type: 'ranged', rid, imin, imax });
}

// RGBA of the rows of job j
function shade(j, m) {
  const { W, aa, k, step, rows, maxIt, counts, dist } = j;
  const S = W * aa, N = aa * aa;
  const tk = 1 / (m.tmax - m.tmin || 1);
  const lut = m.rgb, lab = m.lab, top = lut.length / 3 - 1;
  const inside = m.invert ? 255 : 0, Lin = m.invert ? 1 : 0;
  // the normalised grey, averaged over the samples outside the set, indexes the colour ramp. L and C
  // are linear in it, so this is the average in OKLab.
  const ik = top / (m.imax - m.imin || 1);
  const lw = m.lw, half = W / 2;
  const data = new Uint8ClampedArray(rows * W * 4);
  let o = 0;
  for (let jr = 0; jr < rows; jr++) {
    const y = k + jr * step;
    for (let x = 0; x < W; x++) {
      let sum = 0, n = 0;
      for (let a = 0; a < aa; a++) {
        let idx = (jr * aa + a) * S + x * aa;
        for (let c = 0; c < aa; c++, idx++) {
          if (counts[idx] === maxIt) continue;
          sum += grey(counts, dist, idx, m.tmin, tk, lw) - m.imin;
          n++;
        }
      }
      let r = inside, g = inside, b = inside;
      if (n) {
        const i = 3 * Math.min(top, Math.max(0, Math.round(sum / n * ik)));
        if (n === N) { r = lut[i]; g = lut[i + 1]; b = lut[i + 2]; }
        else {
          // part inside: mix with the inside's black or white in OKLab
          const f = n / N;
          const c = srgb(f * lab[i] + (1 - f) * Lin, f * lab[i + 1], f * lab[i + 2]);
          r = 255 * c[0]; g = 255 * c[1]; b = 255 * c[2];
        }
      }
      let alpha = 1;
      if (m.circle) {
        const dx = x + 0.5 - half, dy = y + 0.5 - half;
        alpha = Math.max(0, Math.min(1, half - Math.sqrt(dx * dx + dy * dy) + 0.5));
      }
      data[o++] = r + 0.5;
      data[o++] = g + 0.5;
      data[o++] = b + 0.5;
      data[o++] = alpha * 255 + 0.5;
    }
  }
  return data;
}

function colour(m, rid) {
  if (!job) throw new Error('Nothing computed yet.');
  const data = shade(job, m);
  self.postMessage({ type: 'coloured', rid, data }, [data.buffer]);
}

function render(m, rid) {
  const data = shade(sample(m, 0), m);
  self.postMessage({ type: 'rendered', rid, data }, [data.buffer]);
}

self.onmessage = e => {
  const m = e.data;
  try {
    if (m.type === 'compute') compute(m, m.rid);
    else if (m.type === 'range') range(m, m.rid);
    else if (m.type === 'colour') colour(m, m.rid);
    else if (m.type === 'render') render(m, m.rid);
  } catch (err) {
    self.postMessage({ type: 'error', rid: m.rid, message: err.message || String(err) });
  }
};
