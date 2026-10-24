// UI wiring: inputs ↔ settings, the generate/stop cycle with its progress display, buttons and keys.
import { st, DEFAULTS, GRADIENTS, SLIDERS, SLIDER_IDS, NUMBER_IDS, setState, readHash, writeHash, fullBounds, clamp } from './state.js';
import { compute, killPool, nCores } from './compute.js';
import { render as draw, drawHistogram, pooled, crop, ADAPT } from './display.js';
import { createView } from './view.js';
import { createGradientEditor } from './gradient.js';
import { initPresets } from './presets.js';
import { stamp, download } from './files.js';
import { Bar } from './bar.js';

var $ = function(id) { return document.getElementById(id); };
var canvas = $('canvas'), detail = $('detail'), stage = $('stage');

var genId = 0, running = false;
var result = null;            // { data: Float32Array, res, b: bounds, total }
var bins = null;              // brightness histogram of the last image
// The last whole-set render, whose brightness statistics a zoom borrows so that it keeps the whole set's look. Only
// renders of the same distribution qualify: the settings in refKey() must match; the samples, seed and
// resolution may differ, since the display compares densities.
var reference = null;         // { key, result }
function refKey(p) { return JSON.stringify([p.sampler, p.max_iter, p.nearby_points, p.nearby_spread, p.refine_steps, p.balance, p.colour_mode, p.band_short, p.band_mid, p.skip_points]); }
function isWhole(b) { return ['xmin', 'xmax', 'ymin', 'ymax'].every(function(k) { return b[k] === DEFAULTS[k]; }); }

// ---------- inputs ← settings ----------
function syncInputs() {
  Object.keys(SLIDER_IDS).forEach(function(k) {
    var id = SLIDER_IDS[k];
    $('p-' + id).value = Math.round(SLIDERS[k].to(st[k]) * 1000);
    $('v-' + id).textContent = SLIDERS[k].fmt(st[k]);
  });
  Object.keys(NUMBER_IDS).forEach(function(k) { $('p-' + NUMBER_IDS[k]).value = st[k]; });
  $('p-sampler').value = st.sampler;
  $('p-seeding').value = st.seeding;
  document.querySelectorAll('.zoom-only').forEach(function(el) { el.classList.toggle('hidden', fullBounds()); });
  var metro = !fullBounds(), bisection = st.sampler === 'bisection';
  document.querySelectorAll('.bisection-only').forEach(function(el) { el.classList.toggle('hidden', !bisection); });
  document.querySelectorAll('.density-only').forEach(function(el) { el.classList.toggle('hidden', bisection); });
  document.querySelectorAll('.nearby-only').forEach(function(el) { el.classList.toggle('hidden', metro || !bisection); });
  $('samplesNote').textContent = metro ? 'orbits traced for this zoomed view, by Metropolis chains that follow the orbits crossing it'
    : bisection ? 'boundary points whose orbits are traced'
    : 'points near the boundary of the set; only escaping orbits are drawn';
  $('p-scale').value = st.scale_mode;
  $('p-root').value = st.root;
  $('v-root').textContent = (+st.root).toFixed(2);
  $('p-balance').value = st.balance;
  $('v-balance').textContent = (+st.balance).toFixed(2);
  gradient.sync();
  var bylength = st.colour_mode === 'length';
  $('p-cmode').value = st.colour_mode;
  $('p-chnorm').value = st.channel_norm;
  document.querySelectorAll('.length-only').forEach(function(el) { el.classList.toggle('hidden', !bylength); });
  document.querySelectorAll('.grad-only').forEach(function(el) { el.classList.toggle('hidden', bylength); });
  ['short', 'mid', 'long'].forEach(function(k) { $('p-c' + k).value = '#' + st['colour_' + k]; });
  showLengthNote();
  $('p-despeckle').checked = st.despeckle;
  $('p-blur').checked = st.soft_points;
  clipBar.set(clipValues());
  showClip();
  $('rootParam').classList.toggle('hidden', st.scale_mode !== 'nth root');
  $('blurParam').classList.toggle('hidden', !st.soft_points);
  $('smoothParam').classList.toggle('hidden', !st.soft_points);
  view.apply();
}

