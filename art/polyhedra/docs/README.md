# Conway Polyhedra: Start Here

This folder documents the polyhedra page at `art/polyhedra/` on the personal website (repo root: `repo/`). Read this file first; it says where everything else is.

## What the page is

An interactive page in the website's *Generative* section. You pick a seed polyhedron, apply Conway operators to it (or type Conway notation such as `tkD`), and see the result in 3D. It has two purposes, and they pull in different directions (see [realization/README.md](realization/README.md)):

1. **Showcase the operators**: correct, recognisable, mathematically honest shapes.
2. **Make interesting shapes and artsy renders**: freedom to bend shapes and render them beautifully.

It is a JavaScript port of the owner's C++/Python library **PolyOp** (`/home/andi/code/github-website/PolyOp`, outside the website repo). The port is a rewrite, not a translation; the C++ code is a reference for ideas only. Blender renders from that earlier work, which show the artistic direction, are in `PolyOp/polyop_ref/`.

## Doc map

| File | Contents |
|---|---|
| [backlog.md](backlog.md) | What to do next: short items, each linking to the doc with the details. |
| [realization/README.md](realization/README.md) | **The open research problem**: placing a graph in space. Defines the two goals, the facts known, the metrics, and lists the approaches. |
| [realization/canonical.md](realization/canonical.md) | Approach: canonical polyhedron (midsphere) by Hart's iteration. Implemented. |
| [realization/regular-faces.md](realization/regular-faces.md) | Regular faces and affine faces: detach faces, make each (affine-)regular, merge. The artsy optimizers. |
| [realization/planes.md](realization/planes.md) | Approach: optimize readability directly over face planes (simple) or vertices (simplicial). Implemented as the "Readable" optimizer. |
| [realization/spectral.md](realization/spectral.md) | Approach: eigenvectors of graph matrices. Not implemented yet. |
| [realization/nozono.md](realization/nozono.md) | Math note (by the owner): midpoint iteration, affine-regular polygons, rank-3 coplanarity. |
| [symmetry.md](symmetry.md) | Graph automorphisms, symmetry matrices, point-group names. Implemented. |
| [rendering.md](rendering.md) | The viewer and the artsy rendering track: materials, AO, colour, ideas. |

## Architecture

There is no build step. The page uses plain ES modules, loaded directly by the browser. three.js r170 is vendored in `vendor/`, together with a few of its add-ons in `vendor/addons/`. The add-ons import `'three'` by name, which an import map in `index.html` resolves. `RoomEnvironment.js` was patched to import the vendored file by path instead.

```
index.html, style.css     the page; layout copied from art/mandelbrot (viewer left, panels right, Info dialog)
js/main.js                UI wiring, state, URL hash, worker jobs, stats line, palette swatches
js/worker.js              one job per worker: build → symmetries → realize, posting positions live
js/pipeline.js            build, OPTIMIZERS, one optimizer run (Realization); shared by worker.js and the tests
js/notation.js            parse "tk4dD" → { ops, seed }, describe(), size estimate()
js/seeds.js               seed polyhedra from coordinates (Platonic, P/A/Y/U families, 35 Johnson solids)
js/hull.js                3D convex hull with coplanar faces merged; builds every seed
js/mesh.js                Polyhedron class, half-edge topology(), ring(), check(), centroids, normals
js/operators.js           Conway operators on half-edges; OPS table (names, composites, growth formulas)
js/canonical.js           flatten(), Realizer: Hart's canonicalization and the planar-only mode
js/faces.js               FaceRelaxer: regular faces, affine faces, face mean
js/frame.js               the per-round adjustments (centre, orthogonalise, normalise), random positions, rng
js/readable.js            Readable: the readable realization (planes or vertices, L-BFGS); readability()
js/symmetry.js            automorphisms(), fitMatrices(), symmetrize(), pointGroup()
js/viewer.js              three.js scene, flat-painted edges shader, materials, GTAO, palette colouring, export render
js/palettes.js            palette presets, hex ↔ linear helpers
js/colour.js              OKLCh → linear sRGB, golden-angle generated palette
js/export.js              OBJ, binary STL, download helper
tests/                    Node scripts (see below)
vendor/                   three.module.min.js (r170), RoomEnvironment.js, addons/ (EffectComposer, GTAOPass, …)
```

**Data flow.**
1. `main.run()` parses the text once for instant feedback, then starts a fresh worker for the shape. The previous worker is terminated, so there is never more than one shape.
2. The worker `build`s the polyhedron (seed → operators, relaxing canonically between operators), keeps those positions for "As built", and posts `mesh` (the faces as flat arrays, tags, census) and then `symmetry` (group name, order, face orbits).
3. The worker replays the **chain** of steps (`st.steps`): an optional init (`random` with its seed; `built` is the empty chain), then optimizers, each a `Realization` from wherever the previous one left the vertices, posting `start`, `pos` about every 40 ms, and `done` per step.
4. An optimizer button sends `run` (or `stop`, when it is the running one). The worker checks for new requests between frames: the running step stops there and reports its round count (`done` with `stopped`), and the new one starts from the current positions.
5. The main thread applies at most one position update per animation frame.

## Core data structures and conventions

