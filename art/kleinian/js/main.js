import { parse, format, traceAB } from './group.js';
import { cuspByPath, gcd } from './cusps.js';
import { Renderer, palette, GEN_NAMES } from './renderer.js';
import { TracePlane, initProbes } from './planes.js';
import { PRESETS } from './presets.js';
import { QL } from './dfs.js';

const $ = id => document.getElementById(id);

// ---------- state ----------

const DEFAULTS = {
  ta: '1.92+0.03i', tb: '2', nonfree: false, altroot: false, neck: true,
  eps: 0.6, levmax: 1000, color: 'letter', depth: 1, lw: 1, bg: 'auto', view: null,
  quinc: false, sphere: null, // sphere: { cx, cy, r }, the disk fitted to the limit set
  ssize: 0, // log10 of the equator's radius relative to sphere.r
  method: 'dfs', // or 'walk', 'descent'
  points: 64, stay: 0.45, // random walk: millions of steps, probability of repeating a letter
  descents: 1, // random descent: millions of descents
};
const METHODS = ['dfs', 'walk', 'descent'];
const POINTS = [4, 16, 64, 256];
const DESCENTS = [0.25, 1, 4, 16];
let st = { ...DEFAULTS };
let fitView = null; // preset view override, used by "Fit"

const NUM = (v, lo, hi, d) => (isFinite(+v) && v !== '' && v !== null ? Math.min(hi, Math.max(lo, +v)) : d);

function sanitize(s) {
  return {
    ta: parse(s.ta) ? String(s.ta) : DEFAULTS.ta,
    tb: parse(s.tb) ? String(s.tb) : DEFAULTS.tb,
    nonfree: !!s.nonfree, altroot: !!s.altroot, neck: s.neck !== false,
    eps: NUM(s.eps, 0.05, 10, DEFAULTS.eps),
    levmax: Math.round(NUM(s.levmax, 10, 16000, DEFAULTS.levmax)),
    color: ['letter', 'last', 'level', 'mono'].includes(s.color) ? s.color : DEFAULTS.color,
    depth: Math.round(NUM(s.depth, 1, 8, 1)),
    lw: NUM(s.lw, 0.25, 4, 1),
    bg: ['auto', 'light', 'dark'].includes(s.bg) ? s.bg : 'auto',
    view: s.view && [s.view.cx, s.view.cy, s.view.half].every(isFinite) && s.view.half > 0 ? s.view : null,
    quinc: !!s.quinc, ssize: NUM(s.ssize, -1.5, 1.5, 0),
    sphere: s.sphere && [s.sphere.cx, s.sphere.cy, s.sphere.r].every(isFinite) && s.sphere.r > 0 ? s.sphere : null,
    method: METHODS.includes(s.method) ? s.method : 'dfs',
    points: POINTS.includes(+s.points) ? +s.points : DEFAULTS.points,
    stay: NUM(s.stay, 0, 0.95, DEFAULTS.stay),
    descents: DESCENTS.includes(+s.descents) ? +s.descents : DEFAULTS.descents,
  };
}

function writeHash() {
  const parts = [
    'ta=' + encodeURIComponent(st.ta), 'tb=' + encodeURIComponent(st.tb),
  ];
  if (st.nonfree) parts.push('nf=1');
  if (st.altroot) parts.push('alt=1');
  if (!st.neck) parts.push('neck=0');
  if (st.eps !== DEFAULTS.eps) parts.push('eps=' + st.eps);
  if (st.levmax !== DEFAULTS.levmax) parts.push('lev=' + st.levmax);
  if (st.color !== DEFAULTS.color) parts.push('col=' + st.color);
  if (st.depth !== 1) parts.push('d=' + st.depth);
  if (st.lw !== 1) parts.push('lw=' + st.lw);
  if (st.bg !== 'auto') parts.push('bg=' + st.bg);
  if (st.quinc) parts.push('q=1');
  if (st.quinc && st.sphere) parts.push('sph=' + [st.sphere.cx, st.sphere.cy, st.sphere.r].map(v => +v.toPrecision(12)).join(','));
  if (st.quinc && st.ssize) parts.push('ss=' + st.ssize);
  if (st.method !== 'dfs') parts.push('m=' + st.method);
  if (st.points !== DEFAULTS.points) parts.push('pts=' + st.points);
  if (st.stay !== DEFAULTS.stay) parts.push('stay=' + st.stay);
  if (st.descents !== DEFAULTS.descents) parts.push('ds=' + st.descents);
  if (st.view) parts.push('v=' + [st.view.cx, st.view.cy, st.view.half].map(v => +v.toPrecision(12)).join(','));
  history.replaceState(null, '', '#' + parts.join('&'));
}

