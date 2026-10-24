// The 3D view: three.js, faces as flat-shaded triangles with the edges painted onto them as flat
// bands. Drag to turn, wheel or pinch to zoom, double-click to reset.

import * as THREE from '../vendor/three.module.min.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { Lines } from './lines.js';
import { tileMesh, tilePositions } from './tiles.js';
import { filmUV, IRI_GLSL } from './film.js';

export const STYLES = ['solid', 'glass', 'frame'];
export const COLOURINGS = ['origin', 'sides', 'orbit', 'single'];
export const MATERIALS = ['matte', 'glossy', 'iridescent'];

// Material settings. Matte has no specular term at all (no highlights, no reflected environment,
// no Fresnel rim), so a face's brightness depends only on its orientation and can be read; the
// environment still lights it diffusely. Glass takes the material's (owner, 2026-10-23: matte
// glass without highlights looks right).
const LOOKS = {
  matte: { roughness: 1, metalness: 0, specularIntensity: 0, clearcoat: 0, iridescence: 0, env: 0.6 },
  glossy: { roughness: 0.35, metalness: 0, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0, env: 0.8 },
  // the colour wheel of film.js; its shine and roughness come from sliders (R8)
  iridescent: { roughness: 1, metalness: 0, specularIntensity: 0, clearcoat: 0, iridescence: 0, env: 0.6 },
};
export const INKS = ['auto', 'dark', 'light', 'colour'];
// painted: bands on the faces, as wide as a fraction of the edge length; screen: the same bands,
// as wide as a number of pixels; drawn: lines over the picture (lines.js)
export const LINES = ['painted', 'screen', 'drawn'];

const HOME = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, -0.5, 0));
export const GROUNDS = ['none', 'floor', 'backdrop'];
// where the key light comes from, in the camera's frame turned only about the vertical (x right,
// y up, z towards the camera), so a preset keeps its place in the picture as the camera goes round
const LIGHTS = { soft: [-2, 3, 4], top: [0.3, 4, 0.8], side: [-4, 1.2, 0.6], rim: [1.5, 2.5, -3] };
export const LIGHT_NAMES = Object.keys(LIGHTS);
const DEG = Math.PI / 180;
// the iridescent film carries its own colour (the path tracer multiplies its texture by this)
const WHITE = [1, 1, 1];
// Render: trace after this long without a change, up to this many samples
const STILL_MS = 250, TRACE_MAX = 2048;
const SPIN = 0.25; // radians per second when turning by itself
const FAR = 1e9;   // the distance to a line that does not count

