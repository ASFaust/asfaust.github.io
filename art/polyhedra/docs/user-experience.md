# User Experience: How the Owner Uses the Optimizers

How the owner actually uses the Realization panel, what gets in the way, and what they asked for. Read this before changing the optimizer UI. Proposals here are a session's suggestions until the owner decides; decisions go into [README.md](README.md#decisions-and-their-reasons).

## The two workflows (owner, 2026-10-22)

The owner presses optimizer buttons with one of two aims: make the shape **nice** (goal A in spirit) or make it **interesting** (goal B). See [realization/README.md](realization/README.md#two-goals-keep-them-apart).

**Nice:**
1. Canonical or Readable often works, but not always.
2. If not: first run Face mean with Centre + Orthogonalise + Normalise, to get a good starting position. Then Canonical and Readable often work.
3. If they still do not: Flat faces at the end gives a quite nice result.

Example where only step 2's Face mean + adjustments works (owner): `ckmU5`. Canonical and Readable both end tangled there, also from the Face mean start ([canonical.md](realization/canonical.md#failure-modes)).

**Interesting:**
- Flat faces directly, or several of the spectral inits.
- Most often: Regular faces first, sometimes with Centre + Orthogonalise + Normalise, which sometimes gives different results (the solids are then sometimes not "rigid"). Then Flat faces. It does not always work, but sometimes gives good results.
- Sometimes Affine faces instead; that works less often.
- Star faces does not produce anything interesting on its own. It was a session's idea.

## Pain points and requests (owner, 2026-10-22)

1. **The chain fills with steps that undo each other.** Pressing several buttons in a row is the normal way to use the page, and many of the steps cancel out. Keeping all of them in the URL is wasteful but is what makes a link replay. The owner's guesses: a background algorithm that finds which steps can be dropped (and reruns the optimization to check), or a Share button that does this.
2. **Centre + Orthogonalise + Normalise are only needed for some optimizers, and then always all three.** Fuse them into one checkbox.
3. **Expose "keep the symmetry" as a global checkbox.** Some optimizers average over the automorphisms to stay symmetric. (A symmetry checkbox existed and was removed on 2026-10-21; the owner now wants it back, as a global switch.)
4. **The spectral number field is horrible on mobile**: mobile browsers show no up/down arrows on number fields.
5. **An explicit stellation optimizer**: like Face mean (which is subspace iteration to the three strongest eigenvectors) but with different maths, so that it converges to a stellated version. Without browsing the spectral list for one.
6. **An "equalize edge lengths" optimizer.**
7. **Combined optimizers with weights.** From years of experiments in code: applying several losses at once sometimes gives interesting, different results, for example "regular and flat" or "face mean and equal edges". Maybe a "make your own optimizer" section, if it can stay simple and responsive, with fast application and iteration.

The owner likes the "button mashing" style and wants to keep it.

## Proposals (session, 2026-10-22), and what was built

All seven were built on 2026-10-22, after the owner's decisions below. Each section ends with a **Built** note saying where it differs from the proposal.

### 1. Undo, and a tidy link for sharing

Two parts. The first stops waste where it starts, the second cleans up what is left.

- **Clickable history.** The "Applied:" line becomes a list of steps; clicking one goes back to the shape after it and drops the later steps. The main thread keeps the positions after every step (a `Float32Array` per step, cheap), so going back is instant and needs no replay. Trying something and not liking it then costs nothing in the chain.
- **Share button: prune by replay.** Clicking it starts a hidden worker that looks for a shorter chain giving the same shape, then copies the link:
  1. Shortest suffix first: replay init + the last j steps, for j = 1, 2, …, and stop at the first that matches. Converged optimizers forget most of their start, so often only the last one or two steps matter. Canonical has a unique result, so anything before a converged canonical step goes.
  2. Then try dropping each remaining step on its own (greedy, earliest first).
  3. "Matches": the same shape up to rotation and scale (orthogonal Procrustes), within 1e-3 of the size. The pruned link then replays to a shape that looks the same, not to the same bits. Each candidate replays from the cached positions of the step before it, so a candidate costs only the steps after the dropped one.
  - Steps stopped part-way (`@340`) are kept unless dropping them passes the check like any other.

**Built:** the "Steps" list under the Mix (a button per step, the current one outlined, the running one dashed); the worker keeps the state after every finished step (`states` in `worker.js`), so going back needs no replay. "Share link" stops a running step, then `prune()` (`pipeline.js`) in a second worker, then copies the link (on touch screens it opens the system share sheet). The address bar keeps the full chain; only the copied link is pruned. Examples (`tests/optimizers.mjs` and a scratch run): `tkD` regular, mean/w, affine, regular, flat → regular, flat (5 replays, 0.5 s); `cD` random, regular, stellate, star → stellate, star (Stellate forgets its start); `ozJ45` canonical, regular, canonical, affine → canonical, affine (10 s); `ckmU5` canonical@300, mean/w, flat → mean/w, flat (35 s: flat runs long on it). The note shows "trying chain n" while it works. Positions in the link were not built.
- **Considered and not recommended as the main mechanism: positions in the link.** With the symmetry, only one vertex per orbit and the generators' matrices would be needed, which is tiny; but an asymmetric shape (after Random, or with symmetry off) needs every vertex, about 8 characters per vertex after compression, too long to share for big shapes. It could be a fallback when pruning finds nothing.

### 2. One "Whiten" switch instead of three, done symmetrically

Replace Centre, Orthogonalise and Normalise by one checkbox. Do it as **symmetric (ZCA) whitening**, `X ← X C^{-1/2}` scaled to keep the size, with `C` the 3×3 covariance of the centred positions, instead of Gram–Schmidt in the order x, y, z. ZCA commutes with rotations, so it never breaks the symmetry; Gram–Schmidt shears whenever the coordinates are correlated, which is why it was found to break the symmetry on unaligned shapes ([regular-faces.md](realization/regular-faces.md#adjustments-and-random-starts-2026-10-21)). For subspace iteration (Face mean, and the stellation below) only the span of the three columns matters, so ZCA works as well as Gram–Schmidt. Old links (`/con`, `/n`, …) still parse; new ones write one letter.

**Built:** `whiten()` in `frame.js`, the "Whiten" switch (`/w`). Old links still replay with the old adjustments, exactly. Face mean with whiten gives the same shapes as with all three old adjustments on `ckmU5 tkD P6 A5 U4 ozJ45 jsdJ29 cC` (identical metrics), in fewer rounds (`ozJ45` 479 → 165, `jsdJ29` 352 → 94), and keeps the symmetry of a shape turned off the axes (`tests/optimizers.mjs`).

### 3. Global "Keep symmetry" switch

Today the worker keeps the symmetry after every init except Random. A checkbox makes it the user's choice. Off: the face optimizers no longer average over the automorphisms, so rounding errors can grow into asymmetric shapes, which is probably what the owner sees as "not rigid". It goes into each step of the URL like the adjustments.

**Built:** the "Keep symmetry" switch, `/a` in the URL when off. It affects the face optimizers, the mix, readable and shake; canonical and flat keep the symmetry by themselves and never averaged.

### 4. Spectral stepper for touch

Replace the number field by `−` and `+` buttons around the number (or a "next layout" button). The number stays editable.

**Built:** a "Spectral layout ‹ n › of N" row under the Spectral button; the count shows once the starts are computed.

### 5. Stellate: affine star faces (prototyped, works)

The maths: Face mean projects each face onto Fourier mode 0 (its centroid); Affine faces onto modes 0 and ±1 (an ellipse polygon). Project onto modes 0 and **±k** instead, with k from the same pointedness rule as Star faces (`starK`): each face becomes the affine image of the star polygon `{n/k}`. Merge as usual. This is a **linear** map of the positions, an average of projections, so with whitening every round it is subspace iteration converging to the layouts whose faces are closest to affine stars: the stellation. A shape whose faces are all exactly affine stars (the great stellated dodecahedron) has the largest possible eigenvalue, 1, so it is found whenever it exists.

Prototype (2026-10-22, scratch script: the step above with ZCA whitening every round, from random points, then Star faces):

| shape | affine star from random | then Star faces |
|---|---|---|
| `D` | density ±7, faces flat (1e-9), all edges equal: the great stellated dodecahedron | already exact |
| `tD` | density ±13, flat, edges equal: the great stellated truncated dodecahedron | already exact |
| `tI` | density 7, flat, edges equal: the truncated great icosahedron | already exact |
| `cD` | density ±7, flat (1e-8), edge ratio 1.7 | regular stars bend faces (0.19) |
| `P5` | density ±2, flat: a pentagrammic prism | edges equal, exact |
| `A5` | density 0 or 1, edge ratio 4 | density 3, exact: a pentagrammic crossed antiprism |
| `gD` | density 37, faces bent 0.03 | edges equal, faces bent 0.05 |
| `aD`, `sD`, `jD` | density −1 to 1, not a clean stellation | bent, density ±2 or ±3 |
| `tkD` | no stellation (density ±1, faces bent 0.04) | same |

- **It needs a start that is not exactly convex.** A convex face has no content in mode k, so from the built shape nothing happens (`D`, `aD`, `P5`: 1–2 rounds, unchanged), as with Star faces. The button should start from a fixed seeded random perturbation, so it stays deterministic. The result came out symmetric anyway on `D`, `tD`, `tI` (the top eigenspace is one irreducible 3-dimensional space).
- **Mirror images**: half the seeds give density −7 or −13; flip the shape when the density is negative, as the spectral starts do.
- **Where it fails**: graphs whose faces mostly have no star (hexagons, squares, triangles: `tkD`, `jD`) have nothing to stellate with; Face mean behaviour remains.
- **Star faces becomes useful as the follow-up**: Stellate, then Star faces, gives exact uniform star polyhedra from a button press, without the spectral list. Proposal: a "Stellate" button next to Star faces, sharing its pointedness field.

**Built:** the "Stellate" button (target `'stellate'` in `faces.js`); it shakes the shape by 0.1 edge lengths from seed 1, whitens every round, does not average over the symmetries, and turns a mirror image (negative density) the right way out. Its note says how often the result winds round its centre. From the built shapes: `D` density 7 in 135 rounds, `tD` 13 in 122, `tI` 7 in 1,499, all exact and `Ih`; `cD` 7 (flat, edge ratio 1.7), `P5` 2, `A5` 2 (then Star faces: 3, exact), `gD` 37 (bent 0.03); `aD`, `tkD`, `I` no stellation. Details: [realization/regular-faces.md](realization/regular-faces.md#stellate-affine-star-faces-2026-10-22).

### 6. Equal edges

The same detach-and-merge scheme over edges instead of faces: each edge gets its own copy of its two ends, scaled about its midpoint to the mean edge length; each vertex goes to the mean of its copies. On its own it bends faces; mixed with Flat it gives "flat with equal edges" (next section).

**Built:** the "Equal edges" button and the `'edges'` target. Findings in [realization/regular-faces.md](realization/regular-faces.md#equal-edges-and-the-mix-2026-10-22).

### 7. Mix your own optimizer

All the detach-and-merge optimizers have the same form: per element (face or edge), a target position for each corner; each vertex goes to the mean of its targets. Mixing them is a **weighted mean of the targets**: `x_v = Σ_t w_t Σ_{copies} q / Σ_t w_t count_t(v)`. That is the method of averaged projections, gradient descent on `Σ_t w_t · dist²(X, target set t)`, so the weights mean "how much each loss counts" and the mix settles where they balance.

- **Ingredients**: Flat (face plane), Regular, Star, Affine, Face mean, Stellate (affine star), Equal edges, Sphere (every vertex to the unit sphere, an old backlog idea). Not Canonical (Hart's iteration has a different form; its edge-tangency step could become an ingredient later) and not Readable (L-BFGS with constraints).
- **Ingredient: Tangent edges** (canonical's edge step as a per-edge target: move each edge so its point nearest the centre lies on the unit sphere). Then "tangent + regular" is a canonical shape pulled towards regular faces, a goal-A-ish blend the single buttons cannot make.
- **UI (revised 2026-10-22)**: a collapsed "Mix" section. Only the ingredients in use are shown, each as a slider row with a remove ×; a row of chips adds one (weight 1). Eight sliders at once would crowd a phone; a mix rarely uses more than three. Then one "Mix" button. Whiten and Keep symmetry are the global switches.
- **Live weights**: the mix keeps running while a slider moves and switches to the new weights from where the shape is, so dragging a slider morphs the shape. The step is recorded once, on release, with the weights it ended on; earlier stretches go into the chain as stopped steps, and Share prunes them.
- **The single buttons stay** as one-click optimizers with their own labels, but run through the mixer code (Regular faces = Regular 1). A "Mix from here" link fills the sliders from the last button used. One engine, two ways in.
- **URL**: `mix:flat=1;edges=0.5/w` or similar.

**Built:** `FaceRelaxer` takes `weights`; the single face buttons are one target at weight 1 and give bit-for-bit the results they gave before (benchmark diff empty). The Mix section has the chips, sliders 0–1 and ×, the "Mix" button and "From the last step" (regular α → regular α + flat 1 − α, which is exactly the same round; canonical → tangent + flat; readable has no counterpart). Pointedness for star and stellate in a mix comes from the Star faces field. URL: `mix:regular=1+flat=0.5+pt=0.25/w`. **Differs from the sketch:** a weight changes on release, not while dragging; each release runs a new mix step from where the shape is, and the step before stays in the chain, stopped where it was, so the chain still replays exactly. Live dragging would need the chain to record a path it cannot replay. Findings: [realization/regular-faces.md](realization/regular-faces.md#equal-edges-and-the-mix-2026-10-22).

### 8. Shake (session's suggestion)

**Built:** the "Shake" button, `shake:seed` in the URL, 0.1 mean edge lengths; with the symmetry kept the noise is symmetrized three times (one pass leaves about 1e-5, since the matrices are fitted to the shaken shape).

A button that moves every vertex by a small seeded random amount (a few percent of the edge length), without breaking the symmetry when Keep symmetry is on (the noise averaged over the automorphisms) or breaking it when off. Uses: getting off an exact fixed point (Star faces from a convex shape; Stellate does it internally), testing whether a settled shape is stable or only balanced, and the "add noise and relax a little" idea from [realization/README.md](realization/README.md#artsy-deformations-small-ideas-no-file-yet).

## Decisions (owner, 2026-10-22)

1. **Share may return a rotated shape**: "the shape is the artifact, not the view". The pruned chain must give the same shape up to rotation and scale.
2. **Whiten is one global switch.**
3. **Stellate is its own button.**
4. **Build the mixer**, after the rest. The design above (chips, live weights, buttons kept on the same engine) is the session's; the owner has not commented on it yet.

## Order of work (done 2026-10-22)

1. Whiten (ZCA) + Keep symmetry switches, the touch stepper. Small; changes the URL format (old links keep parsing).
2. Clickable history with cached positions; Share with pruning.
3. A general detach-and-merge engine with weighted targets over faces and edges; Stellate and Equal edges as buttons on it; the existing face buttons moved onto it (results must stay identical: `tests/realize.mjs`).
4. The Mix section; Shake.
