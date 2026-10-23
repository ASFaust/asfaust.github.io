import { parse, describe, estimate } from './notation.js';
import { OPS } from './operators.js';
import { seed, JOHNSON_NAMES, MAX_N } from './seeds.js';
import { Viewer, STYLES, COLOURINGS, INKS, MATERIALS, LINES, GROUNDS, LIGHT_NAMES } from './viewer.js';
import { OPTIMIZERS, INITS, INSTANT } from './pipeline.js';
import { TARGETS } from './faces.js';
import { SPECTRAL_MAX, MATRICES } from './spectral.js';
import { PALETTES, paletteHex, linearOf, isHex } from './palettes.js';
import { obj, stl, download } from './export.js';
import { blenderScene } from './blender.js';

const $ = id => document.getElementById(id);

// ---------- state ----------

const DEFAULTS = {
  text: 'tkD', steps: [{ opt: 'canonical' }],
  style: 'solid', material: 'matte', colouring: 'origin', palette: 'generated', custom: [],
  hue: 230, chroma: 0.12, edge: 0.5, lines: 'drawn', depthWidth: 0, hidden: 0.25, ink: 'auto', fov: 30, spin: false,
  orient: 'free', ground: 'none', lift: 0, elev: 0, azim: 0, light: 'soft', bg: '',
};
const MAX_SWATCHES = 16;
// the longest chain of optimizers kept in the URL
const MAX_STEPS = 24;
// the most edges the page will build; more makes the browser struggle
const MAX_EDGES = 120000;
let st = { ...DEFAULTS };

const NUM = (v, lo, hi, d) => (isFinite(+v) && v !== '' && v !== null && v !== undefined ? Math.min(hi, Math.max(lo, +v)) : d);
const ONE = (v, list, d) => (list.includes(v) ? v : d);

function sanitize(s) {
  return {
    text: typeof s.text === 'string' && s.text.trim() ? s.text.replace(/\s+/g, '').slice(0, 60) : DEFAULTS.text,
    steps: (Array.isArray(s.steps) ? s.steps.slice(0, MAX_STEPS) : DEFAULTS.steps).map(t => ({ ...t })),
    style: ONE(s.style, STYLES, DEFAULTS.style),
    material: ONE(s.material, MATERIALS, DEFAULTS.material),
    colouring: ONE(s.colouring, COLOURINGS, DEFAULTS.colouring),
    palette: ONE(s.palette, Object.keys(PALETTES), DEFAULTS.palette),
    custom: Array.isArray(s.custom) ? s.custom.filter(isHex).slice(0, MAX_SWATCHES) : [],
    hue: Math.round(NUM(s.hue, 0, 359, DEFAULTS.hue)),
    chroma: NUM(s.chroma, 0, 0.25, DEFAULTS.chroma),
    edge: NUM(s.edge, 0, 1, DEFAULTS.edge),
    lines: ONE(s.lines, LINES, DEFAULTS.lines),
    depthWidth: NUM(s.depthWidth, 0, 1, DEFAULTS.depthWidth),
    hidden: NUM(s.hidden, 0, 1, DEFAULTS.hidden),
    ink: ONE(s.ink, INKS, DEFAULTS.ink),
    fov: Math.round(NUM(s.fov, 2, 70, DEFAULTS.fov)),
    spin: typeof s.spin === 'boolean' ? s.spin : DEFAULTS.spin,
    orient: typeof s.orient === 'string' && /^(free|[fve]\d{1,5})$/.test(s.orient) ? s.orient : DEFAULTS.orient,
    ground: ONE(s.ground, GROUNDS, DEFAULTS.ground),
    lift: NUM(s.lift, 0, 1, DEFAULTS.lift),
    elev: Math.round(NUM(s.elev, -89, 89, DEFAULTS.elev)),
    azim: Math.round(NUM(s.azim, -180, 180, DEFAULTS.azim)),
    light: ONE(s.light, LIGHT_NAMES, DEFAULTS.light),
    // '' follows the page's theme until a background is chosen
    bg: ONE(s.bg, ['light', 'dark'], ''),
  };
}

const KEYS = {
  text: 'n', steps: 'm', style: 'st', material: 'mat',
  colouring: 'c', palette: 'pal', custom: 'pc', hue: 'h', chroma: 'ch', edge: 'e', lines: 'ln', depthWidth: 'ed', hidden: 'hid', ink: 'ink', fov: 'fov', spin: 'spin',
  orient: 'or', ground: 'gr', lift: 'lift', elev: 'el', azim: 'az', light: 'li', bg: 'bg',
};

function hashText(st) {
  const parts = ['n=' + encodeURIComponent(st.text)];
  for (const [k, short] of Object.entries(KEYS)) {
    if (k === 'text' || st[k] === DEFAULTS[k]) continue;
    if (k === 'steps') { const m = stepsText(st.steps); if (m !== 'canonical') parts.push('m=' + m); continue; }
    if (k === 'custom') { if (st.palette === 'custom') parts.push('pc=' + st.custom.map(c => c.slice(1)).join(',')); continue; }
    parts.push(short + '=' + (typeof st[k] === 'boolean' ? +st[k] : st[k]));
  }
  return parts.join('&');
}
function writeHash() { history.replaceState(null, '', '#' + hashText(st)); }

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
  s.steps = q.m === undefined ? undefined : parseSteps(q.m, q.rg);
  return sanitize(s);
}

