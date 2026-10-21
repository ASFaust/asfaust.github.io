# Conway Polyhedra: Backlog

What is done, what is open, and what to try next on the polyhedra page (`art/polyhedra/`). There are four tracks:
1. Realization: getting the graph back into space.
2. Symmetry: graph automorphisms.
3. Spectral realizations.
4. Artsy rendering.

Tracks 1–3 feed each other, and track 4 is mostly independent. The math for the affine-regular face projection is in [nozono.md](nozono.md).

---

## 0. Where things stand (2026-10-21)

**Done (v1)**
- Seeds: Platonic solids, `Pn An Yn Un`, and 35 Johnson solids. Each is built from coordinates by a convex hull (`seeds.js`, `hull.js`).
- Operators on a half-edge structure (`mesh.js`, `operators.js`): `d a t k j g p c r`, the composites `e o b m n z s`, and the degree-selective `tₙ kₙ`. Faces and vertices carry origin tags.
- Notation parser with a size estimate and a cap of 120k edges (`notation.js`).
- Realizations, run in a worker (`worker.js`), with the last one shown live:
  - **Canonical** (`canonical.js`): Hart's iteration with two fixes. The tangent point is clamped to the edge segment, otherwise flat kis apexes run away. Momentum is 0.75 with restart, since 0.9 flips join quads. The shape is relaxed after every operator.
  - **Detached faces** (`faces.js`): detach, fit each face to a regular polygon by weighted least squares, merge by averaging, and give extra weight to vertices whose copies disagree.
  - **Flat faces only**, and **as built**.
- Viewer (`viewer.js`, three.js r170 vendored): solid, glass and frame styles. Edges are painted flat on the faces, with the width in world units. Faces can be coloured by origin, by number of sides, or in one colour. There is an OKLCh palette, an environment map, and PNG export up to 8192, plus OBJ and STL.

**Known problems**
- Canonical converges slowly on shapes with very unequal faces (`tttttD`, `kkkD`). The big faces act "heavy".
- Detached faces at full regularity never settles on some chiral shapes (`gpD`), and its results are often non-convex.

**Done (2026-10-21, second pass)**
- Test harness in `tests/` (§1.6).
- Automorphisms, point-group names, orbit colouring and "keep symmetry" (§2).
- Artsy quick wins (§4): GTAO ambient occlusion, matte/glossy/metal/iridescent materials, palette presets with editable swatches, orbit colouring.

---

## 1. Realization (the optimizer track)

*Meant to be handed to a separate agent as a self-contained brief.*

### 1.1 The core problem
- The operators fix only the graph.
- Steinitz guarantees a convex realization exists, and Koebe–Andreev–Thurston picks the canonical one (midsphere). It always exists, but it can be extreme: in `tttttD` the 12 big faces crowd the small ones into slivers.
- The number of solids with regular faces is finite, while Conway strings are infinite. So any energy of the form "every face regular" has **no zero for most graphs**.
- A residual tension always remains, and it usually destroys planarity too. The aim is a **good compromise**, not an exact solution.

### 1.2 Current detached-faces scheme (`js/faces.js`)
Each round:
1. Detach the faces: every face gets its own copy of its vertices.
2. Fit each face separately: the best regular n-gon `m + a·ζᵏ`, by **joint** weighted least squares for the centre `m` and the size/turn `a`.
3. Blend: `copy = flat + regularity · (fit − flat)`.
4. Merge: each vertex goes to the mean of its copies.
5. Normalize: centre at the origin, mean radius 1.
6. Update the weights: `w = 1 + stiffness · spread / mean spread`.

Two lessons so far:
- **A centre taken as the weighted centroid of the corners biases the fit.** Even `eC` went non-convex until centre and size/turn were solved together.
- **Stiffness helps only a little.** On `tttttD`, raising it from 0 to 8 lowers the worst disagreement from 0.88 to 0.65 edge lengths, and the look barely changes. A regular 320-gon whose edges have the length of the triangle edges is simply huge.

