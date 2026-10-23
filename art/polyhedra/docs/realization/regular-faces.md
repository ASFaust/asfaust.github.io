# Detach-and-Merge Optimizers: Regular, Affine, Star, Stellate, Face Mean, Equal Edges, Mix

> **Status:** in the page as the buttons Regular faces (with regularity, default 1), Affine faces, Star faces (with pointedness), Stellate, Face mean, Equal edges, and the Mix; Whiten is a global switch. **Code:** `js/faces.js` (`FaceRelaxer`, one target or several with `weights`), `js/frame.js` (`whiten`, `shake`), driven by `js/pipeline.js`. **Tests:** `tests/realize.mjs`, `tests/optimizers.mjs`, `tests/spectral.mjs`. **Backlog:** X3–X6 (what these do to which graphs), parked ideas.

**Serves** goal B mainly ([README.md](README.md#goal-b-artsy-shapes)): Regular faces is the main artsy optimizer. Face mean and the tangent + regular mix serve goal A as starts or blends.

**Origin:** Regular faces is the owner's optimizer from PolyOp, there called *detached faces*, the one that worked best for them (not in the PolyOp repository); renamed on 2026-10-21 for what it does. The affine target is the per-face projection `P_F` of [nozono.md](nozono.md). Like every optimizer they start from wherever the vertices are, so they chain (`canonical,regular,flat`); the symmetry is kept unless the Keep symmetry switch is off (Stellate never averages).

## How it works

### The scheme
Alternating projections: one projection per element, then a reconciliation. Each round:
1. **Detach:** every face gets its own copy of its vertices.
2. **Target:** move each face's copies towards a nicer version of that face, independently of all other faces.
3. **Merge:** each vertex goes to the mean of its copies.
4. **Normalize:** centroid at the origin, mean vertex radius 1. Without this the shape drifts or shrinks. With Whiten on, whitening instead.

**Settled** means no vertex moved more than `1e-8` (relative) in a round; the cap is 60,000 rounds. The page's error figure is the **spread**: the largest mean distance of a vertex's copies from its merged position, in mean edge lengths. 0 means every face is exactly what its target wants.

### The targets
- **Regular** (`regularity` α): project the corners onto the face's plane (Newell normal through the centroid), take complex coordinates `z_k` in it, and fit the regular polygon `a·ζᵏ`, `ζ = e^{2πi/n}`; the least-squares fit is the Fourier coefficient `a = (1/n) Σ z_k conj(ζᵏ)`. The copy is `flat + α(regular − flat)`: α = 0 only flattens, 1 makes the face regular.
- **Affine**: the orthogonal projection of the corners onto Fourier modes 0, ±1, in 3D: `y_j = c + a cos θ_j + b sin θ_j`, with `c` the mean, `a = (2/n) Σ x cos θ`, `b = (2/n) Σ x sin θ`. Flat by itself: an evenly spaced polygon on an ellipse (the limit of the midpoint iteration). Triangles are always affine-regular, so they only follow their neighbours; quadrilaterals become parallelograms. Degenerate (a segment) when `a` and `b` are parallel, which nothing prevents. One round is a *linear* map of the positions.
- **Star** (pointedness t, 0 to ½, default 0.3): the regular target with `ζᵏ` replaced by `ζ^{kj}`, `gcd(k, n) = 1`, so the face becomes the star polygon `{n/k}`, wound the other way: a stellation. k is chosen per face by `starK`: nearest t·n among 1 and the valid stars, ties to the more pointed. Regularity is always 1.
- **Stellate**: affine with modes 0, ±k (k from `starK`): each face becomes an affine image of `{n/k}`. With whitening every round this is linear subspace iteration towards the layouts whose faces are closest to affine stars. The button shakes the shape first (0.1 edge lengths, seed 1), since an exactly convex face has no mode-k content; does not average over the symmetries, since a stellation shows them by other matrices than its start ([spectral.md](spectral.md#findings-2026-10-21)); and turns a mirror image (negative density) the right way out.
- **Mean**: every copy at the face's centroid, so each vertex goes to the mean of its faces' centres (PolyOp's `move_to_face_centers`). One round is `X ← M X` with the face-mean matrix of [spectral.md](spectral.md): power iteration; with Whiten, subspace iteration to the spectral face-mean layout.
- **Flat** (in the Mix): the regular target at regularity 0. The *Flat faces button* is not this scheme but canonical's planarity step alone ([canonical.md](canonical.md#planar-mode)), which keeps the shape closer to where it was.
- **Over edges and vertices** (2026-10-22): **equal edges**, each edge scaled about its midpoint to the mean edge length; **tangent edges**, each edge moved along its point nearest the centre until that point is at the mean distance (Hart's tangency step as a target, so tangent + flat is a canonical iteration without momentum); **sphere**, each vertex to the mean radius.

### Mixing
Every vertex goes to `Σ_t w_t Σ copies / Σ_t w_t · count_t(v)`: averaged projections, gradient descent on `Σ_t w_t · dist²(X, target set t)`, which settles where the weighted pulls balance. One target at weight 1 is the single button, bit for bit. Regular + flat at 1 : 1 is regular faces at 0.5. In the page: chips add an ingredient, a slider (0–1) and × per ingredient, a "Mix" button, and "From the last step" (regular α → regular α + flat 1 − α; canonical → tangent + flat). A weight change applies on release and starts a new step; the step before stays in the chain, stopped where it was, so the chain replays exactly. Pointedness for star and stellate comes from the Star faces field. URL: `mix:regular=1+flat=0.5+pt=0.25/w`.

### Whiten
`whiten()` in `frame.js`: symmetric (ZCA) whitening `X ← X C^{-1/2}`, scaled to keep the size, after every round. It commutes with rotations, so it never breaks the symmetry. For subspace iteration (Face mean, Stellate) only the span of the three columns matters, so it works as well as Gram–Schmidt. It replaced (2026-10-22) the three per-round adjustments centre, orthogonalise (Gram–Schmidt, a shear) and normalise (each centred column scaled to the mean spread), which old links still replay exactly.

## Findings

### Regular and affine faces on the benchmark

`node tests/realize.mjs --mode canonical,regular --sym --max-it 20000` (or `canonical,affine`), from canonical as the page's default chain.

```
regular, regularity 1 (2026-10-21, after removing stiffness)
string        edges  rounds  planar  inward reflex corner  edge×  fedge×  turn  round  size×  slope
tI               90       2  6.2e-16       0      0      0    1.0     1.0  1.00   1.00    1.0   0.00
tttC            324      72  1.8e-1       0      0      0    1.5     1.3  0.69   0.95    1.2   0.06
gpD             750     486  8.2e-2       0      0      0    1.9     1.4  0.66   0.93    1.4      —
pgI             750     859  3.8e-2       0    420      0    1.9     1.4  0.66   0.95    1.5   0.34
cccC            768    3221  5.3e-2       0      0      0    1.7     1.3  0.81   0.99    1.7   1.11
tktkI          2430    3298  6.8e-2       0    210      0    6.0     1.8  0.64   0.95    5.8   1.47
tttttD         7290     860  6.6e-1     360   3540   1200    3.1     1.9  0.33   0.76    2.2   0.06
kkkD            810    2523  6.6e-16     180    180      0    1.0     1.0  1.00   1.00    1.0      —
jsdJ29          320    1447  9.3e-2       0    144      0    1.8     1.4  0.72   0.93    1.6      —
aoeU4           640    8238  5.9e-2       0    120      0    2.4     1.5  0.86   0.96    2.4   0.85

affine
tttC            324     156  3.6e-2       0      0      0    2.7     2.5  0.47   0.71    1.5   0.12
gpD             750    1282  4.7e-2       0      0      0    1.7     1.7  0.54   0.84    1.2      —
pgI             750    3148  2.1e-2       0    360      0    1.4     1.4  0.49   0.69    1.4   0.09
cccC            768    7144  4.8e-2       0      0      0    1.5     1.4  0.62   0.97    1.3   0.30
tktkI          2430    7373  8.7e-2       0    390      0    3.5     1.9  0.66   0.89    2.3   0.64
tttttD         7290    1065  2.3e-2       0   1260    120    8.4     7.7  0.10   0.28    2.7   0.18
kkkD            810       2  2.0e-15       0      0      0    8.7     5.0  0.29   0.38    1.8      —
jsdJ29          320   20000  1.1e-2      16    112      0    1.3     1.3  0.04   0.07    3.1      —
aoeU4           640   20000  5.1e-5      36    336      0    5.7     5.7  0.50   0.43    6.6   0.79
```

### Regular faces
- **Faces are not flat at full regularity** wherever regular faces cannot all fit: `planarMax` 0.04–0.18 edge lengths. The residual tension ends up as bending; Flat faces afterwards removes it and keeps the folds (the catalogue's main recipe, [../catalogue.md](../catalogue.md#regular-faces-then-flat-faces)).
- **Non-convexity is inherent at full regularity** wherever the regular corner angles at a vertex add up to 360° or more. In `tttttD`, triangles meet 96- and 320-gons, so those vertices must become saddles. The angle sums are a quick test: any vertex at 360° or more rules out a convex realization with regular faces, but not a non-convex one. Some graphs have an exact non-convex one (`ebC`); that class is [X3](../exploration.md#x3-shapes-realizable-with-regular-faces-only-non-convexly).
- **All-triangle graphs become equilateral deltahedra**, folding as much as they must (`knJ17`, `kkD`, `kkkD`, `kI`, `kkI`, `knC`); details in [X4](../exploration.md#x4-when-does-regular-then-flat-stay-clean).
- **Symmetry averaging helps a lot.** Without it, `gpD` never settled (20,000 rounds, 285 reflex edges); with it, 487 rounds, convex.
- **Even where canonical is unreadable, regular faces makes the faces regular**, by going non-convex: `ntU4` canonical edge ratio 20.7 → 1.1, `mU4` 5.2 → 1.0, `kksJ17` 5.7 → 1.0.
- **Resting points with tension, and several of them.** `sktJ45` settles at spread 0.0144 from every start tried ([X3](../exploration.md#x3-shapes-realizable-with-regular-faces-only-non-convexly)); `dosmA5` has two resting points, chosen by whether the first run is whitened ([X6](../exploration.md#x6-several-resting-points-of-regular-faces)).
- **Stiffness was removed** (owner, 2026-10-21). It weighted vertices by how much their copies disagreed (`w = 1 + 2 · spread / mean spread`), which also needed a joint least-squares fit of centre and size. Without it the benchmark is nearly unchanged, except `tttttD`: turn 0.46 → 0.33, and 1,200 corners now turn the wrong way, against none. The owner chose the simpler optimizer.

### Affine faces
- **It finds flat, very non-convex shapes where regular faces cannot.** `ozJ45` (owner's example, all quadrilaterals) from the built shape: exact (spread 0.000, planar 2e-7), every face a flat, nearly rhombic parallelogram, edge ratio 1.1, 240 reflex edges: a spiky star. Regular faces on the same graph stops at spread 0.16 with faces bent by 0.1: lumpy. Squares do not fit; parallelograms do, once the shape may fold. Second example: `ontJ17` ([catalogue](../catalogue.md#affine-faces)).
- **It is exact more often than regular faces**, convex (`peC`) or not (`caI`, `jpD`); see the catalogue.
- **The zonohedron obstruction does not stop it.** nozono.md §5 predicts that an all-even-faced graph that is not zonohedral has no realization with affine-regular faces. All tried settle: zonohedra exactly (`C jC tO bC jD bD eC`, spread ≤ 1e-7), and the non-zonohedra too (`oC`, `cC`, `dA5`, `jP6`, spread ≤ 2e-7). The obstruction is for convex polyhedra; the scheme escapes it by folding, or by collapsing faces to segments (turn 0.00 on `dA5` and `jP6`). Odd faces escape it anyway (`peC`'s 8 triangles).
- **It collapses.** Without Whiten the whole shape often collapses (owner, 2026-10-23): the round is linear, so the iteration runs to its dominant eigenvector. With Whiten, single faces can still collapse (`jsdJ29` turn 0.04, roundness 0.07). A collapse can be harmless: `jpD`'s 30 collapsed faces leave a surface of 120 congruent golden rhombi. A session hypothesis on which faces collapse (zones) is in [X5](../exploration.md#x5-which-graphs-give-affine-stars).
- **All-triangle graphs do not move** (`kkkD`: 2 rounds): every triangle is affine-regular.

### Whiten, and the old adjustments it replaced
Findings of 2026-10-21, made with centre, orthogonalise and normalise; they carry over to Whiten, which is the symmetric version of orthogonalise + normalise.
- **The adjustments are affine maps, so they commute with the affine-faces step** (owner's prediction, confirmed): every fixed point of affine faces stays one (`ozJ45`, `tttC` identical with and without).
- **But the combination has new resting points.** In a global collapse an affine round squashes the shape along one axis, and normalising undoes exactly that, so the combined round stands still at a shape whose faces are *not* affine-regular. It prevents the global collapses (`dA5` turn 0.00 → 0.75, `jP6` 0.00 → 0.58), with faces bent by 0.1 edge lengths. It does not help local collapse (`jsdJ29` 0.04 → 0.07).
- **Gram–Schmidt broke the symmetry** on shapes whose spread is correlated in x, y, z (it shears); that is why Whiten is ZCA.
- **Whiten matters for shapes with one main axis** (`pU5`, `decY5`, `dosmA5`, `caU5`): it forces equal spread along the axis and across, so each round stretches the shape and the sides fold. It is the identity on cubic and icosahedral symmetry.
- Face mean with Whiten gives the same shapes as with all three old adjustments (`ckmU5 tkD P6 A5 U4 ozJ45 jsdJ29 cC`, identical metrics), in fewer rounds (`ozJ45` 479 → 165).
- **Random starts.** Random → affine settles to flat affine-regular faces without symmetry (`ozJ45`: a crumpled cluster of parallelograms; `tI` even comes out convex). Random → canonical gets tangled (`tI` 20,000 rounds, 83 reflex edges): Hart's iteration needs a sensible start.

### Face mean (2026-10-21)
`node tests/realize.mjs --mode mean --sym --flags w`.
- **Alone, it collapses** towards the strongest eigenvector: `P6`, `A5`, `U4` end flat as a whole (planar 1e-23), `P6` and `ozJ45` degenerate. Platonic solids are exact fixed points (their strongest eigenvalue is threefold).
- **With normalising, shapes aligned with the axes come out well**: `P6 A5 Y5 U4 J29` convex and balanced in 3–8 rounds (edge ratio 1.3–2.2, turn 0.86–1.00). `ozJ45` also needs the orthogonalisation (Whiten does both): 165 rounds, edge ratio 3.5, turn 0.49, 112 reflex edges.
- **Faces need not be flat** (`tkD` 0.026, `jC` 0.12): an eigenvector layout is not a polyhedron. Flat faces afterwards fixes that.
- PolyOp's "face mean gives a valid realization most often" fits: all the small seeds above come out convex. It is the owner's standard start when Canonical tangles (`ckmU5`).

### Star faces
- **k has to depend on the face**: a valid star needs `gcd(k, n) = 1` and `1 < k < n/2`, so triangles, squares and hexagons have none, pentagons and octagons one (`{5/2}`, `{8/3}`), heptagons two. An automorphism keeps n and k, so k per face size or per face orbit keeps the symmetry; k per single face breaks it. The owner could not choose between one k for all, the pointedness rule, and k per orbit; the rule was the session's recommendation (per-orbit choice is parked, it needs face picking).
- **From the convex shape nothing happens**: a regular face has no content in Fourier mode k, so every copy goes to the centroid and the round is face mean, of which Platonic solids are fixed points. A jitter of 0.05 does not get out: the convex shape is an attractor.
- **From random starts, without symmetry, it finds the uniform star polyhedra exactly**: `D 5:2` the great stellated dodecahedron, `tD 10:3` the great stellated truncated dodecahedron (3 of 3 seeds); other seeds end bent.
- **Keeping the symmetry stops it from the convex start**, because the star solid realizes the same automorphisms by a different representation (the Galois conjugate: Rayleigh quotients √5 for the dodecahedron, −√5 for the great stellated one). From a stellated spectral start with the symmetry kept, it gives the uniform star polyhedra exactly ([spectral.md](spectral.md#findings-2026-10-21)).
- `I 3:2` only turns the triangles over; the great icosahedron has ordinary triangles as faces, so no face target can reach it.
- On its own it does nothing interesting (owner, 2026-10-22). Its use is finishing what Stellate starts. The viewer's centroid fan is not checked on self-intersecting star faces.

### Stellate (2026-10-22)
Prototype (scratch script: the affine-star step with ZCA whitening every round, from random points, then Star faces), which the button reproduces from the built shapes (`D` density 7 in 135 rounds, `tD` 13 in 122, `tI` 7 in 1,499, all exact and `Ih`):

| shape | affine star from random | then Star faces |
|---|---|---|
| `D` | density ±7, flat, equal edges: the great stellated dodecahedron | already exact |
| `tD` | density ±13, flat, equal edges: the great stellated truncated dodecahedron | already exact |
| `tI` | density 7, flat, equal edges: the truncated great icosahedron | already exact |
| `cD` | density ±7, flat, edge ratio 1.7 | regular stars bend faces (0.19) |
| `P5` | density ±2: a pentagrammic prism | exact |
| `A5` | density 0 or 1, edge ratio 4 | density 3, exact: a pentagrammic crossed antiprism |
| `gD` | density 37, faces bent 0.03 | faces bent 0.05 |
| `aD`, `sD`, `jD` | density −1 to 1, not a clean stellation | bent, density ±2 or ±3 |
| `tkD` | no stellation | same |

A shape whose faces are all exactly affine stars has the largest possible eigenvalue, 1, so it is found whenever it exists. It fails where most faces have no star (hexagons, squares, triangles: `tkD`, `jD`).

### Equal edges and the mix (2026-10-22)

`node tests/realize.mjs --sym --max-it 20000 --mode … --weights …`:

```
                         string  rounds  planar  inward reflex  edge×  fedge×  turn
canonical,edges          tkD        105  2.0e-2       0      0    1.0     1.0  0.83
                         tttC       232  3.5e-1       0     24    1.0     1.0  0.23
                         ozJ45     1421  3.3e-1      32    320    1.0     1.0  0.40
canonical,mix edges+flat tkD        903  6.4e-7       0      0    1.0     1.0  0.74
                         tttC      2108  1.5e-6       0     24    1.0     1.0  0.00
                         ozJ45     7060  7.1e-7       0    248    1.0     1.0  0.25
                         jsdJ29   20000  1.5e-2      16     96    1.0     1.0  0.04
canonical,mix tangent+regular
                         tkD         52  5.9e-3       0      0    1.1     1.1  0.93
                         tttC       140  1.8e-1       0      0    1.5     1.3  0.67
                         jsdJ29     382  4.9e-2       0      0    2.0     1.5  0.60
mix mean+edges /w        ckmU5      475  7.9e-1       0    340    7.3     6.1  0.14
(mean /w alone           ckmU5      311  1.1e+0       0    400   23.1    12.2  0.22)
```

- **Equal edges alone** gets every edge equal and bends the faces (planar 0.02–1.1).
- **Flat + equal edges gives equilateral polyhedra with flat faces**: `tkD` convex, exactly flat and equilateral, an equilateral Goldberg polyhedron, which no single button makes. `tttC` and `ozJ45` fold (24 and 248 reflex edges), and `tttC` gets a corner that goes straight. `jsdJ29` does not settle.
- **Tangent + regular** is a canonical shape pulled towards regular faces: convex on `tkD`, `tttC`, `jsdJ29`, with `tttC`'s edge ratio 1.5 against canonical's 4.1, at the price of faces bent by 0.006–0.18. Flat faces afterwards not measured.
- **Tangent + flat** matches canonical where canonical works, more slowly (no momentum), and tangles on `ckmU5` like canonical, also from Face mean: the tangle is in the targets, not in Hart's step sizes.
- **Face mean + equal edges, whitened**, on `ckmU5`: edge ratio 7.3 against 23 for face mean alone, still no inward faces, faces bent 0.8.

## Open questions

All questions of the form "which graphs does this optimizer turn into what" are in [../exploration.md](../exploration.md): exact regular realizations and `sktJ45` (X3), clean regular-then-flat shapes and deltahedra (X4), affine stars and collapse (X5), several resting points (X6). Left here:
1. Do the inherent saddles at full regularity have a predictable layout, so they could become a design feature? (Part of X3/X7.)
2. Parked target ideas (owner, 2026-10-23: no new artsy optimizers for now): per-orbit k for Star faces; an **isotoxal star** target for `anzD`-like concave star faces, a `2m`-gon with corners alternating between two radii, `r₁ ζ^{2j}` and `r₂ ζ^{2j+1}`, which is the projection onto Fourier modes 1 and `m+1` together (`(−1)^j ζ^j = ζ^{(m+1)j}`), only for even faces, and able to start from a convex shape where `{n/k}` cannot.
