// UI wiring: inputs ↔ settings, the generate/stop cycle with its progress display, buttons and keys.
import { st, DEFAULTS, SLIDERS, SLIDER_IDS, NUMBER_IDS, setState, readHash, writeHash, fullBounds } from './state.js';
import { compute, killPool, nCores } from './compute.js';
import { render as draw, drawHistogram } from './display.js';
import { createView } from './view.js';
import { createGradientEditor } from './gradient.js';
import { initPresets } from './presets.js';
import { stamp, download } from './files.js';

var $ = function(id) { return document.getElementById(id); };
var canvas = $('canvas'), stage = $('stage');

var genId = 0, running = false;
var result = null;            // { data: Float32Array, res, b: bounds, total }
var bins = null;              // brightness histogram of the last image

// ---------- inputs ← settings ----------
function syncInputs() {
  Object.keys(SLIDER_IDS).forEach(function(k) {
    var id = SLIDER_IDS[k];
    $('p-' + id).value = Math.round(SLIDERS[k].to(st[k]) * 1000);
    $('v-' + id).textContent = SLIDERS[k].fmt(st[k]);
  });
  Object.keys(NUMBER_IDS).forEach(function(k) { $('p-' + NUMBER_IDS[k]).value = st[k]; });
  $('p-method').value = st.method;
  $('p-sampler').value = st.sampler;
  $('p-inside').value = st.inside_point;
  var metro = st.method === 'metropolis', boundary = st.sampler === 'boundary';
  document.querySelectorAll('.metro-only').forEach(function(el) { el.classList.toggle('hidden', !metro); });
  document.querySelectorAll('.boundary-only').forEach(function(el) { el.classList.toggle('hidden', !boundary); });
  document.querySelectorAll('.density-only').forEach(function(el) { el.classList.toggle('hidden', boundary); });
  $('p-method').querySelector('[value="metropolis"]').disabled = boundary;
  $('p-inre').parentNode.classList.toggle('hidden', !boundary || st.inside_point !== 'fixed');
  document.querySelectorAll('.nearby-only').forEach(function(el) { el.classList.toggle('hidden', metro || !boundary); });
  $('samplesNote').textContent = metro ? 'Metropolis chains, each started at a sampled point whose orbit crosses the view'
    : boundary ? 'boundary points whose orbits are traced' : 'uniform points in the disk |c| ≤ 2; only escaping orbits are drawn';
  $('p-scale').value = st.scale_mode;
  $('p-root').value = st.root;
  $('v-root').textContent = (+st.root).toFixed(2);
  $('p-norm').value = st.normalize;
  $('pctParam').classList.toggle('hidden', st.normalize !== 'percentile');
  gradient.sync();
  $('p-blur').checked = st.soft_points;
  $('p-lo').value = st.min_clip;
  $('p-hi').value = st.max_clip;
  $('v-lo').textContent = (+st.min_clip).toFixed(3);
  $('v-hi').textContent = (+st.max_clip).toFixed(3);
  $('rootParam').classList.toggle('hidden', st.scale_mode !== 'nth root');
  $('blurParam').classList.toggle('hidden', !st.soft_points);
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
    $('progress').style.width = '100%';
    setStatus('');
    view.reset();
    render();
    var secs = (performance.now() - t0) / 1000;
    $('stats').textContent = r.total.toLocaleString('en-US') + ' orbits in ' + secs.toFixed(1) + ' s on ' + nCores + ' threads';
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
}

function setRunning(on) {
  $('genBtn').disabled = on;
  $('stopBtn').disabled = !on;
  $('viewBtn').disabled = on || !result;
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
function render() {
  if (!result) return;
  bins = draw(canvas, result, st);
  drawHistogram($('histCanvas'), bins, st);
}
document.addEventListener('themechange', function() { drawHistogram($('histCanvas'), bins, st); });

var renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(function() { renderQueued = false; render(); });
}

// ---------- zoom and pan ----------
var view = createView(stage, canvas, function() { return !!result; }, function() {
  var dpr = window.devicePixelRatio || 1;
  canvas.classList.toggle('pixelated', !!result && stage.clientWidth * view.view.z * dpr > result.res * 1.5);
  $('resetBtn').disabled = running || (!view.zoomed() && fullBounds());
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
    if (k === 'blur_px' || k === 'norm_percentile') scheduleRender();
    writeHash();
  });
});
Object.keys(NUMBER_IDS).forEach(function(k) {
  $('p-' + NUMBER_IDS[k]).addEventListener('change', function() {
    var data = Object.assign({}, st);
    data[k] = this.value;
    setState(data);
    syncInputs();
    writeHash();
  });
});
$('p-method').addEventListener('change', function() { setState(Object.assign({}, st, { method: this.value })); syncInputs(); writeHash(); });
$('p-sampler').addEventListener('change', function() { setState(Object.assign({}, st, { sampler: this.value })); syncInputs(); writeHash(); });
$('p-inside').addEventListener('change', function() { st.inside_point = this.value; syncInputs(); writeHash(); });
$('p-scale').addEventListener('change', function() { st.scale_mode = this.value; syncInputs(); scheduleRender(); writeHash(); });
$('p-norm').addEventListener('change', function() { st.normalize = this.value; syncInputs(); scheduleRender(); writeHash(); });
$('p-root').addEventListener('input', function() { st.root = +this.value; $('v-root').textContent = st.root.toFixed(2); scheduleRender(); writeHash(); });
$('p-blur').addEventListener('change', function() { st.soft_points = this.checked; syncInputs(); scheduleRender(); writeHash(); });
// the clip sliders push each other so that min ≤ max
$('p-lo').addEventListener('input', function() { st.min_clip = +this.value; if (st.max_clip < st.min_clip) st.max_clip = st.min_clip; syncInputs(); scheduleRender(); writeHash(); });
$('p-hi').addEventListener('input', function() { st.max_clip = +this.value; if (st.min_clip > st.max_clip) st.min_clip = st.max_clip; syncInputs(); scheduleRender(); writeHash(); });

$('seedBtn').addEventListener('click', function() { st.seed = Math.floor(Math.random() * 2147483647); syncInputs(); writeHash(); });
$('genBtn').addEventListener('click', generate);
$('stopBtn').addEventListener('click', stop);
$('viewBtn').addEventListener('click', renderView);
$('resetBtn').addEventListener('click', resetZoom);
$('saveBtn').addEventListener('click', function() {
  if (!result) return;
  canvas.toBlob(function(blob) { download(blob, 'buddhabrot_' + stamp() + '.png'); }, 'image/png');
});
document.addEventListener('keydown', function(e) {
  if (e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  if ($('infoDialog').open) return;
  if (e.key === 'Enter' || e.key === 'g') generate();
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
