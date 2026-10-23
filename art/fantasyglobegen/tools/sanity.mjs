// Runs the climate model on worlds that are not Earth and checks that it behaves as physics
// says it should, which no tuning against Earth can guarantee:
//   node tools/sanity.mjs [level=4] [years=4] ['{"param": value}']
// Aquaplanet (all ocean, 4 km deep): the climate must not depend on longitude, the two
// hemispheres must mirror each other over the year, water must be conserved, and the zonal
// mean rain must have the shape found by the Aqua-Planet Experiment (Blackburn et al. 2013):
// an ITCZ within 10° of the equator, dry subtropics near 20–25°, and storm tracks with more
// rain near 40–50°. Ridge world: one continent-wide north–south mountain range on the
// aquaplanet must rain more on its upwind side than on its lee.
import { buildGrid } from '../js/grid.js';
import { buildOps } from '../js/climate/ops.js';

const level = +(process.argv[2] || 4), years = +(process.argv[3] || 4), params = JSON.parse(process.argv[4] || '{}');
const { runClimate } = await import(process.env.MODEL === '2' ? '../js/climate/model2.js' : '../js/climate/model.js');
const g = buildGrid(level), ops = buildOps(g), N = g.count, lat = ops.lat, area = ops.area;
const lon = new Float64Array(N).map((_, i) => Math.atan2(g.pos[3 * i + 1], g.pos[3 * i]));
const annual = f => { const a = new Float64Array(N); for (let m = 0; m < 12; m++) for (let i = 0; i < N; i++) a[i] += f[m * N + i] / 12; return a; };
const NB = 18, bands = f => {
  const s = new Float64Array(NB), w = new Float64Array(NB), s2 = new Float64Array(NB);
  for (let i = 0; i < N; i++) { const b = Math.min(NB - 1, Math.floor((lat[i] / Math.PI + 0.5) * NB)); s[b] += f[i] * area[i]; s2[b] += f[i] * f[i] * area[i]; w[b] += area[i]; }
  return [...s].map((v, b) => ({ mean: v / w[b], sd: Math.sqrt(Math.max(0, s2[b] / w[b] - (v / w[b]) ** 2)) }));
};
// departures from the zonal mean profile, taken in 1° bands and interpolated in latitude (a
// band's own spread would also count how the profile changes across the band)
function residual(a) {
  const NR = 180, s = new Float64Array(NR), w = new Float64Array(NR);
  for (let i = 0; i < N; i++) { const b = Math.min(NR - 1, Math.floor((lat[i] / Math.PI + 0.5) * NR)); s[b] += a[i] * area[i]; w[b] += area[i]; }
  const pr = [...s].map((v, b) => w[b] ? v / w[b] : NaN);
  for (let b = 0; b < NR; b++) if (Number.isNaN(pr[b])) {
    let l = b, h = b;
    while (l > 0 && Number.isNaN(pr[l])) l--;
    while (h < NR - 1 && Number.isNaN(pr[h])) h++;
    pr[b] = Number.isNaN(pr[l]) ? pr[h] : Number.isNaN(pr[h]) ? pr[l] : (pr[l] + pr[h]) / 2;
  }
  return a.map((v, i) => {
    const x = Math.min(NR - 1, Math.max(0, (lat[i] / Math.PI + 0.5) * NR - 0.5)), lo = Math.min(NR - 2, Math.floor(x)), f = x - lo;
    return v - (pr[lo] * (1 - f) + pr[lo + 1] * f);
  });
}
let failed = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failed++; };

// ---- aquaplanet
{
  const res = runClimate({ ops, height: new Float64Array(N).fill(-4000), years, params });
  const P = annual(res.precipitation), E = annual(res.evaporation), T = annual(res.temperature);
  let sp = 0, se = 0, sa = 0;
  for (let i = 0; i < N; i++) { sp += P[i] * area[i]; se += E[i] * area[i]; sa += area[i]; }
  const zb = bands(P), zt = bands(T);
  console.log('aquaplanet zonal mean P (mm/day) from the north: ' + zb.map(b => b.mean.toFixed(1)).reverse().join(' '));
  console.log('                       T (°C):                   ' + zt.map(b => b.mean.toFixed(0)).reverse().join(' '));
  check(Math.abs(sp - se) / sp < 0.01, `water conserved: P ${(sp / sa).toFixed(2)}, E ${(se / sa).toFixed(2)} mm/day`);
  check(sp / sa > 2 && sp / sa < 4.5, 'global precipitation between 2 and 4.5 mm/day');
  // zonal symmetry: the spread along each latitude, against the spread between latitudes
  const spread = Math.max(...bands(residual(P)).map(b => Math.sqrt(b.sd ** 2 + b.mean ** 2))), range = Math.max(...zb.map(b => b.mean)) - Math.min(...zb.map(b => b.mean));
  check(spread < 0.05 * range, `independent of longitude (largest rms departure along a latitude ${spread.toFixed(2)} of a range of ${range.toFixed(2)})`);
  let asym = 0;
  for (let b = 0; b < NB / 2; b++) asym = Math.max(asym, Math.abs(zb[b].mean - zb[NB - 1 - b].mean));
  check(asym < 0.15 * range, `the hemispheres mirror each other (largest difference ${asym.toFixed(2)})`);
  const eq = Math.max(zb[8].mean, zb[9].mean), sub = Math.min(zb[6].mean, zb[11].mean), mid = Math.max(zb[4].mean, zb[13].mean);
  check(eq > 1.5 * sub, `ITCZ at the equator: ${eq.toFixed(1)} against ${sub.toFixed(1)} at 20–30°`);
  check(mid > 1.2 * sub, `storm tracks: ${mid.toFixed(1)} at 40–50° against ${sub.toFixed(1)} at 20–30°`);
}

// ---- ridge world: a 3 km ridge along 0° longitude from 60° S to 60° N
{
  const height = new Float64Array(N).fill(-4000);
  for (let i = 0; i < N; i++) {
    const d = Math.abs(lon[i]) * Math.cos(lat[i]) * 6371;
    if (Math.abs(lat[i]) < 60 * Math.PI / 180 && d < 400) height[i] = 3000 * Math.cos(d / 400 * Math.PI / 2) ** 2 + 1;
  }
  const res = runClimate({ ops, height, years, params });
  const P = annual(res.precipitation);
  // in the westerlies (35–55°) the west side is upwind, in the trades (5–25°) the east side
  const side = (lo, hi, sign) => {
    let s = 0, w = 0;
    for (let i = 0; i < N; i++) {
      const a = Math.abs(lat[i]) * 180 / Math.PI, d = lon[i] * Math.cos(lat[i]) * 6371;
      if (a >= lo && a < hi && sign * d > 300 && sign * d < 900) { s += P[i] * area[i]; w += area[i]; }
    }
    return s / w;
  };
  const wW = side(35, 55, -1), wE = side(35, 55, 1), tW = side(5, 25, -1), tE = side(5, 25, 1);
  check(wW > wE, `westerlies: the upwind (west) side is wetter, ${wW.toFixed(2)} against ${wE.toFixed(2)} mm/day`);
  check(tE > tW, `trades: the upwind (east) side is wetter, ${tE.toFixed(2)} against ${tW.toFixed(2)} mm/day`);
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
