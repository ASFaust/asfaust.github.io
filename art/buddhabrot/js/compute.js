// The heavy part: a pool of workers (worker.js) and the pipeline that turns settings into a histogram.
// No DOM here; main.js shows the progress.
import { rng, mixSeed } from './rng.js';
import { pick } from './grid.js';
import { fullBounds } from './state.js';

var workerURL = new URL('./worker.js', import.meta.url);
export var nCores = Math.max(1, Math.min(32, navigator.hardwareConcurrency || 4));
var pool = [];
function ensurePool(n) { while (pool.length < n) pool.push(new Worker(workerURL, { type: 'module' })); }
// Stopping a run terminates the workers; their pending jobs never settle, and the next run starts new ones.
export function killPool() { pool.forEach(function(w) { w.terminate(); }); pool = []; }

// Hands jobs to idle workers. With as many jobs as workers, worker i gets job i. Pinned, worker i gets jobs i, i + n, …
// whatever their timing, so that what each worker adds up does not depend on timing.
function runJobs(jobs, nWorkers, onDone, onProgress, pinned) {
  return new Promise(function(resolve, reject) {
    if (!jobs.length) return resolve();
    ensurePool(nWorkers);
    var next = 0, finished = 0, nextOf = [];
    function feed(w, wi) {
      var j = pinned ? (nextOf[wi] = nextOf[wi] === undefined ? wi : nextOf[wi] + nWorkers) : next++;
      if (j >= jobs.length) return;
      var job = jobs[j];
      w.onmessage = function(e) {
        var d = e.data;
        if (d.cmd === 'progress') { if (onProgress) onProgress(d.n); return; }
        if (d.cmd === 'error') { reject(new Error(d.message)); return; }
        if (onDone) onDone(job, d);
        if (++finished === jobs.length) resolve(); else feed(w, wi);
      };
      w.onerror = function(e) { e.preventDefault(); reject(new Error(e.message || 'A worker failed')); };
      w.postMessage(job.msg, job.transfer || []);
    }
    for (var i = 0; i < Math.min(nWorkers, jobs.length); i++) feed(pool[i], i);
  });
}

function tick() { return new Promise(function(r) { setTimeout(r, 0); }); }

function chunks(total, nWorkers, perWorker, minSize) {
  var size = Math.max(minSize, Math.ceil(total / (nWorkers * perWorker))), list = [];
  for (var s = 0; s < total; s += size) list.push([s, Math.min(total, s + size)]);
  return list;
}

// ---------- the border grid: starting points with a known density ----------
// A G × G grid of cells over the box that holds the set. A cell is marked when its corners disagree on escaping
// within maxIter, and the marks are widened by one cell. The marks are then blurred with a Gaussian of GRID.blur cells,
// and the blurred values are the cells' weights (grid.js). Starting points pick a cell by weight and a uniform point
// within it, so their density is known (piecewise constant), which is what lets Metropolis zoom into the same
// distribution. The blur matters because every orbit's first point is c itself, so the density shows in the image:
// unblurred, isolated marked cells near small minibrots drew as floating squares. It also gives thin, isolated
// structures (the antenna, stray cells) less weight than dense stretches of the boundary.
// GRID is exported so that experiments can change it; the cache notices.
export var GRID = { G: 1024, x0: -2, y0: -1.25, size: 2.5, blur: 2 };
var gridCache = null;   // { key, G, x0, y0, h, w, cells, cum } (grid.js)

function gaussBlur(src, G, sigma) {
  var out = Float32Array.from(src);
  if (sigma <= 0) return out;
  var r = Math.ceil(3 * sigma), k = new Float32Array(2 * r + 1), ks = 0, i, j, t;
  for (t = -r; t <= r; t++) ks += (k[t + r] = Math.exp(-0.5 * t * t / (sigma * sigma)));
  for (t = 0; t < k.length; t++) k[t] /= ks;
  var tmp = new Float32Array(G * G);
  for (i = 0; i < G; i++) for (j = 0; j < G; j++) {
    var a = 0;
    for (t = -r; t <= r; t++) { var jj = j + t; if (jj >= 0 && jj < G) a += k[t + r] * out[i * G + jj]; }
    tmp[i * G + j] = a;
  }
  for (i = 0; i < G; i++) for (j = 0; j < G; j++) {
    var b = 0;
    for (t = -r; t <= r; t++) { var ii = i + t; if (ii >= 0 && ii < G) b += k[t + r] * tmp[ii * G + j]; }
    out[i * G + j] = b;
  }
  return out;
}

