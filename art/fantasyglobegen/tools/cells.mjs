// Writes the cell positions of one grid level as raw little-endian float64 x, y, z:
//   node tools/cells.mjs 7 cells.f64
import { writeFileSync } from 'node:fs';
import { buildGrid } from '../js/grid.js';
const [level, out] = process.argv.slice(2);
const g = buildGrid(+level);
writeFileSync(out, new Uint8Array(g.pos.buffer));
console.log(`${g.count} cells`);
