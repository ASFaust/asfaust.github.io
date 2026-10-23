// The iridescent look (R8): the colour of a thin film, like oil on water, whose thickness varies
// across the shape, so that bands of colour sweep through every face. It is a diffuse colour, lit
// like matte, not a specular effect (owner, 2026-10-23: no highlights, and not dark away from
// them).
//
// The thickness is a function of two coordinates that are linear in the position (filmUV), so a
// renderer can carry them per corner and interpolate them exactly, then evaluate the thickness and
// the colour per pixel: the viewer's shader does that, the Blender script builds the same in
// nodes, and the path tracer, which takes no custom shaders, reads a texture of the colour over
// the two coordinates (at normal incidence; the shift with the viewing angle is left out there).

import * as THREE from '../vendor/three.module.min.js';

// thickness in nanometres, the film's refractive index, the wavelengths taken for R, G, B, and the
// albedo: floor + gain × the interference, mixed towards its grey by 1 − saturation (pure
// interference is a neon rainbow; this keeps it deep, like oil on dark water)
export const FILM = { thin: 250, thick: 700, n: 1.33, lambda: [650, 532, 450], floor: 0.04, gain: 0.5, saturation: 0.55 };

// The two coordinates at a point: waves across the shape `band` long (world units), in two
// directions, each with period 1, so a texture over them can repeat.
export function filmUV(x, y, z, band) {
  const s = 1 / band;
  return [s * (0.8 * x + 0.5 * y + 0.33 * z), s * 0.65 * (-0.3 * x + 0.9 * y - 0.3 * z)];
}

// the thickness, 0 to 1 between FILM.thin and FILM.thick
export const filmT = (u, v) => 0.5 + 0.35 * Math.sin(2 * Math.PI * u) + 0.15 * Math.sin(2 * Math.PI * v + 1.3);

// The film's colour (linear RGB) at thickness t, seen at cos(angle) c from the normal: two-beam
// interference, light where the path difference 2 n d cos θ is a whole number of wavelengths.
export function filmColour(t, c = 1) {
  const d = FILM.thin + t * (FILM.thick - FILM.thin), n = FILM.n;
  const cosT = Math.sqrt(Math.max(0, 1 - (1 - c * c) / (n * n)));
  const w = FILM.lambda.map(l => 0.5 - 0.5 * Math.cos(2 * Math.PI * 2 * n * d * cosT / l)), grey = (w[0] + w[1] + w[2]) / 3;
  return w.map(x => FILM.floor + FILM.gain * (grey + FILM.saturation * (x - grey)));
}

// the same in GLSL, for the viewer's shader: vFilm carries filmUV, n the face normal in view space
export const FILM_GLSL = `
vec3 filmColour(vec2 uv, float c) {
  float t = 0.5 + 0.35 * sin(6.2831853 * uv.x) + 0.15 * sin(6.2831853 * uv.y + 1.3);
  float d = ${FILM.thin.toFixed(1)} + t * ${(FILM.thick - FILM.thin).toFixed(1)};
  float cosT = sqrt(max(0.0, 1.0 - (1.0 - c * c) / ${(FILM.n * FILM.n).toFixed(4)}));
  vec3 lambda = vec3(${FILM.lambda.map(l => l.toFixed(1)).join(', ')});
  vec3 w = 0.5 - 0.5 * cos(6.2831853 * 2.0 * ${FILM.n.toFixed(3)} * d * cosT / lambda);
  float grey = (w.r + w.g + w.b) / 3.0;
  return ${FILM.floor.toFixed(3)} + ${FILM.gain.toFixed(3)} * (grey + ${FILM.saturation.toFixed(3)} * (w - grey));
}`;

// the colour over one period of both coordinates, for the path tracer (sRGB, repeating)
export const FILM_MAP = (() => {
  const N = 256, data = new Uint8Array(4 * N * N);
  const enc = x => Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = filmColour(filmT((i + 0.5) / N, (j + 0.5) / N));
    data.set([enc(c[0]), enc(c[1]), enc(c[2]), 255], 4 * (j * N + i));
  }
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
})();
