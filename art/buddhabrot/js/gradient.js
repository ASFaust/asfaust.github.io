// The gradient editor: a bar with draggable stops, a colour picker and position field for the
// selected stop, presets and reverse. It edits st.gradient and calls changed() after each edit.
import { st, GRADIENTS, parseGradient, gradientString, clamp } from './state.js';
import { lut } from './display.js';

export function createGradientEditor(changed) {
  var $ = function(id) { return document.getElementById(id); };
  // gStops keeps the user's order while dragging so the selection stays put; st.gradient is the sorted form.
  var gStops = [], gSel = 0, gDrag = false, grad = $('grad');

  function draw() {
    var sorted = parseGradient(st.gradient), els = grad.getElementsByClassName('grad-stop');
    $('gradBar').style.background = 'linear-gradient(in oklab to right, ' + sorted.map(function(s) { return s.c + ' ' + s.p * 100 + '%'; }).join(', ') + ')';
    while (els.length > gStops.length) els[els.length - 1].remove();
    while (els.length < gStops.length) { var el = document.createElement('div'); el.className = 'grad-stop'; grad.appendChild(el); }
    gStops.forEach(function(s, i) {
      els[i].dataset.i = i;
      els[i].classList.toggle('sel', i === gSel);
      els[i].style.left = s.p * 100 + '%';
      els[i].style.background = s.c;
    });
    $('p-gcolor').value = gStops[gSel].c;
    $('p-gpos').value = +gStops[gSel].p.toFixed(3);
    $('gradDelBtn').disabled = gStops.length <= 2;
    $('p-gpreset').value = Object.keys(GRADIENTS).filter(function(k) { return GRADIENTS[k] === st.gradient; })[0] || '';
  }
  // after st.gradient changed from outside (preset, URL): take its stops unless a drag is going on
  function sync() {
    if (!gDrag && gradientString(gStops) !== st.gradient) { gStops = parseGradient(st.gradient); gSel = 0; }
    draw();
  }
  function edited() {
    var g = gradientString(gStops);
    if (g !== st.gradient) { st.gradient = g; changed(); }
    draw();
  }
  function gradPos(e) { var r = grad.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); }

  grad.addEventListener('pointerdown', function(e) {
    if (e.button !== 0) return;
    e.preventDefault();   // otherwise the browser may start a native drag of the bar
    var i = e.target.classList.contains('grad-stop') ? +e.target.dataset.i : -1;
    if (i < 0) {
      // a new stop takes the colour the gradient already has there
      var p = gradPos(e), c = lut(st.gradient)[(p * 1023 + 0.5) | 0];
      gStops.push({ c: '#' + [c & 255, c >> 8 & 255, c >> 16 & 255].map(function(v) { return v.toString(16).padStart(2, '0'); }).join(''), p: p });
      i = gStops.length - 1;
    }
    gSel = i;
    gDrag = true;
    grad.setPointerCapture(e.pointerId);
    edited();
  });
  grad.addEventListener('pointermove', function(e) { if (gDrag) { gStops[gSel].p = gradPos(e); edited(); } });
  grad.addEventListener('pointerup', function() { gDrag = false; });
  grad.addEventListener('dragstart', function(e) { e.preventDefault(); });
  grad.addEventListener('pointercancel', function() { gDrag = false; });
  $('p-gcolor').addEventListener('input', function() { gStops[gSel].c = this.value; edited(); });
  $('p-gpos').addEventListener('change', function() { var p = +this.value; if (isFinite(p)) gStops[gSel].p = clamp(p, 0, 1); edited(); });
  $('gradDelBtn').addEventListener('click', function() { if (gStops.length > 2) { gStops.splice(gSel, 1); gSel = Math.max(0, gSel - 1); edited(); } });
  $('gradRevBtn').addEventListener('click', function() { gStops.forEach(function(s) { s.p = 1 - s.p; }); edited(); });
  $('p-gpreset').addEventListener('change', function() {
    if (!GRADIENTS[this.value]) return;
    st.gradient = GRADIENTS[this.value];
    sync();
    changed();
  });

  Object.keys(GRADIENTS).forEach(function(k) {
    var o = document.createElement('option');
    o.value = o.textContent = k;
    $('p-gpreset').appendChild(o);
  });

  return { sync: sync };
}
