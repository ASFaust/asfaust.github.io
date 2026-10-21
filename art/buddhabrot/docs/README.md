# Buddhabrot Explorer: Start Here

This folder documents the Buddhabrot page at `art/buddhabrot/` on the personal website (repo root: `repo/`). Read this file first; [backlog.md](backlog.md) holds the task list.

## What the page is

An interactive page in the website's *Generative* section, still marked **(WIP)** in its title and in the home-page link (`repo/index.html`). It computes a Buddhabrot in the browser: it picks starting points `c`, traces their orbits under `z ← z² + c`, and counts every orbit point in a histogram. A display pipeline (scaling, normalization, clipping, blur, gradient) then turns the histogram into an image. That pipeline runs without recomputing the orbits.

It is a port of the owner's desktop app **Buddhabrot Explorer** (`/home/andi/code/github-website/buddha/`, outside the website repo; Python, PySide6, Numba). Differences from the desktop app:
- **Inside/outside pairs.** The desktop app takes its pairs from a coarse Mandelbrot image; the web page pairs a point on a circle with a fixed point on the real axis, or with a random point of the main cardioid or the period-2 bulb.
- **New in the web page:** the Metropolis method for zoomed views, the uniform sampler, histogram equalization and percentile normalization, and the gradient editor.
- **Dropped:** the desktop pre-invert and post-invert options. "Reverse" in the gradient editor covers post-invert.
- **Desktop presets still load.** Their matplotlib colormap names map to gradients for gray, hot, cividis and twilight, and they are normalized by the maximum, as on the desktop.

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
js/compute.js     worker pool and the pipeline compute(p, ui) → { data, res, b, total }; no DOM
js/worker.js      escape test, boundary refinement, orbit tracing, Metropolis chains; one histogram per worker
js/display.js     histogram → canvas: blur, scaling, normalization, gradient lookup table; histogram plot
js/view.js        zoom and pan of the finished image (CSS transform); region() maps the visible part to bounds
js/gradient.js    gradient editor (draggable stops, picker, presets, reverse)
js/presets.js     built-in and localStorage presets, JSON export and import
js/files.js       stamp() for file names, download()
js/rng.js         mulberry32 rng(seed), mixSeed(seed, salt, i)
tests/screenshot.mjs   headless Chrome: screenshot, console errors, values of JS expressions
```

### Data flow of one render

`main.generate()` copies the settings and calls `compute(p, ui)`. The `ui` callbacks drive the progress bar and the label of the Generate button, and `ui.live()` reports whether this run is still the current one.

1. **Starting points.**
   - The **boundary** sampler sends `refine` jobs to all cores. Each sample bisects randomly between an outside point and an inside point for `refine_steps` steps and keeps the outside end.
   - The **uniform** sampler draws points from the disk `|c| ≤ 2` on the main thread.
2. **Histograms.** Each tracing worker gets `histInit`, which creates its own histogram. The number of tracing workers is capped so that all histograms fit into 768 MB.
   - **Boundary method:** `trace` jobs.
     - With the boundary sampler, every orbit point counts, including points of orbits that never escape. The Gaussian "nearby" clouds rely on this to fill the body.
     - With the uniform sampler, only escaping orbits count.
   - **Metropolis method** (uniform sampler only):
     - `seed` keeps the starting points whose orbits reach the view.
     - Each chain starts at a random kept point.
     - `metro` runs the chains with expected-value splatting: each orbit adds weight `a/f` to each of its `f` points in the view, so the histogram is a `Float64Array`.
3. **Combine.** `histGet` hands every worker's histogram back, and they are summed into one `Float32Array`.
4. **Display.** `display.render(canvas, result, st)` draws the image and returns 256 brightness bins for the histogram plot. Display inputs call only `scheduleRender()`, at most once per animation frame, never `compute`.

**Stopping** terminates the workers (`killPool()`), and their pending promises never settle. The run is dropped because `genId` has moved on, and the next run starts fresh workers.

## Conventions

- **Axes.** Image rows follow the real axis (`xmin` at the top, `xmax` at the bottom); columns follow the imaginary axis (`ymin` on the left). This puts the figure upright. The histogram index is `(fx | 0) * res + (fy | 0)`.
- **Settings keys** are snake_case and match the desktop app's preset JSON (`max_iter`, `soft_points`, …). The web-only keys are `method`, `sampler`, `inside_point`, `inside_real`, `outer_radius`, `chain_length`, `burn_in`, `large_step`, `mutation_min`, `mutation_max`, `normalize`, `norm_percentile` and `gradient`.
- **Validation.** `st` is changed in place: `setState(data)` sanitizes `data` and assigns the result to `st`, so every module sees the same object. `sanitize()` is the only validation: it clamps every number, falls back to the default for any unknown option, and enforces one rule: **the boundary sampler means the boundary method on the default bounds.** Bisection has no known density, so it cannot drive Metropolis, and without Metropolis a zoomed view is mostly noise.
- **Input element ids.** `p-<id>` is a setting's input and `v-<id>` its shown value. `SLIDER_IDS` and `NUMBER_IDS` in `state.js` map each setting to its id.
- **Sliders that span decades** store a position from 0 to 1000 and map it through `SLIDERS[key].from/to`, which are logarithmic and use the desktop app's ranges.
- **Gradients** are strings of `rrggbb@position` stops, sorted by position. The display uses a 1024-entry lookup table interpolated in sRGB.
- **URL hash** holds every setting that differs from its default, as `key=value` (booleans as 1 or 0).
- **Reproducibility.** The same seed and settings give the same image on the same machine. Each chunk of work seeds its generator with `mixSeed(seed, salt, chunkIndex)` (salts 0 to 4, one per stage). The chunk sizes depend on `navigator.hardwareConcurrency`, so another machine with a different core count gives a different image.
- **Code style.** The moved code keeps its original style: `var`, `function`, terse helpers, and comments that explain *why*. The site's other pages use `const` and arrow functions; modernizing is a backlog item. Identifiers and visitor-facing text use British spelling (`colour`), as elsewhere on the site, but the settings keys keep the desktop app's names.

## Running and testing

- **Serve the website:** run `python3 -m http.server 8765` in `repo/`, then open `http://127.0.0.1:8765/art/buddhabrot/`. Module workers do not load from `file://`.
- **Screenshot:** `node tests/screenshot.mjs <url> <out.png> [waitMs] [js…]`.
  - It needs Node 22 and `google-chrome`.
  - It prints console errors and the value of each JS expression; an argument `sleep:ms` waits instead.
  - `SIZE=390x844` gives a phone-sized window; the default is 1400 × 900.
