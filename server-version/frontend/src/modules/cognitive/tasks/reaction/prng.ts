/**
 * 确定性 PRNG（Milestone E §20 / §29）。
 *
 * 用途：前端用 randomSeed 为每个正式试次生成确定性 foreperiod（刺激前间隔），
 * 保证同一 Session 刷新/重放时刺激计划可复现。
 *
 * 注意：后端【不】逐 trial 重建 seed plan 做防篡改（§20），只校验 foreperiodMs 范围。
 * 因此本 PRNG 仅用于前端刺激呈现的确定性，不参与任何评分/安全逻辑。
 */

/** 字符串 → 32-bit 种子（xmur3）。 */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

/** mulberry32：快速确定性 32-bit PRNG。 */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 确定性 foreperiod：相同 (seed, trialIndex, min, max) 永远返回同一整数。
 * 每个试次独立派生，互不影响。
 */
export function deterministicForeperiod(
  seed: string,
  trialIndex: number,
  min: number,
  max: number
): number {
  const seedFn = xmur3(`${seed}:${trialIndex}`)
  const rand = mulberry32(seedFn())
  return min + Math.floor(rand() * (max - min + 1))
}