### 1.3 What "nice" could mean per face (ideas to try)
- **Affine-regular faces** ([nozono.md](nozono.md) §3–5). Project each face onto the Fourier modes `0, ±1`: `y_j = c + a cos θ_j + b sin θ_j`.
  - This is a linear, rank-3, coplanar projection `P_F`, and it is the limit of the midpoint iteration.
  - In `faces.js` it is a one-term extension: the current fit keeps only the mode `+1`, which is similarity-regular; adding the `−1` mode makes it affine-regular.
  - **Prediction:** a convex polyhedron with all faces centrally symmetric is a zonohedron. So all-even-faced graphs that are not zonohedral have no fixed point; expect residual tension there.
  - Triangles are always affine-regular, so they cost nothing.
- **Tangential faces** (an inscribed circle per face). These exist for *every* graph, through the midsphere, so the canonical form is the exact solution of this energy. A per-face "make tangential" step is a natural detached-faces variant that can actually converge.
- **Equal angles**, with edge lengths left free.
- **Target size per face**: an inscribed radius or an area derived from the degree, so big faces cannot dominate.
- **Mixtures**: affine-regular for small faces, tangential or just flat for large ones (by degree, or by the face's share of the area).
- Projections onto **star polygons** `{n/k}` instead of the convex `k = 1` (nozono §4) give deliberately stellated faces, which links to §3 and the artsy track.

### 1.4 Solver ideas
- **Alternating projections**, which is the current structure: project each face, then reconcile. Variants to try:
  - weighted merge,
  - averaging with relaxation (`x ← x + λ(mean − x)`),
  - Dykstra's corrections, so the iteration converges to the projection onto the intersection when one exists,
  - momentum with restart, as in `canonical.js`.
- **Big faces are "heavy"**: they move slowly. Possible fixes:
  - scale each face's pull by `1/degree`,
  - multigrid: realize a coarse version first, then refine,
  - start from canonical, which is what happens now, or from spectral (§3).
- **Symmetry projection** (§2): average over the automorphism group after every step. This removes drift, and probably speeds up and stabilizes every scheme above.
- **Blending modes**: canonical → detached faces with regularity ramping from 0 to 1. Tension then appears gradually, which is also an artsy dial.
- **Convexity:** report it (count of inward faces, dihedral angles), and optionally enforce it as a constraint.

### 1.5 Metrics to report for every run
- Planarity residual (max and mean).
- Per-vertex spread between copies.
- Convexity: inward faces and reflex dihedrals.
- Edge-length ratio (max/min), and area ratio of the largest to the smallest face.
- Rounds and time to settle.

### 1.6 Test harness (`tests/`, done)
Plain Node scripts that import the page's modules. The build-and-realize steps live in `js/pipeline.js`, shared by the worker and the tests, so the tests measure what the page runs.
- `node tests/topology.mjs`:
  - censuses of all Platonic, Archimedean and Catalan solids and 35 Johnson solids, plus more,
  - validity of 200 random strings,
  - V/E/F matching the size estimate (exact without degree numbers, an upper bound with them),
  - `dd` and `rr` leaving the census unchanged.
- `node tests/symmetry.mjs [-v]`:
  - automorphism counts and point-group names for 36 shapes,
  - "symmetrize makes the shape exactly invariant",
  - timing on a big shape.
- `node tests/realize.mjs [--mode canonical|faces|planar] [--sym] [--random N] [--max-it N] [--regularity x] [--stiffness x] [strings…]`: the benchmark, printing the §1.5 metrics. With no strings it runs the fixed list `tI tttC gpD pgI cccC tktkI dkdkdkdkI tttttD kkkD jsdJ29 aoeU4`.
- `node tests/screenshot.mjs <url> <out.png> [waitMs] [js…]`: headless Chrome over CDP, with software WebGL. Serve `repo/` first (`python3 -m http.server 8765`).

**Findings from the first benchmark runs**
- Canonical to 1e-6 takes 7k–27k rounds. tktkI, dkdkdkdkI, tttttD and kkkD do not get there within 30k rounds.
- "Keep symmetry" **hurts** canonical: about 2× slower, and no fewer rounds. It probably breaks the momentum: the velocity no longer matches the projected positions. It is not offered there. Projecting the velocity too might fix this.
- "Keep symmetry" **helps** detached faces a lot:
  - gpD: 20,000 rounds without settling and 285 reflex edges → 487 rounds, convex,
  - aoeU4: 20,000 rounds → 7,520,
  - the fixed list overall: 10.1 s → 5.2 s.
  
  It is on by default there.

---

## 2. Symmetry (the group-theory track)

**Idea.** Every symmetry of a realization corresponds to an automorphism of the graph: `R · X = X · P_σ`, where `X` is the 3×n matrix of positions and `P_σ` a permutation matrix.

**Done:** `js/symmetry.js` covers:
- the automorphism search, from one half-edge, with or without a flip,
- face orbits,
- least-squares matrices with a polar (orthogonalizing) step,
- `symmetrize`, which needs about 3 passes from a disturbed shape, since each pass squares the error,
- Schoenflies naming,
- the stats line and orbit colouring in the page,
- "keep symmetry" for detached faces.

It is fast: 120 automorphisms of a 2,430-edge shape in 15 ms. Note that the gyro'd square pyramid `gY4` has 16 automorphisms (D4d), not 4. Still open: choosing a subgroup, and camera presets down symmetry axes.

- **Compute the automorphism group.**
  - For 3-connected planar graphs, an automorphism is fixed by the image of one flag. That gives at most 4E candidates, each checked in O(E), and it is easy on the half-edge structure: map a half-edge to a half-edge, then propagate along `next` and `twin`, with or without reversing orientation.
  - The C++ version has a first try in `PolyOp/src/Polyhedron/automorphism.cpp`.
- **Matching rotations:** fit `R_σ` by Procrustes of `X` against `X P_σ`.
- **Symmetric optimizer:** after each step, `X ← (1/|G|) Σ R_σ⁻¹ X P_σ`. This keeps the symmetry exactly and removes drift (see §1.4).
- **Choosing a subgroup** to enforce gives a controlled loss of symmetry, which is a design dial.
- **Colour by symmetry orbit**: faces, or vertex and edge orbits, coloured by orbit (see §4).
- **Display:** the symmetry group's name (`Ih`, `Oh`, `D5d`, …), shown in the stats.
- **Links to §3:** the eigenspaces of any matrix that commutes with the group's permutation action are representations of the group.

---

## 3. Spectral realizations

**Observation.** For many graphs, three eigenvectors of a graph matrix already give a valid realization, one eigenvector per coordinate. The face-mean matrix works most often, the adjacency matrix sometimes.

- **When does it work?**
  - Multiplicity alone is not the test. The hexagonal prism realizes from two different eigenvalues: a 2-dim one for the hexagons and a 1-dim one for the axis.
  - Hypothesis: the three eigenvectors must carry a **faithful 3-dim representation** of the automorphism group (§2). That splits as 2 + 1 for prisms and is irreducible for the Platonic solids.
- **Stellations live in the spectrum.**
  - Some eigenvector triples give stellated versions.
  - Catalogue, per graph, which eigenvalue triples are convex, stellated or degenerate.
  - Check for Galois conjugation: for the icosahedron, `√5 ↦ −√5` maps it to the great icosahedron.
  - Links to the star-polygon templates in nozono §4.
- **Detecting a valid realization:**
  - convexity,
  - planarity residual,
  - consistent winding,
  - no self-intersections,
  - no coincident vertices.
- **Matrices to compare:** adjacency, face-mean (the energy minimum of "move to the face centres"), vertex-mean, Laplacian (broken in C++), and weighted variants.
- **Page feature:** a "Spectral" realization mode that steps through eigenvalue triples and shows convex, stellated and degenerate realizations side by side. This is also a seed for §1 and an art source for §4 (`Figure_10.png`, `Figure_11.png` look like this).

---

## 4. Artsy rendering

The reference renders from Blender are in `PolyOp/polyop_ref/`. Each item below names the one it aims at.

### 4.1 Lighting and materials

**Done:**
- GTAO (three.js `GTAOPass`, vendored with its dependencies under `vendor/addons/` and loaded through an import map). Solid style only; exports keep transparency.
- MeshPhysicalMaterial with four looks: matte, glossy (clearcoat), metal, and iridescent (metalness 0.85, so the thin film colours the whole reflection).

AO barely shows on convex shapes. It pays off on non-convex ones: detached faces now, stellations and tubes later.

- **Ambient occlusion**: three.js `SSAOPass` or `GTAOPass` for live viewing. For exports, bake per-vertex AO by ray casting in a worker, which is sharper and costs no screen space. *Refs:* `aafgsd.png`, `untitled.png`.
- **Fake subsurface scattering**, for an organic, candy-like look: wrap lighting (`max(0, (N·L + w)/(1 + w))`), a tinted rim or back light, a thickness term from AO or an inverted-normal pass, and MeshPhysicalMaterial `sheen` and `transmission` as cheaper approximations. *Ref:* `Figure_6.png`.
- **Metallic palettes**: metalness 1 with a stronger environment map, palettes like gold, copper, gunmetal and chrome. *Ref:* `Figure_9.png`, glossy black.
- **Iridescent palettes**: MeshPhysicalMaterial `iridescence`, `iridescenceIOR` and `iridescenceThicknessRange`, built into three.js. Or a thin-film hue shift by view angle in the shader. *Ref:* `unsstitled.png`, rainbow tubes.
- **Glass**: the existing style, upgraded to `transmission` with a rough backdrop. *Ref:* `Figure_7.png`.
- **Glow lines on dark**: emissive edges with a bloom pass. *Refs:* `ref.jpg`, `untitlettzd.png`.
- **Staging**: a backdrop or floor with a soft contact shadow, depth of field, and studio lighting presets. *Refs:* `Figure_6.png`, `Figure_9.png`, `hfgdhfgjd.png`.

### 4.2 Colouring

**Done:**
- orbit colouring,
- palette presets: generated, pastel, earth, ocean, ember, mono, metals, pearl,
- editable swatches: editing one switches to "custom", which is stored in the URL as `pal=custom&pc=…`; + and − add or remove colours.

Still to do: per-face painting.

- **By symmetry orbit** (needs §2). Faces in the same orbit share a colour, which is the most "mathematical" colouring.
- **Editable palettes**: a list of swatches that the tags or orbits index into, with presets (pastel, earth, metallic, iridescent, monochrome ramp) and colours stored in the URL.
- **Per-face painting**: click a face to set its colour. Options: paint the whole orbit, or just that one face. Overrides are stored in the URL, compressed. Needs a raycaster and a face id per triangle; the face fan already maps triangles to faces.
- Existing: by origin, by number of sides, one colour.

### 4.3 Geometry styles (topology passes for rendering)
- **Wireframe + subdivide** gives organic tubes: thicken each edge into a quad tube around the faces, with each face becoming a hole with an inset rim, then Catmull–Clark subdivide. *Refs:* `hfgdhfgjd.png`, `unsstitled.png`. Equivalent in Conway terms: an inset/"loft" on all faces, delete the inner faces, solidify, subdivide.
- **Detached face tiles**: `detach_faces(scale, move, thickness, pyramidal)` from the C++ version, faces as separate prisms or pyramids. *Ref:* `untitled.png`.
- **Smooth-shaded subdivision** of non-convex realizations gives folded, crumpled, pleated looks. *Refs:* `Screenshot … 16-20-56.png`, `fig5.jpg`, `untitled4.png`.
- **Stellated / spiky** realizations from §3, and star-polygon faces from §1.3. *Refs:* `Figure_10.png`, `Figure_11.png`.
- `scrape_off(t)`: a continuous morph from truncate to ambo, from the C++ version.
- Stopping canonicalization early, or adding noise and relaxing.
- Spherical projection, and per-face extrusion and insets.

### 4.4 Viewer polish
- Turntable GIF or WebM export.
- Camera presets that look down a symmetry axis (needs §2).
- An optional orthographic camera. A small field of view works for now.

---

## Suggested order
1. ~~Test harness (§1.6).~~ Done.
2. ~~Automorphisms (§2).~~ Done; subgroups still open.
3. ~~Artsy quick wins.~~ Done; fake SSS, staging and per-face painting still open.
4. Optimizer track (§1.3–1.4), handed to a separate agent with this file as the brief.
5. Spectral mode (§3).
6. Heavier geometry styles: wireframe + subdivide, detached tiles.
