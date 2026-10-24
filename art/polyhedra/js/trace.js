// Path tracing in the view (R21): three-gpu-pathtracer on a copy of the viewer's scene, so what is
// composed in the fast view is what renders. Loaded only when Render is first switched on.
//
// The copy: the faces with their colours, a material for the viewer's material and style, the
// stage meshes where the viewer has them, the key light as an area light where the viewer's
// directional light is (so its shadow is soft), a sky for the rest of the light, and the stage
// colour as the background. The drawn lines are not traced; the viewer lays them over the result.

import * as THREE from '../vendor/three.module.min.js';
import { WebGLPathTracer, GradientEquirectTexture, DenoiseMaterial, PhysicalCamera, FogVolumeMaterial } from '../vendor/three-gpu-pathtracer.js';
import { FullScreenQuad } from '../vendor/addons/postprocessing/Pass.js';
import { filmT, holoTerm, iriColour } from './film.js';
import { FOG_BOX, FOG_DENSITY } from './viewer.js';

// the most triangles the iridescent faces are subdivided into
const IRI_TRIANGLES = 2e5;

// the traced materials, for the viewer's materials; glass is a style, so it overrides them
const MATERIALS = {
  matte: o => o.sss > 0 ? translucent(o, 1) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  glossy: o => o.sss > 0 ? translucent(o, 0.35, { clearcoat: 1, clearcoatRoughness: 0.08 })
    : new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }),
  // the colour baked into the vertex colours (iridescent() below), with the sliders' shine; with
  // none, fully rough (a specular intensity of 0 gave black specks, from NaNs in the tracer)
  iridescent: o => o.spec > 0 ? new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: o.rough, metalness: 0, specularIntensity: o.spec })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  glass: o => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.03, metalness: 0, transmission: 1, ior: o.ior, thickness: 0.05, side: THREE.DoubleSide }),
};

// The iridescent faces for the tracer, which takes no custom shaders: every triangle the viewer
// draws subdivided n × n, with the colour of film.js computed at each new corner for the camera as
// it is now (a trace starts again whenever the camera moves). The terms change smoothly within a
// face, so a fine enough grid of corners shows no seams.
function iridescent(v) {
  const src = v.faces.geometry.attributes, P = src.position.array, Nm = src.normal.array, U = src.film.array;
  const tris = P.length / 9, n = Math.max(1, Math.min(16, Math.floor(Math.sqrt(IRI_TRIANGLES / tris))));
  const per = (n + 1) * (n + 2) / 2;
  const pos = new Float32Array(3 * per * tris), nor = new Float32Array(3 * per * tris), col = new Float32Array(4 * per * tris).fill(1);
  const index = new Uint32Array(3 * n * n * tris);
  const M = v.faces.matrixWorld, NM = new THREE.Matrix3().getNormalMatrix(M), eye = v.camera.getWorldPosition(new THREE.Vector3());
  const w = new THREE.Vector3(), N = new THREE.Vector3(), V = new THREE.Vector3();
  let q = 0, ix = 0;
  for (let t = 0; t < tris; t++) {
    const a = 3 * t, base = q;
    // the face's normal in the world, and the corners' attributes, blended by barycentric weights
    N.set(Nm[3 * a], Nm[3 * a + 1], Nm[3 * a + 2]).applyMatrix3(NM).normalize();
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++, q++) {
      const b = [1 - (i + j) / n, i / n, j / n];
      const at = (A, k, c) => b[0] * A[k * a + c] + b[1] * A[k * (a + 1) + c] + b[2] * A[k * (a + 2) + c];
      const x = at(P, 3, 0), y = at(P, 3, 1), z = at(P, 3, 2);
      pos.set([x, y, z], 3 * q);
      nor.set([Nm[3 * a], Nm[3 * a + 1], Nm[3 * a + 2]], 3 * q);
      w.set(x, y, z).applyMatrix4(M);
      V.subVectors(eye, w).normalize();
      let c = N.dot(V);
      const s = c < 0 ? -1 : 1;
      c *= s;
      // the reflected view, -V + 2 (N·V) N, with N facing the eye
      const rx = -V.x + 2 * c * s * N.x, ry = -V.y + 2 * c * s * N.y;
      col.set(iriColour(v.opts, filmT(at(U, 2, 0), at(U, 2, 1)), 1 - c, holoTerm(rx, ry)), 4 * q);
    }
    // the small triangles, counter-clockwise as the big one
    const id = (i, j) => base + i * (n + 1) - i * (i - 1) / 2 + j;
    for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
      index.set([id(i, j), id(i + 1, j), id(i, j + 1)], ix); ix += 3;
      if (j < n - i - 1) { index.set([id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)], ix); ix += 3; }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}

