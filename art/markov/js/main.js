import { parseWord } from './markov.js';
import { PRESETS } from './presets.js';

const $ = id => document.getElementById(id);

// ---------- state ----------

const DEFAULTS = {
  slice: 'surface', k: [-0.76, 0.09], z0: [-0.2, -0.88], y0: [0.5, 0.3], word: '1213',
  maxIt: 200, pal: 'ember', bands: 1.5, phase: 0, inside: 'dark', size: 2048, view: null,
};
const PALETTES = {
  ember: ['#fbf4e6', '#f4a259', '#b33a3a', '#3a1d5c', '#0b0b1a'],
  ice: ['#ffffff', '#bfe8f2', '#3fa7c9', '#164a6b', '#08121f'],
  moss: ['#f6f3e8', '#c9d8a8', '#5f8f55', '#24452f', '#0c1a12'],
  ink: ['#ffffff', '#d8d8d8', '#8a8a8a', '#3a3a3a', '#111111'],
  night: ['#0d0d12', '#2b2f5a', '#7d6bc2', '#f0b3d9', '#fff7f0'],
};
let st = structuredClone(DEFAULTS);

const NUM = (v, lo, hi, d) => (v !== '' && v !== null && v !== undefined && isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
const pair = (v, lo, hi, d) => Array.isArray(v) && v.length === 2 ? [NUM(v[0], lo, hi, d[0]), NUM(v[1], lo, hi, d[1])] : d.slice();

function sanitize(s) {
  const word = String(s.word ?? '').replace(/[^123]/g, '');
  return {
    slice: s.slice === 'line' ? 'line' : 'surface',
    k: pair(s.k, -20, 20, DEFAULTS.k), z0: pair(s.z0, -20, 20, DEFAULTS.z0), y0: pair(s.y0, -20, 20, DEFAULTS.y0),
    word: parseWord(word).length ? word : DEFAULTS.word,
    maxIt: Math.round(NUM(s.maxIt, 10, 5000, DEFAULTS.maxIt)),
    pal: s.pal in PALETTES ? s.pal : DEFAULTS.pal,
    bands: NUM(s.bands, 0, 8, DEFAULTS.bands), phase: NUM(s.phase, 0, 1, 0),
    inside: s.inside === 'light' ? 'light' : 'dark',
    size: [1024, 2048, 4096].includes(+s.size) ? +s.size : DEFAULTS.size,
    view: s.view && [s.view.cx, s.view.cy, s.view.half].every(isFinite) && s.view.half > 0 ? s.view : null,
  };
}

const r6 = v => +(+v).toFixed(6);
function writeHash() {
  const parts = [];
  if (st.slice === 'line') parts.push('s=line', 'y=' + st.y0.map(r6).join(','));
  else parts.push('k=' + st.k.map(r6).join(','));
  parts.push('z=' + st.z0.map(r6).join(','), 'w=' + st.word);
  if (st.maxIt !== DEFAULTS.maxIt) parts.push('it=' + st.maxIt);
  if (st.pal !== DEFAULTS.pal) parts.push('pal=' + st.pal);
  if (st.bands !== DEFAULTS.bands) parts.push('bd=' + st.bands);
  if (st.phase) parts.push('ph=' + st.phase);
  if (st.inside !== 'dark') parts.push('in=' + st.inside);
  if (st.size !== DEFAULTS.size) parts.push('size=' + st.size);
  if (st.view) parts.push('v=' + [st.view.cx, st.view.cy, st.view.half].map(v => +v.toPrecision(12)).join(','));
  history.replaceState(null, '', '#' + parts.join('&'));
}

function parseHash(h) {
  h = h.replace(/^#/, '');
  if (!h) return null;
  const q = {};
  for (const kv of h.split('&')) {
    const i = kv.indexOf('=');
    if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  }
  const two = s => s ? s.split(',').map(Number) : null;
  const v = two(q.v);
  return sanitize({
    slice: q.s, k: two(q.k), z0: two(q.z), y0: two(q.y), word: q.w, maxIt: q.it, pal: q.pal,
    bands: q.bd, phase: q.ph, inside: q.in, size: q.size,
    view: v && v.length === 3 ? { cx: v[0], cy: v[1], half: v[2] } : null,
  });
}

const params = () => ({ slice: st.slice, k: st.k, z0: st.z0, y0: st.y0, word: st.word });
const currentView = () => st.view || { cx: 0, cy: 0, half: 3 };

// ---------- workers ----------

const NWORK = Math.max(2, Math.min(8, navigator.hardwareConcurrency || 4));
const workerURL = new URL('./worker.js', import.meta.url);
let workers = [], jobId = 0, busy = 0;

function spawn() {
  workers.forEach(w => w.terminate());
  workers = Array.from({ length: NWORK }, () => {
    const w = new Worker(workerURL, { type: 'module' });
    w.onmessage = e => onResult(e.data);
    w.onerror = e => { e.preventDefault(); showError(e.message || 'Worker failed to start.'); };
    return w;
  });
  busy = 0;
}

// Computes the escape times of a W × W image of the view, split by rows over the workers.
let job = null; // { id, W, data, left, resolve }
function compute(W, view, maxIt) {
  if (busy) spawn();
  const id = ++jobId;
  return new Promise(resolve => {
    job = { id, W, data: new Float32Array(W * W), left: NWORK, resolve };
    busy = NWORK;
    workers.forEach((w, i) => w.postMessage({ id, params: params(), view, W, first: i, step: NWORK, maxIt }));
  });
}

function onResult(m) {
  if (!job || m.id !== job.id) return;
  if (m.error) { showError(m.error); return; }
  const { W, data } = job;
  for (let j = 0, y = m.first; y < W; j++, y += m.step) data.set(m.data.subarray(j * W, (j + 1) * W), y * W);
  busy--;
  if (--job.left === 0) { const j = job; job = null; j.resolve(j.data); }
}

function showError(msg) {
  $('status').textContent = 'Could not compute: ' + msg;
  $('status').style.display = 'flex';
}

// ---------- colouring ----------

function hex(c) { return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); }

// 256 entries of the palette as RGB bytes
function lut(name) {
  const stops = PALETTES[name].map(hex), out = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const x = i / 255 * (stops.length - 1), a = Math.min(stops.length - 2, Math.floor(x)), f = x - a;
    for (let c = 0; c < 3; c++) out[3 * i + c] = Math.round(stops[a][c] + (stops[a + 1][c] - stops[a][c]) * f);
  }
  return out;
}