// ---------- progress ----------
var stageInfo = { name: '', lo: 0, hi: 0, done: 0, total: 0 };
function setStage(name, lo, hi, total) {
  stageInfo = { name: name, lo: lo, hi: hi, done: 0, total: total || 0 };
  showProgress();
}
function showProgress() {
  if (!running) return;   // a frame queued by addProgress can arrive after the run ended
  var f = stageInfo.total > 0 ? Math.min(1, stageInfo.done / stageInfo.total) : 0;
  $('progress').style.width = (stageInfo.lo + (stageInfo.hi - stageInfo.lo) * f).toFixed(1) + '%';
  $('genBtn').textContent = stageInfo.name + (stageInfo.total > 0 ? ' ' + Math.round(f * 100) + '%' : '…');
}
var progressQueued = false;
function addProgress(n) {
  stageInfo.done += n;
  if (!progressQueued) {
    progressQueued = true;
    requestAnimationFrame(function() { progressQueued = false; showProgress(); });
  }
}

// ---------- generation ----------
async function generate() {
  if (running) return;
  var p = Object.assign({}, st);
  if (!(p.xmax > p.xmin) || !(p.ymax > p.ymin)) { setStatus('Each max bound must be larger than its min.'); return; }
  var id = ++genId;
  running = true;
  setRunning(true);
  setStatus(result ? '' : 'Generating…');
  var t0 = performance.now();
  try {
    var r = await compute(p, { stage: setStage, progress: addProgress, live: function() { return id === genId; } });
    if (!r || id !== genId) return;
    result = r;
    result.key = refKey(p);
    showLengthNote();
    if (isWhole(r.b)) reference = { key: result.key, result: r };
    $('progress').style.width = '100%';
    setStatus('');
    view.reset();
    render();
    lastSecs = (performance.now() - t0) / 1000;
    var missing = !isWhole(r.b) && !r.backward && !refFor(r);
    showStats(missing ? ' · rendering the whole set for its brightness…' : undefined);
    // A zoom without a whole-set render to borrow its brightness from (a page loaded straight into a zoom, or new
    // settings) gets one now, in the same run, so that Stop keeps the zoom.
    if (missing) {
      var q = Object.assign({}, p, { samples: REF_SAMPLES, resolution: refResolution(p.resolution) });
      ['xmin', 'xmax', 'ymin', 'ymax'].forEach(function(k) { q[k] = DEFAULTS[k]; });
      var ref = await compute(q, { stage: function(name, lo, hi, total) { setStage('Reference', lo, hi, total); }, progress: addProgress, live: function() { return id === genId; } });
      if (!ref || id !== genId) return;
      ref.key = refKey(q);
      reference = { key: ref.key, result: ref };
      $('progress').style.width = '100%';
      render();
      showStats();
    }
  } catch (err) {
    if (id !== genId) return;
    killPool();
    $('progress').style.width = '0';
    setStatus((result ? 'Generation failed: ' : '') + (err.message || err));
  } finally {
    if (id === genId) { running = false; setRunning(false); }
  }
}

function stop() {
  if (!running) return;
  genId++;
  killPool();
  running = false;
  setRunning(false);
  $('progress').style.width = '0';
  setStatus(result ? '' : 'Generation stopped');
  if (result) showStats();
}

// The background reference: as many samples as a quick whole-set render with the grid sampler, at the resolution of
// the preview that a whole-set render at the zoom's resolution would have, since the zoom borrows that preview's table.
var REF_SAMPLES = 200000;
function refResolution(res) { return Math.max(128, Math.ceil(res / blockFor({ res: res }))); }

var lastSecs = 0;             // time of the last render, not counting its background reference
function showStats(note) {
  var r = result;
  if (note === undefined) note = isWhole(r.b) ? '' : (r.backward ? ' · seeded backwards' : '') + (refFor(r) ? ' · brightness of the whole set' : ' · brightness of this view only');
  $('stats').textContent = r.total.toLocaleString('en-US') + ' orbits in ' + lastSecs.toFixed(1) + ' s on ' + nCores + ' threads' + note;
}

function setRunning(on) {
  $('genBtn').disabled = on;
  $('newSeedBtn').disabled = on;
  $('randomBtn').disabled = on;
  $('wildBtn').disabled = on;
  $('stopBtn').disabled = !on;
  $('viewBtn').disabled = on || !result;
  $('viewBtn').classList.toggle('hidden', !view.zoomed());
  $('saveBtn').disabled = !result;
  if (!on) $('genBtn').textContent = 'Generate';
  view.apply();
}
function setStatus(text) {
  var s = $('status');
  s.textContent = text;
  s.style.display = text ? 'flex' : 'none';
  canvas.style.opacity = text && result ? 0.35 : 1;
}

