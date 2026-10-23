// Runs the climate model on the real Earth and compares it with the observed climate:
//   node tools/compare.mjs [level=6] [years=5] [out.globe or ''] ['{"param": value}']
// prints global means and zonal means of annual temperature, precipitation and wind
import { readFileSync, writeFileSync } from 'node:fs';
import { buildGrid, restrict } from '../js/grid.js';
import { buildOps } from '../js/climate/ops.js';
import { runClimate } from '../js/climate/model.js';
import { decodeGlobe, encodeGlobe } from '../js/globefile.js';

const level = +(process.argv[2] || 6), years = +(process.argv[3] || 5), outPath = process.argv[4] || '';
const params = JSON.parse(process.argv[5] || '{}');
const here = new URL('..', import.meta.url).pathname;
const earth = await decodeGlobe(readFileSync(here + 'data/earth.globe'));
const obs = (await decodeGlobe(readFileSync(here + 'data/earth-observed.globe'))).layers;
let h = earth.layers.height.values, hl = earth.layers.height.level;
const grids = {};
const G = l => grids[l] || (grids[l] = buildGrid(l));
for (; hl > level; hl--) h = restrict(h, G(hl), G(hl - 1));
const g = G(level), ops = buildOps(g), N = g.count;

const t0 = performance.now();
const res = runClimate({ ops, height: h, years, params });
console.log(`level ${level}, ${years} years in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

// observations at the model level
const at = (vals, frames) => {
  const n0 = vals.length / frames, out = new Float32Array(frames * N);
  for (let f = 0; f < frames; f++) {
    let v = vals.subarray(f * n0, (f + 1) * n0);
    for (let l = 6; l > level; l--) v = restrict(v, G(l), G(l - 1));
    out.set(v, f * N);
  }
  return out;
};
const ann = (vals) => { const a = new Float64Array(N); for (let m = 0; m < 12; m++) for (let i = 0; i < N; i++) a[i] += vals[m * N + i] / 12; return a; };
const pick = (vals, m) => vals.subarray(m * N, (m + 1) * N);
const O = { T: at(obs.temperature.values, 12), P: at(obs.precipitation.values, 12), U: at(obs.wind_east.values, 12), V: at(obs.wind_north.values, 12) };
const M = { T: res.temperature, P: res.precipitation, U: res.wind_east, V: res.wind_north };

const area = ops.area, lat = ops.lat;
const gmean = f => { let s = 0, w = 0; for (let i = 0; i < N; i++) { s += f[i] * area[i]; w += area[i]; } return s / w; };
const bands = (f, mask) => {
  const s = new Float64Array(18), w = new Float64Array(18);
  for (let i = 0; i < N; i++) { if (mask && !mask(i)) continue; const b = Math.min(17, Math.floor((lat[i] / Math.PI + 0.5) * 18)); s[b] += f[i] * area[i]; w[b] += area[i]; }
  return [...s].map((v, b) => v / (w[b] || 1));
};
const corr = (a, b) => { const ma = gmean(a), mb = gmean(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < N; i++) { const x = a[i] - ma, y = b[i] - mb; sab += area[i] * x * y; saa += area[i] * x * x; sbb += area[i] * y * y; } return sab / Math.sqrt(saa * sbb); };
const rmse = (a, b) => { let s = 0, w = 0; for (let i = 0; i < N; i++) { s += area[i] * (a[i] - b[i]) ** 2; w += area[i]; } return Math.sqrt(s / w); };

const aT = [ann(M.T), ann(O.T)], aP = [ann(M.P), ann(O.P)], aU = [ann(M.U), ann(O.U)], aV = [ann(M.V), ann(O.V)], aE = ann(res.evaporation);
console.log(`global mean T  model ${gmean(aT[0]).toFixed(1)} °C, observed ${gmean(aT[1]).toFixed(1)}`);
console.log(`global mean P  model ${gmean(aP[0]).toFixed(2)} mm/day (E ${gmean(aE).toFixed(2)}), observed ${gmean(aP[1]).toFixed(2)}`);
console.log(`annual maps    T corr ${corr(...aT).toFixed(3)} rmse ${rmse(...aT).toFixed(1)} · P corr ${corr(...aP).toFixed(3)} rmse ${rmse(...aP).toFixed(2)} · u corr ${corr(...aU).toFixed(3)} · v corr ${corr(...aV).toFixed(3)}`);
const sT = M.T.length && [pick(M.T, 6).map((v, i) => v - pick(M.T, 0)[i]), pick(O.T, 6).map((v, i) => v - pick(O.T, 0)[i])];
console.log(`July−January T corr ${corr(...sT).toFixed(3)} · July P corr ${corr(pick(M.P, 6), pick(O.P, 6)).toFixed(3)} · January P corr ${corr(pick(M.P, 0), pick(O.P, 0)).toFixed(3)}`);
const ocean = i => res.ocean[i], land = i => !res.ocean[i];
const rows = [['T', aT], ['P', aP], ['u', aU], ['v', aV]].map(([n, [m, o]]) => [n, bands(m), bands(o)]);
console.log('lat   ' + rows.map(([n]) => `${n} model/obs`.padStart(16)).join(''));
for (let b = 17; b >= 0; b--) console.log(`${String(-90 + 10 * b + 5).padStart(4)}  ` + rows.map(([, m, o]) => `${m[b].toFixed(1).padStart(7)} ${o[b].toFixed(1).padStart(7)} `).join(''));
const eb = bands(aE), wb = bands(ann(res.vapour));
console.log('E and W by band: ' + eb.map((v, b) => `${-85 + 10 * b}:${v.toFixed(1)}/${wb[b].toFixed(0)}`).join(' '));
const pl = [bands(aP[0], land), bands(aP[1], land)];
console.log('land P by band (model/obs): ' + pl[0].map((v, b) => `${-85 + 10 * b}:${v.toFixed(1)}/${pl[1][b].toFixed(1)}`).join(' '));

if (outPath) {
  const layers = {};
  for (const [k, v] of Object.entries(res)) if (v instanceof Float32Array) layers[k] = { level, dtype: 'float16', frames: 12, values: v, unit: { temperature: '°C', precipitation: 'mm/day', evaporation: 'mm/day', vapour: 'mm', wind_east: 'm/s', wind_north: 'm/s', sea_ice: 'm' }[k] };
  writeFileSync(outPath, await encodeGlobe({ params: { name: 'Earth, model' }, layers }));
}

// MAPS=dir writes annual model and observed fields as raw float32, with cell lon/lat, for plotting
if (process.env.MAPS) {
  const d = process.env.MAPS, f32 = a => Buffer.from(Float32Array.from(a).buffer);
  const ll = new Float32Array(2 * N);
  for (let i = 0; i < N; i++) { ll[2 * i] = Math.atan2(g.pos[3 * i + 1], g.pos[3 * i]); ll[2 * i + 1] = lat[i]; }
  writeFileSync(`${d}/lonlat.f32`, Buffer.from(ll.buffer));
  for (const [k, v] of Object.entries({ Pm: aP[0], Po: aP[1], Tm: aT[0], To: aT[1], E: aE, W: ann(res.vapour), Um: aU[0], Uo: aU[1], Vm: aV[0], Vo: aV[1] })) writeFileSync(`${d}/${k}.f32`, f32(v));
}
