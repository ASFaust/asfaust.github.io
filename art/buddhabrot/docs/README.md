# Buddhabrot Explorer: Start Here

This folder documents the Buddhabrot page at `art/buddhabrot/` on the personal website (repo root: `repo/`). Read this file first. [backlog.md](backlog.md) holds the task list, and [sampling.md](sampling.md) holds the open research on sampling, Metropolis, colouring and normalization, with the owner's two types of render (A, artsy; B, classical).

## What the page is

An interactive page in the website's *Generative* section, still marked **(WIP)** in its title and in the home-page link (`repo/index.html`). It computes a Buddhabrot in the browser: it picks starting points `c`, traces their orbits under `z ← z² + c`, and counts every orbit point in a histogram. A display pipeline (blur, scaling, clipping, colour) then turns the histogram into an image. That pipeline runs without recomputing the orbits.

It is a port of the owner's desktop app **Buddhabrot Explorer** (`/home/andi/code/github-website/buddha/`, outside the website repo; Python, PySide6, Numba). Differences from the desktop app:
- **Inside/outside pairs.** Like the desktop app, the web page takes its pairs from a coarse Mandelbrot grid (the border grid), but it bisects them much closer to the set, and the grid's resolution is fixed, not a control.
- **New in the web page:** the Metropolis method for zoomed views, the grid sampler ("near the boundary", with a known density), histogram equalization, the gradient editor, colouring by orbit length, and the clip bar with its midtone (a levels tool).
- **Dropped:** the desktop pre-invert and post-invert options. "Reverse" in the gradient editor covers post-invert.
- **Desktop presets no longer load.** JSON export and import were removed (owner, 2026-10-21): the URL holds every setting, so a link is the way to share one, and with them went the translation of desktop presets in `sanitize()`.

The Info dialog in `index.html` explains the maths for visitors; keep it in sync with the code.

## Architecture

There is no build step. The page uses plain ES modules, loaded directly by the browser; the workers are module workers. Its look and layout follow `art/mandelbrot/`:
- one screen with no page scroll: a top bar, the image with its buttons, and one scrolling column of controls,
- an Info dialog, collapsible panels, a theme toggle, and the URL as state.

The colour picker is the site-wide `<oklch-picker>` element from `repo/js/oklch-picker.js`.

```
index.html        markup: top bar, viewer, sidebar panels, Info dialog; inline theme toggle and dialog script
style.css         layout (copied from art/mandelbrot, plus the gradient editor and histogram canvas)
js/main.js        UI wiring: syncInputs() (settings → inputs), input handlers, generate/stop, progress, keys
js/state.js       settings: DEFAULTS, GRADIENTS, BUILTIN presets, slider mappings, sanitize(), URL hash; the live st object
js/compute.js     worker pool, the border grid, the head/body family weights, and compute(p, ui) → { data, res, b, total, norm, bands }; no DOM
js/worker.js      escape test, boundary refinement, orbit tracing, Metropolis chains; one histogram per worker
js/display.js     histogram → canvas: blur, scaling, clip, gradient or orbit-length colours; histogram plot
js/grid.js        the grid sampler's density: pick() a point, weight() at a point; shared by compute.js and worker.js
js/view.js        zoom and pan of the finished image (CSS transform); region() maps the visible part to bounds
                  (main.js lays the sharp detail canvas over a zoomed preview)
js/gradient.js    gradient editor (draggable stops, picker, presets, reverse)
js/bar.js         slider with one to three handles, from art/mandelbrot/js/bar.js plus a third (midpoint) handle: the clip bar
js/presets.js     built-in and localStorage presets
js/files.js       stamp() for file names, download()
js/rng.js         mulberry32 rng(seed), mixSeed(seed, salt, i)
tests/chrome.mjs       headless Chrome over the DevTools protocol, shared by the two scripts below
tests/screenshot.mjs   headless Chrome: screenshot, console errors, values of JS expressions
tests/regression.mjs   canvas-hash regression check over eight URLs; hashes in tests/hashes-<cores>.json
tests/distribution.js  expression for screenshot.mjs: does Metropolis reproduce its sampler? (L1 against brute force)
tests/metro-tuning.js  expression for screenshot.mjs: noise per effort of Metropolis settings in four zooms (minutes)
tests/balance.js       expression for screenshot.mjs: share of the image in the head and body bands, per balance value
```

