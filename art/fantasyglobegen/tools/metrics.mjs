// The yardstick for the climate model: how close its climate of the real Earth comes to the
// observed one, and whether it stays within physical bounds.
//
// Everything is compared at one evaluation level (5, about 220 km apart): the observations
// (GPCP precipitation at 2.5°, NCEP/NCAR reanalysis) resolve nothing finer, so a model run at
// level 6 is averaged down to level 5 first and isn't penalised for detail the observations
// can't show. All means and correlations are area-weighted.
//
// Skills, each 1 for a perfect match:
//   P        annual precipitation: pattern correlation, correlation of log(P + 0.5) (which
//            weighs deserts as much as rain forests), the same over land only, and the
//            RMSE skill 1 − rmse/σ_obs
//   Pseason  monthly anomalies from the annual mean, correlated month by month (monsoons,
//            the ITCZ's swing, Mediterranean winters)
//   Pzonal   1 − rmse/σ of the zonal means
//   Pheight  land precipitation by height band (0–0.5, 0.5–1, 1–2, 2–3, >3 km): 1 − the mean
//            |log ratio| model/observed, which catches mountains that rain too much
//   Plength  how far the pattern reaches: 1 − |log ratio| of the distances at which the
//            spatial autocorrelation of annual precipitation, less its zonal mean, falls to 1/2
//   Pdist    1 − the Wasserstein distance between the distributions of annual land
//            precipitation, in units of its mean: too spiky or too uniform
//   T        annual temperature RMSE skill, land and all; Tseason the same for July − January
//   wind     correlation of annual u and v
//   koppen   land area classed alike by the Köppen–Geiger rules (Peel et al. 2007), from
//            monthly T and P: main group (A B C D E) and full class
// Physical checks: global precipitation equals evaporation (water is conserved), no negative
// or non-finite values, annual precipitation nowhere above 15 mm/day at this scale (the wettest
// 2.5° boxes on Earth get about 12).
//
// The overall score is the mean of the skills, with precipitation counted twice, since it
// drives what the globe looks like, less smooth penalties for breaking the physical bounds.
import { buildGrid, restrict, prolong } from '../js/grid.js';
import { buildOps } from '../js/climate/ops.js';
import { oceanMask } from '../js/climate/model.js';

export const EVAL_LEVEL = 5;
const MONTH_DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const grids = {};
export const gridAt = l => grids[l] || (grids[l] = buildGrid(l));
const opsCache = {};
const opsAt = l => opsCache[l] || (opsCache[l] = buildOps(gridAt(l)));

// monthly fields (12 × N at level `from`) down to level `to`
export function toLevel(vals, from, to, frames = 12) {
  const n0 = vals.length / frames, out = [];
  for (let f = 0; f < frames; f++) {
    let v = vals.subarray(f * n0, (f + 1) * n0);
    for (let l = from; l > to; l--) v = restrict(v, gridAt(l), gridAt(l - 1));
    for (let l = from; l < to; l++) v = prolong(v, gridAt(l), gridAt(l + 1));
    out.push(Float64Array.from(v));
  }
  return out;
}

// Köppen–Geiger class from 12 monthly temperatures (°C) and precipitations (mm/month), after
// Peel et al. 2007, with summer the six months of April to September in the north
export function koppen(T, P, north) {
  const MAT = T.reduce((a, b) => a + b) / 12, MAP = P.reduce((a, b) => a + b);
  const Thot = Math.max(...T), Tcold = Math.min(...T), Tmon10 = T.filter(t => t > 10).length;
  const summer = north ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2];
  const winter = north ? [9, 10, 11, 0, 1, 2] : [3, 4, 5, 6, 7, 8];
  const Ps = summer.map(m => P[m]), Pw = winter.map(m => P[m]);
  const Psum = Ps.reduce((a, b) => a + b), Pwin = Pw.reduce((a, b) => a + b);
  const Psdry = Math.min(...Ps), Pswet = Math.max(...Ps), Pwdry = Math.min(...Pw), Pwwet = Math.max(...Pw);
  const Pdry = Math.min(...P);
  const Pth = 20 * MAT + (Pwin >= 0.7 * MAP ? 0 : Psum >= 0.7 * MAP ? 280 : 140);
  if (Thot < 10) return Thot > 0 ? 'ET' : 'EF';
  if (MAP < 10 * Pth) return (MAP < 5 * Pth ? 'BW' : 'BS') + (MAT >= 18 ? 'h' : 'k');
  if (Tcold >= 18) return Pdry >= 60 ? 'Af' : Pdry >= 100 - MAP / 25 ? 'Am' : 'Aw';
  const g = Tcold > 0 ? 'C' : 'D';
  const s = Psdry < 40 && Psdry < Pwwet / 3 ? 's' : Pwdry < Pswet / 10 ? 'w' : 'f';
  const t = Thot >= 22 ? 'a' : Tmon10 >= 4 ? 'b' : g === 'D' && Tcold < -38 ? 'd' : 'c';
  return g + s + t;
}

