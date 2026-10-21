// The heavy part: a pool of workers (worker.js) and the pipeline that turns settings into a histogram.
// No DOM here; main.js shows the progress.
import { rng, mixSeed } from './rng.js';

var workerURL = new URL('./worker.js', import.meta.url);
export var nCores = Math.max(1, Math.min(32, navigator.hardwareConcurrency || 4));
var pool = [];
function ensurePool(n) { while (pool.length < n) pool.push(new Worker(workerURL, { type: 'module' })); }
// Stopping a run terminates the workers; their pending jobs never settle, and the next run starts new ones.
export function killPool() { pool.forEach(function(w) { w.terminate(); }); pool = []; }

// Hands jobs to idle workers. With as many jobs as workers, worker i gets job i.
function runJobs(jobs, nWorkers, onDone, onProgress) {
  return new Promise(function(resolve, reject) {
    if (!jobs.length) return resolve();
    ensurePool(nWorkers);
    var next = 0, finished = 0;
    function feed(w) {
      if (next >= jobs.length) return;
      var job = jobs[next++];
      w.onmessage = function(e) {
        var d = e.data;
        if (d.cmd === 'progress') { if (onProgress) onProgress(d.n); return; }
        if (d.cmd === 'error') { reject(new Error(d.message)); return; }
        if (onDone) onDone(job, d);
        if (++finished === jobs.length) resolve(); else feed(w);
      };
      w.onerror = function(e) { e.preventDefault(); reject(new Error(e.message || 'A worker failed')); };
      w.postMessage(job.msg, job.transfer || []);
    }
    for (var i = 0; i < Math.min(nWorkers, jobs.length); i++) feed(pool[i]);
  });
}

function tick() { return new Promise(function(r) { setTimeout(r, 0); }); }

function chunks(total, nWorkers, perWorker, minSize) {
  var size = Math.max(minSize, Math.ceil(total / (nWorkers * perWorker))), list = [];
  for (var s = 0; s < total; s += size) list.push([s, Math.min(total, s + size)]);
  return list;
}

