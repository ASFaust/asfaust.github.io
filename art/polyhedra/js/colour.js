// Colours in OKLCh (Björn Ottosson's OKLab in polar form): lightness L in [0, 1], chroma C,
// hue h in degrees. The same as in the Mandelbrot page, without the ramps.

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

const inGamut = rgb => rgb.every(x => x >= -1e-4 && x <= 1 + 1e-4);

// Linear sRGB in [0, 1] of an OKLCh colour, with the chroma lowered until the screen can show it;
// lightness and hue stay. Linear, because that is what three.js wants for vertex colours.
export function oklchLinear(L, C, h) {
  const ca = Math.cos(h * Math.PI / 180), sa = Math.sin(h * Math.PI / 180);
  if (!inGamut(linear(L, C * ca, C * sa))) {
    let lo = 0, hi = C;
    for (let i = 0; i < 24; i++) {
      const c = (lo + hi) / 2;
      if (inGamut(linear(L, c * ca, c * sa))) lo = c; else hi = c;
    }
    C = lo;
  }
  return linear(L, C * ca, C * sa).map(x => Math.min(1, Math.max(0, x)));
}

// The i-th colour of a palette that starts at hue h and steps by the golden angle, so that
// neighbouring classes always differ clearly, however many there are. Lightness alternates a
// little for the same reason.
export function paletteColour(i, h, C) {
  return oklchLinear(i % 2 ? 0.7 : 0.82, C, h + 137.508 * i);
}
