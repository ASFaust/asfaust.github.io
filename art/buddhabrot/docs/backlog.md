# Backlog

This is only the task list; [README.md](README.md) explains the code. When you finish an item:
- move it to "Done" with a date and one line,
- put any lasting findings, including negative results, into README.md.

## Sampling and Metropolis (research; read [sampling.md](sampling.md) first)

Label each experiment **type A** (artsy) or **type B** (classical), or both.

- **Make zooms look good** (B). Zooms use Metropolis automatically, with measured settings and adaptive seeding (done 2026-10-21); the checkerboard is gone (2026-10-22). Open: zooms are noisy at 2000 px. Metropolis is about 10× as efficient as direct sampling and not at a limit; the noise is Monte Carlo per pixel. Ideas, none tried:
  - **Mirroring:** the Buddhabrot is symmetric across the real axis, so each orbit's mirror image is as likely as the orbit. Splatting both doubles the samples for free wherever the view overlaps its mirror (a 2× speed-up for views on the real axis, like the minibrots). Needs the grid's density symmetric: its vertices are half a cell off the axis, so it is off by a cell.
  - **Adaptive smoothing:** blur more where counts are low and less where they are high, so faint regions lose their grain without blurring dense detail.
  - **Bright single specks in empty regions:** orbits with few hits in the view get their whole weight on those few pixels.
  → [sampling.md](sampling.md#choosing-the-metropolis-settings-2026-10-21)

- **Raise `GRID.blur`?** Faint arcs remain in minibrot zooms after the smooth density; blur 8 looked smoother in a first test. Finish the comparison (sampling.md, "Bands, and a smooth density"). Method: render a view skipping n and n + 1 points and image the difference.

## Colouring and normalization

- **Orbit-length colouring, follow-up:** a gradient per channel instead of a single colour? (Band limits stay fixed, owner's verdict.) → [sampling.md](sampling.md#colouring-by-orbit-length-implemented-2026-10-21)
- **Nebulabrot colours:** the reference's yellow-green body is not reached; the palette hardly matters while each channel is stretched on its own. "Shared" is always warm (nested channels). Ideas: a gain per channel, or disjoint bands under shared brightness. → [sampling.md](sampling.md#colouring-by-orbit-length-implemented-2026-10-21)
- **Make equalization less dependent on sparse samples.** The background reference (200,000 grid samples) is sparse enough that equalization with the default clip turns the body of a zoom white; a whole-set render with the same samples does the same. → [sampling.md](sampling.md#normalization-across-zoom-and-resolution-implemented-2026-10-21)

## Other open items

- **"Spread" as a second artistic slider?** The image-crowding weighting (tried, dropped from the code) spread the figure out and lifted the lower lobes. → [sampling.md](sampling.md#head-and-body-balance-implemented-2026-10-21-the-first-purely-artistic-setting)
- **More type A examples from the owner,** then revisit the defaults.

## Done

- **2026-10-22, UI and colour mixing (owner's list).**
  - Samples: a number field with no upper limit and buttons 1 … 10M, instead of the log slider.
  - Under the image only Generate, New seed and Stop ("Render this view" while magnified); Info in the top bar; Save PNG and Reset zoom at the top of the controls; Random as two buttons, Sensible (R) and Wild (L), in the Presets panel, with no dropdown.
  - "(WIP)" removed from the page title and the home-page link.
  - Orbit-length colours add up as light with a film shoulder instead of clipped sRGB bytes; Nebulabrot presets and the sensible Random retuned (min clip 0, midtone 0.92). Regression hashes re-recorded (only `length` and `midtone` changed).
  - Measured what equalization with a high midtone does, and why equalized images look blown out (not OKLab clipping).
  - A percentile white point for linear, root and log: measured and dropped. The brightest pixel is steady for type B (± 4 % at 2 M samples), and for type A log scaling hides its variation (owner also against baking in a percentile).

- **2026-10-22.** Soft clips (min 0.113, midtone 0.837) for the defaults, the type B presets and sensible Random; equalized Nebulabrots with a high midtone, plus "Golden Nebulabrot". The grid sampler's density became a smooth B-spline (bands in zooms). "Skip first points" setting.

- **2026-10-22.** The checkerboard in zooms was the grid sampler's cells, drawn by every orbit's first point (c itself); the first point is now left out. Measured that Metropolis is about 10× as efficient as direct sampling in a small zoom.

- **2026-10-21, samples, defaults, Metropolis.**
  - Samples up to 10⁸, processed in batches of 5 million (renders up to 5 million unchanged).
  - Defaults: a standard type B in grey (grid, 2 million, 2000 iterations, equalized, clip 0.5). The old type A defaults are the preset "Embers (type A)".
  - Metropolis settings measured and fixed (no burn-in, large step 0.02, chains of 30 / view width steps); their four controls removed; Samples counts orbits in zooms too. Adaptive seeding fixed a lopsided, seed-dependent minibrot (owner's report).
  - Tests: the regression cases pin the settings they rely on; `compute()` accepts `p.method` from tests; `tests/metro-tuning.js` added.

- **2026-10-21.** The Method setting removed: zoomed views use Metropolis, the whole set the direct method (owner). The grid sampler is labelled "near the boundary (zoomable)".

- **2026-10-21.** JSON export and import removed (the URL holds every setting), and with them the loading of desktop presets. Random gained a wild mode ("I'm feeling lucky"), chosen under Presets instead of with another button.

- **2026-10-21, presets and Random.** Presets moved to the first panel. 20 built-in presets (type A, type B with aggressive min clips, Nebulabrots, a head zoom), picked from three rounds of renders. A Random button (key R).

- **2026-10-21, review round 2 acted on** (sheet: https://claude.ai/artifact/VuuBD9KgNFouxx4ahMrCzb; picks also in its db, `review/round2`).
  - cloud is the deep sky `2f6fb8@0,6fa8dc@0.35,d8e6f2@0.75,ffffff@1`; lapis, sodium, reef, sunset and ember-ice added; orchid, ion and verdigris dropped.
  - Type A defaults: 10 refine steps, 20 nearby points @ 1e-3 (starred in both rounds). Tuning the bisection sampler is done for now.
  - Regression: the bisection and nearby cases name their old refine and nearby settings, so only the default case changed.

- **2026-10-21, review round 1 acted on** (owner's picks: gray, ice, dusk, aurora, gold, patina keep; cloud, hot, amethyst maybe; nebula, twilight drop; OKLab; band limits fixed; type A stars n3_r10 and n1_r20, but "needs more than one seed").
  - Gradients blend in OKLab. The list: gray, hot, night (the old cloud, renamed), cloud (now a sky; owner: "the background should be sky blue"), ice, dusk, aurora, gold, amethyst, patina.
  - Midtone handle on the clip bar (owner: a levels tool rather than a curves editor). `midtone`, default 0.5 = no change.
  - Regression check gained a midtone case; hashes re-recorded for OKLab (the orbit-length case kept its hash, so nothing else changed).
  - A haze slider (classical nebula) was built, then removed at the owner's request; its findings are in sampling.md.
  - Info dialog: nearby points no longer said to add never-escaping orbits.

- **2026-10-21, zoom, reference and regression script.**
  - Zooming in no longer pixelates: once the view rests, the visible part is drawn from the full histogram onto a detail canvas over the preview.
  - A zoom without a matching whole-set render gets one in the background, in the same run (200,000 grid samples).
  - `tests/regression.mjs` records and checks the canvas hashes in one command; `tests/chrome.mjs` holds the Chrome code it shares with `screenshot.mjs`.
  - Found and fixed: Metropolis renders were not reproducible (float sums in timing-dependent order). Its chunks are now pinned to workers.
  - Dropped from the backlog (owner): modernizing the JS style.
  - Review sheet published for gradients, type A tuning and band limits.

- **2026-10-21.** "Nearby distance" (1/σ) replaced by "Nearby spread" (σ in the plane, 10⁻⁶ to 0.1, wide to the right).

- **2026-10-21, head and body balance.** Measured where image weight comes from by start region. Added the slider "Head and body" (`balance`, default 0.5): family weighting of the bisection's starting cells, with t = 1 giving the head family as many samples as the cardioid family. Also fixed a hoisted `var hist` in a worker branch that shadowed the histogram.

- **2026-10-21, type A round.**
  - Nearby points count only if they diverge (owner's idea).
  - New defaults from the contact-sheet picks: bisection, 600 samples, 10⁵ iterations, 40 refine steps, 2000 px, log scaling, hot gradient, clip 0.143–0.778, blur 0.32.
  - "New seed" button (and key N) next to Generate.

- **2026-10-21, preview.**
  - The display works on a copy summed down in k×k blocks to about the stage's size in device pixels (`pooled()`). With the owner's 4000 px example, an update takes 16 ms instead of 428 ms.
  - "Save PNG" renders the full resolution, using the preview's statistics, so the file matches the preview: 0.45 s at 4000 px.
  - Type A contact sheet published for picking defaults.

- **2026-10-21, samplers reworked (owner's design).**
  - The owner is content with the grid sampler ("near the boundary") for type B, so even coverage is settled there.
  - The uniform sampler removed; Metropolis now needs the grid sampler.
  - The bisection sampler now starts from close inside/outside corner pairs of the grid's mixed cells, replacing the circle and cardioid points (`outer_radius` is gone), and stops at a pair distance of 1e-10, which removed a ring at radius 2. Default refine steps 40.
  - Orbits are recorded out to the view's farthest corner, so no part of the view stays black.
  - The method `boundary` renamed `direct`.

- **2026-10-21, display simplified (owner).** The Normalization setting is gone, together with the greying out. Histogram equalization is now a fourth scaling; the others scale up to the maximum. Percentile went away, because the max clip covers it.

- **2026-10-21, colouring by orbit length.**
  - A second colour mode with three nested orbit-length channels and a colour each, as in the classic Nebulabrot.
  - Channel brightness either separate (classic) or shared (true mix).
  - Fixed `.hidden` losing against `.param small`.

- **2026-10-21, normalization.**
  - Densities per sample and unit area (`norm`), with the Metropolis scale taken from the seeding stage's mean `f`.
  - One quantile table per image drives every normalization; log is relative to the median.
  - Zooms borrow the whole-set render's table.
  - Blur in units of a 1000-pixel image.
  - Fixed a progress-bar bug in the Metropolis stage: a reused `lo` variable.

- **2026-10-21, grid sampler fixes.**
  - The floating squares are gone: the cell weights are blurred (2 cells), and Metropolis uses the weights.
  - The bright line on the real axis is gone: grid vertices no longer lie on the axis.
  - Scaling dropdown and Root slider greyed out under equalization. (Later removed, together with the Normalization setting.)

- **2026-10-21, sampling.**
  - Metropolis bias found (the chains started at uniformly chosen seeds) and fixed: starts are now drawn with probability proportional to `f`. Verified against brute-force renders.
  - New grid sampler with a known density, which also works with Metropolis.
  - The fixed inside point removed.
- **2026-10-21, display.**
  - "Scaling" and "Root" greyed out under equalization.
  - The panel reordered to follow the pipeline (blur, normalization, scaling, histogram, clip, gradient).
  - Min/max clip merged into one two-handle bar under the histogram; the clipped parts of the histogram are drawn faint.
  - New gradients with 2 to 5 stops, with cloud replacing cividis.

- **2026-10-21.**
  - Docs set up (`docs/README.md`, `docs/backlog.md`).
  - The monolithic `index.html` split into `style.css` and the ES modules in `js/`, with module workers instead of a Blob URL. The images are pixel-identical before and after.
  - The layout adapted to the mandelbrot page: one screen with no page scroll, an Info dialog, and a stats line.
  - The histogram caption no longer overflows a narrow sidebar.
  - `tests/screenshot.mjs` added.
