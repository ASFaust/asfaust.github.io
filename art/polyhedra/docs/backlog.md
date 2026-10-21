# Backlog

The task list only. Every item links to the file that explains it. When you finish an item:
- move it to "Done" with a date and one line,
- put the findings, including negative results, in the linked file.

## Realization (research; read [realization/README.md](realization/README.md) first)

Label every experiment **goal A** (general solver) or **goal B** (artsy).

- **Affine-regular target** in detached faces (A and B). Add the Fourier mode −1 to the fit; check the zonohedron prediction on all-even-faced graphs. → [realization/detached-faces.md](realization/detached-faces.md#per-face-targets), [realization/nozono.md](realization/nozono.md)
- **Convex, flat and readable `tttttD`** (A, next). Canonical is convex but has edge ratio 143; detached faces is readable (2.0) but bent and non-convex. Find a method, or a mix (e.g. detached faces with a flatness or convexity term, or a target that bounds each face's edge ratio), that gets all three, or evidence that the graph does not allow it. → [realization/README.md](realization/README.md#balance)
- **Target size** (B, and A if it helps convexity): per-face target with `|a|` pulled towards a size set by the degree; describe with `sizeRatio`/`degreeSlope`. → [realization/detached-faces.md](realization/detached-faces.md#per-face-targets)
- **More per-face targets** (A and B): tangential, equiangular, mixtures by degree, tag or orbit. → [realization/detached-faces.md](realization/detached-faces.md#per-face-targets)
- **Solver variants** for detached faces: damped merge, Dykstra, weighting by face degree, momentum. → [realization/detached-faces.md](realization/detached-faces.md#solver-variants-to-try)
- **Spectral mode** (B, and seeds for A): JS eigen-solver, matrices, browsing eigenvector triples, classification. Note the C++ symmetric-solver caveat. → [realization/spectral.md](realization/spectral.md)
- **Canonical speed-ups** (A): velocity projection with symmetry, preconditioning by face size. → [realization/canonical.md](realization/canonical.md#ideas)
- **Artsy deformations** (B): ramped regularity, early stop or noise, spherical projection, scrape-off morph. → [realization/README.md](realization/README.md#artsy-deformations-small-ideas-no-file-yet)

## Symmetry ([symmetry.md](symmetry.md#open))

- Enforce a chosen subgroup (design dial for controlled symmetry breaking).
- Characters and isotypic decomposition (for spectral).
- Vertex and edge orbits; camera presets down symmetry axes.

## Rendering ([rendering.md](rendering.md#open-items))

- Analytic ambient occlusion for flat faces (replaces GTAO for creases).
- Fake subsurface scattering.
- Staging: backdrop, contact shadow, lighting presets, depth of field.
- Glow lines and bloom; real glass (transmission).
- Per-face painting (click a face, or its whole orbit).
- Colour by balance (diagnostic: weird adapters, slivers, oversized faces).
- Geometry styles: wireframe + subdivide, detached tiles, smooth subdivision.
- Turntable export; orthographic toggle.

## Done

- **2026-10-21 v1.** Seeds (Platonic, P/A/Y/U, 35 Johnson solids via hull); half-edge operators `d a t k j g p c r` with composites and `tₙ kₙ`; notation parser; canonical, planar and raw realizations in a worker; three.js viewer; PNG, OBJ and STL export; URL state; Info dialog; home-page link.
- **2026-10-21.** Edges painted flat in the shader (replacing tubes and balls); detached-faces realization with regularity and stiffness, and the joint least-squares fix.
- **2026-10-21.** Test harness (`tests/`, with the build shared through `js/pipeline.js`); automorphisms, point-group names, orbit colouring, "keep the symmetry"; GTAO with strength and reach sliders; physical materials (matte, glossy, metal, iridescent); palette presets and editable swatches.
- **2026-10-21.** Docs restructured into `docs/`; findings moved next to the approaches they belong to.
- **2026-10-21.** Balance defined: every corner of every face readable, measured by `faceEdgeMax` (edge ratio within a face) and `turnMin` (corner turn relative to regular), with roundness, size and degree slope as descriptive measures (`balance()` in `tests/lib.mjs`); calibrated against renders, with the owner's wedge argument for why sizes may differ. Findings: canonical is readable except on `kkkD` (slivers) and `tttttD` (adapters, edge ratio 143); detached faces is readable everywhere but not convex on `tttttD`. → [realization/README.md](realization/README.md#balance)
