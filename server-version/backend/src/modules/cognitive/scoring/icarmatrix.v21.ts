import { CognitiveScoringInputError, type CognitiveScoreResult, type ScoringTrial } from '../cognitive.types'
import { icarmatrixV21ConfigSchema, type IcarmatrixV21Config } from '../schemas/icarmatrix-v21.config'
import { icarmatrixV2TrialSchema, type IcarmatrixV2Trial } from '../schemas/icarmatrix-v2.trial'
import { ICARMATRIX_V2_BANK, generateIcarmatrixV2Plan, icarmatrixV2IsCorrect } from '../tasks/icarmatrix/generator-v21'
import { median } from './signal-detection'

/** Engine 2.1.0/scoring 1.1.0: exact observations, reviewed form and valid response RT. */
export const scoreIcarmatrixV21 = (input: {
  config: IcarmatrixV21Config
  trials: ScoringTrial<IcarmatrixV2Trial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  const parsed = icarmatrixV21ConfigSchema.safeParse(input.config)
  if (!parsed.success || !input.randomSeed) throw new CognitiveScoringInputError('reviewed icarmatrix requires valid frozen config and randomSeed')
  const config = parsed.data
  const seed = input.randomSeed
  const trials = [...input.trials].sort((a, b) => a.trialIndex - b.trialIndex)
  if (trials.length !== config.totalTrials) throw new CognitiveScoringInputError('reviewed icarmatrix requires exactly the planned trials')
  const plan = generateIcarmatrixV2Plan(seed, config.totalTrials, config.matrixType)
  const rules = new Map<string, { correct: number; total: number }>()
  const validRts: number[] = []
  let correctCount = 0, timeoutCount = 0, rapidCount = 0, answeredCount = 0
  trials.forEach((trial, index) => {
    const parsedTrial = icarmatrixV2TrialSchema.safeParse(trial.payload)
    if (!parsedTrial.success) throw new CognitiveScoringInputError(`invalid icarmatrix observation at ${index}`)
    const payload = parsedTrial.data
    const item = ICARMATRIX_V2_BANK[plan[index]]
    if (trial.trialIndex !== index || payload.trialIndex !== index || payload.bankItemId !== item.itemId) {
      throw new CognitiveScoringInputError(`icarmatrix observation does not match frozen plan at ${index}`)
    }
    if (payload.rtMs !== null && payload.rtMs > config.timeoutMs) throw new CognitiveScoringInputError('response occurred after the frozen deadline')
    const correct = icarmatrixV2IsCorrect(seed, index, item.responses.length, payload.responseIndex)
    if (correct) correctCount += 1
    if (payload.responseIndex === null) timeoutCount += 1
    else {
      answeredCount += 1
      if (payload.rtMs! < config.validRtFloorMs) rapidCount += 1
      else if (!payload.interrupted) validRts.push(payload.rtMs!)
    }
    for (const tag of item.ruleTags) {
      const bucket = rules.get(tag) ?? { correct: 0, total: 0 }
      bucket.total += 1
      if (correct) bucket.correct += 1
      rules.set(tag, bucket)
    }
  })
  const accuracy = correctCount / config.totalTrials
  return {
    score: Math.round(accuracy * 100), // Existing transport field; no IQ/ability index in reports.
    showProductIndex: false,
    metrics: {
      accuracy, correctCount, timeoutCount, answeredCount,
      medianRtMs: median(validRts), validRtCount: validRts.length,
      accuracyByRuleTag: Object.fromEntries([...rules].map(([tag, value]) => [tag, value.correct / value.total])),
    },
    qualityFlags: {
      interpretable: answeredCount > 0,
      interrupted: trials.some(trial => trial.payload.interrupted),
      excessiveTimeouts: timeoutCount / config.totalTrials >= 0.4,
      rapidGuessing: rapidCount / config.totalTrials >= 0.3,
    },
  }
}
