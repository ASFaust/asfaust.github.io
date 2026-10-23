import { buildGrid } from './grid.js';
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

for (const [k, f] of Object.entries(FIELDS)) fieldIn.add(new Option(f.label, k));

const grids = new Map();
const state = { level: 5, field: 'diamonds', borders: true };
let current = null;

const fmt = n => n.toLocaleString('en-US');

function redraw() { requestAnimationFrame(() => view.draw()); }

function showStats() {
  const g = current, f = FIELDS[state.field];
  const km = Math.sqrt(4 * Math.PI * 6371 ** 2 / g.count);
  stats.textContent = `level ${g.level} · ${fmt(g.count)} cells · about ${km < 10 ? km.toFixed(1) : Math.round(km)} km apart`;
  $('fieldNote').textContent = f.note + (current.legend ? ` (${current.legend})` : '');
}

function applyField() {
  const { values, style, legend } = FIELDS[state.field].make(current);
  current.legend = legend;
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
      grids.set(level, buildGrid(level));
      status.style.display = 'none';
      setLevel(level);
    }, 30);
    return;
  }
  current = grids.get(level);
  view.setGrid(current);
  applyField();
}

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
fieldIn.value = state.field;
bordersIn.checked = state.borders;
setMode('globe');
setLevel(state.level);