- **Faces** are arrays of vertex indices, **counter-clockwise seen from outside**. Every operator relies on this; `check()` verifies a closed oriented genus-0 surface.
- **Half-edges** (`topology(P)`): `from, to, face, next, prev, twin, edge`, plus `out[v]` and `first[f]`. `ring(T, v)` lists the half-edges leaving `v`, counter-clockwise. Operators are written directly on these arrays, which is why their output is always correctly oriented.
- **Positions**: a `Float64Array`, 3 per vertex. The viewer receives `Float32Array` copies, scaled to fit the unit sphere.
- **Tags** (`ftags`, `vtags`, `ntags`): small integers recording origin, for the "colour by origin" option.
  - Faces grown from an old face keep its tag; faces grown around an old vertex take that vertex's tag.
  - Faces grown from edges, and all new vertices, get one fresh tag per operator application.
  - Dual swaps vertex and face tags.
  - Seeds tag faces by their number of sides, and all vertices with one more tag.
- **Operator geometry.** Each operator starts by recentring the shape and scaling it so the edge midpoints lie at mean distance 1, which is the midsphere for canonical input. New vertices then get these positions:
  - new points at 1/3 along edges (t, g, p),
  - face centroids (g),
  - reciprocals of face centroids, `c/|c|²` (d, j), which are exact for canonical input,
  - the kis apex lifted 0.3 × the face's mean radius along its normal,
  - chamfer corners at 1/3 of the way to the face centroid.
- **Composite operators** expand at parse time: `e=aa o=jj b=ta m=kj n=kd z=dk s=dg`. `tₙ` and `kₙ` act only on vertices or faces of degree n.
- **Size cap**: 120,000 edges. It is estimated before building, from the `grow` formulas in `OPS`.
- **URL hash** holds the whole state: `n` notation, `m` the chain (`random:83121,affine/n,regular:0.8/co@340`: a random init with its seed, then optimizers with regularity after a colon, adjustments after a slash, the round a step was stopped at after `@`; `built` for none; old single modes `faces`, `planar`, `raw` are still read), `st` style, `mat`, `ao`, `aos`, `c` colouring, `pal`, `pc` custom colours, `h`, `ch`, `e`, `ink`, `fov`, `spin`. Values equal to the default are omitted.

## Code style

Match the surrounding code:
- comments explain *why*, in full sentences,
- British spelling in identifiers and text (`colour`),
- terse helpers, no frameworks.

The page's look and structure follow `art/mandelbrot/`: theme toggle, Info dialog, collapsible panels, and the URL as state. The Info dialog in `index.html` explains the maths for visitors; keep it in sync with the code.

## Running and testing

- Serve the website: `python3 -m http.server 8765` in `repo/`, then open `http://127.0.0.1:8765/art/polyhedra/`.
- The tests are plain Node (v22), with no dependencies:
  - `node tests/topology.mjs`: census of every named solid, validity of 200 random strings, size estimates, `dd`/`rr` involutions.
  - `node tests/symmetry.mjs [-v]`: automorphism counts and point-group names for 36 shapes; symmetrize exactness.
  - `node tests/realize.mjs [--mode chain] [--sym] [--random N] [--max-it N] [--regularity x] [strings…]`: the realization benchmark; the chain is optimizers run in turn from the built shape (`canonical,regular`), metrics after the last; metrics are explained in [realization/README.md](realization/README.md#measuring).
  - `node tests/planes.mjs [--start raw|canonical] [strings…]`: the readability optimizer for simple and simplicial graphs ([realization/planes.md](realization/planes.md)).
  - `node tests/screenshot.mjs <url> <out.png> [waitMs] [js…]`: headless Chrome over CDP (`google-chrome` with SwiftShader, so it is slow on big shapes). It prints console errors and the values of the given JS expressions; `sleep:ms` waits.
- `tests/lib.mjs` has the shared helpers: a seeded random generator, the random-string generator, `census`, `metrics`, and `balance` (per-face roundness and size).

## Decisions and their reasons

- **One operator engine on half-edges**, not a port of each C++ operator. Orientation then comes for free, and new operators are about 20 lines each.
- **Seeds from coordinates and a hull**, so the Johnson solids need no hand-written face lists. They are built as stacks of regular-polygon "rings" with unit edges (`tower()` in `seeds.js`).
- **Relax between operators** (not after the last; the optimizer chain does that). Without it, long strings start from degenerate geometry and canonicalization fails (`pgI`, `cccC`).
- **Edges painted flat onto faces in the shader**, not tubes and balls; this is the owner's preference. The width is in world units relative to the mean edge length, so exports look the same at every resolution.
- **Workers are terminated when the shape changes**, so a new shape always starts clean; within one shape, optimizer runs are interrupted between frames instead, so the next one can start from the current positions.
- **Optimizers are buttons that chain**, not a mode that restarts (owner, 2026-10-21): using them in sequence, and stopping them part-way, is an artsy control. Every optimizer is deterministic, so the chain with stop rounds in the URL replays exactly. The symmetry is kept except after a random init. **Inits** (As built, Random) start the chain again; a new polyhedron empties it (owner). **Adjustments** (centre, orthogonalise, normalise; `frame.js`) are recorded per step when its button is clicked, so a chain replays exactly.
- The owner works with fresh Claude Code sessions per task. Keep these docs current, and record findings, including negative results, where they belong.
