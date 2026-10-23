# Conway Polyhedra: Start Here

This folder documents the polyhedra page at `art/polyhedra/` on the personal website (repo root: `repo/`). Read this file first. It says what the page is, where everything is, and how to work on it.

**If you were given a backlog item** (an ID such as `R4` or `X2`): read this file, then the item in [backlog.md](backlog.md), then the doc section it links to. That should be enough to start.

## What the page is

An interactive page in the website's *Generative art* section. It has no preview image on the home page yet, unlike the other entries (owner, 2026-10-23: still under development); add `art/polyhedra/preview.webp` (192 px) and an `<a class="thumb">` in `index.html` once it settles. You pick a seed polyhedron, apply Conway operators to it (or type Conway notation such as `tkD`), place it in space with a chain of optimizer buttons, and render it. It has two purposes, which pull in different directions:

1. **Nice shapes (goal A)**: correct, recognisable, mathematically honest pictures of the polyhedron. *Mostly solved* (owner, 2026-10-23): Canonical, Readable, Face mean and Flat faces cover nearly every graph; the exceptions are in the backlog.
2. **Artsy shapes (goal B)**: "artsy" means **non-convex** (owner, 2026-10-23), with the symmetry kept. Regular faces is the best optimizer for it so far. See [realization/README.md](realization/README.md#goal-b-artsy-shapes) for what is known about artsy optimizers, and why the search for new ones is mostly paused.

Beyond the shapes, the page is meant to make **beautiful renders** in a few distinct looks ([rendering.md](rendering.md)). That is the next big task.

It is a JavaScript port of the owner's C++/Python library **PolyOp** (`/home/andi/code/github-website/PolyOp`, outside the website repo). The port is a rewrite, not a translation; the C++ code is a reference for ideas only. Blender renders from that earlier work, which show the artistic direction, are in `PolyOp/polyop_ref/` (described in [rendering.md](rendering.md#reference-renders)).

## Doc map

| File | What it holds |
|---|---|
| [backlog.md](backlog.md) | **Every task**, with an ID, grouped by track, each linking to its details. The only task list. |
| [rendering.md](rendering.md) | How the viewer works, the owner's critique of it, the target looks, and the render work items. |
| [catalogue.md](catalogue.md) | The owner's favourite shapes: links, what makes them work, key numbers. The source for the examples menu. |
| [exploration.md](exploration.md) | The research project on shape classes: which graphs do what under which optimizer (regular-only non-convex shapes, affine stars, self-intersection). |
| [realization/README.md](realization/README.md) | Placing a graph in space: the two goals, known facts, vocabulary, metrics and balance, the optimizer interface, and the list of all optimizers. |
| [realization/canonical.md](realization/canonical.md) | Canonical (Hart's iteration) and Flat faces. |
| [realization/readable.md](realization/readable.md) | Readable: balance optimized over face planes or vertices. |
| [realization/regular-faces.md](realization/regular-faces.md) | The detach-and-merge optimizers: Regular, Affine, Star, Stellate, Face mean, Equal edges, the Mix; Whiten. |
| [realization/spectral.md](realization/spectral.md) | Spectral inits: eigenvectors of graph matrices. |
| [realization/nozono.md](realization/nozono.md) | Maths note by the owner: midpoint iteration, affine-regular polygons, rank-3 coplanarity. Do not restructure it. |
| [symmetry.md](symmetry.md) | Automorphisms, symmetry matrices, point groups, and subgroups (open). |

### How the docs are kept

- **Topic docs** start with a status block (status, code, tests, backlog IDs), then *How it works*, then *Findings* (dated, newest facts kept, negative results included), then *Open questions*, each pointing to a backlog ID if there is one.
- **The backlog holds tasks; topic docs hold knowledge.** Do not put findings in the backlog, or task lists in topic docs.
- When you finish an item, move it to *Done* in the backlog with a date and one line, and put what you learned in the topic doc it links to. Fix anything you find stale on the way.
- Owner quotes and decisions carry a date: "(owner, 2026-10-23)". Proposals by a session are marked as such until the owner decides.
- The owner starts a fresh session per task, so a doc must make sense without the conversation that wrote it.

## How the owner uses the page

From the owner's reports (2026-10-22 and 2026-10-23). Read this before changing the optimizer UI.

**Nice:**
1. Canonical or Readable often works.
2. If not: Face mean with Whiten first, then Canonical or Readable. `ckmU5` needs this, and even then Canonical tangles ([realization/canonical.md](realization/canonical.md#failure-modes)).
3. If still not: Flat faces at the end gives a quite nice result.

**Artsy:**
- Most often: Regular faces, then Flat faces, sometimes with Whiten on. It does not always work. When it does, the folds come from the regular faces having too little room: "symmetrical creases" (owner). The owner usually wants flat faces at the end, which often disagrees with what Regular faces settled on.
- Affine faces instead; it works less often, and needs Whiten or it often collapses the shape.
- Flat faces directly from the built shape, or a spectral init (mostly the adjacency matrix), then Flat faces.
- Star faces alone does nothing interesting (it was a session's idea); Stellate then Star faces makes the uniform star polyhedra.

The owner likes the "button mashing" style and wants to keep it.

## Architecture

There is no build step. The page uses plain ES modules, loaded directly by the browser. three.js r170 is vendored in `vendor/`, with a few add-ons in `vendor/addons/`. The add-ons import `'three'` by name, which an import map in `index.html` resolves. `RoomEnvironment.js` was patched to import the vendored file by path instead.

```
index.html, style.css     the page; layout copied from art/mandelbrot (viewer left, panels right, Info dialog)
js/main.js                UI wiring, state, URL hash, worker jobs, steps list, Share (pruning worker), the Mix, stats line, palette swatches
js/chain.js               the chain of steps in the URL: parseSteps, stepsText, the worker message (shared with the tests)
js/examples.js            the examples menu: the catalogue's links with the owner's short names
js/worker.js              one job per worker: build → symmetries → realize, posting positions live; keeps the state after every step; a second instance prunes a chain for Share
js/pipeline.js            build, OPTIMIZERS, one optimizer run (Realization), Session (one shape and its steps), prune; shared by worker.js and the tests
js/notation.js            parse "tk4dD" → { ops, seed }, describe(), size estimate()
js/seeds.js               seed polyhedra from coordinates (Platonic, P/A/Y/U families, 35 Johnson solids)
js/hull.js                3D convex hull with coplanar faces merged; builds every seed
js/mesh.js                Polyhedron class, half-edge topology(), ring(), check(), centroids, normals
js/operators.js           Conway operators on half-edges; OPS table (names, composites, growth formulas)
js/canonical.js           flatten(), Realizer: Hart's canonicalization and the planar-only mode (Flat faces)
js/faces.js               FaceRelaxer: detach-and-merge with weighted targets over faces, edges and vertices; one target = one button, several = Mix
js/spectral.js            SymmetricEigen, spectralStarts(), density()
js/frame.js               whiten (ZCA), the old adjustments (still replayed), shake, random positions, rng, jacobi, shapeDistance
js/readable.js            Readable optimizer; readability()
js/symmetry.js            automorphisms(), fitMatrices(), symmetrize(), pointGroup(), views() (symmetric orientations)
js/viewer.js              three.js scene, painted-edges shader, materials, palette colouring, export render
js/tiles.js               detached faces (R7): the tiles' faces and positions
js/lines.js               edges drawn on the screen: face-ID buffer, capsule lines, ink composite
js/blender.js             the Blender scene script: the RT scene as data plus Python that builds it for Cycles
js/trace.js               RT: the scene copied for three-gpu-pathtracer, traced a tile per frame (loaded on demand)
js/palettes.js            palette presets, hex ↔ linear helpers
js/colour.js              OKLCh → linear sRGB, golden-angle generated palette
js/export.js              OBJ, binary STL, download helper
tests/                    Node scripts (below)
vendor/                   three.module.min.js (r170), RoomEnvironment.js, addons/postprocessing/Pass.js (for the path tracer), three-gpu-pathtracer.js 0.0.23, three-mesh-bvh.js 0.8.3
```

**Data flow.**
1. `main.run()` parses the text once for instant feedback, then starts a fresh worker for the shape. The previous worker is terminated, so there is never more than one shape.
2. The worker `build`s the polyhedron (seed → operators, relaxing canonically between operators), keeps those positions for "As built", and posts `mesh` (faces as flat arrays, tags, census) and then `symmetry` (group name, order, face orbits).
3. The worker replays the **chain** of steps (`st.steps`) through a `Session` (`pipeline.js`): an optional init (`random` with its seed, `spectral` with its index and matrix; `built` is the empty chain), then optimizers and shakes, each a `Realization` from wherever the previous one left the vertices, posting `start`, `pos` about every 40 ms, and `done` per step. It keeps the state (positions, and whether the symmetry is kept) after every step.
4. An optimizer button sends `run` (or `stop`, when it is the running one). The worker checks for new requests between frames: the running step stops there and reports its round count, and the new one starts from the current positions. Clicking a step in the Steps list sends `goto`: the worker restores the state after it, and the page drops the later steps.
5. **Share** stops the running step, then a second worker runs `prune()`: it replays the chain with steps left out (shortest suffix first, then single drops) and returns the shortest chain that gives the same shape up to rotation (`shapeDistance < 1e-3`); the page copies that link. The address bar keeps the full chain.
6. The main thread applies at most one position update per animation frame.

## Core data structures and conventions

- **Faces** are arrays of vertex indices, **counter-clockwise seen from outside**. Every operator relies on this; `check()` verifies a closed oriented genus-0 surface.
- **Half-edges** (`topology(P)`): `from, to, face, next, prev, twin, edge`, plus `out[v]` and `first[f]`. `ring(T, v)` lists the half-edges leaving `v`, counter-clockwise. Operators are written directly on these arrays, which is why their output is always correctly oriented.
- **Positions**: a `Float64Array`, 3 per vertex. The viewer receives `Float32Array` copies, scaled to fit the unit sphere.
- **Tags** (`ftags`, `vtags`, `ntags`): small integers recording origin, for "colour by origin". Faces grown from an old face keep its tag; faces grown around an old vertex take that vertex's tag; faces grown from edges, and all new vertices, get one fresh tag per operator application; dual swaps vertex and face tags; seeds tag faces by their number of sides.
- **Operator geometry.** Each operator recentres the shape and scales it so the edge midpoints lie at mean distance 1 (the midsphere for canonical input). New vertices: points at 1/3 along edges (t, g, p), face centroids (g), reciprocals of face centroids `c/|c|²` (d, j; exact for canonical input), the kis apex lifted 0.3 × the face's mean radius, chamfer corners 1/3 of the way to the face centroid.
- **Composite operators** expand at parse time: `e=aa o=jj b=ta m=kj n=kd z=dk s=dg`. `tₙ` and `kₙ` act only on vertices or faces of degree n.
- **Size cap**: 120,000 edges, estimated before building from the `grow` formulas in `OPS`.
- **URL hash** holds the whole state: `n` notation; `m` the chain, for example `random:83121,affine/w,shake:5120,regular:0.8/wa@340,mix:regular=1+flat=0.5+pt=0.25/w` (an init: `random:seed`, `spectral:3`, `spectral:3:laplacian`, or nothing; then steps with a parameter after a colon: regularity, pointedness, shake seed, mix weights; switches after a slash: `w` whiten, `a` symmetry not kept, old `c o n` adjustments still replayed; the round a step was stopped at after `@`; `built` for none; old single modes `faces`, `planar`, `raw` still read); then `st` style, `mat`, `ao`, `aos`, `c` colouring, `pal`, `pc` custom colours, `h`, `ch`, `e`, `ln` edge type, `ed` thinner with depth, `hid` hidden lines, `ink`, the scene `or gr lift el az li bg`, `fov`, `spin`. Values equal to the default are omitted. **Favourite links in [catalogue.md](catalogue.md) use this format. The page is in development (owner, 2026-10-23): old links must still give the same *shape* (notation and chain: `n`, `m`), but their look may change freely; do not keep compatibility code for appearance keys.**

## Code style

Match the surrounding code: comments explain *why*, in full sentences; British spelling in identifiers and text (`colour`); terse helpers, no frameworks. The page's look and structure follow `art/mandelbrot/`: theme toggle, Info dialog, collapsible panels, the URL as state. The Info dialog in `index.html` explains the maths for visitors; keep it in sync with the code.

## Running and testing

- Serve the website: `python3 -m http.server 8765` in `repo/`, then open `http://127.0.0.1:8765/art/polyhedra/`.
- The tests are plain Node (v22), with no dependencies:
  - `node tests/topology.mjs`: census of every named solid, validity of 200 random strings, size estimates, `dd`/`rr` involutions.
  - `node tests/symmetry.mjs [-v]`: automorphism counts and point-group names for 36 shapes; symmetrize exactness.
  - `node tests/realize.mjs [--mode chain] [--sym] [--flags w] [--weights regular=1,flat=0.5] [--random N] [--max-it N] [--regularity x] [strings…]`: the realization benchmark. The chain is optimizers run in turn from the built shape (`canonical,regular`), metrics after the last; metrics are explained in [realization/README.md](realization/README.md#measuring).
  - `node tests/examples.mjs [--print] [filter]`: replays every entry of the examples menu (`js/examples.js`) through `js/chain.js`, as the page does, and checks faces, inward faces and reflex edges against [catalogue.md](catalogue.md). Run it after any change to an optimizer or to the chain format: an old link must still give the same shape. A few minutes.
  - `node tests/optimizers.mjs`: whitening, `shapeDistance`, Stellate, mix = regularity blend, equal edges, shake and the symmetry, pruning a chain.
  - `node tests/spectral.mjs [-v] [strings…]`: the eigensolver, the spectral starts, star faces reaching the uniform star polyhedra; with strings, lists their starts.
  - `node tests/planes.mjs [--start raw|canonical] [strings…]`: the readability loss on its own ([realization/readable.md](realization/readable.md)).
  - `node tests/screenshot.mjs <url> <out.png> [waitMs] [js…]`: headless Chrome over CDP (SwiftShader, so slow on big shapes). Do not path-trace on the GPU headless without asking the owner: the GPU drives their desktop, which freezes. Run one at a time (they share a debug port). Prints console errors and the values of the given JS expressions; `sleep:ms` waits. Use it to look at renders.
- `tests/lib.mjs` has the shared helpers: a seeded random generator, the random-string generator, `census`, `metrics`, `balance`.

## Decisions and their reasons

- **One operator engine on half-edges**, not a port of each C++ operator. Orientation comes for free, and new operators are about 20 lines each.
- **Seeds from coordinates and a hull**, so the Johnson solids need no hand-written face lists (stacks of regular-polygon rings, `tower()` in `seeds.js`).
- **Relax between operators** (not after the last; the optimizer chain does that). Without it, long strings start from degenerate geometry and canonicalization fails (`pgI`, `cccC`).
- **Edges painted onto faces in the shader**, not tubes and balls (owner's preference). The width is relative to the mean edge length, so exports look the same at every resolution. The owner now wants a screen-space ("drawn on") variant too ([rendering.md](rendering.md)).
- **Workers are terminated when the shape changes**; within one shape, optimizer runs are interrupted between frames, so the next one starts from the current positions.
- **Optimizers are buttons that chain**, not a mode that restarts (owner, 2026-10-21): using them in sequence, and stopping them part-way, is an artsy control. Every optimizer is deterministic, so the chain with stop rounds replays exactly. Inits (As built, Random, Spectral) start the chain again; a new polyhedron empties it.
- **Switches are global but recorded per step** (owner, 2026-10-22): Whiten (symmetric ZCA whitening, which never breaks the symmetry; it replaced centre/orthogonalise/normalise) and Keep symmetry. After a random init the symmetry is not kept; after a spectral init it is kept under the start's own matrices.
- **The shape is the artifact, not the view** (owner, 2026-10-22): a shared link may replay rotated, so Share may prune the chain by replay (positions in the link were considered and rejected: an asymmetric shape needs every vertex, too long to share). Going back in the Steps list is instant (states kept in the worker).
- **The Mix** runs several detach-and-merge targets with weights; the single buttons are one target at weight 1, bit for bit. A weight change applies on release and starts a new step, so the chain still replays ([realization/regular-faces.md](realization/regular-faces.md#mixing)).
- **No forces bolted on to fix symptoms** (owner, 2026-10-21): when an optimizer misbehaves, name the concrete problem and fix the objective, not add a penalty (see the rejected soft-convexity fix in [realization/readable.md](realization/readable.md#simplicial-graphs-a-rejected-fix-2026-10-21)).
- **One scene, two renderers** (owner, 2026-10-23): the Scene panel (orientation, ground, camera, light) is shared by the fast view and the path tracer; what you compose is what renders. A chosen symmetric orientation and the camera angles go in the link, a free drag does not. See [rendering.md](rendering.md#the-workflow-proposed-by-a-session-confirmed-by-the-owner-2026-10-23).
- **The current renderer's materials and colour schemes are disposable** (owner, 2026-10-23): a first version, not a reference. Delete what the new looks do not need.
