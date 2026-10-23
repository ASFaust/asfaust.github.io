// Interactive flow-field demos for the Perlin paths essay.
// Each <div class="flow-demo" data-demo="components|angle|walk"> becomes a canvas
// with controls. World coordinates are noise units (one Perlin lattice cell = 1).
(function () {
  'use strict';

  // ---------- seeded Perlin noise ----------

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function makePerlin(seed) {
    var rnd = mulberry32(seed);
    var perm = [], p = new Uint8Array(512), gx = new Float64Array(256), gy = new Float64Array(256);
    var i;
    for (i = 0; i < 256; i++) perm[i] = i;
    for (i = 255; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)), t = perm[i];
      perm[i] = perm[j]; perm[j] = t;
    }
    for (i = 0; i < 512; i++) p[i] = perm[i & 255];
    for (i = 0; i < 256; i++) {
      var a = rnd() * Math.PI * 2;
      gx[i] = Math.cos(a); gy[i] = Math.sin(a);
    }
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    // Output is in [-1, 1]: unit gradients bound raw Perlin by sqrt(2)/2, so scale by sqrt(2).
    return function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      var X = xi & 255, Y = yi & 255;
      var h00 = p[p[X] + Y], h10 = p[p[X + 1] + Y], h01 = p[p[X] + Y + 1], h11 = p[p[X + 1] + Y + 1];
      var n00 = gx[h00] * xf + gy[h00] * yf;
      var n10 = gx[h10] * (xf - 1) + gy[h10] * yf;
      var n01 = gx[h01] * xf + gy[h01] * (yf - 1);
      var n11 = gx[h11] * (xf - 1) + gy[h11] * (yf - 1);
      var u = fade(xf), v = fade(yf);
      var a0 = n00 + u * (n10 - n00), a1 = n01 + u * (n11 - n01);
      return Math.SQRT2 * (a0 + v * (a1 - a0));
    };
  }

  // Two independent noises. The second is shifted off the lattice: Perlin noise is zero
  // at every lattice point, so two unshifted noises would share a zero at each one.
  function makeNoise(seed) {
    var a = makePerlin(seed), b = makePerlin(seed * 7919 + 13);
    return {
      a: a,
      b: function (x, y) { return b(x + 0.37, y + 0.61); }
    };
  }

  // ---------- fields and integration ----------

  // mode: 'raw' (vx, vy) = (a, b); 'normalized' the same divided by its length;
  // 'angle' (cos θ, sin θ) with θ = amp · a.
  function makeVelocity(noise, mode, amp) {
    if (mode === 'angle') {
      return function (x, y, out) {
        var t = amp * noise.a(x, y);
        out[0] = Math.cos(t); out[1] = Math.sin(t);
      };
    }
    var norm = mode === 'normalized';
    return function (x, y, out) {
      var u = noise.a(x, y), v = noise.b(x, y);
      if (norm) {
        var l = Math.hypot(u, v);
        if (l > 0) { u /= l; v /= l; }
      }
      out[0] = u; out[1] = v;
    };
  }

  var k1 = [0, 0], k2 = [0, 0], k3 = [0, 0], k4 = [0, 0];
  function rk4(f, x, y, h, out) {
    f(x, y, k1);
    f(x + h / 2 * k1[0], y + h / 2 * k1[1], k2);
    f(x + h / 2 * k2[0], y + h / 2 * k2[1], k3);
    f(x + h * k3[0], y + h * k3[1], k4);
    out[0] = x + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    out[1] = y + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  }

  // Zeros of the raw field, found by Newton's method from a grid of starting points,
  // and classified by the Jacobian there.
  function findZeros(noise, x0, y0, x1, y1) {
    var zeros = [], e = 1e-5, s = 0.2;
    function F(x, y) { return [noise.a(x, y), noise.b(x, y)]; }
    for (var sx = x0 - s; sx < x1 + s; sx += s) {
      for (var sy = y0 - s; sy < y1 + s; sy += s) {
        var x = sx, y = sy, ok = false, J;
        for (var it = 0; it < 30; it++) {
          var f = F(x, y);
          if (Math.hypot(f[0], f[1]) < 1e-10) { ok = true; break; }
          var fx1 = F(x + e, y), fx0 = F(x - e, y), fy1 = F(x, y + e), fy0 = F(x, y - e);
          J = [(fx1[0] - fx0[0]) / (2 * e), (fy1[0] - fy0[0]) / (2 * e),
               (fx1[1] - fx0[1]) / (2 * e), (fy1[1] - fy0[1]) / (2 * e)];
          var det = J[0] * J[3] - J[1] * J[2];
          if (Math.abs(det) < 1e-12) break;
          var dx = (J[3] * f[0] - J[1] * f[1]) / det, dy = (-J[2] * f[0] + J[0] * f[1]) / det;
          x -= dx; y -= dy;
          if (Math.abs(x - sx) > 1 || Math.abs(y - sy) > 1) break;
        }
        if (!ok || x < x0 || x > x1 || y < y0 || y > y1) continue;
        var dup = zeros.some(function (z) { return Math.hypot(z.x - x, z.y - y) < 1e-3; });
        if (dup) continue;
        var a = F(x + e, y), b = F(x - e, y), c = F(x, y + e), d = F(x, y - e);
        var j00 = (a[0] - b[0]) / (2 * e), j01 = (c[0] - d[0]) / (2 * e);
        var j10 = (a[1] - b[1]) / (2 * e), j11 = (c[1] - d[1]) / (2 * e);
        var tr = j00 + j11, dt = j00 * j11 - j01 * j10, type;
        if (dt < 0) type = 'saddle';
        else if (tr * tr < 4 * dt) type = 'whirl';
        else type = tr < 0 ? 'sink' : 'source';
        zeros.push({ x: x, y: y, type: type });
      }
    }
    return zeros;
  }

  // ---------- paths with self-crossing detection ----------

  var CELL = 0.08;
  function cellKey(ix, iy) { return ix * 4194304 + iy; }

  function Path(x, y) {
    this.xs = [x]; this.ys = [y];
    this.cells = new Map();
    this.stamp = [];
    this.alive = true;
    this.steps = 0;
    this.crossings = [];
  }

  function orient(ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); }

  // Appends a point; tests the new segment against all earlier non-adjacent segments.
  Path.prototype.add = function (x, y) {
    var xs = this.xs, ys = this.ys, n = xs.length, j = n - 1;
    var px = xs[j], py = ys[j];
    xs.push(x); ys.push(y);
    var cx0 = Math.floor(Math.min(px, x) / CELL), cx1 = Math.floor(Math.max(px, x) / CELL);
    var cy0 = Math.floor(Math.min(py, y) / CELL), cy1 = Math.floor(Math.max(py, y) / CELL);
    for (var ix = cx0; ix <= cx1; ix++) {
      for (var iy = cy0; iy <= cy1; iy++) {
        var key = cellKey(ix, iy), list = this.cells.get(key);
        if (!list) { list = []; this.cells.set(key, list); }
        for (var k = 0; k < list.length; k++) {
          var i = list[k];
          if (i >= j - 1 || this.stamp[i] === j) continue;
          this.stamp[i] = j;
          var ax = xs[i], ay = ys[i], bx = xs[i + 1], by = ys[i + 1];
          var d1 = orient(ax, ay, bx, by, px, py), d2 = orient(ax, ay, bx, by, x, y);
          if (d1 * d2 >= 0) continue;
          var d3 = orient(px, py, x, y, ax, ay), d4 = orient(px, py, x, y, bx, by);
          if (d3 * d4 >= 0) continue;
          var t = d3 / (d3 - d4);
          this.crossings.push(ax + t * (bx - ax), ay + t * (by - ay));
        }
        list.push(j);
      }
    }
  };

  Path.prototype.length = function () {
    var L = 0, xs = this.xs, ys = this.ys;
    for (var i = 1; i < xs.length; i++) L += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    return L;
  };

  // ---------- theme ----------

  function themeColors() {
    var cs = getComputedStyle(document.documentElement);
    function v(name, fallback) { return (cs.getPropertyValue(name) || '').trim() || fallback; }
    return {
      bg: v('--color-bg', '#fff'),
      text: v('--color-text-primary', '#1a1a1a'),
      muted: v('--color-text-secondary', '#555'),
      border: v('--color-border-secondary', '#ccc'),
      accent: v('--color-accent', '#c0502a'),
      warn: v('--color-warn', '#d11'),
      arrow: v('--color-arrow', 'rgba(0,0,0,0.35)')
    };
  }

  // ---------- demo widget ----------

  var PRESETS = {
    components: { mode: 'raw', worldWidth: 5, seeds: 12, normalizable: true, zeros: true, h: 0.01, spf: 3, maxSteps: 2500 },
    angle: { mode: 'angle', worldWidth: 5, seeds: 12, h: 0.01, spf: 3, maxSteps: 4000 },
    walk: { mode: 'angle', worldWidth: 10, follow: true, h: 0.01, spf: 4, maxPoints: 200000 }
  };

  function el(tag, attrs, parent) {
    var e = document.createElement(tag);
    for (var k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  function Demo(root, cfg) {
    var self = this;
    this.root = root;
    this.cfg = cfg;
    this.mode = cfg.mode;
    // θ = 2π · noise, with the noise scaled to [-1, 1].
    this.amp = 360;
    this.seed = 1 + Math.floor(Math.random() * 1e6);
    this.paths = [];
    this.starts = [];
    this.zeros = [];
    this.showArrows = true;
    this.visible = false;
    this.cam = { x: 0, y: 0 };

    this.canvas = el('canvas', {}, root);
    this.ctx = this.canvas.getContext('2d');
    var controls = el('div', { class: 'flow-controls' }, root);
    var newBtn = el('button', { type: 'button', text: 'New noise' }, controls);
    newBtn.addEventListener('click', function () { self.seed = 1 + Math.floor(Math.random() * 1e6); self.reset(true); });

    if (!cfg.follow) {
      var clr = el('button', { type: 'button', text: 'Clear' }, controls);
      clr.addEventListener('click', function () { self.starts = []; self.restartPaths(); });
    } else {
      var rs = el('button', { type: 'button', text: 'Restart' }, controls);
      rs.addEventListener('click', function () { self.reset(false); });
    }

    if (cfg.normalizable) {
      var lab = el('label', {}, controls);
      var cb = el('input', { type: 'checkbox' }, lab);
      lab.appendChild(document.createTextNode(' normalize to unit speed'));
      cb.addEventListener('change', function () { self.mode = cb.checked ? 'normalized' : 'raw'; self.arrowsDirty = true; self.restartPaths(); });
    }

    if (cfg.follow) {
      var lab3 = el('label', {}, controls);
      var cb3 = el('input', { type: 'checkbox', checked: 'checked' }, lab3);
      lab3.appendChild(document.createTextNode(' arrows'));
      cb3.addEventListener('change', function () { self.showArrows = cb3.checked; });
    }

    if (cfg.zeros) {
      el('div', { class: 'flow-legend', html:
        '<span><svg viewBox="-6 -6 12 12"><circle r="4" fill="currentColor"/></svg>sink</span>' +
        '<span><svg viewBox="-6 -6 12 12"><circle r="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>source</span>' +
        '<span><svg viewBox="-6 -6 12 12"><path d="M-4,-4L4,4M-4,4L4,-4" stroke="currentColor" stroke-width="1.5"/></svg>saddle</span>' +
        '<span><svg viewBox="-6 -6 12 12"><circle r="4.5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle r="1.6" fill="currentColor"/></svg>whirl</span>' +
        '<span><svg viewBox="-6 -6 12 12"><circle r="4" fill="none" stroke="var(--color-warn)" stroke-width="1.5"/></svg>self-crossing</span>'
      }, root);
    }
    this.status = el('div', { class: 'flow-status' }, root);

    if (!cfg.follow) {
      this.canvas.addEventListener('click', function (ev) {
        var r = self.canvas.getBoundingClientRect();
        var w = self.toWorld(ev.clientX - r.left, ev.clientY - r.top);
        self.starts.push(w);
        self.paths.push(new Path(w[0], w[1]));
      });
    }

    this.colors = themeColors();
    new MutationObserver(function () { self.colors = themeColors(); self.arrowsDirty = true; })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', function () { self.resize(); });
    new IntersectionObserver(function (entries) {
      self.visible = entries[0].isIntersecting;
      if (self.visible) self.loop();
    }).observe(this.canvas);

    this.resize();
    this.reset(true);
  }

  Demo.prototype.resize = function () {
    var w = this.root.clientWidth || 600;
    var h = Math.round(Math.max(280, Math.min(w * (this.cfg.follow ? 0.75 : 0.62), 520)));
    var dpr = window.devicePixelRatio || 1;
    this.W = w; this.H = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.scale = w / this.cfg.worldWidth;
    this.arrowsDirty = true;
    if (this.noise && this.cfg.zeros) this.computeZeros();
    this.draw();
  };

  Demo.prototype.toWorld = function (sx, sy) {
    return [this.cam.x + (sx - this.W / 2) / this.scale, this.cam.y + (sy - this.H / 2) / this.scale];
  };
  Demo.prototype.toScreen = function (x, y) {
    return [(x - this.cam.x) * this.scale + this.W / 2, (y - this.cam.y) * this.scale + this.H / 2];
  };
  Demo.prototype.bounds = function () {
    var a = this.toWorld(0, 0), b = this.toWorld(this.W, this.H);
    return [a[0], a[1], b[0], b[1]];
  };

  Demo.prototype.velocity = function () {
    return makeVelocity(this.noise, this.mode, this.amp * Math.PI / 180);
  };

  Demo.prototype.computeZeros = function () {
    var b = this.bounds();
    this.zeros = findZeros(this.noise, b[0], b[1], b[2], b[3]);
  };

  // newSeeds: also pick new random starting points (fixed views only).
  Demo.prototype.reset = function (newSeeds) {
    this.noise = makeNoise(this.seed);
    this.arrowsDirty = true;
    if (this.cfg.follow) {
      this.cam = { x: 0.5, y: 0.5 };
      this.paths = [new Path(0.5, 0.5)];
    } else {
      this.cam = { x: 0, y: 0 };
      if (newSeeds) {
        var rnd = mulberry32(this.seed + 99), b = this.bounds();
        this.starts = [];
        for (var i = 0; i < this.cfg.seeds; i++) {
          this.starts.push([b[0] + (0.05 + 0.9 * rnd()) * (b[2] - b[0]), b[1] + (0.05 + 0.9 * rnd()) * (b[3] - b[1])]);
        }
      }
      if (this.cfg.zeros) this.computeZeros();
      this.restartPaths();
    }
    this.draw();
  };

  Demo.prototype.restartPaths = function () {
    this.paths = this.starts.map(function (s) { return new Path(s[0], s[1]); });
    this.draw();
  };

  Demo.prototype.step = function () {
    var f = this.velocity(), cfg = this.cfg, out = [0, 0], v = [0, 0];
    var b = this.bounds(), m = 0.3;
    for (var p = 0; p < this.paths.length; p++) {
      var path = this.paths[p];
      if (!path.alive) continue;
      for (var s = 0; s < cfg.spf; s++) {
        var n = path.xs.length, x = path.xs[n - 1], y = path.ys[n - 1];
        f(x, y, v);
        // The raw field slows to a crawl near a sink; call such a path stalled.
        if (Math.hypot(v[0], v[1]) < 0.004) { path.alive = false; path.stalled = true; break; }
        rk4(f, x, y, cfg.h, out);
        path.add(out[0], out[1]);
        path.steps++;
        // A normalized path caught at a zero scribbles over itself forever; let it rest.
        if (path.crossings.length >= 80) { path.alive = false; path.stalled = true; break; }
        if (cfg.follow) {
          if (path.xs.length >= cfg.maxPoints) { path.alive = false; break; }
        } else if (path.steps >= cfg.maxSteps ||
                   out[0] < b[0] - m || out[0] > b[2] + m || out[1] < b[1] - m || out[1] > b[3] + m) {
          path.alive = false; break;
        }
      }
    }
    if (cfg.follow && this.paths.length) {
      var hp = this.paths[0], k = hp.xs.length - 1;
      this.cam.x += (hp.xs[k] - this.cam.x) * 0.04;
      this.cam.y += (hp.ys[k] - this.cam.y) * 0.04;
      if (!hp.alive) { this.seed = 1 + Math.floor(Math.random() * 1e6); this.reset(false); }
    }
  };

  Demo.prototype.drawArrows = function (ctx) {
    var f = this.velocity(), v = [0, 0];
    var spacing = 26 / this.scale;
    var b = this.bounds();
    var unit = this.mode !== 'raw';
    var len = 0.36 * spacing;
    ctx.beginPath();
    for (var gx = Math.floor(b[0] / spacing) * spacing; gx <= b[2] + spacing; gx += spacing) {
      for (var gy = Math.floor(b[1] / spacing) * spacing; gy <= b[3] + spacing; gy += spacing) {
        var cx = gx + spacing / 2, cy = gy + spacing / 2;
        f(cx, cy, v);
        var m = Math.hypot(v[0], v[1]);
        if (m < 1e-9) continue;
        var l = unit ? len : len * Math.min(1, m / 0.7);
        var ux = v[0] / m, uy = v[1] / m;
        var p0 = this.toScreen(cx - ux * l, cy - uy * l), p1 = this.toScreen(cx + ux * l, cy + uy * l);
        ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
        var hl = Math.min(4, 0.45 * l * this.scale);
        ctx.moveTo(p1[0] - hl * (ux - 0.5 * uy), p1[1] - hl * (uy + 0.5 * ux));
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p1[0] - hl * (ux + 0.5 * uy), p1[1] - hl * (uy - 0.5 * ux));
      }
    }
    ctx.strokeStyle = this.colors.arrow;
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  Demo.prototype.drawZeros = function (ctx) {
    var c = this.colors;
    for (var i = 0; i < this.zeros.length; i++) {
      var z = this.zeros[i], p = this.toScreen(z.x, z.y);
      ctx.beginPath();
      ctx.strokeStyle = c.text; ctx.fillStyle = c.text; ctx.lineWidth = 1.5;
      if (z.type === 'sink') { ctx.arc(p[0], p[1], 4, 0, 7); ctx.fill(); }
      else if (z.type === 'source') { ctx.arc(p[0], p[1], 4, 0, 7); ctx.fillStyle = c.bg; ctx.fill(); ctx.stroke(); }
      else if (z.type === 'saddle') { ctx.moveTo(p[0] - 4, p[1] - 4); ctx.lineTo(p[0] + 4, p[1] + 4); ctx.moveTo(p[0] - 4, p[1] + 4); ctx.lineTo(p[0] + 4, p[1] - 4); ctx.stroke(); }
      else { ctx.lineWidth = 1.2; ctx.arc(p[0], p[1], 4.5, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(p[0], p[1], 1.6, 0, 7); ctx.fill(); }
    }
  };

  Demo.prototype.drawPaths = function (ctx) {
    var c = this.colors;
    var W = this.W, H = this.H, pad = 20;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (var p = 0; p < this.paths.length; p++) {
      var path = this.paths[p], xs = path.xs, ys = path.ys;
      ctx.beginPath();
      var pen = false;
      for (var i = 0; i < xs.length; i++) {
        var q = this.toScreen(xs[i], ys[i]);
        var inside = q[0] > -pad && q[0] < W + pad && q[1] > -pad && q[1] < H + pad;
        if (inside || pen) {
          if (pen) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
        }
        pen = inside;
      }
      ctx.strokeStyle = c.accent; ctx.lineWidth = 1.8;
      ctx.stroke();
      var s = this.toScreen(xs[0], ys[0]);
      ctx.beginPath(); ctx.arc(s[0], s[1], 2.5, 0, 7); ctx.fillStyle = c.accent; ctx.fill();
      var e = this.toScreen(xs[xs.length - 1], ys[ys.length - 1]);
      if (path.alive) { ctx.beginPath(); ctx.arc(e[0], e[1], 3.5, 0, 7); ctx.fill(); }
      var cr = path.crossings;
      ctx.strokeStyle = c.warn; ctx.lineWidth = 1.5;
      for (var k = 0; k < cr.length; k += 2) {
        var r = this.toScreen(cr[k], cr[k + 1]);
        ctx.beginPath(); ctx.arc(r[0], r[1], 5, 0, 7); ctx.stroke();
      }
    }
  };

  Demo.prototype.draw = function () {
    var ctx = this.ctx, c = this.colors;
    if (!this.noise) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.cfg.follow) {
      ctx.fillStyle = c.bg; ctx.fillRect(0, 0, this.W, this.H);
      if (this.showArrows) this.drawArrows(ctx);
    } else {
      // Arrows and zeros don't move in a fixed view; cache them.
      if (this.arrowsDirty || !this.layer) {
        this.layer = this.layer || document.createElement('canvas');
        this.layer.width = this.canvas.width; this.layer.height = this.canvas.height;
        var lc = this.layer.getContext('2d');
        lc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        lc.fillStyle = c.bg; lc.fillRect(0, 0, this.W, this.H);
        this.drawArrows(lc);
        if (this.cfg.zeros) this.drawZeros(lc);
        this.arrowsDirty = false;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.layer, 0, 0);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    this.drawPaths(ctx);
    this.updateStatus();
  };

  Demo.prototype.updateStatus = function () {
    var cross = 0, stalled = 0;
    for (var i = 0; i < this.paths.length; i++) {
      cross += this.paths[i].crossings.length / 2;
      if (this.paths[i].stalled) stalled++;
    }
    var parts = [];
    if (this.cfg.follow) {
      var p = this.paths[0];
      parts.push('path length ' + Math.round(p.steps * this.cfg.h) + ' cells');
    } else {
      parts.push(this.paths.length + ' paths');
      if (this.cfg.zeros) parts.push(this.zeros.length + ' zeros in view');
      if (this.cfg.zeros) parts.push(stalled + ' stuck');
    }
    parts.push(cross + ' self-crossings');
    parts.push(this.cfg.follow ? '' : 'click to start a path');
    this.status.textContent = parts.filter(Boolean).join(' · ');
  };

  Demo.prototype.loop = function () {
    if (this.running) return;
    this.running = true;
    var self = this;
    function frame() {
      if (!self.visible) { self.running = false; return; }
      self.step();
      self.draw();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  var demos = [];
  document.querySelectorAll('.flow-demo').forEach(function (node) {
    var cfg = PRESETS[node.getAttribute('data-demo')];
    if (cfg) demos.push(new Demo(node, cfg));
  });
  window.flowDemos = demos;
})();
