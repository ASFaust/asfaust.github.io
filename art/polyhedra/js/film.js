// The iridescent look (R8): a colour taken from a colour wheel at a phase that is a mix of three
// terms, each with its own weight (owner, 2026-10-23: "current + angle + holo, times a
// multiplier"; a fourth, rings round each face's centre, was tried and dropped on 2026-10-24):
//   bands  waves of colour sweeping across the whole shape (the first version's film thickness)
//   angle  how far the face turns away from the view: face-on and edge-on differ
//   holo   where the view reflects to in the world, like a hologram foil: it changes as the shape
//          turns under a still light
// phase = hue + cycles × (Σ weight × term), in turns of the wheel. The wheel is OKLCh at a fixed
// lightness, with the page's chroma. It is a diffuse colour: shine comes from the Specular slider.
//
// Every term is evaluated per pixel from quantities that interpolate exactly over a triangle:
// bands from two coordinates linear in the position (filmUV), angle and holo from the face's normal and the view. The viewer's shader does that, the
// Blender script builds the same in nodes, and the path tracer, which takes no custom shaders,
// gets the colour baked at the corners of finely subdivided faces for its still camera (trace.js).

export const LIGHTNESS = 0.72;
export const TERMS = ['bands', 'angle', 'holo'];

// The two coordinates at a point: waves across the shape `band` long (world units), in two
// directions, each with period 1.
export function filmUV(x, y, z, band) {
  const s = 1 / band;
  return [s * (0.8 * x + 0.5 * y + 0.33 * z), s * 0.65 * (-0.3 * x + 0.9 * y - 0.3 * z)];
}

// the bands term, 0 to 1
export const filmT = (u, v) => 0.5 + 0.35 * Math.sin(2 * Math.PI * u) + 0.15 * Math.sin(2 * Math.PI * v + 1.3);

// the holo term from the reflected view direction in the world (y up), 0 to 1 roughly
export const holoTerm = (rx, ry) => 0.5 + 0.35 * ry + 0.25 * rx;

// OKLCh (hue in radians) → linear sRGB, clamped
export function oklch(L, C, h) {
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const k = x => Math.min(1, Math.max(0, x));
  return [k(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), k(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), k(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
}

// The colour from the three terms. o: { iri: { bands, angle, holo, cycles }, hue (degrees),
// chroma }.
export function iriColour(o, bands, angle, holo) {
  const w = o.iri, p = o.hue / 360 + w.cycles * (w.bands * bands + w.angle * angle + w.holo * holo);
  return oklch(LIGHTNESS, o.chroma, 2 * Math.PI * p);
}

// The same in GLSL for the viewer's shader: uv is filmUV, N the face normal and V the direction to
// the eye (both in view space), vm the view matrix (for the world direction of the reflection).
export const IRI_GLSL = `
uniform vec3 uIriW;
uniform float uIriCycles;
uniform float uIriHue;
uniform float uIriChroma;
vec3 oklch(float L, float C, float h) {
  float a = C * cos(h), b = C * sin(h);
  float l = L + 0.3963377774 * a + 0.2158037573 * b, m = L - 0.1055613458 * a - 0.0638541728 * b, s = L - 0.0894841775 * a - 1.2914855480 * b;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return clamp(vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s), 0.0, 1.0);
}
vec3 iriColour(vec2 uv, vec3 N, vec3 V, mat4 vm) {
  float bands = 0.5 + 0.35 * sin(6.2831853 * uv.x) + 0.15 * sin(6.2831853 * uv.y + 1.3);
  float angle = 1.0 - clamp(dot(N, V), 0.0, 1.0);
  vec3 R = (vec4(reflect(-V, N), 0.0) * vm).xyz;
  float holo = 0.5 + 0.35 * R.y + 0.25 * R.x;
  float p = uIriHue + uIriCycles * dot(uIriW, vec3(bands, angle, holo));
  return oklch(${LIGHTNESS.toFixed(3)}, uIriChroma, 6.2831853 * p);
}`;
