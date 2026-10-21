// The 3D view: three.js, faces as flat-shaded triangles with the edges painted onto them as flat
// bands. Drag to turn, wheel or pinch to zoom, double-click to reset.

import * as THREE from '../vendor/three.module.min.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { GTAOPass } from '../vendor/addons/postprocessing/GTAOPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';

export const STYLES = ['solid', 'glass', 'frame'];
export const COLOURINGS = ['origin', 'sides', 'orbit', 'single'];
export const MATERIALS = ['matte', 'glossy', 'metal', 'iridescent'];

// material settings; the environment map matters most for metal
const LOOKS = {
  matte: { roughness: 0.55, metalness: 0, clearcoat: 0, iridescence: 0, env: 0.6 },
  glossy: { roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0, env: 0.8 },
  metal: { roughness: 0.28, metalness: 1, clearcoat: 0, iridescence: 0, env: 1.4 },
  // mostly metallic, so that the thin film colours the whole reflection, not just the rims
  iridescent: { roughness: 0.2, metalness: 0.85, clearcoat: 0, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 900], env: 1.4 },
};
export const INKS = ['auto', 'dark', 'light', 'colour'];

const HOME = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, -0.5, 0));
const SPIN = 0.25; // radians per second when turning by itself
const FAR = 1e9;   // the distance to a line that does not count