// The chain of steps applied since the shape was built, in the URL as
// "random:83121,affine/w,shake:5120,regular:0.8/wa@340": a random start with its seed (or
// "spectral:3", the third spectral start, "spectral:3:facemean" from another matrix than the
// adjacency), then optimizers and shakes, each with its regularity (star, stellate: its
// pointedness; shake: its seed) after a colon, its switches after a slash (w whiten, a without
// the symmetry; c centre, o orthogonalise, n normalise in old links) and after an at sign the round
// at which it was stopped, so that the chain replays to exactly the same shape. A mix lists its
// weights: "mix:regular=1+flat=0.5+pt=0.25/w", pt the pointedness when star or stellate is in it.
// "built" is the empty chain: the shape as built.
const POINTED = ['star', 'stellate'];
const weightsText = t => TARGETS.filter(k => t.weights[k] > 0).map(k => k + '=' + t.weights[k]).join('+')
  + (POINTED.some(k => t.weights[k] > 0) && t.pointedness !== 0.3 ? '+pt=' + t.pointedness : '');
function stepsText(steps) {
  if (!steps.length) return 'built';
  return steps.map(t => t.opt + (t.opt === 'random' || t.opt === 'shake' ? ':' + t.seed : t.opt === 'spectral' ? ':' + t.index + (t.matrix && t.matrix !== 'adjacency' ? ':' + t.matrix : '')
    : t.opt === 'mix' ? ':' + weightsText(t)
    : t.opt === 'regular' && t.regularity !== 1 ? ':' + t.regularity : POINTED.includes(t.opt) && t.pointedness !== 0.3 ? ':' + t.pointedness : '')
    + (t.flags ? '/' + t.flags : '') + (t.it !== undefined ? '@' + t.it : '')).join(',');
}

// Also reads the old single modes: faces (with its regularity rg), planar, raw.
const OLD = { faces: 'regular', planar: 'flat' };
function parseSteps(text, rg) {
  const steps = [];
  for (const tok of text.split(',')) {
    const x = tok.match(/^mix:([a-z]+=[\d.]+(?:\+[a-z]+=[\d.]+)*)(?:\/([conwa]+))?(?:@(\d+))?$/);
    if (x) {
      const step = { opt: 'mix', weights: {}, pointedness: 0.3 };
      for (const kv of x[1].split('+')) {
        const [k, v] = kv.split('=');
        if (k === 'pt') step.pointedness = NUM(v, 0, 0.5, 0.3);
        else if (TARGETS.includes(k) && +v > 0) step.weights[k] = NUM(v, 0, 1, 1);
      }
      if (!Object.keys(step.weights).length) continue;
      if (x[2]) step.flags = flagsText(x[2]);
      if (x[3] !== undefined) step.it = +x[3];
      steps.push(step);
      continue;
    }
    const m = tok.match(/^([a-z]+)(?::([\d.]+))?(?::([a-z]+))?(?:\/([conwa]+))?(?:@(\d+))?$/);
    if (!m) continue;
    if (m[1] === 'built' || m[1] === 'raw') { steps.length = 0; continue; }
    if (m[1] === 'random') { steps.length = 0; steps.push({ opt: 'random', seed: Math.floor(+m[2]) || 1 }); continue; }
    if (m[1] === 'spectral') { steps.length = 0; steps.push({ opt: 'spectral', index: Math.floor(+m[2]) || 1, matrix: ONE(m[3], MATRICES, 'adjacency') }); continue; }
    const opt = OLD[m[1]] || m[1];
    if (opt === 'shake') { steps.push({ opt, seed: Math.floor(+m[2]) || 1, ...(m[4] ? { flags: flagsText(m[4]) } : {}) }); continue; }
    if (!OPTIMIZERS.includes(opt) || opt === 'mix') continue;
    // the old faces mode started from a canonical shape
    if (m[1] === 'faces') steps.push({ opt: 'canonical' });
    const step = { opt };
    if (opt === 'regular') step.regularity = NUM(m[2] ?? (m[1] === 'faces' ? rg : undefined), 0, 1, 1);
    if (POINTED.includes(opt)) step.pointedness = NUM(m[2], 0, 0.5, 0.3);
    if (m[4]) step.flags = flagsText(m[4]);
    if (m[5] !== undefined) step.it = +m[5];
    steps.push(step);
  }
  return steps;
}

// ---------- the worker ----------

const workerURL = new URL('./worker.js', import.meta.url);
let worker = null, job = 0;

const stage = $('stage'), status = $('status'), bar = $('progress');
const viewer = new Viewer($('canvas'));
// dragging round a symmetric view moves the camera; the link keeps where it ended up
viewer.onOrbit = (az, el, end) => {
  st.azim = Math.round(az); st.elev = Math.round(el);
  $('p-elev').value = st.elev; $('v-elev').textContent = st.elev + '°';
  if (end) writeHash();
};
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

