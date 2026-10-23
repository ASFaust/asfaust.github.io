# Exploration: Which Shapes Do What

> **Status:** open research project, started 2026-10-23 (owner). Nothing built yet beyond the metrics in `tests/lib.mjs`. **Code:** none yet; experiments go in `tests/` (a script that stays) or a scratch folder (a one-off). **Backlog:** X1–X7.

The optimizers are understood well enough; the graphs are not. This project asks, for a given Conway string and optimizer chain, **what the result will be**, and looks for classes of shapes with a common behaviour. The owner's questions (2026-10-23):

1. Which non-convex shapes can be made from exactly regular polygons, when no convex version can? Can we generate them on purpose, predict them, tell whether there are infinitely many, and group them by how they look and behave? ([X3](#x3-shapes-realizable-with-regular-faces-only-non-convexly))
2. Which graphs "work" with Regular faces: Flat faces afterwards leaves no self-intersection, or, stricter, every face stays convex? ([X4](#x4-when-does-regular-then-flat-stay-clean))
3. Which graphs give Affine faces' clean star shapes? Probably all-quadrilateral ones. ([X5](#x5-which-graphs-give-affine-stars))
4. In general: can we predict or classify what the optimizers make? ([X7](#x7-predicting-and-classifying-in-general))

Data so far: [catalogue.md](catalogue.md) (the owner's shapes) and the findings in [realization/regular-faces.md](realization/regular-faces.md#findings).

## Tools

### X1. Self-intersection test
Needed by X3 and X4. Nothing checks it yet; the owner's "no self-intersection" verdicts are by eye. Plan: triangulate every face (the viewer's fan around the centroid, or the true polygon once faces are flat), then test every pair of triangles from faces that share no vertex (Möller's triangle–triangle test), with a bounding-volume hierarchy or a uniform grid to skip far pairs. Faces that share a vertex or an edge need their own test, because a fold can pass through a neighbour. Report the number of intersecting face pairs, and add it to `metrics()` as `selfX`. Calibrate it on `ebC` and `knJ17` (expected 0), on a stellation from Stellate on `D` (expected many), and on the catalogue.

### X2. Survey harness
A script that runs one chain over many strings (a list, the catalogue, or `--random N`) and writes one row per shape: graph features (face degree histogram, vertex types and their regular angle sums, symmetry order, the operator letters, whether all faces are even, all quadrilaterals, all triangles) and outcome metrics (settled or not, spread, planarity, inward, reflex, reflex corners, density, `selfX`, turn). Output as CSV or JSON, so it can be sorted and plotted, with an option to save a screenshot per shape (`tests/screenshot.mjs`) for judging looks. `tests/realize.mjs` already does most of the running; extend it or wrap it. Every question below starts with a survey.

## X3. Shapes realizable with regular faces only non-convexly

**The founding example** (owner, 2026-10-23): `ebC` ([catalogue](catalogue.md#regular-faces-alone)). Regular faces settles to machine precision with every face regular and flat, non-convex (96 reflex edges), with no self-intersection by eye; and a convex version is impossible because some vertices' regular corner angles add up to 360° or more. All-triangle graphs are excluded as trivial (owner): an equilateral triangle has no shape to choose, so any graph's deltahedron problem is only about folding.

**What is known:**
- **Convex:** the convex polyhedra with all faces regular are the 5 Platonic, 13 Archimedean and 92 Johnson solids, plus the prisms and antiprisms (Johnson 1966, Zalgaller 1969). A finite list and two families.
- **Angle-sum test (necessary for "no convex version"):** if some vertex's regular corner angles add up to 360° or more, there is no convex realization with regular faces. Cheap, purely combinatorial. `ebC` passes it (3.4.4.6 = 360°, 3.4.4.8 = 375°).
- **The total gives nothing:** Σ over vertices of (360° − regular angle sum) is always 720°. By Euler, 360V − 180 Σ_f (n_f − 2) = 360(V − E + F) = 720°, for every genus-0 graph. So the `sktJ45` note "the defects sum to 720°, as they must" is automatic, not evidence.
- **Constraint count (session, 2026-10-23, unchecked against data):** with every edge 1 and every face flat and regular, a face of n sides imposes 2n − 6 conditions beyond its edge lengths (a unit regular n-gon is rigid: 3n coordinates minus 6 motions, minus n edges). The total is E + Σ_f (2n_f − 6) = 5E − 6F conditions on 3V − 6 unknowns, which leaves **3F − 2E degrees of freedom**. That is 0 for all-triangle graphs (generically rigid, as Cauchy and Gluck say) and negative for every other graph (`ebC`: 3·146 − 2·288 = −138). So exact regular realizations are over-determined, and exist only because the symmetry makes the equations dependent. The symmetry-adapted version of this count (Fowler & Guest 2000, "A symmetry extension of Maxwell's rule") counts per irreducible representation and could predict which symmetric graphs have room for a solution. This is a candidate predictor for X3; it has not been tried.
- **Infinitely many, trivially:** outside Conway strings, gluing regular-faced solids along faces where the two dihedral angles add up to more than 180° (two icosahedra: 2 × 138°) gives non-convex regular-faced polyhedra without self-intersection, and chains of them give infinitely many. So the interesting question is narrower: within symmetric Conway-generated graphs, or for shapes that are not such gluings. Bonnie Stewart's *Adventures Among the Toroids* (1964, 2nd ed. 1970) studies non-convex regular-faced polyhedra (of higher genus) and may have the right vocabulary. Not yet read.

**The near miss** `sktJ45` (owner, 2026-10-22: "I strongly suspect it can be built from regular polygons"): every vertex has four triangles and one other face, summing to 360° beside a hexagon (the snub hexagonal tiling, flat), 330° beside a square, 348° beside a pentagon, 375° beside an octagon. Regular faces settles at spread 0.0144 from every start tried (9 chains, from the build, without symmetry, from canonical, whitened, shaken, ramped from regularity 0.5, from Face mean; random starts worse); one run continued to 300,000 rounds and the spread stayed at 0.0144 while the movement per round fell geometrically. So it is a resting point with residual tension. Either no regular realization exists, or it lies in a basin none of these starts reaches.

**Open, in order:**
1. **A direct solver** for "all edges 1, all faces flat and regular": Gauss–Newton or Levenberg–Marquardt on the constraint residuals, within the symmetric subspace, started from Regular faces' result. On `sktJ45` it either finds a regular realization or shows where the residual sits (and the Jacobian's rank says whether the count above is the obstruction). On `ebC` it should confirm exactness quickly.
2. **A search**: over strings up to some length, filter by the angle-sum test (cheap), run Regular faces, keep those that settle with spread below 1e-9, then X1 for self-intersection. This gives the first list, and an answer to "how common".
3. **Predictors**: does the symmetry-adapted count separate the exact ones from the near misses? Do vertex types matter (`ebC` and `sktJ45` both have vertices at exactly 360°)?
4. **Classes by look and behaviour** (owner): once there is a list, group by what the folds do (creases along a belt, dents, bulbs), by which vertex types are saddles, and by the operators in the string.

## X4. When does regular-then-flat stay clean

**Question (owner, 2026-10-23):** for which graphs does Regular faces, then Flat faces, give a shape that does not intersect itself? Stricter: one where every face also stays convex?

**Data:** every catalogue entry in the regular-then-flat group is clean by eye. `csJ45` is clean but has non-convex faces (224 reflex corners); `dosmA5` after the two-step chain has none. `jtJ37` and `caU5` have nearly straight corners (turn 0.27, 0.01), on the edge of a face going non-convex. On `tttttD` regular faces leaves 1,200 reflex corners and bent faces; Flat faces afterwards was not measured.

**All-triangle graphs** (owner's class, 2026-10-22; example `knJ17`) are the clean special case: Regular faces makes every edge exactly equal on every all-triangle graph tried (`knJ17` 8 inward faces, `kkD` 90 reflex edges, `kkkD` 180 inward, `kI` 30 reflex, `kkI` 60 inward, `knC` 24 inward; 16 to 2,536 rounds), so the only question is whether the fold intersects itself. `knJ17` does not (owner's eye).

**Open:** needs X1 and X2. First survey: `regular,flat` over the random strings and the catalogue, recording `selfX` and reflex corners against the graph features. Then look for a rule. Candidates to test: the fraction of vertices whose regular angle sum is at least 360°; the face degree mix; the symmetry order (more symmetry spreads tension evenly, as on `oD`); the residual spread Regular faces leaves.

## X5. Which graphs give affine stars

**Question (owner):** which graphs does Affine faces turn into clean, flat, spiky stars, and which into collapsed faces?

**Data:**
- Clean and exact: `ozJ45`, `ontJ17` (both all-quadrilateral, from `o` with Johnson seeds), `jpD` (golden rhombi, with 30 faces collapsed to segments, harmlessly), `caI` (non-convex, nearly regular), `peC` (convex).
- Collapsing: `jsdJ29` (turn 0.04), `dA5`, `jP6` (faces to segments).
- Affine needs Whiten or it often collapses the whole shape (owner, 2026-10-23): one affine round is a linear map of the positions, so without whitening the iteration runs to its dominant eigenvector, which can be flat or a line. Even with Whiten, some faces collapse to segments.

**Hypothesis (session, 2026-10-23, untested): zones.** In a parallelogram, opposite edges are equal and parallel. On an all-quadrilateral graph, follow a face across to its opposite edge, and on to the next face: this strip is a **zone**, and with all faces parallelograms every edge of a zone is the same vector. Since the faces generate all cycles of a sphere, *any* choice of one 3D vector per zone closes up into a realization with every face a parallelogram, so the space of such realizations is linear, of dimension 3 × (number of zones), up to translation. Two predictions follow:
- **A face where a zone crosses itself must collapse**: both of its edge pairs carry the same vector, so the parallelogram is a segment. Check on `jpD`'s 30 collapsed faces, and on `jsdJ29`.
- **The look is set by the zone vectors**, which the linear affine iteration picks from the start (and whitening). Stars may be graphs whose zones are few and long; zonohedra are the case where zones are great circles and the result is convex.

Affine-regular hexagons and larger even faces are centrally symmetric too, so their opposite edges also form zones, with extra linear conditions per face; odd faces break the zones, which may be how `peC` and `caI` (triangles, pentagons) escape. Testing this needs only a zone count per graph (combinatorial), and a check of which faces collapse.

## X6. Several resting points of Regular faces

**Observation (owner, 2026-10-23):** Regular faces sometimes has several separate resting points. Clearest case: `dosmA5`, where plain Regular faces gives 20 bulbs (5-10-5), but a whitened run first flips half the middle ring inwards, and plain Regular faces then stays at 15 bulbs (5-5-5) ([catalogue](catalogue.md#regular-faces-alone)). The `sktJ45` starts all reached shapes with spread 0.014–0.024 and different edge ratios, which may be different resting points too.

**Open:** a way to list them. Run Regular faces from many symmetric starts (Shake with different seeds, Whiten on and off, spectral starts, symmetric random points), cluster the results by `shapeDistance`, and count the clusters and their spreads. Whether the page should offer a "next resting point" control is a later question for the owner.

## X7. Predicting and classifying in general

The umbrella question. Once X2 exists, every survey adds rows; the goal is a short list of rules of the form "graphs with feature F under chain C give outcome O", each with its counterexamples. Graph features to try first: the operator letters, the seed family, the face degree mix, all-even or all-quadrilateral, vertex types and their regular angle sums, the symmetry order, the zone count (X5), the constraint count (X3). Outcomes: settled or exact, convex, reflex fraction, density, `selfX`, collapsed faces, and the owner's look words from the catalogue (folds, bulbs, stars, dents, twist).

## X8. LLM-guided search for nice renders

**Asked (owner, 2026-10-23), not yet designed.** Use a model that can see images to explore for nice and artsy renders: it proposes a shape (notation), an optimizer chain and render settings (look, scene, light, camera, RT on or off), renders it through the page in headless Chrome (`tests/screenshot.mjs`, or a harness built on X2), looks at the picture, and decides what to try next, keeping a gallery of the ones it judges good together with their links and a short note on why. The point is twofold: finding shapes and settings by hand is slow, and the notes may turn into rules (X7) and into the choice of looks (R1). Open: the model and its API key (not in the page; a script in `tests/` run by the owner), the budget per run, how to steer it towards the owner's taste (the catalogue's favourites and look words as examples), and whether the renders need RT (slow in software WebGL) or the fast view is enough for judging.