// Subsurface scattering, which the tracer does not have, stood in for by part of the light passing
// into the solid through a frosted surface and being dimmed on its way through: light reaches the
// shaded side and the creases, as in wax or marble (Blender gets real subsurface scattering).
function translucent(o, roughness, extra = {}) {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true, metalness: 0, roughness, transmission: 0.4 * o.sss, ior: 1.4, ...extra,
  });
}

// the material of the other forms, as the viewer's: the tone, its metal, roughness and glow, and
// subsurface as for the faces
function formMaterial(v) {
  const o = v.opts, f = v.formMat;
  const props = { color: f.color.clone(), metalness: o.metal, roughness: o.rough, emissive: f.emissive.clone(), emissiveIntensity: f.emissiveIntensity };
  if (o.sss > 0 && !o.metal) { const m = translucent(o, o.rough, props); m.vertexColors = false; return m; }
  // a specular intensity of 0 traced black specks: a matte form is fully rough instead
  if (f.specularIntensity === 0) return new THREE.MeshStandardMaterial({ ...props, roughness: 1 });
  return new THREE.MeshPhysicalMaterial(props);
}

export class Tracer {
  constructor(renderer) {
    this.renderer = renderer;
    const pt = this.pt = new WebGLPathTracer(renderer);
    // no delay, no fade and no low-resolution stand-in: the viewer decides when to trace
    pt.renderDelay = 0; pt.fadeDuration = 0; pt.minSamples = 1;
    pt.bounces = 6;
    pt.transmissiveBounces = 10;
    pt.rasterizeScene = false;
    // the smart denoiser, drawn instead of the plain copy to the canvas, when wanted
    this.denoise = true;
    const quad = new FullScreenQuad(new DenoiseMaterial({ blending: THREE.NoBlending, premultipliedAlpha: renderer.getContextAttributes().premultipliedAlpha }));
    pt.renderToCanvasCallback = (target, r, plain) => {
      const q = this.denoise ? quad : plain;
      if (this.denoise) quad.material.map = target.texture;
      const auto = r.autoClear;
      r.autoClear = false;
      q.render(r);
      r.autoClear = auto;
    };
    this.sky = new GradientEquirectTexture();
    this.sky.topColor.set(0xffffff); this.sky.bottomColor.set(0x777777); this.sky.update();
    this.backdrop = new GradientEquirectTexture(16);
    // the viewer's camera with a lens, for depth of field
    this.cam = new PhysicalCamera();
    this.scene = null;
  }

  get samples() { return Math.floor(this.pt.samples); }

