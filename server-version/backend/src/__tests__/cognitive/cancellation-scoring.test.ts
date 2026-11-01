import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreCancellationV1 } from '../../modules/cognitive/scoring/cancellation.v1'
import { CANCELLATION_TARGET_COUNT, cancellationScan } from '../../modules/cognitive/tasks/cancellation/generator'
import type { CancellationConfig } from '../../modules/cognitive/schemas/cancellation.config'
import type { CancellationTrial } from '../../modules/cognitive/schemas/cancellation.trial'

const config: CancellationConfig = {
  totalTrials: 2,
  durationMs: 45000,
  stimulusSetVersion: 'cancellation-zh-v1.0.0',
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, selectedCells: number[], responseDurationMs = 45000, interrupted = false): { trialIndex: number; payload: CancellationTrial } => ({
  trialIndex: index,
  payload: { scanIndex: index, selectedCells, responseDurationMs, interrupted },
})

describe('cancellation scorer', () => {
  it('rebuilds the grid and derives hits/misses/false alarms server-side', () => {
    const scan0 = cancellationScan('seed-1', 0)
    const scan1 = cancellationScan('seed-1', 1)
    const hits0 = scan0.targetCells.slice(0, 12)
    const falseAlarms = [0, 1, 2, 3, 4, 5].filter((cell) => !scan0.targetCells.includes(cell))
    // 每轮按各自 scan 重建：trial1 选 scan1 的全部目标 → 全命中
    const result = scoreCancellationV1({
      config,
      randomSeed: 'seed-1',
      trials: [trial(0, [...hits0, ...falseAlarms]), trial(1, scan1.targetCells)],
    })
    expect(result.metrics.hitCount).toBe(12 + CANCELLATION_TARGET_COUNT)
    expect(result.metrics.falseAlarmCount).toBe(falseAlarms.length)
    expect(result.metrics.hitRate).toBe(0.875)
    expect(result.metrics.falseAlarmRate).toBeCloseTo(falseAlarms.length / (12 + falseAlarms.length + CANCELLATION_TARGET_COUNT), 4)
    expect(result.qualityFlags.interpretable).toBe(true)
  })

  it('flags excessive false alarms', () => {
    const scan0 = cancellationScan('seed-1', 0)
    const scan1 = cancellationScan('seed-1', 1)
    const distractors0 = scan0.grid
      .map((symbol, index) => (symbol === scan0.target ? -1 : index))
      .filter((index) => index >= 0)
      .slice(0, 10)
    const distractors1 = scan1.grid
      .map((symbol, index) => (symbol === scan1.target ? -1 : index))
      .filter((index) => index >= 0)
      .slice(0, 10)
    const result = scoreCancellationV1({
      config,
      randomSeed: 'seed-1',
      trials: [trial(0, distractors0), trial(1, distractors1)],
    })
    expect(result.metrics.falseAlarmCount).toBe(20)
    expect(result.metrics.hitCount).toBe(0)
    expect(result.qualityFlags.excessiveFalseAlarms).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
  })

  it('rejects order mismatches, out-of-grid cells, duplicates, wrong counts and versions', () => {
    expect(() => scoreCancellationV1({
      config,
      randomSeed: 'seed-1',
      trials: [
        { trialIndex: 0, payload: { scanIndex: 1, selectedCells: [], responseDurationMs: 1, interrupted: false } },
        trial(1, []),
      ],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreCancellationV1({
      config,
      randomSeed: 'seed-1',
      trials: [trial(0, [999999]), trial(1, [])],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreCancellationV1({
      config,
      randomSeed: 'seed-1',
      trials: [trial(0, [5, 5]), trial(1, [])],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreCancellationV1({ config, randomSeed: 'seed-1', trials: [trial(0, [])] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreCancellationV1({
      config: { ...config, stimulusSetVersion: 'cancellation-zh-v9.9.9' },
      randomSeed: 'seed-1',
      trials: [trial(0, []), trial(1, [])],
    })).toThrow(CognitiveScoringInputError)
  })
})
