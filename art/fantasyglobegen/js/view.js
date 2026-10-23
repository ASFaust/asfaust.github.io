// WebGL2 drawing of a field on the grid, as a globe or as an equirectangular map.
//
// Cell positions and the field live in float textures indexed by cell id, and every
// triangle vertex carries just its cell id and its corner number (0, 1, 2). The fragment
// shader can then show either a smooth interpolation or the dual cells themselves: the
// cell of the corner with the largest barycentric coordinate, which is the hexagon (or
// pentagon) around that vertex, with its border where the two largest coordinates meet.

const TEX_W = 2048;

const VS = `#version 300 es
precision highp float;
precision highp int;
in uint aPack;
in float aLon;
uniform highp sampler2D uPos;
uniform highp sampler2D uField;
uniform mat4 uMVP;
uniform int uMap;
uniform vec4 uMapXf;   // centre x, centre y, zoom, canvas aspect
out vec3 vBary;
out vec3 vVals;
out float vVal;
out vec3 vN;
void main() {
  uint id = aPack >> 2u, c = aPack & 3u;
  ivec2 t = ivec2(int(id % ${TEX_W}u), int(id / ${TEX_W}u));
  vec3 p = texelFetch(uPos, t, 0).xyz;
  float v = texelFetch(uField, t, 0).r;
  vBary = vec3(c == 0u, c == 1u, c == 2u);
  vVals = vBary * v;
  vVal = v;
  vN = p;
  if (uMap == 1) {
    float lat = asin(clamp(p.z, -1.0, 1.0));
    vec2 q = vec2(aLon / 3.14159265, lat / 3.14159265);
    gl_Position = vec4((q.x - uMapXf.x) * uMapXf.z, (q.y - uMapXf.y) * uMapXf.z * uMapXf.w, 0.0, 1.0);
  } else {
    gl_Position = uMVP * vec4(p, 1.0);
  }
}`;

const FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vBary;
in vec3 vVals;
in float vVal;
in vec3 vN;
uniform int uFlat;
uniform int uBorders;
uniform int uCmap;
uniform int uMap;
uniform vec2 uRange;
uniform vec3 uLight;
out vec4 outColor;