// Every step gets an id, so the worker's reports can be matched to it.
let nextId = 1;
const withId = t => (t.id ? t : Object.assign(t, { id: nextId++ }));
const message = t => ({
  id: t.id, opt: t.opt, regularity: t.regularity ?? 1, pointedness: t.pointedness ?? 0.3, weights: t.weights, seed: t.seed, index: t.index, matrix: t.matrix, it: t.it,
  flags: { centre: !!t.flags?.includes('c'), orthogonalise: !!t.flags?.includes('o'), normalise: !!t.flags?.includes('n'), whiten: !!t.flags?.includes('w') },
  keep: !t.flags?.includes('a'),
});
// the switches as letters, in a fixed order, or undefined for none: w whiten, a without the
// symmetry (c, o, n: the adjustments of old links)
const flagsText = s => [...'conwa'].filter(c => s.includes(c)).join('') || undefined;
const flagsNow = () => flagsText(($('p-whiten').checked ? 'w' : '') + ($('p-keep').checked ? '' : 'a'));
let running = null;   // the step the worker is running, or null
let err0 = null, stage0;

// Builds st.text and replays the chain of optimizers on it. A new run stops the one before.
function run() {
  let parsed;
  try { parsed = parse(st.text); } catch (e) { return showError(e.message); }
  $('desc').textContent = describe(parsed);
  $('desc').classList.remove('bad');
  $('p-notation').classList.remove('bad');
  syncPickers(parsed);
  writeHash();

  if (worker) worker.terminate();
  stopShare();
  worker = new Worker(workerURL, { type: 'module' });
  const id = ++job;
  const slow = setTimeout(() => { if (id === job && !mesh) showStatus('Building…'); }, 150);
  mesh = null;
  symmetry = null;
  setRunning(null);
  $('mode-note').textContent = '';
  showHistory();
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
      if (!st.steps.length) $('mode-note').textContent = realizationNote(null, {});
    } else if (m.type === 'symmetry') {
      symmetry = m;
      viewer.setSymmetry(m);
      showViews(m.views);
      showStats();
      showLook();
    } else if (m.type === 'start') {
      setRunning(st.steps.find(t => t.id === m.id) || { id: m.id, opt: 'built' });
      err0 = null;
      if (!INSTANT.includes(running.opt)) $('mode-note').textContent = LABEL[running.opt] + '…';
      else if (running.opt === 'spectral') $('mode-note').textContent = 'Computing the eigenvectors…';
    } else if (m.type === 'pos') {
      positions = m.pos;
      showPositions();
      if (running && !INSTANT.includes(running.opt)) progress(progressOf(running.opt, m));
    } else if (m.type === 'done') {
      const t = st.steps.find(t => t.id === m.id);
      if (t) t.done = true;
      if (t && m.stopped) { t.it = m.it; writeHash(); }
      // the worker wraps the index round past the last start
      if (t && m.spectral?.index && m.spectral.index !== t.index) { t.index = m.spectral.index; writeHash(); }
      if (m.spectral?.index) $('p-spectral').value = m.spectral.index;
      if (m.spectral) $('spectral-count').textContent = m.spectral.count ? 'of ' + m.spectral.count : '';
      progress(1);
      $('mode-note').textContent = realizationNote(t, m);
      setRunning(null);
      showHistory();
      if (shareWanted && !running) startShare();
    } else if (m.type === 'restored') {
      progress(1);
      setRunning(null);
      const t = st.steps.at(-1);
      $('mode-note').textContent = t ? `Back to the shape after ${stepLabel(t)}.` : 'Back to the shape as built.';
      showHistory();
    } else if (m.type === 'error') {
      clearTimeout(slow);
      showStatus('');
      progress(1);
      setRunning(null);
      showError(m.message);
    }
  };
  worker.onerror = e => { e.preventDefault(); if (id === job) showError(e.message || 'The worker failed to start.'); };
  worker.postMessage({ type: 'build', text: st.text, maxEdges: MAX_EDGES, steps: st.steps.map(t => message(withId(t))) });
}

// how far along a step is, on a log scale from its first error to the goal
function progressOf(opt, m) {
  const [err, goal] = ['regular', 'star', 'affine', 'mean', 'stellate', 'edges', 'mix'].includes(opt) ? [Math.max(m.moved, 1e-12), 1e-8]
    : opt === 'readable' && m.err.stage === 'optimize' ? [Math.max(m.moved, 1e-12), 1e-6]
    : [Math.max(m.err.planar || 0, m.err.tangent || 0, 1e-12), 1e-6];
  // the readable optimizer changes what it measures when it starts optimizing
  if (err0 === null || m.err.stage !== stage0) { err0 = err; stage0 = m.err.stage; }
  return Math.min(0.99, Math.max(0.02, Math.log(err0 / err) / Math.log(err0 / goal)));
}