export async function borderGrid(maxIter, ui) {
  var key = [maxIter, GRID.G, GRID.blur, GRID.y0].join();
  if (gridCache && gridCache.key === key) return gridCache;
  // The vertices sit half a cell off the real axis. On it, the antenna's points belong to the set, so a vertex row on
  // the axis marked the whole antenna, which has no area, as boundary; its band then drew a bright line down the image.
  var G = GRID.G, n = G + 1, h = GRID.size / G, y0 = GRID.y0 + h / 2, inside = new Uint8Array(n * n), i, j;
  ui.stage('Grid', 0, 10, n);
  await runJobs(chunks(n, nCores, 8, 1).map(function(c) {
    return { start: c[0], msg: { cmd: 'grid', r0: c[0], r1: c[1], n: n, x0: GRID.x0, y0: y0, h: h, maxIter: maxIter } };
  }), nCores, function(job, d) { inside.set(d.inside, job.start * n); }, ui.progress);
  if (!ui.live()) return null;
  // The mixed cells, with their corners' inside flags (bit 0: (i, j), 1: (i, j+1), 2: (i+1, j), 3: (i+1, j+1)), also
  // give the bisection sampler its pairs of close inside and outside points.
  var mark = new Uint8Array(G * G), mask = new Uint8Array(G * G), edgeList = [], cornerList = [];
  for (i = 0; i < G; i++) for (j = 0; j < G; j++) {
    var c0 = inside[i * n + j], c1 = inside[i * n + j + 1], c2 = inside[(i + 1) * n + j], c3 = inside[(i + 1) * n + j + 1], s = c0 + c1 + c2 + c3;
    if (s > 0 && s < 4) { mark[i * G + j] = 1; edgeList.push(i * G + j); cornerList.push(c0 | c1 << 1 | c2 << 2 | c3 << 3); }
  }
  for (i = 0; i < G; i++) for (j = 0; j < G; j++) {
    var on = 0;
    for (var di = -1; di <= 1 && !on; di++) for (var dj = -1; dj <= 1; dj++) {
      var a = i + di, b = j + dj;
      if (a >= 0 && a < G && b >= 0 && b < G && mark[a * G + b]) { on = 1; break; }
    }
    mask[i * G + j] = on;
  }
  // weights below 1/1000 are dropped, so the support stays a narrow band around the boundary
  var w = gaussBlur(mask, G, GRID.blur), count = 0;
  for (i = 0; i < G * G; i++) { if (w[i] < 1e-3) w[i] = 0; else count++; }
  var cells = new Int32Array(count), cum = new Float64Array(count), k = 0, sum = 0;
  for (i = 0; i < G * G; i++) if (w[i] > 0) { cells[k] = i; cum[k++] = sum += w[i]; }
  gridCache = { key: key, G: G, x0: GRID.x0, y0: y0, h: h, w: w, cells: cells, cum: cum,
    edges: Int32Array.from(edgeList), corners: Uint8Array.from(cornerList) };
  return gridCache;
}

