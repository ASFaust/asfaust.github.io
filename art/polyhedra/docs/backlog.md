# Backlog

The task list only. Every item links to the file that explains it. When you finish an item:
- move it to "Done" with a date and one line,
- put the findings, including negative results, in the linked file.

## Artsy realization (goal B: non-convexity and symmetry; read [realization/README.md](realization/README.md) first)

- **Spectral, what is left**: drop mirrored duplicates from the list; eigenspaces of dimension 4+ (accidental merges; `eY6` has no start); characters and isotypic types to name each start; a sparse solver for more than 1,500 vertices. Only if the owner finds a concrete need. → [realization/spectral.md](realization/spectral.md)
- **Star faces, per-orbit k**: on top of the pointedness rule, once faces can be picked (see per-face painting under Rendering). Does the viewer draw self-intersecting star faces right? Check on renders. → [realization/regular-faces.md](realization/regular-faces.md#per-face-targets)
- **Subgroup symmetry dial**: keep only some symmetries, for controlled symmetry breaking. → [symmetry.md](symmetry.md#open)
- **Exact regular faces for near misses** (owner's `sktJ45`: regular faces settles at spread 0.015 from every start): a direct solver for unit edges and flat regular faces (Gauss–Newton on the constraints, symmetric), to find a regular realization or locate the obstruction. → [realization/regular-faces.md](realization/regular-faces.md#open-questions)
- **Isotoxal star target** (owner's `anzD`: concave five- and six-pointed star faces straight from the build): even faces fitted to Fourier modes 1 and m+1, a face target or a Mix ingredient. → [realization/regular-faces.md](realization/regular-faces.md#per-face-targets)
- **Self-intersection test, then: which all-triangle graphs fold into non-convex deltahedra without crossing** (owner's class, example `knJ17`: regular faces makes every edge equal on every all-triangle graph tried). → [realization/regular-faces.md](realization/regular-faces.md#findings)
- **Which graphs suit affine faces**: clean, flat, spiky shapes (`ozJ45`) against collapsed faces (`jsdJ29`, `dA5`); all-quadrilateral graphs first. → [realization/regular-faces.md](realization/regular-faces.md#open-questions)
- **More optimizer buttons from PolyOp's ideas**: scrape-off morph (truncate ↔ ambo, needs the two graphs mapped). Stopping early and ramped regularity are done by chaining and stopping buttons; spherical projection is the Mix's sphere target (2026-10-22). → [realization/README.md](realization/README.md#artsy-deformations-small-ideas-no-file-yet)

## Goal A

- **Canonical tangles on `ckmU5` and `cmU5`** (owner's example): inward faces after 60,000 rounds, from the build and from Face mean; Readable inherits it. Find out whether it is the basin or the iteration. → [realization/canonical.md](realization/canonical.md#failure-modes)

## Low priority

- Canonical speed-ups: 3 of 60 random strings hit the 60,000-round cap (`zcmJ17`, `nzbY6`, `kksJ17`); the page shows progress live. → [realization/canonical.md](realization/canonical.md#ideas)
- Vertex and edge orbits; camera presets down symmetry axes. → [symmetry.md](symmetry.md#open)

## Rendering ([rendering.md](rendering.md#open-items))

The direction comes from the owner's renders; the techniques are a session's suggestions. Owner to prune by which looks are wanted.

- Analytic ambient occlusion for flat faces (replaces GTAO for creases).
- Fake subsurface scattering.
- Staging: backdrop, contact shadow, lighting presets, depth of field.
- Glow lines and bloom; real glass (transmission).
- Per-face painting (click a face, or its whole orbit).
- Colour by balance (diagnostic for the readability research; drop if that research stops).
- Geometry styles: wireframe + subdivide, detached tiles, smooth subdivision.
- Turntable export; orthographic toggle.

## Done

- **2026-10-22.** Optimizer UX, the owner's requests ([user-experience.md](user-experience.md)): Whiten (symmetric whitening, keeps the symmetry) replaces centre/orthogonalise/normalise; Keep symmetry switch; spectral stepper with ‹ › for touch; clickable list of steps (instant, states kept in the worker); Share link prunes the chain by replay (same shape up to rotation); Stellate (affine star faces: the great stellated `D`, `tD`, `tI` from the built shape); Equal edges; Mix (weighted targets, chips and sliders; the single buttons on the same engine, bit-identical); Shake. `tests/optimizers.mjs`.
- **2026-10-21.** Spectral matrix dropdown: adjacency, Laplacian, vertex mean, face mean; the list capped at 100 starts. Survey: the first start is convex on about half of the random strings, Laplacian slightly best, face mean last. → [realization/spectral.md](realization/spectral.md#findings-2026-10-21)
- **2026-10-21.** Spectral init (`js/spectral.js`): exactly symmetric starts from whole adjacency eigenspaces, browsable, labelled by density; eigensolver rewritten to compute eigenvectors on demand (6× faster). Star faces optimizer with a pointedness rule for k. From the stellated starts it finds the uniform star polyhedra exactly with the symmetry kept. → [realization/spectral.md](realization/spectral.md#findings-2026-10-21)

- **2026-10-21.** Face mean optimizer (each vertex to the mean of its faces' centres): power iteration; with orthogonalise and normalise, the spectral face-mean layout. → [realization/regular-faces.md](realization/regular-faces.md#face-mean-2026-10-21)

- **2026-10-21.** Init buttons (As built, Random with a seed) apart from the optimizers; per-round adjustments centre, orthogonalise (Gram–Schmidt), normalise, recorded per step; a new polyhedron empties the chain. Normalise stops the global collapses of affine faces, at the price of new, non-flat resting points. → [realization/regular-faces.md](realization/regular-faces.md#adjustments-and-random-starts-2026-10-21)

- **2026-10-21.** Optimizers as buttons that chain from the current positions (Canonical, Readable, Regular faces with a regularity field, Affine faces, Flat faces, As built), stoppable, the chain in the URL with stop rounds; detached faces renamed regular faces, stiffness and the symmetry checkbox removed; affine faces (nozono's `P_F`) added. Affine finds flat, very non-convex shapes regular faces cannot (`ozJ45`, owner's example). → [realization/regular-faces.md](realization/regular-faces.md)
- **2026-10-21.** Backlog audit: every item checked for a concrete observed problem. Dropped: readable for general graphs and its speed, target size, tangential/equiangular targets, solver variants for detached faces. Found: canonical is unreadable on 9 of 60 random strings, mostly cupola and Johnson seeds (`ntU4` edge ratio 20.7); regular faces makes those regular by going non-convex.

- **2026-10-21.** Soft convexity in the readable mode tried and rejected: freed from the convexity boundary, the loss flattens kis pyramids. Kept: a vertex angle-sum test in the convexity check (tangled simplicial shapes passed it). The old note that `kkkD` ends worse than its start was a wrong comparison. → [realization/planes.md](realization/planes.md#simplicial-graphs-a-rejected-fix-2026-10-21)

- **2026-10-21 v1.** Seeds (Platonic, P/A/Y/U, 35 Johnson solids via hull); half-edge operators `d a t k j g p c r` with composites and `tₙ kₙ`; notation parser; canonical, planar and raw realizations in a worker; three.js viewer; PNG, OBJ and STL export; URL state; Info dialog; home-page link.
- **2026-10-21.** Edges painted flat in the shader (replacing tubes and balls); detached-faces realization with regularity and stiffness, and the joint least-squares fix.
- **2026-10-21.** Test harness (`tests/`, with the build shared through `js/pipeline.js`); automorphisms, point-group names, orbit colouring, "keep the symmetry"; GTAO with strength and reach sliders; physical materials (matte, glossy, metal, iridescent); palette presets and editable swatches.
- **2026-10-21.** Docs restructured into `docs/`; findings moved next to the approaches they belong to.
- **2026-10-21.** Readable mode: tie-breaker preferring alike corners (fixes lopsided hexagons on `czD`, reported by the owner) and a stopping rule for losses that head to zero. → [realization/planes.md](realization/planes.md#the-loss-and-the-solver)
- **2026-10-21.** "Readable" mode (`js/readable.js`): convex, exactly flat, readable realizations of simple and simplicial graphs by optimizing face planes or vertices; `tttttD` edge ratio 3.2 against canonical's 143; symmetry kept; other graphs fall back to canonical. Lower bound proving that `kkkkD` has no convex readable realization. `metrics()` now counts reflex corners. → [realization/planes.md](realization/planes.md)
- **2026-10-21.** Balance defined: every corner of every face readable, measured by `faceEdgeMax` (edge ratio within a face) and `turnMin` (corner turn relative to regular), with roundness, size and degree slope as descriptive measures (`balance()` in `tests/lib.mjs`); calibrated against renders, with the owner's wedge argument for why sizes may differ. Findings: canonical is readable except on `kkkD` (slivers) and `tttttD` (adapters, edge ratio 143); detached faces is readable everywhere but not convex on `tttttD`. → [realization/README.md](realization/README.md#balance)
