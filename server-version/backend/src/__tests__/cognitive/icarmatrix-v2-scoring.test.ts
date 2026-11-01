import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { icarmatrixV2TrialSchema } from '../../modules/cognitive/schemas/icarmatrix-v2.trial'
import { scoreIcarmatrixV2 } from '../../modules/cognitive/scoring/icarmatrix.v2'
import { ICARMATRIX_V2_BANK, generateIcarmatrixV2Plan, icarmatrixV2OptionOrder } from '../../modules/cognitive/tasks/icarmatrix/generator-v2'

const config = {
  totalTrials: 2,
  matrixType: '3x3' as const,
  stimulusSetVersion: 'matgen-bank-v1.0.0' as const,
  fixationMs: 400,
  timeoutMs: 30000,
  validRtFloorMs: 500,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('icarmatrix v2 frozen-bank integrity', () => {
  it('never repeats a scored item within one session and refuses an undersized bank', () => {
    for (const kind of ['2x2', '3x3'] as const) {
      const available = ICARMATRIX_V2_BANK.filter((item) => item.matrixType === kind).length
      const plan = generateIcarmatrixV2Plan('seed', available, kind)
      expect(new Set(plan).size).toBe(available)
      expect(() => generateIcarmatrixV2Plan('seed', available + 1, kind)).toThrow(/distinct/)
    }
  })

  it('rejects response indexes outside the six displayed choices', () => {
    expect(icarmatrixV2TrialSchema.safeParse({
      trialIndex: 0, bankItemId: 'x', responseIndex: 6, rtMs: 900, interrupted: false,
    }).success).toBe(false)
  })

  it('only scores seed-matched bank identities and the presented answer order', () => {
    const plan = generateIcarmatrixV2Plan('seed-1', 2, '3x3')
    const trials = plan.map((itemIndex, trialIndex) => {
      const item = ICARMATRIX_V2_BANK[itemIndex]
      const correctDisplay = icarmatrixV2OptionOrder('seed-1', trialIndex, item.responses.length).indexOf(0)
      return { trialIndex, payload: {
        trialIndex, bankItemId: item.itemId, responseIndex: correctDisplay, rtMs: 1600, interrupted: false,
      } }
    })
    const scored = scoreIcarmatrixV2({ config, randomSeed: 'seed-1', trials })
    expect(scored.metrics.accuracy).toBe(1)
    expect(() => scoreIcarmatrixV2({
      config, randomSeed: 'seed-1',
      trials: [{ ...trials[0], payload: { ...trials[0].payload, bankItemId: 'wrong' } }, trials[1]],
    })).toThrow(CognitiveScoringInputError)
  })
})