vec3 viridis(float t) {
  const vec3 c0 = vec3(0.2777, 0.0054, 0.3341), c1 = vec3(0.1050, 1.4046, 1.3846);
  const vec3 c2 = vec3(-0.3309, 0.2148, 0.0951), c3 = vec3(-4.6342, -5.7991, -19.3324);
  const vec3 c4 = vec3(6.2283, 14.1799, 56.6906), c5 = vec3(4.7764, -13.7451, -65.3530);
  const vec3 c6 = vec3(-5.4355, 4.6459, 26.3124);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
vec3 diverging(float t) {
  vec3 lo = vec3(0.23, 0.30, 0.75), mid = vec3(0.92, 0.92, 0.90), hi = vec3(0.71, 0.02, 0.15);
  return t < 0.5 ? mix(lo, mid, t * 2.0) : mix(mid, hi, t * 2.0 - 1.0);
}
vec3 category(float k) {
  int i = int(k + 0.5);
  if (i == 0) return vec3(0.89, 0.47, 0.35);
  if (i == 1) return vec3(0.93, 0.70, 0.36);
  if (i == 2) return vec3(0.62, 0.78, 0.42);
  if (i == 3) return vec3(0.38, 0.70, 0.66);
  if (i == 4) return vec3(0.45, 0.58, 0.85);
  if (i == 5) return vec3(0.70, 0.36, 0.30);
  if (i == 6) return vec3(0.74, 0.55, 0.25);
  if (i == 7) return vec3(0.40, 0.58, 0.30);
  if (i == 8) return vec3(0.22, 0.50, 0.50);
  if (i == 9) return vec3(0.30, 0.38, 0.66);
  if (i == 10) return vec3(0.95, 0.95, 0.95);
  return vec3(0.12, 0.12, 0.12);
}
void main() {
  float val = vVal;
  float b1 = max(vBary.x, max(vBary.y, vBary.z));
  float b2 = vBary.x + vBary.y + vBary.z - b1 - min(vBary.x, min(vBary.y, vBary.z));
  if (uFlat == 1) {
    val = vBary.x == b1 ? vVals.x / vBary.x : vBary.y == b1 ? vVals.y / vBary.y : vVals.z / vBary.z;
  }
  float t = clamp((val - uRange.x) / (uRange.y - uRange.x), 0.0, 1.0);
  vec3 col = uCmap == 1 ? category(val) : uCmap == 2 ? diverging(t) : viridis(t);
  if (uBorders == 1) {
    // borders fade out once cells shrink to a few pixels, before they turn into moiré
    float d = b1 - b2, w = fwidth(d);
    col *= mix(mix(0.55, 1.0, smoothstep(0.0, w * 1.5, d)), 1.0, smoothstep(0.08, 0.2, w));
  }
  if (uMap == 0) col *= 0.45 + 0.55 * max(dot(normalize(vN), uLight), 0.0);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

// equirectangular triangles: longitudes unwrapped per triangle, copies across the seam,
// and a triangle at a pole drawn as a quad whose top edge runs along the pole's row
function mapTriangles(grid) {
  const { tris, pos, north, south } = grid;
  const T = tris.length / 3;
  const packs = [], lons = [];
  const emit = (id, c, lon) => { packs.push((id << 2) | c); lons.push(lon); };
  const lonOf = id => Math.atan2(pos[3 * id + 1], pos[3 * id]);
  for (let k = 0; k < T; k++) {
    const v = [tris[3 * k], tris[3 * k + 1], tris[3 * k + 2]];
    const pole = v.findIndex(id => id === north || id === south);
    const l = v.map(lonOf);
    const ref = l[pole === 0 ? 1 : 0];
    for (let c = 0; c < 3; c++) {
      if (c === pole) continue;
      if (l[c] - ref > Math.PI) l[c] -= 2 * Math.PI;
      else if (l[c] - ref < -Math.PI) l[c] += 2 * Math.PI;
    }
    let lo = Infinity, hi = -Infinity;
    for (let c = 0; c < 3; c++) if (c !== pole) { lo = Math.min(lo, l[c]); hi = Math.max(hi, l[c]); }
    for (const shift of [0, 2 * Math.PI, -2 * Math.PI]) {
      if (shift > 0 && lo >= -Math.PI) continue;
      if (shift < 0 && hi <= Math.PI) continue;
      if (pole < 0) {
        for (let c = 0; c < 3; c++) emit(v[c], c, l[c] + shift);
      } else {
        // the corners after the pole, in order, then the pole at both their longitudes
        const b = (pole + 1) % 3, c = (pole + 2) % 3;
        emit(v[pole], pole, l[b] + shift); emit(v[b], b, l[b] + shift); emit(v[c], c, l[c] + shift);
        emit(v[pole], pole, l[b] + shift); emit(v[c], c, l[c] + shift); emit(v[pole], pole, l[c] + shift);
      }
    }
  }
  return { packs: new Uint32Array(packs), lons: new Float32Array(lons) };
}

export class GlobeView {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('This page needs WebGL2, which this browser does not offer.');
    this.gl = gl;
    this.canvas = canvas;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'aPack');
    gl.bindAttribLocation(prog, 1, 'aLon');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    this.u = {};
    for (const n of ['uPos', 'uField', 'uMVP', 'uMap', 'uMapXf', 'uFlat', 'uBorders', 'uCmap', 'uRange', 'uLight']) this.u[n] = gl.getUniformLocation(prog, n);
    // float textures can't be filtered: without NEAREST they're incomplete and read as zero
    const dataTexture = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      return t;
    };
    this.posTex = dataTexture();
    this.fieldTex = dataTexture();
    this.globeVao = gl.createVertexArray();
    this.mapVao = gl.createVertexArray();
    this.buffers = [];
    this.camera = { yaw: 0.6, pitch: 0.35, dist: 4.4 };
    this.mapView = { x: 0, y: 0, zoom: 1 };
    this.mode = 'globe';
    this.style = { flat: true, borders: false, cmap: 0, range: [0, 1] };
    this.grid = null;
  }

  setGrid(grid) {
    const gl = this.gl;
    this.grid = grid;
    const N = grid.count, H = Math.ceil(N / TEX_W);
    const pos = new Float32Array(TEX_W * H * 3);
    pos.set(grid.pos);
    gl.bindTexture(gl.TEXTURE_2D, this.posTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB32F, TEX_W, H, 0, gl.RGB, gl.FLOAT, pos);
    this.texH = H;
    for (const b of this.buffers) gl.deleteBuffer(b);
    this.buffers = [];
    const buffer = (data) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      this.buffers.push(b);
      return b;
    };
    // globe: every triangle's three corners
    const T = grid.tris.length / 3, packs = new Uint32Array(3 * T);
    for (let k = 0; k < 3 * T; k++) packs[k] = (grid.tris[k] << 2) | (k % 3);
    gl.bindVertexArray(this.globeVao);
    buffer(packs);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribIPointer(0, 1, gl.UNSIGNED_INT, 0, 0);
    gl.disableVertexAttribArray(1);
    gl.vertexAttrib1f(1, 0);
    this.globeCount = 3 * T;
    // map
    const m = mapTriangles(grid);
    gl.bindVertexArray(this.mapVao);
    buffer(m.packs);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribIPointer(0, 1, gl.UNSIGNED_INT, 0, 0);
    buffer(m.lons);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    this.mapCount = m.packs.length;
    gl.bindVertexArray(null);
  }

  setField(values, style) {
    const gl = this.gl;
    const data = new Float32Array(TEX_W * this.texH);
    data.set(values);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, TEX_W, this.texH, 0, gl.RED, gl.FLOAT, data);
    Object.assign(this.style, style);
  }

  resize() {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }

  draw() {
    const gl = this.gl;
    if (!this.grid) return;
    this.resize();
    const W = this.canvas.width, H = this.canvas.height, aspect = W / H;
    gl.viewport(0, 0, W, H);
    const bg = getComputedStyle(this.canvas).getPropertyValue('--stage-rgb').trim().split(',').map(Number);
    gl.clearColor(...(bg.length === 3 ? bg.map(v => v / 255) : [0, 0, 0]), 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.posTex); gl.uniform1i(this.u.uPos, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.fieldTex); gl.uniform1i(this.u.uField, 1);
    const s = this.style;
    gl.uniform1i(this.u.uFlat, s.flat ? 1 : 0);
    gl.uniform1i(this.u.uBorders, s.borders ? 1 : 0);
    gl.uniform1i(this.u.uCmap, s.cmap);
    gl.uniform2f(this.u.uRange, s.range[0], s.range[1]);
    if (this.mode === 'globe') {
      const { yaw, pitch, dist } = this.camera;
      const eye = [dist * Math.cos(pitch) * Math.cos(yaw), dist * Math.cos(pitch) * Math.sin(yaw), dist * Math.sin(pitch)];
      gl.uniformMatrix4fv(this.u.uMVP, false, mul(perspective(0.55, aspect, 0.05, 20), lookAt(eye)));
      // light from above the camera's left shoulder
      const lx = Math.cos(pitch + 0.5) * Math.cos(yaw + 0.6), ly = Math.cos(pitch + 0.5) * Math.sin(yaw + 0.6), lz = Math.sin(pitch + 0.5);
      gl.uniform3f(this.u.uLight, lx, ly, lz);
      gl.uniform1i(this.u.uMap, 0);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.bindVertexArray(this.globeVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.globeCount);
    } else {
      const v = this.mapView;
      gl.uniform1i(this.u.uMap, 1);
      gl.uniform4f(this.u.uMapXf, v.x, v.y, v.zoom, aspect);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.mapVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.mapCount);
    }
    gl.bindVertexArray(null);
  }
}

// column-major 4×4 matrices
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function lookAt(eye) {
  const len = Math.hypot(...eye);
  const z = eye.map(v => v / len);
  let x = [-z[1], z[0], 0];
  const xl = Math.hypot(...x) || 1;
  x = x.map(v => v / xl);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
