// Cusp groups on the boundary of the Maskit slice (tb = 2), as tracepqr.m (Chris King).
// For a fraction p/q the trace of the word W(p/q) is a polynomial in ta of degree q, built
// by walking down the Farey tree with the "grandfather" identity tr(uv) = tr(u)tr(v) − tr(uV).
// The cusp is the root of tr W(p/q) = 2 that lies on the boundary of the discrete groups;
// Newton's method from a nearby seed picks it out.

// Farey path to p/q: 0 = step left, 1 = step right
export function fareyPath(p, q) {
  const g = gcd(p, q);
  p /= g; q /= g;
  const s = [];
  let p0 = 0, q0 = 1, p1 = 1, q1 = 0, ph = 1, qh = 1;
  while (p !== ph || q !== qh) {
    if (ph * q > p * qh) { p1 = ph; q1 = qh; ph += p0; qh += q0; s.push(0); }
    else { p0 = ph; q0 = qh; ph += p1; qh += q1; s.push(1); }
    if (s.length > 100000) break;
  }
  return s;
}

export function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; }

// tr W(p/q) as a function of ta = [re, im]; nonfree uses tr(aB) = ta + √2·i instead of ta + 2i
function traceWord(s, tr, ti, nonfree) {
  let t0r = tr, t0i = ti;
  let t1r = tr, t1i = ti + (nonfree ? Math.SQRT2 : 2);
  let t2r = 2, t2i = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === 0) {
      const hr = t1r * t0r - t1i * t0i - t2r, hi = t1r * t0i + t1i * t0r - t2i;
      t2r = t1r; t2i = t1i; t1r = hr; t1i = hi;
    } else {
      const hr = t1r * t2r - t1i * t2i - t0r, hi = t1r * t2i + t1i * t2r - t0i;
      t0r = t1r; t0i = t1i; t1r = hr; t1i = hi;
    }
  }
  return [t1r, t1i];
}

// rough position of the p/q cusp, close enough for Newton to find the right root
export function seed(x, nonfree) {
  const depth = nonfree ? 0.3 : 0.38;
  return [2 - depth * Math.sin(Math.PI * x) ** 0.8, -2 * x * (nonfree ? Math.SQRT2 / 2 : 1)];
}

// Newton iteration for tr W(p/q) = 2 (as tracepqr.m, with a complex central difference)
export function cusp(p, q, { nonfree = false, start = null, tol = 1e-13, maxIter = 200 } = {}) {
  if (q <= 0 || p < 0 || p > q) return null;
  const s = fareyPath(p, q);
  let [vr, vi] = start || seed(p / q, nonfree);
  const hr = 1e-7, hi = 1e-7;
  let last = Infinity;
  for (let it = 0; it < maxIter; it++) {
    const [fr, fi] = traceWord(s, vr, vi, nonfree);
    const [ar, ai] = traceWord(s, vr + hr, vi + hi, nonfree);
    const [br, bi] = traceWord(s, vr - hr, vi - hi, nonfree);
    // df = (f(v+h) − f(v−h)) / 2h
    const nr = (ar - br) / 2, ni = (ai - bi) / 2;
    const dd = hr * hr + hi * hi;
    const dr = (nr * hr + ni * hi) / dd, di = (ni * hr - nr * hi) / dd;
    const gr = fr - 2, gi = fi;
    const den = dr * dr + di * di;
    if (!(den > 0) || !isFinite(den)) return null;
    const sr = (gr * dr + gi * di) / den, si = (gi * dr - gr * di) / den;
    // damp large steps: the polynomial has q roots and a wild step lands on the wrong one
    const len = Math.hypot(sr, si), lim = 0.05;
    const f = len > lim ? lim / len : 1;
    vr -= sr * f; vi -= si * f;
    if (len < tol) return [vr, vi];
    last = len;
  }
  return last < 1e-8 ? [vr, vi] : null;
}

// Single cusp, walking the Farey path from 0/1 and 1/1 down to p/q and solving each mediant
// on the way, seeded from its two parents. Robust even for large denominators.
export function cuspByPath(p, q, nonfree = false) {
  const g = gcd(p, q); p /= g; q /= g;
  const top = nonfree ? -Math.SQRT2 : -2;
  let L = { p: 0, q: 1, ta: [2, 0] }, R = null, cur = { p: 1, q: 1, ta: [2, top] };
  if (p === 0) return L.ta;
  // each step of the path moves past the current mediant, which becomes one of the new bounds
  for (const step of fareyPath(p, q)) {
    if (step === 0) R = cur; else L = cur;
    const m = { p: L.p + R.p, q: L.q + R.q };
    m.ta = solveBetween(m.p, m.q, L, R, nonfree);
    if (!m.ta) return null;
    cur = m;
  }
  return cur.ta;
}

function solveBetween(p, q, a, b, nonfree) {
  const start = [(a.ta[0] + b.ta[0]) / 2 - 0.02 * Math.hypot(a.ta[0] - b.ta[0], a.ta[1] - b.ta[1]), (a.ta[1] + b.ta[1]) / 2];
  return cusp(p, q, { nonfree, start }) || cusp(p, q, { nonfree });
}

// All cusps with denominator ≤ maxQ for 0 < p/q < 1, found in Farey-tree order so each
// seed is the average of its two Farey parents (which lie on either side of it on the boundary).
export function boundary(maxQ, nonfree = false) {
  const top = nonfree ? -Math.SQRT2 : -2;
  const pts = [{ p: 0, q: 1, x: 0, ta: [2, 0] }, { p: 1, q: 1, x: 1, ta: [2, top] }];
  const rec = (a, b) => {
    const p = a.p + b.p, q = a.q + b.q;
    if (q > maxQ) return;
    const ta = solveBetween(p, q, a, b, nonfree);
    const node = { p, q, x: p / q, ta, ok: !!ta };
    if (!ta) return;
    pts.push(node);
    rec(a, node);
    rec(node, b);
  };
  rec(pts[0], pts[1]);
  pts.sort((u, v) => u.x - v.x);
  return pts;
}
