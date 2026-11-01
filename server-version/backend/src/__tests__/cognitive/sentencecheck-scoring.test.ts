import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreSentencecheckV1 } from '../../modules/cognitive/scoring/sentencecheck.v1'
import type { SentencecheckConfig } from '../../modules/cognitive/schemas/sentencecheck.config'
import type { SentencecheckTrial } from '../../modules/cognitive/schemas/sentencecheck.trial'

const config: SentencecheckConfig = {
  totalTrials: 4,
  trueRatio: 0.5,
  negationRatio: 0.5,
  fixationMs: 500,
  timeoutMs: 8000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, overrides: Partial<SentencecheckTrial>): { trialIndex: number; payload: SentencecheckTrial } => ({
  trialIndex: index,
  payload: {
    shape: 'circle',
    color: 'red',
    questionKind: 'shape',
    negated: false,
    askedValue: '圆形',
    response: true,
    rtMs: 500,
    interrupted: false,
    ...overrides,
  },
})

describe('sentencecheck scorer', () => {
  it('derives statement truth server-side and computes the frozen metrics', () => {
    const result = scoreSentencecheckV1({
      config,
      trials: [
        trial(0, { askedValue: '圆形', response: true, rtMs: 400 }),
        trial(1, { negated: true, askedValue: '方形', response: true, rtMs: 600 }),
        trial(2, { questionKind: 'color', askedValue: '蓝色', response: false, rtMs: 550 }),
        trial(3, { negated: true, questionKind: 'color', askedValue: '红色', response: false, rtMs: 350 }),
      ],
    })
    // t0: 圆形=圆形 true; t1: 方形≠圆形 true; t2: 蓝色≠红色 true; t3: 红色≠红色 false
    expect(result.score).toBe(100)
    expect(result.metrics).toMatchObject({
      accuracy: 1,
      errorCount: 0,
      timeoutCount: 0,
      validRtCount: 4,
    })
    expect(result.metrics.negationPenaltyMs).toBe(0)
    expect(result.qualityFlags.interpretable).toBe(true)
  })

  it('scores wrong responses and flags low accuracy', () => {
    const result = scoreSentencecheckV1({
      config,
      trials: [
        trial(0, { askedValue: '圆形', response: false, rtMs: 400 }),
        trial(1, { negated: true, askedValue: '方形', response: false, rtMs: 600 }),
        trial(2, { questionKind: 'color', askedValue: '蓝色', response: true, rtMs: 550 }),
        trial(3, { negated: true, questionKind: 'color', askedValue: '红色', response: true, rtMs: 350 }),
      ],
    })
    // truths: [T,T,F,F] balanced; responses all opposite → accuracy 0
    expect(result.metrics.accuracy).toBe(0)
    expect(result.qualityFlags.lowAccuracy).toBe(true)
    expect(result.qualityFlags.insufficientValidRt).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
    expect(result.score).toBe(0)
  })

  it('rejects wrong trial counts, gaps and unbalanced truth splits', () => {
    expect(() => scoreSentencecheckV1({ config, trials: [trial(0, {})] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreSentencecheckV1({
      config,
      trials: [
        trial(0, {}),
        trial(2, {}),
        trial(3, {}),
        trial(4, {}),
      ],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreSentencecheckV1({
      config,
      trials: [
        trial(0, {}),
        trial(1, { negated: true, askedValue: '方形' }),
        trial(2, { questionKind: 'color', askedValue: '红色' }),
        trial(3, { negated: true, questionKind: 'color', askedValue: '蓝色' }),
      ],
    })).toThrow(CognitiveScoringInputError)
  })
})
