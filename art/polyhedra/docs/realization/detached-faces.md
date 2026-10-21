# Detached-Faces Realization

**Serves:**
- goal B now: it makes interesting, often non-convex shapes,
- goal A potentially, with the right per-face target (see [README.md](README.md)).

**Status:** implemented with one target (similarity-regular), experimental. **Code:** `js/faces.js` (`FaceRelaxer`), driven by `js/pipeline.js`. Page mode: "Detached faces", with Regularity, Stiffness and "Keep the symmetry" controls.

**Origin:** the owner's optimizer from PolyOp, the one that worked best for them. It is not in the PolyOp repository. The error weighting ("stiffness") was the owner's later idea, first tried here.

## The scheme

It is alternating projections: one projection per face, then a reconciliation. Each round:
1. **Detach:** every face gets its own copy of its vertices.
2. **Per-face target:** move each face's copies towards a nicer version of that face, independently of all other faces.
3. **Merge:** each vertex goes to the mean of its copies.
4. **Normalize:** centroid at the origin, mean vertex radius 1. Without this the shape drifts or shrinks.
5. **Weights for the next round:** `w_v = 1 + stiffness · spread_v / mean spread`, where `spread_v` is the mean distance of `v`'s copies from its merged position.

Starting point: the build relaxes canonically after *every* operator in this mode, the last one included, so it starts from a near-canonical shape. **Settled** means no vertex moved more than `1e-8` (relative) in a round; the limit is 60,000 rounds. The page's error figure is the largest spread, in mean edge lengths.

[nozono.md](nozono.md) §5 describes the same structure in the owner's notation, with the affine-regular projection `P_F` as step 2.

## The current per-face target: similarity-regular

