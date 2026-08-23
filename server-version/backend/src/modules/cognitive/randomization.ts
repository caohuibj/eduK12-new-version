export const RANDOMIZATION_ALGORITHM_VERSION = 'seq-v1.0.0'

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
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const tmp = items[i]
    items[i] = items[j]
    items[j] = tmp
  }
  return items
}

export const gonogoSequence = (seed: string, totalTrials: number, nogoRatio: number): Array<'go' | 'nogo'> => {
  const nogo = Math.round(totalTrials * nogoRatio)
  const sequence: Array<'go' | 'nogo'> = Array.from({ length: totalTrials }, (_, index) => (index < nogo ? 'nogo' : 'go'))
  return shuffleInPlace(sequence, seededRandom(seed, 'gonogo'))
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'H', 'K', 'N', 'P', 'S', 'U', 'X']

export const cptSequence = (seed: string, totalTrials: number, targetRatio: number, blockCount: number) => {
  const targetCount = Math.max(1, Math.round(totalTrials * targetRatio))
  const flags = Array.from({ length: totalTrials }, (_, index) => index < targetCount)
  shuffleInPlace(flags, seededRandom(seed, 'cpt-targets'))
  const letterRng = seededRandom(seed, 'cpt-letters')
  const perBlock = totalTrials / blockCount
  return flags.map((isTarget, index) => ({
    blockIndex: Math.floor(index / perBlock),
    isTarget,
    stimulus: isTarget ? 'X' : LETTERS[Math.floor(letterRng() * (LETTERS.length - 1))],
  }))
}
