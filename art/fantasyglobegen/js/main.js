import { buildGrid, cellCount, prolong, restrict } from './grid.js';
import { encodeGlobe, decodeGlobe } from './globefile.js';
import { GlobeView } from './view.js';
import { FIELDS } from './fields.js';

const $ = id => document.getElementById(id);
const canvas = $('canvas'), stage = $('stage'), status = $('status'), stats = $('stats');
const levelIn = $('p-level'), fieldIn = $('p-field'), bordersIn = $('p-borders');

let view;
try { view = new GlobeView(canvas); } catch (e) {
  status.textContent = e.message;
  status.style.display = 'flex';
  throw e;
}

const grids = new Map();
const gridAt = level => { if (!grids.has(level)) grids.set(level, buildGrid(level)); return grids.get(level); };
const state = { level: 5, field: 'diamonds', borders: true, month: 0 };
let current = null;

// what the Field menu offers: the test fields, then the layers of a loaded file
const fields = new Map(Object.entries(FIELDS));
const loaded = { name: '', params: {}, layers: {} };
function fillFieldMenu() {
  fieldIn.textContent = '';
  const tests = document.createElement('optgroup');
  tests.label = 'Test fields';
  for (const [k, f] of fields) if (!k.startsWith('layer:')) tests.append(new Option(f.label, k));
  fieldIn.append(tests);
  if (Object.keys(loaded.layers).length) {
    const file = document.createElement('optgroup');
    file.label = loaded.name;
    for (const [k, f] of fields) if (k.startsWith('layer:')) file.append(new Option(f.label, k));
    fieldIn.append(file);
  }
  fieldIn.value = state.field;
}

// a layer moved to another level, one level at a time
function atLevel(values, from, to) {
  for (; from < to; from++) values = prolong(values, gridAt(from), gridAt(from + 1));
  for (; from > to; from--) values = restrict(values, gridAt(from), gridAt(from - 1));
  return values;
}

// fixed colour ranges for climate fields, so months and model and observations compare
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STYLES = {
  temperature: { cmap: 2, range: [-40, 40] },
  precipitation: { cmap: 0, range: [0, 10] },
  evaporation: { cmap: 0, range: [0, 8] },
  vapour: { cmap: 0, range: [0, 60] },
  wind_east: { cmap: 2, range: [-12, 12] },
  wind_north: { cmap: 2, range: [-8, 8] },
};

function layerField(name, layer) {
  const N = cellCount(layer.level), base = name.replace(/^observed_/, '');
  return {
    label: name.replace(/_/g, ' ') + (layer.unit ? ` (${layer.unit})` : ''),
    layer,
    get note() {
      const when = layer.frames === 12 ? (state.month ? `, ${MONTHS[state.month - 1]}` : ', annual mean') : layer.frames > 1 ? `, first of ${layer.frames} frames` : '';
      return `${layer.source || 'from ' + loaded.name}, stored at level ${layer.level}${when}`;
    },
    make(g) {
      let v;
      if (layer.frames === 12 && !state.month) {
        v = new Float32Array(N);
        for (let m = 0; m < 12; m++) for (let i = 0; i < N; i++) v[i] += layer.values[m * N + i] / 12;
      } else {
        const f = layer.frames === 12 ? state.month - 1 : 0;
        v = layer.values.subarray(f * N, (f + 1) * N);
      }
      const values = atLevel(v, layer.level, g.level);
      let lo = Infinity, hi = -Infinity;
      for (const x of values) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
      const relief = base === 'height' && lo < 0 && hi > 0;
      const style = STYLES[base] ? { ...STYLES[base], flat: false }
        : relief ? { cmap: 3, flat: false, range: [lo, hi] } : { cmap: 0, flat: false, range: [lo, hi === lo ? lo + 1 : hi] };
      return { values, style, legend: `${fmtNum(lo)} to ${fmtNum(hi)}${layer.unit ? ' ' + layer.unit : ''}` };
    },
  };
}

// a file replaces what is loaded; climate results and observations are added to it
function setLayers(layers, select) {
  for (const k of [...fields.keys()]) if (k.startsWith('layer:')) fields.delete(k);
  loaded.layers = layers;
  for (const [n, layer] of Object.entries(layers)) fields.set('layer:' + n, layerField(n, layer));
  if (select) state.field = 'layer:' + select;
  if (!fields.has(state.field)) state.field = 'diamonds';
  fillFieldMenu();
  updateClimateNote();
}

function setLoaded(name, globe) {
  Object.assign(loaded, { name, params: globe.params });
  const first = Object.keys(globe.layers)[0];
  setLayers(globe.layers, first);
  if (first) {
    // show it at the level it was stored at
    levelIn.value = Math.min(+levelIn.max, globe.layers[first].level);
    setLevel(+levelIn.value);
  }
}

