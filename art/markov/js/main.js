import { parseWord } from './markov.js';
import { randomPlace, randomColour, MIN_RADIUS, MAX_IT } from './places.js';
import { PRESETS } from './presets.js';
import { ramp, oklch, css } from './colour.js';
import { Bar } from './bar.js';

const $ = id => document.getElementById(id);

// ---------- state ----------

const WHOLE = { cx: 0, cy: 0, r: 3 };
const DEFAULTS = {
  // the map: one word ('word') or the whole group ('all'), and the slice it is drawn on
  mode: 'word', slice: 'surface', k: [-0.76, 0.09], z0: [-0.2, -0.88], y0: [0.5, 0.3], word: '1213',
  maxIt: MAX_IT, seed: 0, view: WHOLE, aa: 2,
  // the colour ramp in OKLCh: lightness and chroma at the set (0) and far out (1), and one hue
  hue: 230, l0: 0, l1: 0.97, c0: 0.12, c1: 0.03, lw: 1, invert: false, circle: true,
};
const C_MAX = 0.3;
let st = structuredClone(DEFAULTS);

const NUM = (v, lo, hi, d) => (v !== '' && v !== null && v !== undefined && isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
const pair = (v, lo, hi, d) => Array.isArray(v) && v.length === 2 ? [NUM(v[0], lo, hi, d[0]), NUM(v[1], lo, hi, d[1])] : d.slice();

function sanitize(s) {
  const word = String(s.word ?? '').replace(/[^123]/g, '');
  const v = s.view;
  return {
    mode: s.mode === 'all' ? 'all' : 'word',
    // the Bowditch set is drawn on one surface: along a line k grows without bound, and so does the
    // walk that tests a point
    slice: s.slice === 'line' && s.mode !== 'all' ? 'line' : 'surface',
    k: pair(s.k, -20, 20, DEFAULTS.k), z0: pair(s.z0, -20, 20, DEFAULTS.z0), y0: pair(s.y0, -20, 20, DEFAULTS.y0),
    word: parseWord(word).length ? word : DEFAULTS.word,
    maxIt: Math.round(NUM(s.maxIt, 10, 5000, DEFAULTS.maxIt)),
    seed: Math.round(NUM(s.seed, 0, 4294967295, 0)),
    view: v && [v.cx, v.cy, v.r].every(isFinite) && v.r > 0
      ? { cx: +v.cx, cy: +v.cy, r: Math.min(100, Math.max(MIN_RADIUS / 10, +v.r)) } : { ...WHOLE },
    aa: Math.round(NUM(s.aa, 1, 3, DEFAULTS.aa)),
    hue: Math.round(NUM(s.hue, 0, 359, DEFAULTS.hue)),
    l0: NUM(s.l0, 0, 1, DEFAULTS.l0), l1: NUM(s.l1, 0, 1, DEFAULTS.l1),
    c0: NUM(s.c0, 0, C_MAX, DEFAULTS.c0), c1: NUM(s.c1, 0, C_MAX, DEFAULTS.c1),
    lw: NUM(s.lw, 0.25, 4, DEFAULTS.lw),
    invert: !!s.invert, circle: s.circle !== false,
  };
}

const rampOf = s => ({ hue: s.hue, l0: s.l0, l1: s.l1, c0: s.c0, c1: s.c1 });
const mapParams = () => ({ mode: st.mode, slice: st.slice, k: st.k, z0: st.z0, y0: st.y0, word: st.word });

const exact = v => String(+v.toPrecision(17));
const r6 = v => +(+v).toFixed(6);

function writeHash() {
  const parts = [];
  if (st.mode === 'all') parts.push('m=all');
  if (st.slice === 'line') parts.push('s=line', 'y=' + st.y0.map(r6).join(','));
  else parts.push('k=' + st.k.map(r6).join(','));
  parts.push('z=' + st.z0.map(r6).join(','));
  if (st.mode === 'word') parts.push('w=' + st.word);
  if (st.maxIt !== DEFAULTS.maxIt && st.mode === 'word') parts.push('it=' + st.maxIt);
  parts.push(
    'v=' + [exact(st.view.cx), exact(st.view.cy), +st.view.r.toPrecision(6)].join(','),
    'h=' + st.hue, 'l=' + st.l0 + ',' + st.l1, 'ch=' + st.c0 + ',' + st.c1,
  );
  if (st.seed) parts.push('seed=' + st.seed);
  if (st.lw !== DEFAULTS.lw) parts.push('lw=' + st.lw);
  if (st.aa !== DEFAULTS.aa) parts.push('aa=' + st.aa);
  if (st.invert) parts.push('inv=1');
  if (!st.circle) parts.push('c=0');
  history.replaceState(null, '', '#' + parts.join('&'));
}

// Links from before the colour ramp (pal=, bd=, ph=) still open: their extra keys are ignored.
function readHash() {
  const h = location.hash.replace(/^#/, '');
  if (!h) return null;
  const q = {};
  for (const kv of h.split('&')) {
    const i = kv.indexOf('=');
    if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  }
  const two = s => s ? s.split(',').map(Number) : null;
  const v = two(q.v);
  const l = (q.l || '').split(','), ch = (q.ch || '').split(',');
  const s = sanitize({
    mode: q.m, slice: q.s, k: two(q.k), z0: two(q.z), y0: two(q.y), word: q.w, maxIt: q.it, seed: q.seed,
    view: v && v.length === 3 ? { cx: v[0], cy: v[1], r: v[2] } : null,
    aa: q.aa, hue: q.h, l0: l[0], l1: l[1], c0: ch[0], c1: ch[1], lw: q.lw,
    invert: q.inv === '1', circle: q.c !== '0',
  });
  s.fromHash = { colour: 'h' in q };
  return s;
}

// ---------- workers ----------

// A set of workers, each holding every n-th row of the last computed image.
class Pool {
  constructor(n) {
    this.n = n;
    this.url = new URL('./worker.js', import.meta.url);
    this.pending = new Map(); // rid → { resolve, reject, onProgress }
    this.rid = 0;
    this.spawn();
  }
  spawn() {
    this.workers = [];
    for (let i = 0; i < this.n; i++) {
      const w = new Worker(this.url, { type: 'module' });
      w.onmessage = e => this.receive(e.data);
      w.onerror = e => { e.preventDefault(); this.failAll(new Error(e.message || 'Worker failed to start.')); };
      this.workers.push(w);
    }
  }
  receive(m) {
    const p = this.pending.get(m.rid);
    if (!p) return;
    if (m.type === 'progress') return p.onProgress && p.onProgress(m.done);
    this.pending.delete(m.rid);
    if (m.type === 'error') p.reject(new Error(m.message));
    else p.resolve(m);
  }
  call(i, msg, onProgress) {
    const rid = ++this.rid;
    return new Promise((resolve, reject) => {
      this.pending.set(rid, { resolve, reject, onProgress });
      this.workers[i].postMessage({ ...msg, rid });
    });
  }
  all(make, onProgress) {
    return Promise.all(this.workers.map((_, i) => this.call(i, make(i), onProgress && (d => onProgress(i, d)))));
  }
  failAll(err) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }
  // stops whatever runs; the workers lose their samples
  reset() {
    this.workers.forEach(w => w.terminate());
    this.failAll(new Error('cancelled'));
    this.spawn();
  }
  close() {
    this.workers.forEach(w => w.terminate());
    this.failAll(new Error('cancelled'));
  }
}

const NWORK = Math.max(2, Math.min(8, navigator.hardwareConcurrency || 4));

// Iterate the view at W × W pixels with aa × aa samples each; returns the escape time range.
async function computeImage(pool, view, W, aa, onProgress) {
  const done = new Array(pool.n).fill(0);
  const res = await pool.all(
    i => ({ type: 'compute', params: mapParams(), view, W, aa, k: i, step: pool.n, maxIt: st.maxIt }),
    (i, d) => { done[i] = d; onProgress(done.reduce((a, b) => a + b, 0) / W); });
  return {
    tmin: Math.min(...res.map(r => r.tmin)), tmax: Math.max(...res.map(r => r.tmax)),
    inside: res.reduce((a, r) => a + r.inside, 0) / (W * W * aa * aa),
  };
}

// Colour the computed image with the current settings.
// The range of grey values outside the set, which the colour ramp spans.
async function greyRange(pool, t) {
  const ranges = await pool.all(() => ({ type: 'range', ...t, lw: st.lw }));
  const imin = Math.min(...ranges.map(r => r.imin)), imax = Math.max(...ranges.map(r => r.imax));
  return imax >= imin ? { imin, imax } : { imin: 0, imax: 1 }; // all inside
}

function colourParams() {
  const { rgb, lab } = ramp(rampOf(st));
  return { lw: st.lw, rgb, lab, invert: st.invert, circle: st.circle };
}

async function colourImage(pool, W, t) {
  const range = await greyRange(pool, t);
  const msg = { type: 'colour', ...t, ...range, ...colourParams() };
  const parts = await pool.all(() => msg);
  const img = new ImageData(W, W);
  const row = W * 4;
  parts.forEach((p, k) => {
    for (let j = 0, y = k; y < W; j++, y += pool.n) img.data.set(p.data.subarray(j * row, (j + 1) * row), y * row);
  });
  return img;
}

// ---------- rendering ----------

const stage = $('stage'), canvas = $('canvas');
const ctx = canvas.getContext('2d');
let pool = new Pool(NWORK);
let shown = null;       // { view, W, t } of the image on the canvas, if the workers still hold its samples
let shownView = null;   // the view the canvas shows, for panning
let computing = null;   // { gen, pan } of the render in progress
let renderGen = 0;
let colouring = false, colourAgain = false;

function canvasSize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return Math.min(1600, Math.round((stage.clientWidth || 600) * dpr));
}

