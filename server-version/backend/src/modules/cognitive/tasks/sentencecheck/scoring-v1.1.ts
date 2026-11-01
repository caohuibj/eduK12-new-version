import { CognitiveScoringInputError, type ScoringTrial } from '../../cognitive.types'
import { sentencecheckConfigSchema, type SentencecheckConfig } from '../../schemas/sentencecheck.config'
import type { SentencecheckTrial } from '../../schemas/sentencecheck.trial'
import { scoreSentencecheckV1 } from '../../scoring/sentencecheck.v1'
import { buildSentencecheckTrialsV11 } from './generator-v1.1'

export const sentencecheckConfigV11Schema = sentencecheckConfigSchema.refine((config) => {
  const trueCount = Math.round(config.totalTrials * config.trueRatio)
  const negatedCount = Math.round(config.totalTrials * config.negationRatio)
  return config.totalTrials >= 4 && trueCount >= 2 && trueCount <= config.totalTrials - 2 &&
    negatedCount >= 2 && negatedCount <= config.totalTrials - 2
}, { message: 'sentencecheck 1.1.0 requires all four truth and polarity conditions', path: ['totalTrials'] })

/** Scoring 1.1.0 adds authoritative stimulus acceptance; all numeric rules stay at v1. */
export const scoreSentencecheckV11 = (input: {
  config: SentencecheckConfig
  trials: ScoringTrial<SentencecheckTrial>[]
  randomSeed?: string
}) => {
  // Retain every legacy completeness, contiguous-index and truth-count rejection.
  const scored = scoreSentencecheckV1(input)
  if (!sentencecheckConfigV11Schema.safeParse(input.config).success) {
    throw new CognitiveScoringInputError('sentencecheck 1.1.0 config cannot cover all four conditions')
  }
  if (!input.randomSeed) {
    throw new CognitiveScoringInputError('sentencecheck 1.1.0 requires randomSeed to regenerate stimuli')
  }
  const expected = buildSentencecheckTrialsV11(
    input.randomSeed, input.config.totalTrials, input.config.trueRatio, input.config.negationRatio,
  )
  for (const trial of input.trials) {
    if (trial.trialIndex < 0 || trial.trialIndex >= input.config.totalTrials) continue
    const stimulus = expected[trial.trialIndex]
    const payload = trial.payload
    if (payload.shape !== stimulus.shape || payload.color !== stimulus.color ||
        payload.questionKind !== stimulus.questionKind || payload.negated !== stimulus.negated ||
        payload.askedValue !== stimulus.askedValue) {
      throw new CognitiveScoringInputError(
        `sentencecheck 1.1.0 trial ${trial.trialIndex} stimulus does not match the frozen regeneration`,
      )
    }
  }
  return scored
}
