// Path tracing in the view (R21): three-gpu-pathtracer on a copy of the viewer's scene, so what is
// composed in the fast view is what renders. Loaded only when Render is first switched on.
//
// The copy: the faces with their colours, a material for the viewer's material and style, the
// stage meshes where the viewer has them, the key light as an area light where the viewer's
// directional light is (so its shadow is soft), a sky for the rest of the light, and the stage
// colour as the background. The drawn lines are not traced; the viewer lays them over the result.

import * as THREE from '../vendor/three.module.min.js';
import { WebGLPathTracer, GradientEquirectTexture, DenoiseMaterial, PhysicalCamera } from '../vendor/three-gpu-pathtracer.js';
import { FullScreenQuad } from '../vendor/addons/postprocessing/Pass.js';
import { FILM_MAP } from './film.js';

// the traced materials, for the viewer's materials; glass is a style, so it overrides them
const MATERIALS = {
  matte: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  glossy: () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }),
  // the film's colour as a texture over its two coordinates (film.js), lit like matte
  // (fully rough: a specular intensity of 0 gave black specks, from NaNs in the tracer)
  iridescent: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: FILM_MAP }),
  glass: () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.03, metalness: 0, transmission: 1, ior: 1.5, thickness: 0.05, side: THREE.DoubleSide }),
};

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
    if (o.style !== 'frame') {
      const mat = (MATERIALS[o.style === 'glass' ? 'glass' : o.material] || MATERIALS.matte)();
      // flat detached faces are seen from both sides
      if (v.tiles === 1) mat.side = THREE.DoubleSide;
      // Only what the tracer reads (the viewer's geometry also carries the edge distances and face
      // numbers for its shaders), and the colours as RGBA: the tracer gives meshes without colours
      // four components and merges everything into one buffer, so three would be read with the
      // wrong stride, and some faces would come out black.
      const g = new THREE.BufferGeometry(), src = v.faces.geometry.attributes;
      for (const k of ['position', 'normal']) g.setAttribute(k, src[k].clone());
      // the film's coordinates as the texture coordinates of the iridescent look
      g.setAttribute('uv', src.film.clone());
      const c3 = src.color.array, c4 = new Float32Array(c3.length / 3 * 4).fill(1);
      for (let i = 0, j = 0; i < c3.length; i += 3, j += 4) { c4[j] = c3[i]; c4[j + 1] = c3[i + 1]; c4[j + 2] = c3[i + 2]; }
      g.setAttribute('color', new THREE.BufferAttribute(c4, 4));
      add(g, mat, v.faces.matrixWorld);
    }
    if (v.stage.visible) {
      v.stage.traverse(m => {
        if (m.isMesh && m.parent.visible) add(m.geometry, new THREE.MeshStandardMaterial({ color: o.stage, roughness: 1, metalness: 0, side: m.material.side }), m.matrixWorld);
      });
    }
    // the key light: an area light 3 units wide where the directional one is, facing the shape;
    // bright enough to match it at that distance
    const key = new THREE.RectAreaLight(0xffffff, 7, 3, 3);
    key.position.copy(v.key.position);
    key.lookAt(v.key.target.position);
    scene.add(key);
    scene.environment = this.sky;
    scene.environmentIntensity = 0.8;
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