function readHash() {
  const h = location.hash.replace(/^#/, '');
  if (!h) return null;
  const q = {};
  for (const kv of h.split('&')) {
    const i = kv.indexOf('=');
    if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  }
  const v = q.v ? q.v.split(',').map(Number) : null;
  const sph = q.sph ? q.sph.split(',').map(Number) : null;
  return sanitize({
    ta: q.ta, tb: q.tb, nonfree: q.nf === '1', altroot: q.alt === '1', neck: q.neck !== '0',
    eps: q.eps, levmax: q.lev, color: q.col, depth: q.d, lw: q.lw, bg: q.bg,
    view: v && v.length === 3 ? { cx: v[0], cy: v[1], half: v[2] } : null,
    quinc: q.q === '1', ssize: q.ss, sphere: sph && sph.length === 3 ? { cx: sph[0], cy: sph[1], r: sph[2] } : null,
    method: q.m, points: q.pts, stay: q.stay, descents: q.ds,
  });
}

// ---------- workers ----------

const NWORK = 4; // one per first letter of the words: a, b, A, B
const workerURL = new URL('./worker.js', import.meta.url);
let workers = [], busy = false, jobId = 0;
const waiting = new Map(); // measure requests: id → { resolve, reject }

function spawn() {
  workers = [];
  for (let i = 0; i < NWORK; i++) {
    const w = new Worker(workerURL, { type: 'module' });
    w.onmessage = e => onWorkerMessage(e.data);
    w.onerror = e => { e.preventDefault(); onWorkerMessage({ type: 'error', id: jobId, message: e.message || 'Worker failed to start.' }); };
    workers.push(w);
  }
}

function cancel() {
  if (!busy && !waiting.size) return;
  workers.forEach(w => w.terminate());
  for (const { reject } of waiting.values()) reject(new Error('cancelled'));
  waiting.clear();
  busy = false;
  job = null;
  spawn();
}

function measureIn(params) {
  const id = ++jobId;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    workers[0].postMessage({ type: 'measure', id, params });
  });
}

// ---------- rendering ----------

const stage = $('stage'), canvas = $('canvas');
const renderer = new Renderer(canvas);
const measured = new Map(); // group key → measure result
let job = null;             // the search in progress
let renderGen = 0;
let pendingPreview = null;

function groupParams() {
  const ta = parse(st.ta), tb = parse(st.tb);
  if (!ta) throw new Error('Could not read the trace of a.');
  if (!tb) throw new Error('Could not read the trace of b.');
  return { ta, tb, nonfree: st.nonfree, altroot: st.altroot, neck: st.neck, levmax: st.levmax };
}
const groupKey = g => JSON.stringify([g.ta, g.tb, g.nonfree, g.altroot, g.neck, g.levmax]);

function themeName() {
  if (st.bg !== 'auto') return st.bg;
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const css = stage.clientWidth || 600;
  const px = Math.min(2400, Math.round(css * dpr));
  if (canvas.width !== px || canvas.height !== px) { canvas.width = px; canvas.height = px; }
  return { px, scale: px / css }; // canvas pixels per CSS pixel
}

function viewTransform(view, px) {
  const k = px / (2 * view.half);
  return { x0: view.cx - view.half, y0: view.cy + view.half, k, w: px, h: px };
}