function addLayers(layers, select) {
  setLayers({ ...loaded.layers, ...layers }, select);
  applyField();
}

const fmt = n => n.toLocaleString('en-US');
const fmtNum = v => Math.abs(v) >= 100 ? fmt(Math.round(v)) : v.toPrecision(3);

function redraw() { requestAnimationFrame(() => view.draw()); }

function showStats() {
  const g = current, f = fields.get(state.field);
  const km = Math.sqrt(4 * Math.PI * 6371 ** 2 / g.count);
  stats.textContent = `level ${g.level} · ${fmt(g.count)} cells · about ${km < 10 ? km.toFixed(1) : Math.round(km)} km apart`;
  $('fieldNote').textContent = f.note + (current.legend ? ` (${current.legend})` : '');
}

function applyField() {
  const f = fields.get(state.field);
  $('monthParam').hidden = !(f.layer && f.layer.frames === 12);
  $('v-month').textContent = state.month ? MONTHS[state.month - 1] : 'year';
  const { values, style, legend } = f.make(current);
  current.legend = legend;
  current.values = values;
  view.setField(values, { ...style, borders: state.borders });
  showStats();
  redraw();
}

function setLevel(level) {
  state.level = level;
  $('v-level').textContent = level;
  if (!grids.has(level)) {
    status.textContent = `Building level ${level}…`;
    status.style.display = 'flex';
    // let the message paint before the main thread is busy
    setTimeout(() => {
      gridAt(level);
      status.style.display = 'none';
      setLevel(level);
    }, 30);
    return;
  }
  current = grids.get(level);
  view.setGrid(current);
  applyField();
}

// files: save what is shown (plus the loaded file's other layers), load by picker or drop
function flash(msg) {
  status.textContent = msg;
  status.style.display = 'flex';
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { status.style.display = 'none'; }, 3500);
}

