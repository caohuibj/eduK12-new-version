import { describe, it, expect } from 'vitest'
import { scoreReactionV1 } from '../../modules/cognitive/scoring/reaction.v1'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import type { ReactionConfig } from '../../modules/cognitive/schemas/reaction.config'
import type { ReactionTrial } from '../../modules/cognitive/schemas/reaction.trial'

const config: ReactionConfig = {
  totalTrials: 5,
  foreperiodMinMs: 700,
  foreperiodMaxMs: 1500,
  timeoutMs: 2000,
  readyDurationMs: 1000,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

// 构造 n 个试次，rtMsPerTrial 提供每个试次的 rtMs（null = miss）；其余字段默认
function buildTrials(n: number, rtMsPerTrial: (i: number) => number | null, opts?: Partial<ReactionTrial>): { trialIndex: number; payload: ReactionTrial }[] {
  return Array.from({ length: n }, (_, i) => ({
    trialIndex: i,
    payload: {
      foreperiodMs: 700 + ((i * 137) % 800),
      rtMs: rtMsPerTrial(i),
      prematureCount: 0,
      interrupted: false,
      inputMode: 'pointer',
      ...opts,
    },
  }))
}

describe('reaction scorer — validation', () => {
  it('throws when trial count mismatches config', () => {
    const trials = buildTrials(4, () => 300)
    expect(() => scoreReactionV1({ config, trials })).toThrow(CognitiveScoringInputError)
  })

  it('ignores a trailing extra trial beyond totalTrials', () => {
    const trials = [...buildTrials(5, () => 300), {
      trialIndex: 5,
      payload: {
        foreperiodMs: 800,
        rtMs: 280,
        prematureCount: 0,
        interrupted: false,
        inputMode: 'pointer' as const,
      },
    }]
    const res = scoreReactionV1({ config, trials })
    expect(res.metrics.validTrialCount).toBe(5)
  })

  it('throws on non-contiguous trialIndex', () => {
    const trials = buildTrials(5, () => 300).map((t, i) => (i === 4 ? { ...t, trialIndex: 9 } : t))
    expect(() => scoreReactionV1({ config, trials })).toThrow(CognitiveScoringInputError)
  })

  it('throws when foreperiodMs out of range', () => {
    const trials = buildTrials(5, () => 300, { foreperiodMs: 5000 })
    expect(() => scoreReactionV1({ config, trials })).toThrow(CognitiveScoringInputError)
  })
})

describe('reaction scorer — metrics', () => {
  it('computes median/mean/sd/ICV and derives valid/miss', () => {
    // 5 试次，全部有效（>= 100ms 且 <= timeoutMs）
    const trials = buildTrials(5, (i) => [250, 300, 350, 400, 450][i])
    const res = scoreReactionV1({ config, trials })
    expect(res.metrics.validTrialCount).toBe(5)
    expect(res.metrics.missCount).toBe(0)
    expect(res.metrics.medianRtMs).toBe(350)
    expect(res.metrics.meanRtMs).toBe(350)
    expect(res.metrics.fastestRtMs).toBe(250)
    expect(res.metrics.missRate).toBe(0)
  })

  it('counts null rtMs as miss', () => {
    // 3 有效 + 2 超时(null)
    const trials = buildTrials(5, (i) => (i < 3 ? 300 : null))
    const res = scoreReactionV1({ config, trials })
    expect(res.metrics.validTrialCount).toBe(3)
    expect(res.metrics.missCount).toBe(2)
    expect(res.metrics.medianRtMs).toBe(300)
  })

  it('treats rtMs below the scoring floor as miss', () => {
    const trials = buildTrials(5, (i) => (i === 0 ? 50 : 300)) // 50 < 100 floor
    const res = scoreReactionV1({ config, trials })
    expect(res.metrics.validTrialCount).toBe(4)
    expect(res.metrics.missCount).toBe(1)
  })

  it('treats rtMs > timeoutMs as miss', () => {
    const trials = buildTrials(5, (i) => (i === 0 ? 5000 : 300))
    const res = scoreReactionV1({ config, trials })
    expect(res.metrics.validTrialCount).toBe(4)
  })

  it('returns null metrics when no valid trials', () => {
    const trials = buildTrials(5, () => null)
    const res = scoreReactionV1({ config, trials })
    expect(res.metrics.medianRtMs).toBeNull()
    expect(res.metrics.meanRtMs).toBeNull()
    expect(res.metrics.rtICV).toBeNull()
    expect(res.score).toBe(30) // 最低指数
  })

  it('accumulates prematureCount', () => {
    const trials = buildTrials(5, () => 300, { prematureCount: 2 })
    const res = scoreReactionV1({ config, trials })
    expect(res.metrics.prematureCount).toBe(10)
  })
})

describe('reaction scorer — quality flags', () => {
  it('marks interpretable when valid >= 60%', () => {
    const trials = buildTrials(5, (i) => (i < 4 ? 300 : null)) // 4/5 = 80%
    const res = scoreReactionV1({ config, trials })
    expect(res.qualityFlags.interpretable).toBe(true)
    expect(res.qualityFlags.insufficientValidTrials).toBe(false)
  })

  it('marks insufficientValidTrials when valid < 60%', () => {
    const trials = buildTrials(5, (i) => (i < 2 ? 300 : null)) // 2/5 = 40%
    const res = scoreReactionV1({ config, trials })
    expect(res.qualityFlags.interpretable).toBe(false)
    expect(res.qualityFlags.insufficientValidTrials).toBe(true)
  })

  it('flags interrupted when any trial interrupted', () => {
    const trials = buildTrials(5, () => 300, { interrupted: true })
    const res = scoreReactionV1({ config, trials })
    expect(res.qualityFlags.interrupted).toBe(true)
  })
})

describe('reaction scorer — Product Index (§35 piecewise)', () => {
  function indexFor(medianRt: number | null): number {
    const trials = medianRt == null
      ? buildTrials(5, () => null)
      : buildTrials(5, () => medianRt)
    return scoreReactionV1({ config, trials }).score
  }

  it('maps fast RT to high index', () => {
    // 最快有效 RT（100ms）→ 96（band 0..250 内线性：0→100, 250→90）
    expect(indexFor(100)).toBe(96)
    expect(indexFor(250)).toBe(90)
  })

  it('maps mid RT into band 250..350', () => {
    expect(indexFor(300)).toBeGreaterThanOrEqual(70)
    expect(indexFor(300)).toBeLessThanOrEqual(90)
  })

  it('maps slow RT (500) to band floor ~50', () => {
    expect(indexFor(500)).toBe(50)
  })

  it('clamps very slow RT to 30', () => {
    expect(indexFor(2000)).toBe(30)
    expect(indexFor(9999)).toBe(30)
  })
})

describe('reaction scorer 1.1.0 quality flags', () => {
  it('keeps v1 metrics and adds excessivePremature / extremeRtPattern', async () => {
    const { scoreReactionV1_1 } = await import('../../modules/cognitive/scoring/reaction.v1_1')
    const trials = buildTrials(5, () => 300)
    trials[0].payload.prematureCount = 1
    const res = scoreReactionV1_1({ config, trials })
    expect(res.metrics.medianRtMs).toBe(300)
    expect(res.qualityFlags.excessivePremature).toBe(true)
    expect(res.qualityFlags.extremeRtPattern).toBe(false)
    expect(res.qualityFlags.interpretable).toBe(true)
  })

  it('flags extremeRtPattern when ICV exceeds 0.8', async () => {
    const { scoreReactionV1_1 } = await import('../../modules/cognitive/scoring/reaction.v1_1')
    const trials = buildTrials(5, (i) => [100, 100, 100, 100, 1800][i])
    const res = scoreReactionV1_1({ config, trials })
    expect(res.qualityFlags.extremeRtPattern).toBe(true)
    expect(scoreReactionV1({ config, trials }).qualityFlags.extremeRtPattern).toBeUndefined()
  })
})