function frameView(m) {
  if (st.quinc) return { cx: 0, cy: 0, half: QL };
  if (fitView) return { cx: fitView[0], cy: fitView[1], half: fitView[2] };
  if (!m) return { cx: 0, cy: 0, half: 1.1 };
  const f = m.frame;
  const half = Math.max(f.x1 - f.x0, f.y1 - f.y0, 1e-9) / 2 * 1.08;
  return { cx: (f.x0 + f.x1) / 2, cy: (f.y0 + f.y1) / 2, half };
}

// The copies of the quincuncial square that meet the view, as pixel maps for the renderer and the
// search: tile (i, j) is centred at 2·QL·(i, j) and turned by 180° when i + j is odd.
function tiles(vt) {
  if (!st.quinc) return [[1, 0, 0]];
  const { x0, y0, k, w, h } = vt, x1 = x0 + w / k, y1 = y0 - h / k, L2 = 2 * QL, cap = 12;
  const out = [];
  for (let i = Math.max(-cap, Math.ceil((x0 - QL) / L2)); i <= Math.min(cap, Math.floor((x1 + QL) / L2)); i++)
    for (let j = Math.max(-cap, Math.ceil((y1 - QL) / L2)); j <= Math.min(cap, Math.floor((y0 + QL) / L2)); j++)
      out.push((i + j) & 1 ? [-1, (L2 * i - 2 * x0) * k, (2 * y0 - L2 * j) * k] : [1, L2 * i * k, -L2 * j * k]);
  return out;
}

// The method and its settings for the search params. The steps of a walk or the descents are
// shared out over the workers.
function methodParams(preview) {
  const millions = st.method === 'walk' ? (preview ? Math.min(st.points, 2) : st.points)
    : (preview ? Math.min(st.descents, 0.05) : st.descents);
  return { method: st.method, stay: st.stay, budget: Math.round(millions * 1e6 / NWORK) };
}
const unit = () => st.method === 'walk' ? 'points' : 'segments';

// the disk that becomes the northern hemisphere, scaled by the sphere size slider
const sphereParams = () => st.quinc ? { ...st.sphere, r: st.sphere.r * 10 ** st.ssize } : null;

// Centre the sphere on the limit set: its frame becomes roughly the northern hemisphere.
function sphereFor(m) {
  if (!m) return st.sphere || { cx: 0, cy: 0, r: 1 };
  const f = m.frame;
  return { cx: (f.x0 + f.x1) / 2, cy: (f.y0 + f.y1) / 2, r: Math.max(f.x1 - f.x0, f.y1 - f.y0, 1e-9) / 2 };
}

async function getMeasure(g) {
  const key = groupKey(g);
  if (measured.has(key)) return measured.get(key);
  const m = await measureIn(g);
  measured.set(key, m);
  if (measured.size > 50) measured.delete(measured.keys().next().value);
  return m;
}

// Start a full render. opts: { fit, ghost: {s, tx, ty} (canvas px), preview }
async function render(opts = {}) {
  cancel();
  pendingPreview = null;
  let g;
  try { g = groupParams(); } catch (e) { return fail(e.message); }
  updateInfo(g);
  const gen = ++renderGen;
  busy = true;
  setRunning(true);
  setStatus(st.view && !opts.fit ? '' : 'Measuring the limit set…');
  let m = null;
  try {
    m = opts.preview ? null : await getMeasure(g);
  } catch (e) {
    if (e.message === 'cancelled') return;
    return fail(e.message);
  }
  if (gen !== renderGen) return;
  if (opts.fit || !st.view) st.view = frameView(m);
  if (st.quinc && (opts.fit || !st.sphere)) st.sphere = sphereFor(m);
  writeHash();

  const { px, scale } = sizeCanvas();
  const vt = viewTransform(st.view, px);
  renderer.setStyle({ mode: st.color, depth: st.depth, lineWidth: st.lw * scale, theme: themeName(), tiles: tiles(vt) });
  if (opts.ghost) renderer.ghost(opts.ghost.s, opts.ghost.tx, opts.ghost.ty);
  else renderer.clear();
  canvas.style.transform = '';
  pan = { s: 1, tx: 0, ty: 0 };

  const params = {
    ...g, ...methodParams(opts.preview), view: vt, bound: m ? m.bound : null, sphere: sphereParams(), tiles: tiles(vt),
    eps: (opts.preview ? Math.max(st.eps, 2.5) : st.eps) * scale,
    levmax: opts.preview ? Math.min(st.levmax, 300) : st.levmax,
  };
  startSearch(params, renderer, {
    onDone: stats => {
      setRunning(false);
      if (opts.ghost) renderer.redraw();
      const t = stats.ms < 1000 ? Math.round(stats.ms) + ' ms' : (stats.ms / 1000).toFixed(1) + ' s';
      setStatus(renderer.segments ? '' : 'Nothing in view. Double-click or press Fit to frame the limit set.');
      $('stats').textContent = opts.preview ? 'Preview' :
        `${renderer.segments.toLocaleString('en')} ${unit()}` +
        (stats.samples ? ` from ${stats.samples.toLocaleString('en')} ${st.method === 'walk' ? 'steps' : 'descents'}` : '') + ` in ${t}` +
        (stats.levmaxHits ? ` · ${stats.levmaxHits.toLocaleString('en')} branches stopped at the depth limit` : '');
      if (pendingPreview) { const p = pendingPreview; pendingPreview = null; preview(p); }
    },
  });
}

