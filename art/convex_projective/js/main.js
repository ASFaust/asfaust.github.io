import { generators, mmul } from './flags.js';
import { chart, traverse, polar, hilbert, bases } from './draw.js';
import { PRESETS } from './presets.js';

const $ = id => document.getElementById(id);

// ---------- state ----------

// the eight coordinates, as logarithms: t1, t2, then each edge's tail and head (see flags.js)
const COORDS = [
  { key: 't1', label: 'T1, triple ratio' },
  { key: 't2', label: 'T2, triple ratio' },
  { key: 'e1t', label: 'Edge e1, at 0' },
  { key: 'e1h', label: 'Edge e1, at ∞' },
  { key: 'e2t', label: 'Edge e2, at 1' },
  { key: 'e2h', label: 'Edge e2, at 0' },
  { key: 'e3t', label: 'Edge e3, at ∞' },
  { key: 'e3h', label: 'Edge e3, at 1' },
];
const LOG_MAX = 3;

const DEFAULTS = {
  x: [0, 0, 0, 0, 0, 0, 0, 0], cusp: true, scale: 1,
  curve: true, edges: true, fill: 'type', tile: 2, hilbert: false, hstep: 0.25,
  eps: 0.5, lw: 1, bg: 'auto', size: 2048, view: null,
};
const FILLS = ['type', 'quarter', 'depth', 'none'];
let st = structuredClone(DEFAULTS);

const NUM = (v, lo, hi, d) => (v !== '' && v !== null && v !== undefined && isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);

function sanitize(s) {
  const x = Array.isArray(s.x) && s.x.length === 8 ? s.x.map(v => NUM(v, -LOG_MAX, LOG_MAX, 0)) : DEFAULTS.x.slice();
  return {
    x, cusp: s.cusp !== false, scale: NUM(s.scale, 0, 4, 1),
    curve: s.curve !== false, edges: s.edges !== false,
    fill: FILLS.includes(s.fill) ? s.fill : DEFAULTS.fill,
    tile: NUM(s.tile, 1, 40, DEFAULTS.tile), hilbert: !!s.hilbert, hstep: NUM(s.hstep, 0.05, 1, DEFAULTS.hstep),
    eps: NUM(s.eps, 0.1, 4, DEFAULTS.eps), lw: NUM(s.lw, 0.25, 4, 1),
    bg: ['auto', 'light', 'dark'].includes(s.bg) ? s.bg : 'auto',
    size: [1024, 2048, 4096].includes(+s.size) ? +s.size : DEFAULTS.size,
    view: s.view && [s.view.cx, s.view.cy, s.view.half].every(isFinite) && s.view.half > 0 ? s.view : null,
  };
}

// With the cusp kept, t2 = 1/t1 and the last edge ratio is the inverse of the other five.
function constrain() {
  if (!st.cusp) return;
  const x = st.x;
  x[1] = -x[0];
  x[7] = -(x[2] + x[3] + x[4] + x[5] + x[6]);
}

function coords() {
  const e = st.x.map(v => Math.exp(v * st.scale));
  return { t1: e[0], t2: e[1], e1: [e[2], e[3]], e2: [e[4], e[5]], e3: [e[6], e[7]] };
}

