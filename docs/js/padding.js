/* Seeded random padding — pad a selected accession set up to a minimum size
 * by drawing additional accessions from the proteome pool.
 *
 * Uses a deterministic PRNG (mulberry32) so a given seed reproduces the same
 * padded set, matching the Streamlit tool's reproducibility guarantee.
 */

/* mulberry32 — small, fast, deterministic 32-bit PRNG. Returns a function
 * producing floats in [0, 1). */
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Draw `n` accessions from `poolAccessions` (array) that are not already in
 * `exclude` (Set). Deterministic for a given seed. Returns an array; shorter
 * than `n` only if the pool is exhausted. */
export function randomPad(poolAccessions, exclude, n, seed) {
  if (n <= 0) return [];
  const candidates = poolAccessions.filter((a) => !exclude.has(a));
  const rng = mulberry32(seed);
  // Partial Fisher-Yates: only the first `n` positions need to be settled.
  const arr = candidates.slice();
  const take = Math.min(n, arr.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (arr.length - i));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr.slice(0, take);
}