// Runs the four subtree searches, streaming segments into `target`.
function startSearch(params, target, { onDone, onProgress = setProgress }) {
  const id = ++jobId;
  busy = true;
  const progress = new Float64Array(NWORK);
  const t0 = performance.now();
  const points = params.method === 'walk';
  job = { id, target, points, progress, left: NWORK, levmaxHits: 0, samples: 0, onDone, onProgress, t0 };
  setStatus('');
  onProgress(0);
  if (target === renderer) {
    $('stats').textContent = '';
    // a group that is not discrete never finishes: say so instead of spinning silently
    const tick = setInterval(() => {
      if (!job || job.id !== id) return clearInterval(tick);
      const sec = (performance.now() - t0) / 1000;
      const pct = Math.round(100 * progress.reduce((a, b) => a + b, 0) / NWORK);
      const verb = { dfs: 'Searching', walk: 'Walking', descent: 'Sampling' }[params.method];
      $('stats').textContent = `${verb}… ${pct}% · ${sec.toFixed(0)} s` +
        (sec > 5 && params.method === 'dfs' ? ' · if this group is not discrete the search will not end: press Stop, or raise ε' : '');
    }, 500);
  }
  for (let r = 0; r < NWORK; r++) workers[r].postMessage({ type: 'search', id, params: { ...params, root: r } });
}

function onWorkerMessage(msg) {
  if (msg.type === 'measured' || (msg.type === 'error' && waiting.has(msg.id))) {
    const w = waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    if (msg.type === 'error') w.reject(new Error(msg.message));
    else w.resolve(msg.result);
    return;
  }
  if (!job || msg.id !== job.id) return;
  if (msg.type === 'batch') {
    job.target.add(msg.seg, msg.code, msg.n, job.points);
    // the search reports its place in the whole tree; each subtree is one quarter of it
    const k0 = Math.min(3, Math.floor(msg.progress * 4));
    job.progress[k0] = Math.min(1, msg.progress * 4 - k0);
    job.onProgress(job.progress.reduce((a, b) => a + b, 0) / NWORK);
  } else if (msg.type === 'done') {
    job.levmaxHits += msg.stats.levmaxHits;
    job.samples += msg.stats.samples || 0;
    if (--job.left === 0) {
      const j = job;
      job = null;
      busy = false;
      j.onProgress(1);
      j.onDone({ ms: performance.now() - j.t0, levmaxHits: j.levmaxHits, samples: j.samples });
    }
  } else if (msg.type === 'error') {
    cancel();
    fail(msg.message);
  }
}

// Live preview while dragging on a trace plane: coarse, and never more than one at a time.
// p: { which: 'a' | 'b', t: [re, im] }
function preview(p) {
  if (busy) { pendingPreview = p; return; }
  st[p.which === 'a' ? 'ta' : 'tb'] = format(p.t, 12);
  syncInputs(false);
  render({ preview: true });
}

