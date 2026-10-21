// Checks that Metropolis reproduces the distribution of its sampler, in a zoomed view. Not a module: it is one
// expression for screenshot.mjs to evaluate in the page (the sampler comes from the page's URL hash):
//   node tests/screenshot.mjs 'http://127.0.0.1:8765/art/buddhabrot/#sampler=grid' /tmp/x.png 2000 "$(cat tests/distribution.js)"
// It prints L1 distances between histograms normalized to sum 1:
//   ref_noise   two brute-force renders with different seeds (the reference is their mean)
//   m_vs_m      two Metropolis renders with different seeds: Metropolis's own noise
//   m_vs_ref    one Metropolis render against the reference: about m_vs_m or below if unbiased, clearly above if biased
//   scale       total of data × norm (hits per sample per unit area) of a Metropolis render over the reference's: about 1
(async () => {
  const m = await import('/art/buddhabrot/js/compute.js');
  const s = await import('/art/buddhabrot/js/state.js');
  const sampler = new URLSearchParams(location.hash.slice(1)).get('sampler') || 'grid';
  const ui = { stage() {}, progress() {}, live: () => true };
  const V = { xmin: -0.5, xmax: 0, ymin: 0.4, ymax: 0.9 };
  const base = Object.assign({}, s.DEFAULTS, V, { sampler, resolution: 64, max_iter: 1000 });
  const totals = [];
  const run = async (o) => { const r = await m.compute(Object.assign({}, base, o), ui); let t = 0; for (const v of r.data) t += v; totals.push(t * r.norm); return r.data; };
  const norm = a => { let t = 0; for (const v of a) t += v; return a.map(v => v / t); };
  const l1 = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return +d.toFixed(3); };
  const t0 = performance.now();
  const u1 = norm(await run({ method: 'direct', samples: 20e6, seed: 1 }));
  const u2 = norm(await run({ method: 'direct', samples: 20e6, seed: 2 }));
  const ref = u1.map((v, i) => (v + u2[i]) / 2), refTotal = (totals[0] + totals[1]) / 2;
  const out = { sampler, ref_noise: l1(u1, u2) };
  for (const [name, o] of [['chains1000', { chain_length: 1000, burn_in: 0 }], ['nolarge', { chain_length: 1000, burn_in: 0, large_step: 0 }], ['defaults', { samples: 200000 }]]) {
    const a = norm(await run(Object.assign({ method: 'metropolis', samples: 20000, seed: 3 }, o)));
    const b = norm(await run(Object.assign({ method: 'metropolis', samples: 20000, seed: 4 }, o)));
    out[name] = { m_vs_m: l1(a, b), m_vs_ref: l1(a, ref), scale: +(totals[totals.length - 1] / refTotal).toFixed(3) };
  }
  out.secs = Math.round((performance.now() - t0) / 1000);
  return out;
})()