const r4 = v => +(+v).toFixed(4);
function writeHash() {
  const parts = ['x=' + st.x.map(r4).join(',')];
  if (!st.cusp) parts.push('cusp=0');
  if (st.scale !== 1) parts.push('s=' + st.scale);
  if (!st.curve) parts.push('curve=0');
  if (!st.edges) parts.push('edges=0');
  if (st.fill !== DEFAULTS.fill) parts.push('fill=' + st.fill);
  if (st.tile !== DEFAULTS.tile) parts.push('tile=' + st.tile);
  if (st.hilbert) parts.push('hb=1');
  if (st.hstep !== DEFAULTS.hstep) parts.push('hs=' + st.hstep);
  if (st.eps !== DEFAULTS.eps) parts.push('eps=' + st.eps);
  if (st.lw !== 1) parts.push('lw=' + st.lw);
  if (st.bg !== 'auto') parts.push('bg=' + st.bg);
  if (st.size !== DEFAULTS.size) parts.push('size=' + st.size);
  if (st.view) parts.push('v=' + [st.view.cx, st.view.cy, st.view.half].map(v => +v.toPrecision(10)).join(','));
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
  const v = q.v ? q.v.split(',').map(Number) : null;
  return sanitize({
    x: q.x ? q.x.split(',').map(Number) : null, cusp: q.cusp !== '0', scale: q.s,
    curve: q.curve !== '0', edges: q.edges !== '0', fill: q.fill, tile: q.tile, hilbert: q.hb === '1', hstep: q.hs,
    eps: q.eps, lw: q.lw, bg: q.bg, size: q.size,
    view: v && v.length === 3 ? { cx: v[0], cy: v[1], half: v[2] } : null,
  });
}

// ---------- the geometry of the current coordinates ----------

let geo = null; // { key, c, N, B, r, fitHalf, gens }

function geometry() {
  const c = coords();
  const key = JSON.stringify(c);
  if (geo && geo.key === key) return geo;
  const N = chart(c), B = bases(c), r = polar(c, N, 4096, B);
  let rmax = 0;
  for (const v of r) rmax = Math.max(rmax, v);
  geo = { key, c, N, B, r, fitHalf: rmax * 1.06, gens: generators(c) };
  return geo;
}

// eigenvalues of a 3×3 matrix with real eigenvalues, largest absolute value first
function eig3(M) {
  const tr = M[0][0] + M[1][1] + M[2][2];
  const c2 = M[0][0] * M[1][1] - M[0][1] * M[1][0] + M[0][0] * M[2][2] - M[0][2] * M[2][0] + M[1][1] * M[2][2] - M[1][2] * M[2][1];
  const det = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  // λ³ − tr λ² + c2 λ − det, depressed by λ = μ + tr/3
  const p = c2 - tr * tr / 3, q = -2 * tr ** 3 / 27 + tr * c2 / 3 - det;
  if (p >= 0) return null;
  const m = 2 * Math.sqrt(-p / 3), arg = 3 * q / (p * m);
  if (Math.abs(arg) > 1 + 1e-9) return null;
  const th = Math.acos(Math.max(-1, Math.min(1, arg))) / 3;
  const ls = [0, 1, 2].map(k => m * Math.cos(th - 2 * Math.PI * k / 3) + tr / 3);
  return ls.sort((a, b) => Math.abs(b) - Math.abs(a));
}

// Hilbert translation length ½ log(λ₁ / λ₃)
function hlen(M) {
  const l = eig3(M);
  return l ? 0.5 * Math.log(Math.abs(l[0] / l[2])) : NaN;
}

// ---------- drawing ----------

const THEMES = {
  light: {
    bg: '#ffffff', ink: '#1a1a1a', edge: 'rgba(26, 26, 26, 0.5)',
    types: ['#c8d5f3', '#f4d3c7'],
    quarters: ['#c8d5f3', '#f4d3c7', '#cfe8d8', '#e6d3f0', '#eeeeee'],
    ramp: ['#1d3b8f', '#1f8a9a', '#4a9f4a', '#d9822b', '#c0392b'],
    balls: [[246, 246, 248], [229, 233, 243]], ring: [120, 128, 150],
  },
  dark: {
    bg: '#0f0f10', ink: '#e8e8e8', edge: 'rgba(232, 232, 232, 0.45)',
    types: ['#1f2d52', '#4d2722'],
    quarters: ['#1f2d52', '#4d2722', '#1e4231', '#3d2650', '#222226'],
    ramp: ['#7aa2ff', '#4fd1c5', '#a3e36a', '#ffc857', '#ff6b6b'],
    balls: [[24, 24, 28], [36, 42, 60]], ring: [150, 165, 205],
  },
};

