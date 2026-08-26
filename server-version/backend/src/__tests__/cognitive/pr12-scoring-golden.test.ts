import { describe, expect, it } from 'vitest'
import trailmakingGolden from '../../../../cognitive-scoring-golden-trailmaking-v1.json'
import reversallearningGolden from '../../../../cognitive-scoring-golden-reversallearning-v1.json'
import bartGolden from '../../../../cognitive-scoring-golden-bart-v1.json'
import { trailmakingConfigSchema } from '../../modules/cognitive/schemas/trailmaking.config'
import { trailmakingTrialSchema } from '../../modules/cognitive/schemas/trailmaking.trial'
import { reversallearningConfigSchema } from '../../modules/cognitive/schemas/reversallearning.config'
import { reversallearningTrialSchema } from '../../modules/cognitive/schemas/reversallearning.trial'
import { bartConfigSchema } from '../../modules/cognitive/schemas/bart.config'
import { bartTrialSchema } from '../../modules/cognitive/schemas/bart.trial'
import { scoreTrailmakingV1 } from '../../modules/cognitive/scoring/trailmaking.v1'
import { scoreReversallearningV1 } from '../../modules/cognitive/scoring/reversallearning.v1'
import { scoreBartV1 } from '../../modules/cognitive/scoring/bart.v1'
import { bartSequence, reversallearningSequence, trailmakingSequence } from '../../modules/cognitive/randomization'

const resultContract = (result: { score: number; metrics: Record<string, unknown>; qualityFlags: Record<string, unknown> }) => ({
  score: result.score,
  metrics: result.metrics,
  qualityFlags: result.qualityFlags,
})

describe('PR12 independent scoring golden fixtures', () => {
  it('freezes Trail Making score, metrics, and quality flags', () => {
    const config = trailmakingConfigSchema.parse(trailmakingGolden.config)
    const sequence = trailmakingSequence(trailmakingGolden.seed, config.form, config.partAItemCount, config.partBItemCount)
    const result = scoreTrailmakingV1({
      config,
      randomSeed: trailmakingGolden.seed,
      trials: sequence.map((item, trialIndex) => ({
        trialIndex,
        payload: trailmakingTrialSchema.parse({
          attempts: [{ targetId: item.targetId, atMs: 100, pointerType: 'mouse' }],
          deviceClass: 'desktop',
          interrupted: false,
        }),
      })),
    })

    expect(resultContract(result)).toEqual(trailmakingGolden.expected)
  })

  it('freezes Reversal Learning score, metrics, and quality flags', () => {
    const config = reversallearningConfigSchema.parse(reversallearningGolden.config)
    const sequence = reversallearningSequence(
      reversallearningGolden.seed,
      config.totalTrials,
      config.acquisitionTrials,
      config.reversalTrials,
      config.rewardProbability,
    )
    const result = scoreReversallearningV1({
      config,
      randomSeed: reversallearningGolden.seed,
      trials: sequence.map((item, trialIndex) => ({
        trialIndex,
        payload: reversallearningTrialSchema.parse({ choice: item.correctResponse, rtMs: 400, interrupted: false }),
      })),
    })

    expect(resultContract(result)).toEqual(reversallearningGolden.expected)
  })

  it('freezes BART score, metrics, and quality flags without a product index', () => {
    const config = bartConfigSchema.parse(bartGolden.config)
    const sequence = bartSequence(bartGolden.seed, config.balloonCount, config.maxPumps)
    const result = scoreBartV1({
      config,
      randomSeed: bartGolden.seed,
      trials: sequence.map((item, trialIndex) => {
        const cashedOut = item.explosionThreshold > 1
        return {
          trialIndex,
          payload: bartTrialSchema.parse({
            pumpCount: cashedOut ? item.explosionThreshold - 1 : item.explosionThreshold,
            completed: true,
            cashedOut,
            interrupted: false,
          }),
        }
      }),
    })

    expect(resultContract(result)).toEqual(bartGolden.expected)
  })
})
