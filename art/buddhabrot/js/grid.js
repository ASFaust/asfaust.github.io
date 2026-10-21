// The grid sampler's density, shared by compute.js (which builds it and draws the starting points) and worker.js
// (Metropolis). A grid g = { G, x0, y0, h, w, cells, cum }: cell (i, j) spans real parts x0 + [i, i+1]·h and
// imaginary parts y0 + [j, j+1]·h and has weight w[i·G + j]; cells lists the cells with weight, cum their running
// sum. The density is w of the cell, constant within it, divided by cum's total times h².

// a random point with this density; rand() is uniform on [0, 1)
export function pick(g, rand, out) {
  var x = rand() * g.cum[g.cum.length - 1], lo = 0, hi = g.cum.length - 1;
  while (lo < hi) { var mid = (lo + hi) >> 1; if (g.cum[mid] > x) hi = mid; else lo = mid + 1; }
  var cell = g.cells[lo];
  out[0] = g.x0 + ((cell / g.G | 0) + rand()) * g.h;
  out[1] = g.y0 + (cell % g.G + rand()) * g.h;
}

// the weight at c, up to the constant factor: 0 outside the grid's cells
export function weight(g, cr, ci) {
  var i = Math.floor((cr - g.x0) / g.h), j = Math.floor((ci - g.y0) / g.h);
  return i >= 0 && i < g.G && j >= 0 && j < g.G ? g.w[i * g.G + j] : 0;
}
