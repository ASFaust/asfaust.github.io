# Rendering: Looks and the Viewer

> **Status:** first version in the page; the owner wants it redone (2026-10-23). It is not a reference: its materials and colour schemes were vibe-coded and can be deleted. **Code:** `js/viewer.js` (three.js r170), `js/palettes.js`, `js/colour.js`, the look controls in `js/main.js`, `js/export.js`. **Tests:** none; look at renders with `tests/screenshot.mjs`. **Backlog:** R1–R19.

This file covers how shapes are *drawn*. How they are *shaped* is [realization/](realization/README.md).

## The looks the page should make

The owner wants a few distinct looks rather than a pile of independent material, palette and style controls (2026-10-23). Named by the owner:

1. **Paper drawing.** Minimal and monochrome, like a drawing on paper: lines only, faces only (flat tones), or both. Maybe AO, maybe some grain. Closest reference: `diagram.png` (black ink on white, with lighter lines behind the shape).
2. **Mathy.** What you find on Wikipedia: faces in flat colours (by number of sides, or by orbit) with dark edges; or transparent green faces with the edges drawn, the back edges visible. **Colour belongs to this look only; every other look is monochrome** (owner).

Proposed from the reference renders (session, 2026-10-23; the owner to confirm or prune):

3. **Sculpture.** A matte white, grey or black solid on a studio backdrop, with soft light, a soft contact shadow and dark creases. Most of the references are this: `Figure_10.png`, `Figure_11.png`, `fig5.jpg`, `untitled4.png`, `Figure_9.png` (black on white), `aafgsd.png` (one orange colour, deep crease shading).
4. **Glowing lines on dark.** Emissive edges, the back ones dimmer or out of focus. `ref.jpg`, `untitlettzd.png`.
5. **Tubes.** The edges as thick smooth tubes, the faces open. `hfgdhfgjd.png` (gold, depth of field), `unsstitled.png`.
6. **Detached tiles.** Each face its own solid, shrunk and lifted. `untitled.png`. See R7.
7. **Soft and organic.** Candy-like, smooth, translucent. `Figure_6.png` (red, depth of field), `Screenshot from 2026-10-21 16-20-56.png` (pale blue, smooth).
8. **Glass.** `Figure_7.png`.
9. **Iridescent.** Monochrome in the sense of having no colour controls; the colour comes from thin-film interference and changes like a rainbow *within* a single face (owner). See R8.
10. **Godrays** (owner, 2026-10-24, from a render of his not in the reference set): detached faces (R7), dark, with a point light at the centre of the shape and fog, so light shafts shoot out between the cracks.

**The owner's verdict on the candidate renders (2026-10-24):** "love them all", so all ten stay. Refinements: white sculpture and white tiles get some subsurface scattering, to soften them; the glowing lines on dark had one more element in his original render, a soft organic shape (as in look 7) inset inside the lines with a metallic material, so the glow is reflected on it; glass gets a refraction index control (done 2026-10-24: *Refraction*, URL `ior`, 1–2.5, shown for the glass style, in RT and Blender; the fast view's fake glass ignores it).

### The workflow (proposed by a session, confirmed by the owner, 2026-10-23)

**One scene, two renderers.** What is set up in the fast (rasterized) view is exactly what the path tracer renders; there is no second scene for rendering. The panels follow the workflow:

1. **Shape, Realization:** explore by button mashing; the shape turns freely; nothing about the scene gets in the way.
2. **Appearance (the Look, R1):** what the object is: material or tone, colours (mathy look only), edge type and width. No lights.
3. **Scene** (R20): where the object is and how it is lit. *Orientation*: free, or one of the symmetric views from the automorphisms ("rest on" a face, vertex or edge orbit, labelled with the order of its rotation axis); choosing one fixes the shape's rotation, and dragging then moves the camera round the scene. *Ground*: none, floor, or a curved backdrop; sitting on it or floating. *Camera*: height above the ground, field of view. *Light*: a few presets, not free placement. The fast view shows ground and shadow roughly, so composing needs no tracing. A chosen orientation and the camera angles go in the link (small and exact; a free drag still does not, see README's decisions).
4. **Render** (R21): a toggle in the view's toolbar, not a panel: the view itself becomes the path tracer, refines while still, drops to the fast view while dragging. Save PNG then renders at the export size to a chosen number of samples. The few tracer-only settings (samples, bounces) go in Export.
5. **Export:** PNG, OBJ/STL, and a Blender scene script (R22, built 2026-10-23). A page cannot start Blender (no registered link type), so the nearest thing is one downloaded Python file: `blender --python scene.py` opens the scene ready to render.