function hex(c) { return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); }
function rampColor(stops, t) {
  const x = Math.min(stops.length - 1.0001, Math.max(0, t * (stops.length - 1)));
  const i = Math.floor(x), f = x - i;
  const a = hex(stops[i]), b = hex(stops[i + 1]);
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(',')})`;
}

// a colour 'rgb(…)' or '#rrggbb' moved towards the colour b by f
function mix(a, b, f) {
  const p = c => c[0] === '#' ? hex(c) : c.match(/\d+/g).map(Number);
  const x = p(a), y = p(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * f)).join(',')})`;
}

function themeName() {
  if (st.bg !== 'auto') return st.bg;
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

// Draws the picture on a square context of side px, for the view; detail: multiplies ε and the
// smallest triangle, for quick previews. Returns the statistics of the search.
function paint(ctx, px, view, detail = 1) {
  const g = geometry();
  const pal = THEMES[themeName()];
  const k = px / (2 * view.half), x0 = view.cx - view.half, y0 = view.cy + view.half;
  const toScreen = (x, y) => [(x - x0) * k, (y0 - y) * k];
  const unit = px / 1000; // line widths are given for a 1000 px picture
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, px, px);

  const segs = [], tris = [];
  const wantTris = st.edges || st.fill !== 'none';
  const res = traverse(g.c, g.N, toScreen,
    { eps: st.eps * unit * detail, minTile: st.tile * unit * detail, sliver: 0.02 * unit * detail, w: px, h: px },
    (a, b, c, d) => segs.push(a, b, c, d),
    wantTris ? (xs, depth, type, q) => tris.push(xs, depth + 1, type, q) : null, g.B);
  // the two triangles of the fundamental domain, T1 = (∞, −1, 0) and T2 = (0, 1, ∞), at depth 0
  if (wantTris) {
    const [s0, s1, si, sm] = [g.B[1].pL, g.B[2].pR, g.B[1].pR, g.B[0].pM].map(p => proj(g.N, p, toScreen));
    tris.push([...si, ...sm, ...s0], 0, 0, 4, [...s0, ...s1, ...si], 0, 1, 4);
  }

  if (st.fill !== 'none' && tris.length) {
    const color = st.fill === 'type' ? (d, t) => pal.types[t]
      : st.fill === 'quarter' ? (d, t, q) => pal.quarters[q]
        : d => mix(rampColor(pal.ramp, Math.min(1, Math.log(d + 1) / Math.log(40))), pal.bg, 0.4);
    for (let i = 0; i < tris.length; i += 4) {
      const xs = tris[i];
      ctx.fillStyle = color(tris[i + 1], tris[i + 2], tris[i + 3]);
      ctx.beginPath();
      ctx.moveTo(xs[0], xs[1]); ctx.lineTo(xs[2], xs[3]); ctx.lineTo(xs[4], xs[5]);
      ctx.closePath();
      ctx.fill();
      // a hairline in the same colour closes the seams between neighbours
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }
  // the balls go on the fills as rings, or shade the bare domain as bands
  if (st.hilbert) paintBalls(ctx, px, view, g, pal, detail, st.fill === 'none' || !tris.length);
  if (st.edges && tris.length) {
    ctx.strokeStyle = pal.edge;
    ctx.lineWidth = 0.6 * st.lw * unit;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < tris.length; i += 4) {
      const xs = tris[i];
      ctx.moveTo(xs[0], xs[1]); ctx.lineTo(xs[2], xs[3]); ctx.lineTo(xs[4], xs[5]);
      if (tris[i + 1] === 0) ctx.lineTo(xs[0], xs[1]);
    }
    ctx.stroke();
  }
  if (st.curve) {
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1.4 * st.lw * unit;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < segs.length; i += 4) {
      // consecutive segments share their ends
      if (i === 0 || segs[i] !== segs[i - 2] || segs[i + 1] !== segs[i - 1]) ctx.moveTo(segs[i], segs[i + 1]);
      ctx.lineTo(segs[i + 2], segs[i + 3]);
    }
    ctx.stroke();
  }
  return { ...res, segs: segs.length / 4, tris: tris.length / 4 };
}

