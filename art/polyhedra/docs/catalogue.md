# Catalogue: the Owner's Shapes

> **Status:** 29 entries (2026-10-22 to 2026-10-23). **Used by:** the planned examples menu (backlog `U1`) and the shape research ([exploration.md](exploration.md)). **Backlog:** U1.

Realizations the owner called good or interesting, as reference points for goal B and as test cases. Each entry has the link (the part after `art/polyhedra/`), the owner's words, and the numbers that explain it. Numbers come from `node tests/realize.mjs --sym --mode <chain> [--flags w] <string>`; the columns are defined in [realization/README.md](realization/README.md#measuring). "Reflex" counts reflex edges, "inward" inward faces, "turn" the smallest relative corner turn. Density is 1 (folded, not stellated) unless stated.

**Add new shapes here**, in the group they fit, with the date. Keep each entry to a few lines: the link, the words, what makes it work, and the numbers. Any study of a shape belongs in the topic doc.

## Patterns

- **Regular faces then Flat faces** is the recipe behind most entries. The regular pass folds the shape where regular faces do not fit; the flat pass keeps the folds and flattens the faces (50 to 150 rounds, because the faces are already nearly flat).
- **All-quadrilateral graphs** (strings starting with `o` or `j`) are over-represented: squares rarely fit, so the tension goes into folding with flat faces.
- **Whiten matters only for shapes with one main axis** (prisms, cupolae, pyramids, antiprisms: `pU5`, `decY5`, `dosmA5`, `caU5`): it forces the same spread along the axis as across it, so every round stretches the shape and the sides fold. On cubic or icosahedral symmetry it is the identity (`ocI`).
- **Affine faces makes the spiky stars**, and it is exact more often than Regular faces (`peC`, `caI`, `jpD`).
- **Chirality gives twist**: snub and gyro leave only rotations, and the shape is free to twist one way (`ogdJ37`).
- **The construction can already hold the look**: `anzD`'s star faces come from the operators; Flat faces only keeps them.

## Regular faces, then Flat faces

| link | date | owner | what makes it work; numbers |
|---|---|---|---|
| `#n=scnC&m=regular,flat` | 10-22 | "very artsy" | 434 faces (392 triangles, 36 hexagons, 6 octagons), `O`. Flat to 4e-7; 120 inward, 312 reflex; edge ratio 2.3, turn 0.65: every face readable. |
| `#n=jtJ37&m=regular,flat` | 10-22 | "very nice, complex" | 144 quadrilaterals, `D4d`. Regular 1,023 rounds, flat 150; 16 inward, 96 reflex; turn 0.27: some quadrilaterals become thin kites or darts. |
| `#n=csJ45&m=regular,flat` | 10-22 | "nice": no self-intersection, inset squares | 450 faces, group only `D4` (J45 is chiral) yet looks highly symmetric: regular faces make different orbits look alike. Regular 10,151 rounds; no inward, 560 reflex, 224 reflex corners (the faces themselves go non-convex). |
| `#n=oD&m=regular,flat` | 10-22 | "simple but I still like it" | 60 kites, `Ih`. Regular cannot make squares (spread 0.13); flat leaves near-squares; 60 reflex (half the edges are valleys), turn 0.92, the most balanced entry. The symmetry spreads the tension evenly. |
| `#n=okzD&m=regular,flat&e=0.2` | 10-22 | "a boulder, or the round floating smoke Pokémon" | 540 quadrilaterals, `Ih`. Spread 0.24; 180 reflex (creases round the protrusions). |
| `#n=jcaJ29&m=regular,flat&e=0.2` | 10-22 | "like a pyrite crystal" | 256 quadrilaterals, `D4d`. Spread 0.16; 128 reflex. |
| `#n=ocI&m=regular/w,flat/w&e=0.2` | 10-22 | "a low-poly virus" | 240 quadrilaterals, `Ih`. Spread 0.13; 120 reflex. Whiten changes nothing (cubic symmetry). |
| `#n=jJ46&m=regular,flat&e=0.2` | 10-22 | "a spinning top" | 70 quadrilaterals, `D5` (chiral). 70 reflex (half the edges). |
| `#n=josJ37&m=regular,flat&e=0.2` | 10-22 | "a dented sphere" | 960 quadrilaterals, `D4`. Regular 16,201 rounds; 1,152 reflex (60% of edges: wide shallow bowls); edge ratio 6.6. |
| `#n=okA7&m=regular,flat` | 10-22 | "a little disk with concave tube openings to the side" | 168 quadrilaterals, `D7d`. Spread 0.31, the most tension of all entries; 126 reflex; turn 0.20. |
| `#n=pU5&m=regular/w,flat/w` | 10-22 | "almost a drum"; whitening needed | 62 faces, `C5` (chiral). 10 inward, 60 reflex; without whitening a tamer shape (35 reflex). Whitening stretches the low cupola upwards and the sides fold. |
| `#n=ogdJ37&m=regular/w,flat/w&h=79&e=0.15&ink=dark&fov=19` | 10-22 | "screw-y, very nice; due to gyro, I guess" | 480 quadrilaterals, `D4`: gyro removes J37's mirrors, so the shape is chiral and twists. 336 reflex, every face convex. |
| `#n=decY5&m=mean/w,regular/w,flat/w` | 10-22 | "almost like half a rocket" | 80 quadrilaterals, `C5v`. Face mean start, then the pair; 30 reflex. Lopsided from one side although the group is `C5v`. |
| `#n=caU5&m=regular/w,affine/w,regular/w,flat/w&c=orbit&pal=earth&h=79&e=0.45&ink=dark&fov=19` | 10-22 | "a tomahawk or a missile?" | 77 faces, `C5v`. Four steps, all whitened; the affine step takes 37,925 rounds; 105 reflex; turn 0.01: thin blades. The first entry with a styled look. |