// ---------- balance: an artistic weighting of the bisection sampler's starting cells ----------
// The boundary has two families: the main cardioid with everything attached to it, and the head (the period-2 bulb
// with its own bulbs, the antenna and the minibrots on it), split where the two touch, at Re c = -0.75. The cardioid
// family holds about three quarters of the boundary cells, and only orbits from the head family draw much of the
// image's head, so few samples fill the body first. With balance t, each cell is drawn with weight n^-t, n being its
// family's number of cells: t = 0 samples the boundary as it comes, t = 1 gives both families the same share
// (docs/sampling.md).
var HEAD_SPLIT = -0.75;
function familyWeights(grid, t) {
  var ne = grid.edges.length, head = new Uint8Array(ne), n = [0, 0], k;
  for (k = 0; k < ne; k++) { head[k] = grid.x0 + ((grid.edges[k] / grid.G | 0) + 0.5) * grid.h < HEAD_SPLIT ? 1 : 0; n[head[k]]++; }
  var w = [Math.pow(n[0] || 1, -t), Math.pow(n[1] || 1, -t)], cum = new Float64Array(ne), acc = 0;
  for (k = 0; k < ne; k++) cum[k] = acc += w[head[k]];
  return cum;
}

// Samples are processed in batches of BATCH.size, all into the same per-worker histograms, so that the starting points of
// one batch at a time are in memory (16 bytes each, 32 for bisection pairs): up to 10⁸ samples would not fit at once.
// The first batch is exactly what a single run used to be, so renders up to BATCH samples did not change; later batches
// take their random streams from indices offset by BATCH_SEEDS. BATCH.size is exported so that tests can lower it.
export var BATCH = { size: 5e6 };
// Metropolis seeds its chains from at least SEEDING.min starting points per batch, however few the chains: with few long
// chains, as many seeding points as chains found no orbit into a deep view at all.
export var SEEDING = { min: 2e5 };
// Metropolis settings, chosen by measurement (tests/metro-tuning.js, docs/sampling.md#choosing-the-metropolis-settings):
// no burn-in (chains start in their stationary distribution), a large step (a fresh point from the sampler) with
// probability 0.02, and small steps of log-uniform radius from 1e-7 to 1 times the view's size. Chains are longer the
// smaller the view: METRO.chain / view width steps, between chainMin and chainMax (60 steps for a view 0.5 wide, 1000
// from 0.03 down). They are no settings; tests may override them with p.chain_length, p.burn_in, p.large_step,
// p.mutation_min and p.mutation_max.
export var METRO = { chain: 30, chainMin: 30, chainMax: 1000, burn: 0, large: 0.02, rmin: 1e-7, rmax: 1 };
function metroSettings(p) {
  function or(v, d) { return v === undefined ? d : v; }
  var width = Math.max(p.xmax - p.xmin, p.ymax - p.ymin);
  return { chain: or(p.chain_length, Math.round(Math.min(METRO.chainMax, Math.max(METRO.chainMin, METRO.chain / width)))), burn: or(p.burn_in, METRO.burn), large: or(p.large_step, METRO.large),
    rmin: or(p.mutation_min, METRO.rmin), rmax: or(p.mutation_max, METRO.rmax) };
}
var BATCH_SEEDS = 1048576;

