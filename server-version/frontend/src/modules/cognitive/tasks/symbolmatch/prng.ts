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

/** 均匀随机符号序列；避免同一符号连续出现超过 2 次。 */
export const buildSymbolmatchSequence = (seed: string, totalTrials: number, symbols: string[]): string[] => {
  const random = mulberry32(xmur3(`${seed}:symbolmatch`)())
  const sequence: string[] = []
  let repeats = 0
  for (let index = 0; index < totalTrials; index += 1) {
    let symbol = symbols[Math.floor(random() * symbols.length)]
    if (repeats >= 2) {
      let guard = 0
      while (sequence.length > 0 && symbol === sequence[sequence.length - 1] && guard < 16) {
        symbol = symbols[Math.floor(random() * symbols.length)]
        guard += 1
      }
    }
    repeats = sequence.length > 0 && symbol === sequence[sequence.length - 1] ? repeats + 1 : 0
    sequence.push(symbol)
  }
  return sequence
}

export const SYMBOLMATCH_PRACTICE_SYMBOLS = ['●', '★']