Lights belong to the Scene, not the Look: a look should work under any staging, and staging is useful without the tracer too. Live denoising: three-gpu-pathtracer 0.0.23 has a simple edge-aware `DenoiseMaterial` (untested); Intel's OIDN in the browser exists but is heavy, better for the final PNG. Longer render times than Blender are fine (owner).

### Reference renders

The owner's Blender renders from PolyOp, in `PolyOp/polyop_ref/` (outside the website repo). The grouping above is a session's reading of them; a contact sheet is quick to make with PIL from `/home/andi/venv`.

## The owner's critique of the current viewer (2026-10-23)

| problem | why | item |
|---|---|---|
| Specular highlights | On a static print of a non-convex shape you ask yourself "why is that face so lit?" Softened later the same day: the owner is not *sure* what looks good; specular is what makes the current metal and iridescent work at all, metal looks bad anyway and can go, and iridescent is wrong as implemented (see R8) | R2 |
| Colour everywhere | Colourful faces are the mathy look only | R1 |
| Iridescent has colour controls and uniform faces | It should vary within a face and with the view (reworked 2026-10-23: a mixer of bands, angle and holo) | R8 |
| AO is terrible | GTAO gives smudges and grain at creases; later the same day: remove it, RT does creases | R3 |
| No depth of field | Wanted for the sculpture and line looks | R4 |
| Glass and frame are confusing | The back faces are as strong as the front ones; they need attenuating, or depth fog | R5 |
| The wireframe is not what was meant | It should look drawn onto the screen: the same width from every viewing angle, yet not sticking out of the surface; "comic style"; maybe thinner with depth, but not with the face's tilt. To be tested | R6 |
| No detached-faces mode | Shrink each face inwards and extrude it, so every face is a solid; good for stellated shapes | R7 |
| Quality ceiling | The owner is considering a ray tracer for really nice renders | R9 |

## How the viewer works now

