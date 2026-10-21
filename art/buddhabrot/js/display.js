// Histogram → image: blur, normalization, scaling, clipping and the gradient. All of it runs on the
// main thread from the finished histogram, so display settings need no new orbits. Values are compared as densities
// (result.data × result.norm: hits per sample per unit area), so the look does not depend on the number of samples or
// the resolution, and a zoom can borrow the brightness statistics of the whole-set render (docs/sampling.md).
import { parseGradient, clamp } from './state.js';

var lutCache = { key: null, table: null }, blurCache = new WeakMap(), statsCache = new WeakMap();

// sRGB bytes ↔ OKLab (Björn Ottosson). Gradients blend in OKLab, as on the mandelbrot page: its lightness steps are
// even and its mid-tones keep their saturation, where blending sRGB bytes dulls them (owner's pick, 2026-10-21).
function toLinear(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function toByte(v) { v = clamp(v, 0, 1); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
function oklab(c) {
  var r = toLinear(c[0]), g = toLinear(c[1]), b = toLinear(c[2]);
  var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function fromOklab(L, a, b) {
  var l = L + 0.3963377774 * a + 0.2158037573 * b, m = L - 0.1055613458 * a - 0.0638541728 * b, s = L - 0.0894841775 * a - 1.2914855480 * b;
  l *= l * l; m *= m * m; s *= s * s;
  return [toByte(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), toByte(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toByte(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
}

// 1024-entry table (little-endian RGBA) for a gradient string; flat beyond the first and last stop
export function lut(gradient) {
  if (lutCache.key === gradient) return lutCache.table;
  var stops = parseGradient(gradient), table = new Uint32Array(1024), k = 0;
  var lab = stops.map(function(s) { return oklab([1, 3, 5].map(function(o) { return parseInt(s.c.substr(o, 2), 16); })); });
  for (var j = 0; j < 1024; j++) {
    var f = j / 1023;
    while (k < stops.length - 2 && f > stops[k + 1].p) k++;
    var span = stops[k + 1].p - stops[k].p, t = span > 0 ? clamp((f - stops[k].p) / span, 0, 1) : f < stops[k].p ? 0 : 1;
    var c0 = lab[k], c1 = lab[k + 1];
    var c = fromOklab(c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t);
    table[j] = (255 << 24 | c[2] << 16 | c[1] << 8 | c[0]) >>> 0;
  }
  lutCache = { key: gradient, table: table };
  return table;
}

// Separable blur: exact Gaussian for small σ, three box passes for large σ (constant time per pixel). Edges are clamped.
function gaussKernel(sigma) {
  var r = Math.max(1, Math.floor(3 * sigma)), k = new Float32Array(2 * r + 1), s = 0;
  for (var i = -r; i <= r; i++) s += (k[i + r] = Math.exp(-0.5 * (i / sigma) * (i / sigma)));
  for (i = 0; i < k.length; i++) k[i] /= s;
  return k;
}
function boxRadii(sigma) {
  var n = 3, wIdeal = Math.sqrt(12 * sigma * sigma / n + 1), wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  var m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4)), out = [];
  for (var i = 0; i < n; i++) out.push(((i < m ? wl : wl + 2) - 1) / 2);
  return out;
}
function boxPass(src, dst, n, r) {
  var acc = 0, last = n - 1, i;
  for (i = -r; i <= r; i++) acc += src[i < 0 ? 0 : i > last ? last : i];
  var inv = 1 / (2 * r + 1);
  for (i = 0; i < n; i++) {
    dst[i] = acc * inv;
    var a = i + r + 1, b = i - r;
    acc += src[a > last ? last : a] - src[b < 0 ? 0 : b];
  }
}
function blurAxis(data, n, sigma, vertical) {
  if (sigma <= 0.01) return;
  var line = new Float32Array(n), tmp = new Float32Array(n), kernel = sigma < 4 ? gaussKernel(sigma) : null;
  var radii = kernel ? null : boxRadii(sigma), kr = kernel ? (kernel.length - 1) / 2 : 0, i, l, k;
  for (l = 0; l < n; l++) {
    if (vertical) for (i = 0; i < n; i++) line[i] = data[i * n + l];
    else line.set(data.subarray(l * n, l * n + n));
    if (kernel) {
      for (i = 0; i < n; i++) {
        var s = 0;
        for (k = -kr; k <= kr; k++) { var j = i + k; s += kernel[k + kr] * line[j < 0 ? 0 : j >= n ? n - 1 : j]; }
        tmp[i] = s;
      }
    } else {
      boxPass(line, tmp, n, radii[0]); boxPass(tmp, line, n, radii[1]); boxPass(line, tmp, n, radii[2]);
    }
    if (vertical) for (i = 0; i < n; i++) data[i * n + l] = tmp[i];
    else data.set(tmp, l * n);
  }
}
// cached per result and radius, so dragging other sliders does not blur again
function blurred(result, sigma) {
  var c = blurCache.get(result);
  if (c && c.sigma === sigma) return c.data;
  var data = new Float32Array(result.data);
  blurAxis(data, result.res, sigma, true);
  blurAxis(data, result.res, sigma, false);
  blurCache.set(result, { sigma: sigma, data: data });
  return data;
}

// The blur radius is given in pixels of a 1000-pixel image, so that it covers the same part of the picture at any resolution.
// A crop (below) gives its scale as full: its pixels per width of the whole image.
function blurSigma(result, st) { return st.soft_points ? st.blur_px * (result.full || result.res) / 1000 : 0; }
function source(result, st) { var s = blurSigma(result, st); return s > 0 ? blurred(result, s) : result.data; }

// ---------- brightness statistics ----------
// Quantiles of an image's non-zero pixel values, in the units of its data: at LEVELS (fraction of the non-zero pixels
// at or below), evenly spaced and denser in the bright tail. The scalings read their maximum and median from it, and
// equalization the ranks.
var LEVELS = (function() {
  var l = [], i;
  for (i = 0; i <= 2048; i++) l.push(i / 2048);
  for (i = 0; i <= 256; i++) l.push(1 - Math.pow(10, -2 - 4 * i / 256));
  l.sort(function(a, b) { return a - b; });
  return Float64Array.from(l.filter(function(v, k) { return k === 0 || v > l[k - 1]; }));
})();

function stats(result, st) {
  var sigma = blurSigma(result, st), c = statsCache.get(result);
  if (c && c.sigma === sigma) return c.q;
  var src = source(result, st), n = 0, i;
  for (i = 0; i < src.length; i++) if (src[i] > 0) n++;
  var sorted = new Float32Array(n), k = 0;
  for (i = 0; i < src.length; i++) if (src[i] > 0) sorted[k++] = src[i];
  sorted.sort();
  var values = new Float64Array(LEVELS.length);
  if (n) for (i = 0; i < LEVELS.length; i++) values[i] = sorted[Math.round(LEVELS[i] * (n - 1))];
  var q = { values: values, max: n ? sorted[n - 1] : 0, n: n };
  statsCache.set(result, { sigma: sigma, q: q });
  return q;
}
// value at a level, interpolated
function valueAt(q, level) {
  var lo = 0, hi = LEVELS.length - 1;
  while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (LEVELS[mid] > level) hi = mid; else lo = mid; }
  var t = (level - LEVELS[lo]) / (LEVELS[hi] - LEVELS[lo]);
  return q.values[lo] + (q.values[hi] - q.values[lo]) * clamp(t, 0, 1);
}
// level of a value: its rank among the non-zero pixels, between 0 and 1; a run of equal values gets its middle rank
function levelAt(q, v) {
  var vals = q.values, last = vals.length - 1;
  if (v <= 0) return 0;
  if (v >= vals[last]) return 1;
  var a = 0, b = last, mid;
  while (a < b) { mid = (a + b) >> 1; if (vals[mid] < v) a = mid + 1; else b = mid; }      // first index with vals ≥ v
  if (vals[a] === v) {
    var e = a;
    while (e < last && vals[e + 1] === v) e++;
    return (LEVELS[a] + LEVELS[e]) / 2;
  }
  if (a === 0) return LEVELS[0];
  return LEVELS[a - 1] + (LEVELS[a] - LEVELS[a - 1]) * (v - vals[a - 1]) / (vals[a] - vals[a - 1]);
}

// ---------- preview and crops ----------
// The result summed down in k × k blocks, for a preview about the size of the screen: every display setting then works
// on few pixels, however large the resolution. Summing counts is exact, and norm / k² keeps the densities, so the
// preview looks like the full image.
var poolCache = new WeakMap();
export function pooled(result, k) {
  if (k <= 1) return result;
  var c = poolCache.get(result);
  if (c && c.k === k) return c.p;
  var p = crop(result, 0, 0, result.res, k);
  poolCache.set(result, { k: k, p: p });
  return p;
}
// The square of s × s pixels at row i0, column j0, summed in k × k blocks: the sharp view of a zoomed-in preview.
// Blocks cut off at the bottom and right edge are scaled up to a full block.
export function crop(result, i0, j0, s, k) {
  var n = result.res, m = Math.ceil(s / k), N = n * n, M = m * m, nb = result.bands || 1, src = result.data;
  var data = new Float32Array(M * nb), i, j, b;
  for (b = 0; b < nb; b++) for (i = 0; i < s; i++) {
    var row = b * M + (i / k | 0) * m, o = b * N + (i0 + i) * n + j0;
    for (j = 0; j < s; j++) data[row + (j / k | 0)] += src[o + j];
  }
  if (s % k) {
    var r = s - (m - 1) * k, f = k / r;
    for (b = 0; b < nb; b++) for (i = 0; i < m; i++) {
      data[b * M + i * m + m - 1] *= f;
      data[b * M + (m - 1) * m + i] *= f;
    }
  }
  return { data: data, res: m, full: n * m / s, b: result.b, norm: result.norm / (k * k), bands: result.bands, total: result.total };
}

// A result's channels, each shaped like a result ({ data, res, full, norm }) so the blur and statistics caches work on them.
// Without bands, the one channel is the result itself. With bands, channel k holds bands 0 … k, so the last one holds
// every orbit, as the plain image does.
var channelCache = new WeakMap();
function channels(result) {
  if (result.bands !== 3) return [result];
  var c = channelCache.get(result);
  if (c) return c;
  var N = result.res * result.res, d = result.data, out = [], acc = new Float32Array(N);
  for (var k = 0; k < 3; k++) {
    for (var i = 0; i < N; i++) acc[i] += d[k * N + i];
    out.push({ data: Float32Array.from(acc), res: result.res, full: result.full, norm: result.norm });
  }
  channelCache.set(result, out);
  return out;
}

// The normalization of one channel: returns its blurred-or-not values src and u(v), which maps a value of src to a
// brightness in [0, 1], or null when the channel is empty. ref, if given, is the matching channel whose statistics set
// the normalization.
function mapper(result, st, ref) {
  var src = source(result, st), base = ref || result, q = stats(base, st), qk = base.norm, k = result.norm / qk;
  if (!q.n) return null;
  // linear, nth root and log scale the densities up to the brightest pixel; equalization maps each value to its rank,
  // read straight from the table, in its units (v · k).
  var mode = st.scale_mode, inv = 1 / Math.max(1.1, st.root), dk = result.norm;
  var med = valueAt(q, 0.5) * qk;
  function scale(d) { return mode === 'nth root' ? Math.pow(d, inv) : mode === 'log' ? Math.log1p(d / med) : d; }
  var top = scale(q.max * qk), k1 = top > 0 ? 1 / top : 0;
  return {
    src: src,
    u: function(v) {
      if (v <= 0) return 0;
      if (mode === 'equalize') return levelAt(q, v * k);
      var u = scale(v * dk) * k1;
      return u > 1 ? 1 : u;
    }
  };
}

function rgb(hex) { return [0, 2, 4].map(function(o) { return parseInt(hex.substr(o, 2), 16); }); }

// Draws result onto canvas with the display settings st. ref, if given, is the result whose brightness statistics
// set the normalization: the whole-set render, so that a zoom keeps its look. Colouring by orbit length needs a result
// computed with bands (and a reference with them); otherwise the gradient colours the whole image. Returns the 256
// brightness bins for the histogram plot (of the channel with every orbit), or null when the image is empty.
export function render(canvas, result, st, ref) {
  var ctx = canvas.getContext('2d');
  var n = result.res, N = n * n, i, t;
  if (canvas.width !== n) { canvas.width = n; canvas.height = n; }
  var chs = channels(result), rchs = ref ? channels(ref) : null;
  var bylength = st.colour_mode === 'length' && chs.length === 3 && (!rchs || rchs.length === 3);
  var ks = bylength ? [0, 1, 2] : [chs.length - 1];
  // Each channel is normalized by its own statistics (the classic look), or all by those of the channel with every orbit,
  // which keeps the channels' true proportions (channel_norm 'shared').
  var shared = bylength && st.channel_norm === 'shared';
  var maps = ks.map(function(k) { return mapper(chs[k], st, shared ? (rchs || chs)[2] : rchs ? rchs[k] : null); });
  var all = maps[maps.length - 1];
  if (!all) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, n, n); return null; }
  var lo = st.min_clip, hi = st.max_clip;
  if (hi <= lo) hi = lo + 1e-6;
  var k2 = 1 / (hi - lo);
  // The midtone maps its point of the clipped range to the middle of the colours: a power curve, as in levels tools.
  var gamma = Math.log(0.5) / Math.log(clamp(st.midtone, 0.02, 0.98)), curve = gamma !== 1;
  function clip(u) { t = (u - lo) * k2; t = t < 0 ? 0 : t > 1 ? 1 : t; return curve ? Math.pow(t, gamma) : t; }
  var bins = new Float64Array(256), im = ctx.createImageData(n, n), px = new Uint32Array(im.data.buffer);
  if (!bylength) {
    var table = lut(st.gradient);
    for (i = 0; i < N; i++) {
      var u = all.u(all.src[i]);
      bins[u >= 1 ? 255 : (u * 256) | 0]++;
      px[i] = table[(clip(u) * 1023 + 0.5) | 0];
    }
  } else {
    // the channel colours add up, in sRGB, and saturate at white
    var cols = [rgb(st.colour_short), rgb(st.colour_mid), rgb(st.colour_long)];
    for (i = 0; i < N; i++) {
      var r = 0, g = 0, b = 0;
      for (var k = 0; k < 3; k++) {
        if (!maps[k]) continue;
        var uk = maps[k].u(maps[k].src[i]), tk = clip(uk);
        r += tk * cols[k][0]; g += tk * cols[k][1]; b += tk * cols[k][2];
        if (k === 2) bins[uk >= 1 ? 255 : (uk * 256) | 0]++;
      }
      px[i] = (255 << 24 | Math.min(255, b) << 16 | Math.min(255, g) << 8 | Math.min(255, r)) >>> 0;
    }
  }
  ctx.putImageData(im, 0, 0);
  return bins;
}

// log count per brightness level; the clipped parts, which get the end colours, are drawn faint
export function drawHistogram(hc, bins, st) {
  var h = hc.getContext('2d'), W = hc.width, H = hc.height;
  var cs = getComputedStyle(document.documentElement);
  h.fillStyle = cs.getPropertyValue('--color-bg').trim();
  h.fillRect(0, 0, W, H);
  if (!bins) return;
  var maxLog = 0, i;
  for (i = 0; i < 256; i++) maxLog = Math.max(maxLog, Math.log1p(bins[i]));
  if (maxLog <= 0) return;
  h.fillStyle = cs.getPropertyValue('--color-text-secondary').trim();
  var bw = W / 256;
  for (i = 0; i < 256; i++) {
    var bh = Math.log1p(bins[i]) / maxLog * (H - 4), u = (i + 0.5) / 256;
    h.globalAlpha = u < st.min_clip || u > st.max_clip ? 0.3 : 1;
    if (bh > 0) h.fillRect(i * bw, H - bh, Math.ceil(bw), bh);
  }
  h.globalAlpha = 1;
}
