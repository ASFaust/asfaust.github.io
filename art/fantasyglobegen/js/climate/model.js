// The seasonal climate model, version 1. It steps through the year until the ocean has
// settled, then records monthly means of temperature, precipitation, evaporation, water
// vapour and near-surface wind.
//
// Temperature: a moist energy balance model. Each column gains absorbed sunlight, loses
// outgoing longwave A + B·T, and exchanges moist static energy (temperature plus the latent
// heat of its water vapour) with its neighbours by diffusion, standing in for transport by
// the Hadley cells and midlatitude storms (Hwang & Frierson 2010). Ocean columns hold the
// heat of a 50 m mixed layer, land columns little, and ocean columns lose heat where the wind
// drives cold water up (along the equator, and along coasts with the wind running down them).
// T is the sea-level temperature; the surface is colder by 6.5 K per km of height.
//
// Wind: near-surface pressure is a zonal pattern of the three cells (low at the thermal
// equator, highs near 30°, lows near 60°), shifted with the season to follow the warmest
// latitude, plus thermal lows over land warmer than its latitude and highs over land colder.
// Water warmer than its latitude lowers the pressure too. The wind is the balance of the
// pressure force, Coriolis and surface friction, so it blows down the gradient at the equator
// and turns towards geostrophic further out, and is then smoothed as eddies mix momentum,
// which carries the trade winds into the equator instead of letting them die there. It lives
// on the cell edges as normal components, so its divergence is exact and conserved.
//
// Moisture: column water vapour W (mm) is carried by that wind in flux form, so converging
// air piles moisture up and diverging, sinking air dries out, and it is mixed by eddy
// diffusion. Evaporation follows a bulk formula over the ocean and over wet land (a 150 mm
// soil bucket fed by rain). Rain grows exponentially with the column's saturation fraction,
// as observed over tropical oceans, faster where air rises or storms pass and slower where it
// sinks, and air forced up slopes rains out part of its vapour.

import { dailyInsolation, solarLongitude, EARTH_ORBIT } from './insolation.js';

export const EARTH = {
  radius: 6.371e6,           // m
  rotation: 7.292e-5,        // rad/s
  yearDays: 365.25,
  equinoxDay: 79,            // days from 1 January to the northern spring equinox
  orbit: EARTH_ORBIT,
  // energy
  olrA: 203.3, olrB: 2.09,   // W/m², W/m²/K (T in °C)
  albedo: 0.30, albedoP2: 0.09, albedoIce: 0.54, iceTemp: -11.9,
  heatDiffusion: 0.4,        // W/m²/K on the unit sphere
  landDiffusion: 1,          // its share over land, where less heat comes in from the sides
  oceanDepth: 30.9,          // m of mixed layer
  // upwelling: wind pushes surface water sideways (Ekman transport); where it diverges, along
  // the equator and along coasts with the wind running down them, cold water comes up
  upwellTemp: 16,            // °C of the water that comes up (without ocean dynamics)
  upwellEfficiency: 1.22,    // fraction of the full heat exchange
  // the ocean's warm upper layer over the thermocline, driven by the wind (a reduced-gravity
  // ocean, as in Cane & Zebiak 1985): ∂u/∂t + f k×u = −g'∇h + τ/(ρH) − r u + A∇²u,
  // ∂h/∂t = −H ∇·u − h/τ_h. The wind piles warm water up on the downwind side and draws the
  // thermocline up on the other; upwelled water is as cold as the thermocline is shallow,
  // T − (T − deepTemp) e^(−D/thermoScale) at depth D = H + h; the currents carry the heat
  // sea ice (as in Wagner & Eisenman 2015): water colder than freezing turns to ice, which
  // carries heat up by conduction, k (T_f − T)/h, so a thick sheet cuts the air off from the
  // water below and its surface cools like land; it grows from the heat it loses and melts
  // from the top once its surface reaches 0 °C, and from below by the heat the currents bring
  seaIce: true, freezeTemp: -1.8, iceConductivity: 2, iceLatent: 3.0e8, iceAlbedo: 0.54, iceHeat: 1e7, iceMinThickness: 0.2,
  iceBasalFlux: 1.83,        // W/m² from the ocean below to the ice, besides what upwelling brings
  oceanDynamics: true,
  thermoDepth: 159,          // m, H
  reducedGravity: 0.046,     // m/s², g'
  oceanDamping: 6.5e-7,      // 1/s, r
  thermoDamping: 7.7e-8,     // 1/s, 1/τ_h
  oceanMinCoriolis: 0.5,     // degrees
  oceanViscosity: 7976,      // m²/s
  deepTemp: 9.97, thermoScale: 64.2,
  currentHeat: 1.14,         // share of the upper layer's current that moves the surface heat
  ekmanLat: 2.15,            // degrees: the Ekman transport fades to nothing at the equator
  landHeat: 1.5e7,           // J/m²/K
  lapseRate: 6.5e-3,         // K/m
  // pressure and wind
  cellPressure: [-2.0, 2.0, -13.6, 4.2], // hPa: equatorial low, subtropical high, subpolar low, polar high
  lnLat: 24.8,               // degrees: within this, warm water and land are low against the whole tropics
  baroRef: 1.10, baroExp: 0.67, // K per 100 km; the eddy-driven pressures go as (gradient/baroRef)^baroExp
  thermalLow: 0.97,          // hPa per K of land warmer than its latitude
  thermalLowOcean: 0.79,     // the same over water, which drives the Walker circulation
  convectionTemp: 28.4,      // °C: the equatorial low sits over water warmer than this
  equatorialWidth: 29.4,     // degrees from the thermal equator where it can
  minCoriolis: 11.4,         // degrees: near the equator the wind turns as if this far out
  frictionOcean: 1.4e-5, frictionLand: 1.6e-5,
  eqDrag: 0, eqDragLat: 8,   // 1/s of extra drag at the equator, fading over eqDragLat degrees
  maxWind: 25.7,             // m/s
  windMixing: 697e3,         // m: eddies mix momentum this far, so the trades reach the equator
  // moisture
  wsat0: 13,                 // mm of column vapour at saturation at 0 °C, sea level
  vapourScaleHeight: 2500,   // m
  evapCoeff: 1.56e-3,        // ρ·C_E, kg/m³
  gust: 4,                   // m/s added to the wind for evaporation
  bucket: 150,               // mm
  moistureDiffusion: 4.6e6,  // m²/s
  surfaceRH0: 0.32,          // near-surface humidity under a completely dry column
  // rain rate exp(rainSteep (r − rainR0)) mm/day at column saturation r, the form Bretherton
  // et al. (2004) found over tropical oceans; rising air rains at lower r, sinking air at
  // higher. Their steepness of 15.6 holds for daily rain in one place; over a model cell and
  // a substep the onset is gentler, and 8.7 lets air carry its water as far as it does on
  // Earth (tools/metrics.mjs, Plength). The parameters of rain, wind, ocean and ice were
  // fitted to the observed climate at levels 4 and 5 and checked at level 6.
  rainSteep: 9.09, rainR0: 0.52, rhAscent: 0.1, rhDescent: 0.27,
  // a surface colder than its latitude lies under an inversion: within stableLat, the rain
  // threshold rises by rhStable per 5 K (or against the tropics' mean, stableZonal: 0)
  rhStable: 0.44, stableLat: 38, stableZonal: 1,
  rhStorm: 0.24, stormGradient: 0.76, // K per 100 km of zonal-mean gradient for full storminess
  orographicEfficiency: 0.62, oroMinRH: 0.85, // air drier than this doesn't rain going uphill
  oroScale: 189e3,           // m: heights smoothed over this for the lift (0: the grid's own)
  wtgScale: 250e3,           // m: column saturation from temperature smoothed over this (0: local)
};

