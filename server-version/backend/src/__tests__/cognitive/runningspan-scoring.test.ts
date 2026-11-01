import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreRunningspanV1 } from '../../modules/cognitive/scoring/runningspan.v1'
import type { RunningspanConfig } from '../../modules/cognitive/schemas/runningspan.config'
import type { RunningspanTrial } from '../../modules/cognitive/schemas/runningspan.trial'

const config: RunningspanConfig = {
  totalTrials: 2,
  listLengthMin: 4,
  listLengthMax: 5,
  recallLength: 3,
  stimulusMs: 500,
  isiMs: 250,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, sequence: string[], response: string[], responseDurationMs = 1000, interrupted = false): { trialIndex: number; payload: RunningspanTrial } => ({
  trialIndex: index,
  payload: { sequence, response, responseDurationMs, interrupted },
})

describe('runningspan scorer', () => {
  it('derives serial correctness against the last recallLength items', () => {
    const result = scoreRunningspanV1({
      config,
      trials: [
        trial(0, ['B', 'C', 'D', 'F'], ['C', 'D', 'F']),
        trial(1, ['H', 'J', 'K', 'L', 'M'], ['K', 'J', 'M']),
      ],
    })
    // trial0: 3/3 correct; trial1: slot0 K vs K ✓, slot1 J vs L ✗(J outside window → intrusion), slot2 M ✓
    expect(result.metrics.runningSpanAccuracy).toBe(0.8333)
    expect(result.metrics.totalCorrectPositions).toBe(5)
    expect(result.metrics.intrusionRate).toBe(0.1667)
    expect(result.metrics.medianResponseMs).toBe(1000)
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(result.score).toBe(83)
  })

  it('counts intrusions for letters outside the recall window', () => {
    const result = scoreRunningspanV1({
      config,
      trials: [
        trial(0, ['B', 'C', 'D', 'F'], ['B', 'D', 'F']),
        trial(1, ['H', 'J', 'K', 'L', 'M'], ['H', 'L', 'M']),
      ],
    })
    // trial0: slot0 B is outside window (C,D,F) → intrusion; trial1: slot0 H outside window (K,L,M) → intrusion
    expect(result.metrics.totalCorrectPositions).toBe(4)
    expect(result.metrics.intrusionRate).toBe(0.3333)
  })

  it('flags excessive intrusions and empty recall', () => {
    const intruded = scoreRunningspanV1({
      config,
      trials: [
        trial(0, ['B', 'C', 'D', 'F'], ['B', 'B', 'B']),
        trial(1, ['H', 'J', 'K', 'L', 'M'], ['H', 'H', 'H']),
      ],
    })
    expect(intruded.qualityFlags.excessiveIntrusions).toBe(true)
    expect(intruded.qualityFlags.interpretable).toBe(false)
    const empty = scoreRunningspanV1({
      config,
      trials: [trial(0, ['B', 'C', 'D', 'F'], []), trial(1, ['H', 'J', 'K', 'L', 'M'], [])],
    })
    expect(empty.qualityFlags.emptyRecall).toBe(true)
    expect(empty.metrics.runningSpanAccuracy).toBeNull()
    expect(empty.score).toBe(0)
  })

  it('rejects out-of-range sequence lengths and oversized responses', () => {
    expect(() => scoreRunningspanV1({ config, trials: [trial(0, ['B', 'C'], []), trial(1, ['H', 'J', 'K', 'L', 'M'], [])] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreRunningspanV1({
      config,
      trials: [
        trial(0, ['B', 'C', 'D', 'F'], ['B', 'C', 'D', 'F']),
        trial(1, ['H', 'J', 'K', 'L', 'M'], []),
      ],
    })).toThrow(CognitiveScoringInputError)
  })
})
