import { parse, describe, estimate } from './notation.js';
import { OPS } from './operators.js';
import { seed, JOHNSON_NAMES, MAX_N } from './seeds.js';
import { Viewer, STYLES, COLOURINGS, INKS, MATERIALS } from './viewer.js';
import { MODES } from './pipeline.js';
import { PALETTES, paletteHex, linearOf, isHex } from './palettes.js';
import { obj, stl, download } from './export.js';

const $ = id => document.getElementById(id);

// ---------- state ----------

const DEFAULTS = {
  text: 'tkD', mode: 'canonical', regularity: 1, stiffness: 2, symmetric: true,
  style: 'solid', material: 'matte', ao: 0.6, aoSize: 1, colouring: 'origin', palette: 'generated', custom: [],
  hue: 230, chroma: 0.12, edge: 0.5, ink: 'auto', fov: 30, spin: false,
};
const MAX_SWATCHES = 16;
// the most edges the page will build; more makes the browser struggle
const MAX_EDGES = 120000;
let st = { ...DEFAULTS };

const NUM = (v, lo, hi, d) => (isFinite(+v) && v !== '' && v !== null && v !== undefined ? Math.min(hi, Math.max(lo, +v)) : d);
const ONE = (v, list, d) => (list.includes(v) ? v : d);

function sanitize(s) {
  return {
    text: typeof s.text === 'string' && s.text.trim() ? s.text.replace(/\s+/g, '').slice(0, 60) : DEFAULTS.text,
    mode: ONE(s.mode, MODES, DEFAULTS.mode),
    regularity: NUM(s.regularity, 0, 1, DEFAULTS.regularity),
    stiffness: NUM(s.stiffness, 0, 20, DEFAULTS.stiffness),
    symmetric: typeof s.symmetric === 'boolean' ? s.symmetric : DEFAULTS.symmetric,
    style: ONE(s.style, STYLES, DEFAULTS.style),
    material: ONE(s.material, MATERIALS, DEFAULTS.material),
    ao: NUM(s.ao, 0, 1, DEFAULTS.ao),
    aoSize: NUM(s.aoSize, 0.2, 4, DEFAULTS.aoSize),
    colouring: ONE(s.colouring, COLOURINGS, DEFAULTS.colouring),
    palette: ONE(s.palette, Object.keys(PALETTES), DEFAULTS.palette),
    custom: Array.isArray(s.custom) ? s.custom.filter(isHex).slice(0, MAX_SWATCHES) : [],
    hue: Math.round(NUM(s.hue, 0, 359, DEFAULTS.hue)),
    chroma: NUM(s.chroma, 0, 0.25, DEFAULTS.chroma),
    edge: NUM(s.edge, 0, 1, DEFAULTS.edge),
    ink: ONE(s.ink, INKS, DEFAULTS.ink),
    fov: Math.round(NUM(s.fov, 2, 70, DEFAULTS.fov)),
    spin: typeof s.spin === 'boolean' ? s.spin : DEFAULTS.spin,
  };
}

const KEYS = {
  text: 'n', mode: 'm', regularity: 'rg', stiffness: 'k', symmetric: 'sym', style: 'st', material: 'mat', ao: 'ao', aoSize: 'aos',
  colouring: 'c', palette: 'pal', custom: 'pc', hue: 'h', chroma: 'ch', edge: 'e', ink: 'ink', fov: 'fov', spin: 'spin',
};

function writeHash() {
  const parts = ['n=' + encodeURIComponent(st.text)];
  for (const [k, short] of Object.entries(KEYS)) {
    if (k === 'text' || st[k] === DEFAULTS[k]) continue;
    if (k === 'custom') { if (st.palette === 'custom') parts.push('pc=' + st.custom.map(c => c.slice(1)).join(',')); continue; }
    parts.push(short + '=' + (typeof st[k] === 'boolean' ? +st[k] : st[k]));
  }
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
  const s = {};
  for (const [k, short] of Object.entries(KEYS)) {
    const v = q[short];
    s[k] = typeof DEFAULTS[k] === 'boolean' && v !== undefined ? v === '1' : v;
  }
  s.custom = q.pc ? q.pc.split(',').map(c => '#' + c) : [];
  return sanitize(s);
}

// ---------- the worker ----------

const workerURL = new URL('./worker.js', import.meta.url);
let worker = null, job = 0;

const stage = $('stage'), status = $('status'), bar = $('progress');
const viewer = new Viewer($('canvas'));
let mesh = null;      // the last 'mesh' message, for the stats and the 3D files
let positions = null; // the latest positions
let symmetry = null;  // the last 'symmetry' message

