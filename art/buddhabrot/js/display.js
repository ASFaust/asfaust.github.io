// Histogram → image: blur, scaling, normalization, clipping and the gradient. All of it runs on the
// main thread from the finished histogram, so display settings need no new orbits.
import { parseGradient, clamp } from './state.js';

var lutCache = { key: null, table: null }, blurCache = null, scaledBuf = null;

// 1024-entry table (little-endian RGBA) for a gradient string; flat beyond the first and last stop
export function lut(gradient) {
  if (lutCache.key === gradient) return lutCache.table;
  var stops = parseGradient(gradient), table = new Uint32Array(1024), k = 0;
  var rgb = stops.map(function(s) { return [1, 3, 5].map(function(o) { return parseInt(s.c.substr(o, 2), 16); }); });
  for (var j = 0; j < 1024; j++) {
    var f = j / 1023;
    while (k < stops.length - 2 && f > stops[k + 1].p) k++;
    var span = stops[k + 1].p - stops[k].p, t = span > 0 ? clamp((f - stops[k].p) / span, 0, 1) : f < stops[k].p ? 0 : 1;
    var c0 = rgb[k], c1 = rgb[k + 1];
    var r = Math.round(c0[0] + (c1[0] - c0[0]) * t), g = Math.round(c0[1] + (c1[1] - c0[1]) * t), bl = Math.round(c0[2] + (c1[2] - c0[2]) * t);
    table[j] = (255 << 24 | bl << 16 | g << 8 | r) >>> 0;
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
  if (blurCache && blurCache.result === result && blurCache.sigma === sigma) return blurCache.data;
  var data = new Float32Array(result.data);
  blurAxis(data, result.res, sigma, true);
  blurAxis(data, result.res, sigma, false);
  blurCache = { result: result, sigma: sigma, data: data };
  return data;
}

// Draws result onto canvas with the display settings st. Returns the 256 brightness bins for the
// histogram plot, or null when the histogram is empty.
export function render(canvas, result, st) {
  var ctx = canvas.getContext('2d');
  var n = result.res, N = n * n, src = st.soft_points ? blurred(result, st.blur_px) : result.data, i, v;
  if (canvas.width !== n) { canvas.width = n; canvas.height = n; }
  if (!scaledBuf || scaledBuf.length !== N) scaledBuf = new Float32Array(N);
  var scaled = scaledBuf;
  var mode = st.scale_mode, inv = 1 / Math.max(1.1, st.root), smax = 0;
  for (i = 0; i < N; i++) {
    v = src[i];
    if (mode === 'nth root') v = Math.pow(v, inv);
    else if (mode === 'log') v = Math.log1p(v);
    scaled[i] = v;
    if (v > smax) smax = v;
  }
  if (smax <= 0) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, n, n); return null; }
  var lo = st.min_clip, hi = st.max_clip;
  if (hi <= lo) hi = lo + 1e-6;
  // Normalize to [0, 1]. Percentile and equalization look at the distribution of the non-empty pixels;
  // equalization maps each value to its rank, interpolated within a fine histogram.
  var k1 = 1 / smax, NB = 65536, cdf = null;
  if (st.normalize !== 'max') {
    var hist = new Float64Array(NB), nz = 0;
    for (i = 0; i < N; i++) if (scaled[i] > 0) { v = scaled[i] * k1 * NB; hist[v >= NB ? NB - 1 : v | 0]++; nz++; }
    if (st.normalize === 'percentile') {
      var want = nz * st.norm_percentile / 100, acc = 0, b = 0;
      while (b < NB - 1 && acc + hist[b] < want) acc += hist[b++];
      k1 = NB / ((b + 1) * smax);
    } else {
      cdf = new Float64Array(NB + 1);
      for (var b2 = 0; b2 < NB; b2++) cdf[b2 + 1] = cdf[b2] + hist[b2] / nz;
    }
  }
  var table = lut(st.gradient), k2 = 1 / (hi - lo);
  var bins = new Float64Array(256), im = ctx.createImageData(n, n), px = new Uint32Array(im.data.buffer);
  for (i = 0; i < N; i++) {
    var u = scaled[i] * k1;
    if (cdf) { var x = u * NB, xb = x >= NB ? NB - 1 : x | 0; u = cdf[xb] + (cdf[xb + 1] - cdf[xb]) * (x - xb); }
    if (u > 1) u = 1;
    bins[u >= 1 ? 255 : (u * 256) | 0]++;
    var t = (u - lo) * k2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    px[i] = table[(t * 1023 + 0.5) | 0];
  }
  ctx.putImageData(im, 0, 0);
  return bins;
}

// log count per brightness level, with the clip positions marked
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
    var bh = Math.log1p(bins[i]) / maxLog * (H - 4);
    if (bh > 0) h.fillRect(i * bw, H - bh, Math.ceil(bw), bh);
  }
  h.fillStyle = '#32c8ff';
  h.fillRect(Math.min(W - 3, st.min_clip * W), 0, 3, H);
  h.fillStyle = '#ffa050';
  h.fillRect(Math.max(0, st.max_clip * W - 3), 0, 3, H);
}
