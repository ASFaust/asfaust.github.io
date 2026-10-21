# Readable Realization: Optimizing Readability over Planes or Vertices

**Serves:** goal A (see [README.md](README.md)). **Status:** in the page as the "Readable" optimizer button, for simple and simplicial graphs; on other graphs it runs canonical instead. **Code:** `js/readable.js` (`Readable`, `readability()`), driven by `js/pipeline.js`; the standalone experiment `tests/planes.mjs` has the same loss without the corner tie-breaker, and knobs for τ, λ and the power.

## The idea

Optimize the [balance](README.md#balance) measures directly, edge ratio and corner turn within each face, in a parametrization where flatness cannot break:
- A **simple** polyhedron (every vertex of degree 3, which is what `t`, `z`, `dk`, `c` produce) is fixed by its face planes `{x : p_f·x = 1}`. Each vertex is where its three planes meet, `v = M⁻¹·(1,1,1)`. Moving the `p_f` keeps every face exactly flat.
- A **simplicial** one (all faces triangles: `k`, `n`, …) has flat faces whatever its vertices do, so its vertex positions are the variables.

Graphs that are neither (most strings ending in `a`, `j`, `g`, `p`, …) are not covered; on them the button runs canonical and says so.

## The loss and the solver

Per face f, with edges e and corners c (θ_c the turn, n the degree):

```
Σ |log ℓ_e − mean_f log ℓ|^4  +  10 Σ max(0, cos θ_c − cos(0.6·2π/n))² / (1 − cos(0.6·2π/n))²
                              + 0.001 Σ (cos θ_c − cos(2π/n))² / (1 − cos(2π/n))²
```

The first term asks for equal edges within each face; the second asks each corner to turn at least 0.6 of the regular turn; the third, a tie-breaker, asks the corners to be alike. Equal edges and equal corners together make a regular polygon, so where the graph leaves room, the faces come out as regular as possible.
- **Both terms are needed.** With the edge term alone, `tttC` reaches edge ratio 1.6 by straightening corners: turn 0.00, so corners vanish, which the definition forbids.
- **Power 4 rather than 2** puts the weight on the worst faces. On `tttttD`, power 2 gave edge ratio 4.3.
- **The tie-breaker is needed, and must stay weak.** Without it, `czD` (12 pentagons, 110 hexagons, all vertices of degree 3) got edge ratio 1.00 but turn 0.70: equal edges leave the hexagons free to be lopsided, and in renders some read as pentagons, which is exactly what readability is meant to prevent. Owner's report (2026-10-21): "czD is solvable with regular polygons, which detached faces manages, yet readable struggles". (Detached faces gets there only by bending faces, by 2% of an edge: three regular hexagons at a vertex make 360°, so a flat convex `czD` cannot have regular faces.) Sweep of the weight μ (edge ratio / turn):

  | μ | `czD` | `tttC` | `cccC` | `tktkI` | `tttttD` |
  |---|---|---|---|---|---|
  | 0 | 1.00 / 0.70 | 1.76 / 0.60 | 1.29 / 0.60 | 2.04 / 0.50 | 3.2 / 0.59 |
  | 0.001 | 1.12 / 0.92 | 1.83 / 0.60 | 1.29 / 0.60 | 2.03 / 0.50 | 3.36 / 0.59 |
  | 0.01 | 1.13 / 0.92 | 2.16 / 0.60 | 1.39 / 0.74 | 2.03 / 0.50 | 4.68 / 0.59 |
  | 0.1 | 1.14 / 0.92 | 2.74 / 0.77 | 1.46 / 0.75 | 2.02 / 0.50 | 6.66 / 0.59 |
  | canonical | 1.2 / 0.92 | 3.1 / 0.56 | 1.7 / 0.75 | 3.4 / 0.49 | 143 / 0.04 |

  0.001 fixes `czD` and costs almost nothing elsewhere: where the edge term can reach nearly zero, even a tiny preference decides; where readability is under strain, it hardly counts. Stronger weights fight readability where regular faces are impossible.
- **The turn weight (10) hardly matters** on the shapes tried: 10, 100 and 1000 give nearly the same `kkD` and `kkkD`, which are limited by convexity instead (below).

**Solver:** L-BFGS (memory 10), one iteration per round, with a backtracking line search that **refuses any step that leaves the convex polyhedra of this graph**:
- a vertex at infinity,
- a flipped edge (its direction against `p_a × p_b` changes sign),
- a corner turning the wrong way about its face's outward normal `p_f`,
- an inward face, or a reflex edge (a face centre above a neighbour's plane),
- (simplicial) a vertex whose face angles add up to 2π or more. Convex edges alone allow a surface that winds round a vertex several times; convex edges and convex vertices together make a closed surface convex (van Heijenoort).

The gradient through `v = M⁻¹·1` is `dL/dp_j = −v (column j of M⁻¹ · dL/dv)`.

**Start**, the first convex one of:
1. the shape as it is (the optimizers chain, so this is wherever the last one left it);
2. the operators' raw construction, without any relaxation (exactly convex and flat for truncations: cutting every vertex at 1/3 along its edges is a true plane cut). `tttttD` needs it: canonical is still tangled there after 60,000 rounds, and the shape as built (relaxed between operators) is not convex;
3. the canonical iteration from the shape as it is, tested every 100 rounds.

So on a non-convex shape (after regular faces, say) the readable optimizer jumps to the raw construction when that is convex.

**Symmetry:** every 50 rounds and at the end, the vertices are averaged over the automorphisms (`symmetrize()`), and for simple graphs the planes are refitted to the averaged faces. The L-BFGS memory is kept: the move is tiny. Without this, `tttttD` drifted 0.4% of its radius from its symmetry.

**Stopping:** when 100 rounds improve the loss by less than 0.1%, or the loss is below 1e-12 per face. The second rule is needed: a loss that heads to zero (equal edges reached, as on `czD` before the tie-breaker) never improves by a small fraction of itself, and the first rule alone ran 60,000 rounds. With a correct gradient it keeps creeping long after the shape stops changing visibly. On `tttttD`, edge ratio and turn after N rounds: 800: 3.73/0.58 (5 s), 1600: 3.59/0.59, 3200: 3.26, 6400: 3.13, 12800: 3.04 (73 s).

## Results (2026-10-21)

`node tests/realize.mjs --mode readable` (from the shape as built, with symmetry). After canonical, as in the page's default chain (`--mode canonical,readable`), the simple graphs end the same in fewer rounds; `kkkD` differs, at 5.5 / 0.31 against 3.6 / 0.20, because it starts from the converged canonical shape rather than one that has only just become convex. The `corner` column counts reflex corners; see "bugs found" below.

```
string        edges  rounds      ms   planar  inward reflex corner  edge×  fedge×  turn  round  size×  slope
tI               90       2      30  8.1e-16       0      0      0    1.0     1.0  1.00   1.00    1.0  -0.00
tttC            324     300     136  1.6e-14       0      0      0    2.0     1.8  0.60   0.84    1.4   0.10
gpD             750   14400    1756  1.1e-6       0      0      0    2.7     1.9  0.73   0.94    1.7      —
pgI             750   18450    2093  7.8e-7       0      0      0    2.3     1.6  0.63   0.95    1.7   0.47
cccC            768    1200     757  9.1e-15       0      0      0    1.8     1.3  0.60   0.98    1.8   1.10
tktkI          2430    2500    5029  2.9e-12       0      0      0    7.6     2.0  0.50   0.96    7.5   1.68
dkdkdkdkI      2430     700    1229  2.1e-12       0      0      0    7.0     2.0  0.50   0.96    7.0   1.62
tttttD         7290    4100   23220  1.6e-11       0      0      0    6.2     3.4  0.59   0.58    2.9   0.17
kkkD            810    1018     161  2.2e-15       0      0      0    6.4     3.6  0.20   0.27    1.2      —
jsdJ29          320    7350     343  3.0e-7       0      0      0    2.1     1.6  0.57   0.89    1.9      —
aoeU4           640   23300    2131  1.8e-7       0      0      0    4.8     1.8  0.81   0.95    4.8   1.45
czD             360      70     130  3.8e-15       0      0      0    1.1     1.1  0.92   1.00    1.1   0.42
zC               36     100      38  3.3e-16       0      0      0    1.0     1.0  1.00   1.00    1.0  -0.00
```

`gpD`, `pgI`, `jsdJ29` and `aoeU4` are neither simple nor simplicial: these are canonical. In the browser (SwiftShader headless Chrome) `tttttD` finishes after 6,800 rounds at edge ratio 3.1, turn 0.59.

- **`tttttD` is convex, flat and readable**: edge ratio 3.4, turn 0.59, against canonical's 143 and 0.04. Such a realization exists. In close-up renders the faces next to the 160-gons are smooth ovals, stretched into ellipses inside the wedges, where canonical has spiky 24-gons and kite-like 12-gons. The thin faces have not disappeared: at each end of an edge shared by two 160-gons sits a long triangle. The wedge's cost is spread out, not removed.
- **Better than canonical on every simple graph tried:** `tttC` 3.1 → 1.8, `cccC` 1.7 → 1.3, `tktkI` 3.4 → 2.0, `czD` 1.2 → 1.1 (edge ratio), with turns at or just above 0.5–0.6 (`czD` 0.92, as canonical). Regular-faced graphs come out regular (`tI`, `zC`). Sizes spread more (`tktkI` size× 7.2); the loss does not look at size, which is fine by the definition.
- **Simplicial graphs barely move** from their start, which is the canonical iteration at the round it first becomes convex (`kkD` 1.83/0.44 → 1.86/0.46, `kkkD` 3.61/0.20 → 3.60/0.20, `knD` 3.12/0.21 → 3.14/0.21). An earlier version of this file said `kkkD` gets *worse* on turn in the page (0.32 → 0.20); that compared against fully converged canonical, not against its start, and was wrong. Why they do not move, and why that is not worth fixing with more machinery: [below](#simplicial-graphs-a-rejected-fix-2026-10-21).
- **Speed:** a few hundred milliseconds on the small shapes; 23 s on `tttttD` in Node, though most of the improvement comes in the first 5–10 s and the page shows it live.

`tests/planes.mjs` (no symmetry, own stopping rule, up to 3,000 iterations) agrees: `tttC` 1.76/0.60, `tttttD` 3.29/0.58, `tktkI` 2.05/0.50 from canonical, `kD` 1.05/0.97.

## Simplicial graphs: a rejected fix (2026-10-21)

The backlog had "soft convexity" as the fix for simplicial graphs barely moving. It was tried and **removed** (owner's decision: it adds a force to patch a symptom, and the result was undesirable). Only the vertex angle-sum test (see the solver and the bugs below) was kept.

- **Why they stop.** Every simplicial run ends on a failed line search in which all 30 halvings are refused by the reflex-edge test: the optimizer has driven some edges to exactly flat (bend 0.0°), and the descent direction points out of the convex set.
- **What lies beyond.** A log barrier on nearly flat edges, `β Σ log(φ_ref/φ)²`, let L-BFGS slide along the boundary. The runs then converged reproducibly, and to **nearly flat shapes**: `knD` had 210 of 270 edges bent less than 0.5° (median 0.06°), `kkO` 84 of 108; kis apexes reached angle sums of 359.6–360°. In renders `kkO` became an octahedron-like solid made of flat triangulated patches: the kis pyramids gone. The worst faces traded edge ratio for turn (`knD` 3.1/0.21 → 4.4/0.32, `kkO` 3.3/0.26 → 4.1/0.37, `kkkD` 3.6/0.20 → 4.8/0.24). The owner rejected this outcome.
- **The lesson.** The loss looks at each face in its own plane and has no reason to keep a crease; for kis-type graphs its minima are flat. The convexity boundary was not blocking a good shape; it was stopping a bad one. A barrier that forces visible creases (quadratic, φ_ref 0.3–1 of a typical bend) was worse on readability (`kkkD` 4.1/0.05 or 5.6/0.32). So the readable loss is not the right objective for these graphs as it stands; making the solver stronger only reaches its unwanted minima faster.
- With the solver free, the turn weight λ moved results along a trade-off (λ = 1 → 1000: `knD` 2.0/0.00 → 15.9/0.47); none of `kkkD`, `knD`, `kkO` met both thresholds at any λ. The earlier finding "λ hardly matters" holds only for the stuck solver.

## Bugs found on the way (kept as warnings)

- **A simplicial polyhedron with convex edges can still be tangled.** In the rejected barrier experiment, `kkD` once reached edge ratio 1.53 and turn 0.84, which beats the [lower bound](#a-lower-bound-high-degree-vertices) (at a degree-12 vertex with turn ≥ 0.84, some triangle has an edge ratio of about 1.9). The shape covered the sphere 49 times: the degree-12 vertices had angle sums of 836°, 60 faces faced inward by `metrics()`'s test, yet every edge was convex, and `valid()`'s inward test (against the vertex mean) passed. The vertex angle-sum test now refuses this. A result that beats a proven bound is a bug until shown otherwise.

- **The mean in the edge term has a derivative.** For power 2 the deviations from the face mean sum to zero, so the mean's derivative drops out; for power 4 it does not (the cubes do not sum to zero). The first version left it out: its gradient was 2.6× too big on `kD` and pointed partly uphill on `tttttD`. L-BFGS still made progress, and the stalls looked like convexity trouble. The first numbers in this file (edge ratio 4.2 on `tttttD`) came from that version. Always check a new gradient against finite differences.
- **A start whose faces are not flat can cut into a tangled polyhedron.** The raw chamfer (`cccC`) has non-flat hexagons; cutting with their best-fit planes gave faces with corners turning −142°, which passed the inward-face and reflex-edge tests, and the edge-flip test took the tangled state as its reference. The corner test about `p_f` now refuses such starts, and `metrics()` counts reflex corners: detached faces on `tttttD` has 1,320.

## A lower bound: high-degree vertices

At a convex vertex the face angles add up to less than 360°. So at a vertex of degree d, some face has a corner angle below 360°/d. If that face is a triangle with every corner readable (turn ≥ 0.45 of 120°, so interior angles ≤ 126°), the law of sines gives

```
edge ratio ≥ sin 54° / sin(360°/d)
```

(the smallest angle sits opposite the shortest edge, and the best the other two can do is 126° and 54° − φ). For `kkD` (d = 12) that is 1.6; for `kkkD` (d = 24) 3.1; for `kkkkD` (d = 48) **6.2, so no convex realization of `kkkkD` is readable.** Each extra `k` doubles the degree of the old vertices, so the bound grows without limit. Goal A's readability cannot be met for every graph; the `tttttD` wedge has no such proof (and was met).

The bound covers triangles only. Larger faces with a small corner angle can keep their edges alike, but then their other corners must make up the turn; no bound is known for them.

## Open

- **Simplicial graphs** stay where their start leaves them. Do not add forces to the solver to move them (see [the rejected fix](#simplicial-graphs-a-rejected-fix-2026-10-21)); if this is revisited, it is a question of what the loss should ask for (something that values the crease the operator made), not of the solver.
- Dropped in the 2026-10-21 audit, as no observed problem stood behind them: graphs that are neither simple nor simplicial (on those, canonical's failures are on uneven seeds, which regular faces handles non-convexly), and speed (`tttttD` 23 s, shown live).
