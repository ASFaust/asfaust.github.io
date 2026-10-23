// Checks of the .globe format, without a browser:  node tests/globefile.mjs [out.globe]
//  - every value type round-trips within its precision, several frames included
//  - the poles and every diamond land back on the right cells
//  - bad input gives a readable error
// With a path, it also writes a sample file there, to open with a zip tool.
import { writeFileSync } from 'node:fs';
import { encodeGlobe, decodeGlobe } from '../js/globefile.js';
import { buildGrid } from '../js/grid.js';

let failed = 0;
const check = (ok, what) => { if (!ok) { failed++; console.log('FAIL', what); } };

const g = buildGrid(4), N = g.count;
const lat = new Float32Array(N), id = new Float32Array(N), months = new Float32Array(12 * N);
for (let i = 0; i < N; i++) {
  lat[i] = Math.asin(g.pos[3 * i + 2]) * 180 / Math.PI;
  id[i] = i;
  for (let f = 0; f < 12; f++) months[f * N + i] = 20 * Math.cos(f / 12 * 2 * Math.PI) * g.pos[3 * i + 2] + f;
}
const height = lat.map(v => v * 100 - 3000);

const globe = {
  params: { seed: 42, note: 'test' },
  layers: {
    height: { level: 4, dtype: 'int16', unit: 'm', values: height },
    ids: { level: 4, dtype: 'float32', values: id },
    temperature: { level: 4, dtype: 'float16', frames: 12, unit: '°C', values: months },
    band: { level: 4, dtype: 'uint8', scale: 1, offset: -90, values: lat },
  },
};
const bytes = await encodeGlobe(globe);
if (process.argv[2]) writeFileSync(process.argv[2], bytes);
const back = await decodeGlobe(bytes);

check(back.params.seed === 42 && back.params.note === 'test', 'params');
const maxErr = (a, b) => { let e = 0; for (let i = 0; i < a.length; i++) e = Math.max(e, Math.abs(a[i] - b[i])); return e; };
check(back.layers.ids.values.every((v, i) => v === i), 'float32 exact, cells in place (poles too)');
check(maxErr(back.layers.height.values, height) <= 0.5, 'int16 within half a unit');
check(back.layers.temperature.frames === 12, 'frames kept');
const relHalf = Math.max(...back.layers.temperature.values.map((v, i) => Math.abs(v - months[i]) / Math.max(1, Math.abs(months[i]))));
check(relHalf < 1e-3, `float16 within its precision (${relHalf})`);
check(maxErr(back.layers.band.values, lat) <= 0.5 + 1e-5, 'uint8 with offset');
check(back.layers.height.unit === 'm' && back.layers.temperature.unit === '°C', 'units kept');

const fails = async (f, what) => { try { await f(); check(false, what); } catch (e) { check(/globe|layer/.test(e.message), `${what}: ${e.message}`); } };
await fails(() => decodeGlobe(new Uint8Array(100)), 'garbage rejected');
const broken = bytes.slice(); broken[bytes.length >> 1] ^= 0xff;
await fails(() => decodeGlobe(broken), 'damage detected');
await fails(() => encodeGlobe({ layers: { x: { level: 4, dtype: 'int16', values: new Float32Array(5) } } }), 'wrong length rejected');

console.log(`${bytes.length} bytes for 4 layers at level 4`);
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