// Every triangle drawn carries, at each corner, the signed distances to three lines of its face's
// boundary: for the fan triangle of side k, the lines through sides k − 1, k and k + 1. Distance
// to a line is affine in the plane, so it interpolates exactly; the fragment takes the smallest
// and paints the edge where that is below the half-width. In the frame style everything else is
// cut away.
function paintEdges(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 edist;\nvarying vec3 vEdist;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdist = edist;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uInk;\nuniform float uWidth;\nuniform float uFrame;\nvarying vec3 vEdist;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ed = min(vEdist.x, min(vEdist.y, vEdist.z));
        float fw = fwidth(ed);
        float line = uWidth > 0.0 ? 1.0 - smoothstep(uWidth - fw, uWidth + fw, ed) : 0.0;
        diffuseColor.rgb = mix(diffuseColor.rgb, uInk, line);
        diffuseColor.a = mix(diffuseColor.a, 1.0, line);
        if (uFrame > 0.5) {
          if (line < 0.01) discard;
          diffuseColor.a = line;
        }`);
  };
}

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-2, 3, 4);
    this.scene.add(key, new THREE.HemisphereLight(0xffffff, 0x888888, 0.5));

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    this.group = new THREE.Group();
    this.group.quaternion.copy(HOME);
    this.scene.add(this.group);

    this.uniforms = { uInk: { value: new THREE.Color(0x1c1c20) }, uWidth: { value: 0 }, uFrame: { value: 0 } };
    this.faceMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 });
    this.backMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.BackSide });
    paintEdges(this.faceMat, this.uniforms);
    paintEdges(this.backMat, this.uniforms);
    this.faces = new THREE.Mesh(new THREE.BufferGeometry(), this.faceMat);
    this.backs = new THREE.Mesh(this.faces.geometry, this.backMat);
    this.backs.renderOrder = -1;
    this.group.add(this.backs, this.faces);

    // Ambient occlusion: a screen-space pass (GTAO) between the scene and the output. It is used
    // for the solid style only; the others are see-through, which it does not handle. Its radius
    // follows the mean edge length (placeAO), so creases darken the same at every subdivision;
    // the denoiser blurs widely but not across faces (high normalPhi), which hides the sampling
    // pattern without smearing the shading of one face onto the next.
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
    this.gtao.updateGtaoMaterial({ distanceExponent: 2, distanceFallOff: 1, scale: 1, samples: 32 });
    this.gtao.updatePdMaterial({ lumaPhi: 6, depthPhi: 2, normalPhi: 8, radius: 12, radiusExponent: 1.5, rings: 3, samples: 24 });
    this.composer.addPass(this.gtao);
    this.composer.addPass(new OutputPass());

    this.opts = {
      style: 'solid', material: 'matte', ao: 0, aoSize: 1, colouring: 'origin', palette: [[0.8, 0.8, 0.8]],
      edge: 0.5, fov: 30, spin: false, ink: 'auto', dark: false,
    };
    this.faceOrbit = null;
    this.zoom = 1;
    this.mesh = null;
    this.meanEdge = 0;
    this.spinVel = null;   // [axis, radians per ms] left over from a drag
    this.last = performance.now();
    this.pointers = new Map();
    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------- data ----------

  // the faces of a new polyhedron (from the worker's 'mesh' message)
  setMesh(m) {
    this.mesh = m;
    let tris = 0;
    for (let f = 0; f < m.nf; f++) { const d = m.fo[f + 1] - m.fo[f]; tris += d === 3 ? 1 : d; }
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color', 'edist']) {
      g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(9 * tris), 3));
    }
    this.faces.geometry.dispose();
    this.faces.geometry = g; this.backs.geometry = g;
    this.faceOrbit = null;
    this.recolour();
    this.setPositions(m.pos);
  }

  // new vertex positions for the same faces
  setPositions(pos) {
    const m = this.mesh;
    if (!m) return;
    // scale to fit the unit sphere
    let r = 0;
    for (let i = 0; i < pos.length; i += 3) r = Math.max(r, Math.hypot(pos[i], pos[i + 1], pos[i + 2]));
    const s = 1 / (r || 1);
    const p = this.pos = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i++) p[i] = pos[i] * s;

    const attr = this.faces.geometry.attributes;
    const pa = attr.position.array, na = attr.normal.array, da = attr.edist.array;
    let o = 0, len = 0;
    const put = (x, y, z, nx, ny, nz) => { pa[o] = x; pa[o + 1] = y; pa[o + 2] = z; na[o] = nx; na[o + 1] = ny; na[o + 2] = nz; o += 3; };
    // the line through sides of the current face, as [point, inward normal within the face]
    const lines = [];
    const dist = (x, y, z, L) => (L ? (x - L[0]) * L[3] + (y - L[1]) * L[4] + (z - L[2]) * L[5] : FAR);
    const putDist = (x, y, z, A, B, C) => { const q = o - 3; da[q] = dist(x, y, z, A); da[q + 1] = dist(x, y, z, B); da[q + 2] = dist(x, y, z, C); };
    for (let f = 0; f < m.nf; f++) {
      const a = m.fo[f], b = m.fo[f + 1], d = b - a;
      const V = k => 3 * m.fv[a + ((k % d) + d) % d];
      let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < d; k++) {
        const u = V(k), w = V(k + 1);
        nx += (p[u + 1] - p[w + 1]) * (p[u + 2] + p[w + 2]);
        ny += (p[u + 2] - p[w + 2]) * (p[u] + p[w]);
        nz += (p[u] - p[w]) * (p[u + 1] + p[w + 1]);
        cx += p[u]; cy += p[u + 1]; cz += p[u + 2];
        len += Math.hypot(p[w] - p[u], p[w + 1] - p[u + 1], p[w + 2] - p[u + 2]);
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l; cx /= d; cy /= d; cz /= d;
      lines.length = 0;
      for (let k = 0; k < d; k++) {
        const u = V(k), w = V(k + 1);
        let dx = p[w] - p[u], dy = p[w + 1] - p[u + 1], dz = p[w + 2] - p[u + 2];
        const dl = Math.hypot(dx, dy, dz) || 1;
        dx /= dl; dy /= dl; dz /= dl;
        // normal × direction points into the face, for counter-clockwise faces
        lines.push([p[u], p[u + 1], p[u + 2], ny * dz - nz * dy, nz * dx - nx * dz, nx * dy - ny * dx]);
      }
      // a neighbouring side's line only bounds the fan triangle near a convex corner
      const convex = (L, M) => (L[4] * M[5] - L[5] * M[4]) * nx + (L[5] * M[3] - L[3] * M[5]) * ny + (L[3] * M[4] - L[4] * M[3]) * nz > -1e-9;
      if (d === 3) {
        for (let k = 0; k < 3; k++) {
          const u = V(k);
          put(p[u], p[u + 1], p[u + 2], nx, ny, nz);
          putDist(p[u], p[u + 1], p[u + 2], lines[0], lines[1], lines[2]);
        }
        continue;
      }
      // a fan around the centroid, which also looks right while the face is not yet flat
      for (let k = 0; k < d; k++) {
        const u = V(k), w = V(k + 1);
        const L = lines[k], P = lines[(k + d - 1) % d], N = lines[(k + 1) % d];
        const prev = convex(P, L) ? P : null, next = convex(L, N) ? N : null;
        put(cx, cy, cz, nx, ny, nz); putDist(cx, cy, cz, prev, L, next);
        put(p[u], p[u + 1], p[u + 2], nx, ny, nz); putDist(p[u], p[u + 1], p[u + 2], prev, L, next);
        put(p[w], p[w + 1], p[w + 2], nx, ny, nz); putDist(p[w], p[w + 1], p[w + 2], prev, L, next);
      }
    }
    attr.position.needsUpdate = true; attr.normal.needsUpdate = true; attr.edist.needsUpdate = true;
    this.faces.geometry.computeBoundingSphere();
    this.meanEdge = len / m.fv.length;
    this.uniforms.uWidth.value = this.opts.edge * 0.08 * this.meanEdge;
    this.placeAO();
    this.request();
  }

  // ---------- look ----------

  set(opts) {
    const prev = this.opts;
    this.opts = { ...prev, ...opts };
    const o = this.opts;
    const glass = o.style === 'glass', frame = o.style === 'frame';
    this.backs.visible = glass;
    const look = LOOKS[o.material] || LOOKS.matte;
    for (const k of ['roughness', 'metalness', 'clearcoat', 'clearcoatRoughness', 'iridescence', 'iridescenceIOR', 'iridescenceThicknessRange']) {
      if (look[k] !== undefined) { this.faceMat[k] = look[k]; if (k !== 'roughness') this.backMat[k] = look[k]; }
    }
    this.scene.environmentIntensity = look.env;
    this.faceMat.transparent = glass;
    this.faceMat.opacity = glass ? 0.35 : 1;
    this.faceMat.depthWrite = !glass;
    if (glass) this.faceMat.roughness = Math.min(look.roughness, 0.15);
    // the frame is the painted edges alone, seen from both sides, with smooth borders from the
    // multisampling
    this.faceMat.side = frame ? THREE.DoubleSide : THREE.FrontSide;
    this.faceMat.alphaToCoverage = frame;
    this.faceMat.needsUpdate = true;
    this.uniforms.uFrame.value = frame ? 1 : 0;
    this.uniforms.uWidth.value = o.edge * 0.08 * this.meanEdge;
    // auto: dark lines on solid faces, otherwise whatever stands out from the background
    const ink = o.ink === 'auto' ? (o.style === 'solid' || !o.dark ? 'dark' : 'light') : o.ink;
    // the colour ink is the palette's first colour, darker
    if (ink === 'colour') this.uniforms.uInk.value.setRGB(...o.palette[0].map(x => 0.35 * x));
    else this.uniforms.uInk.value.set(ink === 'light' ? 0xeeeeea : 0x1c1c20);
    if (this.mesh && (prev.colouring !== o.colouring || prev.palette !== o.palette)) this.recolour();
    if (prev.fov !== o.fov) this.resize();
    this.placeAO();
    this.request();
  }

  // the occlusion reaches aoSize mean edge lengths; ao is its strength
  placeAO() {
    const r = Math.max(1e-3, this.opts.aoSize * this.meanEdge);
    this.gtao.updateGtaoMaterial({ radius: r, thickness: r });
    this.gtao.blendIntensity = this.opts.ao;
  }

  recolour() {
    const m = this.mesh, o = this.opts;
    const C = this.faces.geometry.attributes.color, ca = C.array;
    const sides = m.census.map(([s]) => s), pal = o.palette;
    const colourOf = f => {
      const key = o.colouring === 'origin' ? m.ftags[f]
        : o.colouring === 'sides' ? sides.indexOf(m.fo[f + 1] - m.fo[f])
        : o.colouring === 'orbit' && this.faceOrbit ? this.faceOrbit[f] : 0;
      return pal[key % pal.length];
    };
    let k = 0;
    for (let f = 0; f < m.nf; f++) {
      const d = m.fo[f + 1] - m.fo[f], n = 3 * (d === 3 ? 1 : d), c = colourOf(f);
      for (let i = 0; i < n; i++, k += 3) { ca[k] = c[0]; ca[k + 1] = c[1]; ca[k + 2] = c[2]; }
    }
    C.needsUpdate = true;
    this.request();
  }

  // the face orbits under the symmetries (from the worker's 'symmetry' message)
  setSymmetry(sym) {
    this.faceOrbit = sym.faceOrbit;
    if (this.opts.colouring === 'orbit') this.recolour();
  }

  // how many colour classes the current colouring has
  classes() {
    const m = this.mesh, o = this.opts;
    if (!m) return 1;
    if (o.colouring === 'origin') return Math.max(...m.ftags) + 1;
    if (o.colouring === 'sides') return m.census.length;
    if (o.colouring === 'orbit') return this.faceOrbit ? Math.max(...this.faceOrbit) + 1 : 1;
    return 1;
  }

  // ---------- view ----------

  resize() {
    const el = this.canvas.parentElement;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.aspect = w / h;
    this.request();
  }

  placeCamera(aspect) {
    const c = this.camera, fov = this.opts.fov;
    c.fov = fov; c.aspect = aspect;
    // far enough that the unit sphere fits the narrower side
    const half = Math.atan(Math.tan(fov * Math.PI / 360) * Math.min(1, aspect));
    const d = 1.08 / Math.sin(half) * this.zoom;
    c.position.set(0, 0, d);
    c.near = Math.max(0.01, d - 3); c.far = d + 3;
    c.updateProjectionMatrix();
  }

  resetView() { this.group.quaternion.copy(HOME); this.zoom = 1; this.spinVel = null; this.request(); }

  request() { this.dirty = true; }

  loop(now) {
    const dt = Math.min(100, now - this.last);
    this.last = now;
    if (!this.pointers.size) {
      if (this.spinVel) {
        this.rotate(this.spinVel[0], this.spinVel[1] * dt);
        this.spinVel[1] *= Math.pow(0.996, dt);
        if (Math.abs(this.spinVel[1]) < 2e-5) this.spinVel = null;
      } else if (this.opts.spin) {
        this.rotate(new THREE.Vector3(0, 1, 0), SPIN * dt / 1000);
      }
    }
    if (this.dirty) {
      this.dirty = false;
      this.placeCamera(this.aspect || 1);
      this.draw();
    }
    requestAnimationFrame(this.loop);
  }

  draw() {
    if (this.opts.ao > 0 && this.opts.style === 'solid') this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  rotate(axis, angle) {
    this.group.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
    this.request();
  }

  bindPointer() {
    const el = this.canvas;
    let pinch = 0, lastT = 0;
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      this.spinVel = null;
      el.parentElement.classList.add('dragging');
      lastT = e.timeStamp;
      if (this.pointers.size === 2) pinch = this.pinchDist();
    });
    el.addEventListener('pointermove', e => {
      const q = this.pointers.get(e.pointerId);
      if (!q) return;
      const dx = e.clientX - q[0], dy = e.clientY - q[1];
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (this.pointers.size === 2) {
        const d = this.pinchDist();
        if (pinch) this.setZoom(this.zoom * pinch / d);
        pinch = d;
        return;
      }
      const size = Math.min(el.clientWidth, el.clientHeight) || 1;
      const angle = Math.hypot(dx, dy) / size * Math.PI;
      if (!angle) return;
      const axis = new THREE.Vector3(dy, dx, 0).normalize();
      this.rotate(axis, angle);
      const dt = Math.max(1, e.timeStamp - lastT);
      lastT = e.timeStamp;
      this.spinVel = [axis, angle / dt];
    });
    const up = e => {
      this.pointers.delete(e.pointerId);
      pinch = 0;
      if (!this.pointers.size) {
        el.parentElement.classList.remove('dragging');
        // keep turning only after a flick, not after holding still
        if (e.timeStamp - lastT > 60) this.spinVel = null;
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); this.setZoom(this.zoom * Math.exp(e.deltaY * 0.001)); }, { passive: false });
    el.addEventListener('dblclick', () => this.resetView());
  }

  pinchDist() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
  }

  setZoom(z) { this.zoom = Math.min(4, Math.max(0.35, z)); this.request(); }

  // ---------- export ----------

  maxExport() {
    const gl = this.renderer.getContext();
    const [vw, vh] = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    return Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), vw, vh);
  }

  // Renders the current view again as a size × size PNG; transparent leaves out the background.
  async snapshot(size, background) {
    const r = this.renderer;
    const ratio = r.getPixelRatio();
    r.setPixelRatio(1);
    r.setSize(size, size, false);
    this.composer.setPixelRatio(1);
    this.composer.setSize(size, size);
    if (background) r.setClearColor(background, 1); else r.setClearColor(0x000000, 0);
    this.placeCamera(1);
    this.draw();
    const blob = await new Promise(res => this.canvas.toBlob(res, 'image/png'));
    r.setClearColor(0x000000, 0);
    r.setPixelRatio(ratio);
    this.resize();
    return blob;
  }
}
