// Measures how efficiently Metropolis settings render zoomed views. Not a module: one expression for screenshot.mjs
// (takes several minutes):
//   node tests/screenshot.mjs 'http://127.0.0.1:8765/art/buddhabrot/' /tmp/x.png 3000 "$(cat tests/metro-tuning.js)"
// For each view, a long run (REF_STEPS chain steps, two seeds averaged) is the reference. Each candidate runs STEPS chain
// steps and is timed; its error is the L1 distance to the reference of histograms normalized to sum 1, at 128 px so that
// noise dominates. Monte Carlo error falls as 1/√time, so err² × time compares settings at equal effort: lower is
// better. Each candidate runs with two seeds; the table holds the means. Phase 1 varies the chain length; phase 2,
// at the best one, the large-step probability, the largest mutation radius and the burn-in.
(async () => { try {
  const M = await import('/art/buddhabrot/js/compute.js');
  const S = await import('/art/buddhabrot/js/state.js');
  const ui = { stage() {}, progress() {}, live: () => true };
  const VIEWS = {
    'shoulder 0.5': { xmin: -0.5, xmax: 0, ymin: 0.4, ymax: 0.9 },
    'seahorse 0.1': { xmin: -0.8, xmax: -0.7, ymin: 0.05, ymax: 0.15 },
    'seahorse 0.01': { xmin: -0.7485, xmax: -0.7385, ymin: 0.1264, ymax: 0.1364 },
    'minibrot 0.004': { xmin: -1.7568, xmax: -1.7528, ymin: -0.002, ymax: 0.002 }
  };
  const STEPS = 4e5, REF_STEPS = 8e6;
  const base = Object.assign({}, S.DEFAULTS, { sampler: 'grid', resolution: 128, max_iter: 5000, burn_in: 0, large_step: 0.05, mutation_min: 1e-7, mutation_max: 1 });
  // (these overrides were the settings before the tuning; the page now uses METRO in compute.js)
  async function run(view, o, steps, seed) {
    const p = S.sanitize(Object.assign({}, base, view, o, { seed }));
    p.samples = steps;   // samples count orbits: steps / chain length chains
    const t = performance.now(), r = await M.compute(p, ui), dt = (performance.now() - t) / 1000;
    let s = 0; for (const v of r.data) s += v;
    return { h: Float64Array.from(r.data, v => v / s), dt };
  }
  function l1(a, b) { let e = 0; for (let i = 0; i < a.length; i++) e += Math.abs(a[i] - b[i]); return e; }
  const out = {};
  for (const [name, view] of Object.entries(VIEWS)) {
    const r1 = await run(view, { chain_length: 100 }, REF_STEPS, 101), r2 = await run(view, { chain_length: 100 }, REF_STEPS, 102);
    const ref = r1.h.map((v, i) => (v + r2.h[i]) / 2);
    const rows = {};
    async function measure(label, o) {
      let e = 0, t = 0;
      for (const seed of [1, 2]) { const r = await run(view, o, STEPS, seed); e += l1(r.h, ref) / 2; t += r.dt / 2; }
      rows[label] = { err: +e.toFixed(4), time: +t.toFixed(2), score: +(e * e * t * 1000).toFixed(2) };
    }
    for (const L of [10, 30, 100, 300, 1000]) await measure('L=' + L, { chain_length: L });
    const best = +Object.entries(rows).sort((a, b) => a[1].score - b[1].score)[0][0].slice(2);
    for (const large of [0.01, 0.2, 0.5]) await measure('L=' + best + ' large=' + large, { chain_length: best, large_step: large });
    for (const rmax of [0.1, 0.01]) await measure('L=' + best + ' rmax=' + rmax, { chain_length: best, mutation_max: rmax });
    await measure('L=' + best + ' burn=20', { chain_length: best, burn_in: 20 });
    out[name] = { refNoise: +(l1(r1.h, r2.h) / 2).toFixed(4), rows };
  }
  return out;
} catch (e) { return 'ERR ' + e.stack; } })()