## Regular faces alone

| link | date | owner | what makes it work; numbers |
|---|---|---|---|
| `#n=ebC&m=regular/w` | 10-23 | "truly realizable with regular polygons, but only non-convex?" Yes, both. | 146 faces (48 triangles, 84 squares, 8 hexagons, 6 octagons), `Oh`. **Exact**: by 4,000 rounds every face regular and flat to 1e-15. No inward, 96 reflex, no edge through a face. No convex version can exist: vertices 3.4.4.4 (330°), 3.4.4.6 (360°), 3.4.4.8 (375°). The founding example of [exploration.md](exploration.md#x3-shapes-realizable-with-regular-faces-only-non-convexly). |
| `#n=knJ17&m=regular` | 10-22 | an all-triangle graph made wildly non-convex, no self-intersection | 144 triangles, `D4d`. Every edge equal (a non-convex deltahedron); 8 inward, 72 reflex. The class is in [exploration.md](exploration.md#x4-when-does-regular-then-flat-stay-clean). |
| `#n=dosmA5&m=regular` | 10-22 | 20 bulbs, in rings of 5-10-5 | 1,202 faces of six kinds, `D5`. 38,061 rounds, spread 0.12; no inward, 919 reflex. |
| `#n=dosmA5&m=regular/w&e=0.2` | 10-22 | "bulbous, on strands" | Whitened: 15,797 rounds, 160 inward, 980 reflex. |
| `#n=dosmA5&m=regular/w,regular&e=0.2` | 10-22 | 15 bulbs, 5-5-5; only convex faces | The whitened step flipped half the middle ring inwards, and plain Regular faces keeps that: **two resting points of one optimizer, chosen by the switch**. 1,080 reflex, 0 reflex corners. |

## Affine faces

| link | date | owner | what makes it work; numbers |
|---|---|---|---|
| `#n=ontJ17&m=regular/w,affine/w` | 10-22 | **"finally one of the things I was looking for: affine necessary! A star shape."** | 432 quadrilaterals, `D4d`. Affine settles exactly: every face a flat parallelogram; 288 reflex; roundness 0.35 (long thin rhombi, the spikes). |
| `#n=ozJ45&m=affine` | 10-21 | the first affine star | All quadrilaterals. Exact, flat, edge ratio 1.1, 240 reflex: a spiky star. Regular faces gives a lumpy shape (spread 0.16). |
| `#n=peC&m=affine/w` | 10-22 | "perfectly realizable with affine but not with regular" | 8 triangles, 114 quadrilaterals, `O` (chiral). Affine exact and **convex**; Regular faces stops at spread 0.033. The triangles escape the zonohedron obstruction. |
| `#n=caI&m=affine/w` | 10-22 | "looks nice, and is buildable with affine, I think" | 92 faces, `Ih`. Affine exact, nearly regular (turn 0.97), 120 reflex; Regular faces stops at spread 0.010. |
| `#n=jpD&m=affine/w` | 10-23 | "one type of tile, non-convex" | 150 quadrilaterals, `I` (chiral). Exact: 120 congruent golden rhombi, and the other 30 faces collapse to segments, so the surface is one tile; 60 reflex. A harmless collapse, unlike `jsdJ29`'s. |

## Spectral starts and the built shape

| link | date | owner | what makes it work; numbers |
|---|---|---|---|
| `#n=ocA6&m=spectral:1,flat` | 10-22 | "concave detail, small protruding triangular pyramids inset" | 192 quadrilaterals, `D6d`. The first adjacency layout (2 + 1 eigenspaces) is already folded; Flat faces keeps it: 228 reflex, every face convex. |
| `#n=okD&m=spectral:1,flat` | 10-23 | "a nice star shape" | 180 quadrilaterals, `Ih`. First adjacency layout (one 3-dimensional eigenspace), 180 reflex before and after flat; kites in two orbits with sides 3 : 1 and 2.3 : 1, the long sides making the points. |
| `#n=anzD&m=flat&e=0.2` | 10-22 | **"star faces directly from as built!"** | 272 faces, `Ih`. The decagons and dodecagons are five- and six-pointed concave stars (180 reflex corners), made by the operators; Flat faces only flattens them. |

## Near misses

| link | date | owner | what makes it work; numbers |
|---|---|---|---|
| `#n=sktJ45&m=regular` | 10-22 | "I strongly suspect it can be built from regular polygons, but the optimizer didn't quite get there" | 1,514 faces, `D4`. Settles (about 190,000 rounds) at spread 0.0144 from every start tried: a resting point with tension, not slow convergence. [exploration.md](exploration.md#x3-shapes-realizable-with-regular-faces-only-non-convexly). |
| `#n=ckmU5&m=mean/w,flat` | 10-22 | the "nice" workflow's hard case | Canonical and Readable tangle; only Face mean with Whiten gives something usable. [realization/canonical.md](realization/canonical.md#failure-modes). |