let obsCache = null;
// obs: { temperature, precipitation, wind_east, wind_north } layers of earth-observed.globe
// height: Earth's heights at level hLevel
export function prepare(obs, height, hLevel) {
  if (obsCache) return obsCache;
  const L = EVAL_LEVEL, ops = opsAt(L), N = ops.N;
  let h = height;
  for (let l = hLevel; l > L; l--) h = restrict(h, gridAt(l), gridAt(l - 1));
  const o = {};
  for (const [k, n] of [['T', 'temperature'], ['P', 'precipitation'], ['U', 'wind_east'], ['V', 'wind_north']])
    o[k] = toLevel(obs[n].values, obs[n].level, L);
  const ocean = oceanMask(ops, h);
  const koppenObs = [];
  for (let i = 0; i < N; i++) koppenObs.push(ocean[i] ? '' : koppen(o.T.map(m => m[i]), o.P.map((m, k) => m[i] * MONTH_DAYS[k]), ops.lat[i] >= 0));
  return (obsCache = { ops, N, h: Float64Array.from(h), ocean, o, koppenObs });
}

const annual = ms => { const a = new Float64Array(ms[0].length); for (const m of ms) for (let i = 0; i < a.length; i++) a[i] += m[i] / ms.length; return a; };

export function score(res, runLevel, prep) {
  const { ops, N, h, ocean, o, koppenObs } = prep, area = ops.area, lat = ops.lat;
  const m = {
    T: toLevel(res.temperature, runLevel, EVAL_LEVEL), P: toLevel(res.precipitation, runLevel, EVAL_LEVEL),
    E: toLevel(res.evaporation, runLevel, EVAL_LEVEL), U: toLevel(res.wind_east, runLevel, EVAL_LEVEL), V: toLevel(res.wind_north, runLevel, EVAL_LEVEL),
  };
  const all = () => true, land = i => !ocean[i];
  const mean = (f, mask = all) => { let s = 0, w = 0; for (let i = 0; i < N; i++) if (mask(i)) { s += f[i] * area[i]; w += area[i]; } return s / w; };
  const corr = (a, b, mask = all) => {
    const ma = mean(a, mask), mb = mean(b, mask); let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < N; i++) if (mask(i)) { const x = a[i] - ma, y = b[i] - mb; sab += area[i] * x * y; saa += area[i] * x * x; sbb += area[i] * y * y; }
    return sab / Math.sqrt(saa * sbb);
  };
  const rmse = (a, b, mask = all) => { let s = 0, w = 0; for (let i = 0; i < N; i++) if (mask(i)) { s += area[i] * (a[i] - b[i]) ** 2; w += area[i]; } return Math.sqrt(s / w); };
  const sd = (a, mask = all) => { const ma = mean(a, mask); return Math.sqrt(mean(a.map(v => (v - ma) ** 2), mask)); };
  const skill = (a, b, mask = all) => 1 - rmse(a, b, mask) / sd(b, mask);
  const log = a => a.map(v => Math.log(Math.max(0, v) + 0.5));

  const Pm = annual(m.P), Po = annual(o.P), Tm = annual(m.T), To = annual(o.T), Em = annual(m.E);
  const r = {};
  r.P_corr = corr(Pm, Po);
  r.P_logcorr = corr(log(Pm), log(Po));
  r.P_land_logcorr = corr(log(Pm), log(Po), land);
  r.P_land_corr = corr(Pm, Po, land);
  r.P_skill = skill(Pm, Po);
  // seasonal anomalies, month by month
  let sc = 0;
  for (let k = 0; k < 12; k++) sc += corr(m.P[k].map((v, i) => v - Pm[i]), o.P[k].map((v, i) => v - Po[i])) / 12;
  r.Pseason = sc;
  // zonal means in 5° bands
  const NB = 36, zm = (f, mask = all) => {
    const s = new Float64Array(NB), w = new Float64Array(NB);
    for (let i = 0; i < N; i++) if (mask(i)) { const b = Math.min(NB - 1, Math.floor((lat[i] / Math.PI + 0.5) * NB)); s[b] += f[i] * area[i]; w[b] += area[i]; }
    return { s: [...s].map((v, b) => v / (w[b] || 1)), w };
  };
  { const a = zm(Pm), b = zm(Po); let e = 0, v = 0, W = 0; const mb = b.s.reduce((x, y, k) => x + y * b.w[k], 0) / b.w.reduce((x, y) => x + y);
    for (let k = 0; k < NB; k++) { e += b.w[k] * (a.s[k] - b.s[k]) ** 2; v += b.w[k] * (b.s[k] - mb) ** 2; W += b.w[k]; }
    r.Pzonal = 1 - Math.sqrt(e / v); }
  // by height
  const hb = [0, 500, 1000, 2000, 3000, Infinity];
  r.P_by_height = [];
  let hs = 0, hn = 0;
  for (let k = 0; k < hb.length - 1; k++) {
    const mask = i => !ocean[i] && h[i] >= hb[k] && h[i] < hb[k + 1];
    const a = mean(Pm, mask), b = mean(Po, mask);
    r.P_by_height.push([+a.toFixed(2), +b.toFixed(2)]);
    hs += Math.abs(Math.log(a / b)); hn++;
  }
  r.Pheight = 1 - hs / hn;
  // distribution of land precipitation: Wasserstein-1 between area-weighted samples
  { const idx = []; for (let i = 0; i < N; i++) if (!ocean[i]) idx.push(i);
    const W = idx.reduce((s, i) => s + area[i], 0);
    const cdf = f => { const s = [...idx].sort((x, y) => f[x] - f[y]); const out = []; let c = 0; for (const i of s) { c += area[i] / W; out.push([c, f[i]]); } return out; };
    const qa = cdf(Pm), qb = cdf(Po);
    // integrate |Qa(p) − Qb(p)| over p
    let d = 0, ia = 0, ib = 0, p = 0;
    while (ia < qa.length && ib < qb.length) {
      const pn = Math.min(qa[ia][0], qb[ib][0]);
      d += (pn - p) * Math.abs(qa[ia][1] - qb[ib][1]); p = pn;
      if (qa[ia][0] <= pn) ia++; if (ib < qb.length && qb[ib][0] <= pn) ib++;
    }
    r.Pdist = 1 - d / mean(Po, land); }
  // how far the pattern reaches: the distance at which the spatial autocorrelation of
  // annual precipitation (anomalies from the zonal mean) falls to 1/2, model vs observed
  { const corrLength = f => {
      const z = zm(f).s, a = f.map((v, i) => v - z[Math.min(NB - 1, Math.floor((lat[i] / Math.PI + 0.5) * NB))]);
      const pos = ops.pos, NL = 40, bw = 100e3 / 6.371e6;
      const num = new Float64Array(NL), den = new Float64Array(NL);
      for (let i = 0; i < N; i += 2) for (let j = 0; j < N; j += 3) {
        const c = pos[3 * i] * pos[3 * j] + pos[3 * i + 1] * pos[3 * j + 1] + pos[3 * i + 2] * pos[3 * j + 2];
        if (c < 0.9) continue;
        const b = Math.floor(Math.acos(Math.min(1, c)) / bw);
        if (b >= NL) continue;
        const w = area[i] * area[j];
        num[b] += w * a[i] * a[j]; den[b] += w * 0.5 * (a[i] * a[i] + a[j] * a[j]);
      }
      let pb = -1, pc = 1;
      for (let b = 0; b < NL; b++) {
        if (!(den[b] > 0)) continue;
        const c = num[b] / den[b];
        if (c < 0.5) return pb < 0 ? 100 * (b + 0.5) : 100 * (pb + 0.5 + (b - pb) * (pc - 0.5) / (pc - c));
        pb = b; pc = c;
      }
      return 100 * NL;
    };
    r.P_length = [corrLength(Pm), corrLength(Po)].map(v => Math.round(v));
    r.Plength = 1 - Math.abs(Math.log(r.P_length[0] / r.P_length[1])); }
  r.dry_land = [mean(Pm.map(v => v < 0.5 ? 1 : 0), land), mean(Po.map(v => v < 0.5 ? 1 : 0), land)].map(v => +v.toFixed(3));
  r.T_skill = skill(Tm, To);
  r.T_land_skill = skill(Tm, To, land);
  r.T_land_rmse = rmse(Tm, To, land);
  const sm = m.T[6].map((v, i) => v - m.T[0][i]), so = o.T[6].map((v, i) => v - o.T[0][i]);
  r.Tseason = skill(sm, so);
  r.u_corr = corr(annual(m.U), annual(o.U));
  r.v_corr = corr(annual(m.V), annual(o.V));
  // Köppen
  let kw = 0, k1 = 0, k3 = 0;
  const conf = {};
  for (let i = 0; i < N; i++) {
    if (ocean[i]) continue;
    const c = koppen(m.T.map(x => x[i]), m.P.map((x, k) => x[i] * MONTH_DAYS[k]), lat[i] >= 0), c0 = koppenObs[i];
    kw += area[i];
    if (c[0] === c0[0]) k1 += area[i];
    if (c === c0) k3 += area[i];
    const key = c0[0] + '>' + c[0]; conf[key] = (conf[key] || 0) + area[i];
  }
  r.koppen_group = k1 / kw;
  r.koppen_class = k3 / kw;
  r.koppen_confusion = Object.fromEntries(Object.entries(conf).filter(([k]) => k[0] !== k[2]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [k, +(v / kw).toFixed(3)]));
  // globals and physical checks
  r.T_global = mean(Tm); r.T_global_obs = mean(To);
  r.P_global = mean(Pm); r.E_global = mean(Em); r.P_global_obs = mean(Po);
  r.water_imbalance = Math.abs(r.P_global - r.E_global) / r.P_global;
  r.P_max = Math.max(...Pm);
  let bad = 0;
  for (const f of [res.temperature, res.precipitation, res.evaporation]) for (const v of f) if (!Number.isFinite(v)) bad++;
  for (const v of res.precipitation) if (v < 0) bad++;
  r.bad_values = bad;
  r.checks_ok = bad === 0 && r.water_imbalance < 0.02 && r.P_max < 15;
  // overall
  const Pskills = [r.P_corr, r.P_logcorr, r.P_land_logcorr, r.P_skill, r.Pseason, r.Pzonal, r.Pheight, r.Pdist, r.Plength].map(v => Math.max(0, v));
  const others = [r.T_land_skill, r.Tseason, (r.u_corr + r.v_corr) / 2, r.koppen_group, r.koppen_class].map(v => Math.max(0, v));
  r.score_P = Pskills.reduce((a, b) => a + b) / Pskills.length;
  // smooth penalties: global precipitation off by 10% costs 0.05, 20 mm/day at the wettest
  // point 0.033, a 1% leak of water 0.02, and any broken value 0.2
  r.score = (2 * r.score_P + others.reduce((a, b) => a + b) / others.length) / 3
    - Math.abs(r.P_global / r.P_global_obs - 1) / 2 - Math.max(0, r.P_max / 15 - 1) / 10
    - 2 * r.water_imbalance - (bad ? 0.2 : 0);
  return r;
}

