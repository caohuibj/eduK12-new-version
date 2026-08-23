import { describe, expect, it } from 'vitest'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { mergeProfileConfig } from '../../modules/cognitive/profile-freeze'
import { digitBackwardSequence, pairedAssociateSet, pictureSequenceItems } from '../../modules/cognitive/randomization'
import { digitbackwardConfigSchema } from '../../modules/cognitive/schemas/digitbackward.config'
import { picturesequenceConfigSchema } from '../../modules/cognitive/schemas/picturesequence.config'
import { pairedassociateConfigSchema } from '../../modules/cognitive/schemas/pairedassociate.config'
import { scoreDigitbackwardV1 } from '../../modules/cognitive/scoring/digitbackward.v1'
import { scorePicturesequenceV1 } from '../../modules/cognitive/scoring/picturesequence.v1'
import { scorePairedassociateV1 } from '../../modules/cognitive/scoring/pairedassociate.v1'
import golden from '../../../../cognitive-randomization-golden-v1.json'

const report = { reportVersion: '1.0.0' as const, referenceMode: 'none' as const }
const digitConfig = {
  startSpan: 2,
  maxSpan: 4,
  trialsPerLevel: 2 as const,
  digitDisplayMs: 800,
  digitIntervalMs: 200,
  readyDurationMs: 800,
  inactivityGuardMs: 30000,
  stimulusSetVersion: 'digits-v1.0.0',
  report,
}
const pictureConfig = {
  itemCount: 12 as const,
  learningRounds: 3 as const,
  delayedEnabled: false,
  delayedDelayMs: 0,
  studyMsPerItem: 900,
  inactivityGuardMs: 60000,
  stimulusSetVersion: 'daily-scenes-v1.0.0',
  report,
}
const pairedConfig = {
  pairCount: 12 as const,
  learningRounds: 3 as const,
  delayedEnabled: false,
  delayedDelayMs: 0,
  studyDurationMs: 12000,
  inactivityGuardMs: 90000,
  stimulusSetVersion: 'nonverbal-pairs-v1.0.0',
  report,
}

