# Realization: From a Graph to a Shape

> **Status:** framing doc for all optimizers. **Code:** `js/pipeline.js` (`OPTIMIZERS`, `Realization`, `Session`), `tests/lib.mjs` (`metrics`, `balance`). **Tests:** `tests/realize.mjs`. **Backlog:** A1, O1.

The operators produce only a **graph**: which vertices lie on which face, in which order. A **realization** assigns a 3D position to every vertex. This was the page's main open problem: the owner worked on it for months in PolyOp without finding a satisfying general method, and goal A is now mostly solved here. This file frames the problem; each optimizer family has its own file.

## Two goals: keep them apart

Ideas in this area tend to mix two goals that are often unrelated and sometimes in conflict. **Every experiment should say which one it serves.**

### Goal A: nice shapes
For *any* graph the page can produce, give a shape that is a faithful, good-looking picture of the polyhedron. *Mostly solved* (owner, 2026-10-23); the open cases are in the backlog (`A1`).
- **Hard requirements:** convex; flat faces; every symmetry of the graph realized as a rotation or reflection; deterministic; never fails or explodes.
- **Soft requirements:** **balanced**, every corner of every face can be seen, so that no hexagon reads as a pentagon ([Balance](#balance)); fast, seconds for up to about 10k edges in a browser worker.
- **Tools:** Canonical ([canonical.md](canonical.md)), the baseline that meets every hard requirement but is unbalanced on graphs with very unequal faces; Readable ([readable.md](readable.md)) for simple and simplicial graphs; Face mean with Whiten as a start when those tangle; Flat faces to finish.

### Goal B: artsy shapes
**Artsy means non-convex** (owner, 2026-10-23), with the symmetry kept. Allowed: non-convex shapes, slightly bent faces, stellations, self-intersections when they look good. Required: controllable (the chain, where each step is stopped, and the parameters decide the shape), stable (settles, does not flicker or explode), reproducible from the URL. Judged by eye; the taste is in `PolyOp/polyop_ref/` and in [../catalogue.md](../catalogue.md).

**What is known about artsy optimizers** (owner, 2026-10-23):
- **There is no single "artsy solver", and no continuum of them.** Each optimizer that makes non-convex shapes does it in its own way, specific to it, and new ones are hard to invent. The search for new artsy optimizers is mostly paused; the one experiment still wanted is the symmetry-only optimizer (`O1`, below).
- **Regular faces is the best so far.** Its non-convexity comes from *pressure between the faces*: there is not enough room for the regular faces, so the shape bulges in and out and makes symmetric creases, like the folds in the "turning a sphere inside out" video. The owner usually wants flat faces at the end, which often disagrees with what the regular pass settled on; hence the regular-then-flat chain. Some graphs have a non-convex realization with exactly regular faces and no convex one (`ebC`; the research is [../exploration.md](../exploration.md#x3-shapes-realizable-with-regular-faces-only-non-convexly)). Regular faces can have several separate resting points (`X6`).
- **Affine faces is close to Regular in spirit**, the exception to the rule above. It needs Whiten or it often collapses the whole shape, and even then some faces collapse to segments ([../exploration.md](../exploration.md#x5-which-graphs-give-affine-stars)).
- **Spectral starts** are the other source: the adjacency matrix often gives interesting non-convex starts, the face-mean matrix reliably good starts for goal A. The owner's explanation of why: [spectral.md](spectral.md#owners-observations).
- **Freedom instead of pressure** is the idea behind `O1`: start from random points and enforce only a symmetry group (or a subgroup), so non-convexity comes from the start, not from the faces pushing, and every start looks different. The owner expects it to look too messy alone, and wants to see it anyway, to learn what then needs forcing.

### Where they meet
They share machinery: per-face projections, symmetry averaging, the metrics below, and the benchmark. A goal-B method restricted to safe parameters can become a goal-A candidate (regular faces at low regularity is close to canonical; tangent + regular in the Mix is a canonical shape pulled towards regular faces). A goal-A method stopped early, or pushed past its target, is often a goal-B effect.

## Facts to build on

- **Steinitz (1922):** the graphs of convex polyhedra are exactly the 3-connected planar graphs. Conway operators preserve this, so every shape the page builds has a convex realization.
- **Koebe–Andreev–Thurston (midsphere):** every such graph has a realization with all edges tangent to one sphere. It is unique up to Möbius transformations. Requiring the tangent points to have their centroid at the sphere's centre fixes it up to rotation; that is the **canonical polyhedron**.
- **Mani (1971):** a realization exists that shows every graph automorphism as an isometry. The canonical polyhedron is one ([../symmetry.md](../symmetry.md)).
- **Tangential faces come for free:** in the canonical polyhedron every face touches the midsphere along its edges, so each face has an inscribed circle. "All faces tangential" can always be satisfied exactly.
- **Regular faces cannot:** the convex polyhedra with all faces regular are the Platonic, Archimedean and 92 Johnson solids plus the prisms and antiprisms. That is a finite list and two families, against infinitely many Conway strings. So any energy of the form "make every face regular" has no zero for almost every graph.
- **Affine-regular faces** (regular polygons stretched by an affine map) have a known obstruction: a convex polyhedron whose faces are all centrally symmetric is a zonohedron. So a graph with all faces even-sided that is not zonohedral has no realization with affine-regular faces. Odd faces escape this argument. Details are in [nozono.md](nozono.md) §5.

**Owner's observations from PolyOp**, worth keeping in mind:
- Big faces act sluggish, as if they had a lot of mass. They stay too large, and the small faces get no room.
- When the energy cannot reach zero, the leftover **residual tension** spreads everywhere and usually destroys planarity as well.
- Spectral realizations sometimes work and sometimes do not, and sometimes come out stellated ([spectral.md](spectral.md)).

## Vocabulary used in the code and docs

- **round**: one iteration of an iterative realization (`step()`).
- **settled**: no vertex moves more than `1e-8` of the shape's size in one round (regular and affine faces).
- **converged**: faces flat, and edges on the sphere, to `1e-6` (canonical).
- **spread**: in regular and affine faces, how far the per-face copies of a vertex lie from their merged position.
- **reflex edge**: an edge where the shape is locally concave.
- **tension**: whatever error remains when a method cannot reach its goal.

## Measuring

`tests/lib.mjs` → `metrics(P)` reports these for a realized polyhedron. Lengths are relative to the mean edge length.

| metric | meaning | good |
|---|---|---|
| `planarMax` | largest distance of a vertex from its face's mean plane | ≤ 1e-6 for goal A |
| `inward` | faces whose normal points towards the centre | 0 for goal A |
| `reflex` | edges where the face on one side has its centre above the plane of the other | 0 for goal A |
| `edgeRatio` | longest / shortest edge | lower is more balanced |
| `areaRatio` | largest / smallest face area | not a balance measure: it is dominated by the degrees (`U4`, all faces regular, has 11) |
| `faceEdgeMax` | worst longest / shortest edge *within one face* (below) | 1 for regular faces; readable up to about 4 |
| `turnMin` | smallest corner turn, relative to the regular n-gon's (below) | 1 for regular faces; readable down to about 0.45 |
| `roundMin` | least round face (below) | 1 for regular faces; < 0.5 is a visible sliver |
| `sizeRatio` | largest / smallest face *size* (below) | 1 for any regular-faced solid; lower is more balanced |
| `degreeSlope` | slope of log size against log degree (below) | 0: big faces are as big as regular ones would be; > 0: they take more |

`tests/realize.mjs` also reports the rounds and time of the final realization; the build, with its relaxation between operators, is not timed. Its fixed list covers easy, chiral, deep-chain and extreme cases: `tI tttC gpD pgI cccC tktkI dkdkdkdkI tttttD kkkD jsdJ29 aoeU4`. Use `--random N` for seeded random strings (always the same N). Reference numbers for each method are in its own file.

### Balance

**The minimal definition (owner, 2026-10-21): every corner of every face can be seen.** A face whose edges have wildly different lengths is a "weird adapter". Two of its corners nearly merge, and a hexagon reads as a pentagon. A corner that is nearly straight vanishes in the same way. Two per-face measures (`balance()` in `tests/lib.mjs`, which also returns the per-face values), both 1 for a regular face:
- **Edge ratio** `edge_f`: longest / shortest edge of the face. `faceEdgeMax` is the worst face.
- **Turn** `turn_f`: the smallest turn at a corner (the angle between its two edges, unsigned, in space), over the regular n-gon's turn 2π/n. `turnMin` is the worst face. It is relative because a regular 160-gon's corners turn only 2.25°. It is unsigned and taken in space, so that it means the same on the bent faces of regular faces. Reflex corners are still visible corners, and convexity is counted apart (`inward`, `reflex`).

Each catches cases the other misses. A hexagon with one edge shrunk to nothing is a regular pentagon, which is round (0.95) and turns well, so only the edge ratio sees it. A thin rhombus has equal edges, so only the turn sees it.

**Why this and not equal sizes (the wedge argument, owner).** Most graphs need very different face sizes, so "equal size" cannot be the definition:
- Where two big faces share an edge (in `tttttD` the 160-gons do), the angle between their next edges tends to 0 as the faces get round and many-sided, *whatever their size*. Only a sharp wedge is left for the small faces between them, so those must be small, with closely spaced corners. The big faces' corners are spaced far apart. Something has to bridge the two spacings.
- In the canonical polyhedron this is literal: face incircles lie on the midsphere and neighbours' circles touch, so two big touching circles leave a horn-shaped gap, and the faces packed into it shrink towards the touching point.

The edge ratio allows this, as long as the bridging is gradual. Two faces f and g sharing an edge of length ℓ have mean edges at most `edge_f·ℓ` and at least `ℓ/edge_g`, so their mean edges differ by at most `edge_f · edge_g`. A bound on the edge ratio therefore forces size to change *gradually*, over several rings of faces. That is the "adapter" spread out, instead of in one weird face. A separate neighbour-size measure is not needed.

**Descriptive measures,** which say *how* a shape is unbalanced but are not the definition (most graphs cannot reach 1 on them):
- **Roundness** `round_f = A_f / A_reg(n, L_f/n)`: area over the area of the regular n-gon with the same perimeter. The regular n-gon has the largest area for its perimeter, so this is in (0, 1] and falls towards 0 for slivers. `roundMin` is the smallest.
- **Size** `s_f = sqrt(A_f / A_reg(n, ℓ̄))`, with `ℓ̄` the mean edge length: the side a regular n-gon of the same area would have, in mean edges. `sizeRatio` is max/min over the faces. `degreeSlope` fits log s against log n (over the mean of each degree): positive means big faces are bigger than regular ones would be, which is the owner's "big faces stay too large".

**Calibration** (2026-10-21), against renders from `tests/screenshot.mjs`. "Detached faces" (now regular faces) was run at regularity 1, stiffness 2 (since removed), symmetry on.

| shape | method | areaRatio | faceEdge | turn | round | size× | slope | by eye |
|---|---|---|---|---|---|---|---|---|
| `U4`, `J29`, `P5`, `tI`, `eC` | raw seeds / canonical | 1.5–11 | 1.0 | 1.00 | 1.00 | 1.0 | 0 | perfect (regular faces) |
| `Y6` | canonical | 1.4 | 3.7 | 0.81 | 0.54 | 2.1 | −1.05 | a tall spike, but clearly triangles |
| `tktkI` | canonical, 30k rounds (as `dkdkdkdkI`) | ≈3,400 | 3.4 | 0.49 | 0.96 | 13.9 | 2.22 | tiny triangles, huge decagons; every face readable |
| `tktkI` | detached faces | 615 | 1.8 | 0.65 | 0.95 | 5.9 | 1.48 | the same, milder |
| `tttC` | canonical / detached | 512 / 286 | 3.1 / 1.4 | 0.56 / 0.68 | 0.82 / 0.94 | 1.8 / 1.2 | 0.16 / 0.06 | look alike; fine |
| `kkkD` | canonical | 4.0 | 5.7 | 0.32 | 0.36 | 2.1 | — | slivers everywhere |
| `tttttD` | canonical, 30k rounds | 216,381 | 143 | 0.04 | 0.05 | 6.8 | 0.21 | weird adapters next to the big faces |
| `tttttD` | detached faces | 10,939 | 2.0 | 0.46 | 0.76 | 2.1 | 0.07 | every face readable, but not convex (360 inward faces) and bent (planar 0.55) |

The ordering matches the eye in every case, and `areaRatio` gets several of them backwards (`Y6` "best", `tttC` "far worse than `kkkD`"). The thresholds in the metrics table (edge ratio about 4, turn about 0.45) are read off these shapes only; the owner accepted them (2026-10-21) until a render shows otherwise. Likewise accepted: how big big faces should be is a goal-B taste question, not part of goal A.

**Findings:**
- **By this definition canonical is already balanced on most of the benchmark list** (edge ratio ≤ 3.4), including `tktkI`, whose sizes vary 14×. It fails on `kkkD` (slivers) and `tttttD` (adapters).
- **The `tttttD` adapters are not in the wedge itself.** Faces next to the shared 160-gon edges have edge ratio about 9. The worst faces (about 140) are the 24-gons three faces away: their edges next to triangles and hexagons are about 1e-2, but those shared with a 160-gon or a 48-gon are 2e-4 to 7e-4, so each of them reads as roughly a 21-gon. (Unconverged: planar 6e-3 and 600 inward faces at 30k rounds.)
- **Detached faces is readable everywhere** (edge ratio ≤ 2.0, turn ≥ 0.46), but on `tttttD` only by giving up convexity and flatness.
- **A convex, flat, readable `tttttD` exists**: optimizing face planes directly gives edge ratio 3.4 and turn 0.59 ([readable.md](readable.md)), now the page's "Readable" mode.
- **The readable loss does not suit simplicial graphs.** Freed from the convexity boundary, it flattens kis pyramids into flat triangulated patches; the attempt was rejected ([readable.md](readable.md#simplicial-graphs-a-rejected-fix-2026-10-21)).
- **Not every graph has one.** At a convex vertex of degree d surrounded by triangles, some triangle has edge ratio at least sin 54° / sin(360°/d) if all its corners are readable. That is 6.2 for `kkkkD`, so no convex realization of it is readable ([readable.md](readable.md#a-lower-bound-high-degree-vertices)). Goal A must therefore aim for "as readable as the graph allows", not a fixed threshold.

Other candidates considered: a neighbour-size measure (implied by the edge ratio, see above); the inradius per face (close to `s_f` for round faces, adds nothing).

## The code interface

An optimizer is a class with:
- `constructor(pos, flat, opts)`: `pos` is the `Float64Array` it moves in place, **starting from whatever is in it** (optimizers chain); `flat = { fv, fo, edges }` comes from `flatten(P)` in `canonical.js`.
- `step()`: one round; returns the largest vertex move relative to the shape's size.
- `error()`: an object of method-specific errors, shown in the page's realization note.

`pipeline.js` → `Realization` wraps it with the stopping rule, its settings and, for regular and affine faces, symmetry averaging. It must be deterministic: the URL replays a chain, including the round each step was stopped at. To add an optimizer:
1. Implement the class.
2. Add its name to `OPTIMIZERS` and to the `Realization` constructor (with its stopping rule).
3. Add a button with `data-opt` in `index.html`'s `#opts`, and its name to `LABEL` in `main.js`. A parameter goes into the button, as the regularity field does.
4. Add its line to `realizationNote()` and to `progressOf()` in `main.js`.
5. Add a paragraph to the Info dialog.

`tests/realize.mjs --mode <chain>` then works without changes.

`build()` in `pipeline.js` relaxes canonically between operators (not after the last), so the shape as built is close to canonical except for the last operator's construction; the default chain is `canonical`.

## The optimizers

Every button in the page's Realization panel, as of 2026-10-23.

| button | what it does | serves | details |
|---|---|---|---|
| As built | the operators' construction, relaxed canonically between operators (init) | start | [../README.md](../README.md#core-data-structures-and-conventions) |
| Random | random points from a seed; the symmetry is not kept afterwards (init) | B | — |
| Spectral ‹ n › | eigenvectors of a graph matrix (adjacency, Laplacian, vertex mean, face mean), browsable (init) | B; starts for A | [spectral.md](spectral.md) |
| Canonical | Hart's iteration to the midsphere polyhedron | A, the default | [canonical.md](canonical.md) |
| Readable | balance optimized over face planes or vertices, convex and flat | A: simple and simplicial graphs | [readable.md](readable.md) |
| Flat faces | canonical's planarity step alone; keeps the shape close to where it was | both: the usual last step | [canonical.md](canonical.md#planar-mode) |
| Regular faces (regularity) | detach, make each face regular, merge | B: the main artsy optimizer | [regular-faces.md](regular-faces.md) |
| Affine faces | the same with affine-regular faces (nozono's `P_F`) | B: stars | [regular-faces.md](regular-faces.md), [nozono.md](nozono.md) |
| Star faces (pointedness) | the same with star polygons `{n/k}` | B: finishing stellations | [regular-faces.md](regular-faces.md#star-faces) |
| Stellate | affine star faces with whitening: subspace iteration to a stellation | B | [regular-faces.md](regular-faces.md#stellate-2026-10-22) |
| Face mean | each vertex to the mean of its faces' centres (power iteration); with Whiten, the spectral face-mean layout | starts for A | [regular-faces.md](regular-faces.md#face-mean-2026-10-21) |
| Equal edges | the same scheme over edges | Mix ingredient | [regular-faces.md](regular-faces.md#equal-edges-and-the-mix-2026-10-22) |
| Mix | several targets with weights (flat, regular, star, affine, stellate, mean, edges, tangent, sphere) | both | [regular-faces.md](regular-faces.md#mixing) |
| Shake | moves every vertex by 0.1 mean edge lengths from a seed, symmetrized when the symmetry is kept | both: leave a fixed point, test stability | — |

**Switches** (global, recorded per step): **Whiten**, symmetric (ZCA) whitening after every round, `X ← X C^{-1/2}` scaled to keep the size, with `C` the covariance of the centred positions; it commutes with rotations, so it never breaks the symmetry ([regular-faces.md](regular-faces.md#whiten)). **Keep symmetry**, averaging over the automorphisms every 10 rounds in the face optimizers, the Mix, Readable and Shake; Canonical and Flat faces keep the symmetry by themselves and never average (it slowed Canonical 2× by breaking its momentum, [../symmetry.md](../symmetry.md)).

**Ideas not built**, parked by the owner's decision to stop looking for new artsy optimizers (2026-10-23), listed in the backlog's *Parked* section: per-orbit k for Star faces, an isotoxal star target (`anzD`'s concave star faces), the scrape-off morph (PolyOp's `scrape_off(t)`, truncate ↔ ambo, which needs the two graphs mapped onto each other), per-face extrusion as a displacement, random weights per symmetry orbit ([spectral.md](spectral.md#owners-observations)). Wireframe tubes and detached tiles are rendering ([../rendering.md](../rendering.md)).

## Open questions (cross-cutting)

1. **Why are big faces sluggish?** Probably conditioning: a face of degree n couples n vertices, and its averaged pull on each vertex is weak. Ideas: weighting by degree, preconditioning, coarse-to-fine (relaxing after each operator is a weak version). No current task depends on it.
2. **Symmetry with momentum.** Averaging breaks Canonical's momentum. Projecting the velocity onto the symmetric subspace as well might fix it ([../symmetry.md](../symmetry.md)).
3. **What will an optimizer make of a given graph?** That is the research project in [../exploration.md](../exploration.md).

Settled: what "balanced" means ([Balance](#balance)); not every graph has a convex, flat, readable realization (`kkkkD` has none, [readable.md](readable.md#a-lower-bound-high-degree-vertices)); how big big faces should be is a goal-B taste question.
