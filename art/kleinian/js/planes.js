// Two maps of trace space: the plane of tr a with tr b held fixed, and the plane of tr b with
// tr a held fixed. Each is shaded by a numerical discreteness test (probe.js) under the current
// group settings: the shaded region is where the search closes up, darker towards its edge,
// where the limit sets are most intricate. With tr b = 2 the tr a plane is the Maskit slice,
// and its exact edge, the cusp groups p/q (cusps.js), is drawn on top.
// Horizontal axis: Im, vertical axis: Re (increasing upwards).
//
// The shading lives on a quadtree of cells fixed in the plane: level L has square cells of side
// 2^−L, cell (i, j) covering Im ∈ [i, i+1)·2^−L and Re ∈ [j, j+1)·2^−L. Results are cached, so
// panning only computes the strip that comes into view and zooming reuses the coarser cells.
// A view is computed at about COARSE_PX per cell, then only cells on an edge (valid next to
// invalid, or a steep change in the shading) are split, level by level, down to about FINE_PX.

import { boundary } from './cusps.js';

const SNAP_PX = 7;           // cusp snapping radius, CSS px
const MARKER_PX = 10;        // grab radius of the marker, CSS px
const COARSE_PX = 12, FINE_PX = 1.5;
const TASK_CELLS = 96;
const MAX_HALF = 60, MIN_HALF = 1e-7;
const SHADE_STEP = 0.3;      // split cells whose log node count differs from a neighbour by more
const MAX_CACHE = 400000;
export const PROBE_OPTS = { eps: 0.04, maxNodes: 8000, levmax: 120, growth: 5.5 };

// ---------- worker pool for the probes, shared by both planes ----------

class ProbePool {
  constructor(url, n = 3) {
    this.queue = [];
    this.workers = [];
    this.handlers = {};
    for (let i = 0; i < n; i++) {
      const w = new Worker(url, { type: 'module' });
      w.busy = false;
      w.onmessage = e => {
        w.busy = false;
        const m = e.data;
        if (m.type === 'probed' && this.handlers[m.task.plane]) this.handlers[m.task.plane](m.task, m.counts);
        this.pump();
      };
      w.onerror = e => { e.preventDefault(); w.busy = false; this.pump(); };
      this.workers.push(w);
    }
  }
  // replace all queued work of one plane
  submit(plane, tasks) {
    this.queue = this.queue.filter(t => t.plane !== plane).concat(tasks);
    this.queue.sort((a, b) => a.order - b.order); // coarse stages of both planes first
    this.pump();
  }
  pump() {
    for (const w of this.workers) {
      if (w.busy || !this.queue.length) continue;
      const task = this.queue.shift();
      w.busy = true;
      w.postMessage({ type: 'probe', id: 0, task }, [task.points.buffer]);
    }
  }
}

let pool = null;
export function initProbes(workerURL) { pool = new ProbePool(workerURL); }

const key = (L, i, j) => L + ',' + i + ',' + j;

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

// ---------- one plane ----------

export class TracePlane {
  constructor(canvas, { which, base, onPick, onHover }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.which = which;               // 'a' or 'b'
    this.base = { ...base };          // default window { re, im, half }: half = half the width
    this.win = { ...base };
    this.onPick = onPick;
    this.onHover = onHover;
    this.value = [2, 0];              // the trace this plane chooses
    this.other = [2, 0];              // the other trace, held fixed
    this.group = { nonfree: false, altroot: false, neck: true };
    this.depKey = '';                 // what the cached counts depend on
    this.cache = new Map();           // 'L,i,j' → node count (−1: not discrete)
    this.gen = 0;
    this.stage = null;                // { gen, L, Lc, Lf, pending }
    this.cuspCache = new Map();
    this.mode = null;                 // 'pan' | 'point' | 'pinch' while a pointer is down
    this.tint = document.createElement('canvas');
    pool.handlers[which] = (task, counts) => this.receive(task, counts);
    this.bind();
  }

