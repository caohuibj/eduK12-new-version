import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { normalizeFluencyResponse, scoreSemanticfluencyV1 } from '../../modules/cognitive/scoring/semanticfluency.v1'
import type { SemanticfluencyConfig } from '../../modules/cognitive/schemas/semanticfluency.config'
import type { SemanticfluencyTrial } from '../../modules/cognitive/schemas/semanticfluency.trial'

const config: SemanticfluencyConfig = {
  totalTrials: 2,
  durationMs: 45000,
  stimulusSetVersion: 'semanticfluency-zh-v1.0.0',
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, category: 'animals' | 'fruits', responses: string[], responseDurationMs = 45000, interrupted = false): { trialIndex: number; payload: SemanticfluencyTrial } => ({
  trialIndex: index,
  payload: { category, responses, responseDurationMs, interrupted },
})

describe('semanticfluency scorer', () => {
  it('normalizes, dedupes and matches against the frozen bank', () => {
    const result = scoreSemanticfluencyV1({
      config,
      trials: [
        trial(0, 'animals', ['猫', ' 狗 ', '猫', '飞行水壶']),
        trial(1, 'fruits', ['苹果', '香蕉']),
      ],
    })
    expect(normalizeFluencyResponse(' 狗 ')).toBe('狗')
    expect(result.metrics.uniqueValidCount).toBe(4)
    expect(result.metrics.uniqueValidPerTrial).toBe(2)
    expect(result.metrics.intrusionRate).toBe(0.1667)
    expect(result.metrics.duplicateRate).toBe(0.1667)
    expect(result.qualityFlags.interpretable).toBe(true)
  })

  it('flags insufficient responses and empty trials', () => {
    const result = scoreSemanticfluencyV1({
      config,
      trials: [trial(0, 'animals', []), trial(1, 'fruits', ['苹果'])],
    })
    expect(result.metrics.uniqueValidCount).toBe(1)
    expect(result.metrics.emptyTrialCount).toBe(1)
    expect(result.qualityFlags.insufficientResponses).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
  })

  it('rejects wrong counts, unknown categories and wrong stimulus set versions', () => {
    expect(() => scoreSemanticfluencyV1({ config, trials: [trial(0, 'animals', ['猫'])] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreSemanticfluencyV1({
      config,
      trials: [trial(0, 'plants' as 'animals', ['猫']), trial(1, 'fruits', ['苹果'])],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreSemanticfluencyV1({
      config: { ...config, stimulusSetVersion: 'semanticfluency-zh-v9.9.9' },
      trials: [trial(0, 'animals', ['猫']), trial(1, 'fruits', ['苹果'])],
    })).toThrow(CognitiveScoringInputError)
  })
})
