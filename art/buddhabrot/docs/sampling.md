# Sampling, Metropolis, colouring and normalization (open research)

These are the page's main open problems, as the owner described them on 2026-10-21, with the analysis done so far. The task list is in [backlog.md](backlog.md).

## Two types of render

The owner's distinction; every sampling decision should say which type it serves.

- **Type A, artsy.** Few samples very close to the set, with long orbits, and optionally "nearby points". The images look asymmetrical and splotchy, which is the appeal. Goal: a wide variety of boundary points, so that every detail gets drawn.
- **Type B, classical.** Many samples and no nearby points. These are the classical Buddhabrots, and also the deep zooms. Goal: varied, very long orbits. Finding *weird* orbits matters less.
- **Both types:** the orbits should cover the Buddhabrot evenly. The body must not get far more samples than the bulbs, for example.

**The owner's examples** (2026-10-21; the paths are URL hashes for the page):
- **Type A, liked:** `#samples=567&max_iter=100000&resolution=4000&refine_steps=80&seed=1912048864&scale_mode=log&gradient=000000@0,b4140a@0.35,ffb928@0.7,ffffff@1&min_clip=0.143&max_clip=0.778&soft_points=1&blur_px=0.32`
- **Type B made with bisection, liked:** `#samples=1834581&max_iter=100&resolution=4000&refine_steps=200&seed=158873937&min_clip=0.623&soft_points=1&blur_px=0.4`
- **Type A with a flaw:** `#samples=44&nearby_points=1496&nearby_spread=0.0001&max_iter=10000&resolution=4000&refine_steps=200&seed=124698967&min_clip=0.623&soft_points=1&blur_px=0.4`. The body is full of detail while the head is nearly empty.

