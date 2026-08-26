import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { matrixSequence } from '../randomization'
import { MatrixConfig } from '../schemas/matrix.config'
import { MatrixTrial } from '../schemas/matrix.trial'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export const scoreMatrixV1 = (input: { config: MatrixConfig; trials: ScoringTrial<MatrixTrial>[]; randomSeed?: string }): CognitiveScoreResult => {
  if (!input.randomSeed) throw new CognitiveScoringInputError('matrix v1 requires randomSeed')
  const expected = matrixSequence(input.randomSeed, input.config.itemCount)
  const trials = [...input.trials].sort((a, b) => a.trialIndex - b.trialIndex)
  if (trials.length !== expected.length) throw new CognitiveScoringInputError('matrix v1 requires the configured item count')
  const correctByFamily: Record<string, { correct: number; total: number }> = {}
  const correctRts: number[] = []
  const responses: number[] = []
  let correctCount = 0
  let omissionCount = 0
  let reachedDifficulty = 0
  let interruptedCount = 0
  trials.forEach((trial, index) => {
    const spec = expected[index]
    if (trial.trialIndex !== index || trial.payload.itemId !== spec.itemId) {
      throw new CognitiveScoringInputError('matrix v1 trial does not match frozen item sequence')
    }
    const bucket = correctByFamily[spec.ruleFamily] ?? { correct: 0, total: 0 }
    bucket.total += 1
    const correct = trial.payload.selectedOption === spec.correctOption
    if (correct) {
      bucket.correct += 1
      correctCount += 1
      reachedDifficulty = Math.max(reachedDifficulty, spec.difficulty)
      if (trial.payload.rtMs != null && trial.payload.rtMs >= input.config.validRtFloorMs) correctRts.push(trial.payload.rtMs)
    }
    correctByFamily[spec.ruleFamily] = bucket
    if (trial.payload.selectedOption == null) omissionCount += 1
    else responses.push(trial.payload.selectedOption)
    if (trial.payload.interrupted) interruptedCount += 1
  })
  const omissionRate = omissionCount / trials.length
  const constantResponse = responses.length >= 6 && new Set(responses).size === 1
  const excessiveOmissions = omissionRate >= 0.3
  return {
    score: Math.round((correctCount / trials.length) * 100),
    metrics: {
      accuracy: Number((correctCount / trials.length).toFixed(4)),
      accuracyByRuleFamily: Object.fromEntries(Object.entries(correctByFamily).map(([key, value]) => [key, Number((value.correct / value.total).toFixed(4))])),
      reachedDifficulty,
      medianRtMs: median(correctRts),
      omissionRate: Number(omissionRate.toFixed(4)),
    },
    qualityFlags: { interpretable: !constantResponse && !excessiveOmissions, constantResponse, excessiveOmissions, interrupted: interruptedCount > 0 },
  }
}
