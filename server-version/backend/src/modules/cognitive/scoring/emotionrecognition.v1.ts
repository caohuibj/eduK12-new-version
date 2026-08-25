import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { emotionrecognitionSequence } from '../randomization'
import { EmotionrecognitionConfig } from '../schemas/emotionrecognition.config'
import { EMOTIONS, EmotionCategory, EmotionrecognitionTrial } from '../schemas/emotionrecognition.trial'
import { median } from './signal-detection'

const round = (value: number): number => Number(value.toFixed(4))

const identitySetCountFor = (totalTrials: number): number => totalTrials === 24 ? 4 : totalTrials === 60 ? 10 : 20

export const scoreEmotionrecognitionV1 = (input: {
  config: EmotionrecognitionConfig
  trials: ScoringTrial<EmotionrecognitionTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  if (!input.randomSeed) throw new CognitiveScoringInputError('emotionrecognition v1 requires randomSeed')
  const expected = emotionrecognitionSequence(input.randomSeed, input.config.totalTrials, identitySetCountFor(input.config.totalTrials))
  if (input.trials.length !== expected.length) {
    throw new CognitiveScoringInputError(`emotionrecognition v1 expects exactly ${expected.length} trials, got ${input.trials.length}`)
  }

  const categoryTotals = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, 0])) as Record<EmotionCategory, number>
  const categoryValid = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, 0])) as Record<EmotionCategory, number>
  const categoryCorrect = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, 0])) as Record<EmotionCategory, number>
  const confusionMatrix = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, Object.fromEntries(EMOTIONS.map((response) => [response, 0]))])) as Record<EmotionCategory, Record<EmotionCategory, number>>
  const validRts: number[] = []
  const responseValues: EmotionCategory[] = []
  let omissionCount = 0
  let interrupted = false

  input.trials.forEach((trial, index) => {
    if (trial.trialIndex !== index) throw new CognitiveScoringInputError('emotionrecognition v1 requires contiguous trialIndex values')
    const spec = expected[index]
    const payload = trial.payload
    if (payload.stimulusId !== spec.stimulusId || payload.stimulusVersion !== spec.stimulusVersion) {
      throw new CognitiveScoringInputError(`emotionrecognition v1 trial ${index} metadata does not match the frozen stimulus`)
    }
    categoryTotals[spec.emotion] += 1
    interrupted ||= payload.interrupted
    const valid = payload.responseEmotion !== null
      && payload.rtMs !== null
      && payload.rtMs >= input.config.validRtFloorMs
      && payload.rtMs <= input.config.trialTimeoutMs
    if (!valid) {
      omissionCount += 1
      return
    }
    const response = payload.responseEmotion as EmotionCategory
    categoryValid[spec.emotion] += 1
    confusionMatrix[spec.emotion][response] += 1
    responseValues.push(response)
    validRts.push(payload.rtMs as number)
    if (response === spec.emotion) categoryCorrect[spec.emotion] += 1
  })

  const accuracyByEmotion = Object.fromEntries(EMOTIONS.map((emotion) => [
    emotion,
    round(categoryTotals[emotion] === 0 ? 0 : categoryCorrect[emotion] / categoryTotals[emotion]),
  ]))
  // Omission is a non-correct response for accuracy metrics; validResponseCount
  // and omissionRate preserve the separate completeness signal.
  const categoryBalancedValues = EMOTIONS.map((emotion) => categoryTotals[emotion] === 0 ? 0 : categoryCorrect[emotion] / categoryTotals[emotion])
  const balancedAccuracy = categoryBalancedValues.reduce((sum, value) => sum + value, 0) / EMOTIONS.length
  const accuracy = Object.values(categoryCorrect).reduce((sum, value) => sum + value, 0) / input.config.totalTrials
  const insufficientPerCategory = EMOTIONS.some((emotion) => categoryValid[emotion] < Math.ceil(categoryTotals[emotion] * 0.7))
  const lowAccuracy = balancedAccuracy < 0.5
  const excessiveOmissions = omissionCount / input.config.totalTrials >= 0.3
  const constantResponse = responseValues.length >= 8 && new Set(responseValues).size === 1

  return {
    score: Math.round(balancedAccuracy * 100),
    metrics: {
      accuracy: round(accuracy),
      balancedAccuracy: round(balancedAccuracy),
      accuracyByEmotion,
      confusionMatrix,
      medianRtMs: median(validRts),
      omissionRate: round(omissionCount / input.config.totalTrials),
      validResponseCount: responseValues.length,
    },
    qualityFlags: {
      interpretable: !insufficientPerCategory && !lowAccuracy && !excessiveOmissions && !constantResponse && !interrupted,
      insufficientPerCategory,
      lowAccuracy,
      excessiveOmissions,
      constantResponse,
      interrupted,
    },
  }
}