  // Builds the copy of the viewer's scene and starts again from no samples. transparent leaves out
  // the background (an export without one).
  build(v, transparent = false) {
    const o = v.opts, scene = new THREE.Scene();
    const add = (geometry, material, matrix) => {
      const m = new THREE.Mesh(geometry, material);
      m.matrixAutoUpdate = false;
      m.matrix.copy(matrix);
      scene.add(m);
    };
    v.scene.updateMatrixWorld(true);
    // the other forms (forms.js) in place of the faces, and the inset inside them
    const copy = m => {
      const g = new THREE.BufferGeometry();
      for (const k of ['position', 'normal']) g.setAttribute(k, m.geometry.attributes[k].clone());
      g.setIndex(m.geometry.index.clone());
      return g;
    };
    if (v.form.visible) add(copy(v.form), formMaterial(v), v.form.matrixWorld);
    if (v.inset.visible) add(copy(v.inset), new THREE.MeshPhysicalMaterial({ color: v.insetMat.color, metalness: 1, roughness: v.insetMat.roughness }), v.inset.matrixWorld);
    if (o.style !== 'frame' && o.form === 'faces') {
      const mat = (MATERIALS[o.style === 'glass' ? 'glass' : o.material] || MATERIALS.matte)(o);
      // flat detached faces are seen from both sides
      if (v.tiles === 1) mat.side = THREE.DoubleSide;
      // Only what the tracer reads (the viewer's geometry also carries the edge distances and face
      // numbers for its shaders), and the colours as RGBA: the tracer gives meshes without colours
      // four components and merges everything into one buffer, so three would be read with the
      // wrong stride, and some faces would come out black.
      const src = v.faces.geometry.attributes;
      let g;
      if (o.material === 'iridescent' && o.style !== 'glass') g = iridescent(v);
      else {
        g = new THREE.BufferGeometry();
        for (const k of ['position', 'normal']) g.setAttribute(k, src[k].clone());
        const c3 = src.color.array, c4 = new Float32Array(c3.length / 3 * 4).fill(1);
        for (let i = 0, j = 0; i < c3.length; i += 3, j += 4) { c4[j] = c3[i]; c4[j + 1] = c3[i + 1]; c4[j + 2] = c3[i + 2]; }
        g.setAttribute('color', new THREE.BufferAttribute(c4, 4));
      }
      add(g, mat, v.faces.matrixWorld);
    }
    if (v.stage.visible) {
      v.stage.traverse(m => {
        if (m.isMesh && m.parent.visible) add(m.geometry, new THREE.MeshStandardMaterial({ color: o.stage, roughness: 1, metalness: 0, side: m.material.side }), m.matrixWorld);
      });
    }
    // the key light: an area light 3 units wide where the directional one is, facing the shape;
    // bright enough to match it at that distance
    if (o.light !== 'none') {
      const key = new THREE.RectAreaLight(0xffffff, 7, 3, 3);
      key.position.copy(v.key.position);
      key.lookAt(v.key.target.position);
      scene.add(key);
    }
    scene.environment = this.sky;
    scene.environmentIntensity = o.light === 'none' ? 0.03 : 0.8;
    // the light inside, at the shape's centre, as bright as the viewer's
    if (o.inner > 0) {
      const inner = new THREE.PointLight(v.inner.color, v.inner.intensity, 0, 2);
      inner.position.copy(v.target);
      scene.add(inner);
    }
    // Fog: a box of scattering medium round the shape and the camera's view of it, which shows
    // the light's shafts
    if (o.fog > 0) {
      // (density set afterwards: the constructor's first pass over the parameters warns about it)
      const medium = new FogVolumeMaterial({ color: 0xffffff });
      medium.density = FOG_DENSITY * o.fog;
      const fog = new THREE.Mesh(new THREE.BoxGeometry(FOG_BOX, FOG_BOX, FOG_BOX), medium);
      fog.position.copy(v.target);
      scene.add(fog);
    }
    // The background as a texture of one colour. The tracer makes such a texture itself from a
    // colour, but only fills it when the colour differs from the texture's default white, so a
    // white background came out black (three-gpu-pathtracer 0.0.23).
    if (transparent) scene.background = null;
    else {
      this.backdrop.topColor.set(o.stage); this.backdrop.bottomColor.set(o.stage); this.backdrop.update();
      scene.background = this.backdrop;
    }
    this.scene = scene;
    // Tiles keep every draw short: one sample of the whole picture is one GPU job of 40 ms at
    // 900² and 80 ms at 2048², which freezes the desktop sharing the GPU. About 0.2 megapixels
    // a tile is a few milliseconds.
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const n = Math.max(1, Math.ceil(Math.sqrt(size.x * size.y / 2e5)));
    this.pt.tiles.set(n, n);
    // The lens: the tracer reads its opening as bokehSize in millimetres, a thousandth of a world
    // unit, and 0 turns depth of field off.
    const cam = this.cam, lens = v.lens();
    cam.copy(v.camera);
    cam.apertureBlades = 0; cam.apertureRotation = 0; cam.anamorphicRatio = 1;
    cam.focusDistance = lens.distance;
    cam.fStop = lens.diameter > 0 ? cam.getFocalLength() / (lens.diameter * 1000) : Infinity;
    this.pt.setScene(scene, cam);
  }

  // the camera moved: same scene, start again
  camera() { if (this.scene) this.pt.updateCamera(); }

  // Traces one tile and draws the result to the canvas. One per animation frame: the GPU works
  // asynchronously, so timing the calls here would not stop them piling up.
  render() { this.pt.renderSample(); }

  reset() { this.pt.reset(); }
}
