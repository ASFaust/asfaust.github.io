// <oklch-picker>: a colour input with its own popup, in place of <input type="color">. Like that
// input, its value is a '#rrggbb' string, and it fires "input" while the colour is being edited and
// "change" when the popup closes on a new colour.
//
// The popup works in OKLCh (Björn Ottosson's OKLab in polar form): a plane of chroma against
// lightness at the current hue, and a slider for each of the three. sRGB cannot show every OKLCh
// colour, so the chroma asked for is lowered until the screen can show it, with lightness and hue
// kept; the part of the plane and of the chroma slider outside the screen's gamut is hatched. The
// chroma asked for is remembered while the popup is open, so that moving the lightness or the hue
// through a narrow part of the gamut and back does not lose it.
//
// A plain script (not a module), so that classic pages and module pages can both load it.

(function () {
  'use strict';

  const CMAX = 0.33;   // a little above the largest chroma in sRGB (blue, about 0.32)

  // OKLab → linear sRGB
  function linear(L, a, b) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
  }

  // linear sRGB → OKLab
  function oklab(r, g, b) {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
  }

  const encode = x => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
  const decode = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const inGamut = rgb => rgb.every(x => x >= -1e-4 && x <= 1 + 1e-4);
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const rad = h => h * Math.PI / 180;

  // The largest chroma up to C that the screen can show at lightness L and hue h.
  function fit(L, C, h) {
    const ca = Math.cos(rad(h)), sa = Math.sin(rad(h));
    if (inGamut(linear(L, C * ca, C * sa))) return C;
    let lo = 0, hi = C;
    for (let i = 0; i < 20; i++) {
      const c = (lo + hi) / 2;
      if (inGamut(linear(L, c * ca, c * sa))) lo = c; else hi = c;
    }
    return lo;
  }

  const byte = x => Math.round(clamp(encode(clamp(x, 0, 1)), 0, 1) * 255).toString(16).padStart(2, '0');

  // '#rrggbb' of an OKLCh colour, brought into the screen's gamut
  function hexOf(L, C, h) {
    C = fit(L, C, h);
    return '#' + linear(L, C * Math.cos(rad(h)), C * Math.sin(rad(h))).map(byte).join('');
  }

  // '#rgb', '#rrggbb' or without the '#' → '#rrggbb', or null
  function normal(s) {
    const m = /^\s*#?([0-9a-f]{3}|[0-9a-f]{6})\s*$/i.exec(String(s));
    if (!m) return null;
    const d = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    return '#' + d.toLowerCase();
  }

  // '#rrggbb' → [L, C, h]; the hue of a grey is NaN
  function lchOf(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [L, a, b] = oklab(...[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(x => decode(x / 255)));
    const C = Math.hypot(a, b);
    return [clamp(L, 0, 1), C, C < 2e-4 ? NaN : (Math.atan2(b, a) * 180 / Math.PI + 360) % 360];
  }

  // ---------- styles ----------

  // :where() keeps the defaults below any rule of the page
  const CSS = `
/* the colour, inside a ring of the page's background */
:where(oklch-picker) { display: inline-block; width: 1.8rem; height: 1.8rem; border: 1px solid var(--color-border-secondary, #ccc); border-radius: 4px; box-shadow: inset 0 0 0 2px var(--color-bg, #fff); cursor: pointer; vertical-align: middle; }
oklch-picker:focus-visible, .okp :focus-visible { outline: 2px solid var(--color-text-primary, #1a1a1a); outline-offset: 2px; }
.okp { position: fixed; z-index: 1000; width: min(264px, calc(100vw - 16px)); padding: 12px; background: var(--color-bg, #fff); color: var(--color-text-primary, #1a1a1a); border: 1px solid var(--color-border-secondary, #ccc); border-radius: 6px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22); font: 12px var(--font-sans, sans-serif); touch-action: none; user-select: none; -webkit-user-select: none; }
.okp[hidden] { display: none; }
.okp-hatch { background: repeating-linear-gradient(45deg, transparent 0 4px, rgba(128, 128, 128, 0.18) 4px 8px); }
.okp-plane { position: relative; height: 150px; border-radius: 4px; cursor: crosshair; }
.okp-plane canvas { display: block; width: 100%; height: 100%; border-radius: 4px; }
.okp-dot, .okp-thumb { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(0, 0, 0, 0.3); pointer-events: none; }
.okp-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.okp-row b { width: 1em; font-weight: 600; color: var(--color-text-secondary, #555); }
.okp-track { position: relative; flex: 1; height: 14px; border-radius: 7px; cursor: pointer; }
.okp-track > div:first-child { position: absolute; inset: 0; border-radius: 7px; }
.okp-thumb { top: 50%; }
.okp input { width: 4.2em; padding: 2px 4px; font: 12px var(--font-mono, monospace); color: inherit; background: var(--color-bg, #fff); border: 1px solid var(--color-border-secondary, #ccc); border-radius: 3px; text-align: right; }
.okp-foot { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.okp-cmp { display: flex; flex: 1; height: 24px; border: 1px solid var(--color-border-secondary, #ccc); border-radius: 4px; overflow: hidden; }
.okp-cmp > * { flex: 1; }
.okp-old { padding: 0; border: none; border-radius: 0; cursor: pointer; }
.okp .okp-hex { width: 6.2em; text-align: left; }
.okp-hex.bad { border-color: #d0353f; }
`;

  // ---------- the popup (one for the page, built when first needed) ----------

  let pop = null;   // its parts
  // the open picker and its colour: lightness, the chroma asked for, hue, and the value it opened with
  let cur = null;
  let lastHue = 0;  // for greys, which have no hue of their own

  function build() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);

    const el = document.createElement('div');
    el.className = 'okp';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Colour');
    el.innerHTML = `
<div class="okp-plane okp-hatch" tabindex="0" role="group" aria-label="Chroma across, lightness up; arrow keys move"><canvas></canvas><div class="okp-dot"></div></div>
${['L', 'C', 'H'].map(k => `<div class="okp-row"><b>${k}</b><div class="okp-track${k === 'C' ? ' okp-hatch' : ''}" data-k="${k}" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="100"
  aria-label="${{ L: 'Lightness', C: 'Chroma', H: 'Hue' }[k]}"><div></div><div class="okp-thumb"></div></div><input data-k="${k}" inputmode="decimal" spellcheck="false" aria-label="${{ L: 'Lightness', C: 'Chroma', H: 'Hue' }[k]}"></div>`).join('')}
<div class="okp-foot"><div class="okp-cmp"><button type="button" class="okp-old" title="Back to the colour before"></button><span class="okp-new"></span></div><input class="okp-hex" spellcheck="false" maxlength="7" aria-label="Hex"></div>`;
    document.body.append(el);

    const q = s => el.querySelector(s);
    pop = {
      el, plane: q('.okp-plane'), canvas: q('canvas'), dot: q('.okp-dot'),
      tracks: {}, thumbs: {}, bars: {}, nums: {},
      old: q('.okp-old'), now: q('.okp-new'), hex: q('.okp-hex'),
      drawn: '',   // hue and size the plane was last drawn for
    };
    for (const t of el.querySelectorAll('.okp-track')) {
      const k = t.dataset.k;
      pop.tracks[k] = t; pop.bars[k] = t.firstChild; pop.thumbs[k] = t.lastChild;
    }
    for (const n of el.querySelectorAll('input[data-k]')) pop.nums[n.dataset.k] = n;

    // the plane: chroma across, lightness up
    const fromPlane = e => {
      const r = pop.plane.getBoundingClientRect();
      cur.C = clamp((e.clientX - r.left) / r.width, 0, 1) * CMAX;
      cur.L = 1 - clamp((e.clientY - r.top) / r.height, 0, 1);
      update();
    };
    drag(pop.plane, fromPlane);
    pop.plane.addEventListener('keydown', e => {
      const f = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-0.002, 0], ArrowRight: [0.002, 0], ArrowUp: [0, 0.005], ArrowDown: [0, -0.005] }[e.key];
      if (!d) return;
      e.preventDefault();
      // from the chroma shown, so that a clipped colour moves at once
      cur.C = clamp(fit(cur.L, cur.C, cur.h) + d[0] * f, 0, CMAX);
      cur.L = clamp(cur.L + d[1] * f, 0, 1);
      update();
    });

    // the sliders
    const SET = {
      L: x => { cur.L = x; },
      C: x => { cur.C = x * CMAX; },
      H: x => { cur.h = x * 360; },
    };
    const STEP = { L: 0.005, C: 0.002 / CMAX, H: 1 / 360 };
    for (const k of ['L', 'C', 'H']) {
      const t = pop.tracks[k];
      drag(t, e => {
        const r = t.getBoundingClientRect();
        SET[k](clamp((e.clientX - r.left) / r.width, 0, 1));
        update();
      });
      t.addEventListener('keydown', e => {
        const x = position(k);
        const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
        let to;
        if (d) to = x + d * STEP[k] * (e.shiftKey ? 10 : 1);
        else if (e.key === 'Home') to = 0;
        else if (e.key === 'End') to = 1;
        else return;
        e.preventDefault();
        SET[k](k === 'H' ? (to + 1) % 1 : clamp(to, 0, 1));
        update();
      });
      pop.nums[k].addEventListener('change', () => {
        const v = parseFloat(pop.nums[k].value);
        if (isFinite(v)) {
          if (k === 'L') cur.L = clamp(v, 0, 1);
          if (k === 'C') cur.C = clamp(v, 0, CMAX);
          if (k === 'H') cur.h = ((v % 360) + 360) % 360;
        }
        update();
      });
    }

    pop.hex.addEventListener('input', () => {
      const hex = normal(pop.hex.value);
      pop.hex.classList.toggle('bad', !hex);
      if (hex) take(hex, 'hex');
    });
    pop.hex.addEventListener('change', () => { pop.hex.classList.remove('bad'); update(); });
    pop.old.addEventListener('click', () => take(cur.start));

    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); take(cur.start); close(true); }
      else if (e.key === 'Enter') { e.preventDefault(); if (e.target.matches('input')) e.target.dispatchEvent(new Event('change')); close(true); }
    });
    // a click elsewhere closes the popup; one on the open picker itself toggles it (see the click there)
    document.addEventListener('pointerdown', e => {
      if (cur && !el.contains(e.target) && e.target !== cur.el && !cur.el.contains(e.target)) close(false);
    }, true);
    el.addEventListener('focusout', e => {
      const to = e.relatedTarget;
      if (cur && to && !el.contains(to) && to !== cur.el) close(false);
    });
    window.addEventListener('resize', () => cur && place());
    window.addEventListener('scroll', () => cur && place(), true);
  }

  // pointer dragging on an element, calling f with the pointer events
  function drag(target, f) {
    let on = false;
    target.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      target.focus({ preventScroll: true });
      on = true;
      target.setPointerCapture(e.pointerId);
      f(e);
    });
    target.addEventListener('pointermove', e => { if (on) f(e); });
    const stop = () => { on = false; };
    target.addEventListener('pointerup', stop);
    target.addEventListener('pointercancel', stop);
  }

  // where a slider's thumb sits, in [0, 1]
  const position = k => (k === 'L' ? cur.L : k === 'C' ? Math.min(1, cur.C / CMAX) : cur.h / 360);

  // set the colour from a hex value, keeping the hue of a grey
  function take(hex, from) {
    const [L, C, h] = lchOf(hex);
    cur.L = L; cur.C = C;
    if (!isNaN(h)) cur.h = h;
    update(from);
  }

  // The plane at the current hue, at the canvas's size in device pixels. Colours the screen cannot
  // show stay transparent, so the hatching behind shows through.
  function drawPlane() {
    const cv = pop.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
    const key = cur.h.toFixed(2) + ':' + w + 'x' + h;
    if (key === pop.drawn) return;
    pop.drawn = key;
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(w, h), px = img.data;
    const ca = Math.cos(rad(cur.h)), sa = Math.sin(rad(cur.h));
    for (let y = 0; y < h; y++) {
      const L = 1 - y / (h - 1 || 1);
      for (let x = 0; x < w; x++) {
        const C = x / (w - 1 || 1) * CMAX;
        const rgb = linear(L, C * ca, C * sa);
        if (!inGamut(rgb)) continue;
        const i = (y * w + x) * 4;
        px[i] = encode(clamp(rgb[0], 0, 1)) * 255 + 0.5;
        px[i + 1] = encode(clamp(rgb[1], 0, 1)) * 255 + 0.5;
        px[i + 2] = encode(clamp(rgb[2], 0, 1)) * 255 + 0.5;
        px[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // Show the current colour everywhere in the popup except in the field it came from, and pass it
  // on to the picker.
  function update(from) {
    const { L, C, h } = cur, shown = fit(L, C, h), hex = hexOf(L, C, h);
    drawPlane();
    pop.dot.style.left = shown / CMAX * 100 + '%';
    pop.dot.style.top = (1 - L) * 100 + '%';

    // the chroma slider runs out at the edge of the gamut, and is hatched beyond it
    const stops = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n)).join(', ');
    const most = fit(L, CMAX, h), edge = most / CMAX * 100;
    pop.bars.L.style.background = `linear-gradient(to right, ${stops(16, x => hexOf(x, C, h))})`;
    pop.bars.C.style.background = `linear-gradient(to right, ${stops(12, x => hexOf(L, x * most, h) + ' ' + x * edge + '%')}, transparent ${edge}%)`;
    pop.bars.H.style.background = `linear-gradient(to right, ${stops(24, x => hexOf(L, C, x * 360))})`;
    for (const k of ['L', 'C', 'H']) {
      pop.thumbs[k].style.left = position(k) * 100 + '%';
      pop.tracks[k].setAttribute('aria-valuenow', (position(k) * 100).toFixed(1));
    }
    const nums = { L: L.toFixed(3), C: shown.toFixed(3), H: h.toFixed(1) };
    for (const k of ['L', 'C', 'H']) if (from !== k || document.activeElement !== pop.nums[k]) pop.nums[k].value = nums[k];
    if (from !== 'hex') { pop.hex.value = hex; pop.hex.classList.remove('bad'); }
    pop.now.style.background = hex;
    lastHue = h;

    const el = cur.el;
    if (hex !== el._hex) {
      el._hex = hex;
      el._paint();
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // below the picker, or above it when there is no room below; always on the screen
  function place() {
    const el = cur.el;
    if (!el.isConnected) { close(false); return; }
    const r = el.getBoundingClientRect(), p = pop.el;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight, pw = p.offsetWidth, ph = p.offsetHeight;
    let y = r.bottom + 6;
    if (y + ph > vh - 8 && r.top - 6 - ph >= 8) y = r.top - 6 - ph;
    p.style.left = clamp(r.left, 8, Math.max(8, vw - pw - 8)) + 'px';
    p.style.top = clamp(y, 8, Math.max(8, vh - ph - 8)) + 'px';
  }

  function open(el) {
    if (!pop) build();
    if (cur) close(false);
    const [L, C, h] = lchOf(el._hex);
    cur = { el, L, C, h: isNaN(h) ? lastHue : h, start: el._hex };
    pop.old.style.background = el._hex;
    pop.el.hidden = false;
    el.setAttribute('aria-expanded', 'true');
    place();
    update();
    pop.plane.focus({ preventScroll: true });
  }

  function close(refocus) {
    if (!cur) return;
    const { el, start } = cur;
    cur = null;
    pop.el.hidden = true;
    el.setAttribute('aria-expanded', 'false');
    if (refocus) el.focus({ preventScroll: true });
    if (el._hex !== start) el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------- the element ----------

  class OklchPicker extends HTMLElement {
    static get observedAttributes() { return ['value']; }

    constructor() {
      super();
      this._hex = '#000000';
      this.addEventListener('click', () => (cur && cur.el === this ? close(true) : open(this)));
      this.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
      });
    }

    connectedCallback() {
      if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
      if (!this.hasAttribute('role')) this.setAttribute('role', 'button');
      this.setAttribute('aria-haspopup', 'dialog');
      this._paint();
    }

    attributeChangedCallback(name, old, v) { if (name === 'value') this.value = v; }

    get value() { return this._hex; }

    set value(v) {
      const hex = normal(v);
      if (!hex || hex === this._hex) return;
      this._hex = hex;
      this._paint();
      // set from outside while open: the popup follows
      if (cur && cur.el === this) {
        const [L, C, h] = lchOf(hex);
        cur.L = L; cur.C = C; cur.start = hex;
        if (!isNaN(h)) cur.h = h;
        pop.old.style.background = hex;
        update();
      }
    }

    _paint() {
      this.style.backgroundColor = this._hex;
    }
  }

  customElements.define('oklch-picker', OklchPicker);
})();
