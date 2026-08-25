import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { trailmakingSequence } from '../randomization'
import { TrailmakingConfig } from '../schemas/trailmaking.config'
import { TrailmakingTrial } from '../schemas/trailmaking.trial'

const mean = (values: number[]): number | null => values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)

export const scoreTrailmakingV1 = (input: {
  config: TrailmakingConfig
  trials: ScoringTrial<TrailmakingTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  if (!input.randomSeed) throw new CognitiveScoringInputError('trailmaking v1 requires randomSeed')
  const expected = trailmakingSequence(input.randomSeed, input.config.form, input.config.partAItemCount, input.config.partBItemCount)
  const trials = [...input.trials].sort((left, right) => left.trialIndex - right.trialIndex)
  if (trials.length !== expected.length) {
    throw new CognitiveScoringInputError(`trailmaking v1 expects exactly ${expected.length} trials, got ${trials.length}`)
  }

  const knownTargetIds = new Set(expected.map((item) => item.targetId))
  const partStepTimes: Record<'A' | 'B', number[]> = { A: [], B: [] }
  const pointerTypes = new Set<string>()
  const deviceClasses = new Set<string>()
  let completedStepCount = 0
  let errorCount = 0
  let attemptCount = 0
  let omissionCount = 0
  let completionTimeMs: number | null = null
  let partACompletionTimeMs: number | null = null
  let partBCompletionTimeMs: number | null = null

  trials.forEach((trial, index) => {
    if (trial.trialIndex !== index) throw new CognitiveScoringInputError('trailmaking v1 requires contiguous trialIndex values')
    const spec = expected[index]
    const attempts = trial.payload.attempts
    deviceClasses.add(trial.payload.deviceClass)
    attempts.forEach((attempt) => {
      attemptCount += 1
      pointerTypes.add(attempt.pointerType)
      if (!knownTargetIds.has(attempt.targetId)) {
        throw new CognitiveScoringInputError(`trailmaking v1 trial ${index} contains an unknown target`)
      }
    })
    if (attempts.length === 0) {
      omissionCount += 1
      return
    }
    if (attempts[attempts.length - 1].targetId !== spec.targetId) {
      omissionCount += 1
      errorCount += attempts.length
      return
    }
    errorCount += Math.max(0, attempts.length - 1)
    const correctAt = attempts[attempts.length - 1].atMs
    if (correctAt > input.config.stepTimeoutMs) {
      omissionCount += 1
      return
    }
    const stepTime = correctAt
    partStepTimes[spec.part].push(stepTime)
    completionTimeMs = (completionTimeMs ?? 0) + stepTime
    if (spec.part === 'A') partACompletionTimeMs = (partACompletionTimeMs ?? 0) + stepTime
    else partBCompletionTimeMs = (partBCompletionTimeMs ?? 0) + stepTime
    completedStepCount += 1
  })

  const omissionRate = omissionCount / expected.length
  const errorRate = attemptCount === 0 ? 0 : errorCount / attemptCount
  const insufficientCompletedSteps = completedStepCount < Math.ceil(expected.length * 0.8)
  const excessiveErrors = errorRate >= 0.3
  const timeLimitReached = omissionCount > 0 || trials.some((trial) => trial.payload.interrupted)
  const deviceInfoIncomplete = deviceClasses.has('unknown') || pointerTypes.size === 0 || pointerTypes.has('unknown')
  const mixedPointerType = pointerTypes.size > 1
  const interrupted = trials.some((trial) => trial.payload.interrupted)
  const setShiftCostMs = input.config.form === 'AB' && partStepTimes.A.length > 0 && partStepTimes.B.length > 0
    ? (mean(partStepTimes.B) as number) - (mean(partStepTimes.A) as number)
    : null
  const timeScore = completionTimeMs == null ? 0 : Math.max(0, 100 - Math.round(completionTimeMs / 1000))
  const accuracyScore = completedStepCount / expected.length * 100

  return {
    score: Math.max(0, Math.min(100, Math.round(timeScore * 0.4 + accuracyScore * 0.6))),
    metrics: {
      completionTimeMs,
      partACompletionTimeMs,
      partBCompletionTimeMs,
      setShiftCostMs,
      errorCount,
      errorRate: Number(errorRate.toFixed(4)),
      meanCorrectStepTimeMs: mean([...partStepTimes.A, ...partStepTimes.B]),
      completedStepCount,
      omissionRate: Number(omissionRate.toFixed(4)),
    },
    qualityFlags: {
      interpretable: !insufficientCompletedSteps && !excessiveErrors && !interrupted,
      insufficientCompletedSteps,
      excessiveErrors,
      timeLimitReached,
      deviceInfoIncomplete,
      mixedPointerType,
      interrupted,
    },
  }
}
