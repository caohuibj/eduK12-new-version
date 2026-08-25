/**
 * Shared deterministic PRNG primitives. Keeping these independent from the
 * task stimulus bank avoids a module cycle when task-specific sequences are
 * exposed through randomization.ts.
 */
function xmur3(value: string): () => number {
  let hash = 1779033703 ^ value.length
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353)
    hash = (hash << 13) | (hash >>> 19)
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507)
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
    hash ^= hash >>> 16
    return hash >>> 0
  }
}

function mulberry32(seed: number): () => number {
  let value = seed | 0
  return () => {
    value = (value + 0x6d2b79f5) | 0
    let t = Math.imul(value ^ (value >>> 15), 1 | value)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const seededRandom = (seed: string, lane: string): (() => number) =>
  mulberry32(xmur3(`${seed}:${lane}`)())

export const shuffleInPlace = <T,>(items: T[], random: () => number): T[] => {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const tmp = items[index]
    items[index] = items[swapIndex]
    items[swapIndex] = tmp
  }
  return items
}
