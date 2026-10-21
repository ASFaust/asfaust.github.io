// Zoom and pan of the finished image: a CSS transform on the canvas, so nothing is recomputed.
// "Render this view" turns the visible region into new bounds (region()).
import { clamp } from './state.js';

// active() says whether there is an image to move; changed() runs after every change of the view.
export function createView(stage, canvas, active, changed) {
  var view = { z: 1, x: 0, y: 0 };

  function apply() {
    canvas.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.z + ')';
    changed();
  }
  function reset() { view.z = 1; view.x = 0; view.y = 0; apply(); }
  function zoomAt(px, py, factor) {
    var z = clamp(view.z * factor, 1, 64);
    view.x = px - (px - view.x) * (z / view.z);
    view.y = py - (py - view.y) * (z / view.z);
    view.z = z;
    constrain();
    apply();
  }
  // keep the image covering the stage
  function constrain() {
    var S = stage.clientWidth;
    view.x = clamp(view.x, S - S * view.z, 0);
    view.y = clamp(view.y, S - S * view.z, 0);
  }
  function localPoint(e) {
    var r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  stage.addEventListener('wheel', function(e) {
    if (!active()) return;
    e.preventDefault();
    var p = localPoint(e);
    zoomAt(p.x, p.y, Math.pow(1.0015, -e.deltaY * (e.deltaMode === 1 ? 33 : 1)));
  }, { passive: false });

  var pointers = new Map(), pinch = null;
  stage.addEventListener('pointerdown', function(e) {
    if (!active()) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, localPoint(e));
    stage.classList.add('dragging');
    pinch = null;
  });
  stage.addEventListener('pointermove', function(e) {
    if (!pointers.has(e.pointerId)) return;
    var prev = pointers.get(e.pointerId), p = localPoint(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      view.x += p.x - prev.x;
      view.y += p.y - prev.y;
      constrain();
      apply();
    } else if (pointers.size === 2) {
      var pts = Array.from(pointers.values());
      var mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinch) {
        view.x += mid.x - pinch.mid.x;
        view.y += mid.y - pinch.mid.y;
        zoomAt(mid.x, mid.y, dist / pinch.dist);
      }
      pinch = { mid: mid, dist: dist };
    }
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    pinch = null;
    if (!pointers.size) stage.classList.remove('dragging');
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('dblclick', reset);
  // The stage follows the window size; scale the pan offset along so the same region stays in view.
  var lastSize = stage.clientWidth;
  new ResizeObserver(function() {
    var S = stage.clientWidth;
    if (lastSize > 0 && S > 0 && S !== lastSize) { view.x *= S / lastSize; view.y *= S / lastSize; }
    lastSize = S;
    constrain();
    apply();
  }).observe(stage);

  // Visible part of the bounds b. Rows of the image follow the real axis, columns the imaginary axis.
  function region(b) {
    var S = stage.clientWidth;
    var r0 = -view.y / (S * view.z), r1 = (S - view.y) / (S * view.z);
    var c0 = -view.x / (S * view.z), c1 = (S - view.x) / (S * view.z);
    function round(v) { return +v.toPrecision(10); }
    return {
      xmin: round(b.xmin + r0 * (b.xmax - b.xmin)),
      xmax: round(b.xmin + r1 * (b.xmax - b.xmin)),
      ymin: round(b.ymin + c0 * (b.ymax - b.ymin)),
      ymax: round(b.ymin + c1 * (b.ymax - b.ymin))
    };
  }
  function zoomed() { return view.z !== 1 || view.x !== 0 || view.y !== 0; }

  return { view: view, apply: apply, reset: reset, region: region, zoomed: zoomed };
}
