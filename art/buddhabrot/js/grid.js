// The grid sampler's density, shared by compute.js (which builds it and draws the starting points) and worker.js
// (Metropolis). A grid g = { G, x0, y0, h, w, cells, cum }: cell (i, j) spans real parts x0 + [i, i+1]·h and
// imaginary parts y0 + [j, j+1]·h and has weight w[i·G + j]; cells lists the cells with weight, cum their running
// sum.
// The density is not the cell weights as a staircase but the staircase smoothed twice with a one-cell box: a quadratic
// B-spline, continuous and with a continuous slope. A staircase showed in zoomed images, because orbits carry the
// density of c along: every orbit's first point is c, and near a minibrot of period p every p-th point returns close to
// c, so the cell edges appeared as a checkerboard and, bent, as bands (owner, 2026-10-22). Drawing from it is cheap:
// a uniform point in a cell picked by weight, plus two uniform offsets of up to half a cell on each axis.

// a random point with this density; rand() is uniform on [0, 1)
export function pick(g, rand, out) {
  var x = rand() * g.cum[g.cum.length - 1], lo = 0, hi = g.cum.length - 1;
  while (lo < hi) { var mid = (lo + hi) >> 1; if (g.cum[mid] > x) hi = mid; else lo = mid + 1; }
  var cell = g.cells[lo];
  out[0] = g.x0 + ((cell / g.G | 0) + rand() + rand() + rand() - 1) * g.h;
  out[1] = g.y0 + (cell % g.G + rand() + rand() + rand() - 1) * g.h;
}

// quadratic B-spline of width 3, centred at 0: one cell's share of the density at distance d (in cells) from its centre
function bspline(d) {
  d = d < 0 ? -d : d;
  return d < 0.5 ? 0.75 - d * d : d < 1.5 ? 0.5 * (1.5 - d) * (1.5 - d) : 0;
}

// the density at c, up to the constant factor (the weights' total times h²): the B-spline-weighted sum of the weights
// of the 3 × 3 cells around c; 0 far from the grid's cells
export function weight(g, cr, ci) {
  var sx = (cr - g.x0) / g.h, sy = (ci - g.y0) / g.h, i0 = Math.floor(sx) - 1, j0 = Math.floor(sy) - 1, s = 0;
  for (var i = i0; i <= i0 + 2; i++) {
    if (i < 0 || i >= g.G) continue;
    var bx = bspline(sx - i - 0.5);
    if (bx === 0) continue;
    for (var j = j0; j <= j0 + 2; j++) {
      if (j < 0 || j >= g.G) continue;
      var v = g.w[i * g.G + j];
      if (v) s += v * bx * bspline(sy - j - 0.5);
    }
  }
  return s;
}