// ---------- display ----------
function showLengthNote() { $('lengthNote').classList.toggle('hidden', !(st.colour_mode === 'length' && result && result.bands !== 3)); }
// A zoom seeded backwards keeps its own brightness: its norm varies by about ±30 % from seed to seed (the seeds' weights),
// and deep zooms are too faint for the whole set's brightness anyway.
function refFor(r) { return !isWhole(r.b) && !r.backward && reference && reference.key === r.key ? reference.result : null; }
// The canvas shows a preview summed down to about the stage's size in device pixels (display.pooled), so that the
// display settings stay quick at any resolution. Saving renders the full resolution with the preview's statistics.
function blockFor(r) { return Math.max(1, Math.floor(r.res / Math.max(256, Math.ceil(stage.clientWidth * (window.devicePixelRatio || 1))))); }
function preview(r) { return pooled(r, blockFor(r)); }
function render() {
  if (!result) return;
  var ref = refFor(result);
  bins = draw(canvas, preview(result), st, ref ? preview(ref) : null);
  drawHistogram($('histCanvas'), bins, st);
  renderDetail();
}
document.addEventListener('themechange', function() { drawHistogram($('histCanvas'), bins, st); });

var renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(function() { renderQueued = false; render(); });
}

// ---------- zoom and pan ----------
// Zooming magnifies the preview. Once the view rests, the visible part is drawn again from the full resolution onto a
// second canvas over it (the detail), with the preview's statistics, so that both look the same apart from sharpness.
var detailAt = null;          // the detail's crop of the full image: { i0, j0, size, k } in full-resolution pixels
function renderDetail() {
  detailAt = null;
  detail.classList.add('hidden');
  if (!result || !view.zoomed()) return;
  var n = result.res, S = stage.clientWidth, z = view.view.z, dpr = window.devicePixelRatio || 1;
  var k = Math.max(1, Math.floor(n / (z * S * dpr)));
  if (k >= blockFor(result)) return;   // the preview is already as sharp
  // the visible square, plus a margin for the blur, whose edges would otherwise show; the adaptive blur reaches up to
  // 2^ADAPT.levels times as far
  var reach = st.blur_px * (st.smooth_hits && result.metro ? Math.pow(2, ADAPT.levels) : 1);
  var vis = n / z, margin = Math.ceil(3 * reach * n / 1000) + k;
  var size = Math.min(n, Math.ceil(vis) + 2 * margin);
  var i0 = clamp(Math.floor(-view.view.y / (S * z) * n) - margin, 0, n - size);
  var j0 = clamp(Math.floor(-view.view.x / (S * z) * n) - margin, 0, n - size);
  var ref = refFor(result);
  draw(detail, crop(result, i0, j0, size, k), st, ref ? preview(ref) : preview(result));
  detailAt = { i0: i0, j0: j0, size: size, k: k };
  placeDetail();
  detail.classList.remove('hidden');
}
// keeps the detail on its part of the image while the view moves
function placeDetail() {
  if (!detailAt || !result) return;
  var u = stage.clientWidth * view.view.z / result.res, w = detail.width * detailAt.k * u;
  detail.style.width = detail.style.height = w + 'px';
  detail.style.transform = 'translate(' + (view.view.x + detailAt.j0 * u) + 'px,' + (view.view.y + detailAt.i0 * u) + 'px)';
  detail.classList.toggle('pixelated', w * (window.devicePixelRatio || 1) > detail.width * 1.5);
}
var detailTimer = 0;
function scheduleDetail() {
  clearTimeout(detailTimer);
  detailTimer = setTimeout(renderDetail, 150);
}
var view = createView(stage, canvas, function() { return !!result; }, function() {
  var dpr = window.devicePixelRatio || 1;
  canvas.classList.toggle('pixelated', !!result && stage.clientWidth * view.view.z * dpr > canvas.width * 1.5);
  placeDetail();
  scheduleDetail();
  // a new stage size may call for a different preview block
  if (result && canvas.width !== preview(result).res) scheduleRender();
  $('resetBtn').disabled = running || (!view.zoomed() && fullBounds());
  // only a magnified image has a view of its own to render
  $('viewBtn').classList.toggle('hidden', !view.zoomed());
});
// First undo the magnification; once there is none, go back to the whole set and render it.
function resetZoom() {
  if (view.zoomed()) { view.reset(); return; }
  ['xmin', 'xmax', 'ymin', 'ymax'].forEach(function(k) { st[k] = DEFAULTS[k]; });
  syncInputs();
  writeHash();
  generate();
}
function renderView() {
  if (!result || running) return;
  Object.assign(st, view.region(result.b));
  syncInputs();
  writeHash();
  generate();
}