  // value: this plane's trace; other: the fixed one. recompute: refresh the shading if needed.
  set({ value, other, group }, recompute = true) {
    if (value) this.value = value;
    if (other) this.other = other;
    if (group) this.group = { ...group };
    // a value set elsewhere (preset, typed input) may lie outside the window: centre on it
    if (recompute && this.mode !== 'point' && this.resize()) {
      const [x, y] = this.toPx(this.value[0], this.value[1]);
      const w = this.canvas.width, h = this.canvas.height;
      if (!(x > 0.04 * w && x < 0.96 * w && y > 0.08 * h && y < 0.92 * h)) {
        this.win = { ...this.win, re: this.value[0], im: this.value[1] };
      }
    }
    if (recompute) this.refresh();
    else this.draw();
  }

  reset() { this.win = { ...this.base }; this.refresh(); }

  zoomBy(f, cx = null, cy = null) {
    // f < 1 zooms in; (cx, cy) in device px stays fixed, default the centre
    const half = Math.min(MAX_HALF, Math.max(MIN_HALF, this.win.half * f));
    const g = half / this.win.half;
    if (cx === null) { cx = this.canvas.width / 2; cy = this.canvas.height / 2; }
    const [re, im] = this.fromPx(cx, cy);
    this.win = { re: re - (re - this.win.re) * g, im: im - (im - this.win.im) * g, half };
  }

  get showCusps() {
    return this.which === 'a' && this.other[0] === 2 && this.other[1] === 0;
  }

  // ---- coordinates ----
  get dpr() { return this.canvas.width / (this.canvas.clientWidth || 1); }
  get scale() { return this.canvas.width / (2 * this.win.half); } // device px per unit
  toPx(re, im) {
    const s = this.scale;
    return [(im - this.win.im) * s + this.canvas.width / 2, this.canvas.height / 2 - (re - this.win.re) * s];
  }
  fromPx(x, y) {
    const s = this.scale;
    return [this.win.re + (this.canvas.height / 2 - y) / s, this.win.im + (x - this.canvas.width / 2) / s];
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (!w || !h) return false;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    return true;
  }

  // ---- quadtree of cells ----

  // level whose cells are about `px` CSS pixels wide in the current view
  levelFor(px) { return Math.round(Math.log2(this.scale / this.dpr / px)); }

  // index range of the cells of level L in view (plus a margin of one cell)
  range(L) {
    const s = Math.pow(2, -L);
    const halfV = this.win.half * this.canvas.height / this.canvas.width;
    return {
      i0: Math.floor((this.win.im - this.win.half) / s) - 1, i1: Math.floor((this.win.im + this.win.half) / s) + 1,
      j0: Math.floor((this.win.re - halfV) / s) - 1, j1: Math.floor((this.win.re + halfV) / s) + 1,
    };
  }

  // count of the cell, or of the finest computed cell containing it
  valueAt(L, i, j, Lmin) {
    for (; L >= Lmin; L--, i = Math.floor(i / 2), j = Math.floor(j / 2)) {
      const v = this.cache.get(key(L, i, j));
      if (v !== undefined) return v;
    }
    return undefined;
  }

