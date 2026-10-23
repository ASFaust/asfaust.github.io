// Runs the climate model on the real Earth and scores it against the observed climate with
// tools/metrics.mjs:
//   node tools/score.mjs [level=5] [years=5] ['{"param": value}'] [out.json]
// MAPS=dir also writes annual model and observed fields at the evaluation level as raw
// float32, with cell lon/lat, for plotting.
import { readFileSync, writeFileSync } from 'node:fs';
import { restrict } from '../js/grid.js';
import { buildOps } from '../js/climate/ops.js';
import { decodeGlobe } from '../js/globefile.js';
import { gridAt, prepare, score, summary, toLevel, EVAL_LEVEL } from './metrics.mjs';

// MODEL=2 runs js/climate/model2.js instead
const { runClimate } = await import(process.env.MODEL === '2' ? '../js/climate/model2.js' : '../js/climate/model.js');
const level = +(process.argv[2] || 5), years = +(process.argv[3] || 5);
const params = JSON.parse(process.argv[4] || '{}'), outPath = process.argv[5] || '';
const here = new URL('..', import.meta.url).pathname;
const earth = await decodeGlobe(readFileSync(here + 'data/earth.globe'));
const obs = (await decodeGlobe(readFileSync(here + 'data/earth-observed.globe'))).layers;
let h = earth.layers.height.values, hl = earth.layers.height.level;
const prep = prepare(obs, h, hl);
for (; hl > level; hl--) h = restrict(h, gridAt(hl), gridAt(hl - 1));
const ops = buildOps(gridAt(level));

// ORACLE_SST=1: the ocean takes the observed temperatures (an experiment)
if (process.env.ORACLE_SST) {
  const o = toLevel(obs.temperature.values, obs.temperature.level, level), a = new Float64Array(12 * ops.N);
  o.forEach((m, k) => a.set(m, k * ops.N));
  params.sstObs = a;
}
const t0 = performance.now();
const res = runClimate({ ops, height: h, years, params });
const sec = (performance.now() - t0) / 1000;
const r = score(res, level, prep);
r.level = level; r.years = years; r.seconds = +sec.toFixed(1); r.params = { ...params, sstObs: undefined };
console.log(`level ${level}, ${years} years in ${sec.toFixed(1)} s\n` + summary(r));
if (outPath) writeFileSync(outPath, JSON.stringify(r));

if (process.env.MAPS) {
  const d = process.env.MAPS, L = EVAL_LEVEL, g = gridAt(L), N = g.count;
  const f32 = a => Buffer.from(Float32Array.from(a).buffer);
  const ann = ms => { const a = new Float64Array(N); for (const m of ms) for (let i = 0; i < N; i++) a[i] += m[i] / 12; return a; };
  const ll = new Float32Array(2 * N);
  for (let i = 0; i < N; i++) { ll[2 * i] = Math.atan2(g.pos[3 * i + 1], g.pos[3 * i]); ll[2 * i + 1] = Math.asin(g.pos[3 * i + 2]); }
  writeFileSync(`${d}/lonlat.f32`, Buffer.from(ll.buffer));
  const M = k => ann(toLevel(res[k], level, L));
  const fields = { Pm: M('precipitation'), Po: ann(prep.o.P), Tm: M('temperature'), To: ann(prep.o.T), E: M('evaporation'), W: M('vapour'),
    Um: M('wind_east'), Uo: ann(prep.o.U), Vm: M('wind_north'), Vo: ann(prep.o.V), H: prep.h,
    PmJul: toLevel(res.precipitation, level, L)[6], PoJul: prep.o.P[6], PmJan: toLevel(res.precipitation, level, L)[0], PoJan: prep.o.P[0] };
  if (res.diag) for (const [k, v] of Object.entries(res.diag)) fields['d_' + k] = toLevel(Float32Array.from(v), level, L, 1)[0];
  for (const [k, v] of Object.entries(fields)) writeFileSync(`${d}/${k}.f32`, f32(v));
}
