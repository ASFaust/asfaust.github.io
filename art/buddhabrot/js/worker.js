// Escape tests, boundary refinement and orbit tracing. Each worker keeps its own histogram between
// messages; compute.js sends the jobs. Messages, each answered with progress messages and then one
// { cmd: 'done', … } (or { cmd: 'error', message }):
//   { cmd: 'refine', count, steps, maxIter, radius, inside, insideReal, seed }  → { pts }: boundary samples
//   { cmd: 'histInit', res, b, maxIter, weighted }                               → starts an empty histogram
//   { cmd: 'trace', pts, escapingOnly, nearby, sigma, seed }                     → adds the orbits of pts
//   { cmd: 'seed', pts }                                                         → { pts }: those whose orbits reach the view
//   { cmd: 'metro', pts, steps, burn, large, rmin, rmax, seed }                  → runs one Metropolis chain per point
//   { cmd: 'histGet' }                                                           → { hist }, handing the histogram over
import { rng } from './rng.js';

var hist = null, res = 0, bx0 = 0, by0 = 0, sx = 0, sy = 0, histIter = 0;

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

// Counts every point of the orbit, also of orbits that never escape (the nearby clouds rely on that).
function trace(cr, ci) {
  var zr = 0, zi = 0;
  for (var k = 0; k < histIter; k++) {
    var t = zr * zr - zi * zi + cr;
    zi = 2 * zr * zi + ci;
    zr = t;
    if (zr * zr + zi * zi > 4) break;
    var fx = (zr - bx0) * sx, fy = (zi - by0) * sy;
    if (fx >= 0 && fx < res && fy >= 0 && fy < res) hist[(fx | 0) * res + (fy | 0)]++;
  }
}

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
    if (zr * zr + zi * zi > 4) return n;
    var fx = (zr - bx0) * sx, fy = (zi - by0) * sy;
    if (fx >= 0 && fx < res && fy >= 0 && fy < res) buf[n++] = (fx | 0) * res + (fy | 0);
  }
  return 0;
}

function progress(n) { postMessage({ cmd: 'progress', n: n }); }

self.onmessage = function(e) {
  var d = e.data;
  try {
    if (d.cmd === 'refine') {
      // Each sample starts as a pair: an outside point on a circle of radius d.radius at a uniform angle, and an inside point.
      var m = d.count, steps = d.steps, maxIter = d.maxIter, rand = rng(d.seed);
      var outPts = new Float64Array(2 * m), pending = 0;
      for (var j = 0; j < m; j++) {
        var th = 2 * Math.PI * rand(), oR = d.radius * Math.cos(th), oI = d.radius * Math.sin(th), inR = d.insideReal, inI = 0;
        if (d.inside === 'bulbs') {
          // μ uniform in the unit disk; the main cardioid is c = μ/2 − μ²/4, the period-2 bulb c = −1 + μ/4.
          // Pick between them by area (3π/8 against π/16, so 6 : 1).
          var mrad = Math.sqrt(rand()), mth = 2 * Math.PI * rand(), mr = mrad * Math.cos(mth), mi = mrad * Math.sin(mth);
          if (rand() < 6 / 7) { inR = mr / 2 - (mr * mr - mi * mi) / 4; inI = mi / 2 - mr * mi / 2; }
          else { inR = -1 + mr / 4; inI = mi / 4; }
        }
        for (var s = 0; s < steps; s++) {
          var dx = Math.abs(oR - inR), dy = Math.abs(oI - inI), size = dx > dy ? dx : dy;
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
    } else if (d.cmd === 'histInit') {
      res = d.res;
      bx0 = d.b.xmin; by0 = d.b.ymin;
      sx = res / (d.b.xmax - d.b.xmin);
      sy = res / (d.b.ymax - d.b.ymin);
      histIter = d.maxIter;
      hist = d.weighted ? new Float64Array(res * res) : new Uint32Array(res * res);
      postMessage({ cmd: 'done' });
    } else if (d.cmd === 'trace') {
      var pts = d.pts, count = pts.length / 2, nearby = d.nearby, sigma = d.sigma, r = rng(d.seed), done = 0;
      var tbuf = new Int32Array(histIter);
      for (var i = 0; i < count; i++) {
        var pr = pts[2 * i], pi = pts[2 * i + 1];
        if (d.escapingOnly) { var tn = hits(pr, pi, tbuf); for (var k = 0; k < tn; k++) hist[tbuf[k]]++; }
        else trace(pr, pi);
        for (var k = 0; k < nearby; k++) {
          // Box-Muller: two independent normals for the real and imaginary offset
          var rad = Math.sqrt(-2 * Math.log(1 - r())) * sigma, th = 2 * Math.PI * r();
          trace(pr + rad * Math.cos(th), pi + rad * Math.sin(th));
        }
        done += 1 + nearby;
        if (done >= 4096) { progress(done); done = 0; }
      }
      progress(done);
      postMessage({ cmd: 'done' });
    } else if (d.cmd === 'seed') {
      // keep the starting points whose orbits reach the view
      var sp = d.pts, sn = sp.length / 2, sbuf = new Int32Array(histIter), keep = [], sdone = 0;
      for (var i = 0; i < sn; i++) {
        if (hits(sp[2 * i], sp[2 * i + 1], sbuf) > 0) keep.push(sp[2 * i], sp[2 * i + 1]);
        if (++sdone === 4096) { progress(sdone); sdone = 0; }
      }
      progress(sdone);
      var kept = new Float64Array(keep);
      postMessage({ cmd: 'done', pts: kept }, [kept.buffer]);
    } else if (d.cmd === 'metro') {
      // Metropolis chains over c with target f(c) = orbit points in the view. Both proposals are symmetric:
      // a large step is uniform on [-2, 2]², which holds every c with f > 0, and a small step has a log-uniform
      // radius and uniform angle. So a proposal is accepted with probability min(1, f' / f).
      var mp = d.pts, chains = mp.length / 2, mr = rng(d.seed), mdone = 0;
      var cur = new Int32Array(histIter), prop = new Int32Array(histIter), swap;
      var size = Math.max(res / sx, res / sy), logMin = Math.log(d.rmin * size), logSpan = Math.log(d.rmax / d.rmin);
      for (var c = 0; c < chains; c++) {
        var cr = mp[2 * c], ci = mp[2 * c + 1], fc = hits(cr, ci, cur);
        for (var s = -d.burn; s < d.steps; s++) {
          var nr, ni;
          if (mr() < d.large) { nr = 4 * mr() - 2; ni = 4 * mr() - 2; }
          else {
            var rad = Math.exp(logMin + logSpan * mr()), th = 2 * Math.PI * mr();
            nr = cr + rad * Math.cos(th); ni = ci + rad * Math.sin(th);
          }
          var fp = hits(nr, ni, prop), a = fp >= fc ? 1 : fp / fc, k, wt;
          // Expected-value splatting: proposal and current state both count, by their acceptance odds.
          // Each orbit spreads total weight 1 over its f points, so the image is that of uniformly sampled c.
          if (s >= 0) {
            if (fp > 0) { wt = a / fp; for (k = 0; k < fp; k++) hist[prop[k]] += wt; }
            if (a < 1) { wt = (1 - a) / fc; for (k = 0; k < fc; k++) hist[cur[k]] += wt; }
          }
          if (mr() < a) { swap = cur; cur = prop; prop = swap; cr = nr; ci = ni; fc = fp; }
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
