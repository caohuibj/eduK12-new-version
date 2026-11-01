import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreLetternumseriesV1 } from '../../modules/cognitive/scoring/letternumseries.v1'
import type { LetternumseriesConfig } from '../../modules/cognitive/schemas/letternumseries.config'
import type { LetternumseriesTrial } from '../../modules/cognitive/schemas/letternumseries.trial'

const config: LetternumseriesConfig = {
  totalTrials: 2,
  lettersPerTrial: 3,
  digitsPerTrial: 2,
  stimulusMs: 700,
  isiMs: 300,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, sequence: string[], lettersResponse: string[], digitsResponse: string[], responseDurationMs = 1000, interrupted = false): { trialIndex: number; payload: LetternumseriesTrial } => ({
  trialIndex: index,
  payload: { sequence, lettersResponse, digitsResponse, responseDurationMs, interrupted },
})

describe('letternumseries scorer', () => {
  it('derives alphabetical and ascending correctness server-side', () => {
    const result = scoreLetternumseriesV1({
      config,
      trials: [
        trial(0, ['T', '4', 'M', '9', 'H'], ['H', 'M', 'T'], ['4', '9']),
        trial(1, ['B', '2', 'K', '7', 'D'], ['B', 'D', 'K'], ['7', '2']),
      ],
    })
    // trial0: letters 3/3, digits 2/2; trial1: letters 3/3, digits 0/2（7/2 顺序颠倒）
    expect(result.metrics.lettersAccuracy).toBe(1)
    expect(result.metrics.digitsAccuracy).toBe(0.5)
    expect(result.metrics.overallAccuracy).toBe(0.8)
    expect(result.metrics.emptyRecallCount).toBe(0)
    expect(result.metrics.medianResponseMs).toBe(1000)
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(result.score).toBe(80)
  })

  it('flags empty-recall excess', () => {
    const result = scoreLetternumseriesV1({
      config,
      trials: [
        trial(0, ['T', '4', 'M', '9', 'H'], [], []),
        trial(1, ['B', '2', 'K', '7', 'D'], [], []),
      ],
    })
    // 漏=错：空回忆按 0 计，质量标记负责降低可解释性
    expect(result.metrics.overallAccuracy).toBe(0)
    expect(result.metrics.emptyRecallCount).toBe(2)
    expect(result.qualityFlags.emptyRecallExcess).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
    expect(result.score).toBe(0)
  })

  it('rejects composition mismatches, gaps and wrong counts', () => {
    expect(() => scoreLetternumseriesV1({ config, trials: [trial(0, ['T', 'M', 'H'], ['H', 'M', 'T'], ['1', '2'])] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreLetternumseriesV1({
      config,
      trials: [
        trial(0, ['T', '4', 'M', '9', 'H'], ['H', 'M', 'T'], ['4', '9']),
        trial(2, ['B', '2', 'K', '7', 'D'], ['B', 'D', 'K'], ['2', '7']),
      ],
    })).toThrow(CognitiveScoringInputError)
  })
})