function proj(N, p, toScreen) {
  const q = [0, 1, 2].map(i => N[i][0] * p[0] + N[i][1] * p[1] + N[i][2] * p[2]);
  return toScreen(q[0] / q[2], q[1] / q[2]);
}

// bands of the Hilbert distance from the centre, alternating, each edged by a ring about a pixel
// wide; without the bands, only the rings, translucent
function paintBalls(ctx, px, view, g, pal, detail, bands) {
  const step = detail > 1 ? 2 : 1;
  const n = Math.ceil(px / step);
  const img = new ImageData(n, n);
  const k = 2 * view.half / px * step, x0 = view.cx - view.half, y0 = view.cy + view.half;
  const [A, B] = pal.balls, R = pal.ring, data = img.data;
  const width = 0.6 * Math.max(1, px / 1000) / step * st.lw; // half the ring width, in this image's pixels
  let prev = new Float64Array(n + 1), row = new Float64Array(n + 1);
  for (let j = 0; j <= n; j++) {
    const y = y0 - (j - 0.5) * k;
    for (let i = 0; i <= n; i++) row[i] = hilbert(g.r, x0 + (i - 0.5) * k, y) / st.hstep;
    if (j > 0) for (let i = 1; i <= n; i++) {
      const f = row[i];
      if (!isFinite(f)) continue;
      // the distance to the nearest ring, in pixels, from the gradient
      const gx = f - row[i - 1], gy = f - prev[i];
      const grad = isFinite(gx) && isFinite(gy) ? Math.hypot(gx, gy) : Infinity;
      const near = Math.abs(f - Math.round(f)) / grad;
      const a = Math.round(f) > 0 ? Math.max(0, Math.min(1, width + 0.5 - near)) : 0;
      const o = 4 * ((j - 1) * n + i - 1);
      if (bands) {
        const C = Math.floor(f) & 1 ? B : A;
        for (let c = 0; c < 3; c++) data[o + c] = C[c] + (R[c] - C[c]) * a;
        data[o + 3] = 255;
      } else if (a > 0) {
        data[o] = R[0]; data[o + 1] = R[1]; data[o + 2] = R[2]; data[o + 3] = 170 * a;
      }
    }
    [prev, row] = [row, prev];
  }
  const off = new OffscreenCanvas(n, n);
  off.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, 0, 0, px, px);
}

// ---------- the view ----------

const stage = $('stage'), canvas = $('canvas'), ctx = canvas.getContext('2d');

function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const css = stage.clientWidth || 600;
  const px = Math.min(2400, Math.round(css * dpr));
  if (canvas.width !== px || canvas.height !== px) { canvas.width = px; canvas.height = px; }
  return px;
}

const currentView = () => st.view || { cx: 0, cy: 0, half: geometry().fitHalf };

let frame = 0, interactive = false, settleTimer = 0;
function draw() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const t0 = performance.now();
    let res;
    try {
      res = paint(ctx, sizeCanvas(), currentView(), interactive ? 3 : 1);
      $('status').style.display = 'none';
    } catch (e) {
      $('status').textContent = 'Could not draw: ' + e.message;
      $('status').style.display = 'flex';
      return;
    }
    showStats(res, performance.now() - t0);
  });
}

// a quick preview while something moves, then the full picture
function touch() {
  interactive = true;
  draw();
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => { interactive = false; draw(); writeHash(); }, 180);
}