var gradient = createGradientEditor(function() { scheduleRender(); writeHash(); });

// ---------- inputs → settings ----------
Object.keys(SLIDER_IDS).forEach(function(k) {
  var id = SLIDER_IDS[k];
  $('p-' + id).addEventListener('input', function() {
    st[k] = SLIDERS[k].from(this.value / 1000);
    $('v-' + id).textContent = SLIDERS[k].fmt(st[k]);
    if (k === 'blur_px') scheduleRender();
    writeHash();
  });
});
// the adaptive blur takes a moment, so it redraws when the slider is let go
$('p-smooth').addEventListener('change', scheduleRender);
Object.keys(NUMBER_IDS).forEach(function(k) {
  $('p-' + NUMBER_IDS[k]).addEventListener('change', function() {
    var data = Object.assign({}, st);
    data[k] = this.value;
    setState(data);
    syncInputs();
    writeHash();
  });
});
$('p-seeding').addEventListener('change', function() { st.seeding = this.value; writeHash(); });
$('p-sampler').addEventListener('change', function() { setState(Object.assign({}, st, { sampler: this.value })); syncInputs(); writeHash(); });
$('p-scale').addEventListener('change', function() { st.scale_mode = this.value; syncInputs(); scheduleRender(); writeHash(); });
$('p-balance').addEventListener('input', function() { st.balance = +this.value; $('v-balance').textContent = st.balance.toFixed(2); writeHash(); });
$('p-root').addEventListener('input', function() { st.root = +this.value; $('v-root').textContent = st.root.toFixed(2); scheduleRender(); writeHash(); });
$('p-chnorm').addEventListener('change', function() { st.channel_norm = this.value; scheduleRender(); writeHash(); });
$('p-cmode').addEventListener('change', function() { st.colour_mode = this.value; syncInputs(); scheduleRender(); writeHash(); });
['short', 'mid', 'long'].forEach(function(k) {
  $('p-c' + k).addEventListener('input', function() { st['colour_' + k] = this.value.slice(1).toLowerCase(); scheduleRender(); writeHash(); });
});
$('p-despeckle').addEventListener('change', function() { st.despeckle = this.checked; scheduleRender(); writeHash(); });
$('p-blur').addEventListener('change', function() { st.soft_points = this.checked; syncInputs(); scheduleRender(); writeHash(); });
// One bar for both clips and the midtone, as in the levels tool of image editors. The clip handles push each other
// instead of crossing, so that min ≤ max; the midtone stays at its fraction of the range between them.
function clipValues() { return [st.min_clip, st.max_clip, st.min_clip + st.midtone * (st.max_clip - st.min_clip)]; }
function showClip() { $('v-clip').textContent = (+st.min_clip).toFixed(3) + ' – ' + (+st.max_clip).toFixed(3) + (st.midtone !== 0.5 ? ', mid ' + (+st.midtone).toFixed(2) : ''); }
var clipBar = new Bar($('p-clip'), {
  min: 0, max: 1, step: 0.001, values: clipValues(), names: ['Min clip', 'Max clip', 'Midtone'],
  onInput: function(v) {
    if (clipBar.active === 0) { st.min_clip = v[0]; st.max_clip = Math.max(v[0], st.max_clip); }
    else if (clipBar.active === 1) { st.max_clip = v[1]; st.min_clip = Math.min(v[1], st.min_clip); }
    else if (st.max_clip > st.min_clip) st.midtone = +clamp((v[2] - st.min_clip) / (st.max_clip - st.min_clip), 0.02, 0.98).toFixed(3);
    clipBar.set(clipValues());
    showClip();
    scheduleRender();
    writeHash();
  }
});