export function summary(r) {
  const f = (v, d = 3) => (typeof v === 'number' ? v.toFixed(d) : JSON.stringify(v));
  return [
    `score ${f(r.score)} (precipitation ${f(r.score_P)})${r.checks_ok ? '' : '  CHECKS FAILED'}`,
    `P  corr ${f(r.P_corr)} log ${f(r.P_logcorr)} land-log ${f(r.P_land_logcorr)} land ${f(r.P_land_corr)} skill ${f(r.P_skill)} season ${f(r.Pseason)} zonal ${f(r.Pzonal)} height ${f(r.Pheight)} dist ${f(r.Pdist)} length ${f(r.Plength)} ${f(r.P_length)} km`,
    `   by height (model, obs) ${f(r.P_by_height)} · dry land ${f(r.dry_land)} · max ${f(r.P_max, 1)}`,
    `T  land skill ${f(r.T_land_skill)} (rmse ${f(r.T_land_rmse, 1)}) all ${f(r.T_skill)} season ${f(r.Tseason)} · wind u ${f(r.u_corr)} v ${f(r.v_corr)}`,
    `Köppen group ${f(r.koppen_group)} class ${f(r.koppen_class)} · worst ${f(r.koppen_confusion)}`,
    `global T ${f(r.T_global, 1)}/${f(r.T_global_obs, 1)} · P ${f(r.P_global, 2)}/${f(r.P_global_obs, 2)} · E ${f(r.E_global, 2)} · water imbalance ${f(r.water_imbalance, 4)}`,
  ].join('\n');
}