function showStats(res, ms) {
  const { gens } = geometry();
  const { a, b, A, B } = gens;
  const per = mmul(mmul(A, B), mmul(a, b));
  const lp = eig3(per);
  let cusp = 'cusp';
  if (lp && Math.abs(Math.log(Math.abs(lp[0] / lp[2]))) > 1e-6) cusp = `hole of length ${hlen(per).toFixed(3)}`;
  const parts = [
    `ℓ(a) ${hlen(a).toFixed(3)}`, `ℓ(b) ${hlen(b).toFixed(3)}`, `ℓ(ab) ${hlen(mmul(a, b)).toFixed(3)}`, cusp,
    `${res.tris.toLocaleString()} triangles`, `${Math.round(ms)} ms`,
  ];
  if (res.truncated) parts.push('cut short');
  $('stats').textContent = parts.join(' · ');
  $('stats').title = 'Hilbert translation lengths ½ log(λ₁/λ₃) of a, b and ab, and the puncture';
}

function fit() { st.view = null; draw(); writeHash(); }

// pan and zoom: drag, wheel, pinch
const pointers = new Map();
let pinch = null;
const local = e => { const r = stage.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
function zoomAt(u, v, f) {
  const vw = { ...currentView() };
  const x = vw.cx - vw.half + 2 * vw.half * u, y = vw.cy + vw.half - 2 * vw.half * v;
  vw.half = Math.min(50, Math.max(1e-7, vw.half * f));
  vw.cx = x - (2 * u - 1) * vw.half;
  vw.cy = y + (2 * v - 1) * vw.half;
  st.view = vw;
}
stage.addEventListener('wheel', e => {
  e.preventDefault();
  const [u, v] = local(e);
  zoomAt(u, v, Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
  touch();
}, { passive: false });
stage.addEventListener('pointerdown', e => {
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, local(e));
  stage.classList.add('dragging');
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
});
stage.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId), cur = local(e);
  pointers.set(e.pointerId, cur);
  const vw = { ...currentView() };
  if (pointers.size === 1) {
    vw.cx -= (cur[0] - prev[0]) * 2 * vw.half;
    vw.cy += (cur[1] - prev[1]) * 2 * vw.half;
    st.view = vw;
    touch();
  } else if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, pinch / d);
    pinch = d;
    touch();
  }
});
function endPointer(e) {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) stage.classList.remove('dragging');
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('dblclick', fit);

// ---------- controls ----------

const fmt = v => {
  const e = Math.exp(v);
  return e >= 100 || e < 0.01 ? e.toExponential(1) : e.toPrecision(3);
};

const sliders = [];
function buildCoords() {
  const box = $('coords');
  COORDS.forEach((c, i) => {
    const div = document.createElement('div');
    div.className = 'param';
    div.innerHTML = `<label for="p-${c.key}"><span>${c.label}</span><span id="v-${c.key}"></span></label>
      <input type="range" id="p-${c.key}" min="${-LOG_MAX}" max="${LOG_MAX}" step="0.01">`;
    box.appendChild(div);
    const input = div.querySelector('input');
    input.addEventListener('input', () => {
      st.x[i] = +input.value;
      constrain();
      $('p-preset').value = '';
      $('presetNote').textContent = '';
      syncCoords();
      touch();
    });
    input.addEventListener('dblclick', () => { st.x[i] = 0; constrain(); syncCoords(); touch(); });
    sliders.push(input);
  });
}

function syncCoords() {
  COORDS.forEach((c, i) => {
    const locked = st.cusp && (i === 1 || i === 7);
    sliders[i].value = st.x[i];
    sliders[i].disabled = locked;
    $('v-' + c.key).textContent = fmt(st.x[i] * st.scale);
  });
}

