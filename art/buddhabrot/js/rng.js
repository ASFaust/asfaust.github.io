// mulberry32: small seeded PRNG, so the same seed gives the same image
export function rng(seed) {
  var a = seed >>> 0;
  return function() {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One seed per stage (salt) and chunk (i) of a run, so the chunks draw independent streams.
export function mixSeed(seed, salt, i) {
  var h = Math.imul(seed ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(salt + 1, 0xC2B2AE35) ^ Math.imul(i + 1, 0x27D4EB2F);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12;
  return h >>> 0;
}
