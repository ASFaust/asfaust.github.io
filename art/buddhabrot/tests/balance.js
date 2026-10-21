// How the image's weight divides between head and body, for several values of the "Head and body" balance. Not a
// module: one expression for screenshot.mjs to evaluate in the page:
//   node tests/screenshot.mjs 'http://127.0.0.1:8765/art/buddhabrot/#samples=1' /tmp/x.png 2000 "$(cat tests/balance.js)"
// It renders 3,000 bisection samples at max_iter 10⁴ and prints the share of all counts per band of Re z (the image's
// vertical axis, head on top): −2 | −1.25 | −0.75 | −0.25 | 0.25 | 1. The second band is the head. Reference values
// (2026-10-21): balance 0 → 15.2 %, 0.5 → 19.3 %, 1 → 24.0 % in the head band.
(async () => {
  const m = await import('/art/buddhabrot/js/compute.js');
  const s = await import('/art/buddhabrot/js/state.js');
  const ui = { stage() {}, progress() {}, live: () => true };
  const IB = [-2, -1.25, -0.75, -0.25, 0.25, 1], out = {};
  for (const t of [0, 0.5, 1]) {
    const p = Object.assign({}, s.DEFAULTS, { samples: 3000, max_iter: 10000, resolution: 600, balance: t });
    const r = await m.compute(p, ui), n = r.res, sums = new Array(IB.length - 1).fill(0);
    let tot = 0;
    for (let i = 0; i < n; i++) {
      const x = -2 + (i + 0.5) * 3 / n;
      let b = 0;
      while (b < IB.length - 2 && x >= IB[b + 1]) b++;
      for (let j = 0; j < n; j++) { sums[b] += r.data[i * n + j]; tot += r.data[i * n + j]; }
    }
    out['balance ' + t] = sums.map(v => (100 * v / tot).toFixed(1) + '%').join(' / ');
  }
  return out;
})()