function fail(message) {
  busy = false;
  setRunning(false);
  setProgress(1);
  setStatus(message);
}

function setStatus(text) {
  $('status').textContent = text;
  $('status').style.display = text ? 'flex' : 'none';
}
function setProgress(f) {
  $('progress').style.width = (100 * f).toFixed(1) + '%';
  $('progress').parentElement.style.opacity = f >= 1 ? 0 : 1;
}
function setRunning(on) { $('stopBtn').disabled = !on; }

// ---------- pan and zoom ----------

let pan = { s: 1, tx: 0, ty: 0 }; // CSS transform of the canvas since the last render, in CSS px
let commitTimer = 0;
const pointers = new Map();
let pinch = null;

function applyPan() {
  canvas.style.transform = `translate(${pan.tx}px, ${pan.ty}px) scale(${pan.s})`;
}

function zoomAt(x, y, f) {
  pan.tx = x - (x - pan.tx) * f;
  pan.ty = y - (y - pan.ty) * f;
  pan.s *= f;
  applyPan();
}

function scheduleCommit(delay = 250) {
  clearTimeout(commitTimer);
  commitTimer = setTimeout(commit, delay);
}

// Turn the CSS transform into a new view and render it, with the old image as a ghost meanwhile.
function commit() {
  if (pan.s === 1 && pan.tx === 0 && pan.ty === 0) return;
  if (pointers.size) return scheduleCommit();
  const css = stage.clientWidth;
  const v = st.view;
  const u = 2 * v.half / css; // plane units per CSS px before the transform
  // the stage centre came from the old CSS position (c − t)/s
  const qx = (css / 2 - pan.tx) / pan.s, qy = (css / 2 - pan.ty) / pan.s;
  st.view = { cx: v.cx - v.half + qx * u, cy: v.cy + v.half - qy * u, half: v.half / pan.s };
  const scale = canvas.width / css;
  render({ ghost: { s: pan.s, tx: pan.tx * scale, ty: pan.ty * scale } });
}

function local(e) {
  const r = stage.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

stage.addEventListener('wheel', e => {
  e.preventDefault();
  const [x, y] = local(e);
  zoomAt(x, y, Math.exp(-Math.max(-1, Math.min(1, e.deltaY * (e.deltaMode ? 0.05 : 0.002)))));
  scheduleCommit();
}, { passive: false });

stage.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, local(e));
  stage.classList.add('dragging');
  clearTimeout(commitTimer);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
  }
});
stage.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId), cur = local(e);
  pointers.set(e.pointerId, cur);
  if (pointers.size === 1) {
    pan.tx += cur[0] - prev[0];
    pan.ty += cur[1] - prev[1];
    applyPan();
  } else if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    pan.tx += (cur[0] - prev[0]) / 2;
    pan.ty += (cur[1] - prev[1]) / 2;
    if (pinch.d > 0) zoomAt(mx, my, d / pinch.d);
    pinch.d = d;
  }
});
function endPointer(e) {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) { stage.classList.remove('dragging'); scheduleCommit(120); }
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('dblclick', () => fit());

function fit() {
  clearTimeout(commitTimer);
  render({ fit: true });
}

// ---------- inputs ----------

// recomputePlanes: false while dragging on a plane, so the shading is only redone on release
function syncInputs(recomputePlanes = true) {
  $('p-ta').value = st.ta;
  $('p-tb').value = st.tb;
  $('p-comm').value = st.nonfree ? 'nonfree' : 'free';
  $('p-alt').checked = st.altroot;
  $('p-neck').checked = st.neck;
  $('p-method').value = st.method;
  document.querySelectorAll('[data-methods]').forEach(el => el.classList.toggle('hidden', !el.dataset.methods.split(' ').includes(st.method)));
  $('p-descents').value = st.descents;
  $('p-points').value = st.points;
  $('p-stay').value = st.stay;
  $('v-stay').textContent = st.stay.toFixed(2);
  $('p-eps').value = Math.log10(st.eps);
  $('v-eps').textContent = st.eps < 1 ? st.eps.toFixed(2) : st.eps.toFixed(1);
  $('p-lev').value = st.levmax;
  $('p-color').value = st.color;
  $('p-depth').value = st.depth;
  $('v-depth').textContent = st.depth;
  $('depthParam').classList.toggle('hidden', st.color !== 'letter');
  $('p-lw').value = st.lw;
  $('v-lw').textContent = st.lw.toFixed(2);
  $('p-bg').value = st.bg;
  $('p-quinc').checked = st.quinc;
  $('sphereParam').classList.toggle('hidden', !st.quinc);
  $('p-sph').value = st.ssize;
  $('v-sph').textContent = '×' + (10 ** st.ssize).toPrecision(2);
  updatePlanes(recomputePlanes);
  updateLegend();
}