async function render() {
  clearTimeout(commitTimer);
  if (computing || colouring) pool.reset();
  colouring = colourAgain = false;
  shown = null;
  const gen = ++renderGen;
  const view = { ...st.view }, W = canvasSize(), aa = st.aa;
  computing = { gen, pan: { ...pan } };
  writeHash();
  setRunning(true);
  setStatus('');
  setProgress(0);
  $('stats').textContent = '';
  const t0 = performance.now();
  try {
    // the Bowditch set is slow: a coarse picture first
    let f0 = 0;
    if (st.mode === 'all') {
      const w = Math.ceil(W / 4), f = 1 / (1 + 16 * aa * aa);
      const t = await computeImage(pool, view, w, 1, d => setProgress(d * f));
      const img = await colourImage(pool, w, t);
      if (gen !== renderGen) return;
      paint(img, computing.pan, W);
      computing.pan = { s: 1, tx: 0, ty: 0 }; // the full picture shows the same view
      f0 = f;
    }
    const t = await computeImage(pool, view, W, aa, d => setProgress(f0 + d * (1 - f0)));
    const img = await colourImage(pool, W, t);
    if (gen !== renderGen) return;
    const ms = performance.now() - t0;
    paint(img, computing.pan);
    computing = null;
    shown = { view, W, t };
    shownView = view;
    setRunning(false);
    setProgress(1);
    const time = ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s';
    $('stats').textContent = `${W} × ${W} px · ${aa} × ${aa} samples · ${time} · radius ${view.r.toPrecision(3)}` +
      insideNote(t.inside) + (view.r < MIN_RADIUS ? ' · past double precision' : '');
    // colours changed while the image was being coloured
    if (colourAgain) { colourAgain = false; recolour(); }
  } catch (e) {
    if (e.message === 'cancelled' || gen !== renderGen) return;
    computing = null;
    fail(e.message);
  }
}