// The step a button asks for, from the fields and switches as they are now.
function stepNow(opt) {
  if (opt === 'random') return { opt, seed: 1 + Math.floor(Math.random() * 999999) };
  if (opt === 'shake') return { opt, seed: 1 + Math.floor(Math.random() * 999999), ...($('p-keep').checked ? {} : { flags: 'a' }) };
  if (opt === 'spectral') return { opt, index: Math.round(NUM($('p-spectral').value, 1, 9999, 1)), matrix: ONE($('p-matrix').value, MATRICES, 'adjacency') };
  if (opt === 'built') return { opt };
  const t = { opt };
  if (opt === 'regular') t.regularity = NUM($('p-regularity').value, 0, 1, 1);
  if (POINTED.includes(opt) || opt === 'mix') t.pointedness = NUM($('p-pointedness').value, 0, 0.5, 0.3);
  if (opt === 'mix') t.weights = Object.fromEntries(Object.entries(mixWeights).filter(([, w]) => w > 0));
  // stellate always whitens, and leaves the symmetry to the maths (pipeline.js)
  const flags = opt === 'stellate' ? undefined : flagsNow();
  if (flags) t.flags = flags;
  return t;
}
const sameStep = (a, b) => !!a && !!b && a.opt === b.opt && a.regularity === b.regularity && a.pointedness === b.pointedness
  && a.flags === b.flags && (a.opt !== 'mix' || weightsText(a) === weightsText(b));

// One button: an init starts the chain again; an optimizer runs from the current shape, or stops
// if it is the one running with the same settings; a shake moves the current shape a little.
function optimize(opt) {
  if (!worker || !mesh) return;
  const t = stepNow(opt);
  if (opt === 'mix' && !Object.keys(t.weights).length) return;
  if (running && !INSTANT.includes(opt) && sameStep(running, t)) {
    worker.postMessage({ type: 'stop' });
    return;
  }
  if (INITS.includes(opt)) {
    withId(t);
    st.steps = opt === 'built' ? [] : [t];
    worker.postMessage({ type: 'run', step: message(t) });
  } else {
    const last = st.steps.at(-1);
    // the same optimizer again, after it finished, would only confirm where it is
    if (opt !== 'shake' && sameStep(last, t) && last.it === undefined) return;
    if (st.steps.length >= MAX_STEPS) { $('mode-note').textContent = `At most ${MAX_STEPS} steps in a row; go back in the list of steps, or an init starts again.`; return; }
    st.steps.push(withId(t));
    worker.postMessage({ type: 'run', step: message(t) });
  }
  writeHash();
  showHistory();
}

// Back to the shape after step t (null: as built), at once: the worker keeps the state after every
// step it finished. The steps after t are dropped.
function goBack(t) {
  if (!worker || !mesh) return;
  const i = t ? st.steps.indexOf(t) : -1;
  if (t && !t.done) { if (running === t) worker.postMessage({ type: 'stop' }); return; }
  if (i === st.steps.length - 1 && !running) return;
  st.steps = st.steps.slice(0, i + 1);
  worker.postMessage({ type: 'goto', id: t ? t.id : 0 });
  writeHash();
  showHistory();
}

function setRunning(t) {
  running = t;
  for (const b of document.querySelectorAll('.opts button[data-opt]')) b.classList.toggle('running', !!t && b.dataset.opt === t.opt);
  showHistory();
}

const LABEL = {
  canonical: 'Canonical', readable: 'Readable', regular: 'Regular faces', star: 'Star faces', affine: 'Affine faces', mean: 'Face mean', flat: 'Flat faces',
  stellate: 'Stellate', edges: 'Equal edges', mix: 'Mix', shake: 'Shake', random: 'Random', spectral: 'Spectral', built: 'As built',
};
const MIX_LABEL = {
  flat: 'Flat', regular: 'Regular', star: 'Star', affine: 'Affine', stellate: 'Stellate', mean: 'Face mean', edges: 'Equal edges', tangent: 'Tangent edges', sphere: 'Sphere',
};
const FLAG = { c: 'centred', o: 'orthogonalised', n: 'normalised', w: 'whitened', a: 'no symmetry' };
function stepLabel(t) {
  return LABEL[t.opt] + (t.opt === 'regular' && t.regularity !== 1 ? ' ' + t.regularity : '')
    + (POINTED.includes(t.opt) && t.pointedness !== 0.3 ? ' ' + t.pointedness : '') + (t.opt === 'spectral' ? ` ${t.index} (${MATRIX[t.matrix || 'adjacency']})` : '')
    + (t.opt === 'mix' ? ' ' + TARGETS.filter(k => t.weights[k] > 0).map(k => MIX_LABEL[k].toLowerCase() + ' ' + t.weights[k]).join(', ') : '')
    + (t.flags ? ', ' + [...t.flags].map(c => FLAG[c]).join(', ') : '')
    + (t.it !== undefined ? `, stopped at ${t.it.toLocaleString('en')}` : '');
}

