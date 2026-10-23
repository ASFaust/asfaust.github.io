// Lines drawn onto the screen: every edge as a capsule of constant width in pixels, drawn over the
// rendered picture. Which parts of an edge are visible is not decided by depth (a flat band at the
// edge's depth would be half swallowed by the faces of a valley, and stick out of a ridge) but by a
// face buffer: the faces are rendered once more with their numbers as colours, and a point of an
// edge counts as visible when the pixels beside it belong to one of the edge's two faces. So the
// lines keep their full width at silhouettes and in valleys, and the hidden ones are known too:
// with the faces turned off they can be shown dimmed, or left out for a hidden-line drawing.
//
// Three passes after the scene: faces → face buffer; capsules → coverage (red visible, green hidden,
// blended by maximum, so that capsules meeting at a vertex join without darker dots); then the
// coverage as ink over the picture.

import * as THREE from '../vendor/three.module.min.js';

const ID_VERTEX = `
attribute float fid;
varying float vId;
void main() {
  vId = fid + 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// face number + 1 in 24 bits; 0 is the background
const ID_FRAGMENT = `
varying float vId;
void main() {
  float id = floor(vId + 0.5);
  gl_FragColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
}`;

// The quad of one edge, in pixels: the segment between the projected ends, padded by the larger
// half-width and a pixel for the antialiasing. The ends and half-widths go to the fragment shader
// unchanged, which then measures the distance to the segment itself.
const LINE_VERTEX = `
attribute vec2 corner;
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec2 aFaces;
uniform vec2 uRes;
uniform float uHalf;
uniform float uDepth;
uniform float uRef;
varying vec2 vA;
varying vec2 vB;
varying vec2 vH;
varying vec2 vFaces;
float halfWidth(float w) { return uHalf * pow(uRef / w, uDepth); }
void main() {
  vec4 a = projectionMatrix * modelViewMatrix * vec4(aStart, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(aEnd, 1.0);
  vA = (a.xy / a.w * 0.5 + 0.5) * uRes;
  vB = (b.xy / b.w * 0.5 + 0.5) * uRes;
  vH = vec2(halfWidth(a.w), halfWidth(b.w));
  vFaces = aFaces + 1.0;
  float pad = max(vH.x, vH.y) + 1.0;
  vec2 d = vB - vA;
  d = dot(d, d) > 1e-12 ? normalize(d) : vec2(1.0, 0.0);
  vec2 s = mix(vA, vB, corner.x) + pad * ((2.0 * corner.x - 1.0) * d + corner.y * vec2(-d.y, d.x));
  gl_Position = vec4(s / uRes * 2.0 - 1.0, 0.0, 1.0);
}`;

const LINE_FRAGMENT = `
uniform sampler2D uIds;
uniform vec2 uRes;
varying vec2 vA;
varying vec2 vB;
varying vec2 vH;
varying vec2 vFaces;
float idAt(vec2 q) {
  vec4 c = texelFetch(uIds, ivec2(clamp(q, vec2(0.0), uRes - 1.0)), 0) * 255.0;
  return floor(c.r + 0.5) + 256.0 * floor(c.g + 0.5) + 65536.0 * floor(c.b + 0.5);
}
bool mine(vec2 q) { float id = idAt(q); return abs(id - vFaces.x) < 0.5 || abs(id - vFaces.y) < 0.5; }
void main() {
  vec2 p = gl_FragCoord.xy, ab = vB - vA;
  float t = clamp(dot(p - vA, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  vec2 c = vA + t * ab;
  float cover = clamp(mix(vH.x, vH.y, t) + 0.5 - length(p - c), 0.0, 1.0);
  if (cover <= 0.0) discard;
  // the faces on either side of the edge at the nearest point of the segment; a face seen almost
  // edge-on is thinner than a pixel, hence several distances
  vec2 n = dot(ab, ab) > 1e-12 ? normalize(vec2(-ab.y, ab.x)) : vec2(0.0);
  bool seen = mine(c) || mine(c + n) || mine(c - n) || mine(c + 2.0 * n) || mine(c - 2.0 * n);
  gl_FragColor = seen ? vec4(cover, 0.0, 0.0, 1.0) : vec4(0.0, cover, 0.0, 1.0);
}`;

const INK_VERTEX = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const INK_FRAGMENT = `
uniform sampler2D uCover;
uniform vec3 uInk;
uniform float uHidden;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uCover, vUv);
  gl_FragColor = vec4(uInk, max(c.r, uHidden * c.g));
  #include <colorspace_fragment>
}`;

export class Lines {
  constructor() {
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.ids = rt();
    this.cover = rt();
    this.cover.depthBuffer = false;
    this.idMat = new THREE.ShaderMaterial({ vertexShader: ID_VERTEX, fragmentShader: ID_FRAGMENT, side: THREE.DoubleSide });
    this.uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) }, uHalf: { value: 1 }, uDepth: { value: 0 }, uRef: { value: 1 },
      uIds: { value: this.ids.texture },
    };
    this.lineMat = new THREE.ShaderMaterial({
      vertexShader: LINE_VERTEX, fragmentShader: LINE_FRAGMENT, uniforms: this.uniforms,
      depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendEquationAlpha: THREE.MaxEquation,
    });
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('corner', new THREE.Float32BufferAttribute([0, -1, 1, -1, 1, 1, 0, 1], 2));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    this.lines = new THREE.Mesh(quad, this.lineMat);
    this.lines.frustumCulled = false;
    this.lineScene = new THREE.Scene();
    this.lineGroup = new THREE.Group();
    this.lineGroup.add(this.lines);
    this.lineScene.add(this.lineGroup);
    this.ink = { uCover: { value: this.cover.texture }, uInk: { value: new THREE.Color() }, uHidden: { value: 0 } };
    this.inkMat = new THREE.ShaderMaterial({ vertexShader: INK_VERTEX, fragmentShader: INK_FRAGMENT, uniforms: this.ink, transparent: true, depthTest: false, depthWrite: false });
    this.inkScene = new THREE.Scene();
    const full = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.inkMat);
    full.frustumCulled = false;
    this.inkScene.add(full);
    this.flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.edges = null;
  }

  // The edges of a new polyhedron, each with its two faces (m as in Viewer.setMesh).
  setMesh(m) {
    const seen = new Map(), edges = [];
    for (let f = 0; f < m.nf; f++) {
      const a = m.fo[f], d = m.fo[f + 1] - a;
      for (let k = 0; k < d; k++) {
        const u = m.fv[a + k], w = m.fv[a + (k + 1) % d], key = u < w ? u * m.nv + w : w * m.nv + u;
        const e = seen.get(key);
        if (e === undefined) { seen.set(key, edges.length); edges.push([u, w, f, f]); } else edges[e][3] = f;
      }
    }
    this.edges = edges;
    // a new geometry per polyhedron: three remembers the instance count of the first draw
    // (_maxInstanceCount) and would draw no more edges than the first shape had
    const old = this.lines.geometry, g = new THREE.InstancedBufferGeometry(), n = edges.length;
    g.setAttribute('corner', old.attributes.corner);
    g.setIndex(old.index);
    old.dispose();
    this.lines.geometry = g;
    const faces = new Float32Array(2 * n);
    edges.forEach(([, , f, h], i) => { faces[2 * i] = f; faces[2 * i + 1] = h; });
    g.setAttribute('aStart', new THREE.InstancedBufferAttribute(new Float32Array(3 * n), 3));
    g.setAttribute('aEnd', new THREE.InstancedBufferAttribute(new Float32Array(3 * n), 3));
    g.setAttribute('aFaces', new THREE.InstancedBufferAttribute(faces, 2));
    g.instanceCount = n;
  }

  // new positions, already scaled as the viewer draws them
  setPositions(p) {
    if (!this.edges) return;
    const g = this.lines.geometry, A = g.attributes.aStart, B = g.attributes.aEnd;
    this.edges.forEach(([u, w], i) => {
      for (let j = 0; j < 3; j++) { A.array[3 * i + j] = p[3 * u + j]; B.array[3 * i + j] = p[3 * w + j]; }
    });
    A.needsUpdate = true; B.needsUpdate = true;
  }

  // Draws the lines over what the renderer has just drawn to the screen. width is the full line
  // width in pixels; depth makes far lines thinner, as (camera distance / depth)^depth; hidden is
  // how strongly the hidden lines show; hide lists what is not the shape (the stage), left out of
  // the face buffer.
  draw(renderer, scene, camera, group, { width, depth, hidden, ink, hide = [] }) {
    if (!this.edges || width <= 0) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (this.ids.width !== size.x || this.ids.height !== size.y) { this.ids.setSize(size.x, size.y); this.cover.setSize(size.x, size.y); }
    const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);

    const env = scene.environment, bg = scene.background;
    const shown = hide.map(o => o.visible);
    hide.forEach(o => { o.visible = false; });
    scene.overrideMaterial = this.idMat; scene.environment = null; scene.background = null;
    renderer.setRenderTarget(this.ids);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null; scene.environment = env; scene.background = bg;
    hide.forEach((o, i) => { o.visible = shown[i]; });

    this.lineGroup.quaternion.copy(group.quaternion);
    this.lineGroup.position.copy(group.position);
    Object.assign(this.uniforms.uRes.value, { x: size.x, y: size.y });
    this.uniforms.uHalf.value = width / 2;
    this.uniforms.uDepth.value = depth;
    this.uniforms.uRef.value = camera.position.length();
    renderer.setRenderTarget(this.cover);
    renderer.clear();
    renderer.render(this.lineScene, camera);

    renderer.setRenderTarget(null);
    renderer.setClearColor(clear, alpha);
    this.ink.uInk.value.copy(ink);
    this.ink.uHidden.value = hidden;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.inkScene, this.flat);
    renderer.autoClear = auto;
  }
}
