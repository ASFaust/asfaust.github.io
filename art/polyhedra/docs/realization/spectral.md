# Spectral Realizations

**Serves:**
- goal B: stellated and spiky shapes,
- possibly a starting point for goal A (see [README.md](README.md)).

**Status:** in the page as the "Spectral" init (2026-10-21) with a matrix dropdown (adjacency, Laplacian, vertex mean, face mean; owner's request) and a stepper over the starts, up to 1,500 vertices. **Code:** `js/spectral.js`; tests `tests/spectral.mjs`. The face-mean layout is also reachable by iteration: the "Face mean" optimizer with orthogonalise and normalise on ([regular-faces.md](regular-faces.md#face-mean-2026-10-21)). Not done: characters and isotypic types, a self-intersection check. It existed in PolyOp (C++). **Prerequisite, done:** automorphisms ([../symmetry.md](../symmetry.md)).

## The implementation (2026-10-21)

- **Matrices** (`graphMatrix`): adjacency A; Laplacian D − A, given to the solver as A − D so that the smoothest eigenvectors are again the largest (the note shows the eigenvalues of D − A); vertex mean D⁻¹A and face mean D⁻¹B (`B_ij = Σ_{f ∋ i,j} 1/|f|`) through the similar symmetric D^{-1/2} M D^{1/2}, the eigenvectors mapped back by D^{-1/2}, so PolyOp's lower-triangle bug does not arise. The mapping keeps the layouts exactly symmetric (a symmetry keeps degrees), and within an irreducible eigenspace Schur's lemma keeps the columns orthogonal and equally long. Adjacency, Laplacian and vertex mean have the same eigenvectors on graphs with one vertex degree; face mean depends on the faces and differs even there (`P6`: 1 start against 4).
- **Starts** (`spectralStarts`): whole eigenspaces of the chosen matrix, so every start is exactly symmetric: each 3-dimensional eigenspace, each 2-dimensional one with each 1-dimensional one, and triples of the six strongest 1-dimensional ones (for groups without 2- or 3-dimensional representations). The top eigenspace (Perron vector, trivial representation) is skipped. A start is kept if the fitted matrices are all different (the representation is faithful), none is singular, and no two vertices coincide. Each is centred, its columns scaled to equal spread, mirrored to positive density. Candidates are tried smoothest first (by the mean of the three eigenvalues), and the list stops at 100 starts or 3,000 candidates: on graphs with little symmetry the pairs run into the thousands (`zcmJ17`: 72,493 faithful starts, which first made the survey time out).
- **Density**: the signed solid angles of the faces (fans from the face centroids) over 4π. Integer for flat faces; 1 for convex, 7 for the great stellated dodecahedron. It is the label that tells stellations apart: `metrics()` counts a star polyhedron as convex (reflex 0, inward 0, as on the great stellated truncated dodecahedron), because its dihedral angles are locally convex.
- **Symmetry after a spectral start is kept**: the worker sets `symmetric`, and `symmetrize()` refits its matrices to the current positions every time, so it keeps the start's own representation, not the convex one's.
- **Solver.** First version: dense EISPACK tred2 + tql2 (all eigenvectors), 1.4 s at 512 vertices (`cccC`), 3.7 s at 960 (`cctI`); the owner found it far too slow. Now `SymmetricEigen`: Householder reduction along rows (lower triangle only, reflections kept), eigenvalues by QL without vectors (O(n²), at most 60 iterations each; tql2 had no cap), and eigenvectors only for the eigenspaces a start uses, by inverse iteration on the tridiagonal matrix (LAPACK's dgttrf/dgttrs, orthogonalised within a cluster) and back through the reflections, O(n²) each. All starts: `cccC` 0.24 s, `cctI` 0.85 s, `cccD` (1,280 vertices) 1.9 s, about half of it the reduction. Residual and orthogonality 1e-15, also on the multiple eigenvalues of `D`. The cap is 1,500 vertices; beyond that a sparse method (Lanczos with the symmetry) would be needed.

## Findings (2026-10-21)

`node tests/spectral.mjs` and its listing mode (`node tests/spectral.mjs D tI P6 …`).
- **The first start is convex on symmetric, mostly vertex-transitive shapes**: Platonic solids, `P6 A5 Y5 tI aC sC` (also `D` and `I`, where both starts are exact uniform solids), with every matrix.
- **But not in general.** On the 56 random strings of `randomStrings(60)` under 1,500 vertices (scratch survey, all four matrices), counting a start as convex when no edge is reflex and no face points inward (faces need not be flat: an eigenvector layout has flat faces only where the symmetry forces them; `cT`, `pC`, `gC` never do):

  | matrix | first start convex | some start convex | a flat stellation in the list | no start |
  |---|---|---|---|---|
  | Laplacian | 30 | 37 | 51 | 1 |
  | adjacency | 29 | 35 | 51 | 1 |
  | vertex mean | 27 | 34 | 47 | 5 |
  | face mean | 26 | 32 | 46 | 4 |

  With flat faces required, only 8–10 first starts are convex. The matrices are close; face mean is last, not first as in PolyOp (whose solver read only the lower triangle of the non-symmetric matrix). Shapes with little symmetry (Johnson-seed strings, groups of order 8–16) almost never get a convex start; `ajaO` (Oh) has none in any matrix. `eY6` has no start at all (likely its faithful 2-dimensional eigenspace merges with another eigenvalue, making a 4-dimensional space, which is skipped). Spectral is a source of symmetric stellated starts, not a convex realizer. For the icosahedron the convex one is +√5 and the great icosahedron −√5; for the dodecahedron the great stellated dodecahedron is −√5. So the "Galois conjugate" hypothesis below holds for these two.
- **Stellations are common**: densities seen 1, 7, 11, 13, 17, 19, 31, 37, 43, 47 (`tD`, `sD`, `gD`). On non-uniform graphs (`gD`) the stellated starts have bent faces (planar 0.05–0.6).
- **Star faces from a stellated start gives the uniform star polyhedra exactly, with the symmetry kept**: `D` → great stellated dodecahedron, `aD` → great icosidodecahedron, `tI` → truncated great icosahedron, `tC` → stellated truncated hexahedron (all density 7), `tD` → great stellated truncated dodecahedron (13), `sD` → great snub icosidodecahedron (7) and great retrosnub icosidodecahedron (37). Spread below 1e-7, all edges equal, all vertices on one sphere ([regular-faces.md](regular-faces.md#per-face-targets)).
- **A favourite from the first start** (owner, 2026-10-22): `ocA6`, spectral start 1 (adjacency, 2 + 1 eigenspaces, density 1, faces bent 0.18), then Flat faces (50 rounds): a non-convex shape with 228 reflex edges and every face convex, "concave detail with small protruding pyramids inset". The smoothest layout is often not convex, and Flat faces keeps its folds. [../user-experience.md](../user-experience.md#owners-favourites).
- **Mirrored duplicates**: some starts optimize to a convex shape turned inside out (density −1, every edge reflex; `tI` start 3) or to a mirror image of another stellation (−7). Harmless, but the list could be shortened by dropping them.

## Idea

Take an n×n matrix built from the graph and three of its eigenvectors `u, v, w`, and place vertex `i` at `(u_i, v_i, w_i)`. For many graphs, the right three eigenvectors give a valid convex realization directly, without iteration. For others they give a stellated version, or something degenerate.

## What PolyOp did (for reference)

`PolyOp/src/Polyhedron/Polyhedron.cpp` → `get_matrix(type)`, and `Position_Operations.cpp` → `realize_spectral(mat, indices)`:
- **adjacency**: `A_ij = 1` for neighbours.
- **laplacian**: `A − D`, with negative degrees on the diagonal. The readme says it is "broken"; the cause was not recorded.
- **face_mean**: `M_ij = Σ_{f ∋ i, j} 1 / (deg(i) · |f|)`. Row i averages the centroids of i's faces, so `M x` is "move each vertex to the mean of its face centres". It is the matrix behind `move_to_face_centers`, and **the one that worked best**.
- **vertex_mean**: `M_ij = 1/deg(i)` for neighbours, i.e. `D⁻¹A`.
- The eigenvectors are taken at indices `n−2, n−3, n−4` of the ascending eigenvalues: the three largest after the top one, which is the constant vector for the mean matrices.
- PolyOp's seeds were made this way (`include/shapes.h`). Pyramids and prisms worked directly from face-mean. **Antiprisms had to be realized through their centre-triangulated version** (kis on the caps), with the positions then copied back; that was a known failure case.

**Important caveat for any reimplementation.** Eigen's `SelfAdjointEigenSolver` reads only the lower triangle, but face-mean and vertex-mean are *not symmetric*: they are row-normalized. So PolyOp's results came from the lower triangle mirrored, not from the true matrix. A faithful version should either use the similar symmetric matrix (for `D⁻¹A`, that is `D^{-1/2} A D^{-1/2}`, with eigenvectors mapped back by `D^{-1/2}`), or solve the non-symmetric problem. Expect results to differ from PolyOp's.

## Owner's observations

- Face-mean gives a valid realization most often, adjacency sometimes.
- **Multiplicity is not the test.** The hexagonal prism realizes correctly from eigenvectors of *two different* eigenvalues: a 2-dimensional eigenspace (the hexagons) and a 1-dimensional one (the axis).
- **Stellations appear in the spectrum.** Other eigenvector triples give stellated versions of the same graph, with faces realized as star polygons or wound the wrong way.

## Hypotheses

- **Representation theory.** Any matrix built from the graph commutes with the automorphism group's permutation action. So its eigenspaces carry representations of the group (or of a larger group, when eigenvalues coincide by accident). A realization showing all symmetries is a **faithful 3-dimensional representation**, realized by orthogonal matrices. Prediction: a triple of eigenvectors works only if it spans such a representation.
  - irreducible for the Platonic solids (one 3-dim eigenspace),
  - 2 + 1 for prisms: the rotation about the axis acts in 2D, and the axis flip acts in 1D.

  This explains the hexagonal prism, and suggests choosing eigenvectors by their isotypic component rather than by index.
- **Stellations as Galois conjugates.** For the icosahedron, mapping `√5 ↦ −√5` sends its coordinates to those of the great icosahedron, the same graph realized as a stellation. Eigenvalues of integer matrices are algebraic numbers. Conjugating the convex realization's eigenvalue may be exactly what picks out the stellated eigenspace. Test on the icosahedron, dodecahedron and `tI` first.
- **Convex form is extremal.** For the mean matrices, the second-largest eigenspace is the "smoothest" non-trivial layout, as in spectral graph drawing. The convex realization should come from the smoothest faithful 3-dimensional representation, and the stellated ones from rougher ones.

## Checking a candidate realization

All of these are cheap, and the page needs them anyway:
- **flat faces**: the planarity residual (`metrics().planarMax` in `tests/lib.mjs`),
- **consistent winding**: all face normals outward, `inward = 0`,
- **convexity**: no reflex edges; equivalently, every vertex lies on the inner side of every face plane,
- **no coincident vertices**, and no zero-area faces,
- **no self-intersections**: the expensive one; needed only for goal B, to tell stellations from garbage.

## Implementation plan

1. **Eigen-solver in JS.**
   - Small graphs (up to ~2,000 vertices): Jacobi or QR on the dense symmetric matrix, in the worker.
   - Larger ones: the matrices are sparse, so use Lanczos or subspace iteration for the top k eigenpairs.
   - No library is vendored yet; a small one might be acceptable, but nothing needs a build step.
2. **Matrices.** Adjacency, the symmetrized face-mean (`D^{-1/2}`-similarity) and vertex-mean, and a proper Laplacian `D − A` (use its *smallest* non-zero eigenvalues).
3. **Grouping.** Group eigenvalues into eigenspaces (with a tolerance), and label each with its dimension. Later, use the automorphisms to compute characters, and so the isotypic type.
4. **Search.** Enumerate the candidate triples (3-dimensional eigenspaces, 2+1 combinations, 1+1+1), run the checks, and classify each as convex, stellated or degenerate.
5. **Page.** A "Spectral" optimizer button with a stepper that browses the triples and shows each one's classification. The convex one can be the default. It can also seed canonical or detached faces.
6. **Tests.**
   - Platonic solids, prisms, antiprisms (the PolyOp failure case) and `tI` give convex shapes.
   - The icosahedron's stellated triple is found.
   - Record which matrix works for how much of the random suite.