function updateInfo(g) {
  const tab = traceAB(g.ta, g.tb, g.nonfree ? 0 : -2, g.altroot);
  $('info').textContent = `tr ab = ${format(tab, 8)} · tr abAB = ${g.nonfree ? '0 (order 4)' : '−2 (parabolic)'}`;
}

function updateLegend() {
  const pal = palette(themeName());
  const box = $('legend');
  box.innerHTML = '';
  if (st.color === 'letter' || st.color === 'last') {
    GEN_NAMES.forEach((n, i) => {
      const s = document.createElement('span');
      s.innerHTML = `<i style="background:${pal.gens[i]}"></i>${n}`;
      box.appendChild(s);
    });
  } else if (st.color === 'level') {
    const s = document.createElement('span');
    s.className = 'ramp';
    s.innerHTML = `short words <i style="background:linear-gradient(90deg, ${pal.ramp.join(',')})"></i> long words`;
    box.appendChild(s);
  }
}

function restyle() {
  const scale = canvas.width / (stage.clientWidth || canvas.width);
  renderer.setStyle({ mode: st.color, depth: st.depth, lineWidth: st.lw * scale, theme: themeName() });
  renderer.redraw();
  updateLegend();
  writeHash();
}

function onGroupInput() {
  const ta = parse($('p-ta').value), tb = parse($('p-tb').value);
  $('p-ta').classList.toggle('bad', !ta);
  $('p-tb').classList.toggle('bad', !tb);
  if (!ta || !tb) return;
  st.ta = $('p-ta').value.trim();
  st.tb = $('p-tb').value.trim();
  fitView = null;
  $('presetNote').textContent = '';
  $('p-preset').value = '';
  syncInputs();
  render({ fit: true });
}

$('p-ta').addEventListener('change', onGroupInput);
$('p-tb').addEventListener('change', onGroupInput);
$('p-comm').addEventListener('change', function() { st.nonfree = this.value === 'nonfree'; fitView = null; syncInputs(); render({ fit: true }); });
$('p-alt').addEventListener('change', function() { st.altroot = this.checked; fitView = null; updatePlanes(); render({ fit: true }); });
$('p-neck').addEventListener('change', function() { st.neck = this.checked; updatePlanes(); render(); });
$('p-eps').addEventListener('input', function() { st.eps = +Math.pow(10, +this.value).toPrecision(2); $('v-eps').textContent = st.eps < 1 ? st.eps.toFixed(2) : st.eps.toFixed(1); });
$('p-eps').addEventListener('change', () => render());
$('p-lev').addEventListener('change', function() { st.levmax = sanitize({ ...st, levmax: this.value }).levmax; this.value = st.levmax; render(); });
$('p-method').addEventListener('change', function() { st.method = this.value; syncInputs(false); render(); });
$('p-points').addEventListener('change', function() { st.points = +this.value; render(); });
$('p-descents').addEventListener('change', function() { st.descents = +this.value; render(); });
$('p-stay').addEventListener('input', function() { st.stay = +this.value; $('v-stay').textContent = st.stay.toFixed(2); });
$('p-stay').addEventListener('change', () => render());
$('p-color').addEventListener('change', function() { st.color = this.value; syncInputs(); restyle(); });
$('p-depth').addEventListener('input', function() { st.depth = +this.value; $('v-depth').textContent = st.depth; restyle(); });
$('p-lw').addEventListener('input', function() { st.lw = +this.value; $('v-lw').textContent = st.lw.toFixed(2); restyle(); });
$('p-bg').addEventListener('change', function() { st.bg = this.value; restyle(); });
$('p-quinc').addEventListener('change', function() { st.quinc = this.checked; syncInputs(false); render({ fit: true }); });
$('p-sph').addEventListener('input', function() { st.ssize = +this.value; $('v-sph').textContent = '×' + (10 ** st.ssize).toPrecision(2); });
$('p-sph').addEventListener('change', () => render());