function syncControls() {
  syncCoords();
  $('p-cusp').checked = st.cusp;
  $('p-scale').value = st.scale; $('v-scale').textContent = st.scale.toFixed(2);
  $('p-curve').checked = st.curve;
  $('p-edges').checked = st.edges;
  $('p-fill').value = st.fill;
  $('p-tile').value = st.tile; $('v-tile').textContent = st.tile;
  $('p-hilbert').checked = st.hilbert;
  $('p-hstep').value = st.hstep; $('v-hstep').textContent = st.hstep.toFixed(2);
  $('p-hstep').disabled = !st.hilbert;
  $('p-eps').value = st.eps; $('v-eps').textContent = st.eps.toFixed(2);
  $('p-lw').value = st.lw; $('v-lw').textContent = st.lw.toFixed(2);
  $('p-bg').value = st.bg;
  $('p-size').value = st.size;
}

function bindRange(id, key, label = v => v) {
  $(id).addEventListener('input', () => {
    st[key] = +$(id).value;
    syncControls();
    touch();
  });
}
function bindCheck(id, key, then) {
  $(id).addEventListener('change', () => { st[key] = $(id).checked; if (then) then(); syncControls(); draw(); writeHash(); });
}
function bindSelect(id, key, num) {
  $(id).addEventListener('change', () => { st[key] = num ? +$(id).value : $(id).value; syncControls(); draw(); writeHash(); });
}

function loadPreset(i) {
  const p = PRESETS[i];
  if (!p) return;
  // the preset's settings, on the defaults, keeping only the look of the lines and the background
  st = sanitize({ ...DEFAULTS, eps: st.eps, lw: st.lw, bg: st.bg, size: st.size, ...p.state, view: null });
  constrain();
  $('presetNote').textContent = p.note || '';
  syncControls();
  draw();
  writeHash();
}

function init() {
  buildCoords();
  const sel = $('p-preset');
  sel.innerHTML = '<option value="">Choose an example…</option>' + PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
  sel.addEventListener('change', () => { if (sel.value !== '') loadPreset(+sel.value); });

  $('p-cusp').addEventListener('change', () => { st.cusp = $('p-cusp').checked; constrain(); syncControls(); draw(); writeHash(); });
  bindRange('p-scale', 'scale');
  bindCheck('p-curve', 'curve');
  bindCheck('p-edges', 'edges');
  bindSelect('p-fill', 'fill');
  bindRange('p-tile', 'tile');
  bindCheck('p-hilbert', 'hilbert');
  bindRange('p-hstep', 'hstep');
  bindRange('p-eps', 'eps');
  bindRange('p-lw', 'lw');
  bindSelect('p-bg', 'bg');
  bindSelect('p-size', 'size', true);

  $('fitBtn').addEventListener('click', fit);
  $('resetBtn').addEventListener('click', () => {
    st.x = DEFAULTS.x.slice(); st.scale = 1; st.view = null;
    $('p-preset').value = ''; $('presetNote').textContent = '';
    syncControls(); draw(); writeHash();
  });
  $('randBtn').addEventListener('click', () => {
    st.x = st.x.map(() => +((Math.random() * 2 - 1) * 1.5).toFixed(2));
    constrain();
    st.view = null;
    $('p-preset').value = ''; $('presetNote').textContent = '';
    syncControls(); draw(); writeHash();
  });
  $('saveBtn').addEventListener('click', save);

  document.addEventListener('themechange', draw);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  new ResizeObserver(draw).observe(stage);
  window.addEventListener('hashchange', () => {
    const s = parseHash(location.hash);
    if (s) { st = s; constrain(); syncControls(); draw(); }
  });

  const s = parseHash(location.hash);
  if (s) st = s;
  else { const p = PRESETS[0]; st = sanitize({ ...DEFAULTS, ...p.state }); $('p-preset').value = '0'; $('presetNote').textContent = p.note || ''; }
  constrain();
  syncControls();
  draw();
}

function save() {
  const px = st.size;
  const off = document.createElement('canvas');
  off.width = off.height = px;
  // the same view, at the saved size
  paint(off.getContext('2d'), px, currentView());
  off.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'convex-projective.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}

init();