// The escape time e, in words, coloured along the palette by log(1 + e): far points escape at
// once and take its first colour, those near the Julia set its last. With bands > 0 the palette
// is run back and forth that many times per unit of log(1 + e).
function colourise(data, W, img) {
  const L = lut(st.pal), out = img.data;
  const top = Math.log1p(st.maxIt);
  const inside = st.inside === 'dark' ? [8, 8, 10] : [250, 250, 248];
  for (let i = 0; i < W * W; i++) {
    const e = data[i], o = 4 * i;
    if (e < 0) { out[o] = inside[0]; out[o + 1] = inside[1]; out[o + 2] = inside[2]; out[o + 3] = 255; continue; }
    const v = Math.log1p(e);
    let t;
    if (st.bands > 0) {
      const x = v * st.bands + st.phase * 2;
      t = 0.5 - 0.5 * Math.cos(Math.PI * x);
      // drift towards the dark end as the set nears, so the bands do not hide it
      t = t * 0.75 + 0.25 * Math.min(1, v / top * 2);
    } else t = Math.min(1, v / top * 1.6);
    const k = Math.round(t * 255) * 3;
    out[o] = L[k]; out[o + 1] = L[k + 1]; out[o + 2] = L[k + 2]; out[o + 3] = 255;
  }
  return img;
}

// ---------- rendering ----------

const stage = $('stage'), canvas = $('canvas'), ctx = canvas.getContext('2d');
let shown = null; // { data, W, view } of the last full render, for recolouring and panning
let renderGen = 0;

function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const css = stage.clientWidth || 600;
  const px = Math.min(1600, Math.round(css * dpr));
  if (canvas.width !== px || canvas.height !== px) { canvas.width = px; canvas.height = px; }
  return px;
}

function paint(data, W) {
  resetTransform(); // the picture now matches the view
  const img = colourise(data, W, new ImageData(W, W));
  if (W === canvas.width) { ctx.putImageData(img, 0, 0); return; }
  const off = new OffscreenCanvas(W, W);
  off.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = W < canvas.width;
  ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
}