For a face with corners `z_k` (complex coordinates in the face's plane, k in face order) and weights `w_k`, fit the regular polygon `m + a·ζᵏ`, with `ζ = e^{2πi/n}`. The complex numbers `m` (centre) and `a` (size and turn) come from weighted least squares, which gives a 2×2 complex system:

```
W m + S a = Z0          W  = Σ w_k        S  = Σ w_k ζᵏ
conj(S) m + W a = Z1    Z0 = Σ w_k z_k    Z1 = Σ w_k z_k conj(ζᵏ)
```

The plane comes from the Newell normal through the weighted centroid. The new copy is `flat + regularity·(fit − flat)`, where `flat` is the corner projected onto the plane. At regularity 0 the step only flattens faces; at 1 it replaces them by regular polygons.

**The centre must be solved jointly with `a`.** The first version used the weighted centroid of the corners as `m`. With unequal weights that biases the fit, and even `eC` went non-convex once stiffness was on. With the joint solve, higher stiffness never made things worse in the tests.

## Findings

All at regularity 1, with stiffness 2 unless stated. Numbers are from `node tests/realize.mjs --mode faces [--sym] --max-it 20000 …`.

```
without symmetry                                     with symmetry averaging (every 10 rounds)
string   rounds   ms  planar  reflex  edge× area×    rounds   ms  planar  reflex  edge× area×
tttC        171   37  1.7e-1      0    1.5  286        67   37  1.7e-1      0    1.5  286
gpD       20000 4144  1.5e-1    285    2.5  4.1       487  139  8.0e-2      0    1.8  1.9
pgI        1903  356  3.8e-2    420    1.9  2.6       758  190  3.8e-2    420    1.9  2.6
tktkI      3743 2357  6.5e-2    210    5.9  615      3672 3513  6.5e-2    210    5.9  615
jsdJ29     1591  128  8.6e-2    144    1.8  2.7      1505  127  8.6e-2    144    1.8  2.7
aoeU4     20000 3118  9.3e-2    116    2.6   63      7520 1218  7.6e-2    144    2.2   49
```

- **Symmetry averaging helps a lot here.** `gpD` goes from never settling and bumpy to settling in 487 rounds, convex. The list overall runs 2× faster. It is on by default in this mode.
- **Faces are not flat at full regularity:** `planarMax` is 0.04–0.17 edge lengths. This is the residual tension the owner described: regular faces cannot all fit, so the error ends up as bending.
- **Edge and area ratios are much more balanced than canonical's:** `tttC` area× is 286, against 512 for canonical, and edge× is 1.5 against 4.1. On `tttttD` the small faces stay round, where canonical makes slivers.
- **Stiffness helps only a little.** On `tttttD`, the worst spread falls from 0.88 (stiffness 0) to 0.66 (4) and 0.64 (16) edge lengths. The 360 inward faces stay, and the look barely changes. A regular 320-gon whose edges have the length of the triangle edges is simply huge, and no weighting changes that.
- **Non-convexity is inherent at full regularity** wherever the regular corner angles at a vertex add up to 360° or more. In `tttttD`, triangles meet 96- and 320-gons, so those vertices must become saddles.

## Per-face targets

What a "nice" face is decides everything. The candidates, with what is known:

| target | parameters per face | always reachable for every face at once? | notes |
|---|---|---|---|
| **flat only** | — | yes (canonical is one solution) | regularity 0 |
| **similarity-regular** (current) | centre, size, turn | no; only finitely many solids | causes the tension above |
| **affine-regular** | centre + two vectors (an ellipse) | no; zonohedron obstruction for all-even faces | [nozono.md](nozono.md). Linear: an orthogonal projection onto Fourier modes 0, ±1 |
| **tangential** (has an incircle) | lines tangent to one circle | yes; canonical has it | from a canonical start it does nothing on its own; useful in mixtures |
| **equiangular** | edge directions turn by 2π/n; free lengths | not known | lets big faces have long and short sides |
| **target size** | regular, with size from the degree | no | addresses the "big faces" problem directly |
| **star polygon** `{n/k}` | template `ζ^{kj}` | — | deliberate stellation, goal B |

How to implement each:
- **Affine-regular:** fit `z_k ≈ m + a ζᵏ + b ζ^{-k}`, which adds the Fourier mode −1. Unweighted, it is nozono's `P_F` (`c + a cos θ_k + b sin θ_k`). Weighted, it is a 3×3 complex least-squares system. Triangles are always affine-regular, so they cost nothing. Expect leftover tension on even-faced graphs that are not zonohedral, by the zonohedron argument.
- **Tangential:**
  1. Fit a circle to the face's edge *lines*: centre `o` and radius `r`, minimizing `Σ w (dist(o, L_k) − r)²`.
  2. Shift each line along its normal until it touches the circle.
  3. Take consecutive line intersections as the new corners, with a fallback for nearly parallel neighbours.

  Different faces may end up with circles on different spheres, so this target allows more than the canonical shapes.
- **Equiangular:**
  1. Fit the turn `φ` from `Σ e_k ζ^{-k}`, where the `e_k` are the edge vectors.
  2. Set the lengths `ℓ_k = max(0, Re(e_k e^{-i(φ+2πk/n)}))`.
  3. Project the `ℓ` onto the closure condition `Σ ℓ_k ζᵏ = 0`.
  4. Rebuild the corners around the centroid.
- **Target size:** the regular fit with `|a|` set from a target inradius or area. For instance, the area a regular n-gon would have at the global mean edge length, scaled by a "how much bigger may big faces be" exponent.
- **Mixtures:**
  - by degree: regular for small faces, tangential or flat for large ones,
  - by role: different targets per orbit or per tag, which is also a goal-B design dial.

## Solver variants to try

- **Damped merge:** `x ← x + λ(mean − x)`, with λ < 1 for stability or λ > 1 for speed.
- **Dykstra's corrections.** Plain alternating projections converge to *a* point of the intersection when one exists, and oscillate between the sets when none exists. Dykstra converges to the *projection* onto the intersection, when it is non-empty.
- **Weighting by face degree:** let big faces pull less, or more, in the merge (step 3). This tests the "big faces are heavy" intuition directly.
- **Momentum with restart**, as in canonical (not tried here yet).
- **Convexity projection** after the merge, optional.
- **Ramped regularity** (goal B): raise regularity from 0 to 1 over time, so tension builds gradually.

## Open questions

1. Is there a per-face target (or mix) for which the scheme reliably settles to a **convex, flat, balanced** shape? That would be a goal-A solver that beats canonical on balance.
2. Do the inherent saddles at full regularity have a predictable layout, so they could become a design feature (goal B)?
3. Why does stiffness do so little? Is the spread concentrated on a few vertices, or spread evenly? A histogram would tell.