$('fitBtn').addEventListener('click', fit);
$('stopBtn').addEventListener('click', () => {
  cancel();
  setRunning(false);
  setProgress(1);
  $('stats').textContent = `Stopped · ${renderer.segments.toLocaleString('en')} ${unit()}`;
});
$('saveBtn').addEventListener('click', () => {
  canvas.toBlob(b => download(b, fileName()), 'image/png');
});
$('exportBtn').addEventListener('click', exportImage);

function fileName(size) {
  const clean = s => s.replace(/[^0-9a-z.+-]/gi, '');
  return `kleinian_${clean(st.ta)}_${clean(st.tb)}${st.nonfree ? '_nonfree' : ''}${size ? '_' + size : ''}.png`;
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Render the current view at a chosen size off screen and save it.
async function exportImage() {
  const size = +$('p-size').value;
  cancel();
  let g;
  try { g = groupParams(); } catch (e) { return fail(e.message); }
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const r = new Renderer(out);
  const css = stage.clientWidth;
  const scale = size / css;
  const vt = viewTransform(st.view, size);
  r.setStyle({ mode: st.color, depth: st.depth, lineWidth: st.lw * scale, theme: themeName(), tiles: tiles(vt) });
  r.clear();
  $('exportBtn').disabled = true;
  setRunning(true);
  const btnText = $('exportBtn').textContent;
  let m = null;
  try { m = await getMeasure(g); } catch (e) { $('exportBtn').disabled = false; if (e.message !== 'cancelled') fail(e.message); return; }
  startSearch({ ...g, ...methodParams(), view: vt, bound: m ? m.bound : null, sphere: sphereParams(), tiles: tiles(vt), eps: st.eps * scale }, r, {
    onProgress: f => { setProgress(f); $('exportBtn').textContent = `Rendering… ${Math.round(100 * f)}%`; },
    onDone: () => {
      setRunning(false);
      $('exportBtn').textContent = btnText;
      $('exportBtn').disabled = false;
      out.toBlob(b => download(b, fileName(size)), 'image/png');
    },
  });
  // restore the button if the export is cancelled by another render
  const check = setInterval(() => {
    if (!job || job.target !== r) { clearInterval(check); $('exportBtn').textContent = btnText; $('exportBtn').disabled = false; }
  }, 300);
}

// ---------- trace planes ----------

initProbes(workerURL);

function pickHandlers(which) {
  const key = which === 'a' ? 'ta' : 'tb';
  return {
    which,
    onPick(t, cusp, final) {
      $('p-preset').value = '';
      $('presetNote').textContent = cusp ? `The ${cusp} cusp group: b and the word W(${cusp}) are both parabolic.` : '';
      if (cusp) $('p-cusp').value = cusp;
      fitView = null;
      if (!st.view) st.view = { cx: 0, cy: 0, half: 1.1 };
      if (final) {
        st[key] = format(t, 12);
        syncInputs();
        render();
      } else preview({ which, t });
    },
    onHover() {},
  };
}

const planeA = new TracePlane($('plane-a'), { ...pickHandlers('a'), base: { re: 1.95, im: -0.9, half: 1.45 } });
const planeB = new TracePlane($('plane-b'), { ...pickHandlers('b'), base: { re: 2.1, im: -0.9, half: 1.6 } });

const planes = { a: planeA, b: planeB };
document.querySelectorAll('[data-zoom]').forEach(btn => btn.addEventListener('click', () => {
  const pl = planes[btn.dataset.plane], z = btn.dataset.zoom;
  if (z === 'reset') return pl.reset();
  pl.zoomBy(z === 'in' ? 0.5 : 2);
  pl.refresh();
}));

function updatePlanes(recompute = true) {
  const ta = parse(st.ta) || [2, 0], tb = parse(st.tb) || [2, 0];
  const group = { nonfree: st.nonfree, altroot: st.altroot, neck: st.neck };
  // while dragging one plane, only its marker moves; the other plane waits for the release
  planeA.set({ value: ta, other: tb, group }, recompute);
  planeB.set({ value: tb, other: ta, group }, recompute);
}

$('cuspBtn').addEventListener('click', goCusp);
$('p-cusp').addEventListener('keydown', e => { if (e.key === 'Enter') goCusp(); });

function goCusp() {
  const m = $('p-cusp').value.trim().replace('−', '-').match(/^(-?\d+)\s*\/\s*(\d+)$/);
  $('p-cusp').classList.toggle('bad', !m);
  if (!m) return;
  let p = +m[1], q = +m[2];
  if (!q) return;
  const g = gcd(p, q); p /= g; q /= g;
  // the slice is periodic: p/q and p/q + 1 differ by a shift of the period
  const whole = Math.floor(p / q), pr = p - whole * q;
  const ta = cuspByPath(pr, q, st.nonfree);
  if (!ta) { $('p-cusp').classList.add('bad'); return; }
  ta[1] -= whole * (st.nonfree ? Math.SQRT2 : 2);
  st.ta = format(ta, 12);
  st.tb = '2';
  fitView = null;
  $('p-preset').value = '';
  $('presetNote').textContent = `The ${p}/${q} cusp group: b and the word W(${p}/${q}) are both parabolic.`;
  syncInputs();
  render({ fit: true });
}

// ---------- presets ----------

function fillPresets() {
  const sel = $('p-preset');
  const groups = {};
  PRESETS.forEach((p, i) => (groups[p.group] = groups[p.group] || []).push([p, i]));
  sel.innerHTML = '<option value="">Choose an example…</option>';
  for (const [name, list] of Object.entries(groups)) {
    const og = document.createElement('optgroup');
    og.label = name;
    for (const [p, i] of list) {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = p.name;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
}

function loadPreset(i) {
  const p = PRESETS[i];
  if (!p) return;
  st = sanitize({
    ...DEFAULTS, lw: st.lw, bg: st.bg, quinc: st.quinc, points: st.points, stay: st.stay, descents: st.descents,
    method: p.method || st.method,
    ta: p.ta, tb: p.tb, nonfree: !!p.nonfree, altroot: !!p.altroot, neck: p.neck !== false,
    eps: p.eps || DEFAULTS.eps, levmax: p.levmax || DEFAULTS.levmax,
    color: p.color || DEFAULTS.color, depth: p.depth || 1,
  });
  fitView = p.view || null;
  $('presetNote').textContent = p.note || '';
  $('p-cusp').value = p.cusp || '';
  syncInputs();
  render({ fit: true });
}

$('p-preset').addEventListener('change', function() { if (this.value !== '') loadPreset(+this.value); });

// ---------- theme and resize ----------

document.addEventListener('themechange', () => { restyle(); planeA.draw(); planeB.draw(); });
let lastWidth = stage.clientWidth;
new ResizeObserver(() => { planeA.refresh(); planeB.refresh(); }).observe($('plane-a'));
new ResizeObserver(() => {
  if (Math.abs(stage.clientWidth - lastWidth) > 2) {
    lastWidth = stage.clientWidth;
    clearTimeout(commitTimer);
    commitTimer = setTimeout(() => render(), 200);
  }
}).observe(stage);

// ---------- start ----------

spawn();
fillPresets();
const fromHash = readHash();
if (fromHash) {
  st = fromHash;
  syncInputs();
  render({ fit: !st.view });
} else {
  loadPreset(PRESETS.findIndex(p => p.name === 'Spiral fronds'));
  $('p-preset').value = PRESETS.findIndex(p => p.name === 'Spiral fronds');
}