async function render() {
  const gen = ++renderGen;
  const W = sizeCanvas(), view = { ...currentView() };
  $('status').style.display = 'none';
  const t0 = performance.now();
  // a quick pass at a quarter of the resolution, then the full one
  const coarse = await compute(Math.ceil(W / 4), view, st.maxIt);
  if (gen !== renderGen) return;
  paint(coarse, Math.ceil(W / 4));
  shown = { data: coarse, W: Math.ceil(W / 4), view };
  $('stats').textContent = 'computing…';
  const data = await compute(W, view, st.maxIt);
  if (gen !== renderGen) return;
  shown = { data, W, view };
  paint(data, W);
  let inside = 0;
  for (const e of data) if (e < 0) inside++;
  const parts = [`${W} × ${W}`, `${((performance.now() - t0) / 1000).toFixed(2)} s`];
  const pct = 100 * inside / data.length;
  if (inside) parts.unshift(`${pct < 0.1 ? "under 0.1" : pct.toFixed(1)}% bounded after ${st.maxIt} words`);
  $('stats').textContent = parts.join(' · ');
}

let renderTimer = 0;
function schedule(ms = 60) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => { render(); writeHash(); }, ms);
}

function recolour() {
  if (shown) paint(shown.data, shown.W);
  writeHash();
}

// ---------- pan and zoom ----------

// While dragging or zooming, the last picture is moved by CSS; a new one is computed after.
function preview() {
  if (!shown) return;
  const v = currentView(), s = shown.view;
  const k = s.half / v.half;
  const dx = ((s.cx - s.half) - (v.cx - v.half)) / (2 * v.half);
  const dy = ((v.cy + v.half) - (s.cy + s.half)) / (2 * v.half);
  canvas.style.transform = `translate(${dx * 100}%, ${dy * 100}%) scale(${k})`;
}
function settle() { schedule(150); }
const resetTransform = () => { canvas.style.transform = ''; };

const pointers = new Map();
let pinch = null;
const local = e => { const r = stage.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
function zoomAt(u, v, f) {
  const vw = { ...currentView() };
  const x = vw.cx - vw.half + 2 * vw.half * u, y = vw.cy + vw.half - 2 * vw.half * v;
  vw.half = Math.min(100, Math.max(1e-12, vw.half * f));
  vw.cx = x - (2 * u - 1) * vw.half;
  vw.cy = y + (2 * v - 1) * vw.half;
  st.view = vw;
}
stage.addEventListener('wheel', e => {
  e.preventDefault();
  const [u, v] = local(e);
  zoomAt(u, v, Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
  preview(); settle();
}, { passive: false });
stage.addEventListener('pointerdown', e => {
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, local(e));
  stage.classList.add('dragging');
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
});
stage.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId), cur = local(e);
  pointers.set(e.pointerId, cur);
  if (pointers.size === 1) {
    const vw = { ...currentView() };
    vw.cx -= (cur[0] - prev[0]) * 2 * vw.half;
    vw.cy += (cur[1] - prev[1]) * 2 * vw.half;
    st.view = vw;
  } else if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, pinch / d);
    pinch = d;
  }
  preview();
});
function endPointer(e) {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) { stage.classList.remove('dragging'); settle(); }
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('dblclick', () => { st.view = null; resetTransform(); schedule(0); });

// ---------- controls ----------

const fmt = v => (v >= 0 ? ' ' : '') + v.toFixed(3);

