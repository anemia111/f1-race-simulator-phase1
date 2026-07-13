// Deterministic pseudo-random helpers. Everything in the simulation that
// needs randomness must derive it from the race seed through these functions
// so the same seed always replays the same race.

/**
 * FNV-1a hash of a string to an unsigned 32-bit integer, finished with the
 * murmur3 avalanche mix. Plain FNV-1a is strongly correlated for keys that
 * differ only in the final characters (e.g. `...lap:12` vs `...lap:13`),
 * which made per-lap chance rolls cluster; the finalizer decorrelates them.
 */
export function hashStringToUint(value: string): number {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash ^= hash >>> 16

  return hash >>> 0
}

/** Deterministic 0..1 value for a composite key, e.g. `${seed}:${driverId}:${lap}`. */
export function hashChance(key: string): number {
  return hashStringToUint(key) / 4294967295
}

/**
 * mulberry32 generator seeded from a string. Used for one-off deterministic
 * sequences such as the flag timeline. Do not share one generator across
 * unrelated features; derive a fresh one per feature key instead.
 */
export function createSeededRandom(seedKey: string): () => number {
  let state = hashStringToUint(seedKey)

  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
