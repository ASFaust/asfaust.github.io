# Canonical Realization (Hart's Iteration)

> **Status:** implemented: the "Canonical" button (the default chain) and the "Flat faces" button (planar mode). **Code:** `js/canonical.js` (`Realizer`), driven by `js/pipeline.js`. **Tests:** `tests/realize.mjs`. **Backlog:** A1 (tangles on `ckmU5`), L1 (speed).

**Serves** goal A, as the baseline ([README.md](README.md#goal-a-nice-shapes)). Flat faces serves both goals: it is the usual last step of an artsy chain.

## Target

The canonical polyhedron (Koebe–Andreev–Thurston, normalized):
1. every edge touches the unit sphere,
2. every face is flat,
3. the edge tangent points have their centroid at the origin.

It exists for every polyhedral graph, is unique up to rotation, and shows all the graph's symmetries. Its faces each have an inscribed circle, where the face's plane cuts the sphere. Its dual is its polar reciprocal in the same sphere, and the operators use that fact (`dual` and `join` place new vertices at `c/|c|²`).

## The iteration

Each round, in this order:
1. **Tangentify:** for each edge `(a, b)`, let `t` be the point of the edge closest to the origin. Move both ends by `(TANGENT_RATE/2)·(1 − |t|)·t`. This is done edge by edge, in place.
2. **Recentre:** subtract the mean of all edge tangent points.
3. **Planarize:** for each face, take its Newell normal `n` and centroid `c`. Move each of its vertices by `PLANAR_RATE · n·(c − v) · n`. The moves are accumulated over all faces first, then applied.
4. **Momentum:** add `MOMENTUM ×` the previous round's total move. If this round's plain move (before momentum) was larger than the last one, drop the momentum first (adaptive restart).

The constants are `TANGENT_RATE = 0.2`, `PLANAR_RATE = 0.3` and `MOMENTUM = 0.75`. **Converged** means faces flat (`planar`) and edges on the sphere (`tangent`) within `1e-6`, checked every 50 rounds. The limit is 60,000 rounds.

### Two fixes to Hart's original, both needed
- **Clamp the tangent point to the edge segment.** Hart uses the closest point on the infinite *line* through the edge. For the apex of a very flat pyramid, as kis makes them, that point lies beyond the edge's end, inside the sphere. Pushing it out pushes the apex *further* out, and the apex runs away. This happened on `kdkdkI`, `tktkI` and every kis of many nearly flat faces. Clamping fixed all of them.
- **Momentum 0.75, not more.** Momentum cut the rounds 3–10×. At 0.9 it flips the thin kite quads that join makes (`jsdJ29`, `jopC`). At 0.75 the 60-string random suite converges with no failures.

### Supporting choices, outside this file
- **Relax after each operator** (`build()` in `pipeline.js`), to `1e-3` or 2,000 rounds. Without it, long strings start from degenerate geometry and fail: `pgI` and `cccC` diverged.
- **Join places its face vertices at the reciprocals `c/|c|²`, not at centroids.** On a canonical input each edge then crosses its dual edge on the sphere, and the new quads start flat. With centroids they start folded inward, and some never unfold.
- **The operators normalize** to mean edge-midpoint radius 1 (`prepare()` in `operators.js`), so that the reciprocals mean the right thing.

## Planar mode

The page's "Flat faces" button. The same class with `mode = 'planar'` runs only steps 3 and 4, from wherever the vertices are. The shape keeps the proportions the operators gave it, and the faces just flatten. This is good for the look of the construction: Johnson seeds stay regular-faced, and truncations keep their 1/3 cuts.

## Reference numbers

`node tests/realize.mjs --max-it 30000` (Node 22, one core). The table covers the final realization only; the build is not timed. Columns:
- **rounds**: rounds of the final realization.
- **planar**: `planarMax`.
- **edge×**: longest/shortest edge.
- **fedge×, turn**: balance as readability (worst edge ratio within a face, smallest relative corner turn); **round, size×, slope**: descriptive (least round face, face-size spread, size against degree). All defined in [README.md](README.md#balance). The table had `area×` until 2026-10-21; it is still in `metrics()`.

```
string        edges  rounds      ms   planar  inward reflex  edge×  fedge×  turn  round  size×  slope
tI               90       0       0  4.7e-16       0      0    1.0     1.0  1.00   1.00    1.0  -0.00
tttC            324   19800     847  9.5e-7       0      0    4.1     3.1  0.56   0.82    1.8   0.16
gpD             750   14400    1379  1.1e-6       0      0    2.7     1.9  0.73   0.94    1.7      —
pgI             750   18450    1672  7.8e-7       0      0    2.3     1.6  0.63   0.95    1.7   0.47
cccC            768   26750    2622  1.3e-6       0      0    2.4     1.7  0.75   0.99    2.4   1.83
tktkI          2430   30000    9008  4.8e-5       0      0   12.2     3.1  0.47   0.94    6.8   1.60
dkdkdkdkI      2430   30000    8915  6.1e-6       0      0   13.9     3.4  0.49   0.96   13.9   2.22
tttttD         7290   30000   26918  6.3e-3     600   1740  205.5   142.6  0.04   0.05    6.8   0.21
kkkD            810   30000    2753  2.0e-15       0      0    9.9     5.7  0.32   0.36    2.1      —
jsdJ29          320    7350     278  3.0e-7       0      0    2.1     1.6  0.57   0.89    1.9      —
aoeU4           640   23300    1751  1.8e-7       0      0    4.8     1.8  0.81   0.95    4.8   1.45
```

Reaching a visual tolerance (about 1e-4) takes far fewer rounds than reaching 1e-6. Most shapes look final after a few hundred to a few thousand rounds.

`tktkI` and `dkdkdkdkI` are the same graph (`dk = td`, `dt = kd`), so they have the same canonical shape, but their builds start it from different places. At 60,000 rounds: `tktkI` planar 2.2e-5, size× 9.5, slope 1.89; `dkdkdkdkI` planar 1.5e-6, size× 13.6, slope 2.19. The canonical shape of this graph is therefore about size× 14. The slow convergence runs *along* the balance direction: the triangles keep shrinking and the decagons keep growing for tens of thousands of rounds, and the unfinished shapes look more balanced than the true one.

## Failure modes

- **Unbalanced graphs.** In `tttttD` the 12 big faces (320-gons) grow and crush the 2,000-odd small faces into slivers. It has not converged even after 30,000 rounds, and the intermediate shape is non-convex (600 inward faces). The canonical shape itself is extreme: an area ratio of 10⁵ or more is the *correct* answer here. This is the clearest case of the gap between "canonical" and "balanced": round 0.05 at 30,000 rounds.
- **Big faces too big** (`tktkI`, `cccC`, `aoeU4`): the degree slope is 1.5–2.2, so faces of high degree are far bigger than regular ones would be, and faces of low degree far smaller. The canonical shape *is* this; it is not a convergence failure. It is not a balance failure either: every face stays readable (edge ratio ≤ 3.4).
- **Weird adapters** (`tttttD`): faces with edge ratio up to 143, where a face bridges the corner spacing of a 160-gon and that of the small faces. See [README.md](README.md#balance).
- **High-degree vertices** (`kkkD`): the faces stay flat (they are triangles), but tangency converges very slowly (stuck near `1e-4`). The triangles are slivers (round 0.36, edge ratio 5.7).
- **Pyramids** of six or more sides are tall spikes (`Y6`: round 0.54); the canonical shape is correct, just not pretty.
- **Tangled from the build: the trapezohedron family** (owner's example `ckmU5`, 2026-10-22). Canonical never converges and the shape is tangled at 60,000 rounds: `ckmU5` (300 triangles, 450 hexagons) 220 inward faces, 595 reflex edges, edge ratio 5,500; `cmU5` 44 inward. `mU5` and `kmU5` converge but are unbalanced (edge ratio 9 and 19). Starting canonical from Face mean with Whiten (then: all three old adjustments; it itself gives no inward faces, but faces bent by 1.1 edge lengths and 400 reflex edges) does not help: 362 inward. Readable fails the same way, since it needs a convex start and falls back to canonical. Not yet known whether the canonical iteration has a wrong fixed point here or only a bad basin; the build relaxes between operators, so the parent `kmU5` is already unbalanced. Only Face mean with Whiten (then Flat faces) gives something the owner calls usable. A goal-A test case: backlog `A1`.
- **Symmetry averaging hurts here:** about 2× slower and no fewer rounds. It is not used for this optimizer; see [../symmetry.md](../symmetry.md).

## Ideas

- **Project the velocity** onto the symmetric subspace too, so that symmetry averaging and momentum can coexist.
- **Precondition by face size** or vertex degree, to speed up the sluggish modes.
- **Exact methods.** The midsphere can also be computed through circle packings (Koebe). PolyOp's readme records that its circle-packing attempt was "a disappointment"; the reasons were not written down.
- **Better starting points:** spectral layouts ([spectral.md](spectral.md)), or the canonical shape of the parent, which is what happens now.
