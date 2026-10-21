// The settings: defaults, validation, slider mappings and the URL hash. st is the one live settings
// object; it is changed in place (setState), so every module that imports it sees the same values.

// Gradients are "rrggbb@position" stops. cividis stops at 0.75 of the matplotlib map, before it turns yellow.
export var GRADIENTS = {
  gray: '000000@0,ffffff@1',
  hot: '000000@0,ff0000@0.365,ffff00@0.746,ffffff@1',
  cividis: '00224e@0,19386f@0.167,434e6c@0.333,61646f@0.5,7c7c78@0.667,9b9377@0.833,bbad6d@1',
  twilight: 'e2d9e2@0,b3c7ce@0.083,7ca1c3@0.167,6275bb@0.25,5e43a5@0.333,4e186f@0.417,321239@0.5,581647@0.583,8e2c50@0.667,b25653@0.75,c68a6d@0.833,d3bcac@0.917,e2d9e2@1'
};

export var DEFAULTS = {
  method: 'boundary',
  sampler: 'boundary',
  samples: 50000,
  nearby_points: 0,
  nearby_distance: 1000,
  max_iter: 1000,
  resolution: 800,
  inside_point: 'fixed',
  inside_real: 0,
  outer_radius: 4,
  refine_steps: 80,
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
  scale_mode: 'nth root',
  root: 2.5,
  normalize: 'equalize',
  norm_percentile: 99.9,
  gradient: GRADIENTS.gray,
  min_clip: 0,
  max_clip: 1,
  soft_points: false,
  blur_px: 1
};
export var KEYS = Object.keys(DEFAULTS);

// Built-in presets only list what differs from the defaults.
export var BUILTIN = {
  'Default': {}
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
  nearby_distance: {
    from: function(t) { return Math.min(1e4, Math.max(10, logFrom(t, 10, 1e4))); },
    to: function(v) { return logTo(Math.max(10, Math.min(1e4, v)), 10, 1e4); },
    fmt: function(v) { return String(Math.round(v)); }
  },
  // std. dev. in pixels, log scale from 5 px on the left down to 0.1 px on the right
  blur_px: {
    from: function(t) { return +logFrom(1 - t, 0.1, 5).toFixed(2); },
    to: function(v) { return 1 - logTo(Math.max(0.1, Math.min(5, v)), 0.1, 5); },
    fmt: function(v) { return v.toFixed(2) + ' px'; }
  },
  // log scale on the tail above the percentile, 10% down to 0.001%
  norm_percentile: {
    from: function(t) { return +(100 - logFrom(1 - t, 0.001, 10)).toFixed(4); },
    to: function(v) { return 1 - logTo(Math.max(0.001, Math.min(10, 100 - v)), 0.001, 10); },
    fmt: function(v) { return +v.toFixed(3) + '%'; }
  }
};
// setting → element id suffix: p-… is the input, v-… the value shown next to a slider
export var SLIDER_IDS = { samples: 'samples', nearby_points: 'nearby', nearby_distance: 'ndist', blur_px: 'blurs', norm_percentile: 'pct' };
export var NUMBER_IDS = { max_iter: 'iter', resolution: 'res', inside_real: 'inre', outer_radius: 'orad', refine_steps: 'refine', chain_length: 'chain', burn_in: 'burn', large_step: 'large', mutation_min: 'mmin', mutation_max: 'mmax', seed: 'seed', xmin: 'xmin', xmax: 'xmax', ymin: 'ymin', ymax: 'ymax' };
var INT_KEYS = { max_iter: 1, resolution: 1, refine_steps: 1, chain_length: 1, burn_in: 1, seed: 1 };

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

// Any object (URL hash, preset, desktop JSON) → a complete, valid settings object.
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
  out.nearby_distance = clamp(out.nearby_distance, 10, 1e4);
  out.max_iter = clamp(out.max_iter, 2, 1e6);
  out.resolution = clamp(out.resolution, 128, 4096);
  out.outer_radius = clamp(out.outer_radius, 2, 100);
  // Only bulb interiors work as the inside end: below the period-4 bulb (−1.368) the real axis is the thin antenna,
  // every point next to it escapes, and the bisection collapses all samples onto the axis.
  out.inside_real = clamp(out.inside_real, -1.36, 0.25);
  out.refine_steps = clamp(out.refine_steps, 0, 10000);
  out.chain_length = clamp(out.chain_length, 1, 1e6);
  out.burn_in = clamp(out.burn_in, 0, 1e6);
  out.large_step = clamp(out.large_step, 0, 1);
  out.mutation_min = clamp(out.mutation_min, 1e-15, 1);
  out.mutation_max = clamp(out.mutation_max, out.mutation_min, 10);
  out.seed = clamp(out.seed, 0, 2147483647);
  out.root = clamp(out.root, 1.1, 20);
  out.min_clip = clamp(out.min_clip, 0, 1);
  out.max_clip = clamp(out.max_clip, 0, 1);
  out.blur_px = clamp(out.blur_px, 0.1, 5);
  if (['boundary', 'metropolis'].indexOf(out.method) < 0) out.method = DEFAULTS.method;
  if (['boundary', 'uniform'].indexOf(out.sampler) < 0) out.sampler = DEFAULTS.sampler;
  if (['fixed', 'bulbs'].indexOf(out.inside_point) < 0) out.inside_point = DEFAULTS.inside_point;
  // Bisection has no known density, so it cannot drive Metropolis, and without Metropolis a zoomed render is mostly noise:
  // the boundary sampler always draws the whole set.
  if (out.sampler === 'boundary') {
    out.method = 'boundary';
    ['xmin', 'xmax', 'ymin', 'ymax'].forEach(function(k) { out[k] = DEFAULTS[k]; });
  }
  if (['linear', 'nth root', 'log'].indexOf(out.scale_mode) < 0) out.scale_mode = DEFAULTS.scale_mode;
  out.norm_percentile = clamp(out.norm_percentile, 90, 99.999);
  if (['equalize', 'percentile', 'max'].indexOf(out.normalize) < 0) out.normalize = DEFAULTS.normalize;
  // desktop presets name a matplotlib colormap and were normalized by the maximum
  if ('cmap' in data && !('gradient' in data)) {
    if (GRADIENTS[data.cmap]) out.gradient = GRADIENTS[data.cmap];
    if (!('normalize' in data)) out.normalize = 'max';
  }
  var g = parseGradient(out.gradient);
  out.gradient = g ? gradientString(g) : DEFAULTS.gradient;
  return out;
}

export function fullBounds() { return ['xmin', 'xmax', 'ymin', 'ymax'].every(function(k) { return st[k] === DEFAULTS[k]; }); }

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
