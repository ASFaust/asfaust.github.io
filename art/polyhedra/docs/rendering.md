# Rendering: the Viewer and the Artsy Track

**Code:** `js/viewer.js` (three.js r170), `js/palettes.js`, `js/colour.js`, and the colour and look controls in `js/main.js`. This file covers how shapes are *drawn*. How they are *shaped* is [realization/](realization/README.md).

**Taste reference:** the owner's earlier Blender renders in `PolyOp/polyop_ref/` (outside the website repo). The open items below name the render they aim at.

## How the viewer works now

- **Geometry.**
  - Faces are drawn flat-shaded, one normal per face (Newell). Triangles go as they are; larger faces as a fan around the centroid, which stays sensible while faces are not yet flat.
  - Positions are scaled so the farthest vertex sits on the unit sphere.
  - `setMesh()` builds the buffers once per shape; `setPositions()` rewrites them in place, once per animation frame at most.
- **Edges are painted onto the faces in the shader** (`paintEdges()` patches the material through `onBeforeCompile`), as the owner prefers. There are no tubes or vertex balls.
  - Each drawn triangle carries, at its corners, the signed distances to three boundary lines of its face: sides k−1, k and k+1 for fan triangle k. A neighbour's line is used only at convex corners.
  - Distance to a line is affine in the plane, so it interpolates exactly. The fragment takes the minimum and paints the edge colour within the half-width `edge × 0.08 × mean edge length`, antialiased with `fwidth`.
  - **Frame** style discards everything else, draws both sides, and uses alpha-to-coverage for smooth borders.
- **Styles:**
  - solid,
  - glass: front faces at 0.35 opacity, plus back faces at 0.25 drawn first,
  - frame.
- **Materials:** `MeshPhysicalMaterial`, with presets in `LOOKS`; `env` is the environment-map intensity:

  | look | settings |
  |---|---|
  | matte | roughness 0.55 |
  | glossy | roughness 0.35, clearcoat 1 |
  | metal | metalness 1, roughness 0.28, env 1.4 |
  | iridescent | metalness 0.85, roughness 0.2, iridescence 1, IOR 1.8, thickness 250–900 nm |

  Iridescent needs high metalness: on a non-metal, the thin film only tints the rims.
- **Lighting:** a RoomEnvironment environment map (PMREM), a key directional light and a hemisphere light, with neutral tone mapping.
- **Ambient occlusion:** three.js `GTAOPass` inside an `EffectComposer` (4× multisampled half-float targets), followed by `OutputPass`. Solid style only. Its settings:
  - radius and thickness: `reach × mean edge length`, so creases look alike at every subdivision,
  - `distanceExponent` 2, 32 samples,
  - denoise: Poisson with `normalPhi` 8, so it does not blur across faces; radius 12, 3 rings.

  The first version used a radius of 0.35 of the whole shape, which gave smudges and banding. Now it is smooth, with slight grain right at creases. Exports keep a transparent background.
- **Colour:** a colouring gives each face a class, and class k takes palette colour `k mod length`. Vertex colours are linear sRGB.
  - Colourings: origin (tags), number of sides, symmetry orbit, one colour.
  - Palettes: generated (OKLCh, golden-angle hue steps, alternating lightness), pastel, earth, ocean, ember, mono, metals, pearl, and custom (editable swatches, stored in the URL).
- **Edge colour ("ink"):**
  - auto: dark on solid faces; otherwise whichever contrasts with the theme,
  - dark, light,
  - colour: the first palette colour × 0.35.
- **Camera:** perspective, with the field of view as a slider (2° is nearly orthographic). The distance is set so the unit sphere fits. Arcball dragging with inertia, wheel or pinch zoom, double-click to reset, optional slow spin.
- **Export:**
  - PNG of the current view as shown,
  - PNG re-rendered at up to 8192², capped by the GPU's limits, with an optional transparent background,
  - OBJ (polygons), binary STL (centroid fans).

## Open items

Roughly in order of value per effort.

### Look and light
- **Analytic ambient occlusion for flat faces** (replaces GTAO for creases). The cosine-weighted visibility of a polygon from a point is Lambert's formula `(1/2π) Σ βᵢ (n·γᵢ)` over its edges. Summed in the fragment shader over the faces around the fragment's face (from a data texture, clipped to the upper hemisphere), it gives exact, noise-free, resolution-independent crease shading. It ignores occlusion between occluders: fine for creases, wrong for deep cavities. The hard part is that big neighbour faces have many edges. *Refs:* `aafgsd.png`, `untitled.png`.
- **Fake subsurface scattering**, for an organic, candy-like look:
  - wrap lighting `max(0, (N·L + w)/(1 + w))`,
  - a tinted rim or back light,
  - a thickness term from AO or from a back-face depth pass,
  - three's `sheen` and `transmission` as cheaper approximations.

  *Ref:* `Figure_6.png`.
- **Staging:** a backdrop or floor with a soft contact shadow, studio lighting presets, depth of field. *Refs:* `Figure_6.png`, `Figure_9.png`, `hfgdhfgjd.png`.
- **Glow lines on dark:** emissive painted edges plus a bloom pass (`UnrealBloomPass`, to be vendored the same way as GTAO). *Refs:* `ref.jpg`, `untitlettzd.png`.
- **Real glass:** `transmission`, a thickness, and a rough backdrop to refract. *Ref:* `Figure_7.png`.

### Colour
- **Per-face painting:** click a face to colour it, or its whole orbit. Needs a raycast and a face id per drawn triangle; the fan layout already maps triangles to faces. Overrides go in the URL, compressed.
- **Vertex and edge orbit colourings**, and per-orbit edge ink (needs [symmetry.md](symmetry.md) extras).
- **Palette authoring extras:** reorder swatches; a "shuffle the assignment" button.

### Geometry styles: render-time topology passes
These change the mesh that is drawn, not the polyhedron:
- **Wireframe + subdivide** gives organic tubes. Thicken each edge into a tube around the faces, with each face becoming a hole with an inset rim, then Catmull–Clark subdivide. In Conway terms: inset all faces ("loft"), delete the inner faces, solidify, subdivide. *Refs:* `hfgdhfgjd.png`, `unsstitled.png`.
- **Detached face tiles:** each face becomes its own prism or pyramid, shrunk and moved out (PolyOp's `detach_faces(scale, move, thickness, pyramidal)`). *Ref:* `untitled.png`.
- **Smooth-shaded subdivision** of non-convex realizations, for folded, crumpled and pleated looks. *Refs:* `Screenshot from 2026-10-21 16-20-56.png`, `fig5.jpg`, `untitled4.png`.
- **Stellated and spiky shapes** come from realizations, not rendering: [realization/spectral.md](realization/spectral.md), and star-polygon targets in [realization/detached-faces.md](realization/detached-faces.md). *Refs:* `Figure_10.png`, `Figure_11.png`.

### Viewer
- Turntable GIF or WebM export.
- Camera presets down symmetry axes ([symmetry.md](symmetry.md)).
- An orthographic toggle; for now a 2° field of view works.