// Computes the histogram for the settings p. The callbacks report progress:
//   ui.stage(name, lo, hi, total)  a new stage, covering lo–hi % of the bar, with total units of work
//   ui.progress(n)                 n more units done
//   ui.live()                      false once the run was stopped or replaced; compute then returns null
// Returns { data: Float32Array, res, b: bounds, total: orbits traced, norm: data × norm = hits per sample per unit area,
// bands: 1, or 3 with colouring by orbit length (data then holds the short, mid and long band one after another) }.
export async function compute(p, ui) {
  var b = { xmin: p.xmin, xmax: p.xmax, ymin: p.ymin, ymax: p.ymax };
  // Orbits that cross a zoomed view mostly start outside it, so starting points always come from the whole set.
  // Both samplers start from the border grid. The grid sampler has a known density, and only escaping orbits count
  // with it; the bisection sampler's points are far closer to the set, with an unknown density.
  // The whole set is traced directly. A zoomed view uses Metropolis, which follows the orbits that cross it: traced
  // directly, most samples would miss it. The bisection sampler never zooms (state.js). Tests may force a method with
  // p.method ('direct' or 'metropolis'), as tests/distribution.js does for its brute-force reference; it is no setting.
  var metro = p.method ? p.method === 'metropolis' : !fullBounds(p), bisection = p.sampler === 'bisection', known = !bisection;
  var grid = await borderGrid(p.max_iter, ui);
  if (!grid) return null;

  // One histogram per tracing worker; cap workers so the histograms fit in memory.
  // Metropolis splats fractional weights, which need doubles, and needs the grid's density in every worker.
  // Colouring by orbit length keeps one histogram per band (short, mid, long), one after another.
  var bands = p.colour_mode === 'length' ? [p.band_short, p.band_mid] : null, nb = bands ? 3 : 1;
  var res = p.resolution, bytes = res * res * nb * (metro ? 8 : 4);
  var nTrace = Math.max(1, Math.min(nCores, Math.floor(768e6 / bytes)));
  var inits = [];
  // Orbits are recorded until they leave the circle around 0 that holds the whole view, not only until |z| > 2, so
  // that the view's corners beyond radius 2 get the escaping orbits' last points too and do not stay black.
  var bail = Math.max(2, Math.hypot(Math.max(-b.xmin, b.xmax), Math.max(-b.ymin, b.ymax)));
  // Each orbit's first p.skip_points points are left out (default 1). The first is c itself, so recording it draws the
  // sampler's own density: 8 % of a small zoom's weight, 0.7 % of the whole set's. Later points carry that density too,
  // mapped, wherever orbits return close to c (every p-th point near a minibrot of period p); that is why the density
  // must be smooth (grid.js), which skipping cannot replace.
  var skip = p.skip_points;
  for (var w = 0; w < nTrace; w++) inits.push({ msg: { cmd: 'histInit', res: res, b: b, maxIter: p.max_iter, bail: bail, weighted: metro, grid: metro ? grid : null, bands: bands, skip: skip } });
  await runJobs(inits, nTrace);

  // Samples count orbits in both methods: a zoom runs samples / chain length chains.
  var ms = metro ? metroSettings(p) : null, units = metro ? Math.max(1, Math.round(p.samples / ms.chain)) : p.samples;
  var nBatch = Math.ceil(units / BATCH.size), fsum = 0, seeded = 0;
  for (var bi = 0; bi < nBatch; bi++) {
    var n = Math.min(BATCH.size, units - bi * BATCH.size), base = bi * BATCH_SEEDS;
    // this batch's stages share its slice of the bar between 10 and 95 %
    var stage = function(name, lo, hi, total) {
      ui.stage(name + (nBatch > 1 ? ' ' + (bi + 1) + '/' + nBatch : ''), 10 + (85 * bi + lo - 10) / nBatch, 10 + (85 * bi + hi - 10) / nBatch, total);
    };
    var r = await batch(p, n, base, grid, ms, bisection, known, nTrace, stage, ui);
    if (r === null) return null;
    fsum += r.fsum; seeded += r.seeded;
  }

  // norm turns the histogram into hits per starting sample per unit area of the plane, which does not depend on the
  // number of samples, the resolution or the zoom (docs/sampling.md, normalization).
  var total, norm, pixelArea = (b.xmax - b.xmin) * (b.ymax - b.ymin) / (res * res);
  if (!metro) {
    total = p.samples * (1 + (known ? 0 : p.nearby_points));
    norm = 1 / (total * pixelArea);
  } else {
    total = units * (ms.burn + ms.chain);
    // Each chain step spreads weight 1 over the view, so the histogram estimates E_π[hits / f] per step, with π ∝ p·f.
    // Hits per p-sample are E_p[hits] = E_π[hits / f] · E_p[f], and E_p[f] is the mean f over all seeding samples.
    norm = (fsum / seeded) / (units * ms.chain * pixelArea);
  }

  // combine, in worker order: Metropolis's fractional weights have sums that depend on their order
  ui.stage('Combining', 95, 100);
  var sum = new Float32Array(res * res * nb), gets = [], hists = [];
  for (w = 0; w < nTrace; w++) gets.push({ w: w, msg: { cmd: 'histGet' } });
  await runJobs(gets, nTrace, function(job, d) { hists[job.w] = d.hist; });
  hists.forEach(function(h) { for (var k = 0; k < h.length; k++) sum[k] += h[k]; });
  if (!ui.live()) return null;
  return { data: sum, res: res, b: b, total: total, norm: norm, bands: nb };
}

