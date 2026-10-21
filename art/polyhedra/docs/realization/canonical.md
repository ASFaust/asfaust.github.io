# Canonical Realization (Hart's Iteration)

**Serves:** goal A, as the baseline (see [README.md](README.md)). **Status:** implemented, the default mode. **Code:** `js/canonical.js` (`Realizer`), driven by `js/pipeline.js`.

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

The same class with `mode = 'planar'` runs only steps 3 and 4. The shape keeps the proportions the operators gave it, and the faces just flatten. This is good for the look of the construction: Johnson seeds stay regular-faced, and truncations keep their 1/3 cuts.

## Reference numbers

`node tests/realize.mjs --max-it 30000` (Node 22, one core). The table covers the final realization only; the build is not timed. Columns:
- **rounds**: rounds of the final realization.
- **planar**: `planarMax`.
- **edge×, area×**: longest/shortest edge, largest/smallest face.

```
string        edges  rounds      ms   planar  inward reflex  edge×   area×
tI               90       0       0  4.7e-16       0      0    1.0     1.5
tttC            324   19800     824  9.5e-7       0      0    4.1   511.5
gpD             750   14400    1308  1.1e-6       0      0    2.7     2.8
pgI             750   18450    1572  7.8e-7       0      0    2.3     2.9
cccC            768   26750    2492  1.3e-6       0      0    2.4    15.0
tktkI          2430   30000    8574  4.8e-5       0      0   12.2   821.1
dkdkdkdkI      2430   30000    8396  6.1e-6       0      0   13.9  3422.4
tttttD         7290   30000   26027  6.3e-3     600   1740  205.5 216381.0
kkkD            810   30000    2643  2.0e-15       0      0    9.9     4.4
jsdJ29          320    7350     263  3.0e-7       0      0    2.1     3.5
aoeU4           640   23300    1690  1.8e-7       0      0    4.8   255.5
```

Reaching a visual tolerance (about 1e-4) takes far fewer rounds than reaching 1e-6. Most shapes look final after a few hundred to a few thousand rounds.

## Failure modes

- **Unbalanced graphs.** In `tttttD` the 12 big faces (320-gons) grow and crush the 2,000-odd small faces into slivers. It has not converged even after 30,000 rounds, and the intermediate shape is non-convex (600 inward faces). The canonical shape itself is extreme: an area ratio of 10⁵ or more is the *correct* answer here. This is the clearest case of the gap between "canonical" and "balanced".
- **High-degree vertices** (`kkkD`): the faces stay flat (they are triangles), but tangency converges very slowly (stuck near `1e-4`).
- **Symmetry averaging hurts here:** about 2× slower and no fewer rounds. It is not offered in this mode; see [../symmetry.md](../symmetry.md).

## Ideas

- **Project the velocity** onto the symmetric subspace too, so that symmetry averaging and momentum can coexist.
- **Precondition by face size** or vertex degree, to speed up the sluggish modes.
- **Exact methods.** The midsphere can also be computed through circle packings (Koebe). PolyOp's readme records that its circle-packing attempt was "a disappointment"; the reasons were not written down.
- **Better starting points:** spectral layouts ([spectral.md](spectral.md)), or the canonical shape of the parent, which is what happens now.
