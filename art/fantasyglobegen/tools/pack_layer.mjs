// Packs raw float32 cell values into a .globe file with one layer:
//   node tools/pack_layer.mjs values.f32 <level> <name> <dtype> <unit> out.globe '{"params":"json"}'
import { readFileSync, writeFileSync } from 'node:fs';
import { encodeGlobe } from '../js/globefile.js';
const [src, level, name, dtype, unit, out, params = '{}'] = process.argv.slice(2);
const b = readFileSync(src);
const values = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
const bytes = await encodeGlobe({ params: JSON.parse(params), layers: { [name]: { level: +level, dtype, unit, values } } });
writeFileSync(out, bytes);
console.log(`${out}: ${bytes.length} bytes`);
