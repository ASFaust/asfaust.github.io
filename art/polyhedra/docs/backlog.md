# Backlog

The only task list. Every item has an ID, says why it exists, where to start, and when it is done; the knowledge behind it lives in the linked doc. To work on an item, read [README.md](README.md) first, then the item, then its linked section.

When you finish an item: move it to *Done* with the date and one line; put the findings, including negative results, in the linked doc; fix anything stale you noticed. When the owner raises something new, add it here with an ID in the right track, and the details in a topic doc.

**Tracks, in the owner's order of priority (2026-10-23):** Rendering (R) is the next big task. Examples (U1) is done. Exploration (X) is a separate research project. Optimizers (O) are mostly paused. Goal A (A) and low priority (L) are leftovers.

## Rendering (R): [rendering.md](rendering.md)

Suggested start: R21 (the owner tests RT; R20 and R22 are in), then R1 once the owner has confirmed the looks.

| ID | item | done when |
|---|---|---|
| R1 | **Looks instead of materials × palettes × styles.** A Look choice: the owner kept all nine candidates (2026-10-24) and added a tenth, godrays (dark detached faces, a light inside, fog, light shafts between the cracks); refinements: subsurface scattering for white sculpture and white tiles, the glowing lines with a soft metallic shape inset to reflect them; each look with only its own controls; colour only in mathy; delete unused presets; old URLs map to the nearest look. → [R1](rendering.md#r1-looks-instead-of-materials--palettes--styles) | The owner has picked the looks from sample renders, and the panel offers them. |
| R8 | **Iridescent reworked**, built 2026-10-23 and reworked with the owner: a colour wheel at a phase mixed from bands, angle and holo, each with a slider (face rings tried and removed 2026-10-24), times Cycles, plus Specular and Roughness; per pixel in the fast view, baked on subdivided faces in RT, nodes in Blender. Owner to judge. → [R8](rendering.md#r8-iridescent-reworked) | Owner approves a render. |
| R21 | **Render toggle** (the RT checkbox), built 2026-10-23, owner to test (it froze the desktop before the tile change; untested since). Then: light tuning, denoiser on or off by default. → [Render toggle](rendering.md#the-render-toggle-r21) | Sculpture renders with shadows and creases from the page, 2048² in under a minute, without freezing the desktop. |
| R10 | **Paper finish**: off-white, grain, optional AO, maybe hatching. → [R10](rendering.md#r10-paper-finish) | Part of the paper look, approved by the owner. |
| R11–R19 | Older ideas: staging, glow lines and bloom, tubes, smooth subdivision, fake SSS, real glass, per-face painting, turntable export, orthographic camera. → [rendering.md](rendering.md#older-ideas-still-open) | Each when its look is confirmed. |

## Exploration (X): [exploration.md](exploration.md)

The tools (X1 self-intersection, X2 survey harness) are built; each question starts with a survey.

| ID | item | done when |
|---|---|---|
| X3 | **Shapes realizable with regular faces only non-convexly** (`ebC`): direct constraint solver (also settles `sktJ45`), a search, predictors (the symmetry-adapted constraint count), classes by look. → [X3](exploration.md#x3-shapes-realizable-with-regular-faces-only-non-convexly) | A first list of such shapes and a tested predictor, or a recorded negative result. |
| X4 | **When does regular-then-flat stay clean** (no self-intersection; convex faces); deltahedra as the special case. → [X4](exploration.md#x4-when-does-regular-then-flat-stay-clean) | A survey and a rule with its counterexamples. |
| X5 | **Which graphs give affine stars**; test the zone hypothesis (self-crossing zones collapse). → [X5](exploration.md#x5-which-graphs-give-affine-stars) | Zone counts and collapse predictions checked on the known cases. |
| X6 | **Several resting points of Regular faces**: list them by many symmetric starts and clustering. → [X6](exploration.md#x6-several-resting-points-of-regular-faces) | Counts for `dosmA5` and a few others. |
| X7 | **Predict and classify in general**, from the accumulated surveys. → [X7](exploration.md#x7-predicting-and-classifying-in-general) | Ongoing; rules recorded as found. |
| X8 | **LLM-guided search for nice renders** (owner, 2026-10-23): a loop in which a vision-capable model proposes shapes, optimizer chains and render settings (look, scene, light, camera), looks at the renders, and keeps what it judges nice or artsy, building a gallery and notes on what works. → [X8](exploration.md#x8-llm-guided-search-for-nice-renders) | A first run with its gallery shown to the owner, and the harness documented. |

## Optimizers (O): [realization/README.md](realization/README.md#goal-b-artsy-shapes)

The owner has mostly stopped looking for new artsy optimizers (2026-10-23). One experiment is wanted:

| ID | item | done when |
|---|---|---|
| O1 | **Symmetry-only optimizer** (owner, 2026-10-23, not fully defined): from a random init, enforce only the symmetry, or a subgroup of it, and nothing else, so non-convexity comes from the start rather than from face pressure and every seed looks different. The owner expects it to be too messy on its own and wants to see it anyway, to learn what then needs forcing. Needs subgroups ([symmetry.md](symmetry.md#open)). Note: from random points the fitted matrices mean nothing, so take the representation from the canonical (or a spectral) shape and project the random points onto it with those fixed matrices; then perhaps follow with Flat faces. → [realization/README.md](realization/README.md#goal-b-artsy-shapes) | Renders over several seeds and subgroups shown to the owner, with notes on what looks wrong. |

**Parked** (do not start without the owner): random weights per symmetry orbit, as a switch next to Whiten ([spectral.md](realization/spectral.md#owners-observations)); per-orbit k for Star faces; the isotoxal star target for `anzD`-like faces ([regular-faces.md](realization/regular-faces.md#open-questions)); the scrape-off morph; spectral leftovers (mirrored duplicates, 4+-dimensional eigenspaces, characters, a sparse solver: [spectral.md](realization/spectral.md#open-parked-only-if-the-owner-finds-a-concrete-need)).

## Goal A (A)

| ID | item | done when |
|---|---|---|
| A1 | **Canonical tangles on `ckmU5` and `cmU5`** (owner's example): inward faces after 60,000 rounds, from the build and from Face mean; Readable inherits it. Is it the basin or the iteration? → [canonical.md](realization/canonical.md#failure-modes) | The cause is known, and fixed or documented as a limit. |

## Low priority (L)

| ID | item |
|---|---|
| L1 | Canonical speed-ups: 3 of 60 random strings hit the 60,000-round cap (`zcmJ17`, `nzbY6`, `kksJ17`); the page shows progress live. → [canonical.md](realization/canonical.md#ideas) |
| L2 | Vertex and edge orbits for colouring and ink (the orbits exist in `views()`; camera presets are done in R20). → [symmetry.md](symmetry.md#open) |

## Done

- **2026-10-23.** X1 self-intersection test (`js/selfx.js`, `selfX` in `metrics()`), calibrated: 0 on every catalogue shape, many on stellations; X2 survey harness (`tests/survey.mjs`, CSV or JSON, optional screenshots). → [exploration.md](exploration.md#tools)
- **2026-10-23.** R7 Detached solid faces: *Detach faces* and *Tile thickness* in Appearance (URL `gap`, `thk`); the tiles are drawn, traced, sent to Blender and saved as OBJ/STL in place of the faces (`js/tiles.js`). → [rendering.md](rendering.md#r7-detached-solid-faces)
- **2026-10-23.** R4 Depth of field: *Depth of field* and *Focus* in the Scene panel (URL `dof`, `fo`), traced by RT (PhysicalCamera) and carried into the Blender scene; the fast view stays sharp, and the drawn lines stay sharp. Found on the way: a white background traced black (library bug, worked round). → [rendering.md](rendering.md#r4-depth-of-field)
- **2026-10-23.** U1 Examples menu under Named shapes: all 29 catalogue entries in five groups, with the owner's short names (`js/examples.js`); choosing one opens its link. The chain format moved to `js/chain.js` so `tests/examples.mjs` replays every link exactly as the page does; all match the catalogue's faces, inward faces and reflex edges (and its round counts), about 4 minutes in all.
- **2026-10-23.** R3: AO removed from the fast view (owner: RT does creases): GTAO, the composer, the two sliders and the vendored add-ons only they used; old links with `ao`/`aos` still load (unknown keys are ignored). → [rendering.md](rendering.md#r3-remove-ambient-occlusion-from-the-rasterizer)
- **2026-10-23.** R22 Blender scene script: *Save Blender scene* in Export downloads a Python file that rebuilds the RT scene for Cycles (faces with their colours, material, stage, key area light, sky, camera, drawn lines as Freestyle) at the export size and samples; tested on Blender 4.2 and 5.1 against the page's RT export. Owner to try it on the 3090. → [rendering.md](rendering.md#the-blender-scene-r22)
- **2026-10-23.** Render button renamed RT and made a checkbox toggle (owner).
- **2026-10-23.** R20 Scene panel: orientation (free, or symmetric views from `views()` in symmetry.js: stand on a face, vertex or edge orbit, labelled by axis order; dragging then orbits the camera), ground (none, floor with fog, curved backdrop that turns with the camera), height above the ground, camera height, light presets in the camera's frame, shadow on the ground, explicit light/dark background (seeded by the theme), perspective and spin moved here. Owner to try composing with it. → [rendering.md](rendering.md#the-scene-r20)
- **2026-10-23.** R9 spike: three-gpu-pathtracer 0.0.23 runs on three r170 without a build step, 256 samples at 2048² in 21 s on the RTX 3090; Cycles is 2.5–5× faster but leaves the page. Recommendation: a path-traced Render in the page (R20). Spike in `spikes/r9-pathtracer/`. → [rendering.md](rendering.md#r9-ray-tracer-spike)
- **2026-10-23.** R5 closed by the owner: the drawn lines' *Hidden lines* slider covers frame and glass; fog and lighter back faces not needed so far. → [rendering.md](rendering.md#r5-attenuate-what-is-behind-glass-and-frame)
- **2026-10-23.** R6: *Edge type* dropdown (painted, painted even width, drawn on the screen); drawn lines (`js/lines.js`) use a face-ID buffer for visibility, so they work with faces on and off; hidden-line opacity and thinner-with-depth sliders. Owner chose drawn. Glass now follows the material's specular. → [rendering.md](rendering.md#r6-lines-drawn-onto-the-screen)
- **2026-10-23.** R2, small form: matte is diffuse-only (`specularIntensity` 0), metal deleted; glossy, iridescent and glass keep specular (owner unsure what looks good). → [rendering.md](rendering.md#r2-no-specular-highlights)
- **2026-10-23.** Docs consolidated: one backlog with IDs; uniform status blocks; favourites merged into [catalogue.md](catalogue.md); user-experience.md folded into README (workflows, decisions) and regular-faces.md (Whiten, Mix, Stellate); planes.md renamed readable.md; new [exploration.md](exploration.md) and a rewritten [rendering.md](rendering.md) from the owner's notes of this date. Dropped: "colour by balance" (the readability research it served is done).
- **2026-10-22.** Optimizer UX, the owner's seven requests: Whiten (ZCA) replaces centre/orthogonalise/normalise; Keep symmetry switch; spectral stepper for touch; clickable Steps list (states kept in the worker); Share prunes the chain by replay; Stellate; Equal edges; Mix (the single buttons on the same engine, bit-identical); Shake. `tests/optimizers.mjs`. → [regular-faces.md](realization/regular-faces.md)
- **2026-10-21.** Spectral matrix dropdown (adjacency, Laplacian, vertex mean, face mean), starts capped at 100; the first start is convex on about half of the random strings. → [spectral.md](realization/spectral.md#findings-2026-10-21)
- **2026-10-21.** Spectral init: exactly symmetric starts from whole eigenspaces, labelled by density; eigensolver 6× faster. Star faces with the pointedness rule; from stellated starts it finds the uniform star polyhedra exactly. → [spectral.md](realization/spectral.md)
- **2026-10-21.** Face mean optimizer (power iteration; with whitening, the spectral face-mean layout). → [regular-faces.md](realization/regular-faces.md#face-mean-2026-10-21)
- **2026-10-21.** Init buttons (As built, Random) apart from the optimizers; per-round adjustments (since replaced by Whiten). → [regular-faces.md](realization/regular-faces.md#whiten-and-the-old-adjustments-it-replaced)
- **2026-10-21.** Optimizers as buttons that chain from the current positions, stoppable, the chain in the URL; detached faces renamed regular faces, stiffness removed; affine faces added (`ozJ45`). → [regular-faces.md](realization/regular-faces.md)
- **2026-10-21.** Backlog audit: every item checked for a concrete observed problem. Dropped: readable for general graphs and its speed, target size, tangential/equiangular targets, solver variants for detached faces.
- **2026-10-21.** Soft convexity in Readable tried and rejected (it flattens kis pyramids); a vertex angle-sum test kept. → [readable.md](realization/readable.md#simplicial-graphs-a-rejected-fix-2026-10-21)
- **2026-10-21.** Readable (`js/readable.js`): convex, flat, readable realizations of simple and simplicial graphs (`tttttD` edge ratio 3.2 against canonical's 143); corner tie-breaker (`czD`); lower bound: `kkkkD` has no convex readable realization. → [readable.md](realization/readable.md)
- **2026-10-21.** Balance defined (every corner readable: edge ratio and turn within a face), calibrated against renders. → [realization/README.md](realization/README.md#balance)
- **2026-10-21.** Test harness; automorphisms, point groups, orbit colouring, keep the symmetry; GTAO; physical materials; palettes; edges painted in the shader; detached-faces realization.
- **2026-10-21 v1.** Seeds (Platonic, P/A/Y/U, 35 Johnson solids via hull); half-edge operators `d a t k j g p c r` with composites and `tₙ kₙ`; notation parser; canonical, planar and raw realizations in a worker; three.js viewer; PNG, OBJ, STL export; URL state; Info dialog; home-page link.
