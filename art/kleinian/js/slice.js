// The Maskit slice: the plane of traces ta for which tb = 2 gives a discrete group (free or, with
// commutator trace 0, non-free). Its boundary is traced by the cusp groups p/q (cusps.js) and the
// slice repeats with period 2i (√2·i for the non-free family). Drag on the map to choose ta.

import { boundary } from './cusps.js';

const BASE = { re: 1.95, im: -0.9, half: 1.45 }; // initial window: im ∈ [−2.35, 0.55]
const SNAP_PX = 7;

export class SliceMap {
  constructor(canvas, { onPick, onHover }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onPick = onPick;
    this.onHover = onHover;
    this.state = { ta: [2, 0], tb: [2, 0], nonfree: false };
    this.win = { ...BASE };
    this.cache = new Map();
    this.dragging = false;
    this.bind();
  }

  setState(s) { Object.assign(this.state, s); this.draw(); }
  reset() { this.win = { ...BASE }; this.draw(); }

  // horizontal axis: Im(ta); vertical axis: Re(ta), increasing upwards
  get scale() { return this.canvas.width / (2 * this.win.half); } // pixels per unit
  toPx(re, im) {
    const s = this.scale;
    return [(im - this.win.im) * s + this.canvas.width / 2, this.canvas.height / 2 - (re - this.win.re) * s];
  }
  fromPx(x, y) {
    const s = this.scale;
    return [this.win.re + (this.canvas.height / 2 - y) / s, this.win.im + (x - this.canvas.width / 2) / s];
  }

  period() { return this.state.nonfree ? Math.SQRT2 : 2; }

  maxQ() {
    const zoom = BASE.half / this.win.half;
    return Math.min(160, Math.round(40 * Math.sqrt(Math.max(1, zoom)) / 10) * 10);
  }

  cusps() {
    const key = (this.state.nonfree ? 'n' : 'f') + this.maxQ();
    if (!this.cache.has(key)) this.cache.set(key, boundary(this.maxQ(), this.state.nonfree));
    return this.cache.get(key);
  }

  // cusp points over all periods that touch the window, in pixels
  visibleCusps() {
    const P = this.period(), pts = this.cusps(), out = [];
    const lo = this.win.im - this.win.half - P, hi = this.win.im + this.win.half + P;
    for (let j = Math.floor(lo / P); j <= Math.ceil(hi / P); j++) {
      for (const c of pts) {
        if (j !== 0 && c.p === 0) continue; // 0/1 of one period is 1/1 of the next
        const im = c.ta[1] + j * P;
        if (im < lo || im > hi) continue;
        const [x, y] = this.toPx(c.ta[0], im);
        out.push({ x, y, re: c.ta[0], im, p: c.p + (c.q * -j), q: c.q });
      }
    }
    out.sort((a, b) => a.x - b.x);
    return out;
  }

  draw() {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--color-text-primary').trim() || '#1a1a1a';
    const muted = css.getPropertyValue('--color-text-secondary').trim() || '#777';
    const line = css.getPropertyValue('--color-border-secondary').trim() || '#ccc';
    const shade = css.getPropertyValue('--slice-shade').trim() || 'rgba(0,0,0,0.06)';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pts = this.visibleCusps();
    // discrete groups lie on the side of large Re(ta): shade above the boundary
    if (pts.length) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, -1);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.lineTo(pts[pts.length - 1].x, -1);
      ctx.closePath();
      ctx.fillStyle = shade;
      ctx.fill();
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = muted;
      ctx.lineWidth = dpr;
      ctx.stroke();
    }

    // axes: Re(ta) = 2 and Im(ta) = 0
    ctx.strokeStyle = line;
    ctx.lineWidth = dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    const [, y2] = this.toPx(2, 0), [x0] = this.toPx(0, 0);
    ctx.beginPath(); ctx.moveTo(0, y2); ctx.lineTo(w, y2); ctx.moveTo(x0, 0); ctx.lineTo(x0, h); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = muted;
    ctx.font = `${10 * dpr}px ui-monospace, Menlo, monospace`;
    ctx.textBaseline = 'bottom';
    ctx.fillText('Re 2', 3 * dpr, y2 - 2 * dpr);
    ctx.textBaseline = 'top';
    ctx.fillText('Im 0', x0 + 3 * dpr, 3 * dpr);

    // small-denominator cusps as dots
    ctx.fillStyle = ink;
    for (const p of pts) {
      if (p.q > 13) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (p.q <= 3 ? 2.6 : p.q <= 7 ? 2 : 1.4) * dpr, 0, 2 * Math.PI);
      ctx.fill();
    }

    // the current ta; hollow when tb ≠ 2, since the map then only approximates the group
    const { ta, tb } = this.state;
    const [mx, my] = this.toPx(ta[0], ta[1]);
    const onSlice = Math.abs(tb[0] - 2) < 1e-12 && Math.abs(tb[1]) < 1e-12;
    ctx.beginPath();
    ctx.arc(mx, my, 4.5 * dpr, 0, 2 * Math.PI);
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = css.getPropertyValue('--accent').trim() || '#d0353f';
    if (!onSlice) ctx.setLineDash([2 * dpr, 2 * dpr]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (onSlice) {
      ctx.beginPath();
      ctx.arc(mx, my, 1.5 * dpr, 0, 2 * Math.PI);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
  }

  // ta under the pointer, snapped to a nearby cusp
  pick(e) {
    const r = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / r.width;
    const x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
    let best = null, bd = SNAP_PX * dpr;
    for (const p of this.visibleCusps()) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd || (best && d === bd && p.q < best.q)) { bd = d; best = p; }
    }
    if (best && !e.altKey) return { ta: [best.re, best.im], cusp: `${best.p}/${best.q}` };
    return { ta: this.fromPx(x, y), cusp: null };
  }

  bind() {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      this.dragging = true;
      cv.setPointerCapture(e.pointerId);
      const p = this.pick(e);
      this.onPick(p.ta, p.cusp, false);
    });
    cv.addEventListener('pointermove', e => {
      const p = this.pick(e);
      this.onHover(p);
      if (this.dragging) this.onPick(p.ta, p.cusp, false);
    });
    const end = e => {
      if (!this.dragging) return;
      this.dragging = false;
      const p = this.pick(e);
      this.onPick(p.ta, p.cusp, true);
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { if (!this.dragging) this.onHover(null); });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const dpr = cv.width / r.width;
      const [re, im] = this.fromPx((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
      const f = Math.exp(Math.max(-1, Math.min(1, e.deltaY * (e.deltaMode ? 0.05 : 0.002))));
      const half = Math.min(BASE.half * 3, Math.max(1e-6, this.win.half * f));
      const g = half / this.win.half;
      // keep the point under the pointer fixed
      this.win = { re: re - (re - this.win.re) * g, im: im - (im - this.win.im) * g, half };
      this.draw();
    }, { passive: false });
    cv.addEventListener('dblclick', () => this.reset());
  }
}
