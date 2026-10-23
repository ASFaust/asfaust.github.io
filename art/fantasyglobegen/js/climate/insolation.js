// Daily-mean sunlight at the top of the atmosphere, W/m², from latitude and the time of
// year. The year is measured by the planet's position on its orbit: the solar longitude
// λ, 0 at the northern spring equinox, π/2 at the northern summer solstice. For an orbit
// with eccentricity e, the distance and the speed along the orbit follow from Kepler.
//
//   sin δ = sin ε · sin λ                                (declination of the sun)
//   cos h₀ = −tan φ · tan δ, clamped to [−1, 1]          (hour angle of sunset)
//   Q = S₀/π · (a/r)² · (h₀ sin φ sin δ + cos φ cos δ sin h₀)
//
// (e.g. Hartmann, Global Physical Climatology, ch. 2; Berger 1978 for the orbit).

export const EARTH_ORBIT = { solarConstant: 1361, obliquity: 23.44 * Math.PI / 180, eccentricity: 0.0167, perihelion: 283 * Math.PI / 180 };

export function dailyInsolation(lat, lambda, orbit = EARTH_ORBIT) {
  const { solarConstant: S0, obliquity: eps, eccentricity: e, perihelion: varpi } = orbit;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const c = -Math.tan(lat) * Math.tan(dec);
  const h0 = c >= 1 ? 0 : c <= -1 ? Math.PI : Math.acos(c);
  // a/r from the true anomaly ν = λ − ϖ
  const dist = (1 + e * Math.cos(lambda - varpi)) / (1 - e * e);
  return S0 / Math.PI * dist * dist * (h0 * Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.sin(h0));
}

// Solar longitude at a fraction t ∈ [0, 1) of the year after the spring equinox, by
// Kepler's equation, so that an eccentric orbit spends longer far from the sun.
export function solarLongitude(t, orbit = EARTH_ORBIT) {
  const { eccentricity: e, perihelion: varpi } = orbit;
  if (e === 0) return 2 * Math.PI * t;
  // mean anomaly at the equinox, from its true anomaly −ϖ
  const nu0 = -varpi, E0 = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu0 / 2));
  const M = E0 - e * Math.sin(E0) + 2 * Math.PI * t;
  let E = M;
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const nu = 2 * Math.atan(Math.sqrt((1 + e) / (1 - e)) * Math.tan(E / 2));
  return ((nu + varpi) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
}
