# Regular Faces and Affine Faces (Detached-Faces Optimizers)

**Serves:** goal B: shapes whose faces are (affine-)regular polygons, often non-convex, which is what makes them interesting (owner, 2026-10-21: "nonconvexity and symmetry" are the two axes of artsy). See [README.md](README.md).

**Status:** in the page as the "Regular faces" button (with a regularity field, default 1), "Affine faces", "Star faces", "Stellate", "Face mean", "Equal edges", and the Mix, which runs several targets with weights. **Code:** `js/faces.js` (`FaceRelaxer`, one target or several with `weights`), driven by `js/pipeline.js`. Like every optimizer, they start from wherever the vertices are, so they can be chained (`canonical,regular,flat`); the symmetry is kept unless the Keep symmetry switch is off (Stellate never averages).

**Origin:** the owner's optimizer from PolyOp, there called detached faces, the one that worked best for them. It is not in the PolyOp repository. Renamed (2026-10-21) for what it tries to do: make all faces regular polygons, which it often achieves. The affine target is the per-face projection `P_F` of [nozono.md](nozono.md).

## The scheme

Alternating projections: one projection per face, then a reconciliation. Each round:
1. **Detach:** every face gets its own copy of its vertices.
2. **Per-face target:** move each face's copies towards a nicer version of that face, independently of all other faces.
3. **Merge:** each vertex goes to the mean of its copies.
4. **Normalize:** centroid at the origin, mean vertex radius 1. Without this the shape drifts or shrinks.

**Settled** means no vertex moved more than `1e-8` (relative) in a round; the limit is 60,000 rounds. The page's error figure is the largest spread (mean distance of a vertex's copies from its merged position), in mean edge lengths: 0 means every face is exactly what its target wants.

## The targets

**Regular** (`regularity` α): project the corners onto the face's plane (Newell normal through the centroid), take complex coordinates `z_k` in it, centred on the centroid, and fit the regular polygon `a·ζᵏ`, `ζ = e^{2πi/n}`. With equal weights the least-squares fit is just the Fourier coefficient `a = (1/n) Σ z_k conj(ζᵏ)`. The copy is `flat + α(regular − flat)`: α = 0 only flattens, 1 makes the face regular.

**Affine**: the orthogonal projection of the corners onto Fourier modes 0, ±1, in 3D: `y_j = c + a cos θ_j + b sin θ_j` with `c` the mean, `a = (2/n) Σ x cos θ`, `b = (2/n) Σ x sin θ`. The result is flat by itself, an evenly spaced polygon on an ellipse (the limit of the midpoint iteration). Triangles are always affine-regular, so they only follow their neighbours; quadrilaterals become parallelograms.