// Every triangle drawn carries, at each corner, the signed distances to three lines of its face's
// boundary: for the fan triangle of side k, the lines through sides k − 1, k and k + 1. Distance
// to a line is affine in the plane, so it interpolates exactly; the fragment takes the smallest
// and paints the edge where that is below the half-width. In the frame style everything else is
// cut away. With uScreen the distances are measured in pixels instead: an affine function divided
// by the length of its screen gradient is the distance in pixels to where it is zero, so the band
// keeps its width however the face is tilted (each face paints half the line).
function paintEdges(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 edist;\nvarying vec3 vEdist;\nattribute vec2 film;\nvarying vec2 vFilm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdist = edist;\nvFilm = film;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uInk;\nuniform float uWidth;\nuniform float uFrame;\nuniform float uScreen;\nuniform float uDepth;\nuniform float uRef;\nuniform float uFilm;\nvarying vec3 vEdist;\nvarying vec2 vFilm;\n' + IRI_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // the iridescent colour, per pixel, from the face's own normal and the view (film.js)
        if (uFilm > 0.5) {
          vec3 V = normalize(-vViewPosition), fn = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
          diffuseColor.rgb = iriColour(vFilm, dot(fn, V) < 0.0 ? -fn : fn, V, viewMatrix);
        }
        float line = 0.0;
        if (uScreen > 0.5) {
          vec3 g = vec3(length(vec2(dFdx(vEdist.x), dFdy(vEdist.x))), length(vec2(dFdx(vEdist.y), dFdy(vEdist.y))), length(vec2(dFdx(vEdist.z), dFdy(vEdist.z))));
          vec3 px = vEdist / max(g, vec3(1e-12));
          float ed = min(px.x, min(px.y, px.z));
          float w = uWidth * pow(uRef / vViewPosition.z, uDepth);
          line = uWidth > 0.0 ? 1.0 - smoothstep(w - 0.5, w + 0.5, ed) : 0.0;
        } else {
          float ed = min(vEdist.x, min(vEdist.y, vEdist.z));
          float fw = fwidth(ed);
          line = uWidth > 0.0 ? 1.0 - smoothstep(uWidth - fw, uWidth + fw, ed) : 0.0;
        }
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
    this.key = new THREE.DirectionalLight(0xffffff, 1.6);
    // the shadow on the ground: the shape fits the unit sphere, so a small box around it will do
    Object.assign(this.key.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 1, far: 14 });
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0005;
    this.scene.add(this.key, this.key.target, new THREE.HemisphereLight(0xffffff, 0x888888, 0.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    this.group = new THREE.Group();
    this.free = HOME.clone();   // the rotation in the free orientation, turned by dragging
    this.scene.add(this.group);
    this.target = new THREE.Vector3();   // the shape's centre, which the camera looks at

    // The stage: a floor, and for the backdrop a wall curving up from it behind the shape. The wall
    // turns with the camera, so it is always behind; the floor is far wider than the view.
    this.stageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 0.15 });
    this.stage = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), this.stageMat);
    floor.rotation.x = -Math.PI / 2;
    this.wall = new THREE.Group();
    const R = 2.5, back = 3.5;
    const curve = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 80, 48, 1, true, Math.PI, Math.PI / 2), this.stageMat);
    curve.rotation.z = Math.PI / 2;
    curve.position.set(0, R, -back + R);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), this.stageMat);
    wall.position.set(0, R + 20, -back);
    this.wall.add(curve, wall);
    for (const m of [floor, curve, wall]) m.receiveShadow = true;
    curve.material = this.stageMat.clone(); curve.material.side = THREE.BackSide;
    this.stage.add(floor, this.wall);
    this.scene.add(this.stage);
    this.views = [];

    this.uniforms = {
      uInk: { value: new THREE.Color(0x1c1c20) }, uWidth: { value: 0 }, uFrame: { value: 0 },
      uScreen: { value: 0 }, uDepth: { value: 0 }, uRef: { value: 1 }, uFilm: { value: 0 },
      uIriW: { value: new THREE.Vector3(1, 1, 0) }, uIriCycles: { value: 1 }, uIriHue: { value: 0 }, uIriChroma: { value: 0.12 },
    };
    this.faceMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 });
    this.backMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.BackSide });
    paintEdges(this.faceMat, this.uniforms);
    paintEdges(this.backMat, this.uniforms);
    this.faces = new THREE.Mesh(new THREE.BufferGeometry(), this.faceMat);
    this.backs = new THREE.Mesh(this.faces.geometry, this.backMat);
    this.backs.renderOrder = -1;
    this.group.add(this.backs, this.faces);

    this.lines = new Lines();

    this.opts = {
      style: 'solid', material: 'matte', colouring: 'origin', palette: [[0.8, 0.8, 0.8]],
      edge: 0.5, lines: 'drawn', hidden: 0, depthWidth: 0, fov: 30, blur: 0, focus: 0, gap: 0, thick: 0.3, filmBand: 2.5, spin: false, ink: 'auto', dark: false,
      iri: { bands: 1, angle: 1, holo: 0, cycles: 1 }, hue: 230, chroma: 0.12, spec: 0, rough: 0.35, ior: 1.5,
      orient: 'free', ground: 'none', lift: 0, elev: 0, azim: 0, light: 'soft', stage: '#ffffff',
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
    this.faceOrbit = null;
    this.shape();
    this.setPositions(m.pos);
  }

  // Whether the faces are drawn as they are or as detached tiles (R7): 0 the faces, 1 flat
  // tiles, 2 solid tiles. The tiles need their own faces.
  tiling() { const o = this.opts; return o.gap > 0 ? (o.thick > 0 ? 2 : 1) : 0; }

  // The faces drawn (this.shown: nf, nv, ne, fo, fv, and src, the face of the polyhedron each
  // belongs to, or null for the faces themselves), and the buffers for them.
  shape() {
    const P = this.mesh, t = this.tiling();
    this.tiles = t;
    const m = this.shown = t ? tileMesh(P, t === 2) : { nf: P.nf, nv: P.nv, ne: P.fo[P.nf] / 2, fo: P.fo, fv: P.fv, src: null };
    let tris = 0;
    for (let f = 0; f < m.nf; f++) { const d = m.fo[f + 1] - m.fo[f]; tris += d === 3 ? 1 : d; }
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color', 'edist']) {
      g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(9 * tris), 3));
    }
    // the iridescent bands' coordinates at each corner (film.js)
    g.setAttribute('film', new THREE.BufferAttribute(new Float32Array(6 * tris), 2));
    // the face of every corner, for the face buffer of the drawn lines
    const fid = new Float32Array(3 * tris);
    for (let f = 0, k = 0; f < m.nf; f++) {
      const d = m.fo[f + 1] - m.fo[f];
      for (let i = 3 * (d === 3 ? 1 : d); i > 0; i--) fid[k++] = f;
    }
    g.setAttribute('fid', new THREE.BufferAttribute(fid, 1));
    this.lines.setMesh(m);
    this.faces.geometry.dispose();
    this.faces.geometry = g; this.backs.geometry = g;
    this.recolour();
  }

  // new vertex positions for the same faces
  setPositions(pos) {
    if (!this.mesh) return;
    this.raw = pos;
    // scale to fit the unit sphere
    let r = 0;
    for (let i = 0; i < pos.length; i += 3) r = Math.max(r, Math.hypot(pos[i], pos[i + 1], pos[i + 2]));
    const s = 1 / (r || 1);
    let p = this.pos = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i++) p[i] = pos[i] * s;
    // the mean edge of the polyhedron, which the painted edges and the tiles' thickness follow
    const P = this.mesh;
    let len = 0;
    for (let f = 0; f < P.nf; f++) {
      const a = P.fo[f], d = P.fo[f + 1] - a;
      for (let k = 0; k < d; k++) {
        const u = 3 * P.fv[a + k], w = 3 * P.fv[a + (k + 1) % d];
        len += Math.hypot(p[w] - p[u], p[w + 1] - p[u + 1], p[w + 2] - p[u + 2]);
      }
    }
    this.meanEdge = len / P.fv.length;
    if (this.tiles) p = tilePositions(P, p, this.tiles === 2, 1 - this.opts.gap, this.opts.thick * this.meanEdge);
    this.shownPos = p;
    const m = this.shown;

    const attr = this.faces.geometry.attributes;
    const pa = attr.position.array, na = attr.normal.array, da = attr.edist.array, ua = attr.film.array, band = this.opts.filmBand * this.meanEdge;
    let o = 0;
    const put = (x, y, z, nx, ny, nz) => {
      pa[o] = x; pa[o + 1] = y; pa[o + 2] = z; na[o] = nx; na[o + 1] = ny; na[o + 2] = nz;
      ua.set(filmUV(x, y, z, band), 2 * o / 3);
      o += 3;
    };
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
    attr.position.needsUpdate = true; attr.normal.needsUpdate = true; attr.edist.needsUpdate = true; attr.film.needsUpdate = true;
    this.faces.geometry.computeBoundingSphere();
    this.lines.setPositions(p);
    this.orient();
    this.placeLines();
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
    for (const k of ['roughness', 'metalness', 'specularIntensity', 'clearcoat', 'clearcoatRoughness', 'iridescence', 'iridescenceIOR', 'iridescenceThicknessRange']) {
      if (look[k] !== undefined) { this.faceMat[k] = look[k]; if (k !== 'roughness') this.backMat[k] = look[k]; }
    }
    this.scene.environmentIntensity = look.env;
    const iri = o.material === 'iridescent' && !glass;
    this.uniforms.uFilm.value = iri ? 1 : 0;
    if (o.material === 'iridescent') {
      // the sliders' shine: the specular layer and its roughness; the environment's reflection
      // comes with it
      this.faceMat.specularIntensity = this.backMat.specularIntensity = o.spec;
      this.faceMat.roughness = o.rough;
      this.scene.environmentIntensity = look.env + 0.4 * o.spec;
      const w = o.iri;
      this.uniforms.uIriW.value.set(w.bands, w.angle, w.holo);
      this.uniforms.uIriCycles.value = w.cycles;
      this.uniforms.uIriHue.value = o.hue / 360;
      this.uniforms.uIriChroma.value = o.chroma;
    }
    this.faceMat.transparent = glass;
    this.faceMat.opacity = glass ? 0.35 : 1;
    this.faceMat.depthWrite = !glass;
    if (glass) this.faceMat.roughness = Math.min(look.roughness, 0.15);
    // the frame is the painted edges alone, seen from both sides, with smooth borders from the
    // multisampling; flat tiles have two sides too
    this.faceMat.side = frame || (o.gap > 0 && o.thick === 0) ? THREE.DoubleSide : THREE.FrontSide;
    this.faceMat.alphaToCoverage = frame;
    this.faceMat.needsUpdate = true;
    this.uniforms.uFrame.value = frame ? 1 : 0;
    this.placeLines();
    this.faces.castShadow = !frame;
    const stage = new THREE.Color(o.stage);
    this.stageMat.color.copy(stage); this.wall.children[0].material.color.copy(stage);
    this.orient();
    // auto: dark lines on solid faces, otherwise whatever stands out from the background
    const ink = o.ink === 'auto' ? (o.style === 'solid' || !o.dark ? 'dark' : 'light') : o.ink;
    // the colour ink is the palette's first colour, darker
    if (ink === 'colour') this.uniforms.uInk.value.setRGB(...o.palette[0].map(x => 0.35 * x));
    else this.uniforms.uInk.value.set(ink === 'light' ? 0xeeeeea : 0x1c1c20);
    if (this.mesh && (prev.colouring !== o.colouring || prev.palette !== o.palette || prev.material !== o.material || prev.style !== o.style)) this.recolour();
    // detached faces: new faces when tiles come or go, or gain or lose their thickness
    if (this.mesh && this.tiling() !== this.tiles) { this.shape(); this.setPositions(this.raw); }
    else if (this.mesh && ((this.tiles && (prev.gap !== o.gap || prev.thick !== o.thick)) || prev.filmBand !== o.filmBand)) this.setPositions(this.raw);
    if (prev.fov !== o.fov) this.resize();
    this.request();
  }

  // The width of a line drawn on the screen, in pixels: a fraction of the picture, so that an
  // export at a higher resolution looks like the view.
  linePixels() {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return this.opts.edge * 0.01 * Math.min(s.x, s.y);
  }

  // the painted bands: their half-width per face, in world units or in pixels
  placeLines() {
    const o = this.opts, u = this.uniforms;
    u.uScreen.value = o.lines === 'screen' ? 1 : 0;
    u.uWidth.value = o.lines === 'painted' ? o.edge * 0.08 * this.meanEdge : o.lines === 'screen' ? this.linePixels() / 2 : 0;
    u.uDepth.value = o.depthWidth;
  }

  recolour() {
    const m = this.mesh, o = this.opts, S = this.shown;
    const C = this.faces.geometry.attributes.color, ca = C.array;
    const sides = m.census.map(([s]) => s), pal = o.palette;
    const colourOf = f => {
      const key = o.colouring === 'origin' ? m.ftags[f]
        : o.colouring === 'sides' ? sides.indexOf(m.fo[f + 1] - m.fo[f])
        : o.colouring === 'orbit' && this.faceOrbit ? this.faceOrbit[f] : 0;
      return o.material === 'iridescent' && o.style !== 'glass' ? WHITE : pal[key % pal.length];
    };
    let k = 0;
    // a tile takes its face's colour
    for (let f = 0; f < S.nf; f++) {
      const d = S.fo[f + 1] - S.fo[f], n = 3 * (d === 3 ? 1 : d), c = colourOf(S.src ? S.src[f] : f);
      for (let i = 0; i < n; i++, k += 3) { ca[k] = c[0]; ca[k + 1] = c[1]; ca[k + 2] = c[2]; }
    }
    C.needsUpdate = true;
    this.request();
  }

  // the face orbits under the symmetries (from the worker's 'symmetry' message)
  setSymmetry(sym) {
    this.faceOrbit = sym.faceOrbit;
    this.views = sym.views || [];
    this.orient();
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
    this.aspect = w / h;
    this.request();
  }

  // ---------- scene ----------

  // the chosen symmetric view, if the shape has it
  view() { return this.opts.orient === 'free' ? null : this.views.find(w => w.key === this.opts.orient) || null; }

  // Turns and places the shape. A symmetric view turns the chosen face, vertex or edge straight
  // down, so the shape stands on it; a second direction (a vertex of the face, a neighbour, an end
  // of the edge) fixes the turn about the vertical, so that the same view always faces the camera
  // the same way. On the ground the lowest point touches the floor, plus the lift.
  orient() {
    const o = this.opts, p = this.pos, w = this.view();
    if (!p) return;
    const q = this.group.quaternion;
    if (!w) q.copy(this.free);
    else {
      const m = this.mesh, P = i => new THREE.Vector3(p[3 * i], p[3 * i + 1], p[3 * i + 2]);
      const c = new THREE.Vector3();
      for (let i = 0; i < p.length; i += 3) c.add(new THREE.Vector3(p[i], p[i + 1], p[i + 2]));
      c.multiplyScalar(3 / p.length);
      let dir, ref;
      if (w.kind === 'f') {
        const a = m.fo[w.rep], d = m.fo[w.rep + 1] - a, n = new THREE.Vector3(), mid = new THREE.Vector3();
        for (let k = 0; k < d; k++) {
          const u = P(m.fv[a + k]), v = P(m.fv[a + (k + 1) % d]);
          n.x += (u.y - v.y) * (u.z + v.z); n.y += (u.z - v.z) * (u.x + v.x); n.z += (u.x - v.x) * (u.y + v.y);
          mid.add(u);
        }
        dir = n; ref = P(m.fv[a]).sub(mid.multiplyScalar(1 / d));
      } else if (w.kind === 'v') {
        dir = P(w.rep).sub(c);
        let f = 0;
        while (f < m.nf && !m.fv.slice(m.fo[f], m.fo[f + 1]).includes(w.rep)) f++;
        const a = m.fo[f], d = m.fo[f + 1] - a, k = m.fv.slice(a, a + d).indexOf(w.rep);
        ref = P(m.fv[a + (k + 1) % d]).sub(P(w.rep));
      } else {
        const [a, b] = w.rep, mid = P(a).add(P(b)).multiplyScalar(0.5);
        dir = mid.clone().sub(c); ref = P(a).sub(mid);
      }
      const down = new THREE.Vector3(0, -1, 0);
      q.setFromUnitVectors(dir.normalize(), down);
      ref.applyQuaternion(q).setY(0);
      if (ref.lengthSq() > 1e-12) {
        ref.normalize();
        const turn = Math.atan2(ref.z, ref.x);   // about +y, a turn by this takes ref to +x
        q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn));
      }
    }
    let low = 0;
    if (o.ground !== 'none') {
      const v = new THREE.Vector3();
      low = Infinity;
      for (let i = 0; i < p.length; i += 3) low = Math.min(low, v.set(p[i], p[i + 1], p[i + 2]).applyQuaternion(q).y);
    }
    this.group.position.set(0, o.ground === 'none' ? 0 : o.lift - low, 0);
    this.target.copy(this.group.position);
    this.placeStage();
    this.request();
  }

  // the stage, the light and the background follow the ground, the light preset and the camera
  placeStage() {
    const o = this.opts, on = o.ground !== 'none', az = o.azim * DEG;
    this.stage.visible = on;
    this.wall.visible = o.ground === 'backdrop';
    this.wall.rotation.y = az;
    this.scene.background = on ? new THREE.Color(o.stage) : null;
    const k = LIGHTS[o.light] || LIGHTS.soft;
    this.key.position.set(k[0], k[1], k[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), az).add(this.target);
    this.key.target.position.copy(this.target);
    this.key.castShadow = on;
  }

  placeCamera(aspect) {
    const c = this.camera, o = this.opts, fov = o.fov;
    c.fov = fov; c.aspect = aspect;
    // far enough that the unit sphere fits the narrower side
    const half = Math.atan(Math.tan(fov * Math.PI / 360) * Math.min(1, aspect));
    // with ground, farther: the picture needs some of it round the shape
    const d = 1.08 / Math.sin(half) * this.zoom * (o.ground === 'none' ? 1 : 1.35);
    const az = o.azim * DEG, el = o.elev * DEG;
    c.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d).add(this.target);
    c.lookAt(this.target);
    // the floor reaches far past the shape, and comes close below the camera
    const on = o.ground !== 'none';
    c.near = on ? 0.05 : Math.max(0.01, d - 3); c.far = on ? d + 80 : d + 3;
    this.scene.fog = o.ground === 'floor' ? new THREE.Fog(o.stage, d + 2, d + 25) : null;
    c.updateProjectionMatrix();
  }

  // Depth of field (R4), for RT and the Blender scene: the lens opening in world units (the shape
  // fits the unit sphere, so blur is a fraction of its radius) and the distance from the camera
  // that is sharp, from the near side of the shape (focus -1) to the far side (1).
  lens() {
    const o = this.opts;
    return { diameter: o.blur, distance: this.camera.position.distanceTo(this.target) + o.focus };
  }

  resetView() {
    this.free.copy(HOME); this.zoom = 1; this.spinVel = null;
    this.opts.azim = 0; this.opts.elev = 0;
    if (this.onOrbit) this.onOrbit(0, 0, true);
    this.orient();
  }

  // Something changed: draw again, and with RT on, trace the scene again once it is still.
  request() { this.dirty = true; this.changed = performance.now(); this.stale = true; }

  // ---------- render (path tracing) ----------

  // RT on: the view traces the scene whenever nothing has moved for a moment, refining up to
  // TRACE_MAX samples; while anything moves it shows the fast view. The tracer is loaded the first
  // time.
  async setTrace(on) {
    if (on && !this.tracer) {
      const { Tracer } = await import('./trace.js');
      this.tracer = new Tracer(this.renderer);
    }
    this.tracing = on;
    this.request();
  }

  setDenoise(on) { if (this.tracer) this.tracer.denoise = on; this.request(); }

  // still enough to trace: no drag, no turning, nothing changed for a moment
  still(now) { return !this.pointers.size && !this.spinVel && !this.opts.spin && now - this.changed > STILL_MS; }

  trace(now) {
    if (!this.tracing || !this.tracer || this.exporting) return;
    if (!this.still(now)) { if (this.traced) { this.traced = false; this.dirty = true; } return; }
    if (this.stale) { this.stale = false; this.placeCamera(this.aspect || 1); this.tracer.build(this); }
    if (this.tracer.samples >= TRACE_MAX && this.traced) return;
    this.tracer.render();
    this.drawLines(true);
    this.traced = true;
    if (this.onTrace) this.onTrace(this.tracer.samples);
  }

  loop(now) {
    const dt = Math.min(100, now - this.last);
    this.last = now;
    if (!this.pointers.size) {
      if (this.spinVel) {
        this.rotate(this.spinVel[0], this.spinVel[1] * dt);
        this.spinVel[1] *= Math.pow(0.996, dt);
        if (Math.abs(this.spinVel[1]) < 2e-5) this.spinVel = null;
      } else if (this.opts.spin) {
        if (this.view()) this.orbit(SPIN * dt / 1000 / DEG, 0, false);
        else this.rotate(new THREE.Vector3(0, 1, 0), SPIN * dt / 1000);
      }
    }
    if (this.dirty && !this.exporting) {
      this.dirty = false;
      this.placeCamera(this.aspect || 1);
      this.draw();
      if (this.tracing && this.onTrace) this.onTrace(null);
    }
    this.trace(now);
    requestAnimationFrame(this.loop);
  }

  draw() {
    this.placeLines();
    this.uniforms.uRef.value = this.camera.position.distanceTo(this.target);
    this.renderer.render(this.scene, this.camera);
    this.drawLines(false);
  }

  // The drawn lines over the picture. Over a traced picture they stand in for every edge type,
  // since the tracer cannot paint bands onto the faces.
  drawLines(traced) {
    const o = this.opts;
    if (o.lines !== 'drawn' && !(traced && o.edge > 0)) return;
    this.lines.draw(this.renderer, this.scene, this.camera, this.group, {
      width: this.linePixels(), depth: o.depthWidth, hidden: o.style === 'solid' ? 0 : o.hidden, ink: this.uniforms.uInk.value, hide: [this.stage],
    });
  }

  // turns the shape in the free orientation; the axis is in the camera's frame
  rotate(axis, angle) {
    const a = axis.clone().applyQuaternion(this.camera.quaternion);
    this.free.premultiply(new THREE.Quaternion().setFromAxisAngle(a, angle));
    this.orient();
  }

  // moves the camera round the shape, in degrees; onOrbit tells the page (end: the drag is over)
  orbit(dAz, dEl, end) {
    const o = this.opts;
    o.azim = ((o.azim + dAz + 540) % 360) - 180;
    o.elev = Math.max(-89, Math.min(89, o.elev + dEl));
    if (this.onOrbit) this.onOrbit(o.azim, o.elev, end);
    this.placeStage();
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
      // a symmetric view fixes the shape: dragging moves the camera round it instead
      if (this.view()) { this.orbit(-dx / size * 180, dy / size * 180, false); lastT = e.timeStamp; this.spinVel = null; return; }
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
        if (this.view()) this.orbit(0, 0, true);
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
  // With RT on it is traced to samples samples, yielding to the page between batches and
  // reporting onProgress(samples done).
  async snapshot(size, background, { samples = 256, onProgress } = {}) {
    const r = this.renderer;
    const ratio = r.getPixelRatio();
    this.exporting = true;
    try {
      r.setPixelRatio(1);
      r.setSize(size, size, false);
      if (background) r.setClearColor(background, 1); else r.setClearColor(0x000000, 0);
      this.placeCamera(1);
      if (this.tracing && this.tracer) {
        this.tracer.build(this, !background);
        // a tile per frame, so the page and the desktop stay responsive
        while (this.tracer.samples < samples) {
          this.tracer.render();
          if (onProgress) onProgress(this.tracer.samples);
          await new Promise(res => requestAnimationFrame(res));
        }
        this.drawLines(true);
      } else this.draw();
      return await new Promise(res => this.canvas.toBlob(res, 'image/png'));
    } finally {
      r.setClearColor(0x000000, 0);
      r.setPixelRatio(ratio);
      this.exporting = false;
      this.resize();
    }
  }
}
