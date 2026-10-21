# Backlog

The task list only. Every item links to the file that explains it. When you finish an item:
- move it to "Done" with a date and one line,
- put the findings, including negative results, in the linked file.

## Artsy realization (goal B: non-convexity and symmetry; read [realization/README.md](realization/README.md) first)

- **Star-polygon target**: regular faces with the template `ζ^{kj}` (k coprime to n), a deliberate stellation. Prototyped: k must be chosen per face size (or orbit); it does nothing from the convex shape, and from random starts it finds the uniform star polyhedra, but only without symmetry, since those live in another adjacency eigenspace (the spectral item gives that start). Open: how the user chooses k. → [realization/regular-faces.md](realization/regular-faces.md#per-face-targets)
- **Spectral optimizer** (from PolyOp, owner's observations): the face-mean layout is now reachable (Face mean + orthogonalise + normalise); still open: other matrices, browsing eigenvector triples, stellations; characters and isotypic decomposition belong here. Note the C++ symmetric-solver caveat. → [realization/spectral.md](realization/spectral.md)
- **Subgroup symmetry dial**: keep only some symmetries, for controlled symmetry breaking. → [symmetry.md](symmetry.md#open)
- **Which graphs suit affine faces**: clean, flat, spiky shapes (`ozJ45`) against collapsed faces (`jsdJ29`, `dA5`); all-quadrilateral graphs first. → [realization/regular-faces.md](realization/regular-faces.md#open-questions)
- **More optimizer buttons from PolyOp's ideas**: scrape-off morph (truncate ↔ ambo, needs the two graphs mapped), spherical projection. Stopping early and ramped regularity are now done by chaining and stopping buttons. → [realization/README.md](realization/README.md#artsy-deformations-small-ideas-no-file-yet)

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