  // does the cell sit on an edge of the valid region, or on a steep slope of the shading?
  isEdge(L, i, j, Lmin) {
    const v = this.valueAt(L, i, j, Lmin);
    if (v === undefined) return false;
    const lv = v > 0 ? Math.log(v) : 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const u = this.valueAt(L, i + di, j + dj, Lmin);
      if (u === undefined) continue;
      if ((u < 0) !== (v < 0)) return true;
      if (v > 0 && u > 0 && Math.abs(Math.log(u) - lv) > SHADE_STEP) return true;
    }
    return false;
  }

  refresh() {
    if (!this.resize()) return;
    const dep = JSON.stringify([this.other, this.group]);
    if (dep !== this.depKey || this.cache.size > MAX_CACHE) { this.depKey = dep; this.cache.clear(); }
    const Lc = this.levelFor(COARSE_PX), Lf = Math.max(Lc, this.levelFor(FINE_PX));
    this.stage = { gen: ++this.gen, L: Lc, Lc, Lf, pending: 0 };
    this.runStage();
    this.draw();
  }

  // submit the cells of the current stage; move on to finer levels as long as there is nothing to do
  runStage() {
    const st = this.stage;
    while (st.L <= st.Lf) {
      const cells = [];
      const L = st.L, s = Math.pow(2, -L);
      if (L === st.Lc) {
        const r = this.range(L);
        for (let j = r.j0; j <= r.j1; j++) for (let i = r.i0; i <= r.i1; i++) if (!this.cache.has(key(L, i, j))) cells.push(i, j);
      } else {
        const r = this.range(L - 1);
        for (let j = r.j0; j <= r.j1; j++) for (let i = r.i0; i <= r.i1; i++) {
          if (!this.isEdge(L - 1, i, j, st.Lc)) continue;
          for (let c = 0; c < 4; c++) {
            const ci = 2 * i + (c & 1), cj = 2 * j + (c >> 1);
            if (!this.cache.has(key(L, ci, cj))) cells.push(ci, cj);
          }
        }
      }
      if (cells.length) {
        const tasks = [];
        for (let k = 0; k < cells.length; k += 2 * TASK_CELLS) {
          const part = Int32Array.from(cells.slice(k, k + 2 * TASK_CELLS));
          const points = new Float64Array(part.length);
          for (let m = 0; m < part.length; m += 2) {
            points[m] = (part[m + 1] + 0.5) * s; // Re from j
            points[m + 1] = (part[m] + 0.5) * s; // Im from i
          }
          tasks.push({ plane: this.which, gen: st.gen, dep: this.depKey, level: L, cells: part, order: L - st.Lc,
                       other: this.other, group: this.group, opts: PROBE_OPTS, points });
        }
        st.pending = tasks.length;
        pool.submit(this.which, tasks);
        return;
      }
      st.L++;
    }
    st.done = true;
    pool.submit(this.which, []);
    this.draw();
  }

  receive(task, counts) {
    // results of an older view are still good for the cache, as long as the group is the same
    if (task.dep === this.depKey) {
      for (let m = 0; m < counts.length; m++) this.cache.set(key(task.level, task.cells[2 * m], task.cells[2 * m + 1]), counts[m]);
    }
    const st = this.stage;
    if (st && task.gen === st.gen && task.level === st.L && --st.pending === 0) {
      st.L++;
      this.runStage();
    }
    this.draw();
  }

  get computing() { return !!this.stage && !this.stage.done; }

  // ---- drawing ----

  paintField(ctx) {
    const css = getComputedStyle(document.documentElement);
    const [tr, tg, tb] = (css.getPropertyValue('--plane-tint').trim() || '36, 86, 200').split(',').map(Number);
    const Lc = this.levelFor(COARSE_PX), Lf = Math.max(Lc, this.levelFor(FINE_PX));
    // shade relative to the coarse cells in view, so the contrast suits the view
    let lo = Infinity, hi = 0;
    for (let L = Lc - 3; L <= Lc; L++) {
      const r = this.range(L);
      for (let j = r.j0; j <= r.j1; j++) for (let i = r.i0; i <= r.i1; i++) {
        const v = this.cache.get(key(L, i, j));
        if (v > 0) { if (v < lo) lo = v; if (v > hi) hi = v; }
      }
    }
    let lmin = lo < hi ? Math.log(lo) : Math.log(1000);
    let lmax = lo < hi ? Math.log(hi) : Math.log(PROBE_OPTS.maxNodes * PROBE_OPTS.growth);
    // deep inside a uniform region, do not blow small differences up into blocks
    if (lmax - lmin < 1.5) { const mid = (lmin + lmax) / 2; lmin = mid - 0.75; lmax = mid + 0.75; }
    ctx.imageSmoothingEnabled = false;
    // coarse to fine: each level paints the cells it has over the coarser ones
    for (let L = Lc - 6; L <= Lf; L++) {
      const r = this.range(L), cols = r.i1 - r.i0 + 1, rows = r.j1 - r.j0 + 1;
      if (cols * rows > 400000) continue;
      // colour of the valid cells, and a mask of every computed cell: a finer cell, valid or not,
      // replaces whatever coarser cell lies below it
      let img = null, mask = null;
      for (let j = r.j0; j <= r.j1; j++) for (let i = r.i0; i <= r.i1; i++) {
        const v = this.cache.get(key(L, i, j));
        if (v === undefined) continue;
        if (!img) { img = new ImageData(cols, rows); mask = new ImageData(cols, rows); }
        // image rows run top to bottom, i.e. from high Re to low Re
        const o = 4 * ((r.j1 - j) * cols + (i - r.i0));
        mask.data[o + 3] = 255;
        if (v < 0) continue; // no discrete group found here
        const t = Math.min(1, Math.max(0, (Math.log(v) - lmin) / (lmax - lmin)));
        img.data[o] = tr; img.data[o + 1] = tg; img.data[o + 2] = tb;
        img.data[o + 3] = Math.round(255 * (0.25 + 0.55 * t * t));
      }
      if (!img) continue;
      const s = Math.pow(2, -L);
      const [x0, y0] = this.toPx((r.j1 + 1) * s, r.i0 * s);
      const dw = cols * s * this.scale, dh = rows * s * this.scale;
      this.tint.width = cols; this.tint.height = rows;
      const tctx = this.tint.getContext('2d');
      tctx.putImageData(mask, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(this.tint, x0, y0, dw, dh);
      tctx.putImageData(img, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.tint, x0, y0, dw, dh);
    }
  }

  // ---- cusps ----
  cusps() {
    const zoom = this.base.half / this.win.half;
    const maxQ = Math.min(160, Math.round(40 * Math.sqrt(Math.max(1, zoom)) / 10) * 10);
    const k = (this.group.nonfree ? 'n' : 'f') + maxQ;
    if (!this.cuspCache.has(k)) this.cuspCache.set(k, boundary(maxQ, this.group.nonfree));
    return this.cuspCache.get(k);
  }

  // cusp points over all periods that touch the window, in pixels
  visibleCusps() {
    if (!this.showCusps) return [];
    const P = this.group.nonfree ? Math.SQRT2 : 2, pts = this.cusps(), out = [];
    const lo = this.win.im - this.win.half - P, hi = this.win.im + this.win.half + P;
    if ((hi - lo) / P > 200) return []; // too far out to show
    for (let j = Math.floor(lo / P); j <= Math.ceil(hi / P); j++) {
      for (const c of pts) {
        if (j !== 0 && c.p === 0) continue; // 0/1 of one period is 1/1 of the next
        const im = c.ta[1] + j * P;
        if (im < lo || im > hi) continue;
        const [x, y] = this.toPx(c.ta[0], im);
        out.push({ x, y, re: c.ta[0], im, p: c.p - c.q * j, q: c.q });
      }
    }
    out.sort((a, b) => a.x - b.x);
    return out;
  }

  draw() {
    if (!this.resize()) return;
    const { canvas, ctx } = this;
    const w = canvas.width, h = canvas.height, dpr = this.dpr;
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--color-text-primary').trim() || '#1a1a1a';
    const muted = css.getPropertyValue('--color-text-secondary').trim() || '#777';
    const line = css.getPropertyValue('--color-border-secondary').trim() || '#ccc';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.paintField(ctx);

    // grid with labels, about every 70 CSS px
    const step = niceStep(70 * dpr / this.scale);
    const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    const label = v => (Math.abs(v) < step / 2 ? '0' : v.toFixed(digits));
    const halfV = this.win.half * h / w;
    ctx.lineWidth = dpr;
    ctx.strokeStyle = line;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let v = Math.ceil((this.win.im - this.win.half) / step) * step; v <= this.win.im + this.win.half; v += step) {
      const [x] = this.toPx(0, v); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h);
    }
    for (let v = Math.ceil((this.win.re - halfV) / step) * step; v <= this.win.re + halfV; v += step) {
      const [, y] = this.toPx(v, 0); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = muted;
    ctx.font = `${9 * dpr}px ui-monospace, Menlo, monospace`;
    ctx.textBaseline = 'top';
    for (let v = Math.ceil((this.win.im - this.win.half) / step) * step; v <= this.win.im + this.win.half; v += step) {
      const [x] = this.toPx(0, v);
      ctx.fillText(label(v) + 'i', x + 2 * dpr, 2 * dpr);
    }
    ctx.textBaseline = 'bottom';
    for (let v = Math.ceil((this.win.re - halfV) / step) * step; v <= this.win.re + halfV; v += step) {
      const [, y] = this.toPx(v, 0);
      if (y > 24 * dpr) ctx.fillText(label(v), 2 * dpr, y - 1 * dpr);
    }

    // Re = 2 (parabolic b or a) and Im = 0, dashed
    ctx.strokeStyle = muted;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    const [, y2] = this.toPx(2, 0), [x0] = this.toPx(0, 0);
    ctx.beginPath(); ctx.moveTo(0, y2); ctx.lineTo(w, y2); ctx.moveTo(x0, 0); ctx.lineTo(x0, h); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // exact edge of the Maskit slice
    const pts = this.visibleCusps();
    if (pts.length) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = muted;
      ctx.lineWidth = dpr;
      ctx.stroke();
      ctx.fillStyle = ink;
      for (const p of pts) {
        if (p.q > 13) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (p.q <= 3 ? 2.6 : p.q <= 7 ? 2 : 1.4) * dpr, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // current value
    const [mx, my] = this.toPx(this.value[0], this.value[1]);
    const accent = css.getPropertyValue('--accent').trim() || '#d0353f';
    ctx.beginPath();
    ctx.arc(mx, my, 4.5 * dpr, 0, 2 * Math.PI);
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mx, my, 1.5 * dpr, 0, 2 * Math.PI);
    ctx.fillStyle = accent;
    ctx.fill();

    // how to use the map, while it is not active on a touch screen, or a passing note
    const hint = this.note || (!this.active && matchMedia('(pointer: coarse)').matches ? 'tap to use the map' : null);
    if (hint) {
      ctx.font = `${10 * dpr}px ui-monospace, Menlo, monospace`;
      const tw = ctx.measureText(hint).width, pad = 4 * dpr;
      ctx.fillStyle = css.getPropertyValue('--color-bg').trim() || '#fff';
      ctx.globalAlpha = 0.85;
      ctx.fillRect(w / 2 - tw / 2 - pad, h - 22 * dpr, tw + 2 * pad, 16 * dpr);
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hint, w / 2, h - 14 * dpr);
      ctx.textAlign = 'left';
      ctx.font = `${9 * dpr}px ui-monospace, Menlo, monospace`;
    }

    // still refining
    if (this.computing) {
      ctx.fillStyle = muted;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('computing…', w - 4 * dpr, h - 3 * dpr);
      ctx.textAlign = 'left';
    }
  }

  // ---- interaction ----
  // drag: pan · drag the marker: move the value with a live preview · double-click or
  // double-tap: set the value · wheel or pinch: zoom

  local(e) {
    const r = this.canvas.getBoundingClientRect();
    const d = this.canvas.width / r.width;
    return [(e.clientX - r.left) * d, (e.clientY - r.top) * d];
  }

  // the trace under the pointer, snapped to a nearby cusp
  pick(e) {
    const [x, y] = this.local(e);
    let best = null, bd = SNAP_PX * this.dpr;
    for (const p of this.visibleCusps()) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    if (best && !e.altKey) return { t: [best.re, best.im], cusp: `${best.p}/${best.q}` };
    return { t: this.fromPx(x, y), cusp: null };
  }

  nearMarker(e) {
    const [x, y] = this.local(e), [mx, my] = this.toPx(this.value[0], this.value[1]);
    return Math.hypot(x - mx, y - my) < MARKER_PX * this.dpr;
  }

  // A map only takes over scrolling gestures while it is active, so the page still scrolls past it.
  // Inactive: touch scrolls the page and the wheel scrolls the sidebar; taps still count, and a
  // mouse can drag at once (a mouse drag never scrolls). Ctrl/⌘ + wheel (and trackpad pinch) zoom.
  // Active (after a click or tap on the map): drag, wheel and pinch move the map. A click or tap
  // anywhere else, Esc, or scrolling the page makes it inactive again.
  setActive(on) {
    if (this.active === on) return;
    this.active = on;
    this.canvas.classList.toggle('active', on);
    this.draw();
  }

  // a short note on the map, e.g. how to zoom
  flash(text) {
    this.note = text;
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => { this.note = null; this.draw(); }, 1600);
    this.draw();
  }

  bind() {
    const cv = this.canvas;
    const pointers = new Map();
    let start = null, moved = 0, lastTap = null, pinchD = 0, settle = 0;
    const later = () => { clearTimeout(settle); settle = setTimeout(() => this.refresh(), 150); };
    this.active = false;

    const tap = e => {
      if (!this.active) this.setActive(true);
      // two taps close together set the value
      const now = performance.now(), at = this.local(e);
      if (lastTap && now - lastTap.t < 400 && Math.hypot(at[0] - lastTap.x, at[1] - lastTap.y) < 12 * this.dpr) {
        lastTap = null;
        const p = this.pick(e);
        this.onPick(p.t, p.cusp, true);
      } else lastTap = { t: now, x: at[0], y: at[1] };
    };

    cv.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (e.pointerType === 'mouse') this.setActive(true);
      start = this.local(e);
      moved = 0;
      if (!this.active) {
        // touch on an inactive map: the browser may scroll; only a tap is ours
        this.mode = 'tap';
        pointers.set(e.pointerId, start);
        return;
      }
      cv.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, start);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        this.mode = 'pinch';
        pinchD = Math.hypot(a[0] - b[0], a[1] - b[1]);
        return;
      }
      clearTimeout(settle);
      if (this.nearMarker(e)) {
        this.mode = 'point';
        const p = this.pick(e);
        this.onPick(p.t, p.cusp, false);
      } else {
        this.mode = 'pan';
        cv.classList.add('panning');
      }
    });

    cv.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse') cv.classList.toggle('on-marker', this.nearMarker(e));
        return;
      }
      const prev = pointers.get(e.pointerId), cur = this.local(e);
      pointers.set(e.pointerId, cur);
      moved = Math.max(moved, Math.hypot(cur[0] - start[0], cur[1] - start[1]) / this.dpr);
      if (this.mode === 'point') {
        const p = this.pick(e);
        this.onPick(p.t, p.cusp, false);
      } else if (this.mode === 'pan') {
        const s = this.scale;
        this.win = { ...this.win, im: this.win.im - (cur[0] - prev[0]) / s, re: this.win.re + (cur[1] - prev[1]) / s };
        this.draw();
      } else if (this.mode === 'pinch' && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinchD > 0 && d > 0) this.zoomBy(pinchD / d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        pinchD = d;
        this.draw();
      }
    });

    const end = (e, cancelled) => {
      if (!pointers.delete(e.pointerId)) return;
      cv.classList.remove('panning');
      const mode = this.mode;
      if (pointers.size) return; // still pinching with one finger
      this.mode = null;
      if (mode === 'tap') { if (!cancelled && moved <= 8) tap(e); return; }
      if (mode === 'point') {
        const p = this.pick(e);
        this.onPick(p.t, p.cusp, true);
        return;
      }
      if (mode === 'pinch' || moved > 4) { later(); return; }
      if (!cancelled) tap(e);
    };
    cv.addEventListener('pointerup', e => end(e, false));
    cv.addEventListener('pointercancel', e => end(e, true));

    cv.addEventListener('wheel', e => {
      if (!this.active && !e.ctrlKey && !e.metaKey) {
        // let the page scroll; say how to zoom
        this.flash(matchMedia('(pointer: coarse)').matches ? 'tap the map to zoom' : 'click the map or hold Ctrl to zoom');
        return;
      }
      e.preventDefault();
      const [x, y] = this.local(e);
      this.zoomBy(Math.exp(Math.max(-1, Math.min(1, e.deltaY * (e.deltaMode ? 0.05 : 0.002)))), x, y);
      this.draw();   // cached cells show at once
      later();       // new cells once the wheel rests
    }, { passive: false });

    // anything else makes the map inactive again
    const owner = cv.closest('.plane') || cv;
    document.addEventListener('pointerdown', e => { if (!owner.contains(e.target)) this.setActive(false); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.setActive(false); });
    const scroller = cv.closest('.sidebar');
    if (scroller) scroller.addEventListener('scroll', () => { if (!pointers.size) this.setActive(false); }, { passive: true });
  }
}