$('fileSaveBtn').addEventListener('click', async () => {
  const layers = {};
  for (const [n, l] of Object.entries(loaded.layers)) layers[n] = l;
  const f = fields.get(state.field);
  if (!f.layer) layers[state.field] = { level: current.level, dtype: 'float32', values: current.values };
  const bytes = await encodeGlobe({ params: { ...loaded.params }, layers });
  const a = document.createElement('a');
  a.download = (loaded.name || 'globe').replace(/\.globe$/, '') + '.globe';
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

async function loadFile(file) {
  try {
    flash(`Reading ${file.name}…`);
    const globe = await decodeGlobe(new Uint8Array(await file.arrayBuffer()));
    status.style.display = 'none';
    setLoaded(file.name, globe);
  } catch (e) {
    flash(e.message);
  }
}
$('earthBtn').addEventListener('click', async () => {
  const r = await fetch('data/earth.globe');
  loadFile(new File([await r.blob()], 'earth.globe'));
});
$('observedBtn').addEventListener('click', async () => {
  try {
    flash('Reading the observed climate…');
    const globe = await decodeGlobe(new Uint8Array(await (await fetch('data/earth-observed.globe')).arrayBuffer()));
    status.style.display = 'none';
    const layers = {};
    for (const [n, l] of Object.entries(globe.layers)) layers['observed_' + n] = { ...l, source: 'observed on Earth, 1991–2020' };
    if (!loaded.name) loaded.name = 'earth-observed.globe';
    const cur = state.field.replace(/^layer:(observed_)?/, '');
    addLayers(layers, 'observed_' + (cur in globe.layers ? cur : 'temperature'));
  } catch (e) {
    flash(e.message);
  }
});

// the climate model runs in a worker; its monthly means become layers
const climateBtn = $('climateBtn'), progress = $('progress');
let worker = null;
function updateClimateNote() {
  const h = loaded.layers.height;
  climateBtn.disabled = !h && !worker;
  if (!worker) $('climateNote').textContent = h ? `runs on the height layer of ${loaded.name}` : 'needs a height layer: press Earth first';
}
climateBtn.addEventListener('click', () => {
  if (worker) {
    worker.terminate();
    worker = null;
    climateBtn.textContent = 'Run climate';
    progress.style.opacity = 0;
    updateClimateNote();
    return;
  }
  const h = loaded.layers.height, level = +$('p-climLevel').value, years = 4, t0 = performance.now();
  worker = new Worker(new URL('./climate/worker.js', import.meta.url), { type: 'module' });
  climateBtn.textContent = 'Stop';
  $('climateNote').textContent = 'running…';
  progress.style.opacity = 1;
  progress.firstElementChild.style.width = '0';
  worker.onmessage = ({ data }) => {
    if (data.progress !== undefined) {
      progress.firstElementChild.style.width = `${data.progress * 100}%`;
      const done = data.progress, sec = (performance.now() - t0) / 1000;
      $('climateNote').textContent = `running: year ${Math.min(years, Math.floor(done * years) + 1)} of ${years}` + (done > 0.05 ? `, about ${Math.ceil(sec / done - sec)} s left` : '');
      return;
    }
    worker.terminate();
    worker = null;
    climateBtn.textContent = 'Run climate';
    progress.style.opacity = 0;
    if (data.error) { $('climateNote').textContent = 'failed: ' + data.error; return; }
    const sec = ((performance.now() - t0) / 1000).toFixed(0);
    for (const l of Object.values(data.result.layers)) l.source = `modelled at level ${data.result.level} in ${sec} s`;
    const keep = state.field.replace(/^layer:(observed_)?/, '');
    addLayers(data.result.layers, keep in data.result.layers ? keep : 'precipitation');
    updateClimateNote();
    $('climateNote').textContent += ` · last run took ${sec} s`;
  };
  worker.onerror = e => {
    climateBtn.click();
    $('climateNote').textContent = 'failed: ' + (e.message || 'the worker could not start');
  };
  worker.postMessage({ height: h.values, heightLevel: h.level, level, years, params: {} });
});

const monthIn = $('p-month');
monthIn.addEventListener('input', () => { state.month = +monthIn.value; applyField(); });
const fileIn = $('fileIn');
$('fileLoadBtn').addEventListener('click', () => fileIn.click());
fileIn.addEventListener('change', () => { if (fileIn.files[0]) loadFile(fileIn.files[0]); fileIn.value = ''; });
stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('drop'); });
stage.addEventListener('dragleave', () => stage.classList.remove('drop'));
stage.addEventListener('drop', e => {
  e.preventDefault();
  stage.classList.remove('drop');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

levelIn.addEventListener('input', () => setLevel(+levelIn.value));
fieldIn.addEventListener('change', () => { state.field = fieldIn.value; applyField(); });
bordersIn.addEventListener('change', () => { state.borders = bordersIn.checked; view.style.borders = state.borders; redraw(); });

const globeBtn = $('globeBtn'), mapBtn = $('mapBtn');
function setMode(mode) {
  view.mode = mode;
  globeBtn.classList.toggle('on', mode === 'globe');
  mapBtn.classList.toggle('on', mode === 'map');
  stage.classList.toggle('map', mode === 'map');
  redraw();
}
globeBtn.addEventListener('click', () => setMode('globe'));
mapBtn.addEventListener('click', () => setMode('map'));
$('resetBtn').addEventListener('click', () => {
  Object.assign(view.camera, { yaw: 0.6, pitch: 0.35, dist: 4.4 });
  Object.assign(view.mapView, { x: 0, y: 0, zoom: 1 });
  redraw();
});
$('saveBtn').addEventListener('click', () => {
  view.draw();
  const a = document.createElement('a');
  a.download = `globe-${state.field}-L${state.level}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
});

// dragging turns the globe or pans the map; the wheel or a pinch zooms
const pointers = new Map();
let pinch = 0;
stage.addEventListener('pointerdown', e => {
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  stage.classList.add('dragging');
});
stage.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const [px, py] = pointers.get(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch) zoom(pinch / d);
    pinch = d;
    return;
  }
  const dx = e.clientX - px, dy = e.clientY - py, h = stage.clientHeight;
  if (view.mode === 'globe') {
    const c = view.camera, k = 2.2 * (c.dist - 1) / c.dist / h;
    c.yaw -= dx * k * 1.6;
    c.pitch = Math.max(-1.5, Math.min(1.5, c.pitch + dy * k * 1.6));
  } else {
    const v = view.mapView, w = stage.clientWidth;
    v.x -= 2 * dx / w / v.zoom;
    v.y += 2 * dy / h / v.zoom / (w / h);
    if (v.x > 1) v.x -= 2; else if (v.x < -1) v.x += 2;
  }
  redraw();
});
const release = e => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = 0;
  if (!pointers.size) stage.classList.remove('dragging');
};
stage.addEventListener('pointerup', release);
stage.addEventListener('pointercancel', release);
stage.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });

function zoom(f) {
  if (view.mode === 'globe') {
    const c = view.camera;
    c.dist = 1 + Math.max(0.08, Math.min(7, (c.dist - 1) * f));
  } else {
    const v = view.mapView;
    v.zoom = Math.max(1, Math.min(64, v.zoom / f));
  }
  redraw();
}

new ResizeObserver(redraw).observe(stage);
document.addEventListener('themechange', redraw);

levelIn.value = state.level;
fillFieldMenu();
updateClimateNote();
bordersIn.checked = state.borders;
setMode('globe');
setLevel(state.level);
