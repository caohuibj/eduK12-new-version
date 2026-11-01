import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { IcarmatrixV2Config } from '../schemas/icarmatrix-v2.config'
import { IcarmatrixV2Trial } from '../schemas/icarmatrix-v2.trial'
import { ICARMATRIX_V2_BANK, generateIcarmatrixV2Plan, icarmatrixV2IsCorrect } from '../tasks/icarmatrix/generator-v2'
import { median } from './signal-detection'

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0（engine 2.0.0）钉死；调整需升 scoringVersion。 */
const EXCESSIVE_TIMEOUT_RATE = 0.4
const RAPID_GUESS_RATE = 0.3

/** Icarmatrix v2：matRiks 规则题库轨；正确性由服务端按题库与同源呈现排序推导。 */
export const scoreIcarmatrixV2 = (input: {
  config: IcarmatrixV2Config
  trials: ScoringTrial<IcarmatrixV2Trial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `icarmatrix v2 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `icarmatrix v2 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })

  const randomSeed = input.randomSeed ?? ''
  const plan = generateIcarmatrixV2Plan(randomSeed, config.totalTrials, config.matrixType)
  const ruleAccumulator = new Map<string, { correct: number; total: number }>()
  let correctCount = 0
  let timeoutCount = 0
  let rapidGuessCount = 0
  const rts: number[] = []

  sorted.forEach((trial, index) => {
    const bankItem = ICARMATRIX_V2_BANK[plan[index]]
    if (!bankItem || trial.payload.bankItemId !== bankItem.itemId) {
      throw new CognitiveScoringInputError(
        `icarmatrix v2 trial ${index} bankItemId ${trial.payload.bankItemId} does not match the seed-derived plan (${bankItem?.itemId ?? 'unknown'})`
      )
    }
    const correct = icarmatrixV2IsCorrect(randomSeed, index, bankItem.responses.length, trial.payload.responseIndex)
    if (correct) correctCount += 1
    if (trial.payload.responseIndex === null) timeoutCount += 1
    else {
      if (trial.payload.rtMs !== null) {
        rts.push(trial.payload.rtMs)
        if (trial.payload.rtMs < config.validRtFloorMs) rapidGuessCount += 1
      }
    }
    for (const ruleTag of bankItem.ruleTags) {
      const bucket = ruleAccumulator.get(ruleTag) ?? { correct: 0, total: 0 }
      bucket.total += 1
      if (correct) bucket.correct += 1
      ruleAccumulator.set(ruleTag, bucket)
    }
  })

  const total = sorted.length
  const accuracy = total > 0 ? round(correctCount / total) : null
  const medianRtMs = median(rts)
  const accuracyByRuleTag = Object.fromEntries(
    [...ruleAccumulator.entries()].map(([rule, bucket]) => [
      rule,
      round(bucket.correct / bucket.total),
    ]),
  )

  return {
    score: accuracy === null ? 0 : Math.round(accuracy * 100),
    metrics: {
      accuracy,
      medianRtMs,
      correctCount,
      accuracyByRuleTag,
    },
    qualityFlags: {
      interpretable: total > 0,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
      excessiveTimeouts: total > 0 && timeoutCount / total >= EXCESSIVE_TIMEOUT_RATE,
      rapidGuessing: total > 0 && rapidGuessCount / total >= RAPID_GUESS_RATE,
    },
  }
}
