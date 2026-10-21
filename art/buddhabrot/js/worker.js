// Escape tests, boundary refinement and orbit tracing. Each worker keeps its own histogram between
// messages; compute.js sends the jobs. Messages, each answered with progress messages and then one
// { cmd: 'done', … } (or { cmd: 'error', message }):
//   { cmd: 'refine', pairs, steps, maxIter, seed }                               → { pts }: one boundary point per inside/outside pair
//   { cmd: 'histInit', res, b, maxIter, bail, weighted, grid, bands }            → starts an empty histogram; orbits are recorded
//                                                                                  until |z| > bail; grid for metro;
//                                                                                  bands [short, mid]: one histogram per orbit-length band
//   { cmd: 'trace', pts, escapingOnly, nearby, sigma, seed }                     → adds the orbits of pts
//   { cmd: 'seed', pts }                                                         → { pts, f }: those whose orbits reach the view, and their hits
//   { cmd: 'metro', pts, steps, burn, large, rmin, rmax, seed }                  → runs one Metropolis chain per point
//   { cmd: 'grid', r0, r1, n, x0, y0, h, maxIter }                              → { inside }: 1 for grid vertices that stay bounded
//   { cmd: 'histGet' }                                                           → { hist }, handing the histogram over (bands one after another)
import { rng } from './rng.js';
import { pick, weight } from './grid.js';

var hist = null, res = 0, bx0 = 0, by0 = 0, sx = 0, sy = 0, histIter = 0, bail2 = 4, grid = null, bands = null;
var orbitLen = 0;   // set by trace() and hits(): the iteration at which the orbit escaped, or histIter if it did not

// Offset into hist of the band for an orbit of length len. With bands [short, mid], the orbits up to short iterations
// go to band 0, up to mid to band 1, the rest to band 2; without bands, everything goes to the one histogram.
function bandOffset(len) { return bands ? (len <= bands[0] ? 0 : len <= bands[1] ? 1 : 2) * res * res : 0; }

function escapes(cr, ci, maxIter) {
  // Main cardioid and period-2 bulb never escape; skipping them is exact and saves most of the work there.
  var q = (cr - 0.25) * (cr - 0.25) + ci * ci;
  if (q * (q + (cr - 0.25)) <= 0.25 * ci * ci) return false;
  if ((cr + 1) * (cr + 1) + ci * ci <= 0.0625) return false;
  var zr = 0, zi = 0;
  for (var k = 0; k < maxIter; k++) {
    var t = zr * zr - zi * zi + cr;
    zi = 2 * zr * zi + ci;
    zr = t;
    if (zr * zr + zi * zi > 4) return true;
  }
  return false;
}

// Histogram indices of every point of the orbit inside the view, also of orbits that never escape, written to buf;
// returns their count. orbitLen tells whether it escaped.
function trace(cr, ci, buf) {
  var zr = 0, zi = 0, n = 0;
  for (var k = 0; k < histIter; k++) {
    var t = zr * zr - zi * zi + cr;
    zi = 2 * zr * zi + ci;
    zr = t;
    if (zr * zr + zi * zi > bail2) { orbitLen = k + 1; return n; }
    var fx = (zr - bx0) * sx, fy = (zi - by0) * sy;
    if (fx >= 0 && fx < res && fy >= 0 && fy < res) buf[n++] = (fx | 0) * res + (fy | 0);
  }
  orbitLen = histIter;
  return n;
}
function add(buf, n) { var o = bandOffset(orbitLen); for (var k = 0; k < n; k++) hist[o + buf[k]]++; }

// Histogram indices of an escaping orbit's points inside the view, written to buf; returns their count. Orbits that never escape count 0.
function hits(cr, ci, buf) {
  var q = (cr - 0.25) * (cr - 0.25) + ci * ci;
  if (q * (q + (cr - 0.25)) <= 0.25 * ci * ci) return 0;
  if ((cr + 1) * (cr + 1) + ci * ci <= 0.0625) return 0;
  var zr = 0, zi = 0, n = 0;
  for (var k = 0; k < histIter; k++) {
    var t = zr * zr - zi * zi + cr;
    zi = 2 * zr * zi + ci;
    zr = t;
    if (zr * zr + zi * zi > bail2) { orbitLen = k + 1; return n; }
    var fx = (zr - bx0) * sx, fy = (zi - by0) * sy;
    if (fx >= 0 && fx < res && fy >= 0 && fy < res) buf[n++] = (fx | 0) * res + (fy | 0);
  }
  orbitLen = histIter;
  return 0;
}