- **Regression check for refactors.** Rendering is deterministic on one machine, so a hash of the canvas pixels must not change. Before the change, hash a few URLs that cover all paths, for example:
  - `#samples=20000`
  - `#sampler=uniform&method=metropolis&samples=2000&xmin=-0.5&xmax=0&ymin=0.4&ymax=0.9&resolution=400`
  - `#samples=20000&nearby_points=20&soft_points=1&blur_px=2&normalize=percentile&scale_mode=log&gradient=000000@0,ff0000@0.4,ffffff@1&min_clip=0.1`

  Compare the hashes after the change. Use this expression, with a wait of about 12000 ms:
  ```
  (()=>{const c=document.getElementById("canvas");const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let h=0;for(let i=0;i<d.length;i++)h=(Math.imul(h,31)+d[i])|0;return c.width+":"+h})()
  ```
- **Layout check:** run it at 1400×900, 900×600 and 390×844. `document.documentElement.scrollHeight` must equal `innerHeight`, and the sidebar's `scrollWidth` must equal its `clientWidth`.

## Decisions and their reasons

- **Split into modules** (2026-10-21). The page was one 1,500-line `index.html` with the worker in a `<script type="text/plain">` loaded from a Blob URL. The split moved the code without changing behaviour: the canvas hashes matched before and after.
- **Same layout as the mandelbrot page.** The "How it works" text moved into the Info dialog, the intro line became the dialog's lede, and the timing of the last render moved from the hint text into the stats line under the buttons.
- **The display runs on the main thread** from a `Float32Array`, because the display sliders must respond while dragging. Its caches: the blurred histogram (per result and radius), the scaled buffer, and the lookup table (per gradient).
- **Workers are terminated, not cancelled**, so a new run always starts clean.
- The owner works with a fresh Claude Code session per task. Keep these docs current, and record findings, including negative results, where they belong.
