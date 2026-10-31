import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreSeqlearnV1 } from '../../modules/cognitive/scoring/seqlearn.v1'
import type { SeqlearnConfig } from '../../modules/cognitive/schemas/seqlearn.config'
import type { SeqlearnTrial } from '../../modules/cognitive/schemas/seqlearn.trial'

const config: SeqlearnConfig = {
  totalTrials: 30,
  trialsPerBlock: 10,
  patternSequence: [3, 1, 4, 2, 1, 3, 2, 4, 1, 2],
  randomBlockIndices: [2],
  fixationMs: 300,
  stimulusMs: 1200,
  timeoutMs: 1500,
  validRtFloorMs: 150,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, position: number, response: number | null, rtMs: number | null): { trialIndex: number; payload: SeqlearnTrial } => ({
  trialIndex: index,
  payload: { position, response, rtMs, interrupted: false },
})

describe('seqlearn scorer', () => {
  it('derives condition medians and the pattern advantage from the frozen schedule', () => {
    const trials: Array<{ trialIndex: number; payload: SeqlearnTrial }> = []
    for (let index = 0; index < 30; index += 1) {
      const block = Math.floor(index / 10) + 1
      const position = block === 2 ? ((index % 4) + 1) : config.patternSequence[index % 10]
      const rt = block === 2 ? 700 : index < 10 ? 500 : 300
      trials.push(trial(index, position, position, rt))
    }
    const result = scoreSeqlearnV1({ config, trials })
    expect(result.metrics.accuracy).toBe(1)
    expect(result.metrics.medianRtRandomMs).toBe(700)
    expect(result.metrics.medianRtLatePatternMs).toBe(400)
    expect(result.metrics.srtPatternAdvantageMs).toBe(300)
    expect(result.metrics.randomBlockAccuracy).toBe(1)
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(result.score).toBe(100)
  })

  it('flags insufficient random-block RT and low accuracy', () => {
    const trials: Array<{ trialIndex: number; payload: SeqlearnTrial }> = []
    for (let index = 0; index < 30; index += 1) {
      const block = Math.floor(index / 10) + 1
      const position = block === 2 ? ((index % 4) + 1) : config.patternSequence[index % 10]
      const response = block === 2 ? ((position % 4) + 1) : position
      trials.push(trial(index, position, response, 400))
    }
    const result = scoreSeqlearnV1({ config, trials })
    expect(result.metrics.accuracy).toBe(20 / 30)
    expect(result.metrics.medianRtRandomMs).toBeNull()
    expect(result.metrics.srtPatternAdvantageMs).toBeNull()
    expect(result.qualityFlags.insufficientRandomRt).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
  })

  it('rejects pattern-block position violations and wrong counts', () => {
    const trials: Array<{ trialIndex: number; payload: SeqlearnTrial }> = []
    for (let index = 0; index < 30; index += 1) {
      const block = Math.floor(index / 10) + 1
      const position = block === 2 ? ((index % 4) + 1) : config.patternSequence[index % 10]
      trials.push(trial(index, position, position, 400))
    }
    trials[0].payload.position = 2
    expect(() => scoreSeqlearnV1({ config, trials })).toThrow(CognitiveScoringInputError)
    expect(() => scoreSeqlearnV1({ config, trials: trials.slice(0, 5) })).toThrow(CognitiveScoringInputError)
  })
})