// For flipping quickly through renders of the same settings, type A especially.
function newSeed() {
  if (running) return;
  st.seed = Math.floor(Math.random() * 2147483647);
  syncInputs();
  writeHash();
  generate();
}
// Random settings: a type A or a type B render over the whole set, within ranges that give a picture, so the button can
// be pressed again and again. Type B gets equalization with a low min clip and a high midtone, a soft falloff into the
// glow (owner, 2026-10-22). The resolution is kept.
function randomSettings() {
  var r = Math.random;
  function pick(a) { return a[Math.floor(r() * a.length)]; }
  function uni(lo, hi) { return +(lo + r() * (hi - lo)).toFixed(3); }
  function logUni(lo, hi) { return +Math.exp(Math.log(lo) + r() * (Math.log(hi) - Math.log(lo))).toPrecision(2); }
  var p = { seed: Math.floor(r() * 2147483647), resolution: st.resolution, gradient: GRADIENTS[pick(Object.keys(GRADIENTS))] };
  if (r() < 0.5) {
    // type A: fewer samples with more nearby points, so that a render stays around a second or two
    var nearby = pick([0, 5, 20, 20, 50, 200]);
    Object.assign(p, { sampler: 'bisection', nearby_points: nearby, nearby_spread: logUni(1e-5, 1e-2),
      samples: Math.max(10, Math.round(logUni(300, 1500) / Math.max(1, nearby / 20))), refine_steps: pick([10, 20, 40, 80]),
      balance: uni(0, 1), max_iter: pick([10000, 100000, 100000, 300000]), scale_mode: 'log',
      min_clip: uni(0.05, 0.2), max_clip: uni(0.55, 0.8), midtone: uni(0.35, 0.55), blur_px: uni(0.2, 0.8) });
  } else if (r() < 0.75) {
    Object.assign(p, { sampler: 'grid', samples: pick([1000000, 2000000, 3000000]), max_iter: pick([20, 40, 100, 300, 1000, 3000]),
      scale_mode: 'equalize', min_clip: uni(0.05, 0.25), max_clip: 1, midtone: uni(0.72, 0.9) });
  } else {
    // type B coloured by orbit length: equalized with a high midtone and little or no min clip, as in the Nebulabrot presets
    Object.assign(p, { sampler: 'grid', samples: pick([1000000, 2000000]), max_iter: pick([1000, 5000, 20000]), colour_mode: 'length',
      scale_mode: 'equalize', min_clip: uni(0, 0.08), max_clip: 1, midtone: uni(0.88, 0.95), channel_norm: r() < 0.7 ? 'separate' : 'shared' });
  }
  return p;
}
// Wild settings ("I'm feeling lucky"): nearly every setting from nearly its whole range, and a gradient made up on the
// spot. Rolls may be odd; that is the point. Two things are bounded. The work: samples are capped so that
// samples × (refine steps + 1 + nearby points) × max iterations stays near what the defaults cost. And the clips, by
// scaling, since fully random ones left about a third of the rolls black or flat: linear needs a low max clip, log and
// roots a low min clip, and equalization takes aggressive ones.
function wildSettings() {
  var r = Math.random;
  function pick(a) { return a[Math.floor(r() * a.length)]; }
  function uni(lo, hi) { return +(lo + r() * (hi - lo)).toFixed(3); }
  function logUni(lo, hi) { return +Math.exp(Math.log(lo) + r() * (Math.log(hi) - Math.log(lo))).toPrecision(2); }
  function hex(h, s, l) {   // HSL (h in turns) → rrggbb
    function f(n) { var k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); }
    return f(0) + f(8) + f(4);
  }
  // 2 to 5 stops; mostly from black and getting lighter, rarely any colours in any order
  var n = 2 + Math.floor(r() * 4), dark = r() < 0.9, stops = [], i;
  for (i = 0; i < n; i++) {
    var t = i / (n - 1), pos = i === 0 ? 0 : i === n - 1 ? 1 : uni(t - 0.5 / n, t + 0.5 / n);
    var light = dark ? (i === 0 && r() < 0.8 ? 0 : 0.08 + 0.9 * t) : uni(0.05, 0.95);
    stops.push(hex(r(), uni(0.3, 1), light) + '@' + pos);
  }
  var mode = pick(['linear', 'nth root', 'nth root', 'log', 'log', 'equalize', 'equalize']), lo, hi, maxIter;
  if (mode === 'linear') { lo = uni(0, 0.03); hi = uni(0.05, 0.4); }
  else if (mode === 'equalize') { lo = uni(0, 0.8); hi = uni(Math.min(1, lo + 0.2), 1); }
  else { lo = uni(0, 0.3); hi = uni(0.4, 1); }
  var p = {
    seed: Math.floor(r() * 2147483647), resolution: st.resolution, gradient: stops.join(','),
    scale_mode: mode, root: uni(1.5, 8), min_clip: lo, max_clip: hi,
    midtone: uni(0.25, 0.75), soft_points: r() < 0.7,
    blur_px: logUni(0.2, 1.2)   // around 0.5 px, where sensible pictures sit; wider blurs only smeared
  };
  if (r() < 0.5) {
    var nearby = pick([0, 0, 1, 5, 20, 100, 500, 2000]), refine = pick([0, 1, 3, 10, 20, 40, 80, 200]);
    maxIter = Math.round(logUni(10, 1e6));
    Object.assign(p, { sampler: 'bisection', nearby_points: nearby, nearby_spread: logUni(1e-6, 0.1), refine_steps: refine, balance: uni(0, 1),
      samples: Math.max(1, Math.min(Math.round(logUni(5, 5000)), Math.floor(2e9 / ((refine + 1 + nearby) * maxIter)))) });
  } else {
    maxIter = Math.round(logUni(10, 1e5));
    Object.assign(p, { sampler: 'grid', samples: Math.max(1e4, Math.min(Math.round(logUni(1e5, 3e6)), Math.floor(3e9 / maxIter))) });
  }
  p.max_iter = maxIter;
  if (r() < 0.3) {
    var bs = Math.max(1, Math.round(logUni(2, Math.max(3, maxIter / 4))));
    Object.assign(p, { colour_mode: 'length', band_short: bs, band_mid: Math.round(logUni(bs + 1, Math.max(bs + 2, maxIter))),
      colour_short: hex(r(), uni(0.5, 1), 0.55), colour_mid: hex(r(), uni(0.5, 1), 0.55), colour_long: hex(r(), uni(0.5, 1), 0.55),
      channel_norm: pick(['separate', 'shared']) });
  }
  return p;
}
function randomize(wild) {
  if (running) return;
  setState(Object.assign({}, DEFAULTS, wild ? wildSettings() : randomSettings()));
  syncInputs();
  writeHash();
  generate();
}
// The sample count is typed in; these buttons fill in round counts.
[1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7].forEach(function(n) {
  var b = document.createElement('button');
  b.type = 'button';
  b.textContent = n >= 1e6 ? n / 1e6 + 'M' : n >= 1e3 ? n / 1e3 + 'k' : String(n);
  b.addEventListener('click', function() { st.samples = n; syncInputs(); writeHash(); });
  $('samplesQuick').appendChild(b);
});
$('newSeedBtn').addEventListener('click', newSeed);
$('randomBtn').addEventListener('click', function() { randomize(false); });
$('wildBtn').addEventListener('click', function() { randomize(true); });
$('genBtn').addEventListener('click', generate);
$('stopBtn').addEventListener('click', stop);
$('viewBtn').addEventListener('click', renderView);
$('resetBtn').addEventListener('click', resetZoom);
$('saveBtn').addEventListener('click', function() {
  if (!result) return;
  var btn = this, ref = refFor(result);
  btn.disabled = true;
  btn.textContent = 'Saving…';
  // let the label show before the full-resolution render blocks the page
  setTimeout(function() {
    var full = document.createElement('canvas');
    draw(full, result, st, ref ? preview(ref) : preview(result));
    full.toBlob(function(blob) {
      download(blob, 'buddhabrot_' + stamp() + '.png');
      btn.textContent = 'Save PNG';
      btn.disabled = !result;
    }, 'image/png');
  }, 30);
});
document.addEventListener('keydown', function(e) {
  if (e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  if ($('infoDialog').open) return;
  if (e.key === 'Enter' || e.key === 'g') generate();
  else if (e.key === 'n') newSeed();
  else if (e.key === 'r') randomize(false);
  else if (e.key === 'l') randomize(true);
  else if (e.key === 'Escape') stop();
});

initPresets(function(data) {
  setState(Object.assign({}, DEFAULTS, data));
  syncInputs();
  writeHash();
  if (running) stop();
  generate();
});

// ---------- start ----------
readHash();
syncInputs();
generate();
