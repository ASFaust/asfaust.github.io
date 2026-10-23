// Packs raw float32 cell values into a .globe file with several layers:
//   node tools/pack_layers.mjs spec.json out.globe
// spec: { "params": {...}, "layers": { "<name>": { "file": "x.f32", "level": 6, "dtype": "float16", "frames": 12, "unit": "mm/day" } } }
import { readFileSync, writeFileSync } from 'node:fs';
import { encodeGlobe } from '../js/globefile.js';
const [specPath, out] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const layers = {};
for (const [name, { file, ...meta }] of Object.entries(spec.layers)) {
  const b = readFileSync(file);
  layers[name] = { ...meta, values: new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4) };
}
const bytes = await encodeGlobe({ params: spec.params || {}, layers });
writeFileSync(out, bytes);
console.log(`${out}: ${bytes.length} bytes`);
