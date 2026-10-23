// Colours in OKLCh (Björn Ottosson's OKLab in polar form): lightness L in [0, 1], chroma C,
// hue h in degrees. Equal steps in L and C look equal, and the hue stays put as L changes.

// OKLab → linear sRGB
function linear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

// linear light → sRGB
const encode = x => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const inGamut = rgb => rgb.every(x => x >= -1e-4 && x <= 1 + 1e-4);

// OKLab of an OKLCh colour, with the chroma lowered until the screen can show it; lightness and
// hue stay.
function toGamut(L, C, h) {
  const ca = Math.cos(h * Math.PI / 180), sa = Math.sin(h * Math.PI / 180);
  if (!inGamut(linear(L, C * ca, C * sa))) {
    let lo = 0, hi = C;
    for (let i = 0; i < 24; i++) {
      const c = (lo + hi) / 2;
      if (inGamut(linear(L, c * ca, c * sa))) lo = c; else hi = c;
    }
    C = lo;
  }
  return [L, C * ca, C * sa];
}

// sRGB in [0, 1] of an OKLab colour, clamped to the screen.
export const srgb = (L, a, b) => linear(L, a, b).map(x => encode(Math.min(1, Math.max(0, x))));

// sRGB in [0, 1] of an OKLCh colour, brought into the screen's gamut.
export const oklch = (L, C, h) => srgb(...toGamut(L, C, h));

export const css = rgb => `rgb(${rgb.map(x => Math.round(x * 255)).join(' ')})`;

export const LUT_SIZE = 1024;

// The ramp from the grey value 0 (at the set) to 1 (far out): lightness and chroma move linearly
// from their near ends to their far ends, at one hue. LUT_SIZE entries, as sRGB bytes and as OKLab.
export function ramp({ hue, l0, l1, c0, c1 }) {
  const rgb = new Uint8Array(LUT_SIZE * 3), lab = new Float32Array(LUT_SIZE * 3);
  for (let i = 0; i < LUT_SIZE; i++) {
    const v = i / (LUT_SIZE - 1);
    const c = toGamut(l0 + (l1 - l0) * v, c0 + (c1 - c0) * v, hue);
    const e = srgb(...c);
    for (let k = 0; k < 3; k++) {
      lab[3 * i + k] = c[k];
      rgb[3 * i + k] = Math.round(e[k] * 255);
    }
  }
  return { rgb, lab };
}