// The chain as a row of buttons: each goes back to the shape after it.
function showHistory() {
  const box = $('history'), list = [];
  if (!INITS.includes(st.steps[0]?.opt)) list.push(null);
  list.push(...st.steps);
  box.replaceChildren(...list.map((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t ? stepLabel(t) : 'As built';
    b.classList.toggle('current', i === list.length - 1);
    b.classList.toggle('running', !!t && running === t);
    b.title = !t || t.done ? 'Go back to the shape after this step; the steps after it are dropped' : running === t ? 'Running: click to stop it here' : 'Not run yet';
    b.addEventListener('click', () => goBack(t));
    return b;
  }));
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
function realizationNote(t, m) {
  const { it, err } = m;
  if (t && t.opt === 'random') return 'Every vertex at a random point; the faces are tangled and bent. An optimizer brings order.';
  if (t && t.opt === 'shake') return 'Every vertex moved a little at random' + (t.flags?.includes('a') ? ', the symmetry broken.' : ', the same way in every symmetric copy, so the symmetry stays.') + ' The next optimizer starts from here.';
  if (t && t.opt === 'spectral') return spectralNote(m.spectral, t.matrix);
  if (!t || !err) return 'Vertices where the operators put them; faces need not be flat.';
  const rounds = `${it.toLocaleString('en')} rounds`;
  if (t.opt === 'mean') {
    const whitened = t.flags?.includes('o') && t.flags.includes('n');
    return `${t.it !== undefined || it >= 60000 ? 'Stopped' : 'Settled'} after ${rounds}.` + (whitened ? '' : ' Without Orthogonalise and Normalise the shape tends to flatten into a plane or a line.');
  }
  if (t.opt === 'stellate') {
    const d = Math.round(m.density ?? 1), whole = Math.abs((m.density ?? 1) - d) < 0.01;
    return `${t.it !== undefined || it >= 60000 ? 'Stopped' : 'Settled'} after ${rounds}; ` + (!whole ? `its faces are not flat (density ${m.density.toFixed(2)}).`
      : d > 1 ? `it winds ${d} times round its centre: a stellation. Star faces next makes the faces regular stars.`
      : 'it winds once round its centre: no stellation. Faces without a star polygon (triangles, squares, hexagons) give it nothing to work with.');
  }
  if (['regular', 'star', 'affine', 'edges', 'mix'].includes(t.opt)) {
    // a convex face has nothing of a star in it, so the star target cannot leave a convex shape
    const hint = t.opt === 'star' && err.spread > 0.01 ? ' Star faces needs a start that is stellated already: try the spectral layouts that wind more than once.' : '';
    return `${t.it !== undefined || it >= 60000 ? 'Stopped' : 'Settled'} after ${rounds}; the copies of a vertex disagree by up to ${err.spread.toFixed(3)} edge lengths.` + hint;
  }
  if (t.opt === 'readable') {
    const readable = `edges of a face differ by up to ${err.edge.toFixed(1)}×, and every corner turns at least ${Math.round(100 * err.turn)}% of a regular one`;
    if (!err.supported) return `This shape has vertices with more than three edges and faces that are not triangles, which the readable optimizer does not handle; it ran the canonical one instead (faces flat to ${sci(err.planar)}): ${readable}.`;
    if (err.stage === 'start') return `No convex start found after ${rounds}; this is the canonical iteration so far.`;
    return `${t.it !== undefined ? 'Stopped' : 'Done'} after ${rounds}: convex, faces exactly flat; ${readable}.`;
  }
  const ok = err.planar < 1e-6 && err.tangent < 1e-6;
  const what = t.opt === 'canonical'
    ? `faces flat to ${sci(err.planar)}, edges within ${sci(err.tangent)} of the sphere`
    : `faces flat to ${sci(err.planar)}`;
  return `${ok ? 'Done' : 'Stopped'} after ${rounds}: ${what}.`;
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

const signed = x => (x < 0 ? '−' : '') + Math.abs(x).toFixed(3).replace(/\.?0+$/, '');
const MATRIX = { adjacency: 'adjacency', laplacian: 'Laplacian', vertexmean: 'vertex mean', facemean: 'face mean' };
const MATRIX_LONG = {
  adjacency: 'the adjacency matrix', laplacian: 'the Laplacian D − A',
  vertexmean: 'the vertex-mean matrix (each vertex to the mean of its neighbours)', facemean: 'the face-mean matrix (each vertex to the mean of its faces’ centres)',
};
function spectralNote(s, matrix = 'adjacency') {
  if (!s) return '';
  if (s.tooBig) return `Spectral starts need the eigenvectors of a matrix as large as the number of vertices; the page computes them for up to ${SPECTRAL_MAX.toLocaleString('en')} vertices.`;
  if (!s.count) return 'No layout from the eigenvectors shows every symmetry of this graph; the shape is unchanged.';
  const ev = s.values.map((v, i) => signed(v) + (s.dims[i] > 1 ? ` (${s.dims[i]} eigenvectors)` : '')).join(', ');
  const d = Math.round(s.density), whole = Math.abs(s.density - d) < 0.01;
  const wind = !whole ? `its faces are not flat (density ${s.density.toFixed(2)})`
    : d === 1 ? 'it winds once round its centre, as a convex shape does' : `it winds ${d} times round its centre: a stellation`;
  return `Layout ${s.index} of ${s.count}, from eigenvalue${s.values.length > 1 ? 's' : ''} ${ev} of ${MATRIX_LONG[matrix]}; symmetry ${s.group}; ${wind}. Change the number for the others.`;
}

// ---------- sharing ----------

// A link to share holds the chain, which button mashing fills with steps that undo each other. Share
// first lets a second worker look for a shorter chain that gives the same shape, up to rotation
// (pipeline.js, prune), then copies that link. A running step is stopped first, so that the link
// holds where it is.
let pruner = null, shareWanted = false;
function stopShare() {
  if (pruner) pruner.terminate();
  pruner = null;
  shareWanted = false;
}
function share() {
  if (!mesh) return;
  stopShare();
  shareWanted = true;
  if (running) { worker.postMessage({ type: 'stop' }); $('share-note').textContent = 'Stopping the running step…'; return; }
  startShare();
}
function startShare() {
  shareWanted = false;
  const steps = st.steps.map(t => ({ ...t }));
  if (steps.length <= 1) return finishShare(steps, steps.length);
  pruner = new Worker(workerURL, { type: 'module' });
  $('share-note').textContent = 'Looking for a shorter chain that gives the same shape…';
  pruner.onmessage = e => {
    const m = e.data;
    if (m.type === 'stage') $('share-note').textContent = `Looking for a shorter chain that gives the same shape: ${m.text}…`;
    else if (m.type === 'pruned') { stopShare(); finishShare(steps.filter(t => m.keep.includes(t.id)), steps.length); }
    else if (m.type === 'error') { stopShare(); finishShare(steps, steps.length); }
  };
  pruner.postMessage({ type: 'prune', text: st.text, maxEdges: MAX_EDGES, steps: steps.map(message) });
}
async function finishShare(kept, total) {
  const url = location.origin + location.pathname + '#' + hashText({ ...st, steps: kept });
  const what = !kept.length ? 'the shape as built is the same' : kept.length < total ? `${kept.length} of the ${total} steps give the same shape` : 'every step counts';
  const note = $('share-note'), a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.textContent = 'the link';
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ url, title: 'Conway polyhedra: ' + st.text });
    else await navigator.clipboard.writeText(url);
    note.replaceChildren(`Copied ${kept.length < total ? 'a shorter link' : 'the link'} (${what}): `, a, '.');
  } catch {
    note.replaceChildren(`Copy `, a, ` (${what}).`);
  }
}

