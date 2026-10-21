# Realization: From a Graph to a Shape

The operators produce only a **graph**: which vertices lie on which face, in which order. A **realization** assigns a 3D position to every vertex. This is the page's main open problem. The owner worked on it for months in PolyOp without finding a satisfying general method. This file frames the problem; each approach has its own file.

## Two goals: keep them apart

Ideas in this area tend to mix two goals that are often unrelated and sometimes in conflict. **Every experiment should say which one it serves.**

### Goal A: a general solver
For *any* graph the page can produce, give a shape that is a faithful, good-looking picture of the polyhedron.
- **Hard requirements:**
  - convex,
  - flat faces,
  - every symmetry of the graph realized as a rotation or reflection,
  - deterministic,
  - never fails or explodes.
- **Soft requirements:**
  - **balanced**: no face shrinks to a sliver, and no face takes over the shape (see "open questions"),
  - fast: seconds for up to about 10k edges, in a browser worker.
- **Baseline:** the canonical polyhedron ([canonical.md](canonical.md)). It meets every hard requirement, but it is badly unbalanced on graphs with very unequal faces (`tttttD`, `kkkD`) and slow to converge on them.

### Goal B: artsy shapes
For a graph plus some style controls, give a shape that looks interesting.
- **Allowed:** non-convex shapes, slightly bent faces, stellations, self-intersections when they look good.
- **Required:**
  - controllable: sliders change the shape continuously,
  - stable: it settles and does not flicker or explode,
  - reproducible from the URL.
- Quality is judged by eye. The reference renders in `PolyOp/polyop_ref/` show the taste: folded, crumpled, spiky and stellated shapes, and soft organic ones.

### Where they meet
They share machinery: per-face projections, symmetry averaging, the metrics below, and the benchmark. A goal-B method restricted to safe parameters can become a goal-A candidate; detached faces with low regularity is close to the canonical shape. A goal-A method stopped early, or pushed past its target, is often a goal-B effect.

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
- **settled**: no vertex moves more than `1e-8` of the shape's size in one round (detached faces).
- **converged**: faces flat, and edges on the sphere, to `1e-6` (canonical).
- **spread**: in detached faces, how far the per-face copies of a vertex lie from their merged position.
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
| `areaRatio` | largest / smallest face area | lower is more balanced |

`tests/realize.mjs` also reports the rounds and time of the final realization; the build, with its relaxation between operators, is not timed. Its fixed list covers easy, chiral, deep-chain and extreme cases: `tI tttC gpD pgI cccC tktkI dkdkdkdkI tttttD kkkD jsdJ29 aoeU4`. Use `--random N` for seeded random strings (always the same N). Reference numbers for each method are in its own file.

**Missing:** a balance metric that matches what looks good. `areaRatio` is dominated by inherent degree differences. A 320-gon *should* be bigger than a triangle; the question is by how much. One option is to compare each face's area with the area a regular polygon of the same degree would have at the mean edge length.

## The code interface

A realization is a class with:
- `constructor(pos, flat, opts)`: `pos` is the `Float64Array` it moves in place; `flat = { fv, fo, edges }` comes from `flatten(P)` in `canonical.js`.
- `step()`: one round; returns the largest vertex move relative to the shape's size.
- `error()`: an object of method-specific errors, shown in the page's realization note.

`pipeline.js` → `Realization` wraps it with the stopping rule, the per-mode settings and the optional symmetry averaging. To add a method:
1. Implement the class.
2. Add the mode to `MODES` and to the `Realization` constructor (with its stopping rule).
3. Add an `<option>` in `index.html`'s "Shape in space" select, plus any sliders, shown only for that mode as in `showLook()`.
4. Add its line to `realizationNote()` and to the progress measure in `main.js`.
5. Add a paragraph to the Info dialog.

`tests/realize.mjs --mode <name>` then works without changes.

`build()` in `pipeline.js` relaxes canonically after every operator (canonical mode: all but the last; faces mode: all). Every method therefore starts from a near-canonical shape, which matters a lot for robustness.

## Approaches

| approach | serves | status | file |
|---|---|---|---|
| Canonical (Hart's iteration, with fixes) | A: the baseline | implemented, default mode | [canonical.md](canonical.md) |
| Flat faces only | B, gently: keeps the operators' construction look | implemented (`planar` mode) | [canonical.md](canonical.md#planar-mode) |
| As built | debugging; sometimes B | implemented (`raw` mode) | — |
| Detached faces: per-face target, then merge | B now; A candidate with the right target | implemented: similarity-regular target | [detached-faces.md](detached-faces.md) |
| Other per-face targets: affine-regular, tangential, equal angles, target size, star polygons | A and B | ideas, with analysis | [detached-faces.md](detached-faces.md#per-face-targets), [nozono.md](nozono.md) |
| Spectral: eigenvectors of graph matrices | B (stellations); seeds for A | not implemented | [spectral.md](spectral.md) |
| Symmetry averaging (a component, not a method) | A and B | implemented; helps detached faces, hurts canonical | [../symmetry.md](../symmetry.md) |
| Artsy deformations (below) | B | ideas | this file |

### Artsy deformations (small ideas, no file yet)
These move vertices without changing the graph:
- **Scrape-off morph**, `scrape_off(t)` from PolyOp: one parameter going from truncate (t < 0.5) to ambo. It needs the old and new graphs mapped onto each other, so it fits better as an operator with a parameter.
- **Stop early, or add noise**: stop a realization part-way, or add noise and relax a little.
- **Spherical projection**: put every vertex on the unit sphere; the faces then bend.
- **Per-face extrusion and insets**: these change the geometry but not the graph, if done as a displacement.
- **Ramped regularity**: run detached faces with regularity rising from 0 to 1, so tension appears gradually.

Topology-changing styles (wireframe tubes, detached tiles) are rendering, in [../rendering.md](../rendering.md).

## Open questions (cross-cutting)

1. **What is "balanced"?** Goal A needs a precise target before any optimizer can be judged. Candidates:
   - face area proportional to the area of a regular polygon of the same degree,
   - bounded angles,
   - an inscribed radius per face that varies little.

   The answer decides the per-face target in detached faces.
2. **Why are big faces sluggish?** Probably conditioning: a face of degree n couples n vertices, and its averaged pull on each vertex is weak. Ideas to try:
   - weighting by degree,
   - preconditioning,
   - coarse-to-fine schemes; relaxing after each operator is already a weak version of this.
3. **Symmetry with momentum.** Averaging over the symmetries breaks the momentum in canonical mode. Projecting the velocity onto the symmetric subspace as well might fix it ([../symmetry.md](../symmetry.md)).
4. **Convexity for goal-B methods.** Measure it always. Enforce it optionally, for example by projecting each vertex to the inner side of its neighbouring faces' planes.
