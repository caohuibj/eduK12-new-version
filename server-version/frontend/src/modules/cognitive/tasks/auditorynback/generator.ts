/** Auditorynback shared generator (backend copy; identical mirror on the frontend).
 * 纯音 n-back 序列：位置 i（i ≥ n）按 targetRatio 决定是否与前第 n 个音相同；
 * 非目标音强制不等于目标音（toneCount > 1 时）。练习序列另用固定结构：
 * 位置 n 与 n+3 强制为目标，其余强制非目标，保证练习可教学。
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

const pickTone = (random: () => number, toneCount: number): number =>
  Math.floor(random() * toneCount) % Math.max(1, toneCount)

export const generateAuditoryNbackSequence = (
  seed: string,
  totalTrials: number,
  nLevel: number,
  targetRatio: number,
  toneCount: number,
): number[] => {
  const random = mulberry32(xmur3(`${seed}:auditorynback`)())
  const sequence: number[] = []
  let consecutiveTargets = 0
  for (let index = 0; index < totalTrials; index += 1) {
    if (index < nLevel || toneCount < 2) {
      sequence.push(pickTone(random, toneCount))
      consecutiveTargets = 0
      continue
    }
    const nBackTone = sequence[index - nLevel]
    // 最多连续 2 个目标：连击使 n-back 退化为同音流。
    const isTarget = consecutiveTargets < 2 && random() < targetRatio
    if (isTarget) {
      sequence.push(nBackTone)
      consecutiveTargets += 1
      continue
    }
    consecutiveTargets = 0
    let tone = pickTone(random, toneCount)
    if (tone === nBackTone) tone = (tone + 1 + Math.floor(random() * (toneCount - 1))) % toneCount
    sequence.push(tone)
  }
  return sequence
}

export const PRACTICE_SEQUENCE_LENGTH = 8

export const generateAuditoryNbackPracticeSequence = (
  seed: string,
  nLevel: number,
  toneCount: number,
): number[] => {
  const total = PRACTICE_SEQUENCE_LENGTH
  const random = mulberry32(xmur3(`${seed}:auditorynback-practice`)())
  const forcedTargets = new Set([nLevel, Math.min(nLevel + 3, total - 1)])
  const sequence: number[] = []
  for (let index = 0; index < total; index += 1) {
    if (index < nLevel || toneCount < 2) {
      sequence.push(pickTone(random, toneCount))
      continue
    }
    const nBackTone = sequence[index - nLevel]
    if (forcedTargets.has(index)) {
      sequence.push(nBackTone)
      continue
    }
    let tone = pickTone(random, toneCount)
    if (tone === nBackTone) tone = (tone + 1 + Math.floor(random() * (toneCount - 1))) % toneCount
    sequence.push(tone)
  }
  return sequence
}