**Picks from the type A contact sheet** (https://claude.ai/artifact/8DtXzuTi62u3Mrf9wxreM5):
- Nearly the whole grid of 200 to 2,000 samples × 10⁴ to 10⁶ iterations, plus 10 refine steps.
- Not picked: the nearby-point and orbit-length-colouring tiles.
- **No orbit-length colouring for type A** (owner: it doesn't look good).
- The owner considers one example too little and plans to supply more.

**Nearby points: their purpose (owner).** Long orbits keep revisiting a few attraction points, which gives very high counts in a few pixels; a single sample shows this as a few tight clusters. Nearby points have similar orbits, slightly shifted, so they blur those counts into filled areas.

**Only diverging nearby points count** (owner's suggestion, implemented 2026-10-21; the owner: "really good").
- Before, nearby points inside the set counted too, with all `max_iter` points of their never-escaping orbits. Inside the main cardioid, those orbits spiral into attractors in the body, so the body filled with smooth patches. That was the main cause of the flaw in the third example.
- Now a nearby point that does not escape is drawn again, up to 8 times.
- Measured on the third example: the large smooth patch in the lower body mostly disappeared, and the blobs became sharper. The body is still busier than the head, though (see the backlog).

## Metropolis

**What it should do (owner).** Oversample *the same distribution that produced the zoomed-out image*, so that a zoom of that image becomes sharper without changing its look.

**What it does (`worker.js` `metro`).**
- The chains run over the starting point `c`. Their target is `p(c) · f(c)`, where `p` is the sampler's density and `f` the number of orbit points of `c` inside the view.
- A small step has a log-uniform radius and is symmetric. A large step is drawn from `p` itself, a point of the grid sampler's density. (The uniform sampler, with large steps uniform on [−2, 2]², was removed on 2026-10-21.)
- A small step is accepted with probability `min(1, p′f′ / (p f))`, and a large step, being drawn from `p`, with `min(1, f′/f)`. `p` is the grid sampler's cell weight (`weight()` in `grid.js`).
- Each orbit spreads total weight 1 over its `f` points (expected-value splatting), so the result is the `p`-image of the view: the same distribution as a zoomed-out render with that sampler.
- The chains do not start inside the view. Their starting points can lie anywhere; only the orbits have to cross the view.
- Metropolis needs a sampler with a known density. The bisection sampler has none, so it cannot be used with Metropolis.

**The bias, found and fixed (2026-10-21).**
- **Setup.** View `x ∈ [−0.5, 0]`, `y ∈ [0.4, 0.9]`, 64², `max_iter` 1000. Histograms normalized to sum 1 and compared by L1 distance.
  - The reference is the mean of two 20 M-sample brute-force renders with the same sampler. Two such renders with different seeds differ by 0.047 (uniform) or 0.007 (grid).
  - Method: call `compute()` from `js/compute.js` through `import()` inside the page, via `tests/screenshot.mjs`. It needs no DOM.
- **The old code started chains at uniformly chosen seeds.** These are the `p`-samples whose orbits reach the view, so they follow `p` restricted to `f > 0`, not `p·f`. Until the chains mixed, the 1/f weights over-counted orbits with few hits (uniform sampler, 20,000 chains):

  | Chain setting | Metropolis vs Metropolis (own noise) | vs reference |
  |---|---|---|
  | 1,000 steps, burn-in 200 | 0.029 | **0.132** (biased) |
  | 1,000 steps, no large steps | 0.030 | **0.212** (biased) |
  | 10,000 steps, burn-in 2,000 | 0.024 | 0.029 (unbiased) |

  The page defaults were only 100 steps with burn-in 20, so real renders were badly biased.
- **The fix.** Draw each chain's start from the seeds with probability proportional to `f`, which `seed` already computes. The chains then start in their stationary distribution:

  | Chain setting, burn-in 0 | Own noise | vs reference |
  |---|---|---|
  | Uniform sampler, 1,000 steps | 0.058 | 0.045 |
  | Grid sampler, 1,000 steps | 0.022 | 0.016 |
  | Grid sampler, no large steps | 0.025 | 0.020 |

  Every difference is now within noise. Burn-in is barely needed any more; it matters only when the pool of seeds is small.
- **Efficiency.** In this moderate zoom (a view 0.5 wide), Metropolis with the uniform sampler is not less noisy per orbit than brute-force uniform sampling. Its advantage is for deep zooms, where few brute-force orbits hit the view. This has not been measured in time yet; brute-force orbits that miss the view are cheap.
- **Next.** Measure deep zooms in time per noise level, and hide the Metropolis controls behind automatic choices. This is the backlog item "Make the zoom work". The absolute scale from the seeding stage's mean `f` is done (see the last section).

### Choosing the Metropolis settings (2026-10-21)

The page no longer exposes chain length, burn-in, large step and mutation radii: zoomed views use Metropolis automatically (`METRO` in `compute.js`), and **Samples counts orbits** in both methods, so a zoom runs samples / 300 chains.

**Measurement** (`tests/metro-tuning.js`): four views (the shoulder 0.5 wide, seahorse valley 0.1 and 0.01 wide, the minibrot at -1.7548 0.004 wide), `max_iter` 5000, 128 px. Reference: 8·10⁶ chain steps, two seeds. Each candidate: 4·10⁵ steps, two seeds, L1 to the reference; score err² × time (lower is better at equal effort). Times barely differed (≈0.35 s), so the score is mostly err².

| | shoulder 0.5 | seahorse 0.1 | seahorse 0.01 | minibrot 0.004 |
|---|---|---|---|---|
| L = 10 | **3.8** | 14.8 | 170 | 186 |
| L = 30 | **3.5** | 12.0 | 85 | 85 |
| L = 100 | **3.7** | 10.5 | 64 | 55 |
| L = 300 | 4.2 | **10.1** | **61** | **46** |
| L = 1000 | 5.2 | **9.9** | 63 | **44** |

At the best chain length: a large step of 0.01 scored about the same as 0.05; 0.2 was 10–20 % worse and 0.5 about 70–100 % worse in deep views. The largest radius 0.1 scored like 1, and 0.01 was 30–75 % worse. A burn-in of 20 changed nothing, as expected now that chains start from f-weighted seeds.

**Chosen at first:** chains of 300 steps (at most 20 % off the best anywhere), burn-in 0, large step 0.02, radii 1e-7 to 1 times the view. Revised the same day, below. `tests/distribution.js` confirms them unbiased (L1 to brute force 0.015 against Metropolis's own 0.018, scale 1.005).

**Seeding fix found on the way.** Seeding tested as many points as there were chains, so few long chains (400 chains of 1000) found no orbit into a deep view at all. It now tests at least 200,000 points per batch (`SEEDING.min`), and the norm divides by the points tested.

**Revision: a lopsided minibrot (owner).** The minibrot at -1.7549 (view 0.07 wide), which lies on the real axis and should be mirror-symmetric, came out lopsided and different with every seed. The owner suspected the large step. Measured at 128 px, three seeds (variation between seeds as L1; lopsidedness as L1 between the image and its mirror):

| | between seeds | lopsided | time |
|---|---|---|---|
| 200,000 seeding points, large step 0.02 | 0.215 | 0.199 | 1.4 s |
| large step 0.2 | 0.241 | 0.232 | 1.2 s |
| large step 0.5 | 0.309 | 0.294 | 1.4 s |
| 2 million seeding points | 0.124 | 0.121 | 2.3 s |
| 20 million seeding points | 0.101 | 0.100 | 7.9 s |

- The lopsidedness is the noise between seeds: it is a variance problem, not a bias.
- **Larger large steps make it worse:** in a small view nearly every large step proposes a c whose orbit misses it and is rejected.
- **The cause was too few seeds:** few of 200,000 seeding points reach a small view, and chains that share few starts stay near them.
- But seeding more is not free everywhere: in seahorse 0.01 it cost 2.5× the time for no gain (0.308 → 0.293).

**Now:**
- **Adaptive seeding:** after the first 200,000 points, seeding doubles until there is a seed per chain, up to as many seeding points as the batch traces orbits. Views with seeds enough cost nothing extra.
- **Chain length from the view's width:** 30 / width steps, between 30 and 1000 (`METRO`), following the measurements: 30–100 best at width 0.5, 300–1000 at 0.1, 1000 below. Longer chains also need fewer seeds.
- Minibrot: 0.215 → 0.117 between seeds at about the same time; it renders symmetric with any seed. Seahorse 0.01: 0.294 in 0.6 s, against 0.308 in 0.4 s before. `tests/distribution.js`: unbiased (L1 to brute force 0.012 against Metropolis's own 0.017, scale 0.994).
- **A note for experiments:** run them on a page loaded with `#samples=1`. Otherwise the page's own startup render shares the worker pool with the experiment, and their messages get mixed up (one run failed that way).

**Still open: zooms look grey and noisy at the default 2 million orbits** (seahorse 0.1 wide, 2000 px). Two causes, seen separately: whole-set brightness puts a region that is bright everywhere into the upper ranks, which equalization with the default clip renders as flat grey (min clip 0.85 brings the structure back); and each orbit adds only its few points inside the view, so 2000 px get few hits each (20 million orbits, 4 s, are cleaner; 700 px too).

## Densities for the starting points

The goal is to sample long orbits more often, because they contribute more. Every option needs a *known* density, so that Metropolis can use it.

Status: option 2 is implemented as the **grid sampler**, which the owner is content with for type B (2026-10-21); options 1 and 3 have not been tried. The uniform sampler was removed on 2026-10-21.

1. **A region around the border, plus rejection.** Define a region around the boundary by hand, and reject points that land inside the set (cardioid and bulb tests, then the escape test).
2. **Edge detection on a coarse Mandelbrot grid.** This was the owner's earlier desktop version, an approximation of sampling the boundary uniformly.
   - Mark the cells whose corners are partly inside and partly outside, choose a marked cell uniformly, and draw a uniform point within it. The density is then known and piecewise constant.
   - The old version had problems:
     - **Aliasing.** Probably from sampling grid points rather than uniform points within cells.
     - **A bright line in the middle.** Likely the same cause: points exactly on the real axis keep orbits on the axis.
     - **A visible "resolution of the invisible Mandelbrot render" control**, which confused users. Set it automatically instead.
   - It also caught the **small Mandelbrots floating around the main one**, which looked nice and got lost with the current bisection sampler.
   - Cells can be reweighted freely (by mean orbit length, or per region to even out body against bulbs), and the density stays known.
3. **Bisection with an estimated density.** Run the current bisection sampler, histogram its outputs on a fine grid, and use that piecewise-constant histogram as `p`: choose a cell by weight, then a uniform point in it. An earlier chat also found a way to get a density from the bisection sampler; that chat is lost, so this idea needs reconstructing.

### The grid sampler (option 2, implemented 2026-10-21)

**How it works** (`borderGrid()` in `compute.js`, helpers in `grid.js`).
- A fixed 1024² grid covers `[−2, 0.5] × [−1.25, 1.25]`, with its vertices shifted half a cell off the real axis. The workers test the vertices for escape (`grid` message).
- A cell is marked when its corners disagree within `max_iter`, and the marks are widened by one cell.
- The marks are blurred with a Gaussian of `GRID.blur` = 2 cells, and the blurred values are the cell weights; weights below 0.001 are dropped.
- A sample picks a cell by weight, then a uniform point within it. The density is known (piecewise constant), so Metropolis can use it.
- The grid is cached for each `max_iter`. Its resolution and blur are not exposed in the UI, but `GRID` is exported for experiments.

**Findings.**
- **Efficiency.** In the Metropolis test view, 20 M grid samples have about seven times less noise than 20 M uniform samples (L1 between seeds 0.007 against 0.047). Over the whole set, 2 M samples take 0.9 s at `max_iter` 2000, and the image is smooth.
- **Minibrots come back.** The small Mandelbrots floating around the main figure show up, as in the owner's old version.
- **Floating squares (fixed by the blur).**
  - The cause: every orbit's first point is `z₁ = c`, so the sampling density appears in the image as one layer, and later iterates add distorted copies.
  - With hard-edged cells, the isolated marked cells near tiny minibrots drew as squares and diamonds. The uniform sampler's disk background has the same cause.
  - Blur 2 turns them into small soft glows, and blur 4 softens them further. Blur 0, 2, 4 and 8 were compared, both over the whole set and in a Metropolis zoom (`x ∈ [−1.3, −0.5]`, `y ∈ [0.4, 1.2]`).
  - The blur also gives thin, isolated structures less weight than dense stretches of the boundary.
- **Bright line on the real axis (fixed by the half-cell shift).**
  - The cause was a grid artifact. With an even number of rows, one row of vertices lay exactly on the real axis, where the antenna `[−2, −1.4]` belongs to the set. So every cell along the antenna was marked, although the antenna has no area.
  - Its band drew a bright line, brightest along the antenna (the `z₁ = c` imprint), with a fainter continuation from the orbits trapped near the axis.
  - Blurring only widened the line. The half-cell shift removed it completely.
  - Lesson: any grid feature that lines up with the set's symmetry axis biases the density.
- **Even coverage: settled.** The owner is content with the look and density of type B renders from this sampler (2026-10-21). Cells could still be reweighted, by mean orbit length or per region, without losing the known density.
- **Metropolis with the weighted density** is checked by `tests/distribution.js`: the differences from the reference are 0.015 to 0.022, against its own noise of 0.018 to 0.036, so it is unbiased.

## The bisection sampler (type A)

**History.**
- At first, bisection ran between a point on a circle of radius 4 and an inside point: a fixed point on the real axis, or a random point of the cardioid or period-2 bulb.
- The owner found that the inside points shape the image strongly, random ones looking much better than fixed ones, and that this sampler missed the minibrots. A random segment from the cardioid rarely crosses them.
- Since 2026-10-21 (owner's design), the pairs come from the border grid instead. Each sample takes a random mixed cell (corners disagree) and pairs one of its inside corners with one of its outside corners, a cell apart. Then `refine_steps` random bisection steps march the pair closer, and the outside end is kept.
- Mixed cells are spread evenly along the boundary, minibrots included, so coverage is even, and no circle or resolution control is exposed. The density is unknown, so there is no Metropolis.

**Findings.**
- **A bright ring at radius 2 came from bisecting too far.**
  - Starting a cell apart (about 0.0025), 80 steps push the pair far below 1e-10. That close, rounding errors amplified along thousands of iterations decide the escape test, and those orbits pile up at radius 2.
  - Measured as ring brightness at radius 1.99 to 2.01 over its neighbourhood, by refine steps: 5, 10, 20 steps → 1.0; 40 → 1.15; 80 → 4.4.
  - Fix: bisection stops once the pair is 1e-10 apart (ratio 0.96 even at 200 steps; with 1e-12 it was still 1.22), and the default dropped from 80 to 40 steps.
- **The new sampler shows the minibrots,** and takes 1.5 s for 200 k samples at `max_iter` 2000.

## Head and body balance (implemented 2026-10-21; the first purely artistic setting)

The owner's complaint: with few bisection samples, the body fills while the head stays nearly empty. Since this is a taste decision, not a correctness one, it is a slider (`balance`, "Head and body"), not a fixed rule.

**Measurement** (3,000 bisection samples, `max_iter` 10⁴; image bands by Re z: −2 | −1.25 | −0.75 | −0.25 | 0.25 | 1).
- **Every start region gives orbits of about the same mean length** (6,300 to 7,600 points). So a region's share of the image equals its share of the starting cells.
- **The starting cells by Re c:** −2 to −1.75: 0.4 %; −1.75 to −1.25: 4.5 %; −1.25 to −0.75 (head bulb): 20 %; −0.75 to −0.25: 28 %; −0.25 to 0.5: 48 %.
- **Only head-family starts draw the head.** About 45 % of their points land in the head band, against almost none from the cardioid side.
- **By component** (the period of the cycle at the cell's inside corner, which converges after 10⁴ iterations): main cardioid 11 %, head bulb 5 %, and the rest spread over more than 100 smaller bulbs and minibrots. So weighting by period would let tiny components dominate.

**Implemented: family weighting** (`familyWeights()` in `compute.js`).
- The boundary splits into the cardioid family and the head family at Re c = −0.75, where the two components touch. Each cell is weighted by its family's cell count^−t.
- **t = 0:** today's sampling, about 75/25.
- **t = 1:** 50/50.
- **Head band of the image:** 15.2 % at t = 0, 19.3 % at 0.5, 24.0 % at 1. Visually, at 1 the head is bright and detailed while the body stays full.
- **The default is 0.5.**

**Tried and dropped: weighting by image crowding** (negative result).
- Each cell got one representative orbit, and all of them went into a coarse picture. Cells were weighted by the mean, or the harmonic mean with a floor, of that picture's crowding along their orbit, raised to −t.
- This does even out the image, but it lifts the bottom of the figure (Re z > 0.25: 13 → 21 %), not the head (15 → 12.5 %). Per unit area, the bottom is sparser than the head, and orbits from head cells spend half their points in the crowded body.
- The look: spread out, with fuller lower lobes and more floating minibrots. That could come back as a second artistic slider if wanted.

## Colouring by orbit length (implemented 2026-10-21)

**What the owner asked.** The standard Buddhabrot colouring goes by escape time. How should it combine with the gradient colouring? Perhaps two colour modes.

**Implemented as two colour modes**, "gradient" and "by orbit length" (`colour_mode`).
- **Bands.** The workers bin each orbit by its escape iteration into three histograms: up to `band_short` (default 50), up to `band_mid` (500), and the rest. Orbits that never escape count as long.
- **Generation settings.** The mode and the band limits change what is computed, so they take effect on Generate. A note appears if the current image lacks bands, and the image falls back to the gradient until then.
- **Channels are nested, as in the classic picture:** short, short + mid, and everything. Each channel goes through the same normalization and clip, then adds its colour (default blue, green, red), saturating at white.
- **Channel brightness** (`channel_norm`):
  - **separate** (default, the classic look): each channel is stretched by its own statistics.
  - **shared:** every channel uses the statistics of the all-orbits channel, which keeps the true mix.

**Findings** (grid sampler 4 M samples and bisection 200 k samples, `max_iter` 2000).
- **Equalization washes out to white in both channel modes.** It stretches every channel fully, so the sum saturates. The other scalings keep the colours, and the UI says so.
- **Root scaling, separate:** the classic Nebulabrot, with a blue halo, a white body and an orange core.
- **Shared:** a warm-gold mix with the grid sampler, and nearly pure red with bisection, whose near-boundary samples escape late. This is honest, but monotone.
- **Nested and disjoint bands look nearly the same,** so only the classic nested form was kept.
- **With bisection, the default limits 50/500 leave the short channels nearly empty.** 200/1000 works better. Limits relative to `max_iter` (1 % / 10 %) were compared at 500, 5000 and 50,000 iterations on the review sheet; the **owner keeps the fixed limits** (2026-10-21).
- **Owner: no orbit-length colouring for type A;** it doesn't look good there. Use it for type B.
- **Memory.** Three bands triple the histogram memory, and the tracing workers are capped accordingly.

## The haze (built and removed, 2026-10-21)

A "Haze" slider added the classical nebula around the figure: the expected density of the short orbits of c drawn uniformly from the disk |c| < 2 (4 million samples, 1000 iterations, 400 px, blurred), mixed into the counts by weight at display time. The owner asked for it, then withdrew the request (misremembered), and it was removed the same day. If it ever comes back, the findings were:
- each orbit's first point (c itself) has to be left out, or uniform c draw the edge of the disk across the view's corners;
- useful weights ran from about 30 to 300, since per sample the haze is far fainter than the counts near the figure;
- on type A it mostly brightened the figure, because it lifts the median that log scaling is relative to;
- with orbit-length colouring it flooded the short (blue) channel.

## Escape radius for recording

Orbits used to be recorded only while `|z| ≤ 2`, so the view's corners beyond radius 2 always stayed black. Since 2026-10-21 (owner), recording goes on until `|z|` exceeds the distance of the view's farthest corner from 0, at least 2 (`bail` in `histInit`). Escaping orbits then add their last points out there. Set membership (the grid and the bisection) still uses radius 2.

## Normalization across zoom and resolution (implemented 2026-10-21)

**The goal (owner).**
- A zoom should keep the zoomed-out render's normalization; otherwise its look changes unpredictably.
- Different resolutions of the same view used to look very different, because counts per pixel scale with pixel area.

**What is implemented.**
- **Units.** `compute()` returns `norm`, and `data × norm` is in hits per starting sample per unit area of the plane.
  - Brute force: `norm = 1 / (samples traced × pixel area)`.
  - Metropolis: each step spreads weight 1 over the view, so the histogram estimates `E_π[hits/f]`, with `π ∝ p·f`. Then `norm = E_p[f] / (chains × steps × pixel area)`, where `E_p[f]` is the mean `f` over all seeding samples.
  - `tests/distribution.js` checks this as `scale`, the total of a Metropolis render over brute force. Results: grid 0.985 to 1.005; uniform 0.93 to 1.08. The uniform spread comes from the noise in `E_p[f]`, because few of its 20,000 seeding samples reach the view.
- **One quantile table per image** (`stats()` in `display.js`).
  - It holds the quantiles of the non-zero pixel values at about 2,300 levels, denser in the bright tail. It is computed once per image and blur, not on every slider move.
  - The scalings read from it:
    - **linear, nth root and log** scale up to its top value,
    - **equalization** gives a pixel its level, its mid-rank among the non-zero pixels.
  - Percentile normalization also read from it, until the owner removed it (the max clip covers it).
  - Scaling is monotone, so scaled quantiles are the quantiles of scaled values.
  - **log** is `log(1 + d/median)`, which does not depend on the units either. It used to be `log(1 + count)`, which changed with the number of samples.
- **Zooms borrow the whole-set table.** `main.js` keeps the last whole-set render as `reference` and passes it to `render()` for zooms whose `refKey()` matches: same sampler, `max_iter`, nearby points and bisection settings. The stats line says which brightness a render uses.
- **Blur** is given in pixels of a 1000-pixel image (σ = `blur_px × res / 1000`).

**Findings.**
- **Resolution.** Log + percentile (since removed) at 400 and 1600 px with the same samples look practically the same.
- **Equalization still depends on resolution when samples are sparse.** At 1600 px the outer halo is darker, because most of its pixels hold counts of 0 or 1 and equalization ranks noise. That is inherent to equalization; it improves with more samples.
- **Zoom.** A Metropolis zoom with the whole-set table matches a crop of the whole-set render in both log + percentile (since removed) and equalization. With its own table, equalization brightens the zoom clearly.

- **Background reference** (2026-10-21). A zoom without a matching whole-set render renders one after itself, in the same run: 200,000 grid samples, at the resolution of the preview that a whole-set render at the zoom's resolution would have, since the zoom borrows that preview's table. That takes about 2 s at 10⁵ iterations on 32 threads. Check: the Metropolis zoom `#sampler=grid&samples=2000&xmin=-0.5&xmax=0&ymin=0.4&ymax=0.9&resolution=1000&scale_mode=equalize` comes out almost white with it, but so does that region of the whole set with 200,000 samples and the same display settings, so the look is consistent. It is the sparse-sample problem below.

**Open.**
- Should equalization count the empty pixels, or use a smoothed density, to depend less on sparsity?
