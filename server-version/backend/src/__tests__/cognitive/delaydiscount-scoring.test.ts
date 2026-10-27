import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreDelaydiscountV1 } from '../../modules/cognitive/scoring/delaydiscount.v1'
import type { DelaydiscountConfig } from '../../modules/cognitive/schemas/delaydiscount.config'
import type { DelaydiscountTrial } from '../../modules/cognitive/schemas/delaydiscount.trial'

const config: DelaydiscountConfig = {
  delayBands: [7, 30],
  delayedAmount: 100,
  bisectionSteps: 2,
  fixationMs: 500,
  timeoutMs: 15000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, payload: Omit<DelaydiscountTrial, 'interrupted' | 'rtMs'> & { rtMs?: number | null; interrupted?: boolean }): { trialIndex: number; payload: DelaydiscountTrial } => ({
  trialIndex: index,
  payload: { interrupted: false, rtMs: 500, ...payload } as DelaydiscountTrial,
})

/** 二分轨迹构造器：choice 为 null 表示超时（轨迹不更新）。 */
const band = (delayDays: number, choices: Array<'later' | 'now' | null>) => choices

const buildTrials = (bands: Array<{ delayDays: number; choices: Array<'later' | 'now' | null> }>): Array<{ trialIndex: number; payload: DelaydiscountTrial }> => {
  const trials: Array<{ trialIndex: number; payload: DelaydiscountTrial }> = []
  let index = 0
  for (const { delayDays, choices } of bands) {
    let low = 0
    let high = config.delayedAmount
    for (const choice of choices) {
      const immediateAmount = Math.round((low + high) / 2)
      trials.push(trial(index, { delayDays, delayedAmount: config.delayedAmount, immediateAmount, choice, rtMs: choice === null ? null : 500 }))
      if (choice === 'later') low = immediateAmount
      if (choice === 'now') high = immediateAmount
      index += 1
    }
  }
  return trials
}

describe('delaydiscount scorer', () => {
  it('recomputes indifference points from the bisection trajectory and derives AUC', () => {
    const result = scoreDelaydiscountV1({
      config,
      trials: buildTrials([
        { delayDays: 7, choices: band(7, ['later', 'later']) },
        { delayDays: 30, choices: band(30, ['now', 'later']) },
      ]),
    })
    expect(result.metrics.aucDelayDiscounting).toBe(0.4792)
    expect(result.metrics.meanIndifferenceRate).toBe(0.625)
    expect(result.metrics.laterChoiceRate).toBe(0.75)
    expect(result.metrics.validTrialCount).toBe(4)
    expect(result.metrics.timeoutCount).toBe(0)
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(result.score).toBe(48)
  })

  it('computes monotone patient responses into a full-area AUC', () => {
    const result = scoreDelaydiscountV1({
      config,
      trials: buildTrials([
        { delayDays: 7, choices: band(7, ['later', 'later']) },
        { delayDays: 30, choices: band(30, ['later', 'later']) },
      ]),
    })
    expect(result.metrics.aucDelayDiscounting).toBe(0.6708)
    expect(result.score).toBe(67)
  })

  it('withholds AUC when any band is incomplete due to timeout', () => {
    const result = scoreDelaydiscountV1({
      config,
      trials: buildTrials([
        { delayDays: 7, choices: band(7, ['later', null]) },
        { delayDays: 30, choices: band(30, ['later', 'later']) },
      ]),
    })
    expect(result.metrics.aucDelayDiscounting).toBeNull()
    expect(result.metrics.laterChoiceRate).toBe(1)
    expect(result.qualityFlags.incompleteDelayBand).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
    expect(result.score).toBe(0)
  })

  it('rejects trajectory violations, unknown bands and wrong counts', () => {
    const violating = buildTrials([
      { delayDays: 7, choices: band(7, ['later', 'later']) },
      { delayDays: 30, choices: band(30, ['later', 'later']) },
    ])
    violating[1].payload.immediateAmount = 88
    expect(() => scoreDelaydiscountV1({ config, trials: violating })).toThrow(CognitiveScoringInputError)
    expect(() => scoreDelaydiscountV1({
      config,
      trials: [trial(0, { delayDays: 45, delayedAmount: 100, immediateAmount: 50, choice: 'later', rtMs: 500 })],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreDelaydiscountV1({ config, trials: violating.slice(0, 2) })).toThrow(CognitiveScoringInputError)
  })
})
