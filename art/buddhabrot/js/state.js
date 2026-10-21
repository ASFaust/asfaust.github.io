// The settings: defaults, validation, slider mappings and the URL hash. st is the one live settings
// object; it is changed in place (setState), so every module that imports it sees the same values.

// Gradients are "rrggbb@position" stops, blended in OKLab (display.js). Few stops on purpose: they are meant to be
// edited by hand. All but cloud start at black, the empty background. Picked by the owner on two review sheets
// (docs/backlog.md, 2026-10-21): "night" is the former cloud, cloud is now a sky, and the last five have two hues.
export var GRADIENTS = {
  gray: '000000@0,ffffff@1',
  hot: '000000@0,b4140a@0.35,ffb928@0.7,ffffff@1',
  night: '04060b@0,1f2a40@0.3,7d88a0@0.65,f3eee6@1',
  cloud: '2f6fb8@0,6fa8dc@0.35,d8e6f2@0.75,ffffff@1',
  ice: '000000@0,0d2a4d@0.35,5b9bd5@0.7,f2f8ff@1',
  dusk: '000000@0,321239@0.35,b25653@0.7,e2d9e2@1',
  aurora: '000000@0,0b3b3a@0.35,3fbf8f@0.7,effff0@1',
  gold: '000000@0,3d2606@0.35,c48a2c@0.7,fff4d6@1',
  amethyst: '000000@0,2a1650@0.35,9a7ae0@0.7,f6f0ff@1',
  patina: '000000@0,0f3a46@0.4,d08850@0.78,fff6ea@1',
  lapis: '000000@0,0f2350@0.35,c89b3c@0.75,fff6dc@1',
  sodium: '000000@0,1a1f5c@0.35,f08a30@0.75,fff4e0@1',
  reef: '000000@0,0b3a4a@0.3,e06a50@0.65,ffe9a8@1',
  sunset: '000000@0,1b1446@0.25,9c2f6e@0.5,f08a4b@0.75,fff1c9@1',
  'ember-ice': '000000@0,3a0d05@0.3,c0502a@0.55,8fd0e8@0.85,ffffff@1'
};

export var DEFAULTS = {
  sampler: 'bisection',
  samples: 600,
  nearby_points: 20,
  nearby_spread: 1e-3,
  max_iter: 100000,
  resolution: 2000,
  refine_steps: 10,
  balance: 0.5,
  chain_length: 100,
  burn_in: 20,
  large_step: 0.05,
  mutation_min: 1e-7,
  mutation_max: 1,
  seed: 0,
  xmin: -2.0,
  xmax: 1.0,
  ymin: -1.5,
  ymax: 1.5,
  scale_mode: 'log',
  root: 2.5,
  gradient: GRADIENTS.hot,
  min_clip: 0.143,
  max_clip: 0.778,
  // the levels midpoint: where between the clips mid-grey falls, as a fraction of the clipped range (0.5: no change)
  midtone: 0.5,
  soft_points: true,
  blur_px: 0.32,
  // Colouring by orbit length (the "Nebulabrot"): orbits escaping within band_short iterations, within band_mid, and the
  // rest. Channel colours add up; each channel holds its band and all shorter ones, as in the classic picture.
  colour_mode: 'gradient',
  band_short: 50,
  band_mid: 500,
  colour_short: '2050ff',
  colour_mid: '20e060',
  colour_long: 'ff3020',
  channel_norm: 'separate'
};
export var KEYS = Object.keys(DEFAULTS);