// ---------- the mix ----------

// The weights of the mix as the sliders show them; only the targets in use have a slider.
let mixWeights = {};
function showMix() {
  const rows = TARGETS.filter(k => k in mixWeights).map(k => {
    const row = document.createElement('div'), name = document.createElement('span'), range = document.createElement('input');
    const value = document.createElement('span'), remove = document.createElement('button');
    row.className = 'mix-row';
    name.textContent = MIX_LABEL[k];
    range.type = 'range'; range.min = 0; range.max = 1; range.step = 0.05; range.value = mixWeights[k];
    range.setAttribute('aria-label', MIX_LABEL[k] + ' weight');
    value.textContent = (+mixWeights[k]).toFixed(2);
    range.addEventListener('input', () => { mixWeights[k] = +range.value; value.textContent = (+range.value).toFixed(2); });
    range.addEventListener('change', mixChanged);
    remove.type = 'button'; remove.textContent = '×'; remove.title = 'Take it out of the mix';
    remove.addEventListener('click', () => { delete mixWeights[k]; showMix(); mixChanged(); });
    row.append(name, range, value, remove);
    return row;
  });
  $('mix-rows').replaceChildren(...rows);
  $('mix-add').replaceChildren(...TARGETS.filter(k => !(k in mixWeights)).map(k => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = '+ ' + MIX_LABEL[k];
    b.addEventListener('click', () => { mixWeights[k] = 1; showMix(); mixChanged(); });
    return b;
  }));
}
// While a mix runs, or was the last step, a changed weight runs the new mix on from the shape
// as it is, so a slider can be played with; the step before is kept, stopped where it was.
function mixChanged() {
  const t = running || st.steps.at(-1);
  if (t?.opt === 'mix' && Object.values(mixWeights).some(w => w > 0)) optimize('mix');
}
// The weights that do what the last optimizer did, to start a mix from.
function mixFromLast() {
  const t = st.steps.filter(t => !INSTANT.includes(t.opt)).at(-1);
  if (!t) return;
  const r = x => Math.round(20 * x) / 20;
  const w = t.opt === 'mix' ? { ...t.weights }
    : t.opt === 'regular' ? (t.regularity >= 1 ? { regular: 1 } : t.regularity <= 0 ? { flat: 1 } : { regular: r(t.regularity), flat: r(1 - t.regularity) })
    : t.opt === 'canonical' ? { tangent: 1, flat: 1 }
    : TARGETS.includes(t.opt) ? { [t.opt]: 1 } : null;
  if (!w) { $('mode-note').textContent = `${LABEL[t.opt]} has no counterpart in the mix.`; return; }
  mixWeights = w;
  if (t.pointedness !== undefined) $('p-pointedness').value = t.pointedness;
  showMix();
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

// A new polyhedron starts as built: the chain belongs to the old one.
function setText(t) {
  st.text = t.replace(/\s+/g, '');
  st.steps = [];
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
  $('p-material').value = st.material;
  $('p-palette').value = st.palette;
  for (const id of ['hue-param', 'chroma-param']) $(id).classList.toggle('hidden', st.palette !== 'generated');
  $('p-style').value = st.style;
  $('p-colouring').value = st.colouring;
  $('p-hue').value = st.hue; $('v-hue').textContent = st.hue + '°';
  $('p-chroma').value = st.chroma; $('v-chroma').textContent = st.chroma.toFixed(2);
  $('p-edge').value = st.edge; $('v-edge').textContent = st.edge.toFixed(2);
  $('p-lines').value = st.lines;
  $('p-depthwidth').value = st.depthWidth; $('v-depthwidth').textContent = st.depthWidth ? st.depthWidth.toFixed(2) : 'off';
  $('p-hidden').value = st.hidden; $('v-hidden').textContent = st.hidden ? st.hidden.toFixed(2) : 'off';
  $('depthwidth-param').classList.toggle('hidden', st.lines === 'painted');
  // hidden lines are known only to the drawn ones, and solid faces cover them
  $('hidden-param').classList.toggle('hidden', st.lines !== 'drawn');
  $('p-hidden').disabled = st.style === 'solid';
  $('p-ink').value = st.ink;
  $('p-fov').value = st.fov; $('v-fov').textContent = st.fov + '°';
  $('p-orient').value = [...$('p-orient').options].some(o => o.value === st.orient) ? st.orient : 'free';
  $('p-ground').value = st.ground;
  $('p-lift').value = st.lift; $('v-lift').textContent = st.lift ? st.lift.toFixed(2) : 'on it';
  $('p-lift').disabled = st.ground === 'none';
  $('p-elev').value = st.elev; $('v-elev').textContent = st.elev + '°';
  $('p-light').value = st.light;
  $('p-bg').value = background();
  $('stage').style.background = stageBackground();
  $('p-spin').checked = st.spin;
  // the hue means nothing without chroma
  $('p-hue').disabled = st.chroma === 0;
  viewer.set({
    style: st.style, material: st.material, colouring: st.colouring, palette: currentPalette(),
    orient: st.orient, ground: st.ground, lift: st.lift, elev: st.elev, azim: st.azim, light: st.light, stage: stageBackground(),
    edge: st.edge, lines: st.lines, depthWidth: st.depthWidth, hidden: st.hidden, ink: st.ink, fov: st.fov, spin: st.spin,
    dark: background() === 'dark',
  });
  showSwatches();
}

// The symmetric views of the shape for the orientation menu: "5-fold, on a pentagon". A view the
// link asked for that this shape does not have falls back to free.
const POLYGONS = { 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon', 12: 'dodecagon' };
function showViews(views = []) {
  const sel = $('p-orient');
  const name = w => w.kind === 'f' ? `a ${POLYGONS[w.sides] || w.sides + '-gon'}` : w.kind === 'v' ? 'a vertex' : 'an edge';
  const labels = views.map(w => `${w.order > 1 ? w.order + '-fold, on ' : 'On '}${name(w)}`);
  sel.replaceChildren(new Option('Free', 'free'), ...views.map((w, i) => {
    // the same label twice (two orbits of pentagons on 5-fold axes) gets a number
    const same = labels.filter(l => l === labels[i]).length > 1 ? ` (${labels.slice(0, i + 1).filter(l => l === labels[i]).length})` : '';
    return new Option(labels[i] + same, w.key);
  }));
  if (st.orient !== 'free' && !views.some(w => w.key === st.orient)) { st.orient = 'free'; writeHash(); }
  showLook();
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
  look('p-palette', 'palette', el => {
    // a fresh custom palette starts from what is shown
    if (el.value === 'custom' && !st.custom.length) st.custom = paletteHex({ ...st, palette: st.palette }, Math.min(MAX_SWATCHES, viewer.classes())).slice();
    return el.value;
  });
  look('p-colouring', 'colouring', el => el.value);
  look('p-hue', 'hue', el => +el.value);
  look('p-chroma', 'chroma', el => +el.value);
  look('p-edge', 'edge', el => +el.value);
  look('p-lines', 'lines', el => el.value);
  look('p-depthwidth', 'depthWidth', el => +el.value);
  look('p-hidden', 'hidden', el => +el.value);
  look('p-ink', 'ink', el => el.value);
  look('p-fov', 'fov', el => +el.value);
  look('p-orient', 'orient', el => el.value);
  look('p-ground', 'ground', el => el.value);
  look('p-lift', 'lift', el => +el.value);
  look('p-elev', 'elev', el => +el.value);
  look('p-light', 'light', el => el.value);
  look('p-bg', 'bg', el => el.value);
  look('p-spin', 'spin', el => el.checked);
}

// ---------- wiring ----------

buildPickers();
bindLook();
// the theme toggle lives in the page; the scene follows it until a background is chosen
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
for (const b of document.querySelectorAll('.opts button[data-opt]')) b.addEventListener('click', () => optimize(b.dataset.opt));
$('p-regularity').addEventListener('keydown', e => { if (e.key === 'Enter') optimize('regular'); });
$('p-pointedness').addEventListener('keydown', e => { if (e.key === 'Enter') optimize('star'); });
// stepping the number browses the spectral starts; touch screens show no arrows on number fields,
// hence the buttons
$('p-spectral').addEventListener('change', () => optimize('spectral'));
const stepSpectral = d => { $('p-spectral').value = Math.max(1, Math.round(NUM($('p-spectral').value, 1, 9999, 1)) + d); optimize('spectral'); };
$('spectral-prev').addEventListener('click', () => stepSpectral(-1));
$('spectral-next').addEventListener('click', () => stepSpectral(1));
$('shareBtn').addEventListener('click', share);
$('mix-from').addEventListener('click', mixFromLast);
// another matrix has another list, which starts again from its smoothest layout
$('p-matrix').addEventListener('change', () => { $('p-spectral').value = 1; optimize('spectral'); });
$('swatch-add').addEventListener('click', () => {
  st.custom = [...paletteNow(), paletteNow().at(-1)];
  showLook(); writeHash();
});
$('swatch-remove').addEventListener('click', () => {
  st.custom = paletteNow().slice(0, -1);
  showLook(); writeHash();
});

$('randomBtn').addEventListener('click', () => setText(randomText()));
$('resetBtn').addEventListener('click', () => viewer.resetView());

const fileName = ext => `polyhedron-${st.text}.${ext}`;
// The scene's background: chosen, or else the theme's. The scene does not change with the theme
// once a background is chosen.
function background() { return st.bg || (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'); }
function stageBackground() { return background() === 'dark' ? '#0f0f10' : '#ffffff'; }
$('saveBtn').addEventListener('click', () => {
  $('canvas').toBlob(b => b && download(b, fileName('png')), 'image/png');
});
// RT: while on, the view path-traces the scene when it is still; the note says how far it has got
$('rtToggle').addEventListener('change', async () => {
  const on = $('rtToggle').checked;
  $('traceNote').textContent = on ? 'loading the path tracer…' : '';
  await viewer.setTrace(on);
  viewer.setDenoise($('p-denoise').checked);
});
viewer.onTrace = n => { $('traceNote').textContent = viewer.tracing ? (n === null ? 'rendering when still' : `${n} samples`) : ''; };
$('p-denoise').addEventListener('change', () => viewer.setDenoise($('p-denoise').checked));
$('exportBtn').addEventListener('click', async () => {
  const want = +$('p-size').value, max = viewer.maxExport();
  const size = Math.min(want, max);
  const btn = $('exportBtn'), label = btn.textContent, samples = +$('p-samples').value;
  btn.disabled = true;
  try {
    const blob = await viewer.snapshot(size, $('p-transparent').checked ? null : stageBackground(), {
      samples, onProgress: n => { btn.textContent = `${n} / ${samples}`; },
    });
    if (blob) download(blob, fileName('png'));
    else alert('The browser could not make an image this large.');
    if (size < want) alert(`This graphics card renders at most ${max} × ${max}; saved at that size.`);
  } finally { btn.disabled = false; btn.textContent = label; }
});
$('objBtn').addEventListener('click', () => { if (mesh) download(obj(mesh, positions, st.text), fileName('obj')); });
$('stlBtn').addEventListener('click', () => { if (mesh) download(stl(mesh, positions), fileName('stl')); });
$('blendBtn').addEventListener('click', () => {
  if (!mesh) return;
  const py = blenderScene(viewer, {
    size: +$('p-size').value, samples: +$('p-samples').value, denoise: $('p-denoise').checked,
    transparent: $('p-transparent').checked, title: st.text,
  });
  download(new Blob([py], { type: 'text/x-python' }), fileName('py'));
});

st = readHash() || sanitize({});
// the regularity field starts at the last value used
$('p-regularity').value = st.steps.filter(t => t.opt === 'regular').at(-1)?.regularity ?? 1;
$('p-pointedness').value = st.steps.filter(t => t.opt === 'star').at(-1)?.pointedness ?? 0.3;
$('p-spectral').value = st.steps.find(t => t.opt === 'spectral')?.index ?? 1;
// the switches and the mix start as the last step left them
{
  const t = st.steps.filter(t => !INSTANT.includes(t.opt) && t.opt !== 'stellate').at(-1);
  $('p-whiten').checked = !!t?.flags?.includes('w');
  $('p-keep').checked = !t?.flags?.includes('a');
  const mix = st.steps.filter(t => t.opt === 'mix').at(-1);
  if (mix) mixWeights = { ...mix.weights };
  if (POINTED.some(k => st.steps.at(-1)?.opt === k || mix?.weights[k])) $('p-pointedness').value = (POINTED.includes(st.steps.at(-1)?.opt) ? st.steps.at(-1) : mix).pointedness ?? 0.3;
  showMix();
}
$('p-matrix').value = st.steps.find(t => t.opt === 'spectral')?.matrix ?? 'adjacency';
showLook();
$('p-notation').value = st.text;
run();
