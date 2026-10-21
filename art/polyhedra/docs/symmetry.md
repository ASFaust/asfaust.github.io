# Symmetry: Automorphisms, Matrices, Point Groups

**Status:** implemented. **Code:** `js/symmetry.js`, used by `js/worker.js`, `js/pipeline.js` and the viewer's orbit colouring. **Tests:** `node tests/symmetry.mjs [-v]`.

## Relation between graph and shape

Every symmetry of a realized polyhedron permutes its vertices, and that permutation is a **graph automorphism**. Conversely, the canonical polyhedron realizes every automorphism as an isometry (Mani). In matrix form, with `X` the 3×n position matrix and `P_σ` the permutation matrix: `R_σ X = X P_σ`, where `R_σ` is orthogonal, with det +1 for rotations and −1 for reflections.

## Finding the automorphisms

An automorphism of a 3-connected planar graph is determined by:
- the image of one half-edge, and
- whether it keeps or reverses orientation.

The search (`automorphisms(P, T)`):
1. **Pick `h0`.** Give each half-edge a signature: the degrees of its two end vertices and of its two faces. Choose the half-edge `h0` whose signature is rarest.
2. **Try each candidate.** For every half-edge `c` with the matching signature (vertex degrees swapped for orientation-reversing maps), set `h0 ↦ c` and grow the map depth-first along `next` and `twin`:
   - orientation kept: `next(a) ↦ next(b)`,
   - orientation reversed: `next(a) ↦ prev(b)`.

   In both cases `twin(a) ↦ twin(b)`. A clash (two half-edges mapped to one, or one mapped to two) rejects the candidate.
3. **Read off the permutations.** Vertices: `from(a) ↦ from(b)` when orientation is kept, `from(a) ↦ to(b)` when reversed. Faces: `face(a) ↦ face(b)`.
4. **Face orbits** come from a union-find over all the face permutations.

The identity comes first in `maps`. **Cost:** at most one O(E) growth per candidate. 120 automorphisms of a 2,430-edge shape take 15 ms. Memory is one vertex permutation per automorphism.

## Matrices and averaging

- `fitMatrices(pos, maps)`:
  1. For each automorphism, solve `R = (Σ y xᵀ)(Σ x xᵀ)⁻¹` around the vertex centroid, with `y_i = x_φ(i)`.
  2. Make `R` orthogonal by Newton's polar iteration, `R ← (R + R⁻ᵀ)/2`.
- `symmetrize(pos, maps)`: `x_i ← (1/|G|) Σ_σ R_σᵀ x_φσ(i)`. This is the orthogonal projection onto symmetric shapes for the fitted `R`s. From a disturbed shape, each pass squares the error, because the `R`s are refitted; 3 passes get below 1e-9 (what the test checks).
- In a realization (`pipeline.js`), `symmetrize` runs every 10 rounds when "keep the symmetry" is on, and only in detached-faces mode:
  - in detached faces it makes everything settle much sooner ([realization/detached-faces.md](realization/detached-faces.md)),
  - in canonical it made things about 2× slower, with no fewer rounds ([realization/canonical.md](realization/canonical.md)). The likely cause is that the momentum velocity no longer matches the projected positions.

## Naming the point group

`pointGroup(Rs)` gives the Schoenflies symbol:
1. Split the matrices into proper ones (det > 0, with order from the rotation angle) and improper ones: inversion (trace −3) and mirrors (trace 1, normal = the eigenvector for −1).
2. Classify the rotation subgroup by its size N and largest order: I (60), O (24, with 4-fold axes), T (12, with eight 3-fold elements), else C_N or D_{N/2}.
3. Add the improper elements:
   - T becomes Td or Th (inversion),
   - O becomes Oh, I becomes Ih,
   - C_n becomes C_nh (a mirror perpendicular to the main axis), C_nv (other mirrors) or S_2n (neither),
   - C_1 becomes Cs or Ci,
   - D_n becomes D_nh (a horizontal mirror) or D_nd.

The matrices come from the shape *as built* (positions after the build, before the final realization). The operators and the relaxation keep symmetric shapes symmetric to within numerical noise, so that is enough.

**Checked** (in `tests/symmetry.mjs`): Platonic, `tT tI sC sD gC pC gpD`, prisms, antiprisms, pyramids, cupolae, 9 Johnson solids, `k4P5 t3U3 gP5 k4gP5 gY4`.

**Surprise:** `gY4` (gyro of the square pyramid) has 16 automorphisms (D4d), not 4: its graph has a symmetry swapping the apex end with the base end.

## In the page

- **Stats line:** "Ih, 120 symmetries".
- **Colouring:** "Symmetry orbit", one colour per face orbit.
- **Realization:** the "Keep the symmetry" checkbox (detached faces only).

## Open

- **Subgroups.** Enforce only some of the symmetries, for example the rotations only, or a stabilizer, as a design dial for controlled symmetry breaking (goal B). This needs the group's multiplication table, or generating a subgroup from chosen elements.
- **Velocity projection** for canonical + symmetry (see above).
- **Vertex and edge orbits.** For colouring and for the edge ink; the vertex orbits are already implicit in `maps`.
- **Characters and isotypic decomposition.** For the spectral approach ([realization/spectral.md](realization/spectral.md)): split eigenspaces by how the group acts on them.
- **Camera presets** that look down a 2-, 3- or 5-fold axis (from `fitMatrices`).