// One batch of n samples (for Metropolis, n chains, with the settings ms; ms is null for the direct method) into the
// workers' histograms. Random streams are indexed from base.
// Returns { fsum, seeded }: for Metropolis, the sum of f over the batch's seeding points and their number (0 otherwise),
// or null once the run was stopped.
async function batch(p, n, base, grid, ms, bisection, known, nTrace, stage, ui) {
  var metro = !!ms;
  // 1. starting points c, two numbers per sample; Metropolis tests at least SEEDING.min of them for seeds
  var ns = metro ? Math.max(n, SEEDING.min) : n, outside = new Float64Array(2 * ns);
  if (!bisection) {
    stage('Sampling', 10, 12);
    await tick();
    var grand = rng(mixSeed(p.seed, 5, base)), gp = [0, 0];
    for (var i = 0; i < ns; i++) {
      pick(grid, grand, gp);
      outside[2 * i] = gp[0]; outside[2 * i + 1] = gp[1];
    }
  } else {
    // Each sample starts at a random mixed cell of the grid, as a pair of one of its inside corners and one of its
    // outside corners, a cell apart. Mixed cells are spread evenly along the boundary, minibrots included. The workers
    // then bisect each pair randomly and keep the outside end, which ends up far closer to the set than a cell.
    var ne = grid.edges.length, ecum = p.balance > 0 ? familyWeights(grid, p.balance) : null;
    stage('Refining', 10, 45, n * p.refine_steps);
    var brand = rng(mixSeed(p.seed, 1, base)), pairs = new Float64Array(4 * n), ins = [], outs = [];
    for (var i = 0; i < n; i++) {
      var e = Math.floor(brand() * ne);
      if (ecum) {
        var x = brand() * ecum[ne - 1], q0 = 0, q1 = ne - 1;
        while (q0 < q1) { var mid = (q0 + q1) >> 1; if (ecum[mid] > x) q1 = mid; else q0 = mid + 1; }
        e = q0;
      }
      var cell = grid.edges[e], bits = grid.corners[e], ci = cell / grid.G | 0, cj = cell % grid.G;
      ins.length = outs.length = 0;
      for (var q = 0; q < 4; q++) (bits >> q & 1 ? ins : outs).push(q);
      var a = ins[Math.floor(brand() * ins.length)], o = outs[Math.floor(brand() * outs.length)];
      pairs[4 * i] = grid.x0 + (ci + (a >> 1)) * grid.h; pairs[4 * i + 1] = grid.y0 + (cj + (a & 1)) * grid.h;
      pairs[4 * i + 2] = grid.x0 + (ci + (o >> 1)) * grid.h; pairs[4 * i + 3] = grid.y0 + (cj + (o & 1)) * grid.h;
    }
    await runJobs(chunks(n, nCores, 8, 64).map(function(c, i) {
      var slice = pairs.slice(4 * c[0], 4 * c[1]);
      return { start: c[0], msg: { cmd: 'refine', pairs: slice, steps: p.refine_steps, maxIter: p.max_iter, seed: mixSeed(p.seed, 1, base + i + 1) }, transfer: [slice.buffer] };
    }), nCores, function(job, d) { outside.set(d.pts, 2 * job.start); }, ui.progress);
    pairs = null;
  }
  if (!ui.live()) return null;
  var lo = bisection ? 45 : 12;

  // 2. trace the orbits
  if (!metro) {
    stage('Buddhabrot', lo, 95, n * (1 + (known ? 0 : p.nearby_points)));
    var perWorker = p.nearby_points > 0 ? 64 : 16;
    await runJobs(chunks(n, nTrace, perWorker, 1).map(function(c, i) {
      var slice = outside.slice(2 * c[0], 2 * c[1]);
      return { msg: { cmd: 'trace', pts: slice, escapingOnly: known, nearby: known ? 0 : p.nearby_points, sigma: p.nearby_spread, seed: mixSeed(p.seed, 2, base + i) }, transfer: [slice.buffer] };
    }), nTrace, null, ui.progress);
    return ui.live() ? { fsum: 0, seeded: 0 } : null;
  }
  // 2a. keep the starting points whose orbits cross the view
  var found = [], foundF = [], nFound = 0, seeded = 0;
  async function seedFrom(pts, count) {
    stage('Seeding', lo, lo + 5, count);
    var got = [], gotF = [];
    await runJobs(chunks(count, nTrace, 4, 64).map(function(c, i) {
      var slice = pts.slice(2 * c[0], 2 * c[1]);
      return { idx: i, msg: { cmd: 'seed', pts: slice }, transfer: [slice.buffer] };
    }), nTrace, function(job, d) { got[job.idx] = d.pts; gotF[job.idx] = d.f; }, ui.progress);
    got.forEach(function(f, i) { found.push(f); foundF.push(gotF[i]); nFound += f.length / 2; });
    seeded += count;
  }
  await seedFrom(outside, ns);
  outside = null;
  // Adaptive seeding. A small or deep view yields few seeds, and chains that share few starts stay near them: the image
  // then shows the seeds rather than the distribution, lopsided and different with every seed (a minibrot on the real
  // axis, owner, 2026-10-21). So the seeding points keep doubling until there is a seed per chain, up to as many
  // seeding points as the batch traces orbits. Views with seeds enough cost nothing extra (docs/sampling.md).
  var cap = Math.max(ns, n * ms.chain);
  while (!bisection && nFound < n && seeded < cap && ui.live()) {
    var more = Math.min(seeded, cap - seeded), extra = new Float64Array(2 * more);
    for (var k = 0; k < more; k++) { pick(grid, grand, gp); extra[2 * k] = gp[0]; extra[2 * k + 1] = gp[1]; }
    await seedFrom(extra, more);
  }
  if (!ui.live()) return null;
  if (nFound === 0) throw new Error('No starting orbit reaches this view. Raise the samples or max iterations.');
  var seeds = new Float64Array(2 * nFound), cum = new Float64Array(nFound), o = 0, fsum = 0;
  found.forEach(function(f, i) {
    seeds.set(f, 2 * o);
    foundF[i].forEach(function(v) { cum[o++] = fsum += v; });
  });

  // 2b. one chain per sample. The chains' target is proportional to f, so each start is drawn from the seeds with
  // probability proportional to f: the chains then start in their stationary distribution and need no burn-in.
  // Drawing starts uniformly from the seeds instead over-weights orbits with few hits until the chains have mixed,
  // which took thousands of steps (docs/sampling.md).
  var starts = new Float64Array(2 * n), rand = rng(mixSeed(p.seed, 3, base));
  for (var j = 0; j < n; j++) {
    var x = rand() * fsum, q0 = 0, q1 = nFound - 1;
    while (q0 < q1) { var mid = (q0 + q1) >> 1; if (cum[mid] > x) q1 = mid; else q0 = mid + 1; }
    starts[2 * j] = seeds[2 * q0]; starts[2 * j + 1] = seeds[2 * q0 + 1];
  }
  stage('Metropolis', lo + 5, 95, n * (ms.burn + ms.chain));
  await runJobs(chunks(n, nTrace, 16, 1).map(function(c, i) {
    var slice = starts.slice(2 * c[0], 2 * c[1]);
    return { msg: { cmd: 'metro', pts: slice, steps: ms.chain, burn: ms.burn, large: ms.large, rmin: ms.rmin, rmax: ms.rmax, seed: mixSeed(p.seed, 4, base + i) }, transfer: [slice.buffer] };
  }), nTrace, null, ui.progress, true);   // pinned: fractional weights, whose sums depend on their order
  return ui.live() ? { fsum: fsum, seeded: seeded } : null;
}
