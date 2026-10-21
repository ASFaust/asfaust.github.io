# Spectral Realizations

**Serves:**
- goal B: stellated and spiky shapes,
- possibly a starting point for goal A (see [README.md](README.md)).

**Status:** not implemented in the page. It existed in PolyOp (C++). **Prerequisite, done:** automorphisms ([../symmetry.md](../symmetry.md)).

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
5. **Page.** A "Spectral" realization mode with a stepper that browses the triples and shows each one's classification. The convex one can be the default. It can also seed canonical or detached faces.
6. **Tests.**
   - Platonic solids, prisms, antiprisms (the PolyOp failure case) and `tI` give convex shapes.
   - The icosahedron's stellated triple is found.
   - Record which matrix works for how much of the random suite.