- **Geometry.** Faces flat-shaded, one normal per face (Newell). Larger faces drawn as a fan around the centroid, which stays sensible while faces are not yet flat (but is wrong for self-intersecting star faces). Positions scaled so the farthest vertex is on the unit sphere. `setMesh()` builds the buffers once per shape; `setPositions()` rewrites them in place, at most once per animation frame.
- **Edges are painted onto the faces in the shader** (`paintEdges()` patches the material through `onBeforeCompile`). Each fan triangle carries, at its corners, the signed distances to three boundary lines of its face (sides k−1, k, k+1; a neighbour's line only at convex corners). Distance to a line is affine in the plane, so it interpolates exactly. The fragment takes the minimum and paints within the half-width `edge × 0.08 × mean edge length` (world units), antialiased with `fwidth`. **Frame** style discards the rest, draws both sides, and uses alpha-to-coverage.
- **Edge types** (`lines`, URL `ln`; R6, 2026-10-23): *painted* (above); *screen*, the same bands with the width in pixels (distance divided by the length of its screen gradient), half of it per face; *drawn* (`js/lines.js`), every edge a capsule of constant pixel width drawn over the picture, its visibility taken from a face-ID buffer (visible where a pixel beside the nearest point of the segment belongs to one of the edge's two faces), coverage blended by maximum so joins have no dark dots, then composited as ink; the default since 2026-10-23. Width in pixels is `edge × 0.01 ×` the shorter side of the drawing buffer, so exports match the view. *Thinner with depth* (`ed`) multiplies the width by `(camera distance / depth)^ed`. *Hidden lines* (`hid`, drawn only, not in solid) is the opacity of the occluded lines.
- **Styles:** solid; glass (front faces at 0.35 opacity, back faces at 0.25 drawn first); frame.
- **Materials:** `MeshPhysicalMaterial` with presets in `LOOKS`: matte (diffuse only: `specularIntensity` 0, so no highlights, reflections or Fresnel rim; since 2026-10-23, R2), glossy (roughness 0.35, clearcoat), iridescent (metalness 0.85, iridescence 1, thickness 250–900 nm; on a non-metal the film only tints the rims). Glass takes the material's specular, so matte glass has none (the owner disliked the highlight on glass, 2026-10-23). Metal was deleted (2026-10-23); old `mat=metal` links fall back to matte.
- **Lighting:** RoomEnvironment map (PMREM), a key directional light, a hemisphere light, neutral tone mapping. The environment map was where the unexplained highlights came from; on matte it now only lights diffusely, which depends on the face's orientation alone. Lights are fixed to the world.
- **Ambient occlusion:** none since 2026-10-23 (R3); creases and contact shadows come from RT. The fast view draws straight to the canvas, with no composer.
- **Colour:** a colouring gives each face a class (origin tags, number of sides, symmetry orbit, one colour); class k takes palette colour `k mod length`. Palettes: generated (OKLCh, golden-angle hues), pastel, earth, ocean, ember, mono, metals, pearl, custom (in the URL). Ink: auto, dark, light, or the first palette colour × 0.35.
- **Camera:** perspective, field of view as a slider (2° is nearly orthographic), zoom, double-click to reset, optional spin. Placed by azimuth and elevation round the shape's centre (the Scene, below).

### The Scene (R20)
Built 2026-10-23, in `js/viewer.js` (`orient`, `placeStage`, `placeCamera`, `orbit`) and the Scene panel:
- **Orientation:** *free* (dragging turns the shape, an arcball in the camera's frame with inertia, as before) or a symmetric view from `views()` ([symmetry.md](symmetry.md#views-2026-10-23)), which stands the shape on that face, vertex or edge; dragging then orbits the camera (azimuth, elevation), and spin turns the camera. Recomputed from the positions every frame, so it follows a running optimizer.
- **Ground:** none; floor (a wide plane fading into the background with fog); backdrop (floor plus a wall curving up behind, turning with the camera so it stays behind). On the ground the lowest point touches the floor, plus *height above the ground*. With ground the camera stands 1.35× farther back.
- **Light:** the key light's direction as a preset (upper left, above, side, behind) in the camera's frame turned only about the vertical, so it keeps its place in the picture; it casts a PCF-soft shadow map onto the ground (faces cast, only the stage receives, so the faces stay readable). The stage takes little of the environment (`envMapIntensity` 0.15) so the shadow shows. With the default upper-left light the shadow falls mostly behind the shape.
- **Background:** light (`#fff`) or dark (`#0f0f10`), explicit (owner, 2026-10-23: the scene must not depend on the page theme); unset, it follows the theme. It sets the stage colour, the scene background, the export background and the automatic edge colour.
- The drawn lines leave the stage out of their face buffer.
- URL keys: `or` orientation (`free` or a view key), `gr` ground, `lift`, `el` camera elevation, `az` azimuth, `li` light, `bg` background; `fov`, `spin` as before. A free drag is still not stored.

### The Render toggle (R21)
Built 2026-10-23: `js/trace.js` (`Tracer`), the trace loop in `js/viewer.js` (`setTrace`, `trace`, `drawLines`, `snapshot`), the RT toggle in the toolbar (a checkbox styled like the buttons; renamed from the Render button at the owner's request, 2026-10-23, so it reads as a toggle), and *Render samples* and *Denoise* in Export. three-gpu-pathtracer 0.0.23 and three-mesh-bvh 0.8.3 are vendored unmodified (with licence headers) in `vendor/`; the import map also resolves `three-mesh-bvh` and `three/examples/jsm/postprocessing/Pass.js`. `trace.js` is imported on the first switch-on, so page load is unchanged.
- **The copy of the scene** (`Tracer.build`): the faces (position, normal, colours as RGBA), a traced material for the viewer's material (glass style: transmission 1, ior 1.5), the visible stage meshes in the stage colour, the key light as a 3×3 `RectAreaLight` where the directional one is (soft shadows), a grey-to-white gradient sky as environment (0.8), the stage colour as background (none for a transparent export). Frame style traces the stage only. Rebuilt whenever anything changes (cheap: the BVH takes tens of milliseconds); there is no separate camera update.
- **When it traces:** after 250 ms without a change, drag, spin or running optimizer; up to 2048 samples, then it stops. Moving shows the fast view again. The drawn lines are laid over the traced picture, and stand in for every edge type, since the tracer cannot paint bands.
- **Export with RT on:** re-traced at the export size to *Render samples*, the button showing progress.
- **Freezes (2026-10-23):** one sample of the whole picture is one GPU job (40 ms at 900², 80 ms at 2048²), and a loop timing its calls in JavaScript queues many, since the GPU works asynchronously; this froze the owner's desktop, which shares the GPU. Now each sample is split into tiles of about 0.2 megapixels and one tile is traced per animation frame, live and in export. Not yet tested after that change.
- **Bug found (2026-10-23, with R4):** a white background traced black. The library makes a one-colour texture from a colour background but fills it only when the colour differs from its default, white. `Tracer` now passes its own texture.
- **Bug found:** faces came out black at random. The tracer merges all meshes into one buffer and gives meshes without colours a 4-component colour attribute; the faces' 3-component colours were then read with the wrong stride. Fixed by passing RGBA.
- **Not done:** depth of field (R4: `PhysicalCamera`), fog for the floor-only ground (the traced floor shows a horizon), tuning the light to the owner's taste, the library's denoiser judged against none (on by default).
- **Export:** PNG as shown; PNG re-rendered at up to 8192² (GPU-capped), optionally transparent; OBJ (polygons); binary STL (centroid fans).

### The Blender scene (R22)
Built 2026-10-23: `js/blender.js` (`sceneData`, `blenderScene`), the *Save Blender scene* button in Export. The script is self-contained: the scene as JSON in a raw string, and code that builds it. `blender --python polyhedron-tkD.py` opens it looking through the camera; `blender -b --python polyhedron-tkD.py -- --render out.png` renders it without a window. It replaces everything in the open file.
- **What it carries** is the RT copy of the scene (`trace.js`), not the fast view: the polygons (not fans) in world space with a per-face colour attribute `colour`, one Principled material per viewer material (glass and frame styles override it), the visible stage meshes (the curve shaded smooth), the key light as a 3 × 3 area light of 7π·9 W (Cycles takes power; radiance × π × area matches the tracer's radiance 7), the tracer's grey-to-white sky at 0.8 (exponent 2) for lighting while the camera sees the stage colour (a Light Path mix), the camera (vertical field of view, clip range) as for a square export. Three's y-up becomes Blender's z-up as (x, −z, y).
- **Lines:** if the edge width is above 0, every edge of the shape gets a Freestyle mark and a lineset draws marked edges only, restricted to the shape's collection (otherwise Freestyle also draws the floor's border with the backdrop), in the ink colour, as wide in pixels as the page's drawn lines at that size; hidden lines a second lineset at the *Hidden lines* opacity. *Thinner with depth* is not carried over. Frame style: the faces are a Transparent BSDF that casts no shadow, so only the lines show, still hidden by the faces.
- **Render settings:** Cycles, the export size and *Render samples*, transparent film if chosen, Cycles' denoiser when *Denoise* is on and the build has it, view transform Khronos PBR Neutral (three's NeutralToneMapping is the same curve; Standard before Blender 4.2), the first GPU Cycles finds (OptiX, CUDA, HIP, Metal, oneAPI), else the CPU.
- **Tested** with the `bpy` module 4.2.0 and 5.1.2 (CPU) on `tkD` with backdrop, floor, glass, frame, glossy, iridescent and a dark background; side by side with the page's RT export the framing, light and shadow match. Not tested on Blender 4.0 (the owner's Ubuntu build; no `bpy` 4.0 wheel for the container's Pythons): the code falls back for its older names (`use_freestyle_mark`, *Specular*, *Clearcoat*, *Transmission*; no thin film, so iridescent is plain metal there).

## Work items

Suggested order: R20 Scene, R21 Render, R22 Blender (the confirmed workflow; R20 and R22 built), then R1 once the owner has confirmed the list of looks; R3, R4, R11 and R16 mostly follow from R21 for final images.

### R1. Looks instead of materials × palettes × styles
Replace the Style, Material, Palette and Ink controls with a **Look** choice, each look with only the few controls it needs (paper: lines / faces / both, grain; mathy: colouring, palette, opaque or transparent; sculpture: tone, backdrop). Colour controls appear only in the mathy look. Delete the presets nothing uses. The URL keeps one `look` key plus that look's parameters; old links need not keep their look (owner, 2026-10-23: only the shape must replay). Needs the owner's confirmation of the look list above first: present renders of each candidate, made with `tests/screenshot.mjs`.

*Part 1, built 2026-10-24.* A **Look** menu at the top of Appearance (URL `lk`): Custom (every control, as before), Paper drawing, Mathy, Sculpture, Detached tiles, Glass, Iridescent. Choosing a look sets the controls to its starting point (`LOOKS` in `js/main.js`) and hides the ones it does not use (each control's `data-k`); the state stays the controls' own, so a link replays whatever was tuned afterwards, and the old keys still work. Two new controls: **Tone** (a colour picker: one-colour faces, a custom palette of one) and **Subsurface** (URL `ss`, 0–1). Subsurface is real in Blender (Principled *Subsurface Weight*, radius warm (1, 0.75, 0.55), scale 0.3: visibly softer creases and terminator); the path tracer has none, so RT stands in a thin rough transmission of 0.4 × the slider (a first try, transmission into an absorbing solid, came out grey and noisy); it lets some light through but does not soften much. The fast view ignores it. Still to do: the glowing lines, tubes, soft and godrays looks (part 2), and deleting presets nothing uses once the owner has lived with the menu.

*Candidate renders shown to the owner (2026-10-24)*, on `jtJ37` and `scnC` (Regular → Flat): paper and mathy from the fast view; sculpture, tiles, glass and iridescent from the Blender scene script as it is (Cycles, 64 samples); glowing lines, tubes and soft as Blender prototypes patched onto that script (lines: a Wireframe modifier with an emission material, faces hidden, Fog Glow in the compositor, depth of field; tubes: Wireframe plus Subdivision, gold metal; soft: Subdivision level 3 on the faces with subsurface scattering). The prototypes say what building those looks would take: tubes and soft need geometry the page does not make yet (R13, R14), glowing lines need emission and bloom (R12). Waiting for the owner's pick.

### R2. No specular highlights
Done in its small form (2026-10-23): matte, the default, has `specularIntensity` 0, so a face's brightness depends only on its orientation; metal is gone. Before/after on `jtJ37` and `oD` (regular, flat): the faces barely change, but the grey environment sheen on the ink bands and the bright rims at grazing faces disappear. Glossy, iridescent and glass keep their specular on purpose: the owner is not sure what looks good (2026-10-23), so glossy stays as the comparison, and iridescent gets redone in R8. The owner did not want R2 overthought, since the looks themselves (R1) are not built yet; whether each look is diffuse belongs to that look. Glass first kept its specular regardless of material; the owner disliked the highlight on a matte glass render, so glass now follows the material. Not tested: lights fixed to the camera rather than the world.

### R3. Remove ambient occlusion from the rasterizer
**Done (2026-10-23).** **Decided (owner, 2026-10-23):** no AO in the fast view any more; the path tracer (RT) gives creases and contact shadows for real, which is what AO was standing in for. Delete `GTAOPass`, the `EffectComposer` that only exists for it, `placeAO`, the *Occlusion* and *Reach* sliders and their URL keys (`ao`, `aoSize`); old links that carry them must still load. GTAO had been judged "terrible" (smudges and grain at creases). The alternatives considered before this decision, kept for the record: analytic polygon AO (Lambert's formula over the neighbouring faces, noise-free but blind to deep cavities) and baked ray-traced AO per face.

### R4. Depth of field
**Done (2026-10-23), in RT and the Blender scene.** Two Scene sliders: *Depth of field* (`blur`, URL `dof`), the lens opening as a fraction of the shape's radius (0 is off, up to 0.5; since 2026-10-24 the slider is the square root of it, so small openings get most of its travel), and *Focus* (`focus`, URL `fo`), the sharp distance from the camera's distance to the shape's centre minus one radius (near side, −1) to plus one (far side). `Viewer.lens()` turns them into an opening and a distance in world units. RT traces through three-gpu-pathtracer's `PhysicalCamera`, a copy of the viewer's camera whose `bokehSize` (millimetres, a thousandth of a world unit) is the opening; Blender gets `dof.focus_distance` and `aperture_fstop = lens × 1e-3 / opening` (Cycles' opening is focal length over f-number). Both give the same blur, checked side by side at 0.5. **Not done:** the fast view stays sharp (live blur would need `BokehPass` and the `EffectComposer`, deleted with GTAO in R3; the owner composes focus with RT on); the drawn lines stay sharp over a blurred picture, in the page and as Freestyle lines in Blender, so with strong blur thinner edges or none look better. *Refs:* `Figure_6.png`, `hfgdhfgjd.png`, `untitlettzd.png`.

*Owner report (2026-10-24): "all blurry no matter what I select".* Not reproduced: at opening 0.08 on `jtJ37` with a backdrop, focus −0.8 (front sharp, back soft) and +0.8 (the reverse) differ as expected, both in RT (headless, about 40 samples, denoiser off) and in Cycles. On the way, a false lead: `tests/screenshot.mjs` used a fixed debugging port, so a Chrome left running by an earlier test was driven instead of a new one, and a new link only changed the hash of the old page; it now takes a random port. Suspects left: the opening's range (0.5 is a very wide lens; at 0.1 the near side is blurred by about 1 % of the picture when focused on the centre), now eased by the square-root slider; and the denoiser, a 5-pixel edge-aware blur that softens everything at any sample count. Waiting for the owner's link.

### R5. Attenuate what is behind (glass and frame)
**Closed (owner, 2026-10-23)** without further work: drawn lines (R6) dim or drop the hidden lines in frame and glass, and the owner's glass render (`bbJ29`, earth palette, orbit colours) read well without fog or lighter back faces. Reopen if a render shows the back competing with the front; the ideas below are what would be tried.

In glass and frame styles every face and line counts the same, front or back, which is confusing. Options: draw back faces and back lines lighter (thinner, paler, more transparent); or depth fog, mixing towards the background with view depth across the shape's bounding sphere, so near lines are full ink and far ones fade, as in `diagram.png`. Probably both, as a strength slider.

### R6. Lines drawn onto the screen
**Done (2026-10-23): "Drawn on the screen" chosen** (owner: "looks amazing"; liked the render `#n=bbJ29&m=built&st=glass&c=orbit&pal=earth&e=0.35&ln=drawn&ink=dark` apart from the glass highlight, since removed). All three edge types stay in an *Edge type* dropdown until R1 decides per look. Findings, from renders of `jtJ37` (regular, flat):
- *Painted, even width* works on the faces, but the silhouette shows half the width, as predicted; not worth an outline pass now that drawn exists.
- *Drawn* with faces on gives full width at silhouettes and in valleys and never sticks out, because visibility comes from the face buffer, not depth. So the owner's doubt (screen lines with faces on) is resolved this way, not by painting.
- With faces off (frame), drawn gives a true hidden-line drawing at *hidden lines* 0, the PolyOp look at 1, and the `diagram.png` look (lighter lines behind) in between: this covers part of R5 for the frame style.
- Self-intersecting shapes: an edge passing behind a crossing face is hidden there, correctly; the crossing curve itself is not drawn (it is no edge).
- Bug fixed the same day: edges went missing after Random. three caches an `InstancedBufferGeometry`'s instance count at its first draw (`_maxInstanceCount`), so a reused geometry drew only as many edges as the first shape had; `Lines.setMesh` now makes a new geometry per shape.
- Not judged yet: *thinner with depth* (a slider, default off). Not tested: very large shapes in SwiftShader (three passes per frame; fine on a GPU).

Original notes:
**Faces on or off matters** (owner, 2026-10-23): the owner is not sure constant-width screen lines are possible *with faces turned on*; with faces off they are, and PolyOp did it (`PolyOp/src/Renderer.cpp`: a software rasteriser drawing each edge as a z-buffered, supersampled line, no faces). Test both cases separately. If only the faces-off case works well, either switch the line kind automatically with the style, or offer an edge-type dropdown (painted / screen lines / …). With faces off, three's `Line2`/`LineSegments2` (fat lines, pixel width) is the direct equivalent of PolyOp's approach; back lines can then be dimmed for R5.

The current edges have a width in world units, so they get thin where a face is tilted away and thick where it faces the camera. The owner wants constant width on screen, still painted on the surface (not tubes sticking out): comic style. Lead (session): the shader already has the distance `d` to each edge line, affine across the triangle, so `d / length(vec2(dFdx(d), dFdy(d)))` is the distance *in pixels*, and a fixed pixel half-width gives the same line width at every tilt, painted on the face. Problems to test: at the silhouette only one of the two faces is visible, so the line there shows half its width (may need an outline pass); exports at higher resolution need the width scaled with the image size; the owner suggested width depending on depth but not on tilt, which is the pixel width times a depth factor. Compare by renders.

### R7. Detached solid faces
**Done (2026-10-23).** `js/tiles.js`: `tileMesh(m, solid)` gives the faces of the tiles (the shrunk face on top, the same moved inwards along the face's normal underneath, reversed, and a quadrilateral per side, wound so each tile is a closed solid), with `src`, the face each belongs to; `tilePositions` places them from the polyhedron's positions. Controls in Appearance: *Detach faces* (`gap`, URL `gap`): each face scaled towards its centroid by 1 − gap, 0 is off; *Tile thickness* (`thick`, URL `thk`, default 0.3): the slab's depth in mean edge lengths, 0 for flat tiles (drawn from both sides, in the view and in RT). The viewer draws `shown`/`shownPos` (the faces, or the tiles) instead of the polyhedron, so painted and drawn edges, colours (a tile takes its face's colour), RT, the Blender scene and OBJ/STL all get the tiles; the orientation, views and stage still use the polyhedron. OBJ/STL of tiles are in the view's units (the shape fits the unit sphere), not the worker's. Checked on `tkD` (convex), `scnC` Regular → Flat (folded) and `tD` Stellate (stellated), in the view, RT and Blender. Not done: pyramidal tiles (PolyOp's `pyramidal`); a move outwards along the normal (PolyOp's `move`); star faces still use the centroid fan, which looks right for the uniform star polyhedra seen so far. *Ref:* `untitled.png`.

### R8. Iridescent, reworked
**Built (2026-10-23), reworked twice the same day with the owner; owner to judge.** A diffuse colour taken from a colour wheel (OKLCh at lightness 0.72, with the page's Hue and Chroma), at a phase mixed from four terms the owner can weigh with sliders (Appearance, shown for iridescent):

| Slider | URL | Term (0 to about 1) | Range, default |
| --- | --- | --- | --- |
| Bands | `ib` | waves across the whole shape, `Band width` (`fb`) edge lengths long: the first version's film thickness | 0–2, 1 |
| Angle | `ia` | 1 − cos of the angle between the face and the view | 0–2, 1 |
| Holo | `iho` | where the view reflects to in the world, `0.5 + 0.35 y + 0.25 x`: changes as the shape turns under a still light, like a hologram foil | 0–2, 0 |
| Cycles | `icy` | multiplies the sum: times round the wheel | 0–4, 1 |
| Specular, Roughness | `sp`, `ro` | the shine (three's `specularIntensity` and `roughness`) | 0–1, 0; 0–1, 0.35 |

phase = hue/360 + cycles × Σ weight × term. Code: `js/film.js` (the terms, the wheel, the GLSL). Every term is evaluated per pixel from quantities that interpolate exactly over a triangle (two coordinates linear in the position, the offset from the face's centre, the face normal and the view), so no triangle shows.

- Fast view: `iriColour` in the face shader, with the normal from screen derivatives.
- RT: the tracer takes no custom shaders, so `trace.js` subdivides every drawn triangle n × n (up to 200,000 triangles in all) and bakes the colour at the corners for the camera as it is; a trace restarts on every camera move anyway. With no specular it is a `MeshStandardMaterial` of roughness 1, since `specularIntensity` 0 traced black specks (NaNs).
- Blender: the same in nodes: the UV map `film`, Geometry Normal and Incoming, Texture Coordinate Reflection (z up), a corner attribute `ring`, the OKLCh conversion in math nodes; Specular IOR Level is half the slider (three's 1 is Blender's 0.5).

The three agree (fast view, RT and Cycles on `jtJ37` with holo and specular).

*Rings* (distance from each face's centre, URL `irg`) were a fourth term for a day; the owner removed them on 2026-10-24, and old links with `irg` ignore it.

*History.* First, three's `iridescence` (thin-film interference on the specular) over a near-black base, the thickness per fan corner: the owner liked the idea, but it was very dark away from highlights, especially in RT, he does not like specular much, wanted control of the band frequency, and the fan's triangles showed. Second, a per-pixel thin-film colour lit diffusely: smooth, but it changed too little with the angle and read as a solid colour. Then an exploration of seven approaches side by side (angle to wheel, pearl, soap bubble of one thickness, holographic foil, angle plus bands, bands alone, three's physical film on a glossy base); the owner liked angle, holo and bands equally and asked for all three as sliders, plus rings centred on each face.

### R9. Ray tracer spike
**Done (2026-10-23).** The spike, rerunnable, is in `/home/andi/code/github-website/spikes/r9-pathtracer/` (outside the website repo; its README says how), with sample renders in `renders/`.

*Findings:*
- **three-gpu-pathtracer works on our three r170 with no build step.** Version 0.0.23 (June 2024, three ≥ 0.151) with three-mesh-bvh 0.8.3: two plain ES modules, 220 KB + 190 KB unminified, importing only `three`, `three-mesh-bvh` and `three/examples/jsm/postprocessing/Pass.js`, all resolvable by the import map (the last to `vendor/addons/postprocessing/Pass.js`). Releases from 0.0.24 on need three ≥ 0.180, later ≥ 0.185; upgrading three is a separate decision.
- **Speed (RTX 3090, headless Chrome on ANGLE/OpenGL):** about 36 ms per sample at 900² and 82 ms at 2048²; 256 samples (slight grain on matte) take 9 s and 21 s. The BVH builds in under 60 ms for 2,000 triangles. Use one tile and several `renderSample()` calls per frame, or the loop is held to the frame rate (2×2 tiles at 60 fps gave 22 s for anything).
- **Looks** (`renders/looks-256spp.png`), one area light, a gradient sky, a floor, matte materials: matte white, black, orange; transmissive red "candy"; metallic gold; glass; depth of field with `PhysicalCamera` (`fStop`, `focusDistance`, aperture blades). Matte sculpture renders get soft contact shadows and dark creases for free, which is what R3 (AO) and R11 (staging) were after. Glass (`bbJ29`) is still noisy at 256 samples and needs ~1,000. Black needs a rim light or a lighter tone to show its creases.
- **Blender/Cycles** (Ubuntu's Blender 4.0, CUDA; that build has no OptiX and no denoiser): the same shape at 256 samples in 1.9 s at 900² and 7.7 s at 2048², 2.5–5× faster, same quality (`renders/browser-vs-cycles.png`; the lighting differs, not the engine). But it leaves the page: export, script, render.
- **A spiky shape rests on one vertex** and looks as if it floats; staging should set the shape on a face (R11).
- Drawn lines (R6) can be composited over a path-traced image unchanged: they need only the face buffer and the camera.
- Not tried: a custom path tracer (no reason found: the library does what it would); the library's `DenoiseMaterial`.

*Recommendation (session; the owner agreed, and the workflow above came out of it):* a **Render** action in the page with three-gpu-pathtracer, loaded on demand (dynamic `import()`, so the page loads no slower), refining progressively while the view stays still and exporting the PNG; the live view stays rasterized. This replaces GTAO for final images (R3), gives depth of field (R4), shadows and staging (R11) and real glass (R16), and keeps the button-mashing workflow in the browser. Blender export (glTF with camera and lights) only if the browser path proves too slow for some look.

Find out whether a path tracer is worth it for "really nice renders". Candidates: `three-gpu-pathtracer` (WebGL path tracer on three.js, needs `three-mesh-bvh`; check it can be vendored as ES modules with no build step, and which three versions it supports), or a small custom one (the scenes are a few thousand flat polygons on a backdrop). A cheap alternative is exporting a scene for Blender/Cycles (glTF with camera, light and material), which is how the reference renders were made. Deliverable: a recommendation with sample renders (sculpture look with AO, glass, depth of field) and render times at 2048².

### R10. Paper finish
Off-white paper tone, optional grain (noise in screen space, fixed per pixel so it does not crawl when the shape turns), optional AO. Part of the paper look; separate because it is easy to overdo. Possibly hatching for shaded faces, if the owner wants it.

### Older ideas, still open
- **R11. Staging**: a backdrop or floor with a soft contact shadow, studio light presets. Part of the sculpture look. *Refs:* `Figure_6.png`, `Figure_9.png`, `hfgdhfgjd.png`.
- **R12. Glow lines and bloom**: emissive edges plus `UnrealBloomPass` (vendored). The glowing-lines look. *Refs:* `ref.jpg`, `untitlettzd.png`.
- **R13. Tubes and subdivision**: inset all faces, delete the inner faces, solidify, Catmull–Clark subdivide. The tubes look. *Refs:* `hfgdhfgjd.png`, `unsstitled.png`.
- **R14. Smooth-shaded subdivision** of non-convex shapes, for folded and crumpled looks. *Refs:* `Screenshot from 2026-10-21 16-20-56.png`, `fig5.jpg`, `untitled4.png`.
- **R15. Fake subsurface scattering**: wrap lighting `max(0, (N·L + w)/(1 + w))`, a tinted back light, a thickness term from AO or a back-face depth pass; or three's `sheen` and `transmission`. The soft look. *Ref:* `Figure_6.png`.
- **R16. Real glass**: `transmission`, a thickness, a rough backdrop to refract; or from the path tracer. *Ref:* `Figure_7.png`.
- **R17. Per-face painting**: click a face, or its whole orbit, to colour it. Needs a raycast and the triangle-to-face map the fan layout already has; overrides in the URL, compressed. Mathy look only.
- **R18. Turntable export** (GIF or WebM).
- **R19. Orthographic camera toggle**; for now a 2° field of view works.
