// Conway notation: operators, then a seed, read from right to left. "tkD" is the truncated kis
// dodecahedron. A number after t or k limits it to vertices or faces of that degree ("k4C"), a
// number after P, A, Y, U or J picks the member of the family ("A7", "J27").

import { OPS } from './operators.js';
import { seedName } from './seeds.js';

const SEED = /([TCODI]|[PAYUJ]\d*)$/;

// Returns { ops: [{ op, n }, ...] in the order applied (rightmost first), letter, n, text }, with
// the composites expanded, or throws with a sentence for the user.
export function parse(text) {
  const s = text.replace(/\s+/g, '');
  if (!s) throw new Error('type an operator string, as in tkD');
  const m = s.match(SEED);
  if (!m) throw new Error('the string has to end in a seed: T, C, O, D, I, or P, A, Y, U, J with a number');
  const letter = m[1][0], n = m[1].length > 1 ? +m[1].slice(1) : undefined;
  seedName(letter, n); // throws for an unknown or out of range seed
  const head = s.slice(0, m.index);
  const ops = [];
  const re = /([a-z])(\d*)/gy;
  let tok;
  while (re.lastIndex < head.length) {
    const at = re.lastIndex;
    tok = re.exec(head);
    if (!tok) throw new Error(`“${head[at]}” is not an operator`);
    const [, op, num] = tok;
    const def = OPS[op];
    if (!def) throw new Error(`“${op}” is not an operator`);
    if (num && !def.n) throw new Error(`${op} (${def.name}) takes no number`);
    const k = num ? +num : undefined;
    if (k !== undefined && k < 3) throw new Error(`${op}${num}: degrees start at 3`);
    ops.push(...expand(op, k));
  }
  return { ops: ops.reverse(), letter, n, text: s };
}

// a composite as its parts, in written order
function expand(op, n) {
  const def = OPS[op];
  if (!def.base) return [{ op, n }];
  return [...def.base].flatMap(o => expand(o));
}

// "truncate · kis · dual of the dodecahedron"
export function describe(p) {
  const s = seedName(p.letter, p.n);
  if (!p.ops.length) return s;
  const names = [...p.text.slice(0, p.text.length - (p.letter + (p.n ?? '')).length).matchAll(/([a-z])(\d*)/g)]
    .map(([, op, num]) => OPS[op].name + (num ? (op === 't' ? ` (degree-${num} vertices)` : ` (${num}-sided faces)`) : ''));
  return names.join(' · ') + ' of the ' + s;
}

// vertex, edge and face counts after each operator, at most
export function estimate(counts, ops) {
  let c = counts;
  for (const { op } of ops) c = OPS[op].grow(c);
  return c;
}

