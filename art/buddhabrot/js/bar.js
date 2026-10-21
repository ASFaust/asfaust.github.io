// A slider bar with one, two or three handles. With two, the first is the near end (a filled dot) and the
// second the far end (a hollow dot), the stretch between them is drawn solid, and the handles may
// cross. A third handle (a small diamond) is a midpoint, as in the levels tool of image editors; keeping
// it between the ends is the caller's job. onInput(values) fires while dragging, onChange(values) when
// a drag or key press ends. (From art/mandelbrot/js/bar.js, plus the third handle.)

export class Bar {
  constructor(el, { min, max, step, values, names, onInput, onChange }) {
    Object.assign(this, { el, min, max, step, onInput, onChange });
    this.values = values.slice();
    el.classList.add('bar');
    el.innerHTML = '<div class="bar-track"></div>' + (values.length >= 2 ? '<div class="bar-fill"></div>' : '');
    this.track = el.querySelector('.bar-track');
    this.fill = el.querySelector('.bar-fill');
    this.handles = values.map((_, i) => {
      const h = document.createElement('div');
      h.className = 'bar-handle' + (i === 1 ? ' far' : i === 2 ? ' mid' : '');
      h.tabIndex = 0;
      h.setAttribute('role', 'slider');
      h.setAttribute('aria-label', names[i]);
      h.setAttribute('aria-valuemin', min);
      h.setAttribute('aria-valuemax', max);
      h.addEventListener('keydown', e => this.key(e, i));
      el.appendChild(h);
      return h;
    });
    this.active = 0;
    el.addEventListener('pointerdown', e => this.down(e));
    el.addEventListener('pointermove', e => this.move(e));
    el.addEventListener('pointerup', e => this.up(e));
    el.addEventListener('pointercancel', e => this.up(e));
    this.draw();
  }

  set(values) {
    this.values = values.slice();
    this.draw();
  }

  frac(v) { return (v - this.min) / (this.max - this.min); }

  draw() {
    this.values.forEach((v, i) => {
      this.handles[i].style.left = (100 * this.frac(v)) + '%';
      this.handles[i].setAttribute('aria-valuenow', v);
    });
    if (this.fill) {
      const [a, b] = this.values.slice(0, 2).map(v => this.frac(v));
      this.fill.style.left = (100 * Math.min(a, b)) + '%';
      this.fill.style.width = (100 * Math.abs(b - a)) + '%';
    }
  }

  snap(v) {
    v = Math.min(this.max, Math.max(this.min, v));
    return +(Math.round((v - this.min) / this.step) * this.step + this.min).toFixed(6);
  }

  valueAt(e) {
    const r = this.el.getBoundingClientRect();
    return this.snap(this.min + (e.clientX - r.left) / r.width * (this.max - this.min));
  }

  down(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const v = this.valueAt(e);
    // grab the handle under the pointer, else the nearest; on a tie keep the last one used
    const hit = this.handles.findIndex(h => h.contains(e.target));
    if (hit >= 0) this.active = hit;
    else if (this.values.length >= 2) {
      const d = this.values.map(x => Math.abs(x - v)), best = Math.min(...d);
      if (d.filter(x => x === best).length === 1) this.active = d.indexOf(best);
    }
    this.handles[this.active].focus();
    this.el.setPointerCapture(e.pointerId);
    this.dragging = true;
    // clicking a handle does not move it; clicking the bar jumps there
    if (hit < 0) this.update(this.active, v);
  }

  move(e) {
    if (this.dragging) this.update(this.active, this.valueAt(e));
  }

  up() {
    if (!this.dragging) return;
    this.dragging = false;
    this.onChange && this.onChange(this.values.slice());
  }

  update(i, v) {
    if (this.values[i] === v) return;
    this.values[i] = v;
    this.draw();
    this.onInput && this.onInput(this.values.slice());
  }

  key(e, i) {
    const big = (this.max - this.min) / 10;
    const d = { ArrowLeft: -this.step, ArrowDown: -this.step, ArrowRight: this.step, ArrowUp: this.step,
      PageDown: -big, PageUp: big }[e.key];
    let v;
    if (d !== undefined) v = this.values[i] + (e.shiftKey ? 10 * d : d);
    else if (e.key === 'Home') v = this.min;
    else if (e.key === 'End') v = this.max;
    else return;
    e.preventDefault();
    this.active = i;
    this.update(i, this.snap(v));
    this.onChange && this.onChange(this.values.slice());
  }
}