### Data flow of one render

`main.generate()` copies the settings and calls `compute(p, ui)`. The `ui` callbacks drive the progress bar and the label of the Generate button, and `ui.live()` reports whether this run is still the current one.

1. **Starting points.** Both samplers start from the border grid, which `borderGrid()` builds once for each `max_iter`, from `grid` jobs. The two values of `sampler`:
   - **`bisection`** (density unknown; type A). The main thread pairs an inside and an outside corner of mixed cells, picked at random with the head/body family weights of `balance`, and `refine` jobs bisect each pair randomly for up to `refine_steps` steps (stopping at 1e-10) and keep the outside end. See [sampling.md](sampling.md#the-bisection-sampler-type-a).
   - **`grid`** ("near the boundary", known density; type B) draws points from the blurred cell weights. See [sampling.md](sampling.md#the-grid-sampler-option-2-implemented-2026-10-21).
2. **Histograms.** Each tracing worker gets `histInit`, which creates its own histogram. The number of tracing workers is capped so that all histograms fit into 768 MB.
   - **Batches.** Up to 10⁸ samples are allowed (the slider's top; clean renders for those willing to wait). Their starting points would not fit in memory at once, so `compute()` runs steps 1 and 2 in batches of `BATCH.size` (5 million) into the same histograms; the bar and the button show "Buddhabrot 3/6". The first batch is exactly the former single run, so renders up to 5 million samples are unchanged. Later batches index their random streams from `b × 2²⁰`. Metropolis sums f over all batches for its norm. Checked: four batches differ from one batch by the same L1 as another seed does, for grid, bisection and Metropolis. 30 million samples take 15 s on 32 threads.
   - **Direct method** (the whole set): `trace` jobs trace every sample.
     - Orbits are recorded until `|z|` exceeds `bail`, the distance of the view's farthest corner from 0 (at least 2), so that the corners get points too.
     - With the bisection sampler, the samples escape by construction. Their Gaussian "nearby" points count only if they escape too; one that does not is redrawn, up to 8 times.
     - With the grid sampler, only escaping orbits count.
   - **Metropolis method** (any zoomed view, so the grid sampler only; chosen by `compute()` from the bounds, there is no setting). Its settings are fixed by measurement (`METRO`; [sampling.md](sampling.md#choosing-the-metropolis-settings-2026-10-21)): chains of 30 / view width steps (30 to 1000), and Samples counts orbits, so a zoom runs samples / chain length chains. Seeding tests 200,000 points per batch and doubles them until there is a seed per chain (at most as many as the batch's orbits):
     - `seed` keeps the starting points whose orbits reach the view, with their hit counts `f`.
     - Each chain's start is drawn with probability proportional to `f`, so the chain starts in its stationary distribution.
     - `metro` runs the chains with target `p·f`. It splats expected values: each orbit adds weight `a/f` to each of its `f` points in the view, so the histogram is a `Float64Array`. The grid sampler's density reaches every worker once, with `histInit`.
3. **Combine.** `histGet` hands every worker's histogram back, and they are summed into one `Float32Array`, in worker order.
4. **Display.** `display.render(canvas, result, st, ref)` draws the image and returns 256 brightness bins for the histogram plot.
   - The canvas shows a **preview**: `pooled(result, k)` sums the histogram in k×k blocks, with k chosen so that the preview is about the stage's width in device pixels (`blockFor()` in `main.js`). Its `norm` is divided by k², so it keeps the densities. Every display setting works on the preview.
   - "Save PNG" renders the full-resolution result into an offscreen canvas, with the preview as `ref`, so the saved file uses the preview's statistics and matches it.
   - It compares densities, `data × norm` (hits per sample per unit area), through a quantile table of the image, so the look does not depend on the number of samples or the resolution.
   - **Levels:** after clipping, the midtone (`midtone`, the third handle on the clip bar) bends the clipped range with a power curve, so that its point maps to the middle of the colours.
   - For a zoom, `ref` is the preview of the last whole-set render of the same distribution (`reference` in `main.js`), whose table sets the brightness. A zoom without one (a page loaded straight into a zoom, or changed settings) renders it in the same run, after showing the zoom: 200,000 grid samples at the resolution of the preview a whole-set render would have (`REF_SAMPLES`, `refResolution()`). The button shows "Reference"; Stop keeps the zoom with its own brightness.
   - **Zooming into the image** magnifies the preview (CSS transform). 150 ms after the view stops moving, `renderDetail()` draws the visible part again from the full histogram onto a second canvas (`#detail`) over it: `crop()` in `display.js` sums that square in blocks to about the stage's device pixels, with a margin for the blur, and renders it with the preview's statistics. The detail only appears where it is sharper than the preview, and display changes redraw it.
   - With `colour_mode` set to `length`, the result holds three band histograms (`bands: 3`). `channels()` makes the three nested channels, each is normalized (separately or shared), and their colours add up.
   - Display inputs call only `scheduleRender()`, at most once per animation frame, never `compute`.

**Stopping** terminates the workers (`killPool()`), and their pending promises never settle. The run is dropped because `genId` has moved on, and the next run starts fresh workers.

## Defaults and the owner's preferences

- **The defaults are a standard type B Buddhabrot in grey** (owner, 2026-10-21): grid sampler, 2 million samples, `max_iter` 2000, 2000 px, equalization with clip 0.5–1, gray gradient, blur 0.32. About 2 s on 32 threads.
  - The bisection settings in `DEFAULTS` (10 refine steps, 20 nearby points with spread 10⁻³) are the owner's type A picks from the review sheets, judged over four seeds; they apply once the sampler is switched.
  - The former type A defaults (bisection, 600 samples, `max_iter` 10⁵, log scaling, hot, clip 0.143–0.778) are `TYPE_A` in `state.js`, the base of the type A presets, and the preset "Embers (type A)". The contact sheet that picked them: https://claude.ai/artifact/8DtXzuTi62u3Mrf9wxreM5.
- **Type A:** bisection, few samples, very long orbits, optionally nearby points; splotchy and artsy. **Type B:** many samples, classical, used for zooms; the grid sampler. Details and the owner's example URLs are in [sampling.md](sampling.md#two-types-of-render).
- **No orbit-length colouring on type A.**
- **The zoom (Metropolis) comes later.** Its controls should then disappear from the UI.
- **Band limits stay fixed** (50 and 500 iterations), not relative to `max_iter` (owner, 2026-10-21).
- **The owner likes:**
  - colourful gradients with two hues (patina), over one-hue ones,
  - aggressive min clips on type B (0.55–0.7) under equalization, which carve the figure out of its glow. Under log or root scaling a high min clip blacks the image out instead, since their brightness values sit low,
  - the diverging-only nearby points,
  - the grid sampler for type B,
  - a quick "New seed" button.

## Conventions

- **Axes.** Image rows follow the real axis (`xmin` at the top, `xmax` at the bottom); columns follow the imaginary axis (`ymin` on the left). This puts the figure upright. The histogram index is `(fx | 0) * res + (fy | 0)`.
- **Nearby spread** (`nearby_spread`) is the standard deviation σ of the nearby cloud in the complex plane, on a log slider from 10⁻⁶ to 0.1, shown as "3.2 × 10⁻⁴". It replaced `nearby_distance` (= 1/σ) on 2026-10-21.
- **The seed** sits in the Sampling panel, and the "New seed" button (key N) next to Generate picks a random one and renders, for flipping through type A renders. Generate keeps the seed.
- **Random** (key R) renders the whole set with random settings; the resolution is kept. A choice under Presets (`p-rmode`, remembered in localStorage) picks the kind, so that the button row under the image stays short:
  - **sensible** (`randomSettings()` in `main.js`): half type A, a quarter type B with equalization and an aggressive min clip (0.3–0.75), a quarter type B coloured by orbit length. Every roll gives a picture.
  - **wild**, "I'm feeling lucky" (`wildSettings()`): nearly every setting from nearly its whole range, and a gradient made up on the spot. The blur stays around 0.5 px (0.2–1.2, log-uniform), where every sensible picture sits (owner). Bounded are the work (samples capped by samples × (refine + 1 + nearby) × max iterations ≤ 2·10⁹ for bisection, 3·10⁹ / max iterations for grid) and the clips, by scaling. Fully random clips left about a third of the rolls black or flat; with the bounds, about 2 in 16 are nearly dark and a few blown out to white.
- **Presets** are the first sidebar panel. `BUILTIN` in `state.js` holds 20, each listing only what differs from the defaults: six type A, nine type B, three Nebulabrots and a Metropolis zoom of the head. The slowest takes about 7 s on 32 threads.
- **Settings keys** are snake_case and keep the desktop app's names (`max_iter`, `soft_points`, …). The web-only keys are `sampler`, `balance`, `nearby_spread`, `gradient`, `midtone`, and the orbit-length colouring keys `colour_mode`, `band_short`, `band_mid`, `colour_short`, `colour_mid`, `colour_long` and `channel_norm`.
- **Validation.** `st` is changed in place: `setState(data)` sanitizes `data` and assigns the result to `st`, so every module sees the same object. `sanitize()` is the only validation: it clamps every number, falls back to the default for any unknown option, and enforces one rule: **the bisection sampler means the default bounds.** Zoomed views always use Metropolis (owner, 2026-10-21: automatically for zooms, never otherwise), which needs a known density, and bisection has none. The sampler list calls the grid sampler "zoomable". Unknown keys are ignored.
- **No backward compatibility while the page is in development** (owner, 2026-10-21). Rename and remove settings freely; old URLs and saved presets may break.
- **Input element ids.** `p-<id>` is a setting's input and `v-<id>` its shown value. `SLIDER_IDS` and `NUMBER_IDS` in `state.js` map each setting to its id.
- **Sliders that span decades** store a position from 0 to 1000 and map it through `SLIDERS[key].from/to`, which are logarithmic and use the desktop app's ranges.
- **Gradients** are strings of `rrggbb@position` stops, sorted by position. The display uses a 1024-entry lookup table, blended in **OKLab** (owner's pick, 2026-10-21; the editor's bar uses CSS `linear-gradient(in oklab …)` to match). The presets (`GRADIENTS`) keep to 2 to 5 stops so that they stay easy to edit, start at black except cloud (a sky), and the owner wants them colourful: two hues, like patina, rather than one.
- **The Display panel follows the pipeline order:** blur → scaling → histogram with the clip bar and midtone → colour.
- **Scaling** (`scale_mode`) is linear, nth root or log, each scaled up to the brightest pixel, or histogram equalization, which maps a value to its rank. There is no separate normalization setting (removed 2026-10-21, owner's decision): percentile normalization was redundant with the max clip, and equalization ignores any scaling.
- **URL hash** holds every setting that differs from its default, as `key=value` (booleans as 1 or 0).
- **Reproducibility.** The same seed and settings give the same image on the same machine. Each chunk of work seeds its generator with `mixSeed(seed, salt, chunkIndex)`, one salt per stage (1 bisection, 2 tracing, 3 chain starts, 4 Metropolis, 5 grid sampling). The chunk sizes depend on `navigator.hardwareConcurrency`, so another machine with a different core count gives a different image.
  - Workers take chunks as they become free, so which worker sums which chunk depends on timing. Integer counts do not care, but Metropolis splats fractional weights, whose float sums depend on their order: its chunks are therefore **pinned** (worker i runs chunks i, i + n, …; `runJobs(…, pinned)`), and the histograms are combined in worker order. Before this (fixed 2026-10-21), Metropolis renders differed from run to run in the last bits.
- **Worker variables.** The worker's message handler is one function, and `var` is function-scoped. A `var` in one branch with the name of a worker global (`hist`, `grid`, `res`, …) shadows it in every branch. Use fresh names.
- **Code style.** The moved code keeps its original style: `var`, `function`, terse helpers, and comments that explain *why*. The site's other pages use `const` and arrow functions; the owner decided against modernizing (2026-10-21), since the pages already look alike. Identifiers and visitor-facing text use British spelling (`colour`), as elsewhere on the site, but the settings keys keep the desktop app's names.

## Running and testing

- **Serve the website:** run `python3 -m http.server 8765` in `repo/`, then open `http://127.0.0.1:8765/art/buddhabrot/`. Module workers do not load from `file://`.
- **Screenshot:** `node tests/screenshot.mjs <url> <out.png> [waitMs] [js…]`.
  - It needs Node 22 and `google-chrome`.
  - It prints console errors and the value of each JS expression; an argument `sleep:ms` waits instead.
  - `SIZE=390x844` gives a phone-sized window; the default is 1400 × 900.
- **Experiments** call `compute()` and the display functions directly inside the page, through `import()` in a `screenshot.mjs` expression. `compute.js` exports `GRID` (grid size and blur), `BATCH`, `SEEDING`, `METRO` and `borderGrid()` for that, and `compute()` takes `p.method` ('direct' or 'metropolis') and the Metropolis overrides `p.chain_length`, `p.burn_in`, `p.large_step`, `p.mutation_min`, `p.mutation_max`, which are no settings. `tests/distribution.js` and `tests/balance.js` are examples.
- **Head/body check for changes to the bisection sampler:** `tests/balance.js`, with reference values in its comment.
- **Distribution check for sampler changes.** Load `compute()` with `import()` inside the page and compare a Metropolis render of a zoomed view with brute-force renders, using L1 distance on histograms normalized to sum 1. Script: `node tests/screenshot.mjs 'http://127.0.0.1:8765/art/buddhabrot/#sampler=grid' /tmp/x.png 2000 "$(cat tests/distribution.js)"`, which takes about 20 s; the comments in the file explain the numbers.
- **Regression check for refactors:** `node tests/regression.mjs record` before the change, `node tests/regression.mjs` after it (exit code 1 on a difference). It serves `repo/` itself on a free port, so no server needs to run, renders eight URLs that cover every path (the defaults, type A, bisection, nearby points, grid, equalize, orbit-length colouring, the midtone, a Metropolis zoom with its background reference); all but the defaults pin the settings they rely on (`PINNED`), so that a change of defaults changes only the default case and compares hashes of the canvas pixels. About 35 s. The hashes depend on the core count, so they are stored per count, in `tests/hashes-<cores>.json`; record again after a change that alters images on purpose. Only the preview canvas is hashed, not the detail canvas or a saved PNG.
- **Layout check:** run it at 1400×900, 900×600 and 390×844. `document.documentElement.scrollHeight` must equal `innerHeight`, and the sidebar's `scrollWidth` must equal its `clientWidth`.

## Decisions and their reasons

- **Split into modules** (2026-10-21). The page was one 1,500-line `index.html` with the worker in a `<script type="text/plain">` loaded from a Blob URL. The split moved the code without changing behaviour: the canvas hashes matched before and after.
- **Same layout as the mandelbrot page.** The "How it works" text moved into the Info dialog, the intro line became the dialog's lede, and the timing of the last render moved from the hint text into the stats line under the buttons.
- **The display runs on the main thread** on a preview summed down to the screen size, because the display sliders must respond while dragging (16 ms per update with a 4000 px render). Its caches: the preview, the blurred histogram and the quantile table (each per result, in WeakMaps), and the colour lookup table (per gradient).
- **Logical against artistic settings.** Most settings follow from correctness: unbiased Metropolis, densities that stay put across resolution and zoom, no grid artifacts. "Head and body" was the first purely artistic choice. The owner wants such choices exposed as controls, never baked in.
- **Workers are terminated, not cancelled**, so a new run always starts clean.
- The owner works with a fresh Claude Code session per task. Keep these docs current, and record findings, including negative results, where they belong.
