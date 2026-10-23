// The seasonal climate model, version 2. It steps through the year until the ocean has
// settled, then records monthly means of temperature, precipitation, evaporation, water
// vapour and near-surface wind.
//
// Temperature: a moist energy balance model. Each column gains absorbed sunlight, loses
// outgoing longwave A + B·T, and exchanges moist static energy with its neighbours by
// diffusion, standing in for transport by the Hadley cells and midlatitude storms (Hwang &
// Frierson 2010). Ocean columns hold the heat of a 50 m mixed layer, land columns little, and
// ocean columns lose heat where the wind drives cold water up. T is the sea-level
// temperature; the surface is colder by 6.5 K per km of height.
//
// Wind, near the surface: pressure is a zonal pattern of the three cells, shifted with the
// season to follow the warmest latitude, plus thermal lows over land and water warmer than its
// latitude. The wind is the balance of the pressure force, Coriolis and surface friction,
// smoothed as eddies mix momentum. It lives on the cell edges as normal components, so its
// divergence is exact and conserved.
//
// Wind, aloft (around 3 km): by the hypsometric equation the pressure aloft is the surface
// pressure plus the weight of the warmer or colder column below, g z (T − T̄)/T̄, so warm
// columns stand high and cold ones low, and the balance with Coriolis and the weak damping of
// the free atmosphere gives the thermal wind: westerlies that strengthen poleward of the
// subtropics, and thermal lows that turn into highs aloft.
//
// Moisture, in two layers. The boundary layer (the lowest ~900 m, below the trade inversion)
// takes up evaporation and moves with the surface wind; the free troposphere above moves with
// the wind aloft, and rain forms there, growing exponentially with its saturation fraction
// (Bretherton et al. 2004). The layers exchange air by the actual vertical motion: where the
// surface wind converges, or blows up a slope, boundary-layer air is lifted into the free
// troposphere; where it diverges, dry air from aloft sinks into it. Shallow clouds also mix the
// two, and deep convection draws on the boundary layer it rains from. So in the subtropical
// highs the moisture stays low and is carried far by the trades without raining, until it is
// lifted in the ITCZ, a monsoon low, a storm or a mountain range.

import { dailyInsolation, solarLongitude, EARTH_ORBIT } from './insolation.js';
import { oceanMask } from './model.js';

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
  landDiffusion: 1,          // its share over land
  oceanDepth: 50,            // m of mixed layer
  upwellTemp: 16,            // °C of the water that comes up
  upwellEfficiency: 0.5,     // fraction of the full heat exchange
  ekmanLat: 4,               // degrees: the Ekman transport fades to nothing at the equator
  landHeat: 1.5e7,           // J/m²/K
  lapseRate: 6.5e-3,         // K/m
  // pressure and wind near the surface
  cellPressure: [0, 6, -14, 3], // hPa: equatorial low (left to the heating), subtropical high, subpolar low, polar high
  thermalLow: 1.2,           // hPa per K of land warmer than its latitude
  thermalLowOcean: 1.0,      // the same over water
  convectionTemp: 26,        // °C: the equatorial low sits over water warmer than this
  equatorialWidth: 25,       // degrees from the thermal equator where it can
  minCoriolis: 8,            // degrees: near the equator the wind turns as if this far out
  frictionOcean: 1 / 86400, frictionLand: 1 / 0.5 / 86400,
  maxWind: 25,               // m/s
  windMixing: 600e3,         // m: eddies mix momentum this far
  // the response of the first baroclinic mode to latent heating (Gill 1980): a steady,
  // damped balance ε φ + c² ∇·u = −Q, u the damped-geostrophic wind of φ, where the heating
  // asks for low-level convergence of gillCoupling × (P − mean P)/gillW, fading outside the
  // tropics, where heating is balanced by the storms' heat transport instead
  gillCoupling: 0.5, gillC: 50, gillDamp: 1 / (3 * 86400), gillW: 40, gillLat: 25,
  // wind aloft
  ftHeight: 3000,            // m: the height the free troposphere's vapour moves at
  ftDamping: 1 / (5 * 86400),// 1/s
  ftMaxWind: 40,             // m/s
  // moisture
  wsat0: 13,                 // mm of column vapour at saturation at 0 °C, sea level
  vapourScaleHeight: 2500,   // m
  blMass: 1000,              // kg/m² of air in the boundary layer (100 hPa)
  topMass: 3000,             // kg/m² of air above the vapour (300 hPa)
  evapCoeff: 1.56e-3,        // ρ·C_E, kg/m³
  gust: 4,                   // m/s added to the wind for evaporation
  bucket: 150,               // mm
  moistureDiffusion: 2e6,    // m²/s
  mixTime: 10 * 86400,       // s: shallow clouds mix boundary layer and free troposphere
  // deep convection: boundary-layer air rises where its moist static energy exceeds what the
  // free troposphere's temperature, smooth over wtgScale, allows at convRH of the boundary
  // layer's saturation; it rains with an
  // efficiency that grows with the free troposphere's saturation, the rest moistens it
  wtgScale: 2000e3, wtgLat: 20, convRH: 0.9, convTime: 86400, effMin: 0.2, effMax: 0.9,
  stormLift: 1 / (3 * 86400), // 1/s: storms lift boundary-layer air where fully stormy
  oroScale: 100e3,           // m: heights smoothed over this for the lift
  oroEfficiency: 1, oroMinRH: 0.6,
  // rain rate exp(rainSteep (r − rainR0)) mm/day at free-tropospheric saturation r; storms
  // lift air where the zonal-mean temperature falls steeply towards the pole
  rainSteep: 15.6, rainR0: 0.65,
  rhStorm: 0.3, stormGradient: 0.8, // K per 100 km of zonal-mean gradient for full storminess
};