// Built-in presets only list what differs from the defaults. Type A first (bisection, few samples, long orbits), then
// type B (grid sampler, many samples; equalized with an aggressive min clip, which carves the figure out of its glow),
// colouring by orbit length, and a zoom.
var GRID_B = { sampler: 'grid', samples: 2000000, scale_mode: 'equalize', max_clip: 1 };
var NEBULA = { sampler: 'grid', samples: 3000000, max_iter: 5000, colour_mode: 'length', scale_mode: 'nth root', root: 3, min_clip: 0.1, max_clip: 0.8 };
export var BUILTIN = {
  'Default': {},
  'Gold head': { balance: 1, samples: 900, gradient: GRADIENTS.gold },
  'Lapis filigree': { refine_steps: 20, max_clip: 0.6, midtone: 0.4, gradient: GRADIENTS.lapis },
  'Sodium lamp': { nearby_points: 5, nearby_spread: 1e-5, max_clip: 0.6, midtone: 0.4, gradient: GRADIENTS.sodium },
  'Coral': { samples: 300, nearby_points: 40, nearby_spread: 0.01, max_clip: 0.6, midtone: 0.4, gradient: GRADIENTS.reef },
  'Amethyst bubbles': { samples: 60, nearby_points: 200, nearby_spread: 1e-4, max_iter: 200000, gradient: GRADIENTS.amethyst },
  'Twelve orbits': { samples: 12, nearby_points: 2000, nearby_spread: 3e-5, max_iter: 200000, max_clip: 0.7, gradient: GRADIENTS.sunset },
  'Patina': Object.assign({}, GRID_B, { max_iter: 1000, min_clip: 0.55, gradient: GRADIENTS.patina }),
  'Ember and ice': Object.assign({}, GRID_B, { max_iter: 2000, min_clip: 0.65, midtone: 0.6, gradient: GRADIENTS['ember-ice'] }),
  'Lapis': Object.assign({}, GRID_B, { max_iter: 3000, min_clip: 0.65, gradient: GRADIENTS.lapis }),
  'Sunset': Object.assign({}, GRID_B, { max_iter: 300, min_clip: 0.65, gradient: GRADIENTS.sunset }),
  'Aurora': Object.assign({}, GRID_B, { max_iter: 100, min_clip: 0.65, gradient: GRADIENTS.aurora }),
  'Lace (40 iterations)': Object.assign({}, GRID_B, { samples: 3000000, max_iter: 40, min_clip: 0.7, gradient: GRADIENTS.sunset }),
  'Ghost (20 iterations)': Object.assign({}, GRID_B, { samples: 3000000, max_iter: 20, min_clip: 0.1, gradient: GRADIENTS.gray }),
  'Cloud': Object.assign({}, GRID_B, { max_iter: 200, min_clip: 0.6, midtone: 0.65, gradient: GRADIENTS.cloud }),
  'Negative': Object.assign({}, GRID_B, { max_iter: 500, min_clip: 0.25, gradient: 'ffffff@0,000000@1' }),
  'Nebulabrot': NEBULA,
  'Deep Nebulabrot': Object.assign({}, NEBULA, { samples: 2000000, max_iter: 20000, band_short: 200, band_mid: 2000, min_clip: 0.05, max_clip: 0.75 }),
  'Warm Nebulabrot': Object.assign({}, NEBULA, { colour_short: '7a1fd0', colour_mid: 'e04a2a', colour_long: 'ffd060' }),
  'Head (zoom)': Object.assign({}, GRID_B, { samples: 100000, chain_length: 200, max_iter: 5000, min_clip: 0.3,
    xmin: -1.9, xmax: -1.0, ymin: -0.45, ymax: 0.45, gradient: GRADIENTS.dusk })
};

export var st = Object.assign({}, DEFAULTS);
export function setState(data) { Object.assign(st, sanitize(data)); }

