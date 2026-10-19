// Keeps the segments of the current render and draws them on a canvas. Every segment carries the
// code of its word (see dfs.js), so colouring, line width and background change without a new search.

const THEMES = {
  light: {
    bg: '#ffffff', ink: '#1a1a1a',
    gens: ['#2456c8', '#d0353f', '#0f9488', '#9b3fb5'], // a, b, A, B
    ramp: ['#1d3b8f', '#1f8a9a', '#4a9f4a', '#d9822b', '#c0392b'],
  },
  dark: {
    bg: '#0f0f10', ink: '#e8e8e8',
    gens: ['#7aa2ff', '#ff6b6b', '#3fd6c4', '#d58cff'],
    ramp: ['#7aa2ff', '#4fd1c5', '#a3e36a', '#ffc857', '#ff6b6b'],
  },
};

export const GEN_NAMES = ['a', 'b', 'A', 'B'];
const RAMP_STEPS = 24;

function hex(c) { return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); }
function rampColor(stops, t) {
  const x = Math.min(stops.length - 1.0001, Math.max(0, t * (stops.length - 1)));
  const i = Math.floor(x), f = x - i;
  const a = hex(stops[i]), b = hex(stops[i + 1]);
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(',')})`;
}

export function palette(themeName) { return THEMES[themeName] || THEMES.light; }

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.chunks = [];
    this.maxLen = 1;
    this.style = { mode: 'letter', depth: 1, lineWidth: 1, theme: 'light' };
  }

  setStyle(style) { Object.assign(this.style, style); }

  clear() {
    this.chunks = [];
    this.maxLen = 1;
    this.paintBackground();
  }

  paintBackground() {
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette(this.style.theme).bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Paint the previous image, moved by the pending pan/zoom, faintly under the next render.
  ghost(scale, tx, ty, alpha = 0.35) {
    const { canvas, ctx } = this;
    const copy = document.createElement('canvas');
    copy.width = canvas.width; copy.height = canvas.height;
    copy.getContext('2d').drawImage(canvas, 0, 0);
    this.chunks = [];
    this.maxLen = 1;
    this.paintBackground();
    ctx.globalAlpha = alpha;
    ctx.setTransform(scale, 0, 0, scale, tx, ty);
    ctx.drawImage(copy, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  add(seg, code, n) {
    if (!n) return;
    const chunk = { seg, code, n };
    this.chunks.push(chunk);
    let grew = false;
    for (let i = 0; i < n; i++) {
      const len = code[i] >>> 18;
      if (len > this.maxLen) { this.maxLen = len; grew = true; }
    }
    // the depth ramp is normalised to the longest word, so a new maximum needs a full redraw
    if (grew && this.style.mode === 'level' && this.chunks.length > 1) this.redraw();
    else this.drawChunk(chunk);
  }

  redraw() {
    this.paintBackground();
    for (const c of this.chunks) this.drawChunk(c);
  }

  // colour index of each segment, and the list of colours
  colouring() {
    const { mode, depth, theme } = this.style;
    const pal = palette(theme);
    if (mode === 'mono') return { colors: [pal.ink], index: () => 0 };
    if (mode === 'level') {
      const colors = [];
      for (let i = 0; i < RAMP_STEPS; i++) colors.push(rampColor(pal.ramp, i / (RAMP_STEPS - 1)));
      const lmax = Math.log(this.maxLen + 1);
      return { colors, index: c => Math.min(RAMP_STEPS - 1, Math.floor(Math.log((c >>> 18) + 1) / lmax * RAMP_STEPS)) };
    }
    if (mode === 'last') return { colors: pal.gens, index: c => (c >>> 16) & 3 };
    // letter number `depth` of the word; shorter words use their last letter
    const d = Math.max(1, Math.min(8, depth | 0)), shift = 2 * (d - 1);
    return { colors: pal.gens, index: c => ((c >>> 18) >= d ? (c >>> shift) & 3 : (c >>> 16) & 3) };
  }

  drawChunk({ seg, code, n }) {
    const { ctx } = this;
    const { colors, index } = this.colouring();
    const k = colors.length;
    const idx = new Uint8Array(n);
    for (let i = 0; i < n; i++) idx[i] = index(code[i]);
    ctx.lineWidth = this.style.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let c = 0; c < k; c++) {
      ctx.strokeStyle = colors[c];
      ctx.beginPath();
      let cx = NaN, cy = NaN, any = false;
      for (let i = 0; i < n; i++) {
        if (idx[i] !== c) continue;
        const o = 4 * i;
        const ax = seg[o], ay = seg[o + 1];
        // consecutive segments usually share an end point: continue the polyline
        if (Math.abs(ax - cx) > 0.01 || Math.abs(ay - cy) > 0.01) ctx.moveTo(ax, ay);
        cx = seg[o + 2]; cy = seg[o + 3];
        ctx.lineTo(cx, cy);
        any = true;
      }
      if (any) ctx.stroke();
    }
  }

  get segments() { let s = 0; for (const c of this.chunks) s += c.n; return s; }
}