function progress(n) { postMessage({ cmd: 'progress', n: n }); }

self.onmessage = function(e) {
  var d = e.data;
  try {
    if (d.cmd === 'refine') {
      // Random bisection: a random point near the middle of the pair replaces the end on its side, steps times; the
      // outside end is kept. The pairs come from the border grid's mixed cells (compute.js), a cell apart. Bisection
      // stops once the pair is 1e-10 apart: closer, rounding errors amplified along thousands of iterations decide the
      // escape test, and those orbits piled up into a bright ring at radius 2 (docs/sampling.md).
      var pp = d.pairs, m = pp.length / 4, steps = d.steps, maxIter = d.maxIter, rand = rng(d.seed);
      var outPts = new Float64Array(2 * m), pending = 0;
      for (var j = 0; j < m; j++) {
        var inR = pp[4 * j], inI = pp[4 * j + 1], oR = pp[4 * j + 2], oI = pp[4 * j + 3];
        for (var s = 0; s < steps; s++) {
          var dx = Math.abs(oR - inR), dy = Math.abs(oI - inI), size = dx > dy ? dx : dy;
          if (size < 1e-10) break;
          var cR = 0.5 * (inR + oR) + (rand() - 0.5) * size;
          var cI = 0.5 * (inI + oI) + (rand() - 0.5) * size;
          if (escapes(cR, cI, maxIter)) { oR = cR; oI = cI; } else { inR = cR; inI = cI; }
        }
        outPts[2 * j] = oR;
        outPts[2 * j + 1] = oI;
        if (++pending === 256) { progress(pending * steps); pending = 0; }
      }
      progress(pending * steps);
      postMessage({ cmd: 'done', pts: outPts }, [outPts.buffer]);
    } else if (d.cmd === 'grid') {
      // rows r0 … r1−1 of the vertices x0 + i·h + (y0 + j·h)i, j < n
      var gi = new Uint8Array((d.r1 - d.r0) * d.n);
      for (var i = d.r0; i < d.r1; i++) {
        for (var j = 0; j < d.n; j++) if (!escapes(d.x0 + i * d.h, d.y0 + j * d.h, d.maxIter)) gi[(i - d.r0) * d.n + j] = 1;
        progress(1);
      }
      postMessage({ cmd: 'done', inside: gi }, [gi.buffer]);
    } else if (d.cmd === 'histInit') {
      res = d.res;
      bx0 = d.b.xmin; by0 = d.b.ymin;
      sx = res / (d.b.xmax - d.b.xmin);
      sy = res / (d.b.ymax - d.b.ymin);
      histIter = d.maxIter;
      bail2 = d.bail * d.bail;
      grid = d.grid;
      bands = d.bands;
      var size = res * res * (bands ? 3 : 1);
      hist = d.weighted ? new Float64Array(size) : new Uint32Array(size);
      postMessage({ cmd: 'done' });
    } else if (d.cmd === 'trace') {
      var pts = d.pts, count = pts.length / 2, nearby = d.nearby, sigma = d.sigma, r = rng(d.seed), done = 0;
      var tbuf = new Int32Array(histIter);
      for (var i = 0; i < count; i++) {
        var pr = pts[2 * i], pi = pts[2 * i + 1];
        add(tbuf, d.escapingOnly ? hits(pr, pi, tbuf) : trace(pr, pi, tbuf));
        // Nearby points follow orbits similar to the sample's, slightly shifted, so they blur the few points a long
        // orbit revisits over and over. Only diverging ones count: one that lands inside the set is drawn again, up to
        // 8 times. Counting those too filled the body with orbits spiralling into the attractors of the main cardioid.
        for (var k = 0; k < nearby; k++) {
          for (var tries = 0; tries < 8; tries++) {
            // Box-Muller: two independent normals for the real and imaginary offset
            var rad = Math.sqrt(-2 * Math.log(1 - r())) * sigma, th = 2 * Math.PI * r();
            var tn = trace(pr + rad * Math.cos(th), pi + rad * Math.sin(th), tbuf);
            if (orbitLen < histIter) { add(tbuf, tn); break; }
          }
        }
        done += 1 + nearby;
        if (done >= 4096) { progress(done); done = 0; }
      }
      progress(done);
      postMessage({ cmd: 'done' });
    } else if (d.cmd === 'seed') {
      // keep the starting points whose orbits reach the view, with their number of hits f
      var sp = d.pts, sn = sp.length / 2, sbuf = new Int32Array(histIter), keep = [], keepF = [], sdone = 0;
      for (var i = 0; i < sn; i++) {
        var sf = hits(sp[2 * i], sp[2 * i + 1], sbuf);
        if (sf > 0) { keep.push(sp[2 * i], sp[2 * i + 1]); keepF.push(sf); }
        if (++sdone === 4096) { progress(sdone); sdone = 0; }
      }
      progress(sdone);
      var kept = new Float64Array(keep), keptF = new Float64Array(keepF);
      postMessage({ cmd: 'done', pts: kept, f: keptF }, [kept.buffer, keptF.buffer]);
    } else if (d.cmd === 'metro') {
      // Metropolis chains over c with target p(c)·f(c): p the sampler's density, f the orbit points in the view.
      // A small step has a log-uniform radius and uniform angle, so it is symmetric, and is accepted with probability
      // min(1, p'f' / pf). A large step is drawn from p itself (grid.js), so it is accepted with min(1, f' / f).
      var mp = d.pts, chains = mp.length / 2, mr = rng(d.seed), mdone = 0, g = grid, gp = [0, 0];
      var cur = new Int32Array(histIter), prop = new Int32Array(histIter), swap;
      var size = Math.max(res / sx, res / sy), logMin = Math.log(d.rmin * size), logSpan = Math.log(d.rmax / d.rmin);
      for (var c = 0; c < chains; c++) {
        var cr = mp[2 * c], ci = mp[2 * c + 1], fc = hits(cr, ci, cur), wc = weight(g, cr, ci), oc = bandOffset(orbitLen), op = 0;
        for (var s = -d.burn; s < d.steps; s++) {
          var nr, ni, wp, fp, a;
          if (mr() < d.large) {
            pick(g, mr, gp); nr = gp[0]; ni = gp[1];
            wp = weight(g, nr, ni);
            fp = hits(nr, ni, prop);
            op = bandOffset(orbitLen);
            a = fp >= fc ? 1 : fp / fc;
          } else {
            var rad = Math.exp(logMin + logSpan * mr()), th = 2 * Math.PI * mr();
            nr = cr + rad * Math.cos(th); ni = ci + rad * Math.sin(th);
            wp = weight(g, nr, ni);
            fp = wp > 0 ? hits(nr, ni, prop) : 0;
            op = bandOffset(orbitLen);
            a = Math.min(1, wp * fp / (wc * fc));
          }
          var k, wt;
          // Expected-value splatting: proposal and current state both count, by their acceptance odds.
          // Each orbit spreads total weight 1 over its f points, so the image is that of c sampled with density p.
          if (s >= 0) {
            if (fp > 0) { wt = a / fp; for (k = 0; k < fp; k++) hist[op + prop[k]] += wt; }
            if (a < 1) { wt = (1 - a) / fc; for (k = 0; k < fc; k++) hist[oc + cur[k]] += wt; }
          }
          if (mr() < a) { swap = cur; cur = prop; prop = swap; cr = nr; ci = ni; fc = fp; wc = wp; oc = op; }
          if (++mdone === 4096) { progress(mdone); mdone = 0; }
        }
      }
      progress(mdone);
      postMessage({ cmd: 'done' });
    } else if (d.cmd === 'histGet') {
      var h = hist;
      hist = null;
      postMessage({ cmd: 'done', hist: h }, [h.buffer]);
    }
  } catch (err) {
    postMessage({ cmd: 'error', message: String(err && err.message || err) });
  }
};
