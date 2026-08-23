import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { mentalRotationSequence } from '../randomization'
import { MentalrotationConfig } from '../schemas/mentalrotation.config'
import { MentalrotationTrial } from '../schemas/mentalrotation.trial'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export const scoreMentalrotationV1 = (input: { config: MentalrotationConfig; trials: ScoringTrial<MentalrotationTrial>[]; randomSeed?: string }): CognitiveScoreResult => {
  if (!input.randomSeed) throw new CognitiveScoringInputError('mentalrotation v1 requires randomSeed')
  const expected = mentalRotationSequence(input.randomSeed, input.config.totalTrials)
  const trials = [...input.trials].sort((a, b) => a.trialIndex - b.trialIndex)
  if (trials.length !== expected.length) throw new CognitiveScoringInputError('mentalrotation v1 requires the configured trial count')
  const correctRts: number[] = []
  const lowAngleRts: number[] = []
  const highAngleRts: number[] = []
  const responses: string[] = []
  let correctCount = 0
  let mirrorErrors = 0
  let mirrorTrials = 0
  let omissions = 0
  let interrupted = 0
  trials.forEach((trial, index) => {
    const spec = expected[index]
    if (trial.trialIndex !== index || trial.payload.itemId !== spec.itemId) throw new CognitiveScoringInputError('mentalrotation v1 trial does not match frozen item sequence')
    const correct = trial.payload.response === spec.correctResponse
    if (correct) {
      correctCount += 1
      if (trial.payload.rtMs != null && trial.payload.rtMs >= input.config.validRtFloorMs) {
        correctRts.push(trial.payload.rtMs)
        if (spec.angle <= 45) lowAngleRts.push(trial.payload.rtMs)
        if (spec.angle >= 135) highAngleRts.push(trial.payload.rtMs)
      }
    }
    if (spec.mirrored) { mirrorTrials += 1; if (!correct) mirrorErrors += 1 }
    if (trial.payload.response == null) omissions += 1
    else responses.push(trial.payload.response)
    if (trial.payload.interrupted) interrupted += 1
  })
  const accuracy = correctCount / trials.length
  const omissionRate = omissions / trials.length
  const constantResponse = responses.length >= 8 && new Set(responses).size === 1
  const insufficientAngleCoverage = lowAngleRts.length < 2 || highAngleRts.length < 2
  const excessiveOmissions = omissionRate >= 0.3
  const lowAccuracy = accuracy < 0.5
  const lowMedian = median(lowAngleRts)
  const highMedian = median(highAngleRts)
  return {
    score: Math.round(accuracy * 100),
    metrics: {
      accuracy: Number(accuracy.toFixed(4)),
      medianCorrectRtMs: median(correctRts),
      angleCost: lowMedian == null || highMedian == null ? null : highMedian - lowMedian,
      mirrorErrorRate: Number((mirrorErrors / mirrorTrials).toFixed(4)),
      omissionRate: Number(omissionRate.toFixed(4)),
    },
    qualityFlags: { interpretable: !constantResponse && !insufficientAngleCoverage && !excessiveOmissions && !lowAccuracy, constantResponse, insufficientAngleCoverage, excessiveOmissions, lowAccuracy, interrupted: interrupted > 0 },
  }
}