function showStatus(text) {
  status.textContent = text || '';
  status.style.display = text ? 'flex' : 'none';
}
function progress(x) {
  bar.style.width = (100 * x).toFixed(1) + '%';
  bar.parentElement.style.opacity = x > 0 && x < 1 ? 1 : 0;
}

// Builds and realizes st.text. A new run stops the one before.
function run() {
  let parsed;
  try { parsed = parse(st.text); } catch (e) { return showError(e.message); }
  $('desc').textContent = describe(parsed);
  $('desc').classList.remove('bad');
  $('p-notation').classList.remove('bad');
  syncPickers(parsed);
  writeHash();

  if (worker) worker.terminate();
  worker = new Worker(workerURL, { type: 'module' });
  const id = ++job;
  const slow = setTimeout(() => { if (id === job && !mesh) showStatus('Building…'); }, 150);
  mesh = null;
  symmetry = null;
  let err0 = null;
  $('mode-note').textContent = '';
  worker.onmessage = e => {
    if (id !== job) return;
    const m = e.data;
    if (m.type === 'stage') {
      if (status.style.display === 'flex') showStatus('Building: ' + m.text);
    } else if (m.type === 'mesh') {
      clearTimeout(slow);
      showStatus('');
      mesh = m; positions = m.pos;
      viewer.setMesh(m);
      showStats();
      showLook();
      if (st.mode !== 'raw') $('mode-note').textContent = 'Relaxing…';
    } else if (m.type === 'symmetry') {
      symmetry = m;
      viewer.setSymmetry(m);
      showStats();
      showLook();
    } else if (m.type === 'pos') {
      positions = m.pos;
      showPositions();
      // how far along, on a log scale from the first error to the goal
      const [err, goal] = st.mode === 'faces' ? [Math.max(m.moved, 1e-12), 1e-8] : [Math.max(m.err.planar, m.err.tangent, 1e-12), 1e-6];
      if (err0 === null) err0 = err;
      progress(Math.min(0.99, Math.max(0.02, Math.log(err0 / err) / Math.log(err0 / goal))));
    } else if (m.type === 'done') {
      progress(1);
      $('mode-note').textContent = realizationNote(m);
    } else if (m.type === 'error') {
      clearTimeout(slow);
      showStatus('');
      progress(1);
      showError(m.message);
    }
  };
  worker.onerror = e => { e.preventDefault(); if (id === job) showError(e.message || 'The worker failed to start.'); };
  worker.postMessage({
    text: st.text, mode: st.mode, regularity: st.regularity, stiffness: st.stiffness,
    symmetric: st.mode === 'faces' && st.symmetric, maxEdges: MAX_EDGES,
  });
}

// The worker sends positions faster than a big shape can be redrawn; only the latest counts.
let posFrame = 0;
function showPositions() {
  if (posFrame) return;
  posFrame = requestAnimationFrame(() => { posFrame = 0; viewer.setPositions(positions); });
}

function showError(msg) {
  $('desc').textContent = msg.charAt(0).toUpperCase() + msg.slice(1) + '.';
  $('desc').classList.add('bad');
  $('p-notation').classList.add('bad');
}

const sci = x => x.toExponential(0).replace('e-', '·10⁻').replace(/\d+$/, d => [...d].map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).join(''));
function realizationNote({ it, err }) {
  if (!err) return 'Vertices where the operators put them; faces need not be flat.';
  if (st.mode === 'faces') {
    return `${it < 60000 ? 'Settled' : 'Stopped'} after ${it.toLocaleString('en')} rounds; the copies of a vertex disagree by up to ${err.spread.toFixed(3)} edge lengths.`;
  }
  const ok = err.planar < 1e-6 && err.tangent < 1e-6;
  const what = st.mode === 'canonical'
    ? `faces flat to ${sci(err.planar)}, edges within ${sci(err.tangent)} of the sphere`
    : `faces flat to ${sci(err.planar)}`;
  return `${ok ? 'Done' : 'Stopped'} after ${it.toLocaleString('en')} rounds: ${what}.`;
}

