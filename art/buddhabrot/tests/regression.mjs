// Regression check for refactors: renders a few URLs that cover every path and hashes the canvas pixels.
// Rendering is deterministic on one machine, so a change that should not alter images must keep the hashes.
//   node tests/regression.mjs record     store the hashes (before the change)
//   node tests/regression.mjs            compare with the stored hashes (after it); exits with 1 on a difference
// It serves repo/ itself, on a free port. The chunk sizes, and so the images, depend on the core count, so the hashes
// are stored per core count, in tests/hashes-<cores>.json. Record again after a change that alters images on purpose.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, evaluate, sleep } from './chrome.mjs';

const CASES = {
  default: '',
  bisection: '#samples=20000&nearby_points=0&refine_steps=40',
  nearby: '#samples=20000&nearby_points=20&refine_steps=40&soft_points=1&blur_px=2&scale_mode=log&gradient=000000@0,ff0000@0.4,ffffff@1&min_clip=0.1',
  grid: '#sampler=grid&samples=50000&max_iter=1000&scale_mode=equalize',
  length: '#sampler=grid&samples=50000&max_iter=1000&colour_mode=length&channel_norm=shared',
  midtone: '#sampler=grid&samples=50000&max_iter=1000&midtone=0.35&colour_mode=length',
  metropolis: '#sampler=grid&samples=2000&xmin=-0.5&xmax=0&ymin=0.4&ymax=0.9&resolution=400'
};
const HASH = 'const c=document.getElementById("canvas");const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let h=0;for(let i=0;i<d.length;i++)h=(Math.imul(h,31)+d[i])|0;c.width+":"+h';
const DONE = '!document.getElementById("stopBtn").disabled ? false : !!document.getElementById("stats").textContent';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '../../..');
const file = join(here, `hashes-${cpus().length}.json`);
const record = process.argv[2] === 'record';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const body = readFileSync(join(root, p)); res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/art/buddhabrot/`;

const { send, close } = await launch(1400, 900, 9335);
const hashes = {};
for (const [name, hash] of Object.entries(CASES)) {
  await send('Page.navigate', { url: 'about:blank' });
  await send('Page.navigate', { url: base + hash });
  const t0 = Date.now();
  await sleep(500);
  while (!(await evaluate(send, DONE))) {
    if (Date.now() - t0 > 180e3) { console.log(name, 'timed out'); break; }
    await sleep(200);
  }
  hashes[name] = await evaluate(send, HASH);
  console.log(name.padEnd(12), hashes[name], ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}
close();
server.close();

if (record) {
  writeFileSync(file, JSON.stringify(hashes, null, 2) + '\n');
  console.log('recorded in', file);
  process.exit(0);
}
if (!existsSync(file)) { console.log('no hashes for this core count yet: run with "record" first'); process.exit(1); }
const stored = JSON.parse(readFileSync(file, 'utf8'));
const diff = Object.keys(CASES).filter(k => stored[k] !== hashes[k]);
console.log(diff.length ? 'CHANGED: ' + diff.join(', ') : 'all hashes match');
process.exit(diff.length ? 1 : 0);
