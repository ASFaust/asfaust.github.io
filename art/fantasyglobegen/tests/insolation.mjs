// Checks of the insolation against textbook values:  node tests/insolation.mjs
import { dailyInsolation, solarLongitude, EARTH_ORBIT } from '../js/climate/insolation.js';

let failed = 0;
const check = (ok, what) => { if (!ok) { failed++; console.log('FAIL', what); } };
const deg = Math.PI / 180;
const circ = { ...EARTH_ORBIT, eccentricity: 0 };

// equator at an equinox: S₀/π
check(Math.abs(dailyInsolation(0, 0, circ) - 1361 / Math.PI) < 1e-9, 'equator at equinox = S0/π');
// pole at the solstice: S₀ sin ε, about 541 W/m² on a circular orbit
check(Math.abs(dailyInsolation(90 * deg, 90 * deg, circ) - 1361 * Math.sin(23.44 * deg)) < 1e-6, 'pole at solstice = S0 sin ε');
// polar night
check(dailyInsolation(-80 * deg, 90 * deg, circ) === 0, 'polar night');
// global mean over a year is S₀/4 (within the eccentricity factor)
let sum = 0, w = 0;
for (let i = 0; i < 360; i++) for (let j = 0; j < 180; j++) {
  const lat = (j + 0.5 - 90) * deg, c = Math.cos(lat);
  sum += c * dailyInsolation(lat, solarLongitude(i / 360)); w += c;
}
const mean = sum / w;
check(Math.abs(mean / (1361 / 4) - 1 / Math.sqrt(1 - 0.0167 ** 2)) < 2e-3, `annual global mean ${mean.toFixed(1)} ≈ S0/4`);
// annual means: equator about 418, poles about 173 W/m² (Hartmann fig. 2.8)
const annual = lat => { let s = 0; for (let i = 0; i < 365; i++) s += dailyInsolation(lat, solarLongitude(i / 365)); return s / 365; };
check(Math.abs(annual(0) - 418) < 6, `equator annual ${annual(0).toFixed(1)}`);
check(Math.abs(annual(90 * deg) - 173) < 6, `pole annual ${annual(90 * deg).toFixed(1)}`);
// Kepler: the northern summer half (λ from 0 to π) lasts longer, about 186 days
let t = 0;
while (solarLongitude(t) < Math.PI) t += 1 / 3650;
check(Math.abs(t * 365.25 - 186) < 1.5, `northern summer half lasts ${(t * 365.25).toFixed(1)} days`);

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