const LV = 2.5e6, CP_OVER_LV = 1004 / 2.5e6, DAY = 86400;
const qsat = T => 0.0038 * Math.exp(0.0641 * T);   // kg/kg near the surface

// land/ocean from heights: the ocean is everything below sea level connected to the
// lowest point, so the Caspian or the Dead Sea count as land
export function oceanMask(ops, height) {
  const N = ops.N, ocean = new Uint8Array(N), stack = [];
  let lo = 0;
  for (let i = 1; i < N; i++) if (height[i] < height[lo]) lo = i;
  if (height[lo] >= 0) return ocean;
  ocean[lo] = 1; stack.push(lo);
  while (stack.length) {
    const i = stack.pop();
    for (let k = 0; k < ops.nbrCount[i]; k++) {
      const j = ops.nbr[6 * i + k];
      if (!ocean[j] && height[j] < 0) { ocean[j] = 1; stack.push(j); }
    }
  }
  return ocean;
}

export function runClimate({ ops, height, params = {}, years = 5, stepsPerYear = 48, onProgress }) {
  const P = { ...EARTH, ...params };
  const N = ops.N, R = P.radius, R2 = R * R;
  const ocean = oceanMask(ops, height);
  const elev = new Float64Array(N);
  for (let i = 0; i < N; i++) elev[i] = ocean[i] ? 0 : Math.max(0, height[i]);

  const yearSec = P.yearDays * DAY, dt = yearSec / stepsPerYear;
  const heatCap = new Float64Array(N);
  for (let i = 0; i < N; i++) heatCap[i] = ocean[i] ? 4.18e6 * P.oceanDepth : P.landHeat;
  const sinLat = ops.lat.map(Math.sin);
  // 1/f for the Ekman transport, made finite at the equator: f/(f² + f_e²)
  const fE = 2 * P.rotation * Math.sin(P.ekmanLat * Math.PI / 180);
  const invF = sinLat.map(s => { const f = 2 * P.rotation * s; return f / (f * f + fE * fE); });
  const p2 = sinLat.map(s => (3 * s * s - 1) / 2);

  // latitude bands for zonal means
  const NB = 90, band = new Int32Array(N), bandW = new Float64Array(NB);
  for (let i = 0; i < N; i++) { band[i] = Math.min(NB - 1, Math.floor((ops.lat[i] / Math.PI + 0.5) * NB)); bandW[band[i]] += ops.area[i]; }
  // a band profile at a cell, interpolated linearly between band centres: the grid's rows don't
  // follow latitude circles, and a step from band to band would print the grid on the climate
  const bandLo = new Int32Array(N), bandFr = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const x = Math.min(NB - 1, Math.max(0, (ops.lat[i] / Math.PI + 0.5) * NB - 0.5));
    bandLo[i] = Math.min(NB - 2, Math.floor(x)); bandFr[i] = x - bandLo[i];
  }
  const atBand = (prof, i) => prof[bandLo[i]] * (1 - bandFr[i]) + prof[bandLo[i] + 1] * bandFr[i];
  const zonalMean = (f, out = new Float64Array(NB)) => {
    out.fill(0);
    for (let i = 0; i < N; i++) out[band[i]] += f[i] * ops.area[i];
    for (let b = 0; b < NB; b++) out[b] /= bandW[b] || 1;
    // a coarse grid leaves some bands without cells: they take the mean of the nearest bands
    for (let b = 0; b < NB; b++) if (!bandW[b]) {
      let lo = b - 1, hi = b + 1;
      while (lo >= 0 && !bandW[lo]) lo--;
      while (hi < NB && !bandW[hi]) hi++;
      out[b] = lo < 0 ? out[hi] : hi >= NB ? out[lo] : out[lo] + (out[hi] - out[lo]) * (b - lo) / (hi - lo);
    }
    return out;
  };

  // state
  const T = new Float64Array(N), W = new Float64Array(N), soil = new Float64Array(N), iceH = new Float64Array(N), iceMonth = new Float64Array(N);
  for (let i = 0; i < N; i++) { T[i] = 28 - 45 * sinLat[i] ** 2; soil[i] = ocean[i] ? 0 : P.bucket / 2; }
  const surfT = i => T[i] - P.lapseRate * elev[i];
  const wsat = i => P.wsat0 * Math.exp(0.0641 * T[i] - elev[i] / P.vapourScaleHeight);
  for (let i = 0; i < N; i++) W[i] = 0.7 * wsat(i);

  // per-edge friction and Coriolis
  const E6 = 6 * N, fEdge = new Float64Array(E6), rEdge = new Float64Array(E6);
  const fMin = 2 * P.rotation * Math.sin(P.minCoriolis * Math.PI / 180);
  for (let i = 0; i < N; i++) for (let k = 0; k < ops.nbrCount[i]; k++) {
    const e = 6 * i + k, j = ops.nbr[e];
    fEdge[e] = P.rotation * (sinLat[i] + sinLat[j]);
    rEdge[e] = 0.5 * ((ocean[i] ? P.frictionOcean : P.frictionLand) + (ocean[j] ? P.frictionOcean : P.frictionLand));
    // near the equator, where Coriolis fades, the air's own momentum carried in from either
    // side and mixed down from above slows the flow like extra drag
    const sl = 0.5 * (sinLat[i] + sinLat[j]) / Math.sin(P.eqDragLat * Math.PI / 180);
    rEdge[e] += P.eqDrag * Math.exp(-sl * sl);
  }

  const phi = new Float64Array(N), un = new Float64Array(E6), wind = new Float64Array(3 * N);
  const speed = new Float64Array(N), div = new Float64Array(N), upslope = new Float64Array(N);
  const ekman = new Float64Array(3 * N), upwell = new Float64Array(N);
  const ones = new Float64Array(N).fill(1), mixK = new Float64Array(N), mixB = new Float64Array(N), mixX = new Float64Array(N);
  const zT = new Float64Array(NB), storm = new Float64Array(NB);
  const gauss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
  const deg = Math.PI / 180;
  const smooth = (f, L) => {
    const x = Float64Array.from(f);
    if (L > 0) ops.solveImplicit(new Float64Array(N).fill(1), new Float64Array(N).fill((L / R) ** 2), Float64Array.from(f), x, 1e-6);
    return x;
  };
  const hGrad = ops.gradient(smooth(elev, P.oroScale));

  // the wind of the pressure field phi on the edges (uo) and cells (w), for friction rScale
  // times the surface's
  function balance(rScale, uo, w) {
    // normal wind on every edge: u_n = −(r g_n + f g_t)/(r² + f²)
    for (let i = 0; i < N; i++) for (let k = 0; k < ops.nbrCount[i]; k++) {
      const e = 6 * i + k, j = ops.nbr[e];
      const gn = (phi[j] - phi[i]) / (ops.dist[e] * R);
      const v1 = (phi[i] + phi[j] + phi[ops.side1[e]]) / 3, v2 = (phi[i] + phi[j] + phi[ops.side2[e]]) / 3;
      const gt = (v2 - v1) / (ops.len[e] * R);
      const r = rScale * rEdge[e], f = fEdge[e], f2 = Math.max(f * f, fMin * fMin);
      // clipped, standing in for drag that grows with speed; clipping both directions of an
      // edge alike keeps every flux antisymmetric
      uo[e] = Math.max(-P.maxWind, Math.min(P.maxWind, -(r * gn + f * gt) / (r * r + f2)));
    }
    ops.reconstruct(uo, w);
    // momentum mixing: smooth the wind, (1 − L²∇²) u = u_balance per component, then put it
    // back on the edges; averaging both cells keeps every edge's flux antisymmetric
    if (P.windMixing > 0) {
      mixK.fill((P.windMixing / R) ** 2);
      for (let c = 0; c < 3; c++) {
        for (let i = 0; i < N; i++) { mixB[i] = w[3 * i + c]; mixX[i] = mixB[i]; }
        ops.solveImplicit(ones, mixK, mixB, mixX, 1e-4, 100, c > 0);
        for (let i = 0; i < N; i++) w[3 * i + c] = mixX[i];
      }
      for (let i = 0; i < N; i++) {
        const px = ops.pos[3 * i], py = ops.pos[3 * i + 1], pz = ops.pos[3 * i + 2];
        const r = w[3 * i] * px + w[3 * i + 1] * py + w[3 * i + 2] * pz;
        w[3 * i] -= r * px; w[3 * i + 1] -= r * py; w[3 * i + 2] -= r * pz;
      }
      for (let i = 0; i < N; i++) for (let k = 0; k < ops.nbrCount[i]; k++) {
        const e = 6 * i + k, j = ops.nbr[e];
        uo[e] = 0.5 * ((w[3 * i] + w[3 * j]) * ops.nrm[3 * e] + (w[3 * i + 1] + w[3 * j + 1]) * ops.nrm[3 * e + 1] + (w[3 * i + 2] + w[3 * j + 2]) * ops.nrm[3 * e + 2]);
      }
    }
  }

  let Ttrop = 0;
  function winds() {
    // the thermal equator: the warmest latitude band, held within ±20°
    zonalMean(T, zT);
    let best = 0;
    for (let b = 0; b < NB; b++) if (zT[b] > zT[best]) best = b;
    let shift = ((best + 0.5) / NB - 0.5) * Math.PI;
    shift = Math.max(-20 * deg, Math.min(20 * deg, shift)) * 0.7;
    const [a0, a1, a2, a3] = P.cellPressure;
    Ttrop = 0; let Wt = 0;
    if (P.lnLat > 0) for (let i = 0; i < N; i++) { const w = ops.area[i] / (1 + (sinLat[i] / Math.sin(P.lnLat * deg)) ** 4); Ttrop += T[i] * w; Wt += w; }
    Ttrop /= Wt || 1;
    // the eddy-driven part, the subtropical high and the subpolar low, grows with the storms
    // that drive it, and so with each hemisphere's steepest temperature gradient between 30°
    // and 70°, against Earth's
    const bandKm = Math.PI * R / NB / 1000, baro = [0, 0];
    for (let b = 1; b < NB - 1; b++) {
      const l = ((b + 0.5) / NB - 0.5) * 180;
      if (Math.abs(l) < 30 || Math.abs(l) > 70) continue;
      const g = Math.abs(zT[b + 1] - zT[b - 1]) / (2 * bandKm) * 100;
      baro[l > 0 ? 0 : 1] = Math.max(baro[l > 0 ? 0 : 1], g);
    }
    const eddy = baro.map(g => Math.min(2, Math.max(0.3, (g / P.baroRef) ** P.baroExp)));
    for (let i = 0; i < N; i++) {
      const x = Math.abs(ops.lat[i] - shift) / deg;
      // the equatorial low follows the warmest water, so it bends with the warm pools
      const conv = 1 / (1 + Math.exp(-(T[i] - P.convectionTemp) / 1.5));
      const ed = eddy[ops.lat[i] > 0 ? 0 : 1];
      let p = a0 * conv * gauss(x, 0, P.equatorialWidth) + ed * (a1 * gauss(x, 32, 12) + a2 * gauss(x, 62, 10)) + a3 * gauss(x, 90, 12);
      // a column warmer than its surroundings has lower pressure beneath it. In the tropics
      // the surroundings are the whole tropical belt (Lindzen & Nigam 1987), so the lows
      // follow the warmest water and land across latitudes too; further out, its latitude
      const wt = P.lnLat > 0 ? 1 / (1 + (sinLat[i] / Math.sin(P.lnLat * deg)) ** 4) : 0;
      p -= (ocean[i] ? P.thermalLowOcean : P.thermalLow) * (T[i] - (wt * Ttrop + (1 - wt) * atBand(zT, i)));
      phi[i] = p * 100 / 1.2;
    }
    balance(1, un, wind);
    for (let i = 0; i < N; i++) {
      speed[i] = Math.hypot(wind[3 * i], wind[3 * i + 1], wind[3 * i + 2]);
      let s = 0;
      for (let k = 0; k < ops.nbrCount[i]; k++) { const e = 6 * i + k; s += ops.len[e] * un[e]; }
      div[i] = s / (ops.area[i] * R);
      upslope[i] = (wind[3 * i] * hGrad[3 * i] + wind[3 * i + 1] * hGrad[3 * i + 1] + wind[3 * i + 2] * hGrad[3 * i + 2]) / R;
      // Ekman transport τ × k / (ρ_w f) in m²/s, τ = ρ_a C_D |u| u, over the ocean only
      const c = ocean[i] ? 1.2 * 1.3e-3 * speed[i] / 1025 * invF[i] : 0;
      const x = wind[3 * i], y = wind[3 * i + 1], z = wind[3 * i + 2];
      const px = ops.pos[3 * i], py = ops.pos[3 * i + 1], pz = ops.pos[3 * i + 2];
      ekman[3 * i] = c * (y * pz - z * py); ekman[3 * i + 1] = c * (z * px - x * pz); ekman[3 * i + 2] = c * (x * py - y * px);
    }
    // upwelling speed (m/s): divergence of the Ekman transport; coasts pass nothing
    for (let i = 0; i < N; i++) {
      upwell[i] = 0;
      if (!ocean[i]) continue;
      let s = 0;
      for (let k = 0; k < ops.nbrCount[i]; k++) {
        const e = 6 * i + k, j = ops.nbr[e];
        if (!ocean[j]) continue;
        s += ops.len[e] * 0.5 * ((ekman[3 * i] + ekman[3 * j]) * ops.nrm[3 * e] + (ekman[3 * i + 1] + ekman[3 * j + 1]) * ops.nrm[3 * e + 1] + (ekman[3 * i + 2] + ekman[3 * j + 2]) * ops.nrm[3 * e + 2]);
      }
      upwell[i] = Math.max(0, s / (ops.area[i] * R));
    }
  }

  // ---- the ocean's upper layer, stepped in time: velocity u at the cells, thermocline
  // anomaly h. Gravity waves forward-backward, Coriolis and damping implicit (an exact
  // rotation, stable for any step), and viscosity, which makes the western boundary currents
  const hT = new Float64Array(N), uo = new Float64Array(E6), ouv = new Float64Array(3 * N), oG = new Float64Array(3 * N);
  const oEdge = new Uint8Array(E6), oLap = new Float64Array(3 * N), oDiv = new Float64Array(N);
  for (let i = 0; i < N; i++) for (let k = 0; k < ops.nbrCount[i]; k++) { const e = 6 * i + k; oEdge[e] = ocean[i] && ocean[ops.nbr[e]] ? 1 : 0; }
  const oc = Math.sqrt(P.reducedGravity * P.thermoDepth);
  let minDx = Infinity;
  for (let e = 0; e < E6; e++) if (ops.dist[e] > 0) minDx = Math.min(minDx, ops.dist[e] * R);
  const oSub = Math.max(1, Math.ceil(dt / Math.min(0.4 * minDx / oc, 0.2 * minDx * minDx / Math.max(1, P.oceanViscosity))));
  function oceanStep() {
    const h = dt / oSub, r = P.oceanDamping, fMinO = 2 * P.rotation * Math.sin(P.oceanMinCoriolis * deg);
    const cs = 1.2 * 1.3e-3 / (1025 * P.thermoDepth);
    for (let s = 0; s < oSub; s++) {
      // −g'∇h + τ/(ρH) + A∇²u. The gradient uses only the edges between ocean cells, which
      // makes it the exact negative adjoint of the divergence below, so the gravity waves
      // conserve energy and the coasts can't feed them
      const g = oG;
      for (let i = 0; i < N; i++) {
        let gx = 0, gy = 0, gz = 0;
        if (ocean[i]) for (let k = 0; k < ops.nbrCount[i]; k++) {
          const e = 6 * i + k;
          if (!oEdge[e]) continue;
          const w = ops.len[e] * 0.5 * (hT[ops.nbr[e]] - hT[i]);
          gx += w * ops.nrm[3 * e]; gy += w * ops.nrm[3 * e + 1]; gz += w * ops.nrm[3 * e + 2];
        }
        g[3 * i] = gx / ops.area[i]; g[3 * i + 1] = gy / ops.area[i]; g[3 * i + 2] = gz / ops.area[i];
      }
      for (let i = 0; i < N; i++) {
        if (!ocean[i]) continue;
        let lx = 0, ly = 0, lz = 0;
        for (let k = 0; k < ops.nbrCount[i]; k++) {
          const e = 6 * i + k, j = ops.nbr[e], w = ops.lap[e];
          // no slip at the coast: land holds u = 0
          lx += w * (ouv[3 * j] - ouv[3 * i]); ly += w * (ouv[3 * j + 1] - ouv[3 * i + 1]); lz += w * (ouv[3 * j + 2] - ouv[3 * i + 2]);
        }
        // bulk stress with the same gustiness as evaporation: weather adds to the mean wind
        const A = P.oceanViscosity / (ops.area[i] * R2), sp = cs * (speed[i] + P.gust);
        let ux = ouv[3 * i] + h * (-P.reducedGravity * g[3 * i] / R + sp * wind[3 * i] + A * lx);
        let uy = ouv[3 * i + 1] + h * (-P.reducedGravity * g[3 * i + 1] / R + sp * wind[3 * i + 1] + A * ly);
        let uz = ouv[3 * i + 2] + h * (-P.reducedGravity * g[3 * i + 2] / R + sp * wind[3 * i + 2] + A * lz);
        // (1 + r h) u + h f k×u = u*
        const px = ops.pos[3 * i], py = ops.pos[3 * i + 1], pz = ops.pos[3 * i + 2];
        let f = 2 * P.rotation * sinLat[i];
        if (Math.abs(f) < fMinO) f = f < 0 ? -fMinO : fMinO;
        const a = 1 + r * h, b = h * f, kx = py * uz - pz * uy, ky = pz * ux - px * uz, kz = px * uy - py * ux, d = a * a + b * b;
        ux = (a * ux - b * kx) / d; uy = (a * uy - b * ky) / d; uz = (a * uz - b * kz) / d;
        const q = ux * px + uy * py + uz * pz;
        oLap[3 * i] = ux - q * px; oLap[3 * i + 1] = uy - q * py; oLap[3 * i + 2] = uz - q * pz;
      }
      for (let i = 0; i < 3 * N; i++) ouv[i] = oLap[i];
      // H ∇·u through the edges between ocean cells, then the thermocline
      for (let i = 0; i < N; i++) {
        if (!ocean[i]) continue;
        let sdiv = 0;
        for (let k = 0; k < ops.nbrCount[i]; k++) {
          const e = 6 * i + k;
          if (!oEdge[e]) continue;
          const j = ops.nbr[e];
          sdiv += ops.len[e] * 0.5 * ((ouv[3 * i] + ouv[3 * j]) * ops.nrm[3 * e] + (ouv[3 * i + 1] + ouv[3 * j + 1]) * ops.nrm[3 * e + 1] + (ouv[3 * i + 2] + ouv[3 * j + 2]) * ops.nrm[3 * e + 2]);
        }
        oDiv[i] = sdiv / (ops.area[i] * R);
      }
      for (let i = 0; i < N; i++) if (ocean[i]) hT[i] = (hT[i] - h * P.thermoDepth * oDiv[i]) / (1 + h * P.thermoDamping);
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < ops.nbrCount[i]; k++) {
      const e = 6 * i + k;
      if (!oEdge[e]) { uo[e] = 0; continue; }
      const j = ops.nbr[e];
      uo[e] = 0.5 * ((ouv[3 * i] + ouv[3 * j]) * ops.nrm[3 * e] + (ouv[3 * i + 1] + ouv[3 * j + 1]) * ops.nrm[3 * e + 1] + (ouv[3 * i + 2] + ouv[3 * j + 2]) * ops.nrm[3 * e + 2]);
    }
  }
  // the surface heat carried by the currents over a step, upwind and conservative
  const heatFlux = new Float64Array(N);
  function advectHeat() {
    let maxOut = 0;
    for (let i = 0; i < N; i++) {
      if (!ocean[i]) continue;
      let o = 0;
      for (let k = 0; k < ops.nbrCount[i]; k++) { const e = 6 * i + k; if (uo[e] > 0) o += uo[e] * ops.len[e]; }
      maxOut = Math.max(maxOut, P.currentHeat * o / (ops.area[i] * R));
    }
    const n = Math.max(1, Math.ceil(dt * maxOut / 0.5)), hs = dt / n;
    for (let s = 0; s < n; s++) {
      heatFlux.fill(0);
      for (let q = 0; q < nEdge; q++) {
        const e = edgeSlot[q];
        if (!oEdge[e]) continue;
        const a = edgeA[q], b = edgeB[q], c = P.currentHeat * uo[e] * ops.len[e] * R * hs;
        // water under ice is at freezing
        const Ta = iceH[a] > 0 ? P.freezeTemp : T[a], Tb = iceH[b] > 0 ? P.freezeTemp : T[b];
        const F = c * (c > 0 ? Ta : Tb);
        heatFlux[a] -= F; heatFlux[b] += F;
      }
      for (let i = 0; i < N; i++) if (ocean[i]) {
        // under ice, the heat the currents bring melts it from below
        if (iceH[i] > 0) iceH[i] = Math.max(0, iceH[i] - heatFlux[i] / (ops.area[i] * R2) * heatCap[i] / P.iceLatent);
        else T[i] += heatFlux[i] / (ops.area[i] * R2);
      }
    }
  }

  // outputs: monthly means of the last year
  const MONTHS = 12, out = {
    temperature: new Float32Array(MONTHS * N), precipitation: new Float32Array(MONTHS * N),
    evaporation: new Float32Array(MONTHS * N), vapour: new Float32Array(MONTHS * N),
    wind_east: new Float32Array(MONTHS * N), wind_north: new Float32Array(MONTHS * N),
    sea_ice: new Float32Array(MONTHS * N),
  };
  const counts = new Float64Array(MONTHS);

  const diag = new Float64Array(N), kDiff = new Float64Array(N).fill(P.heatDiffusion), rhs = new Float64Array(N);
  const rain = new Float64Array(N), evap = new Float64Array(N), wMean = new Float64Array(N);
  const flux = new Float64Array(N), invAR2 = new Float64Array(N);
  const colMass = elev.map(z => Math.exp(-z / P.vapourScaleHeight)), invMass = colMass.map(m => 1 / m);
  for (let i = 0; i < N; i++) invAR2[i] = 1 / (ops.area[i] * R2);
  const wsA = new Float64Array(N), thrA = new Float64Array(N), evA = new Float64Array(N), oroA = new Float64Array(N);
  // each edge once, from the lower cell id
  const edgeList = [];
  for (let i = 0; i < N; i++) for (let k = 0; k < ops.nbrCount[i]; k++) if (ops.nbr[6 * i + k] > i) edgeList.push(6 * i + k);
  const nEdge = edgeList.length, edgeSlot = Int32Array.from(edgeList);
  const edgeA = new Int32Array(nEdge), edgeB = new Int32Array(nEdge), edgeC = new Float64Array(nEdge);
  for (let q = 0; q < nEdge; q++) { edgeA[q] = Math.floor(edgeSlot[q] / 6); edgeB[q] = ops.nbr[edgeSlot[q]]; }
  // diffusion coefficient per edge, K (l/d) m̄, and its sum per cell, for the stable step
  const edgeD = new Float64Array(nEdge), diffSum = new Float64Array(N);
  for (let q = 0; q < nEdge; q++) {
    const a = edgeA[q], b = edgeB[q];
    edgeD[q] = P.moistureDiffusion * ops.lap[edgeSlot[q]] * 0.5 * (colMass[a] + colMass[b]);
    diffSum[a] += edgeD[q]; diffSum[b] += edgeD[q];
  }

  const totalSteps = years * stepsPerYear;
  for (let step = 0; step < totalSteps; step++) {
    // c runs over the calendar year from 1 January; the orbit counts from the equinox
    const c = (step % stepsPerYear + 0.5) / stepsPerYear;
    const lambda = solarLongitude(((c - P.equinoxDay / P.yearDays) % 1 + 1) % 1, P.orbit);

    // ---- the currents carry the ocean's heat
    if (P.oceanDynamics && step > 0) advectHeat();

    // ---- temperature: (C/dt + B − ∇·k∇) T' = C/dt T + S(1 − α) − A, implicit. Diffusing moist
    // static energy T + Lq/cp is approximated by diffusing T with k = D (1 + (L/cp) dq/dT),
    // q = RH·q_sat(T): an explicit Laplacian of q would be unstable over land.
    for (let i = 0; i < N; i++) {
      const rh = Math.min(1, W[i] / Math.max(0.1, wsat(i)));
      kDiff[i] = P.heatDiffusion * (ocean[i] ? 1 : P.landDiffusion) * (1 + rh * 0.0641 * qsat(surfT(i)) / CP_OVER_LV);
    }
    for (let i = 0; i < N; i++) {
      const Ts = surfT(i);
      const S = dailyInsolation(ops.lat[i], lambda, P.orbit);
      if (P.seaIce && ocean[i] && iceH[i] > 0) {
        // the ice's surface: a thin heat capacity, conduction from the water at freezing
        const kc = P.iceConductivity / Math.max(P.iceMinThickness, iceH[i]);
        const alpha = P.iceAlbedo * Math.min(1, iceH[i] / P.iceMinThickness) + (P.albedo + P.albedoP2 * p2[i]) * (1 - Math.min(1, iceH[i] / P.iceMinThickness));
        diag[i] = P.iceHeat / dt + P.olrB + kc;
        rhs[i] = P.iceHeat / dt * T[i] + S * (1 - alpha) - P.olrA + kc * P.freezeTemp;
        continue;
      }
      const ice = P.seaIce && ocean[i] ? 0 : 1 / (1 + Math.exp((Ts - P.iceTemp) / 2));
      const alpha = (P.albedo + P.albedoP2 * p2[i]) * (1 - ice) + P.albedoIce * ice;
      // upwelled water mixes in, implicitly: −ρc w (T − T_up)
      // upwelled water mixes in, implicitly: −ρc w (T − T_up), T_up = T − (T − T_d) e^(−D/d)
      let up = 4.18e6 * P.upwellEfficiency * upwell[i], Td = P.upwellTemp;
      if (P.oceanDynamics) { up *= Math.exp(-Math.max(10, P.thermoDepth + hT[i]) / P.thermoScale); Td = P.deepTemp; }
      diag[i] = heatCap[i] / dt + P.olrB + up;
      rhs[i] = heatCap[i] / dt * T[i] + S * (1 - alpha) - P.olrA + up * Td;
    }
    const Told = P.seaIce ? Float64Array.from(T) : null;
    ops.solveImplicit(diag, kDiff, rhs, T, 1e-6);
    if (P.seaIce) for (let i = 0; i < N; i++) {
      if (!ocean[i]) continue;
      const Cw = heatCap[i];
      if (iceH[i] > 0) {
        const kc = P.iceConductivity / Math.max(P.iceMinThickness, iceH[i]);
        // a surface above 0 °C melts the ice from the top with the heat it can't take up
        if (T[i] > 0) { iceH[i] -= T[i] * (P.iceHeat / dt + P.olrB + kc) * dt / P.iceLatent; T[i] = 0; }
        // what the water loses up through the ice freezes onto its bottom; the ocean's heat from
        // below, and the warmer deep water that upwelling brings, melt it there
        let up = 4.18e6 * P.upwellEfficiency * upwell[i], Td = P.upwellTemp;
        if (P.oceanDynamics) { up *= Math.exp(-Math.max(10, P.thermoDepth + hT[i]) / P.thermoScale); Td = P.deepTemp; }
        const basal = P.iceBasalFlux + up * Math.max(0, Td - P.freezeTemp);
        iceH[i] += (kc * (P.freezeTemp - T[i]) - basal) * dt / P.iceLatent;
        if (iceH[i] <= 0) {
          // all melted: what is left over warms the water
          T[i] = P.freezeTemp - iceH[i] * P.iceLatent / Cw; iceH[i] = 0;
        }
        iceMonth[i] = iceH[i];
      } else if (T[i] < P.freezeTemp) {
        // open water colder than freezing freezes
        iceH[i] = (P.freezeTemp - T[i]) * Cw / P.iceLatent; T[i] = P.freezeTemp;
      }
      iceMonth[i] = iceH[i];
    }
    // for experiments: observed sea temperatures, 12 months, interpolated
    if (P.sstObs) {
      const mf = c * 12 - 0.5, m0 = (Math.floor(mf) + 12) % 12, m1 = (m0 + 1) % 12, w = mf - Math.floor(mf);
      for (let i = 0; i < N; i++) if (ocean[i]) T[i] = (1 - w) * P.sstObs[m0 * N + i] + w * P.sstObs[m1 * N + i];
    }

    // ---- wind from the new temperatures
    winds();
    if (P.oceanDynamics) oceanStep();

    // ---- moisture: explicit advection, sources and rain in substeps, diffusion implicit once
    let maxOut = 0;
    for (let i = 0; i < N; i++) {
      let o = 0;
      for (let k = 0; k < ops.nbrCount[i]; k++) { const e = 6 * i + k; if (un[e] > 0) o += un[e] * ops.len[e]; }
      maxOut = Math.max(maxOut, o * R / (ops.area[i] * R2));
    }
    const sub = Math.min(P.maxSubsteps || Infinity, Math.max(1, Math.ceil(dt * maxOut / 0.5), Math.ceil(dt / (6 * 3600))));
    const h = dt / sub;

    // per-step constants, so the substeps are cheap: edge transport coefficients, and per
    // cell saturation, the rain threshold, evaporation per unit of surface dryness, and the
    // orographic rain rate
    for (let q = 0; q < nEdge; q++) {
      // air crossing into or out of a column over high ground is only as deep as that column:
      // the rest goes around or over, so vapour moves as humidity times the shallower column
      const e = edgeSlot[q], c = un[e] * ops.len[e] * R * h * Math.min(colMass[edgeA[q]], colMass[edgeB[q]]);
      edgeC[q] = c;
    }
    // storminess: midlatitude weather systems lift air where the zonal-mean temperature
    // falls steeply towards the pole, so it rains there below the usual threshold
    const bandKm = Math.PI * R / NB / 1000;
    for (let b = 0; b < NB; b++) {
      const g = Math.abs(zT[Math.min(NB - 1, b + 1)] - zT[Math.max(0, b - 1)]) / (2 * bandKm) * 100;
      storm[b] = Math.tanh(g / P.stormGradient);
    }
    const Tls = P.wtgScale > 0 ? smooth(T, P.wtgScale) : T;
    for (let i = 0; i < N; i++) {
      const Ts = surfT(i);
      wsA[i] = P.wsat0 * Math.exp(0.0641 * Tls[i] - elev[i] / P.vapourScaleHeight);
      // thrA: the rain rate at r = 0 in mm per substep, as a log
      // a surface colder than the air above it, which is about as warm all along its
      // latitude, lies under an inversion: shallow clouds can't grow into rain however moist
      const wt = P.lnLat > 0 ? 1 / (1 + (sinLat[i] / Math.sin(P.stableLat * deg)) ** 4) : 0;
      const r0 = P.rainR0 - P.rhAscent * Math.tanh(Math.max(0, -div[i]) * 4 * DAY) + P.rhDescent * Math.tanh(Math.max(0, div[i]) * 4 * DAY)
        - P.rhStorm * atBand(storm, i) + P.rhStable * wt * Math.max(0, (P.stableZonal ? atBand(zT, i) : Ttrop) - T[i]) / 5;
      thrA[i] = -P.rainSteep * r0 + Math.log(h / DAY);
      let ef = P.evapCoeff * (speed[i] + P.gust) * qsat(Ts) * h;
      if ((!ocean[i] || iceH[i] > 0) && Ts < 0) ef *= 0.2;
      evA[i] = ef;
      oroA[i] = Math.min(1, P.orographicEfficiency * Math.max(0, upslope[i]) / P.vapourScaleHeight * h);
    }
    rain.fill(0); evap.fill(0); wMean.fill(0);
    // eddy diffusion of vapour, explicit in flux form so that it conserves water exactly, in as
    // many stable steps as each substep needs: it has to act alongside transport and rain, or
    // converging moisture rains out before it can mix. Eddies mix humidity, not column vapour:
    // a column over high ground holds less air, so x = W/m is mixed, m = e^(−z/H) the column's
    // share of sea-level air: m ∂x/∂t = ∇·(K m̄ ∇x)
    let worst = 0;
    for (let i = 0; i < N; i++) worst = Math.max(worst, diffSum[i] * h / R2 / (ops.area[i] * colMass[i]));
    const nDiff = Math.ceil(worst / 0.8), hd = h / R2 / nDiff;
    const diffuse = () => {
      for (let n = 0; n < nDiff; n++) {
        flux.fill(0);
        for (let q = 0; q < nEdge; q++) {
          const a = edgeA[q], b = edgeB[q], F = hd * edgeD[q] * (W[b] * invMass[b] - W[a] * invMass[a]);
          flux[a] += F; flux[b] -= F;
        }
        for (let i = 0; i < N; i++) W[i] = Math.max(0, W[i] + flux[i] / ops.area[i]);
      }
    };
    for (let s = 0; s < sub; s++) {
      diffuse();
      // upwind transport, kg per substep through each edge
      flux.fill(0);
      for (let q = 0; q < nEdge; q++) {
        const c = edgeC[q], a = edgeA[q], b = edgeB[q];
        const F = c * (c > 0 ? W[a] * invMass[a] : W[b] * invMass[b]);
        flux[a] -= F; flux[b] += F;
      }
      for (let i = 0; i < N; i++) {
        let w = W[i] + flux[i] * invAR2[i];
        // evaporation against the near-surface humidity, which stays moister than the column
        let E = evA[i] * Math.max(0, 1 - (P.surfaceRH0 + (1 - P.surfaceRH0) * Math.min(1, w / wsA[i])));
        if (!ocean[i]) E *= Math.min(1, soil[i] / (0.75 * P.bucket));
        w += E;
        // rain above the threshold (lower where air rises), and from air forced up slopes
        const want = Math.exp(thrA[i] + P.rainSteep * w / wsA[i]);
        let Pr = w > 0 ? w * (1 - Math.exp(-want / w)) : 0;
        Pr = Math.min(w, Pr + oroA[i] * w * Math.max(0, w / wsA[i] - P.oroMinRH) / (1 - P.oroMinRH));
        w -= Pr;
        W[i] = w;
        rain[i] += Pr; evap[i] += E; wMean[i] += w / sub;
        if (!ocean[i]) soil[i] = Math.min(P.bucket, Math.max(0, soil[i] + Pr - E));
      }
    }

    // ---- record the last year
    if (step >= totalSteps - stepsPerYear) {
      const m = Math.min(MONTHS - 1, Math.floor(c * MONTHS)), o = m * N;
      counts[m]++;
      for (let i = 0; i < N; i++) {
        out.temperature[o + i] += surfT(i);
        out.precipitation[o + i] += rain[i] / dt * DAY;
        out.evaporation[o + i] += evap[i] / dt * DAY;
        out.vapour[o + i] += wMean[i];
        out.sea_ice[o + i] += iceH[i];
        out.wind_east[o + i] += wind[3 * i] * ops.east[3 * i] + wind[3 * i + 1] * ops.east[3 * i + 1] + wind[3 * i + 2] * ops.east[3 * i + 2];
        out.wind_north[o + i] += wind[3 * i] * ops.north[3 * i] + wind[3 * i + 1] * ops.north[3 * i + 1] + wind[3 * i + 2] * ops.north[3 * i + 2];
      }
    }
    if (onProgress) onProgress((step + 1) / totalSteps);
  }
  for (const f of Object.values(out)) for (let m = 0; m < MONTHS; m++) for (let i = 0; i < N; i++) f[m * N + i] /= counts[m] || 1;
  let diagOut = null;
  if (P.diagnostics) {
    const ou = ouv;
    diagOut = { ice: Float64Array.from(iceH), thermocline: Float64Array.from(hT), current_east: new Float64Array(N), current_north: new Float64Array(N), upwell: Float64Array.from(upwell) };
    for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) { diagOut.current_east[i] += ou[3 * i + c] * ops.east[3 * i + c]; diagOut.current_north[i] += ou[3 * i + c] * ops.north[3 * i + c]; }
  }
  return { ...out, ocean, diag: diagOut };
}