// Computes the histogram for the settings p. The callbacks report progress:
//   ui.stage(name, lo, hi, total)  a new stage, covering lo–hi % of the bar, with total units of work
//   ui.progress(n)                 n more units done
//   ui.live()                      false once the run was stopped or replaced; compute then returns null
// Returns { data: Float32Array, res, b: bounds, total: orbits traced }.
export async function compute(p, ui) {
  var b = { xmin: p.xmin, xmax: p.xmax, ymin: p.ymin, ymax: p.ymax };
  // Orbits that cross a zoomed view mostly start outside it, so starting points always come from the whole set.
  var metro = p.method === 'metropolis', uniform = p.sampler === 'uniform';

  // 1. starting points c, two numbers per sample
  var outside = new Float64Array(2 * p.samples);
  if (uniform) {
    // uniform in the disk |c| ≤ 2, which holds every c whose orbit leaves a point on the plane
    ui.stage('Sampling', 0, 5);
    await tick();
    var urand = rng(mixSeed(p.seed, 0, 0));
    for (var i = 0; i < p.samples; i++) {
      var ur = 2 * Math.sqrt(urand()), uth = 2 * Math.PI * urand();
      outside[2 * i] = ur * Math.cos(uth); outside[2 * i + 1] = ur * Math.sin(uth);
    }
  } else {
    // random bisection between an inside and an outside point; only the escaping end is kept
    ui.stage('Refining', 0, 45, p.samples * p.refine_steps);
    await runJobs(chunks(p.samples, nCores, 8, 64).map(function(c, i) {
      return { start: c[0], msg: { cmd: 'refine', count: c[1] - c[0], steps: p.refine_steps, maxIter: p.max_iter, radius: p.outer_radius, inside: p.inside_point, insideReal: p.inside_real, seed: mixSeed(p.seed, 1, i) } };
    }), nCores, function(job, d) { outside.set(d.pts, 2 * job.start); }, ui.progress);
  }
  if (!ui.live()) return null;
  var lo = uniform ? 5 : 45;

  // 2. trace orbits into one histogram per worker; cap workers so the histograms fit in memory.
  // Metropolis splats fractional weights, which need doubles.
  var res = p.resolution, bytes = res * res * (metro ? 8 : 4);
  var nTrace = Math.max(1, Math.min(nCores, Math.floor(768e6 / bytes)));
  var inits = [];
  for (var w = 0; w < nTrace; w++) inits.push({ msg: { cmd: 'histInit', res: res, b: b, maxIter: p.max_iter, weighted: metro } });
  await runJobs(inits, nTrace);
  var total;
  if (!metro) {
    total = p.samples * (1 + (uniform ? 0 : p.nearby_points));
    ui.stage('Buddhabrot', lo, 95, total);
    var perWorker = p.nearby_points > 0 ? 64 : 16;
    await runJobs(chunks(p.samples, nTrace, perWorker, 1).map(function(c, i) {
      var slice = outside.slice(2 * c[0], 2 * c[1]);
      return { msg: { cmd: 'trace', pts: slice, escapingOnly: uniform, nearby: uniform ? 0 : p.nearby_points, sigma: 1 / p.nearby_distance, seed: mixSeed(p.seed, 2, i) }, transfer: [slice.buffer] };
    }), nTrace, null, ui.progress);
  } else {
    // 2a. keep the starting points whose orbits cross the view
    ui.stage('Seeding', lo, lo + 5, p.samples);
    var found = [];
    await runJobs(chunks(p.samples, nTrace, 4, 64).map(function(c, i) {
      var slice = outside.slice(2 * c[0], 2 * c[1]);
      return { idx: i, msg: { cmd: 'seed', pts: slice }, transfer: [slice.buffer] };
    }), nTrace, function(job, d) { found[job.idx] = d.pts; }, ui.progress);
    if (!ui.live()) return null;
    var nFound = found.reduce(function(s, f) { return s + f.length / 2; }, 0);
    if (nFound === 0) throw new Error('No starting orbit reaches this view. Raise the samples or max iterations.');
    var seeds = new Float64Array(2 * nFound), o = 0;
    found.forEach(function(f) { seeds.set(f, o); o += f.length; });

    // 2b. one chain per sample, started at a random seed; burn-in carries the chains away from the boundary bias
    var starts = new Float64Array(2 * p.samples), rand = rng(mixSeed(p.seed, 3, 0));
    for (var j = 0; j < p.samples; j++) {
      var q = Math.floor(rand() * nFound);
      starts[2 * j] = seeds[2 * q]; starts[2 * j + 1] = seeds[2 * q + 1];
    }
    total = p.samples * (p.burn_in + p.chain_length);
    ui.stage('Metropolis', lo + 5, 95, total);
    await runJobs(chunks(p.samples, nTrace, 16, 1).map(function(c, i) {
      var slice = starts.slice(2 * c[0], 2 * c[1]);
      return { msg: { cmd: 'metro', pts: slice, steps: p.chain_length, burn: p.burn_in, large: p.large_step, rmin: p.mutation_min, rmax: p.mutation_max, seed: mixSeed(p.seed, 4, i) }, transfer: [slice.buffer] };
    }), nTrace, null, ui.progress);
  }
  if (!ui.live()) return null;

  // 3. combine
  ui.stage('Combining', 95, 100);
  var sum = new Float32Array(res * res), gets = [];
  for (w = 0; w < nTrace; w++) gets.push({ msg: { cmd: 'histGet' } });
  await runJobs(gets, nTrace, function(job, d) {
    var h = d.hist;
    for (var k = 0; k < h.length; k++) sum[k] += h[k];
  });
  if (!ui.live()) return null;
  return { data: sum, res: res, b: b, total: total };
}
