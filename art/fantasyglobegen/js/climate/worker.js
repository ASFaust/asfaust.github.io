// Runs the climate model off the main thread.
// in:  { height, heightLevel, level, years, params }
// out: { progress } while it runs, then { result: { level, years, layers } } or { error }
import { buildGrid, restrict, prolong } from '../grid.js';
import { buildOps } from './ops.js';
import { runClimate } from './model.js';

const UNITS = { temperature: '°C', precipitation: 'mm/day', evaporation: 'mm/day', vapour: 'mm', wind_east: 'm/s', wind_north: 'm/s' };

self.onmessage = ({ data: { height, heightLevel, level, years, params } }) => {
  try {
    const grids = {};
    const G = l => grids[l] || (grids[l] = buildGrid(l));
    let h = height;
    for (let l = heightLevel; l > level; l--) h = restrict(h, G(l), G(l - 1));
    for (let l = heightLevel; l < level; l++) h = prolong(h, G(l), G(l + 1));
    const ops = buildOps(G(level));
    let last = 0;
    const res = runClimate({
      ops, height: h, years, params,
      onProgress: p => { if (p - last > 0.005 || p === 1) { last = p; self.postMessage({ progress: p }); } },
    });
    const layers = {};
    for (const [k, unit] of Object.entries(UNITS)) layers[k] = { level, dtype: 'float16', frames: 12, unit, values: res[k] };
    self.postMessage({ result: { level, years, layers } }, Object.values(layers).map(l => l.values.buffer));
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
