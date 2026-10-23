// The survey harness (X2, docs/exploration.md): runs one chain of steps over many strings, exactly
// as the page replays a link, and writes one row per shape with its graph features and what the
// chain made of it. Every question in exploration.md starts with a survey.
//
// node tests/survey.mjs [--chain regular,flat] [--random N] [--seed S] [--catalogue] [--max-edges E]
//                       [--json] [--out file] [--shots dir] [--base url] [strings...]
//
// --chain is the link's m= part (default canonical), so "regular/w,flat/w" or "spectral:1,flat"
// work; --random N adds N random strings (tests/lib.mjs, seed S); --catalogue adds the strings of
// the examples menu with its own chains (and ignores --chain for them); --max-edges skips bigger
// shapes (default 4000). Output is CSV to stdout, or JSON lines with --json; --out writes to a
// file instead. --shots saves a screenshot per shape into that folder (needs the repo served, as
// for tests/screenshot.mjs; --base is the page, default http://127.0.0.1:8765/art/polyhedra/).
//
// Columns. Graph: string, chain, seed letter, operators, vertices, edges, faces, faces by degree
// ("3:20 4:30"), all triangles / all quadrilaterals / all faces even, vertex kinds (distinct
// cyclic degree sequences round a vertex), the smallest and largest regular angle sum at a vertex
// (the corner angles of regular faces of those degrees, in degrees) and the fraction of vertices
// where it is 360 or more (no convex regular realization there), automorphisms, point group of
// the result. Outcome: rounds of the last step, settled (stopped by its tolerance, not the round
// cap), its error ("spread 1.2e-2", or "planar … tangent …"), seconds, then tests/lib.mjs's metrics: planar, inward, reflex, reflex corners,
// selfX, edge ratio, turn, density.

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session } from '../js/pipeline.js';
import { parse } from '../js/notation.js';
import { parseSteps, message } from '../js/chain.js';
import { EXAMPLES } from '../js/examples.js';
import { fitMatrices, pointGroup } from '../js/symmetry.js';
import { density } from '../js/spectral.js';
import { metrics, randomStrings } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const chain = opt('--chain', 'canonical'), random = +opt('--random', 0), seed = +opt('--seed', 12345);
const maxEdges = +opt('--max-edges', 4000), out = opt('--out', null), shots = opt('--shots', null);
const base = opt('--base', 'http://127.0.0.1:8765/art/polyhedra/');
const json = flag('--json'), catalogue = flag('--catalogue');

const jobs = [...args, ...randomStrings(random, seed)].map(text => ({ text, chain }));
if (catalogue) for (const [, list] of EXAMPLES) for (const [, link] of list) {
  const q = Object.fromEntries(link.split('&').map(kv => kv.split('=')));
  jobs.push({ text: q.n, chain: q.m || 'canonical' });
}

// the graph's features, from the faces alone
function features(P) {
  const deg = new Map();
  for (const f of P.faces) deg.set(f.length, (deg.get(f.length) || 0) + 1);
  const degs = [...deg.keys()].sort((a, b) => a - b);
  // the faces round each vertex, in no particular order: enough for the angle sum; the kinds
  // compare the sorted degree lists (mirror images and rotations count as one)
  const round = Array.from({ length: P.nv }, () => []);
  for (const f of P.faces) for (const v of f) round[v].push(f.length);
  const sums = round.map(ds => ds.reduce((s, d) => s + 180 - 360 / d, 0));
  const kinds = new Set(round.map(ds => ds.slice().sort((a, b) => a - b).join('.')));
  return {
    faceDegrees: degs.map(d => `${d}:${deg.get(d)}`).join(' '),
    allTriangles: degs.length === 1 && degs[0] === 3, allQuads: degs.length === 1 && degs[0] === 4, allEven: degs.every(d => d % 2 === 0),
    vertexKinds: kinds.size, angleMin: Math.round(Math.min(...sums)), angleMax: Math.round(Math.max(...sums)),
    angleFull: +(sums.filter(s => s >= 360 - 1e-9).length / P.nv).toFixed(3),
  };
}

const rows = [];
for (const { text, chain: c } of jobs) {
  const row = { string: text, chain: c };
  try {
    const p = parse(text);
    row.seed = p.letter + (p.n ?? '');
    row.ops = text.slice(0, text.length - row.seed.length);
    const S = new Session(text, { maxEdges });
    const P = S.P;
    Object.assign(row, { vertices: P.nv, edges: P.ne, faces: P.nf }, features(P));
    row.automorphisms = S.symmetries().maps.length;
    const t0 = performance.now();
    let last = null;
    for (const t of parseSteps(c)) { const R = S.run(message(t)); if (R && R.it !== undefined) last = R; }
    row.seconds = +((performance.now() - t0) / 1000).toFixed(2);
    row.rounds = last ? last.it : 0;
    row.settled = last ? last.done : true;
    // the last step's own error: spread for the face optimizers, planar and tangent for canonical
    row.error = last ? Object.entries(last.R.error()).map(([k, v]) => `${k} ${(+v).toExponential(1)}`).join(' ') : '';
    const m = metrics(P);
    Object.assign(row, {
      planar: +m.planarMax.toExponential(2), inward: m.inward, reflex: m.reflex, reflexCorners: m.reflexCorners, selfX: m.selfX,
      edgeRatio: +m.edgeRatio.toFixed(3), turn: +m.turnMin.toFixed(3), density: +density(P.faces, P.pos).toFixed(3),
      group: pointGroup(fitMatrices(P.pos, S.maps).Rs),
    });
  } catch (e) {
    row.failed = e.message;
  }
  rows.push(row);
  process.stderr.write(`${rows.length}/${jobs.length} ${text} ${c}${row.failed ? ' — ' + row.failed : ''}\n`);
  if (shots && !row.failed) {
    mkdirSync(shots, { recursive: true });
    const here = dirname(fileURLToPath(import.meta.url));
    spawnSync('node', [join(here, 'screenshot.mjs'), `${base}#n=${encodeURIComponent(text)}&m=${c}`, join(shots, `${text}_${c.replace(/[^\w.-]+/g, '_')}.png`), '8000'], { stdio: 'ignore' });
  }
}

const COLUMNS = ['string', 'chain', 'seed', 'ops', 'vertices', 'edges', 'faces', 'faceDegrees', 'allTriangles', 'allQuads', 'allEven', 'vertexKinds', 'angleMin', 'angleMax', 'angleFull',
  'automorphisms', 'group', 'rounds', 'settled', 'error', 'seconds', 'planar', 'inward', 'reflex', 'reflexCorners', 'selfX', 'edgeRatio', 'turn', 'density', 'failed'];
const text = json ? rows.map(r => JSON.stringify(r)).join('\n') + '\n'
  : [COLUMNS.join(','), ...rows.map(r => COLUMNS.map(k => { const v = r[k] ?? ''; return /[,"\s]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v; }).join(','))].join('\n') + '\n';
if (out) writeFileSync(out, text); else process.stdout.write(text);
