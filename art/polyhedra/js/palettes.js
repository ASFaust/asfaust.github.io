// Face palettes. A colouring (origin, sides, orbit) gives every face a class number, and class k
// takes colour k of the palette, wrapping around. "generated" is endless: it steps around the hue
// circle from a start hue by the golden angle (colour.js). The others are fixed lists of sRGB
// colours, and "custom" is whatever the swatches were edited to.

import { paletteColour } from './colour.js';

export const PALETTES = {
  generated: { name: 'Generated from hue' },
  pastel: { name: 'Pastel', colours: ['#f4b6b8', '#b5e0c8', '#bccff6', '#f7dc9c', '#d6c2f0', '#a9dde5'] },
  earth: { name: 'Earth', colours: ['#c8a27a', '#7d8f69', '#e3cfa9', '#9c6644', '#5f7470', '#e3b178'] },
  ocean: { name: 'Ocean', colours: ['#0b3954', '#5aa9e6', '#bfd7ea', '#087e8b', '#c4fff9', '#3d5a80'] },
  ember: { name: 'Ember', colours: ['#ffba08', '#dc2f02', '#f48c06', '#9d0208', '#faa307', '#6a040f'] },
  mono: { name: 'Monochrome', colours: ['#f2f2f2', '#8a8a8a', '#cfcfcf', '#5c5c5c', '#e3e3e3', '#a6a6a6'] },
  // for the metal material, where the colour is the colour of the reflection
  metals: { name: 'Metals', colours: ['#f5cf73', '#e8a07a', '#e6e6e6', '#6e7177', '#d8c48a', '#e7a9a4'] },
  // for the iridescent material: pale bases, so that the thin-film colours show
  pearl: { name: 'Pearl', colours: ['#f4f7ff', '#fdeef6', '#effbf4', '#fff8e8'] },
  custom: { name: 'Custom' },
};

const hex = rgb => '#' + rgb.map(x => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('');
const toLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const encode = x => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

// '#rrggbb' → linear sRGB, as three.js wants for vertex colours
export function linearOf(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(x => toLinear(x / 255));
}

// The palette as '#rrggbb' strings: n of them for the generated one, the stored list otherwise.
export function paletteHex({ palette, hue, chroma, custom }, n) {
  if (palette === 'generated') return Array.from({ length: Math.max(1, n) }, (_, i) => hex(paletteColour(i, hue, chroma).map(encode)));
  if (palette === 'custom') return custom.length ? custom : ['#cccccc'];
  return PALETTES[palette].colours;
}

export const isHex = s => /^#[0-9a-f]{6}$/i.test(s);
