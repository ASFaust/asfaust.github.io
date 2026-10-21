# Backlog

This is only the task list; [README.md](README.md) explains the code. When you finish an item:
- move it to "Done" with a date and one line,
- put any lasting findings, including negative results, into README.md.

## Open

- **Decide what "done" means, then drop "(WIP)".** The label is in the `<title>`, the top-bar `<h1>` and the home-page link (`repo/index.html`). The owner has not yet named the criteria.
- **Curated built-in presets.** `BUILTIN` in `state.js` holds only "Default". Possible additions: nebulabrot-like colour, deep orbits (high `max_iter`), a Metropolis zoom, and a filled body using nearby points.
- **Modernize the JS style** to match `art/mandelbrot` and `art/polyhedra` (`const`/`let`, arrow functions). Check it with the canvas-hash regression check.
- **Interpolate gradients in OKLab** instead of sRGB, as the mandelbrot page does (its `js/colour.js`). This changes how images look, so it needs the owner's eye.
- **Display speed at large resolutions.** At 4096² every slider move rescales 16 M pixels on the main thread. Measure it first; options include an OffscreenCanvas worker, or rendering at the screen size while dragging.
- **Export larger than the preview.** "Save PNG" saves the canvas at `resolution`. A separate export size, as on the mandelbrot page, would keep the preview fast.
- **Automated regression script.** The canvas-hash check is a manual procedure (README, "Running and testing"). A `tests/` script that records and compares the hashes would make it one command. The hashes depend on the core count, so it should store them per machine.

## Done

- **2026-10-21.**
  - Docs set up (`docs/README.md`, `docs/backlog.md`).
  - The monolithic `index.html` split into `style.css` and the ES modules in `js/`, with module workers instead of a Blob URL. The images are pixel-identical before and after.
  - The layout adapted to the mandelbrot page: one screen with no page scroll, an Info dialog, and a stats line.
  - The histogram caption no longer overflows a narrow sidebar.
  - `tests/screenshot.mjs` added.