// Recolour the image on the canvas; the samples are kept, so this is quick.
async function recolour() {
  writeHash();
  if (computing) { colourAgain = true; return; } // redone once the render in progress is done
  if (!shown) return render();
  if (colouring) { colourAgain = true; return; }
  colouring = true;
  const gen = renderGen;
  try {
    const img = await colourImage(pool, shown.W, shown.t);
    if (gen === renderGen) paint(img, null);
  } catch (e) {
    if (e.message !== 'cancelled') fail(e.message);
    return;
  } finally {
    colouring = false;
  }
  if (colourAgain) { colourAgain = false; recolour(); }
}

// Put a finished image on the canvas. committed: the pan the image was rendered for; whatever the
// user panned since stays on as a CSS transform.
// A smaller image, a coarse preview, is scaled up to size.
function paint(img, committed, size = img.width) {
  if (canvas.width !== size) { canvas.width = canvas.height = size; }
  if (size === img.width) ctx.putImageData(img, 0, 0);
  else {
    const small = document.createElement('canvas');
    small.width = small.height = img.width;
    small.getContext('2d').putImageData(img, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(small, 0, 0, size, size);
  }
  if (committed) {
    const s = pan.s / committed.s;
    pan = { s, tx: pan.tx - committed.tx * s, ty: pan.ty - committed.ty * s };
    applyPan();
  }
}

function fail(message) {
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

let pan = { s: 1, tx: 0, ty: 0 }; // CSS transform of the canvas relative to shownView, in CSS px
let commitTimer = 0;
const pointers = new Map();
let pinch = null;

function applyPan() {
  canvas.style.transform = pan.s === 1 && !pan.tx && !pan.ty ? '' : `translate(${pan.tx}px, ${pan.ty}px) scale(${pan.s})`;
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

// Turn the CSS transform into a new view and render it; the old image stays on meanwhile.
function commit() {
  if (pointers.size) return scheduleCommit();
  const v = shownView || st.view;
  if (computing && sameView(computing.pan, pan)) return;
  if (!computing && pan.s === 1 && !pan.tx && !pan.ty) return;
  const css = stage.clientWidth;
  const u = 2 * v.r / css; // plane units per CSS px before the transform
  // the stage centre came from the old CSS position (c − t)/s
  const qx = (css / 2 - pan.tx) / pan.s, qy = (css / 2 - pan.ty) / pan.s;
  st.view = { cx: v.cx - v.r + qx * u, cy: v.cy + v.r - qy * u, r: Math.max(MIN_RADIUS / 10, v.r / pan.s) };
  syncInputs();
  render();
}
const sameView = (a, b) => a.s === b.s && a.tx === b.tx && a.ty === b.ty;

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
stage.addEventListener('dblclick', () => setView(WHOLE));

// Jump to a view: the old image is dropped rather than transformed.
function setView(view) {
  st.view = { ...view };
  shownView = st.view;
  pan = { s: 1, tx: 0, ty: 0 };
  applyPan();
  syncInputs();
  render();
}

// ---------- places and colours ----------

function insideNote(f) {
  if (!(f > 0)) return '';
  const pct = f < 0.001 ? 'under 0.1' : (100 * f).toFixed(f < 0.1 ? 1 : 0);
  return st.mode === 'all' ? ` · ${pct}% chaotic` : ` · ${pct}% bounded`;
}

function newPlace(seed) {
  const place = randomPlace(seed >>> 0, st.mode);
  if (!place) { setStatus('No edge found for this seed; try another.'); return; }
  st.seed = seed >>> 0;
  Object.assign(st, sanitize({ ...st, ...place }));
  unpreset();
  setView(st.view);
}
const randomSeed = () => (Math.random() * 4294967296) >>> 0;

function newColour() {
  Object.assign(st, randomColour(Math.random));
  syncInputs();
  recolour();
}

// ---------- inputs ----------

// The colour bars. Values change live while dragging; the URL follows when a drag ends.
const fmt = v => v.toFixed(2);
const fmtC = v => v.toFixed(3);
function showColour() {
  $('v-hue').textContent = st.hue + '°';
  $('v-l').textContent = `${fmt(st.l0)} → ${fmt(st.l1)}`;
  $('v-c').textContent = `${fmtC(st.c0)} → ${fmtC(st.c1)}`;
  // the ramp as it will be painted, from the set to far out
  const lut = ramp(rampOf(st)).rgb, n = lut.length / 3, stops = [];
  for (let k = 0; k <= 32; k++) {
    const i = 3 * Math.round(k / 32 * (n - 1));
    stops.push(`rgb(${lut[i]} ${lut[i + 1]} ${lut[i + 2]}) ${(100 * k / 32).toFixed(1)}%`);
  }
  $('ramp').style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
}

const hueStrip = [];
for (let h = 0; h <= 360; h += 15) hueStrip.push(css(oklch(0.72, 0.13, h)));

const bars = {
  hue: new Bar($('p-hue'), { min: 0, max: 359, step: 1, values: [st.hue], names: ['Hue'],
    onInput: ([h]) => { st.hue = h; showColour(); recolour(); }, onChange: writeHash }),
  l: new Bar($('p-l'), { min: 0, max: 1, step: 0.01, values: [st.l0, st.l1], names: ['Lightness at the set', 'Lightness far out'],
    onInput: ([a, b]) => { st.l0 = a; st.l1 = b; showColour(); recolour(); }, onChange: writeHash }),
  c: new Bar($('p-c'), { min: 0, max: C_MAX, step: 0.005, values: [st.c0, st.c1], names: ['Chroma at the set', 'Chroma far out'],
    onInput: ([a, b]) => { st.c0 = a; st.c1 = b; showColour(); recolour(); }, onChange: writeHash }),
};
bars.hue.track.style.background = `linear-gradient(90deg, ${hueStrip.join(', ')})`;

// A complex parameter as two sliders, real and imaginary part, and a text field for exact values.
// The sliders re-render once they stop moving.
let mapTimer = 0;
function mapChanged(delay = 250) {
  unpreset();
  clearTimeout(mapTimer);
  mapTimer = setTimeout(() => render(), delay);
}
function complexControl(key, lo, hi) {
  const re = $(`p-${key}-re`), im = $(`p-${key}-im`), txt = $(`p-${key}`);
  re.min = im.min = lo; re.max = im.max = hi; re.step = im.step = 0.001;
  const show = () => {
    re.value = st[key][0]; im.value = st[key][1];
    txt.value = `${r6(st[key][0])}${st[key][1] < 0 ? '−' : '+'}${Math.abs(r6(st[key][1]))}i`;
    txt.classList.remove('bad');
  };
  const onSlide = () => { st[key] = [+re.value, +im.value]; show(); mapChanged(); };
  re.addEventListener('input', onSlide);
  im.addEventListener('input', onSlide);
  txt.addEventListener('change', () => {
    const z = parseComplex(txt.value);
    if (!z) { txt.classList.add('bad'); return; }
    st[key] = z; show(); mapChanged(0);
  });
  return show;
}

function parseComplex(s) {
  s = s.replace(/\s+/g, '').replace(/−/g, '-').replace(/\*/g, '');
  if (!s) return null;
  const m = s.match(/^([+-]?[\d.]+(?:e[+-]?\d+)?)?(?:([+-])([\d.]*(?:e[+-]?\d+)?)i)?$/i)
    || s.match(/^()([+-]?)([\d.]*)i$/i);
  if (!m) return null;
  const re = m[1] ? +m[1] : 0;
  let im = 0;
  if (m[2] !== undefined && s.includes('i')) im = (m[2] === '-' ? -1 : 1) * (m[3] === '' ? 1 : +m[3]);
  return isFinite(re) && isFinite(im) ? [re, im] : null;
}

const complexShows = [complexControl('k', -4, 6), complexControl('z0', -4, 4), complexControl('y0', -4, 4)];

function wordNote() {
  const w = parseWord(st.word);
  const names = w.map(l => 's' + '₁₂₃'[l]).join(' ');
  const all = new Set(w).size === 3;
  return names + (all ? '' : ' — uses only two of the three moves, so it fixes a coordinate and has no Julia set to speak of');
}

function syncInputs() {
  $('p-seed').value = st.seed;
  $('p-re').value = exact(st.view.cx);
  $('p-im').value = exact(st.view.cy);
  $('p-r').value = +st.view.r.toPrecision(6);
  $('p-aa').value = st.aa;
  $('p-mode').value = st.mode;
  $('p-slice').value = st.slice;
  $('p-slice').querySelector('[value=line]').disabled = st.mode === 'all';
  document.querySelectorAll('.only-surface').forEach(e => e.classList.toggle('hidden', st.slice !== 'surface'));
  document.querySelectorAll('.only-line').forEach(e => e.classList.toggle('hidden', st.slice !== 'line'));
  document.querySelectorAll('.only-word').forEach(e => e.classList.toggle('hidden', st.mode !== 'word'));
  $('p-word').value = st.word;
  $('p-word').classList.remove('bad');
  $('wordNote').textContent = wordNote();
  $('p-it').value = st.maxIt;
  complexShows.forEach(f => f());
  bars.hue.set([st.hue]);
  bars.l.set([st.l0, st.l1]);
  bars.c.set([st.c0, st.c1]);
  showColour();
  $('p-lw').value = st.lw;
  $('v-lw').textContent = st.lw.toFixed(2);
  $('p-inv').checked = st.invert;
  $('p-circle').checked = st.circle;
}

function onViewInput() {
  const cx = parseFloat($('p-re').value), cy = parseFloat($('p-im').value), r = parseFloat($('p-r').value);
  $('p-re').classList.toggle('bad', !isFinite(cx));
  $('p-im').classList.toggle('bad', !isFinite(cy));
  $('p-r').classList.toggle('bad', !(r > 0));
  if (!isFinite(cx) || !isFinite(cy) || !(r > 0)) return;
  setView(sanitize({ ...st, view: { cx, cy, r } }).view);
}

function unpreset() { $('p-preset').value = ''; $('presetNote').textContent = ''; }

// An example sets the map and the view; the colour stays.
function loadPreset(i) {
  const p = PRESETS[i];
  if (!p) return;
  const colour = { ...rampOf(st), lw: st.lw, invert: st.invert, circle: st.circle, aa: st.aa };
  st = sanitize({ ...DEFAULTS, ...p.state, ...colour });
  $('p-preset').value = String(i);
  $('presetNote').textContent = p.note || '';
  setView(st.view);
}

const presetSel = $('p-preset');
presetSel.innerHTML = '<option value="">Choose an example…</option>' + PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
presetSel.addEventListener('change', () => { if (presetSel.value !== '') loadPreset(+presetSel.value); });

$('p-re').addEventListener('change', onViewInput);
$('p-im').addEventListener('change', onViewInput);
$('p-r').addEventListener('change', onViewInput);
$('p-seed').addEventListener('keydown', e => { if (e.key === 'Enter') $('seedBtn').click(); });
$('seedBtn').addEventListener('click', () => newPlace(sanitize({ seed: $('p-seed').value }).seed));
$('p-aa').addEventListener('change', function() { st.aa = +this.value; render(); });
$('p-mode').addEventListener('change', function() {
  st.mode = this.value;
  if (st.mode === 'all' && st.slice === 'line') { st.slice = 'surface'; syncInputs(); unpreset(); setView(WHOLE); return; }
  syncInputs(); mapChanged(0);
});
$('p-slice').addEventListener('change', function() { st.slice = this.value; syncInputs(); unpreset(); setView(WHOLE); });
$('p-word').addEventListener('change', function() {
  const w = this.value.replace(/[^123]/g, '');
  if (!parseWord(w).length) { this.classList.add('bad'); return; }
  st.word = w; syncInputs(); mapChanged(0);
});
$('p-it').addEventListener('change', function() { st.maxIt = sanitize({ ...st, maxIt: this.value }).maxIt; this.value = st.maxIt; render(); });
$('p-lw').addEventListener('input', function() { st.lw = +this.value; $('v-lw').textContent = st.lw.toFixed(2); recolour(); });
$('p-inv').addEventListener('change', function() { st.invert = this.checked; recolour(); });
$('p-circle').addEventListener('change', function() { st.circle = this.checked; recolour(); });

$('newBtn').addEventListener('click', () => newPlace(randomSeed()));
$('colourBtn').addEventListener('click', newColour);
$('stopBtn').addEventListener('click', () => {
  renderGen++;
  pool.reset();
  computing = null;
  colouring = false;
  shown = null;
  setRunning(false);
  setProgress(1);
  $('stats').textContent = 'Stopped';
});
$('saveBtn').addEventListener('click', () => {
  canvas.toBlob(b => download(b, fileName()), 'image/png');
});
$('exportBtn').addEventListener('click', exportImage);

function fileName(size) {
  const name = st.mode === 'all' ? 'markov_all' : 'markov_' + st.word;
  return `${name}_${st.view.r.toExponential(2).replace('+', '')}${size ? '_' + size : ''}.png`;
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

// Render the current view at a chosen size in a pool of its own, so the image on screen keeps its
// samples, and save it. A small reference render fixes the tonal range, so every size comes out
// alike; then the workers compute and colour strips of rows without keeping their samples, so even
// 8192 × 8192 needs little memory.
let exportPool = null;
const EXPORT_REF = 1024, EXPORT_STRIP = 32;
async function exportImage() {
  const size = +$('p-size').value;
  const aa = size > 4096 ? 2 : 3;
  const btn = $('exportBtn'), text = btn.textContent;
  if (exportPool) exportPool.close();
  const p = exportPool = new Pool(NWORK);
  btn.disabled = true;
  try {
    const view = { ...st.view };
    btn.textContent = 'Measuring…';
    const t = await computeImage(p, view, EXPORT_REF, 2, () => {});
    const job = {
      type: 'render', ...t, ...(await greyRange(p, t)), ...colourParams(),
      params: mapParams(), view, W: size, aa, step: 1, maxIt: st.maxIt,
    };
    const out = document.createElement('canvas');
    out.width = out.height = size;
    const octx = out.getContext('2d');
    // each worker takes the next strip as soon as it is free
    let next = 0, done = 0;
    btn.textContent = 'Rendering… 0%';
    await Promise.all(p.workers.map(async (_, i) => {
      while (next < size) {
        const k = next, rows = Math.min(EXPORT_STRIP, size - k);
        next += rows;
        const r = await p.call(i, { ...job, k, rows });
        octx.putImageData(new ImageData(r.data, size, rows), 0, k);
        done += rows;
        btn.textContent = `Rendering… ${Math.round(100 * done / size)}%`;
      }
    }));
    btn.textContent = 'Saving…';
    const blob = await new Promise(res => out.toBlob(res, 'image/png'));
    download(blob, fileName(size));
  } catch (e) {
    if (e.message !== 'cancelled') setStatus(e.message);
  } finally {
    p.close();
    if (exportPool === p) exportPool = null;
    btn.textContent = text;
    btn.disabled = false;
  }
}

// ---------- resize ----------

let lastWidth = stage.clientWidth;
new ResizeObserver(() => {
  if (Math.abs(stage.clientWidth - lastWidth) > 2) {
    lastWidth = stage.clientWidth;
    clearTimeout(commitTimer);
    commitTimer = setTimeout(() => render(), 200);
  }
}).observe(stage);

// ---------- start ----------

const fromHash = readHash();
if (fromHash) {
  const { colour } = fromHash.fromHash;
  delete fromHash.fromHash;
  st = fromHash;
  // an old link, without a colour, gets a random one
  if (!colour) Object.assign(st, randomColour(Math.random));
  shownView = st.view;
  syncInputs();
  render();
} else {
  // a first visit gets the first example, in a random colour
  Object.assign(st, randomColour(Math.random));
  loadPreset(0);
}
