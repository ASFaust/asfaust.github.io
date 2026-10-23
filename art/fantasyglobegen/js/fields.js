// Test fields for looking at the grid itself. Each returns a Float32Array with one value
// per cell, plus how to colour it.
import { cellCoords } from './grid.js';

export const FIELDS = {
  diamonds: {
    label: 'Diamonds',
    note: 'the 10 diamonds, the poles in white and the 12 pentagons in black',
    make(g) {
      const v = new Float32Array(g.count);
      for (let id = 0; id < g.count; id++) v[id] = g.nbrCount[id] === 5 ? 11 : cellCoords(g, id)[0];
      v[g.north] = v[g.south] = 10;
      return { values: v, style: { cmap: 1, flat: true, range: [0, 11] } };
    },
  },
  area: {
    label: 'Cell area',
    note: 'each cell against the mean: blue smaller, red larger',
    make(g) {
      const v = new Float32Array(g.count), mean = 4 * Math.PI / g.count;
      let lo = Infinity, hi = 0;
      for (let id = 0; id < g.count; id++) { v[id] = g.area[id] / mean; lo = Math.min(lo, v[id]); hi = Math.max(hi, v[id]); }
      const r = Math.max(1 - lo, hi - 1);
      return { values: v, style: { cmap: 2, flat: true, range: [1 - r, 1 + r] }, legend: `${lo.toFixed(3)} to ${hi.toFixed(3)} × the mean` };
    },
  },
  latitude: {
    label: 'Latitude',
    note: 'from the south pole to the north pole',
    make(g) {
      const v = new Float32Array(g.count);
      for (let id = 0; id < g.count; id++) v[id] = Math.asin(Math.max(-1, Math.min(1, g.pos[3 * id + 2]))) * 180 / Math.PI;
      return { values: v, style: { cmap: 0, flat: false, range: [-90, 90] } };
    },
  },
  noise: {
    label: 'Noise',
    note: '3D value noise sampled at each cell, six octaves',
    make(g) {
      const v = new Float32Array(g.count);
      for (let id = 0; id < g.count; id++) {
        let s = 0, a = 0.5, f = 2;
        for (let o = 0; o < 6; o++, a *= 0.5, f *= 2) s += a * valueNoise(g.pos[3 * id] * f, g.pos[3 * id + 1] * f, g.pos[3 * id + 2] * f);
        v[id] = s;
      }
      let lo = Infinity, hi = -Infinity;
      for (const x of v) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
      return { values: v, style: { cmap: 0, flat: false, range: [lo, hi] } };
    },
  },
};

function hash3(x, y, z) {
  let h = Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967295 * 2 - 1;
}

function valueNoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = t => t * t * (3 - 2 * t);
  const u = s(x - xi), v = s(y - yi), w = s(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w);
}