**Stellate**: affine with mode k of the star `{n/k}` for mode 1 ([below](#stellate-affine-star-faces-2026-10-22)). **Mean**: every copy at the face's centroid ([Face mean](#face-mean-2026-10-21)). **Flat** (in the mix): the regular target at regularity 0, only projected onto the plane.

**Over edges and vertices** (2026-10-22), the same detach-and-merge with other elements: **equal edges**, each edge scaled about its midpoint to the mean edge length; **tangent edges**, each edge moved along its point nearest the centre until that point is at the mean distance (Hart's tangency step as a target, so tangent + flat is a canonical iteration without momentum); **sphere**, each vertex to the mean radius.

**Mixing** (the page's Mix): every vertex goes to `Σ_t w_t Σ copies / Σ_t w_t · copies_t(v)`, averaged projections, which settles where the weighted pulls balance. One target at weight 1 is the single button, bit for bit.

**Flat faces** (the page's other per-face button) is not this scheme but the canonical iteration's planarity step alone (`Realizer` in mode `'planar'`, [canonical.md](canonical.md#planar-mode)): each vertex moves towards the planes of its faces, which keeps the shape close to where it was. Regular faces at regularity 0 does nearly the same by projection and merge.

## Findings

Numbers: `node tests/realize.mjs --mode canonical,regular --sym --max-it 20000` (or `canonical,affine`), which starts from canonical as the page's default chain does.

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

Regular faces:
- **Faces are not flat at full regularity** wherever regular faces cannot all fit: `planarMax` 0.04–0.18 edge lengths. The residual tension ends up as bending.
- **Non-convexity is inherent at full regularity** wherever the regular corner angles at a vertex add up to 360° or more. In `tttttD`, triangles meet 96- and 320-gons, so those vertices must become saddles. `kkkD` comes out with exactly equilateral triangles and 180 inward faces.
- **Symmetry averaging helps a lot** (now always on). Without it, `gpD` never settled (20,000 rounds, 285 reflex edges); with it, 487 rounds, convex.
- **Even where canonical is unreadable, regular faces makes the faces regular**: on random strings over cupola and Johnson seeds (`ntU4` canonical edge ratio 20.7 → 1.1, `mU4` 5.2 → 1.0, `kksJ17` 5.7 → 1.0), by going non-convex.
- **Stiffness was removed** (owner, 2026-10-21). It weighted vertices by how much their copies disagreed (`w = 1 + k · spread / mean spread`, k = 2), which also needed a joint least-squares fit of centre and size (with unequal weights the centroid biases the fit). Without it the list is nearly unchanged, except `tttttD`: turn 0.46 → 0.33, and 1,200 corners now turn the wrong way, against none. Stiffness did help there, more than "worst spread 0.88 → 0.66" suggested; the owner chose the simpler optimizer.

Affine faces:
- **It finds flat, very non-convex shapes where regular faces cannot.** `ozJ45` (owner's example, all quadrilaterals) from the built shape: affine settles exactly (spread 0.000, planar 2e-7, edge ratio 1.1: every face a flat, nearly rhombic parallelogram, 240 reflex edges), a spiky star. Regular faces on the same graph settles with spread 0.16 and faces bent by 0.1 edge lengths: a lumpy shape. Regular quadrilaterals (squares) do not fit; parallelograms do, once the shape may fold.
- **The zonohedron obstruction does not stop it.** nozono.md predicts that an all-even-faced graph that is not zonohedral has no realization with affine-regular faces, and so that the scheme cannot converge on one. All settle: zonohedra exactly (`C jC tO bC jD bD eC`, spread ≤ 1e-7), and so do the non-zonohedra (`oC`, `cC`, `dA5`, `jP6`, spread ≤ 2e-7). The obstruction is for convex polyhedra; the scheme escapes it by degenerating (turn 0.00 on `dA5` and `jP6`, faces collapsing to segments) or by folding.
- **Faces can collapse**: `jsdJ29` turn 0.04, roundness 0.07. An affine-regular polygon is degenerate when `a` and `b` are parallel, and nothing in the scheme prevents it.
- **All-triangle graphs do not move** (`kkkD`: 2 rounds): every triangle is affine-regular.

## Adjustments and random starts (2026-10-21)

*Replaced on 2026-10-22 by one switch, Whiten (symmetric whitening, `whiten()` in `frame.js`), which commutes with rotations and so never breaks the symmetry; Face mean gives the same shapes with it, in fewer rounds ([../user-experience.md](../user-experience.md#2-one-whiten-switch-instead-of-three-done-symmetrically)). Old links still replay with the three adjustments. The findings below were made with them.*

The page can apply, after every round, centre, orthogonalise (Gram–Schmidt on the x, y, z columns: a shear) and normalise (each centred column scaled to the mean spread of the three), and can start from random points (`js/frame.js`). All three are affine maps, so they **commute with the affine-faces step** (owner's prediction, confirmed): every fixed point of affine faces stays one (`ozJ45`, `tttC` identical with and without).

- **But the combination has new resting points.** In a global collapse an affine round acts on the whole shape as a squash along one axis, and normalise undoes exactly that, so the combined round stands still at a shape whose faces are *not* affine-regular. Normalise prevents the global collapses (`dA5` turn 0.00 → 0.75, `jP6` 0.00 → 0.58), with faces bent by 0.1 edge lengths. It does not help local collapse (`jsdJ29` turn 0.04 → 0.07).
- **Symmetry survives all combinations** on these shapes (asymmetry ≤ 1e-11 after the run): the shapes are aligned with the axes, so Gram–Schmidt is nearly a no-op on them. On a shape whose spread is correlated in x, y, z, it shears and breaks the symmetry.
- **Random starts.** Random → affine settles to flat affine-regular faces without any symmetry: `ozJ45` with normalise gives a crumpled cluster of parallelograms (spread 0.000); `tI` without adjustments even comes out convex (edge ratio 2.6). Random → canonical gets tangled (`tI` 20,000 rounds, 83 reflex edges), as Hart's iteration needs a sensible start.
- With adjustments on, canonical and flat may never reach their tolerances; they then stop when nothing moves (`1e-8` per round), as the face optimizers do.

## Face mean (2026-10-21)

The third target: every copy of a face at the face's centroid, so the merge puts each vertex at the mean of its faces' centres (PolyOp's `move_to_face_centers`). One round is `X ← M X` with the face-mean matrix of [spectral.md](spectral.md), then centre and rescale: **power iteration**. With orthogonalise and normalise it is **subspace iteration** (Gram–Schmidt is the QR step), converging to the three strongest non-trivial eigenvectors, the spectral face-mean layout. `node tests/realize.mjs --mode mean --sym --flags on`.

- **Alone, it collapses** towards the strongest eigenvector: `P6`, `A5`, `U4` end as flat as a whole (planar 1e-23: the shape is a plane), `P6` degenerate (edge ratio 4·10⁷), `ozJ45` degenerate. Platonic solids are exact fixed points (2 rounds): their strongest eigenvalue is threefold.
- **Normalise alone suffices for shapes aligned with the axes**: `P6 A5 Y5 U4 J29` give convex, balanced shapes in 3–8 rounds (edge ratio 1.3–2.2, turn 0.86–1.00).
- **`ozJ45` needs orthogonalise too**: with normalise alone it is still degenerate after 23,316 rounds; with both it settles in 479 rounds (edge ratio 3.5, turn 0.49, 112 reflex edges). Without Gram–Schmidt all three columns drift towards the same eigenvector.
- **Faces need not be flat** (`tkD` 0.026, `jC` 0.12): an eigenvector layout is not a polyhedron with flat faces. Flat faces afterwards fixes that.
- PolyOp's observation that face-mean "gives a valid realization most often" fits: all the small seeds above come out convex.

## Per-face targets

What a "nice" face is decides everything. Implemented: flat, regular, star, affine. The others were dropped in the 2026-10-21 backlog audit (no observed problem behind them); the notes stay for reference.

| target | parameters per face | always reachable for every face at once? | status |
|---|---|---|---|
| **flat only** | — | yes (canonical is one solution) | regularity 0, or the Flat faces button |
| **regular** | centre, size, turn | no; only finitely many solids | Regular faces |
| **affine-regular** | centre + two vectors (an ellipse) | not convexly for non-zonohedral even-faced graphs; non-convexly it settles anyway | Affine faces |
| **star polygon** `{n/k}` | template `ζ^{kj}`, k from the pointedness | not from a convex start; from a stellated spectral start, yes on the uniform star polyhedra | Star faces |
| tangential | lines tangent to one circle | yes; canonical has it | dropped |
| equiangular | edge directions turn by 2π/n | not known | dropped |
| target size | regular, with size from the degree | no | dropped |

**Star polygon:** the regular target with `ζᵏ` replaced by `ζ^{kj}`, `gcd(k, n) = 1` (nozono.md §4, template view). Faces are wound the other way, so the result is a stellation.

**In the page (2026-10-21)** as the "Star faces" button with a pointedness field t (0 to ½, default 0.3): a face of n sides takes the star `{n/k}` with k nearest t·n among 1 and the valid stars, ties going to the more pointed (`starK` in `js/faces.js`). The owner could not choose between one k for all faces, this rule, and k per face orbit; this rule was the session's recommendation, since one k does nothing on most faces and per-orbit choice needs a face-picking UI first (it could be added on top). Regularity is always 1. With a spectral start the symmetry is kept and the uniform star polyhedra come out exactly ([spectral.md](spectral.md#findings-2026-10-21)). Rendering: star faces are drawn by the viewer's usual triangulation, which is not checked for self-intersecting polygons.

**Prototype (2026-10-21, scratch script, before the page had it):** the one-line template change in `regular()`, with k chosen per face size (`5:2` means pentagons become `{5/2}`).
- **k has to depend on the face**: a valid star needs `gcd(k, n) = 1` and `1 < k < n/2`, so triangles, squares and hexagons have none, pentagons and octagons have one (`{5/2}`, `{8/3}`), and heptagons have two (`{7/2}`, `{7/3}`). Any rule has to work per face size, or per face orbit: an automorphism keeps n, and it keeps k too, also when it reverses orientation. A different k on single faces of one orbit breaks the symmetry.
- **From the convex shape nothing happens**: a regular face has no content in Fourier mode k, so the fit is 0, every copy goes to the centroid, and the round is face mean, of which Platonic solids are fixed points (`D 5:2`: 5 rounds, spread 0.85, still the dodecahedron). A jitter of 0.05 does not get out (spread 0.85 after 180 rounds). So the convex shape is an attractor, not just an unstable fixed point.
- **From random starts, without symmetry, it finds the uniform star polyhedra exactly**: `D 5:2` gives the great stellated dodecahedron (seed 2: spread 0, edge ratio 1, all radii 1, 30 reflex edges), `tD 10:3` gives the great stellated truncated dodecahedron (`{10/3}` + triangles; 3 of 3 seeds). Other seeds end bent (`D 5:2` seeds 1 and 3: spread 0.10, planar 0.16), and `aD 5:2` gave non-uniform solutions (radii 0.92–1.07).
- **Why keeping the symmetry stops it**: the symmetry matrices are fitted to the convex shape, but the star solid realizes the same graph automorphisms by a different 3D representation, the Galois conjugate. Its coordinates lie in another eigenspace of the adjacency matrix: Rayleigh quotients of the x, y, z columns are √5 for the dodecahedron and −√5 for the great stellated one (`tD`: 2.83 against −0.47). So a symmetric star needs a start in that other eigenspace, which is the spectral optimizer's "browse eigenvector triples" ([spectral.md](spectral.md)), and the matrices fitted to that start.
- `I 3:2` is only the triangles turned over, so not a star; the great icosahedron has ordinary triangles as faces and a star only as its vertex figure, so no face target can reach it.

## Stellate: affine star faces (2026-10-22)

In the page as the "Stellate" button (owner's request: a stellation without browsing the spectral list). Affine faces with Fourier modes 0, ±k (k from `starK`) instead of 0, ±1, plus symmetric whitening every round: linear, so subspace iteration towards layouts with affine-star faces. The button shakes the shape first (0.1 edge lengths, seed 1), since an exactly convex face has no mode-k content; does not average over the symmetries, since the stellation shows them by other matrices than the start; and flips a mirror image (negative density). From the built shapes it reaches the same results as the prototype from random points: `D` density 7 (135 rounds), `tD` 13 (122), `tI` 7 (1,499), all flat, equal edges, `Ih`. From random starts it finds the great stellated dodecahedron (`D`), great stellated truncated dodecahedron (`tD`) and truncated great icosahedron (`tI`) with flat faces and equal edges, and flat stellations of `cD` (density 7) and `P5`; then Star faces finishes `A5` and `P5` exactly. Nothing happens from an exactly convex start (no mode-k content); no stellation where most faces have no star (`tkD`, `jD`). Full table and the proposed "Stellate" button: [../user-experience.md](../user-experience.md#5-stellate-affine-star-faces-prototyped-works).

## Equal edges and the mix (2026-10-22)

`node tests/realize.mjs --sym --max-it 20000 --mode … --weights …` on `tkD tttC ozJ45 jsdJ29 ckmU5` (some also `tttttD`):

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

- **Equal edges alone** gets every edge equal (ratio 1.0) and bends the faces (planar 0.02–1.1).
- **Flat + equal edges gives equilateral polyhedra with flat faces**: `tkD` comes out convex, exactly flat (6e-7) and equilateral, an equilateral Goldberg polyhedron, which no single button makes. `tttC` and `ozJ45` are flat and equilateral but fold (24 and 248 reflex edges), and `tttC` has a corner that goes straight (turn 0.00). `jsdJ29` does not settle.
- **Tangent + regular** is a canonical shape pulled towards regular faces: convex on `tkD`, `tttC`, `jsdJ29`, with `tttC`'s edge ratio 1.5 against canonical's 4.1, at the price of faces bent by 0.006–0.18. A goal-A-ish blend; Flat faces afterwards is the obvious next step (not measured).
- **Tangent + flat** matches canonical where canonical works (`tkD`, `tttC`, `jsdJ29`, `ozJ45` convex and flat), more slowly, since it has no momentum. It tangles on `ckmU5` like canonical ([canonical.md](canonical.md#failure-modes)), also from the Face mean start: the tangle is in the targets, not in Hart's step sizes.
- **Face mean + equal edges, whitened**, on `ckmU5`: edge ratio 7.3 against 23 for face mean alone, still no inward faces, faces bent 0.8.
- **Regular + flat at 1 : 1** is regular faces at 0.5, as the maths says (tested to 1e-6 in `tests/optimizers.mjs` at 0.4 : 0.6).

## Open questions

1. Do the inherent saddles at full regularity have a predictable layout, so they could become a design feature?
2. Which graphs does affine faces turn into clean, flat, non-convex shapes like `ozJ45`, and which into collapsed faces (`jsdJ29`, `dA5`)? All-quadrilateral graphs (anything ending in `o` or `j`) are the first family to try.
