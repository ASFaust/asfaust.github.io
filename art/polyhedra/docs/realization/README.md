# Realization: From a Graph to a Shape

> **Status:** framing doc for all optimizers. **Code:** `js/pipeline.js` (`OPTIMIZERS`, `Realization`, `Session`), `tests/lib.mjs` (`metrics`, `balance`). **Tests:** `tests/realize.mjs`. **Backlog:** A1, O1.

The operators produce only a **graph**: which vertices lie on which face, in which order. A **realization** assigns a 3D position to every vertex. This was the page's main open problem: the owner worked on it for months in PolyOp without finding a satisfying general method, and goal A is now mostly solved here. This file frames the problem; each optimizer family has its own file.

## Two goals: keep them apart

Ideas in this area tend to mix two goals that are often unrelated and sometimes in conflict. **Every experiment should say which one it serves.**

### Goal A: nice shapes
For *any* graph the page can produce, give a shape that is a faithful, good-looking picture of the polyhedron. *Mostly solved* (owner, 2026-10-23); the open cases are in the backlog (`A1`).
- **Hard requirements:** convex; flat faces; every symmetry of the graph realized as a rotation or reflection; deterministic; never fails or explodes.
- **Soft requirements:** **balanced**, every corner of every face can be seen, so that no hexagon reads as a pentagon ([Balance](#balance)); fast, seconds for up to about 10k edges in a browser worker.
- **Tools:** Canonical ([canonical.md](canonical.md)), the baseline that meets every hard requirement but is unbalanced on graphs with very unequal faces; Readable ([readable.md](readable.md)) for simple and simplicial graphs; Face mean with Whiten as a start when those tangle; Flat faces to finish.

### Goal B: artsy shapes
**Artsy means non-convex** (owner, 2026-10-23), with the symmetry kept. Allowed: non-convex shapes, slightly bent faces, stellations, self-intersections when they look good. Required: controllable (the chain, where each step is stopped, and the parameters decide the shape), stable (settles, does not flicker or explode), reproducible from the URL. Judged by eye; the taste is in `PolyOp/polyop_ref/` and in [../catalogue.md](../catalogue.md).

**What is known about artsy optimizers** (owner, 2026-10-23):
- **There is no single "artsy solver", and no continuum of them.** Each optimizer that makes non-convex shapes does it in its own way, specific to it, and new ones are hard to invent. The search for new artsy optimizers is mostly paused; the one experiment still wanted is the symmetry-only optimizer (`O1`, below).
- **Regular faces is the best so far.** Its non-convexity comes from *pressure between the faces*: there is not enough room for the regular faces, so the shape bulges in and out and makes symmetric creases, like the folds in the "turning a sphere inside out" video. The owner usually wants flat faces at the end, which often disagrees with what the regular pass settled on; hence the regular-then-flat chain. Some graphs have a non-convex realization with exactly regular faces and no convex one (`ebC`; the research is [../exploration.md](../exploration.md#x3-shapes-realizable-with-regular-faces-only-non-convexly)). Regular faces can have several separate resting points (`X6`).
- **Affine faces is close to Regular in spirit**, the exception to the rule above. It needs Whiten or it often collapses the whole shape, and even then some faces collapse to segments ([../exploration.md](../exploration.md#x5-which-graphs-give-affine-stars)).
- **Spectral starts** are the other source: the adjacency matrix often gives interesting non-convex starts, the face-mean matrix reliably good starts for goal A. The owner's explanation of why: [spectral.md](spectral.md#owners-observations).
- **Freedom instead of pressure** is the idea behind `O1`: start from random points and enforce only a symmetry group (or a subgroup), so non-convexity comes from the start, not from the faces pushing, and every start looks different. The owner expects it to look too messy alone, and wants to see it anyway, to learn what then needs forcing.

**O1 built 2026-10-24: Symmetric random** (Start from, URL `symmetric:seed[:group]`). Random points (`randomPositions`) averaged over a subgroup with the matrices of the shape as built (`project()` and `subgroup()` in `symmetry.js`), so the start is exactly symmetric under that subgroup and no more; the optimizers after it keep that subgroup (`Session.sub`), not the whole group. Subgroups: all, rotations only, round the most symmetric face, or vertex (the stabilizer), and their rotations. Tested in `tests/optimizers.mjs` (tI: Ih, I, C5v, C5, Cs, kept through Regular faces). Sheet of 36 renders: `jtJ37`, `tI`, `scnC` × all, rotations, face × seeds 3, 8 × (then Flat; then Regular, Flat). Findings:
- Then Flat: spiky, self-intersecting stars, as the owner expected; on `jtJ37` and `scnC` every seed looks different.
- Then Regular, Flat: crumpled, lumpy balls; the regular faces win and the start is mostly forgotten.
- Vertex-transitive shapes have little freedom: under the whole group `tI` has one vertex orbit with a mirror, so the start is already flat (0 rounds) and Regular brings back the truncated icosahedron. Smaller subgroups are needed there.
- A small subgroup can collapse: `tI` round a face (C5v), seed 3, then Flat, flattened into a single pentagon. Whiten would prevent that.
What would need forcing next, for the owner to judge: something against the long spikes (equal edges or a mix with a little Regular), and Whiten after small subgroups.