describe('Round 2 PR4 task contracts', () => {
  it('keeps strict schemas and exact three-profile patches', () => {
    expect(digitbackwardConfigSchema.safeParse(digitConfig).success).toBe(true)
    expect(digitbackwardConfigSchema.safeParse({ ...digitConfig, extra: true }).success).toBe(false)
    expect(picturesequenceConfigSchema.safeParse({ ...pictureConfig, itemCount: 10 }).success).toBe(false)
    expect(pairedassociateConfigSchema.safeParse({ ...pairedConfig, pairCount: 10 }).success).toBe(false)

    const digit = getCognitiveRegistryEntry('digitbackward', '1.0.0', '1.0.0')!
    expect(mergeProfileConfig(digit, digitConfig, 'experience')).toMatchObject({ startSpan: 2, maxSpan: 4 })
    expect(mergeProfileConfig(digit, digitConfig, 'standard')).toMatchObject({ startSpan: 2, maxSpan: 7 })
    expect(mergeProfileConfig(digit, digitConfig, 'research')).toMatchObject({ startSpan: 2, maxSpan: 8 })
    const picture = getCognitiveRegistryEntry('picturesequence', '1.0.0', '1.0.0')!
    expect(mergeProfileConfig(picture, pictureConfig, 'experience')).toMatchObject({ itemCount: 6, learningRounds: 2, delayedEnabled: false })
    expect(mergeProfileConfig(picture, pictureConfig, 'research')).toMatchObject({ itemCount: 15, learningRounds: 3, delayedEnabled: true })
    const paired = getCognitiveRegistryEntry('pairedassociate', '1.0.0', '1.0.0')!
    expect(mergeProfileConfig(paired, pairedConfig, 'experience')).toMatchObject({ pairCount: 6, learningRounds: 2, delayedEnabled: false })
    expect(mergeProfileConfig(paired, pairedConfig, 'research')).toMatchObject({ pairCount: 18, learningRounds: 4, delayedEnabled: true })
  })

  it('scores exact reverse responses and rejects a forged digit sequence', () => {
    const seed = 'digit-seed'
    const trials = Array.from({ length: 6 }, (_, trialIndex) => {
      const spanLength = 2 + Math.floor(trialIndex / 2)
      const sequence = digitBackwardSequence(seed, trialIndex, spanLength)
      return {
        trialIndex,
        payload: {
          spanLength,
          trialWithinLevel: ((trialIndex % 2) + 1) as 1 | 2,
          sequence,
          response: [...sequence].reverse(),
          responseDurationMs: 800,
          interrupted: false,
        },
      }
    })
    expect(scoreDigitbackwardV1({ config: digitConfig, trials, randomSeed: seed }).metrics)
      .toMatchObject({ maxSpan: 4, totalCorrectTrials: 6, sequenceDistance: 0 })
    const forged = structuredClone(trials)
    forged[0].payload.sequence.reverse()
    expect(() => scoreDigitbackwardV1({ config: digitConfig, trials: forged, randomSeed: seed })).toThrow(/frozen seed sequence/)
  })

  it('computes picture pair/position learning and preserves missing delayed retention as null', () => {
    const seed = 'picture-seed'
    const itemIds = pictureSequenceItems(seed, pictureConfig.itemCount)
    const trials = Array.from({ length: pictureConfig.learningRounds }, (_, trialIndex) => ({
      trialIndex,
      payload: {
        phase: 'learning' as const,
        roundIndex: trialIndex + 1,
        itemIds,
        responseOrder: trialIndex === 0 ? [...itemIds].reverse() : itemIds,
        responseDurationMs: 2000,
        interrupted: false,
      },
    }))
    const result = scorePicturesequenceV1({ config: pictureConfig, trials, randomSeed: seed })
    expect(result.metrics).toMatchObject({ adjacentPairScore: 1, positionScore: 1, delayedRetention: null })
    expect(Number(result.metrics.learningGain)).toBeGreaterThan(0)

    const researchConfig = { ...pictureConfig, itemCount: 15 as const, delayedEnabled: true }
    const researchItems = pictureSequenceItems(seed, researchConfig.itemCount)
    const researchTrials = Array.from({ length: researchConfig.learningRounds }, (_, trialIndex) => ({
      trialIndex,
      payload: { phase: 'learning' as const, roundIndex: trialIndex + 1, itemIds: researchItems, responseOrder: researchItems, responseDurationMs: 1, interrupted: false },
    }))
    const missing = scorePicturesequenceV1({ config: researchConfig, trials: researchTrials, randomSeed: seed })
    expect(missing.metrics.delayedRetention).toBeNull()
    expect(missing.qualityFlags.delayedStageIncomplete).toBe(true)
    const interruptedDelayed = scorePicturesequenceV1({
      config: researchConfig,
      trials: [...researchTrials, { trialIndex: 3, payload: { phase: 'delayed', roundIndex: 1, itemIds: researchItems, responseOrder: [], responseDurationMs: 1, interrupted: true } }],
      randomSeed: seed,
    })
    expect(interruptedDelayed.metrics.delayedRetention).toBeNull()
    expect(interruptedDelayed.qualityFlags.delayedStageIncomplete).toBe(true)
    expect(interruptedDelayed.qualityFlags.interpretable).toBe(true)
  })

  it('computes paired learning by server-held positions and keeps delayed accuracy null', () => {
    const seed = 'paired-seed'
    const set = pairedAssociateSet(seed, pairedConfig.pairCount)
    const trials = Array.from({ length: pairedConfig.learningRounds }, (_, trialIndex) => ({
      trialIndex,
      payload: {
        phase: 'learning' as const,
        roundIndex: trialIndex + 1,
        responses: set.map((item, index) => ({
          itemId: item.itemId,
          selectedPosition: trialIndex === 0 && index % 2 === 0 ? (item.targetPosition + 1) % pairedConfig.pairCount : item.targetPosition,
        })),
        responseDurationMs: 3000,
        interrupted: false,
      },
    }))
    const result = scorePairedassociateV1({ config: pairedConfig, trials, randomSeed: seed })
    expect(result.metrics).toMatchObject({ correctByTrial: [6, 12, 12], immediateAccuracy: 1, delayedAccuracy: null, trialsToCriterion: 2 })
    expect(Number(result.metrics.learningSlope)).toBeGreaterThan(0)

    const forged = structuredClone(trials)
    forged[0].payload.responses.reverse()
    expect(() => scorePairedassociateV1({ config: pairedConfig, trials: forged, randomSeed: seed })).toThrow(/frozen seed item order/)

    const researchConfig = { ...pairedConfig, pairCount: 18 as const, learningRounds: 4 as const, delayedEnabled: true }
    const researchSet = pairedAssociateSet(seed, researchConfig.pairCount)
    const learning = Array.from({ length: 4 }, (_, trialIndex) => ({
      trialIndex,
      payload: { phase: 'learning' as const, roundIndex: trialIndex + 1, responses: researchSet.map((item) => ({ itemId: item.itemId, selectedPosition: item.targetPosition })), responseDurationMs: 1, interrupted: false },
    }))
    const interrupted = scorePairedassociateV1({
      config: researchConfig,
      trials: [...learning, { trialIndex: 4, payload: { phase: 'delayed', roundIndex: 1, responses: researchSet.map((item) => ({ itemId: item.itemId, selectedPosition: null })), responseDurationMs: 1, interrupted: true } }],
      randomSeed: seed,
    })
    expect(interrupted.metrics.delayedAccuracy).toBeNull()
    expect(interrupted.qualityFlags.delayedStageIncomplete).toBe(true)
    expect(interrupted.qualityFlags.interpretable).toBe(true)
  })

  it('is deterministic and changes across seeds', () => {
    expect(Array.from({ length: 4 }, (_, index) => digitBackwardSequence(golden.seed, index, 2 + Math.floor(index / 2)))).toEqual(golden.digitbackward)
    expect(pictureSequenceItems(golden.seed, 12)).toEqual(golden.picturesequence)
    expect(pairedAssociateSet(golden.seed, 12)).toEqual(golden.pairedassociate)
    expect(digitBackwardSequence('a', 0, 5)).toEqual(digitBackwardSequence('a', 0, 5))
    expect(digitBackwardSequence('a', 0, 5)).not.toEqual(digitBackwardSequence('b', 0, 5))
    expect(pictureSequenceItems('a', 12)).toEqual(pictureSequenceItems('a', 12))
    expect(pictureSequenceItems('a', 12)).not.toEqual(pictureSequenceItems('b', 12))
    expect(pairedAssociateSet('a', 12)).toEqual(pairedAssociateSet('a', 12))
    expect(pairedAssociateSet('a', 12)).not.toEqual(pairedAssociateSet('b', 12))
  })

  it('flags obvious unchanged or constant learning responses', () => {
    const pictureSeed = 'picture-quality'
    const itemIds = pictureSequenceItems(pictureSeed, pictureConfig.itemCount)
    const repeated = [...itemIds].reverse()
    const picture = scorePicturesequenceV1({
      config: pictureConfig,
      randomSeed: pictureSeed,
      trials: Array.from({ length: 3 }, (_, trialIndex) => ({ trialIndex, payload: { phase: 'learning' as const, roundIndex: trialIndex + 1, itemIds, responseOrder: repeated, responseDurationMs: 1, interrupted: false } })),
    })
    expect(picture.qualityFlags).toMatchObject({ interpretable: false, unchangedIncorrectOrder: true })

    const pairedSeed = 'paired-quality'
    const set = pairedAssociateSet(pairedSeed, pairedConfig.pairCount)
    const paired = scorePairedassociateV1({
      config: pairedConfig,
      randomSeed: pairedSeed,
      trials: Array.from({ length: 3 }, (_, trialIndex) => ({ trialIndex, payload: { phase: 'learning' as const, roundIndex: trialIndex + 1, responses: set.map((item) => ({ itemId: item.itemId, selectedPosition: 0 })), responseDurationMs: 1, interrupted: false } })),
    })
    expect(paired.qualityFlags).toMatchObject({ interpretable: false, constantPositionResponse: true })
  })
})
