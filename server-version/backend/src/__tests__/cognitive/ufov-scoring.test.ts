import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreUfovV1 } from '../../modules/cognitive/scoring/ufov.v1'
import { ufovStimulus } from '../../modules/cognitive/tasks/ufov/generator'
import type { UfovConfig } from '../../modules/cognitive/schemas/ufov.config'
import type { UfovTrial } from '../../modules/cognitive/schemas/ufov.trial'

const config: UfovConfig = {
  totalTrials: 4,
  stimulusMs: 400,
  fixationMs: 500,
  validRtFloorMs: 200,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, centralResponse: number | null, peripheralResponse: number | null, rtMs: number | null = 500): { trialIndex: number; payload: UfovTrial } => {
  const stimulus = ufovStimulus('seed-1', index)
  return {
    trialIndex: index,
    payload: {
      centralTarget: stimulus.centralTarget,
      peripheralPosition: stimulus.peripheralPosition,
      centralResponse,
      peripheralResponse,
      rtMs,
      interrupted: false,
    },
  }
}

describe('ufov scorer', () => {
  it('rebuilds stimuli from seed and derives all accuracy metrics server-side', () => {
    const stimuli = [0, 1, 2, 3].map((index) => ufovStimulus('seed-1', index))
    const result = scoreUfovV1({
      config,
      randomSeed: 'seed-1',
      trials: stimuli.map((stimulus, index) => trial(index, stimulus.centralTarget === 'circle' ? 0 : 1, stimulus.peripheralPosition)),
    })
    expect(result.score).toBe(100)
    expect(result.metrics).toMatchObject({ dualCorrectRate: 1, centralAccuracy: 1, peripheralAccuracy: 1, dualCorrectCount: 4 })
    expect(result.qualityFlags.interpretable).toBe(true)
  })

  it('flags low accuracy when all wrong', () => {
    const stimuli = [0, 1, 2, 3].map((index) => ufovStimulus('seed-1', index))
    const result = scoreUfovV1({
      config,
      randomSeed: 'seed-1',
      trials: stimuli.map((stimulus, index) => trial(index, stimulus.centralTarget === 'circle' ? 1 : 0, (stimulus.peripheralPosition + 1) % 8)),
    })
    expect(result.metrics.dualCorrectRate).toBe(0)
    expect(result.qualityFlags.lowAccuracy).toBe(true)
    expect(result.qualityFlags.insufficientValidRt).toBe(true)
    expect(result.score).toBe(0)
  })

  it('rejects stimulus mismatches, wrong counts and gaps', () => {
    expect(() => scoreUfovV1({
      config,
      randomSeed: 'seed-1',
      trials: [
        { trialIndex: 0, payload: { centralTarget: 'triangle', peripheralPosition: 0, centralResponse: 0, peripheralResponse: 0, rtMs: 500, interrupted: false } },
        trial(1, 0, 0), trial(2, 0, 0), trial(3, 0, 0),
      ],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreUfovV1({ config, randomSeed: 'seed-1', trials: [trial(0, 0, 0)] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreUfovV1({ config, trials: [trial(0, 0, 0), trial(1, 0, 0), trial(2, 0, 0), trial(3, 0, 0)] })).toThrow(CognitiveScoringInputError)
  })
})