const CP_OVER_LV = 1004 / 2.5e6, DAY = 86400, G = 9.81;
const qsat = T => 0.0038 * Math.exp(0.0641 * T);   // kg/kg near the surface

export function runClimate({ ops, height, params = {}, years = 5, stepsPerYear = 48, onProgress }) {
  const P = { ...EARTH, ...params };
  const N = ops.N, R = P.radius, R2 = R * R, deg = Math.PI / 180;
  const ocean = oceanMask(ops, height);
  const elev = new Float64Array(N);
  for (let i = 0; i < N; i++) elev[i] = ocean[i] ? 0 : Math.max(0, height[i]);

  const yearSec = P.yearDays * DAY, dt = yearSec / stepsPerYear;
  const heatCap = new Float64Array(N);
  for (let i = 0; i < N; i++) heatCap[i] = ocean[i] ? 4.18e6 * P.oceanDepth : P.landHeat;
  const sinLat = ops.lat.map(Math.sin);
  const fE = 2 * P.rotation * Math.sin(P.ekmanLat * deg);
  const invF = sinLat.map(s => { const f = 2 * P.rotation * s; return f / (f * f + fE * fE); });
  const p2 = sinLat.map(s => (3 * s * s - 1) / 2);

  // latitude bands for zonal means; a coarse grid leaves some bands without cells, and they
  // take the mean of the nearest bands
  const NB = 90, band = new Int32Array(N), bandW = new Float64Array(NB);
  for (let i = 0; i < N; i++) { band[i] = Math.min(NB - 1, Math.floor((ops.lat[i] / Math.PI + 0.5) * NB)); bandW[band[i]] += ops.area[i]; }
  const zonalMean = (f, out = new Float64Array(NB)) => {
    out.fill(0);
    for (let i = 0; i < N; i++) out[band[i]] += f[i] * ops.area[i];
    for (let b = 0; b < NB; b++) out[b] /= bandW[b] || 1;
    for (let b = 0; b < NB; b++) if (!bandW[b]) {
      let lo = b - 1, hi = b + 1;
      while (lo >= 0 && !bandW[lo]) lo--;
      while (hi < NB && !bandW[hi]) hi++;
      out[b] = lo < 0 ? out[hi] : hi >= NB ? out[lo] : out[lo] + (out[hi] - out[lo]) * (b - lo) / (hi - lo);
    }
    return out;
  };
  const smooth = (f, L) => {
    const x = Float64Array.from(f);
    if (L > 0) ops.solveImplicit(new Float64Array(N).fill(1), new Float64Array(N).fill((L / R) ** 2), Float64Array.from(f), x, 1e-6);
    return x;
  };
  const hGrad = ops.gradient(smooth(elev, P.oroScale));

  // air masses (kg/m²): the boundary layer follows the ground, the free troposphere is what is
  // left of the column below the top
  const mb = P.blMass, mf = new Float64Array(N);
  for (let i = 0; i < N; i++) mf[i] = Math.max(300, 1e4 * Math.exp(-elev[i] / 8000) - mb - P.topMass);
  const colMass = elev.map(z => Math.exp(-z / P.vapourScaleHeight));

  // state
  const T = new Float64Array(N), Wb = new Float64Array(N), Wf = new Float64Array(N), soil = new Float64Array(N);
  for (let i = 0; i < N; i++) { T[i] = 28 - 45 * sinLat[i] ** 2; soil[i] = ocean[i] ? 0 : P.bucket / 2; }
  const surfT = i => T[i] - P.lapseRate * elev[i];
  // saturation: the whole column (the vapour scale height includes the cooling with height),
  // the boundary layer at its middle, and the free troposphere the rest
  const wsat = i => P.wsat0 * Math.exp(0.0641 * T[i]) * colMass[i];
  const wbsat = i => mb * qsat(surfT(i) - 3);
  const wfsat = i => Math.max(0.5, wsat(i) - wbsat(i));
  for (let i = 0; i < N; i++) { Wb[i] = 0.8 * wbsat(i); Wf[i] = 0.5 * wfsat(i); }

  // per-edge friction and Coriolis
  const E6 = 6 * N, fEdge = new Float64Array(E6), rEdge = new Float64Array(E6), rFree = new Float64Array(E6).fill(P.ftDamping);
  const fMin = 2 * P.rotation * Math.sin(P.minCoriolis * deg);
  for (let i = 0; i < N; i++) for (let k = 0; k < ops.nbrCount[i]; k++) {
    const e = 6 * i + k, j = ops.nbr[e];
    fEdge[e] = P.rotation * (sinLat[i] + sinLat[j]);
    rEdge[e] = 0.5 * ((ocean[i] ? P.frictionOcean : P.frictionLand) + (ocean[j] ? P.frictionOcean : P.frictionLand));
  }

  const phi = new Float64Array(N), phiF = new Float64Array(N);
  const un = new Float64Array(E6), wind = new Float64Array(3 * N), unF = new Float64Array(E6), windF = new Float64Array(3 * N);
  const speed = new Float64Array(N), div = new Float64Array(N), upslope = new Float64Array(N);
  const ekman = new Float64Array(3 * N), upwell = new Float64Array(N);
  const ones = new Float64Array(N).fill(1), mixK = new Float64Array(N), mixB = new Float64Array(N), mixX = new Float64Array(N);
  const zT = new Float64Array(NB), storm = new Float64Array(NB);
  const gauss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

  // the wind of pressure field p on the edges (uo) and cells (w), with per-edge damping r:
  // u_n = −(r g_n + f g_t)/(r² + f²), clipped, then mixed by eddies
  function balance(p, r, maxWind, uo, w) {
    for (let i = 0; i < N; i++) for (let k = 0; k < ops.nbrCount[i]; k++) {
      const e = 6 * i + k, j = ops.nbr[e];
      const gn = (p[j] - p[i]) / (ops.dist[e] * R);
      const gt = (p[ops.side2[e]] - p[ops.side1[e]]) / 3 / (ops.len[e] * R);
      const re = r[e], f = fEdge[e], f2 = Math.max(f * f, fMin * fMin);
      // clipping both directions of an edge alike keeps every flux antisymmetric
      uo[e] = Math.max(-maxWind, Math.min(maxWind, -(re * gn + f * gt) / (re * re + f2)));
    }
    ops.reconstruct(uo, w);
    if (P.windMixing > 0) {
      mixK.fill((P.windMixing / R) ** 2);
      for (let c = 0; c < 3; c++) {
        for (let i = 0; i < N; i++) { mixB[i] = w[3 * i + c]; mixX[i] = mixB[i]; }
        ops.solveImplicit(ones, mixK, mixB, mixX, 1e-4, 100, c > 0);
        for (let i = 0; i < N; i++) w[3 * i + c] = mixX[i];
      }
      for (let i = 0; i < N; i++) {
        const px = ops.pos[3 * i], py = ops.pos[3 * i + 1], pz = ops.pos[3 * i + 2];
        const q = w[3 * i] * px + w[3 * i + 1] * py + w[3 * i + 2] * pz;
        w[3 * i] -= q * px; w[3 * i + 1] -= q * py; w[3 * i + 2] -= q * pz;
      }
      for (let i = 0; i < N; i++) for (let k = 0; k < ops.nbrCount[i]; k++) {
        const e = 6 * i + k, j = ops.nbr[e];
        uo[e] = 0.5 * ((w[3 * i] + w[3 * j]) * ops.nrm[3 * e] + (w[3 * i + 1] + w[3 * j + 1]) * ops.nrm[3 * e + 1] + (w[3 * i + 2] + w[3 * j + 2]) * ops.nrm[3 * e + 2]);
      }
    }
  }

  // ---- Gill response to the heating of the last step's rain
  const phiG = new Float64Array(N), gB = new Float64Array(N), uG = new Float64Array(E6);
  const rainRate = new Float64Array(N), gillW = new Float64Array(N);
  {
    const fT = 2 * P.rotation * Math.sin(P.gillLat * deg);
    for (let i = 0; i < N; i++) gillW[i] = 1 / (1 + (2 * P.rotation * sinLat[i] / fT) ** 4);
  }
  let gillPC = null;
  if (P.gillCoupling > 0) {
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
  const gillApply = (v, o) => {
    for (let i = 0; i < N; i++) for (let k = 0; k < ops.nbrCount[i]; k++) {
      const e = 6 * i + k, j = ops.nbr[e];
      const gn = (v[j] - v[i]) / (ops.dist[e] * R);
      const gt = (v[ops.side2[e]] - v[ops.side1[e]]) / 3 / (ops.len[e] * R);
      const r = rEdge[e], f = fEdge[e], f2 = Math.max(f * f, fMin * fMin);
      uG[e] = -(r * gn + f * gt) / (r * r + f2);
    }
    const c2 = P.gillC ** 2;
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = 0; k < ops.nbrCount[i]; k++) { const e = 6 * i + k; s += ops.len[e] * uG[e]; }
      o[i] = ops.area[i] * P.gillDamp * v[i] + c2 * s / R;
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

  function winds() {
    if (gillPC) gill();
    // the thermal equator: the warmest latitude band, held within ±20°
    zonalMean(T, zT);
    let best = 0;
    for (let b = 0; b < NB; b++) if (zT[b] > zT[best]) best = b;
    let shift = ((best + 0.5) / NB - 0.5) * Math.PI;
    shift = Math.max(-20 * deg, Math.min(20 * deg, shift)) * 0.7;
    const [a0, a1, a2, a3] = P.cellPressure;
    let Tm = 0, Aw = 0;
    for (let i = 0; i < N; i++) { Tm += T[i] * ops.area[i]; Aw += ops.area[i]; }
    Tm /= Aw;
    let Ttrop = 0, Wt = 0;
    for (let i = 0; i < N; i++) { Ttrop += T[i] * ops.area[i] * gillW[i]; Wt += ops.area[i] * gillW[i]; }
    Ttrop /= Wt;
    for (let i = 0; i < N; i++) {
      const x = Math.abs(ops.lat[i] - shift) / deg;
      const conv = 1 / (1 + Math.exp(-(T[i] - P.convectionTemp) / 1.5));
      let p = a0 * conv * gauss(x, 0, P.equatorialWidth) + a1 * gauss(x, 32, 12) + a2 * gauss(x, 62, 10) + a3 * gauss(x, 90, 12);
      // a column warmer than its surroundings has lower pressure beneath it. In the tropics
      // the surroundings are the whole tropical belt (Lindzen & Nigam 1987), so the lows
      // follow the warmest water and land across latitudes too; further out, its latitude
      const ref = gillW[i] * Ttrop + (1 - gillW[i]) * zT[band[i]];
      p -= (ocean[i] ? P.thermalLowOcean : P.thermalLow) * (T[i] - ref);
      phi[i] = p * 100 / 1.2 + phiG[i];
      // aloft: the surface pressure plus the thickness of the column below
      phiF[i] = phi[i] + G * P.ftHeight * (T[i] - Tm) / (273.15 + Tm);
    }
    balance(phi, rEdge, P.maxWind, un, wind);
    balance(phiF, rFree, P.ftMaxWind, unF, windF);
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
  // diagnostics, annual means: convective rain, and each layer's vapour
  const diagOut = P.diagnostics ? { rainConv: new Float64Array(N), Wb: new Float64Array(N), Wf: new Float64Array(N), RHb: new Float64Array(N), RHf: new Float64Array(N), conv: new Float64Array(N) } : null;
  const counts = new Float64Array(MONTHS);

  const diag = new Float64Array(N), kDiff = new Float64Array(N), rhs = new Float64Array(N);
  const rain = new Float64Array(N), evap = new Float64Array(N), wMean = new Float64Array(N);
  const fluxB = new Float64Array(N), fluxF = new Float64Array(N), invAR2 = new Float64Array(N);
  for (let i = 0; i < N; i++) invAR2[i] = 1 / (ops.area[i] * R2);
  const invMf = mf.map(m => 1 / m), invPhi = colMass.map(m => 1 / m);
  const sB = new Float64Array(N), sF = new Float64Array(N), qs = new Float64Array(N), thr = new Float64Array(N);
  const bandHot = new Float64Array(NB), wtgT = new Float64Array(NB);
  const oroA = new Float64Array(N), evA = new Float64Array(N), liftA = new Float64Array(N), subsA = new Float64Array(N), qc = new Float64Array(N);
  // each edge once, from the lower cell id
  const edgeList = [];
  for (let i = 0; i < N; i++) for (let k = 0; k < ops.nbrCount[i]; k++) if (ops.nbr[6 * i + k] > i) edgeList.push(6 * i + k);
  const nEdge = edgeList.length, edgeSlot = Int32Array.from(edgeList);
  const edgeA = new Int32Array(nEdge), edgeB = new Int32Array(nEdge), cB = new Float64Array(nEdge), cF = new Float64Array(nEdge);
  for (let q = 0; q < nEdge; q++) { edgeA[q] = Math.floor(edgeSlot[q] / 6); edgeB[q] = ops.nbr[edgeSlot[q]]; }
  // diffusion per edge, K (l/d) m̄ for each layer (the boundary layer's mass is the same
  // everywhere), and its sum per cell, for the stable step
  const dB = new Float64Array(nEdge), dF = new Float64Array(nEdge), dSumB = new Float64Array(N), dSumF = new Float64Array(N);
  for (let q = 0; q < nEdge; q++) {
    const a = edgeA[q], b = edgeB[q], l = P.moistureDiffusion * ops.lap[edgeSlot[q]];
    dB[q] = l; dF[q] = l * 0.5 * (colMass[a] + colMass[b]);
    dSumB[a] += dB[q]; dSumB[b] += dB[q]; dSumF[a] += dF[q]; dSumF[b] += dF[q];
  }

  const totalSteps = years * stepsPerYear;
  for (let step = 0; step < totalSteps; step++) {
    const c = (step % stepsPerYear + 0.5) / stepsPerYear;
    const lambda = solarLongitude(((c - P.equinoxDay / P.yearDays) % 1 + 1) % 1, P.orbit);

    // ---- temperature: (C/dt + B − ∇·k∇) T' = C/dt T + S(1 − α) − A, implicit, diffusing
    // moist static energy through k = D (1 + (L/cp) dq/dT), q = RH·q_sat(T)
    for (let i = 0; i < N; i++) {
      const rh = Math.min(1, (Wb[i] + Wf[i]) / Math.max(0.1, wsat(i)));
      kDiff[i] = P.heatDiffusion * (ocean[i] ? 1 : P.landDiffusion) * (1 + rh * 0.0641 * qsat(surfT(i)) / CP_OVER_LV);
    }
    for (let i = 0; i < N; i++) {
      const Ts = surfT(i);
      const ice = 1 / (1 + Math.exp((Ts - P.iceTemp) / 2));
      const alpha = (P.albedo + P.albedoP2 * p2[i]) * (1 - ice) + P.albedoIce * ice;
      const S = dailyInsolation(ops.lat[i], lambda, P.orbit);
      const up = 4.18e6 * P.upwellEfficiency * upwell[i];
      diag[i] = heatCap[i] / dt + P.olrB + up;
      rhs[i] = heatCap[i] / dt * T[i] + S * (1 - alpha) - P.olrA + up * P.upwellTemp;
    }
    ops.solveImplicit(diag, kDiff, rhs, T, 1e-6);
    // for experiments: observed sea temperatures, 12 months, interpolated
    if (P.sstObs) {
      const mfr = c * 12 - 0.5, m0 = (Math.floor(mfr) + 12) % 12, m1 = (m0 + 1) % 12, w = mfr - Math.floor(mfr);
      for (let i = 0; i < N; i++) if (ocean[i]) T[i] = (1 - w) * P.sstObs[m0 * N + i] + w * P.sstObs[m1 * N + i];
    }

    // ---- winds from the new temperatures
    winds();

    // ---- moisture, in substeps short enough for upwind transport in both layers
    let maxOut = 0;
    for (let i = 0; i < N; i++) {
      let ob = 0, of = 0;
      for (let k = 0; k < ops.nbrCount[i]; k++) {
        const e = 6 * i + k;
        if (un[e] > 0) ob += un[e] * ops.len[e];
        if (unF[e] > 0) of += unF[e] * ops.len[e];
      }
      maxOut = Math.max(maxOut, Math.max(ob, of) / (ops.area[i] * R));
    }
    const sub = Math.max(1, Math.ceil(dt * maxOut / 0.5), Math.ceil(dt / (6 * 3600)));
    const h = dt / sub;
    for (let q = 0; q < nEdge; q++) {
      const e = edgeSlot[q], l = ops.len[e] * R * h;
      cB[q] = un[e] * l;
      // air aloft crossing into a column over high ground carries only the vapour that lies
      // above it: vapour falls off with height over the vapour scale height, so it moves as
      // Wf/φ times the shallower column's φ = e^(−z/H)
      cF[q] = unF[e] * l * Math.min(colMass[edgeA[q]], colMass[edgeB[q]]);
    }
    // storminess: midlatitude weather systems lift air where the zonal-mean temperature
    // falls steeply towards the pole
    const bandKm = Math.PI * R / NB / 1000;
    for (let b = 0; b < NB; b++) {
      const g = Math.abs(zT[Math.min(NB - 1, b + 1)] - zT[Math.max(0, b - 1)]) / (2 * bandKm) * 100;
      storm[b] = Math.tanh(g / P.stormGradient);
    }
    // the free troposphere's temperature: in the tropics it is the same everywhere (the weak
    // temperature gradient), set by the warmest convecting surfaces: the warmest tenth of each
    // latitude band, at its warmest within wtgLat; outside the tropics, the local temperature
    // smoothed over wtgScale
    const Tls = smooth(T, P.wtgScale);
    {
      const vals = Array.from({ length: NB }, () => []);
      for (let i = 0; i < N; i++) vals[band[i]].push(T[i]);
      for (let b = 0; b < NB; b++) { const v = vals[b].sort((x, y) => x - y); bandHot[b] = v.length ? v[Math.floor(0.9 * (v.length - 1))] : NaN; }
      for (let b = 0; b < NB; b++) if (Number.isNaN(bandHot[b])) bandHot[b] = bandHot[b > 0 ? b - 1 : b + 1];
      const reach = Math.round(P.wtgLat / (180 / NB));
      for (let b = 0; b < NB; b++) { let m = -Infinity; for (let k = Math.max(0, b - reach); k <= Math.min(NB - 1, b + reach); k++) m = Math.max(m, bandHot[k]); wtgT[b] = m; }
    }
    for (let i = 0; i < N; i++) {
      const wt = gillW[i];
      Tls[i] = wt * wtgT[band[i]] + (1 - wt) * Tls[i];
    }
    for (let i = 0; i < N; i++) {
      const Ts = surfT(i);
      sB[i] = wbsat(i); sF[i] = wfsat(i); qs[i] = qsat(Ts);
      // the boundary-layer humidity above which air convects: convRH of saturation at the
      // large-scale temperature, less what a surface warmer than that makes up in heat
      const Tl = Tls[i] - P.lapseRate * elev[i];
      qc[i] = P.convRH * qsat(Tl - 3) - CP_OVER_LV * (Ts - Tl);
      thr[i] = -P.rainSteep * (P.rainR0 - P.rhStorm * storm[band[i]]) + Math.log(h / DAY);
      // evaporation in kg/m² per substep per unit of qsat − q
      let ef = P.evapCoeff * (speed[i] + P.gust) * h;
      if (!ocean[i] && Ts < 0) ef *= 0.2;
      evA[i] = ef;
      // the share of the boundary layer lifted (convergence, and wind up the slopes over its
      // depth) or replaced from above (divergence) per substep
      liftA[i] = 1 - Math.exp(-(Math.max(0, -div[i]) + P.stormLift * storm[band[i]]) * h);
      // air forced up a slope by w cools, and what it held above saturation at the new level,
      // W w h / H for saturated air, condenses (Smith & Barstad 2004); drier air rises
      // further before it condenses, so the share falls off with its humidity
      oroA[i] = Math.min(1, P.oroEfficiency * Math.max(0, upslope[i]) * h / P.vapourScaleHeight);
      subsA[i] = 1 - Math.exp(-Math.max(0, div[i]) * h);
    }
    // explicit diffusion of humidity, conservative, in stable steps
    let worst = 0;
    for (let i = 0; i < N; i++) worst = Math.max(worst, dSumB[i] / ops.area[i], dSumF[i] / (ops.area[i] * colMass[i]));
    const nDiff = Math.ceil(worst * h / R2 / 0.8), hd = h / R2 / nDiff;
    const mixA = 1 - Math.exp(-h / P.mixTime), convA = 1 - Math.exp(-h / P.convTime);

    rain.fill(0); evap.fill(0); wMean.fill(0);
    const dbgT = process.env.DBG2 && step % 24 === 0 ? new Float64Array(8) : null;
    for (let s = 0; s < sub; s++) {
      for (let n = 0; n < nDiff; n++) {
        fluxB.fill(0); fluxF.fill(0);
        for (let q = 0; q < nEdge; q++) {
          const a = edgeA[q], b = edgeB[q];
          const Fb = hd * dB[q] * (Wb[b] - Wb[a]), Ff = hd * dF[q] * (Wf[b] * invPhi[b] - Wf[a] * invPhi[a]);
          fluxB[a] += Fb; fluxB[b] -= Fb; fluxF[a] += Ff; fluxF[b] -= Ff;
        }
        for (let i = 0; i < N; i++) { Wb[i] = Math.max(0, Wb[i] + fluxB[i] / ops.area[i]); Wf[i] = Math.max(0, Wf[i] + fluxF[i] / ops.area[i]); }
      }
      // upwind transport, kg per substep through each edge
      fluxB.fill(0); fluxF.fill(0);
      for (let q = 0; q < nEdge; q++) {
        const a = edgeA[q], b = edgeB[q], c1 = cB[q], c2 = cF[q];
        const Fb = c1 * (c1 > 0 ? Wb[a] : Wb[b]), Ff = c2 * (c2 > 0 ? Wf[a] * invPhi[a] : Wf[b] * invPhi[b]);
        fluxB[a] -= Fb; fluxB[b] += Fb; fluxF[a] -= Ff; fluxF[b] += Ff;
      }
      for (let i = 0; i < N; i++) {
        let wb = Math.max(0, Wb[i] + fluxB[i] * invAR2[i]) / mb, wf = Math.max(0, Wf[i] + fluxF[i] * invAR2[i]);
        // wb is now the boundary layer's specific humidity
        let E = evA[i] * Math.max(0, qs[i] - wb);
        if (!ocean[i]) E *= Math.min(1, soil[i] / (0.75 * P.bucket));
        let Wbi = wb * mb + E;
        // vertical exchange: lifted boundary-layer air, sinking air from aloft, shallow mixing
        const qf = wf * invMf[i];
        const up = Wbi * liftA[i], down = Math.min(wf, mb * qf * subsA[i]);
        const mix = (Wbi / mb - qf) * mb * mixA;
        Wbi += down - up - mix; wf += up - down + mix;
        // rain forced by the slopes, from the boundary layer
        const rb = Wbi / sB[i], oro = oroA[i] * Wbi * Math.max(0, (rb - P.oroMinRH) / (1 - P.oroMinRH));
        Wbi -= oro;
        // condensing in the boundary layer: it goes up as cloud
        if (Wbi > sB[i]) { wf += Wbi - sB[i]; Wbi = sB[i]; }
        // deep convection takes the boundary layer's excess over the threshold up; part of it
        // rains, the rest is left in the free troposphere
        const rf = Math.min(1, wf / sF[i]);
        const conv = Math.max(0, Wbi - mb * qc[i]) * convA;
        const eff = P.effMin + (P.effMax - P.effMin) * rf;
        Wbi -= conv; wf += conv * (1 - eff);
        // rain from the free troposphere: large-scale and storms
        const want = Math.exp(thr[i] + P.rainSteep * wf / sF[i]);
        let Pr = wf > 0 ? wf * (1 - Math.exp(-want / wf)) : 0;
        if (wf - Pr > sF[i]) Pr = wf - sF[i];
        wf -= Pr;
        Pr += conv * eff + oro;
        if (diagOut && step >= totalSteps - stepsPerYear) { const k = 1 / (sub * stepsPerYear); diagOut.rainConv[i] += conv * eff / h * DAY * k; diagOut.Wb[i] += Wbi * k; diagOut.Wf[i] += wf * k; diagOut.RHb[i] += Wbi / sB[i] * k; diagOut.RHf[i] += wf / sF[i] * k; diagOut.conv[i] += conv / h * DAY * k; }
        const tap = conv;
        Wb[i] = Wbi; Wf[i] = wf;
        if (dbgT) { const A = ops.area[i]; dbgT[0] += A * E; dbgT[1] += A * up; dbgT[2] += A * down; dbgT[3] += A * mix; dbgT[4] += A * tap; dbgT[5] += A * Pr; dbgT[6] += A * (fluxB[i] * invAR2[i]); dbgT[7] += A; }
        rain[i] += Pr; evap[i] += E; wMean[i] += (Wbi + wf) / sub;
        if (!ocean[i]) soil[i] = Math.min(P.bucket, Math.max(0, soil[i] + Pr - E));
      }
    }

    if (process.env.DBG2 && step % 24 === 0) {
      let a = 0, b = 0, w = 0, e = 0, l = 0, m = 0, t = 0;
      for (let i = 0; i < N; i++) { const A = ops.area[i]; a += A * Wb[i] / sB[i]; b += A * Wf[i] / sF[i]; w += A; e += A * evap[i] / dt * DAY; }
      if (dbgT) console.log('terms mm/day E up down mix tap P advB', [...dbgT.slice(0, 7)].map(v => (v / dbgT[7] / dt * DAY).toFixed(2)).join(' '));
      console.log(step, 'BL RH', (a / w).toFixed(2), 'FT RH', (b / w).toFixed(2), 'E', (e / w).toFixed(2), 'sub', sub);
    }
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
  return { ...out, ocean, diag: diagOut };
}
