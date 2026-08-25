import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { wordlistSequence } from '../randomization'
import { WordlistConfig } from '../schemas/wordlist.config'
import { WordlistTrial } from '../schemas/wordlist.trial'
import { median } from './signal-detection'

export const normalizeWordlistResponse = (value: string): string => value
  .normalize('NFKC')
  .toLocaleLowerCase('en-US')
  .replace(/[\p{P}\p{S}]+/gu, '')
  .replace(/\s+/gu, '')

const round = (value: number): number => Number(value.toFixed(4))

export const scoreWordlistV1 = (input: {
  config: WordlistConfig
  trials: ScoringTrial<WordlistTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  if (!input.randomSeed) throw new CognitiveScoringInputError('wordlist v1 requires randomSeed')
  const expected = wordlistSequence(
    input.randomSeed,
    input.config.listLength,
    input.config.learningRounds,
    input.config.delayedEnabled,
  )
  if (input.trials.length !== expected.length) {
    throw new CognitiveScoringInputError(`wordlist v1 expects exactly ${expected.length} stages, got ${input.trials.length}`)
  }

  let totalImmediateCorrect = 0
  let totalImmediateOmissions = 0
  let totalDelayedOmissions = 0
  let totalInputs = 0
  let totalIntrusions = 0
  let totalDuplicates = 0
  let firstImmediateAccuracy: number | null = null
  let lastImmediateAccuracy: number | null = null
  const recallByRound: Record<string, number> = {}
  const durations: number[] = []
  const allNormalizedResponses: string[] = []
  let emptyImmediateRecall = false
  let delayedRecallAccuracy: number | null = null
  let delayedStageIncomplete = false

  input.trials.forEach((trial, index) => {
    if (trial.trialIndex !== index) throw new CognitiveScoringInputError('wordlist v1 requires contiguous trialIndex values')
    const stage = expected[index]
    const payload = trial.payload
    if (payload.listId !== stage.listId || payload.stimulusSetVersion !== stage.stimulusSetVersion) {
      throw new CognitiveScoringInputError(`wordlist v1 stage ${index} does not match the frozen list`)
    }
    const expectedWords = new Set(stage.words.map(normalizeWordlistResponse))
    const normalizedResponses = payload.responses.map(normalizeWordlistResponse).filter(Boolean)
    const uniqueResponses = new Set(normalizedResponses)
    const correctUnique = new Set(normalizedResponses.filter((response) => expectedWords.has(response)))
    const intrusionCount = normalizedResponses.filter((response) => !expectedWords.has(response)).length
    const duplicateCount = Math.max(0, normalizedResponses.length - uniqueResponses.size)
    const omissions = Math.max(0, input.config.listLength - correctUnique.size)
    totalInputs += normalizedResponses.length
    totalIntrusions += intrusionCount
    totalDuplicates += duplicateCount
    if (stage.phase === 'immediate') totalImmediateOmissions += omissions
    else totalDelayedOmissions += omissions
    totalImmediateCorrect += stage.phase === 'immediate' ? correctUnique.size : 0
    allNormalizedResponses.push(...normalizedResponses)
    if (stage.phase === 'immediate' && normalizedResponses.length === 0) emptyImmediateRecall = true
    durations.push(payload.responseDurationMs)
    if (stage.phase === 'immediate') {
      const accuracy = correctUnique.size / input.config.listLength
      recallByRound[`round${(stage.roundIndex ?? 0) + 1}`] = round(accuracy)
      firstImmediateAccuracy ??= accuracy
      lastImmediateAccuracy = accuracy
    } else if (payload.interrupted || normalizedResponses.length === 0) {
      delayedStageIncomplete = true
      delayedRecallAccuracy = null
    } else {
      delayedRecallAccuracy = round(correctUnique.size / input.config.listLength)
    }
  })

  const immediateStageCount = input.config.learningRounds
  const includeDelayedOmissions = input.config.delayedEnabled && !delayedStageIncomplete
  const omissionDenominator = input.config.listLength * immediateStageCount + (includeDelayedOmissions ? input.config.listLength : 0)
  const omissionNumerator = totalImmediateOmissions + (includeDelayedOmissions ? totalDelayedOmissions : 0)
  const omissionRate = omissionDenominator === 0 ? 1 : omissionNumerator / omissionDenominator
  const repeatedResponsePattern = allNormalizedResponses.length >= 8 && new Set(allNormalizedResponses).size <= 1
  const excessiveIntrusions = totalInputs > 0 && totalIntrusions / totalInputs >= 0.5
  const excessiveOmissions = omissionRate >= 0.5
  const interrupted = input.trials.some((trial) => trial.payload.interrupted)
  const interpretable = !emptyImmediateRecall && !excessiveOmissions && !excessiveIntrusions && !repeatedResponsePattern && !delayedStageIncomplete && !interrupted
  const immediateAccuracy = lastImmediateAccuracy ?? 0
  const learningGain = firstImmediateAccuracy == null || lastImmediateAccuracy == null ? null : round(lastImmediateAccuracy - firstImmediateAccuracy)

  return {
    score: Math.round(immediateAccuracy * 100),
    metrics: {
      immediateAccuracy: round(immediateAccuracy),
      learningGain,
      delayedRecallAccuracy,
      totalImmediateCorrect,
      recallByRound,
      intrusionCount: totalIntrusions,
      duplicateResponseCount: totalDuplicates,
      omissionRate: round(omissionRate),
      medianResponseDurationMs: median(durations),
    },
    qualityFlags: {
      interpretable,
      emptyImmediateRecall,
      excessiveOmissions,
      excessiveIntrusions,
      repeatedResponsePattern,
      delayedStageIncomplete,
      interrupted,
    },
  }
}
