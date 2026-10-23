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
  albedo: 0.30, albedoP2: 0.09, albedoIce: 0.62, iceTemp: -10,
  heatDiffusion: 0.4,        // W/m²/K on the unit sphere
  landDiffusion: 1,          // its share over land, where less heat comes in from the sides
  oceanDepth: 50,            // m of mixed layer
  // upwelling: wind pushes surface water sideways (Ekman transport); where it diverges, along
  // the equator and along coasts with the wind running down them, cold water comes up
  upwellTemp: 16,            // °C of the water that comes up
  upwellEfficiency: 0.5,     // fraction of the full heat exchange
  ekmanLat: 4,               // degrees: the Ekman transport fades to nothing at the equator
  landHeat: 1.5e7,           // J/m²/K
  lapseRate: 6.5e-3,         // K/m
  // pressure and wind
  cellPressure: [-1.8, 3.9, -14.5, 3], // hPa: equatorial low, subtropical high, subpolar low, polar high
  thermalLow: 0.84,          // hPa per K of land warmer than its latitude
  thermalLowOcean: 0.62,     // the same over water, which drives the Walker circulation
  convectionTemp: 26,        // °C: the equatorial low sits over water warmer than this
  equatorialWidth: 23,       // degrees from the thermal equator where it can
  minCoriolis: 7.5,          // degrees: near the equator the wind turns as if this far out
  frictionOcean: 1 / 86400, frictionLand: 1 / 0.5 / 86400,
  maxWind: 25,               // m/s
  windMixing: 500e3,         // m: eddies mix momentum this far, so the trades reach the equator
  // moisture
  wsat0: 13,                 // mm of column vapour at saturation at 0 °C, sea level
  vapourScaleHeight: 2500,   // m
  evapCoeff: 1.56e-3,        // ρ·C_E, kg/m³
  gust: 4,                   // m/s added to the wind for evaporation
  bucket: 150,               // mm
  moistureDiffusion: 2.1e6,  // m²/s
  surfaceRH0: 0.31,          // near-surface humidity under a completely dry column
  // rain rate exp(rainSteep (r − rainR0)) mm/day at column saturation r, the form Bretherton
  // et al. (2004) found over tropical oceans; rising air rains at lower r, sinking air at
  // higher. Their steepness of 15.6 holds for daily rain in one place; over a model cell and
  // a substep the onset is gentler, and 8.3 lets air carry its water as far as it does on
  // Earth (tools/metrics.mjs, Plength). The rain and wind parameters below were fitted to the
  // observed climate at level 4 and checked at levels 5 and 6.
  rainSteep: 8.3, rainR0: 0.57, rhAscent: 0.075, rhDescent: 0.14,
  rhStorm: 0.34, stormGradient: 0.87, // K per 100 km of zonal-mean gradient for full storminess
  orographicEfficiency: 0.38, oroMinRH: 0.71, // air drier than this doesn't rain going uphill
  oroScale: 140e3,           // m: heights smoothed over this for the lift (0: the grid's own)
  // the response of the first baroclinic mode to latent heating (Gill 1980): a steady,
  // damped balance ε φ + c² ∇·u = −Q, u the damped-geostrophic wind of φ, where the heating
  // Q asks for low-level convergence of gillCoupling × (P − mean P)/gillW, fading outside
  // the tropics
  gillCoupling: 0, gillC: 50, gillDamp: 1 / (3 * 86400), gillW: 40, gillLat: 25,
  // 1 counts the cooling with height twice: the vapour scale height already includes it, and
  // air climbing a slope would rain out everything it carries
  wsatLapse: 0,
  wtgScale: 150e3,           // m: column saturation from temperature smoothed over this (0: local)
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
  const T = new Float64Array(N), W = new Float64Array(N), soil = new Float64Array(N);
  for (let i = 0; i < N; i++) { T[i] = 28 - 45 * sinLat[i] ** 2; soil[i] = ocean[i] ? 0 : P.bucket / 2; }
  const surfT = i => T[i] - P.lapseRate * elev[i];
  const wsat = i => P.wsat0 * Math.exp(0.0641 * (T[i] - P.wsatLapse * P.lapseRate * elev[i]) - elev[i] / P.vapourScaleHeight);
  for (let i = 0; i < N; i++) W[i] = 0.7 * wsat(i);
  let rainPrev = new Float64Array(N);

  // per-edge friction and Coriolis
  const E6 = 6 * N, fEdge = new Float64Array(E6), rEdge = new Float64Array(E6);
  const fMin = 2 * P.rotation * Math.sin(P.minCoriolis * Math.PI / 180);
  for (let i = 0; i < N; i++) for (let k = 0; k < ops.nbrCount[i]; k++) {
    const e = 6 * i + k, j = ops.nbr[e];
    fEdge[e] = P.rotation * (sinLat[i] + sinLat[j]);
    rEdge[e] = 0.5 * ((ocean[i] ? P.frictionOcean : P.frictionLand) + (ocean[j] ? P.frictionOcean : P.frictionLand));
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

  // ---- Gill response
  const gillOn = P.gillCoupling > 0, phiG = new Float64Array(N), gB = new Float64Array(N), uG = new Float64Array(E6);
  const rainRate = new Float64Array(N), gillW = new Float64Array(N);
  let gillPC = null;
  if (gillOn) {
    gillPC = ops.preconditioner();
    const d = new Float64Array(N).fill(P.gillDamp), k = new Float64Array(N);
    const fT = 2 * P.rotation * Math.sin(P.gillLat * deg);
    for (let i = 0; i < N; i++) {
      const f = 2 * P.rotation * sinLat[i], f2 = Math.max(f * f, fMin * fMin), r = ocean[i] ? P.frictionOcean : P.frictionLand;
      k[i] = P.gillC ** 2 * r / (r * r + f2) / R2;
      gillW[i] = 1 / (1 + (f / fT) ** 4);
    }
    gillPC.set(d, k);
  }
  const gillApply = (v, out) => {
    for (let i = 0; i < N; i++) for (let k = 0; k < ops.nbrCount[i]; k++) {
      const e = 6 * i + k, j = ops.nbr[e];
      const gn = (v[j] - v[i]) / (ops.dist[e] * R);
      const gt = ((v[ops.side2[e]] - v[ops.side1[e]]) / 3) / (ops.len[e] * R);
      const r = rEdge[e], f = fEdge[e], f2 = Math.max(f * f, fMin * fMin);
      uG[e] = -(r * gn + f * gt) / (r * r + f2);
    }
    const c2 = P.gillC ** 2;
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = 0; k < ops.nbrCount[i]; k++) { const e = 6 * i + k; s += ops.len[e] * uG[e]; }
      out[i] = ops.area[i] * P.gillDamp * v[i] + c2 * s / R;
    }
  };
  function gill() {
    let m = 0, w = 0;
    for (let i = 0; i < N; i++) { m += rainRate[i] * ops.area[i]; w += ops.area[i]; }
    m /= w;
    const c2 = P.gillC ** 2;
    for (let i = 0; i < N; i++) gB[i] = -ops.area[i] * c2 * gillW[i] * P.gillCoupling * (rainRate[i] - m) / P.gillW;
    ops.solveGeneral(gillApply, gB, phiG, gillPC, 1e-4, 50);
  }

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

  function winds() {
    if (gillOn) gill();
    // the thermal equator: the warmest latitude band, held within ±20°
    zonalMean(T, zT);
    let best = 0;
    for (let b = 0; b < NB; b++) if (zT[b] > zT[best]) best = b;
    let shift = ((best + 0.5) / NB - 0.5) * Math.PI;
    shift = Math.max(-20 * deg, Math.min(20 * deg, shift)) * 0.7;
    const [a0, a1, a2, a3] = P.cellPressure;
    for (let i = 0; i < N; i++) {
      const x = Math.abs(ops.lat[i] - shift) / deg;
      // the equatorial low follows the warmest water, so it bends with the warm pools
      const conv = 1 / (1 + Math.exp(-(T[i] - P.convectionTemp) / 1.5));
      let p = a0 * conv * gauss(x, 0, P.equatorialWidth) + a1 * gauss(x, 32, 12) + a2 * gauss(x, 62, 10) + a3 * gauss(x, 90, 12);
      p -= (ocean[i] ? P.thermalLowOcean : P.thermalLow) * (T[i] - zT[band[i]]);
      phi[i] = p * 100 / 1.2 + phiG[i];
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

  // outputs: monthly means of the last year
  const MONTHS = 12, out = {
    temperature: new Float32Array(MONTHS * N), precipitation: new Float32Array(MONTHS * N),
    evaporation: new Float32Array(MONTHS * N), vapour: new Float32Array(MONTHS * N),
    wind_east: new Float32Array(MONTHS * N), wind_north: new Float32Array(MONTHS * N),
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

    // ---- temperature: (C/dt + B − ∇·k∇) T' = C/dt T + S(1 − α) − A, implicit. Diffusing moist
    // static energy T + Lq/cp is approximated by diffusing T with k = D (1 + (L/cp) dq/dT),
    // q = RH·q_sat(T): an explicit Laplacian of q would be unstable over land.
    for (let i = 0; i < N; i++) {
      const rh = Math.min(1, W[i] / Math.max(0.1, wsat(i)));
      kDiff[i] = P.heatDiffusion * (ocean[i] ? 1 : P.landDiffusion) * (1 + rh * 0.0641 * qsat(surfT(i)) / CP_OVER_LV);
    }
    for (let i = 0; i < N; i++) {
      const Ts = surfT(i);
      const ice = 1 / (1 + Math.exp((Ts - P.iceTemp) / 2));
      const alpha = (P.albedo + P.albedoP2 * p2[i]) * (1 - ice) + P.albedoIce * ice;
      const S = dailyInsolation(ops.lat[i], lambda, P.orbit);
      // upwelled water mixes in, implicitly: −ρc w (T − T_up)
      const up = 4.18e6 * P.upwellEfficiency * upwell[i];
      diag[i] = heatCap[i] / dt + P.olrB + up;
      rhs[i] = heatCap[i] / dt * T[i] + S * (1 - alpha) - P.olrA + up * P.upwellTemp;
    }
    ops.solveImplicit(diag, kDiff, rhs, T, 1e-6);
    // for experiments: observed sea temperatures, 12 months, interpolated
    if (P.sstObs) {
      const mf = c * 12 - 0.5, m0 = (Math.floor(mf) + 12) % 12, m1 = (m0 + 1) % 12, w = mf - Math.floor(mf);
      for (let i = 0; i < N; i++) if (ocean[i]) T[i] = (1 - w) * P.sstObs[m0 * N + i] + w * P.sstObs[m1 * N + i];
    }

    // ---- wind from the new temperatures
    winds();

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
      wsA[i] = P.wsat0 * Math.exp(0.0641 * (Tls[i] - P.wsatLapse * P.lapseRate * elev[i]) - elev[i] / P.vapourScaleHeight);
      // thrA: the rain rate at r = 0 in mm per substep, as a log
      const r0 = P.rainR0 - P.rhAscent * Math.tanh(Math.max(0, -div[i]) * 4 * DAY) + P.rhDescent * Math.tanh(Math.max(0, div[i]) * 4 * DAY)
        - P.rhStorm * storm[band[i]];
      thrA[i] = -P.rainSteep * r0 + Math.log(h / DAY);
      let ef = P.evapCoeff * (speed[i] + P.gust) * qsat(Ts) * h;
      if (!ocean[i] && Ts < 0) ef *= 0.2;
      evA[i] = ef;
      oroA[i] = Math.min(1, P.orographicEfficiency * Math.max(0, upslope[i]) / P.vapourScaleHeight * h);
    }
    rain.fill(0); evap.fill(0); wMean.fill(0);
    // eddy diffusion of vapour, explicit in flux form so that it conserves water exactly, in as
    // many stable steps as the substep needs. Eddies mix humidity, not column vapour: a column
    // over high ground holds less air, so x = W/m is mixed, m = e^(−z/H) the column's share
    // of sea-level air: m ∂x/∂t = ∇·(K m̄ ∇x)
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
    rainPrev = rain;
    for (let i = 0; i < N; i++) rainRate[i] = 0.5 * rainRate[i] + 0.5 * rain[i] / dt;

    // ---- record the last year
    if (step >= totalSteps - stepsPerYear) {
      const m = Math.min(MONTHS - 1, Math.floor(c * MONTHS)), o = m * N;
      counts[m]++;
      for (let i = 0; i < N; i++) {
        out.temperature[o + i] += surfT(i);
        out.precipitation[o + i] += rain[i] / dt * DAY;
        out.evaporation[o + i] += evap[i] / dt * DAY;
        out.vapour[o + i] += wMean[i];
        out.wind_east[o + i] += wind[3 * i] * ops.east[3 * i] + wind[3 * i + 1] * ops.east[3 * i + 1] + wind[3 * i + 2] * ops.east[3 * i + 2];
        out.wind_north[o + i] += wind[3 * i] * ops.north[3 * i] + wind[3 * i + 1] * ops.north[3 * i + 1] + wind[3 * i + 2] * ops.north[3 * i + 2];
      }
    }
    if (onProgress) onProgress((step + 1) / totalSteps);
  }
  for (const f of Object.values(out)) for (let m = 0; m < MONTHS; m++) for (let i = 0; i < N; i++) f[m * N + i] /= counts[m] || 1;
  return { ...out, ocean };
}