export function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// ---------- log sliders (same mappings as the desktop version) ----------
function logFrom(t, lo, hi) { return Math.pow(10, Math.log10(lo) + t * (Math.log10(hi) - Math.log10(lo))); }
function logTo(v, lo, hi) { return (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)); }
export var SLIDERS = {
  samples: {
    from: function(t) { return Math.round(Math.min(5e6, Math.max(1, logFrom(t, 1, 5e6)))); },
    to: function(v) { return logTo(Math.max(1, Math.min(5e6, v)), 1, 5e6); },
    fmt: function(v) { return v.toLocaleString('en-US'); }
  },
  nearby_points: {
    from: function(t) { return t === 0 ? 0 : Math.round(Math.min(1e5, logFrom(t, 1, 1e5))); },
    to: function(v) { return v <= 0 ? 0 : logTo(Math.min(1e5, v), 1, 1e5); },
    fmt: function(v) { return String(v); }
  },
  // standard deviation of the nearby cloud in the complex plane, log scale from 1e-6 (tight) to 0.1 (wide)
  nearby_spread: {
    from: function(t) { return +logFrom(t, 1e-6, 0.1).toPrecision(2); },
    to: function(v) { return logTo(Math.max(1e-6, Math.min(0.1, v)), 1e-6, 0.1); },
    fmt: function(v) {
      var e = Math.floor(Math.log10(v) + 1e-9), m = v / Math.pow(10, e);
      return (+m.toFixed(1)) + ' × 10' + String(e).replace('-', '⁻').replace(/\d/g, function(d) { return '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]; });
    }
  },
  // std. dev. in pixels, log scale from 5 px on the left down to 0.1 px on the right
  blur_px: {
    from: function(t) { return +logFrom(1 - t, 0.1, 5).toFixed(2); },
    to: function(v) { return 1 - logTo(Math.max(0.1, Math.min(5, v)), 0.1, 5); },
    fmt: function(v) { return v.toFixed(2) + ' px'; }
  }
};
// setting → element id suffix: p-… is the input, v-… the value shown next to a slider
export var SLIDER_IDS = { samples: 'samples', nearby_points: 'nearby', nearby_spread: 'nspread', blur_px: 'blurs' };
export var NUMBER_IDS = { band_short: 'bshort', band_mid: 'bmid', max_iter: 'iter', resolution: 'res', refine_steps: 'refine', chain_length: 'chain', burn_in: 'burn', large_step: 'large', mutation_min: 'mmin', mutation_max: 'mmax', seed: 'seed', xmin: 'xmin', xmax: 'xmax', ymin: 'ymin', ymax: 'ymax' };
var INT_KEYS = { max_iter: 1, resolution: 1, refine_steps: 1, chain_length: 1, burn_in: 1, seed: 1, band_short: 1, band_mid: 1 };

export function parseGradient(str) {
  var stops = String(str).split(',').map(function(part) {
    var m = /^#?([0-9a-f]{6})@([0-9.e-]+)$/i.exec(part.trim());
    return m && isFinite(+m[2]) ? { c: '#' + m[1].toLowerCase(), p: clamp(+m[2], 0, 1) } : null;
  });
  return stops.length >= 2 && stops.every(Boolean) ? stops : null;
}
export function gradientString(stops) {
  return stops.slice().sort(function(a, b) { return a.p - b.p; }).map(function(s) { return s.c.slice(1) + '@' + +s.p.toFixed(4); }).join(',');
}

// Any object (URL hash, preset) → a complete, valid settings object.
export function sanitize(data) {
  var out = Object.assign({}, DEFAULTS);
  KEYS.forEach(function(k) {
    if (!(k in data)) return;
    var v = data[k], d = DEFAULTS[k];
    if (typeof d === 'boolean') out[k] = v === true || v === 'true' || v === '1' || v === 1;
    else if (typeof d === 'number') { v = Number(v); if (isFinite(v)) out[k] = INT_KEYS[k] ? Math.round(v) : v; }
    else out[k] = String(v);
  });
  out.samples = clamp(out.samples, 1, 5e6);
  out.nearby_points = clamp(out.nearby_points, 0, 1e5);
  out.nearby_spread = clamp(out.nearby_spread, 1e-6, 0.1);
  out.max_iter = clamp(out.max_iter, 2, 1e6);
  out.resolution = clamp(out.resolution, 128, 4096);
  out.refine_steps = clamp(out.refine_steps, 0, 10000);
  out.balance = clamp(out.balance, 0, 1);
  out.chain_length = clamp(out.chain_length, 1, 1e6);
  out.burn_in = clamp(out.burn_in, 0, 1e6);
  out.large_step = clamp(out.large_step, 0, 1);
  out.mutation_min = clamp(out.mutation_min, 1e-15, 1);
  out.mutation_max = clamp(out.mutation_max, out.mutation_min, 10);
  out.seed = clamp(out.seed, 0, 2147483647);
  out.root = clamp(out.root, 1.1, 20);
  out.min_clip = clamp(out.min_clip, 0, 1);
  out.max_clip = clamp(out.max_clip, 0, 1);
  out.midtone = clamp(out.midtone, 0.02, 0.98);
  out.blur_px = clamp(out.blur_px, 0.1, 5);
  if (['bisection', 'grid'].indexOf(out.sampler) < 0) out.sampler = DEFAULTS.sampler;
  // Zoomed views are rendered with Metropolis (compute.js), which needs a known density. Bisection has none, so the
  // bisection sampler always draws the whole set.
  if (out.sampler === 'bisection') {
    ['xmin', 'xmax', 'ymin', 'ymax'].forEach(function(k) { out[k] = DEFAULTS[k]; });
  }
  if (['linear', 'nth root', 'log', 'equalize'].indexOf(out.scale_mode) < 0) out.scale_mode = DEFAULTS.scale_mode;
  if (['gradient', 'length'].indexOf(out.colour_mode) < 0) out.colour_mode = DEFAULTS.colour_mode;
  if (['separate', 'shared'].indexOf(out.channel_norm) < 0) out.channel_norm = DEFAULTS.channel_norm;
  out.band_short = clamp(out.band_short, 1, 1e6);
  out.band_mid = clamp(out.band_mid, out.band_short + 1, 1e6);
  ['colour_short', 'colour_mid', 'colour_long'].forEach(function(k) {
    var m = /^#?([0-9a-f]{6})$/i.exec(out[k]);
    out[k] = m ? m[1].toLowerCase() : DEFAULTS[k];
  });
  var g = parseGradient(out.gradient);
  out.gradient = g ? gradientString(g) : DEFAULTS.gradient;
  return out;
}

export function fullBounds(p) { return ['xmin', 'xmax', 'ymin', 'ymax'].every(function(k) { return (p || st)[k] === DEFAULTS[k]; }); }

// ---------- URL hash: every setting that differs from its default ----------
export function writeHash() {
  var parts = KEYS.filter(function(k) { return st[k] !== DEFAULTS[k]; }).map(function(k) {
    var v = st[k];
    if (typeof v === 'boolean') v = v ? 1 : 0;
    return encodeURIComponent(k) + '=' + encodeURIComponent(v);
  });
  history.replaceState(null, '', parts.length ? '#' + parts.join('&') : location.pathname + location.search);
}
export function readHash() {
  var h = location.hash.replace(/^#/, '');
  if (!h) return false;
  var data = {};
  h.split('&').forEach(function(p) {
    var i = p.indexOf('=');
    if (i > 0) data[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1));
  });
  setState(data);
  return true;
}