// a complex parameter as two sliders, real and imaginary part, and a text field for exact values
function complexControl(key, lo, hi) {
  const re = $(`p-${key}-re`), im = $(`p-${key}-im`), txt = $(`p-${key}`);
  re.min = im.min = lo; re.max = im.max = hi; re.step = im.step = 0.001;
  const show = () => {
    re.value = st[key][0]; im.value = st[key][1];
    txt.value = `${r6(st[key][0])}${st[key][1] < 0 ? '−' : '+'}${Math.abs(r6(st[key][1]))}i`;
    txt.classList.remove('bad');
  };
  const onSlide = () => { st[key] = [+re.value, +im.value]; show(); unpreset(); schedule(); };
  re.addEventListener('input', onSlide);
  im.addEventListener('input', onSlide);
  txt.addEventListener('change', () => {
    const z = parseComplex(txt.value);
    if (!z) { txt.classList.add('bad'); return; }
    st[key] = z; show(); unpreset(); schedule(0);
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

const shows = [];
function syncControls() {
  shows.forEach(f => f());
  $('p-slice').value = st.slice;
  document.querySelectorAll('.only-surface').forEach(e => e.classList.toggle('hidden', st.slice !== 'surface'));
  document.querySelectorAll('.only-line').forEach(e => e.classList.toggle('hidden', st.slice !== 'line'));
  $('p-word').value = st.word;
  $('wordNote').textContent = wordNote();
  $('p-it').value = Math.log10(st.maxIt); $('v-it').textContent = st.maxIt;
  $('p-pal').value = st.pal;
  $('p-bands').value = st.bands; $('v-bands').textContent = st.bands.toFixed(2);
  $('p-phase').value = st.phase; $('v-phase').textContent = st.phase.toFixed(2);
  $('p-inside').value = st.inside;
  $('p-size').value = st.size;
}

function wordNote() {
  const w = parseWord(st.word);
  const names = w.map(l => 's' + '₁₂₃'[l]).join(' ');
  const all = new Set(w).size === 3;
  return names + (all ? '' : ' — uses only two of the three moves, so it fixes a coordinate and has no Julia set to speak of');
}

function unpreset() { $('p-preset').value = ''; $('presetNote').textContent = ''; }

function loadPreset(i) {
  const p = PRESETS[i];
  if (!p) return;
  st = sanitize({ ...DEFAULTS, size: st.size, ...p.state, view: p.state.view || null });
  $('presetNote').textContent = p.note || '';
  resetTransform();
  syncControls();
  schedule(0);
}

function init() {
  spawn();
  shows.push(complexControl('k', -2, 6), complexControl('z0', -4, 4), complexControl('y0', -4, 4));
  const sel = $('p-preset');
  sel.innerHTML = '<option value="">Choose an example…</option>' + PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
  sel.addEventListener('change', () => { if (sel.value !== '') loadPreset(+sel.value); });
  $('p-slice').addEventListener('change', () => { st.slice = $('p-slice').value; st.view = null; unpreset(); syncControls(); schedule(0); });
  $('p-word').addEventListener('change', () => {
    const w = $('p-word').value.replace(/[^123]/g, '');
    if (!parseWord(w).length) { $('p-word').classList.add('bad'); return; }
    $('p-word').classList.remove('bad');
    st.word = w; unpreset(); syncControls(); schedule(0);
  });
  $('p-it').addEventListener('input', () => { st.maxIt = Math.round(10 ** +$('p-it').value); $('v-it').textContent = st.maxIt; schedule(200); });
  $('p-pal').addEventListener('change', () => { st.pal = $('p-pal').value; recolour(); });
  $('p-bands').addEventListener('input', () => { st.bands = +$('p-bands').value; syncControls(); recolour(); });
  $('p-phase').addEventListener('input', () => { st.phase = +$('p-phase').value; syncControls(); recolour(); });
  $('p-inside').addEventListener('change', () => { st.inside = $('p-inside').value; recolour(); });
  $('p-size').addEventListener('change', () => { st.size = +$('p-size').value; writeHash(); });
  $('fitBtn').addEventListener('click', () => { st.view = null; resetTransform(); schedule(0); });
  $('saveBtn').addEventListener('click', save);

  new ResizeObserver(() => schedule(100)).observe(stage);
  window.addEventListener('hashchange', () => {
    const s = parseHash(location.hash);
    if (s && JSON.stringify(s) !== JSON.stringify(st)) { st = s; resetTransform(); syncControls(); schedule(0); }
  });

  const s = parseHash(location.hash);
  if (s) st = s;
  else { const p = PRESETS[0]; st = sanitize({ ...DEFAULTS, ...p.state }); sel.value = '0'; $('presetNote').textContent = p.note || ''; }
  syncControls();
  schedule(0);
}

// Saves the view at the chosen size.
async function save() {
  const W = st.size, view = { ...currentView() };
  $('saveBtn').disabled = true;
  $('stats').textContent = `rendering ${W} × ${W}…`;
  try {
    const data = await compute(W, view, st.maxIt);
    const off = document.createElement('canvas');
    off.width = off.height = W;
    off.getContext('2d').putImageData(colourise(data, W, new ImageData(W, W)), 0, 0);
    off.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'markov-julia.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  } finally {
    $('saveBtn').disabled = false;
    render();
  }
}

init();