const POLYGON = { 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon', 12: 'dodecagon' };
function showStats() {
  const m = mesh;
  // squares only in the canonical form of the cube; elsewhere four sides make a quadrilateral
  const name = (s, k) => (s === 4 ? 'quad' : POLYGON[s] || s + '-gon') + (k === 1 ? '' : 's');
  const faces = m.census.map(([s, k]) => `${k.toLocaleString('en')} ${name(s, k)}`).join(', ');
  const sym = symmetry ? ` · ${symmetry.group}, ${symmetry.order} symmetries` : '';
  $('stats').textContent = `${m.nv.toLocaleString('en')} vertices · ${m.ne.toLocaleString('en')} edges · ${m.nf.toLocaleString('en')} faces: ${faces}${sym}`;
  $('stats').title = $('stats').textContent;
}

// ---------- the shape panel ----------

const SEEDS = [
  ['Platonic', [['T', 'Tetrahedron'], ['C', 'Cube'], ['O', 'Octahedron'], ['D', 'Dodecahedron'], ['I', 'Icosahedron']]],
  ['Families', [['P', 'Prism'], ['A', 'Antiprism'], ['Y', 'Pyramid'], ['U', 'Cupola']]],
  ['Johnson solids', Object.entries(JOHNSON_NAMES).map(([k, name]) => ['J' + k, `J${k} ${name}`])],
];
const FAMILY = 'PAYU';

const NAMED = [
  ['Archimedean', [['tT', 'truncated tetrahedron'], ['aC', 'cuboctahedron'], ['tC', 'truncated cube'], ['tO', 'truncated octahedron'],
    ['eC', 'rhombicuboctahedron'], ['bC', 'truncated cuboctahedron'], ['sC', 'snub cube'], ['aD', 'icosidodecahedron'],
    ['tD', 'truncated dodecahedron'], ['tI', 'truncated icosahedron'], ['eD', 'rhombicosidodecahedron'],
    ['bD', 'truncated icosidodecahedron'], ['sD', 'snub dodecahedron']]],
  ['Catalan', [['kT', 'triakis tetrahedron'], ['jC', 'rhombic dodecahedron'], ['kO', 'triakis octahedron'], ['kC', 'tetrakis hexahedron'],
    ['oC', 'deltoidal icositetrahedron'], ['mC', 'disdyakis dodecahedron'], ['gC', 'pentagonal icositetrahedron'],
    ['jD', 'rhombic triacontahedron'], ['kD', 'pentakis dodecahedron'], ['kI', 'triakis icosahedron'],
    ['oD', 'deltoidal hexecontahedron'], ['mD', 'disdyakis triacontahedron'], ['gD', 'pentagonal hexecontahedron']]],
  ['More', [['dP5', 'pentagonal bipyramid'], ['dA5', 'pentagonal trapezohedron'], ['cD', 'Goldberg polyhedron GP(2,0)'],
    ['tkD', 'Goldberg polyhedron GP(3,0)'], ['dcD', 'geodesic sphere (2,0)'], ['pD', 'propello-dodecahedron'],
    ['cC', 'chamfered cube'], ['gpD', 'gyro-propello-dodecahedron']]],
];

function buildPickers() {
  const sel = $('p-seed');
  for (const [group, items] of SEEDS) {
    const g = document.createElement('optgroup');
    g.label = group;
    for (const [v, label] of items) g.append(new Option(label, v));
    sel.append(g);
  }
  $('p-n').max = MAX_N;
  const named = $('p-named');
  named.append(new Option('—', ''));
  for (const [group, items] of NAMED) {
    const g = document.createElement('optgroup');
    g.label = group;
    for (const [v, label] of items) g.append(new Option(`${label} (${v})`, v));
    named.append(g);
  }
  const ops = $('ops');
  for (const [k, def] of Object.entries(OPS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<b>${k}</b><span>${def.name}</span>`;
    b.title = def.base ? `${def.name} = ${def.base}` : def.name;
    b.addEventListener('click', () => setText(k + st.text));
    ops.append(b);
  }
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'undo';
  undo.innerHTML = '<b>⌫</b><span>undo</span>';
  undo.title = 'Remove the last operator applied (the leftmost)';
  undo.addEventListener('click', () => {
    const t = st.text.replace(/^[a-z]\d*/, '');
    if (t !== st.text && t) setText(t);
  });
  ops.append(undo);
}

// shows the seed and named shape that match the parsed string
function syncPickers(p) {
  const v = p.letter === 'J' ? 'J' + p.n : p.letter;
  $('p-seed').value = v;
  const fam = FAMILY.includes(p.letter);
  $('n-param').classList.toggle('hidden', !fam);
  if (fam) $('p-n').value = p.n;
  $('p-named').value = [...$('p-named').options].some(o => o.value === p.text) ? p.text : '';
  $('p-notation').value = p.text;
}

const opsPart = () => st.text.replace(/([TCODI]|[PAYUJ]\d*)$/, '');

function setText(t) {
  st.text = t.replace(/\s+/g, '');
  $('p-notation').value = st.text;
  run();
}

// ---------- random ----------

const RANDOM_SEEDS = ['T', 'C', 'O', 'D', 'I', 'D', 'I', 'P5', 'P6', 'A4', 'A5', 'A7', 'Y5', 'U5', 'J17', 'J29', 'J37', 'J45', 'J46'];
const RANDOM_OPS = 'atkjgpceobmnzsd';
function randomText() {
  for (;;) {
    const s = RANDOM_SEEDS[Math.floor(Math.random() * RANDOM_SEEDS.length)];
    let t = s;
    const k = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < k; i++) {
      let o = RANDOM_OPS[Math.floor(Math.random() * RANDOM_OPS.length)];
      // d twice in a row does nothing
      if (o === 'd' && t[0] === 'd') o = 'k';
      t = o + t;
    }
    const p = parse(t);
    const P = seed(p.letter, p.n);
    const [, e] = estimate([P.nv, P.ne, P.nf], p.ops);
    if (e >= 60 && e <= 8000) return t;
  }
}

// ---------- appearance ----------

function showLook() {
  $('p-mode').value = st.mode;
  for (const id of ['faces-regularity', 'faces-stiffness', 'faces-symmetric']) $(id).classList.toggle('hidden', st.mode !== 'faces');
  $('p-symmetric').checked = st.symmetric;
  $('p-material').value = st.material;
  $('p-ao').value = st.ao; $('v-ao').textContent = st.ao ? st.ao.toFixed(2) : 'off';
  $('p-aosize').value = st.aoSize; $('v-aosize').textContent = st.aoSize.toFixed(1) + ' edges';
  for (const id of ['p-ao', 'p-aosize']) $(id).disabled = st.style !== 'solid';
  $('p-aosize').disabled ||= st.ao === 0;
  $('p-palette').value = st.palette;
  for (const id of ['hue-param', 'chroma-param']) $(id).classList.toggle('hidden', st.palette !== 'generated');
  $('p-regularity').value = st.regularity; $('v-regularity').textContent = st.regularity.toFixed(2);
  $('p-stiffness').value = st.stiffness; $('v-stiffness').textContent = st.stiffness.toFixed(1);
  $('p-style').value = st.style;
  $('p-colouring').value = st.colouring;
  $('p-hue').value = st.hue; $('v-hue').textContent = st.hue + '°';
  $('p-chroma').value = st.chroma; $('v-chroma').textContent = st.chroma.toFixed(2);
  $('p-edge').value = st.edge; $('v-edge').textContent = st.edge.toFixed(2);
  $('p-ink').value = st.ink;
  $('p-fov').value = st.fov; $('v-fov').textContent = st.fov + '°';
  $('p-spin').checked = st.spin;
  // the hue means nothing without chroma
  $('p-hue').disabled = st.chroma === 0;
  viewer.set({
    style: st.style, material: st.material, ao: st.ao, aoSize: st.aoSize, colouring: st.colouring, palette: currentPalette(),
    edge: st.edge, ink: st.ink, fov: st.fov, spin: st.spin,
    dark: document.documentElement.getAttribute('data-theme') === 'dark',
  });
  showSwatches();
}

// the palette as hex strings, as many as the colouring needs (for the generated one)
const paletteNow = () => paletteHex(st, Math.min(MAX_SWATCHES, viewer.classes()));

// The palette as linear colours for the viewer. The same array while nothing changes, so that the
// viewer only recolours when it must.
let palKey = '', palLinear = null;
function currentPalette() {
  const hex = paletteNow(), key = hex.join();
  if (key !== palKey) { palKey = key; palLinear = hex.map(linearOf); }
  return palLinear;
}

// One colour picker per palette entry. Editing one turns the palette into a custom one. The pickers
// are only rebuilt when their number or colours change, so an open picker stays open while it is in
// use.
let swatchKey = '';
function showSwatches() {
  const hex = paletteNow(), key = st.palette + ':' + hex.join();
  $('swatch-add').classList.toggle('hidden', st.palette !== 'custom' || hex.length >= MAX_SWATCHES);
  $('swatch-remove').classList.toggle('hidden', st.palette !== 'custom' || hex.length <= 1);
  if (key === swatchKey) return;
  swatchKey = key;
  const box = $('swatches');
  const inputs = [...box.querySelectorAll('oklch-picker')];
  hex.forEach((c, i) => {
    let el = inputs[i];
    if (!el) {
      el = document.createElement('oklch-picker');
      el.title = `Colour ${i + 1}`;
      el.addEventListener('input', () => {
        const list = paletteNow().slice();
        list[i] = el.value;
        st.palette = 'custom';
        st.custom = list;
        showLook();
        writeHash();
      });
      box.append(el);
    }
    if (el.value !== c) el.value = c;
  });
  for (const el of inputs.slice(hex.length)) el.remove();
}

function bindLook() {
  const look = (id, key, conv) => $(id).addEventListener('input', () => {
    st[key] = conv($(id));
    showLook();
    writeHash();
  });
  look('p-style', 'style', el => el.value);
  look('p-material', 'material', el => el.value);
  look('p-ao', 'ao', el => +el.value);
  look('p-aosize', 'aoSize', el => +el.value);
  look('p-palette', 'palette', el => {
    // a fresh custom palette starts from what is shown
    if (el.value === 'custom' && !st.custom.length) st.custom = paletteHex({ ...st, palette: st.palette }, Math.min(MAX_SWATCHES, viewer.classes())).slice();
    return el.value;
  });
  look('p-colouring', 'colouring', el => el.value);
  look('p-hue', 'hue', el => +el.value);
  look('p-chroma', 'chroma', el => +el.value);
  look('p-edge', 'edge', el => +el.value);
  look('p-ink', 'ink', el => el.value);
  look('p-fov', 'fov', el => +el.value);
  look('p-spin', 'spin', el => el.checked);
}

// ---------- wiring ----------

buildPickers();
bindLook();
// the theme toggle lives in the page; the automatic edge colour follows it
new MutationObserver(showLook).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

$('goBtn').addEventListener('click', () => setText($('p-notation').value));
$('p-notation').addEventListener('keydown', e => { if (e.key === 'Enter') setText($('p-notation').value); });
$('p-seed').addEventListener('change', () => {
  const v = $('p-seed').value;
  const n = FAMILY.includes(v) ? (+$('p-n').value >= 3 ? +$('p-n').value : 5) : '';
  setText(opsPart() + v + n);
});
$('p-n').addEventListener('change', () => {
  const v = $('p-seed').value;
  if (!FAMILY.includes(v)) return;
  const n = Math.round(NUM($('p-n').value, v === 'U' ? 2 : 3, MAX_N, 5));
  setText(opsPart() + v + n);
});
$('p-named').addEventListener('change', () => { if ($('p-named').value) setText($('p-named').value); });
$('p-mode').addEventListener('change', () => { st.mode = $('p-mode').value; showLook(); run(); });
$('p-symmetric').addEventListener('change', () => { st.symmetric = $('p-symmetric').checked; run(); });
$('swatch-add').addEventListener('click', () => {
  st.custom = [...paletteNow(), paletteNow().at(-1)];
  showLook(); writeHash();
});
$('swatch-remove').addEventListener('click', () => {
  st.custom = paletteNow().slice(0, -1);
  showLook(); writeHash();
});
for (const [id, key] of [['p-regularity', 'regularity'], ['p-stiffness', 'stiffness']]) {
  $(id).addEventListener('input', () => { st[key] = +$(id).value; showLook(); });
  $(id).addEventListener('change', run);
}

$('randomBtn').addEventListener('click', () => setText(randomText()));
$('resetBtn').addEventListener('click', () => viewer.resetView());

const fileName = ext => `polyhedron-${st.text}.${ext}`;
const stageBackground = () => getComputedStyle(document.documentElement).getPropertyValue('--stage-bg').trim() || '#ffffff';
$('saveBtn').addEventListener('click', () => {
  $('canvas').toBlob(b => b && download(b, fileName('png')), 'image/png');
});
$('exportBtn').addEventListener('click', async () => {
  const want = +$('p-size').value, max = viewer.maxExport();
  const size = Math.min(want, max);
  const btn = $('exportBtn');
  btn.disabled = true;
  try {
    const blob = await viewer.snapshot(size, $('p-transparent').checked ? null : stageBackground());
    if (blob) download(blob, fileName('png'));
    else alert('The browser could not make an image this large.');
    if (size < want) alert(`This graphics card renders at most ${max} × ${max}; saved at that size.`);
  } finally { btn.disabled = false; }
});
$('objBtn').addEventListener('click', () => { if (mesh) download(obj(mesh, positions, st.text), fileName('obj')); });
$('stlBtn').addEventListener('click', () => { if (mesh) download(stl(mesh, positions), fileName('stl')); });

st = readHash() || { ...DEFAULTS };
showLook();
$('p-notation').value = st.text;
run();
