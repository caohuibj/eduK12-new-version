import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { applyTowerMove, towerSequence, TowerState } from '../randomization'
import { TowerConfig } from '../schemas/tower.config'
import { TowerTrial } from '../schemas/tower.trial'

const sameState = (left: TowerState, right: TowerState) => left.every((value, index) => value === right[index])
const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export const scoreTowerV1 = (input: { config: TowerConfig; trials: ScoringTrial<TowerTrial>[]; randomSeed?: string }): CognitiveScoreResult => {
  if (!input.randomSeed) throw new CognitiveScoringInputError('tower v1 requires randomSeed')
  const expected = towerSequence(input.randomSeed, input.config.problemCount)
  const trials = [...input.trials].sort((a, b) => a.trialIndex - b.trialIndex)
  if (trials.length !== expected.length) throw new CognitiveScoringInputError('tower v1 requires the configured problem count')
  let solvedCount = 0
  let minimumMoveSolvedCount = 0
  let ruleViolations = 0
  let attemptedCount = 0
  let interruptedCount = 0
  const excessMoves: number[] = []
  const firstMoveLatencies: number[] = []
  trials.forEach((trial, index) => {
    const problem = expected[index]
    if (trial.trialIndex !== index || trial.payload.problemId !== problem.problemId) throw new CognitiveScoringInputError('tower v1 trial does not match frozen problem sequence')
    const maximumMoves = Math.max(problem.minimumMoves + 2, Math.ceil(problem.minimumMoves * input.config.maxMovesFactor))
    if (trial.payload.moves.length > maximumMoves) throw new CognitiveScoringInputError('tower v1 move count exceeds the frozen problem limit')
    let state = [...problem.initialState] as TowerState
    let validMoves = 0
    let priorAtMs = -1
    trial.payload.moves.forEach((move) => {
      if (move.atMs < priorAtMs) throw new CognitiveScoringInputError('tower v1 move timestamps must be nondecreasing')
      priorAtMs = move.atMs
      const applied = applyTowerMove(state, move)
      if (applied.valid) { state = applied.state; validMoves += 1 } else ruleViolations += 1
    })
    if (trial.payload.moves.length > 0) { attemptedCount += 1; firstMoveLatencies.push(trial.payload.moves[0].atMs) }
    const solved = sameState(state, problem.targetState)
    if (solved) {
      solvedCount += 1
      excessMoves.push(Math.max(0, validMoves - problem.minimumMoves))
      if (validMoves === problem.minimumMoves) minimumMoveSolvedCount += 1
    }
    if (trial.payload.interrupted) interruptedCount += 1
  })
  const noAttemptRate = 1 - attemptedCount / trials.length
  const excessiveRuleViolations = ruleViolations >= Math.max(3, trials.length)
  const insufficientAttemptedProblems = attemptedCount < Math.ceil(trials.length / 2)
  return {
    score: Math.round((solvedCount / trials.length) * 100),
    metrics: {
      minimumMoveSolveRate: Number((minimumMoveSolvedCount / trials.length).toFixed(4)),
      solveRate: Number((solvedCount / trials.length).toFixed(4)),
      excessMoves: excessMoves.length ? Number((excessMoves.reduce((sum, value) => sum + value, 0) / excessMoves.length).toFixed(3)) : null,
      firstMoveLatencyMs: median(firstMoveLatencies),
      ruleViolations,
      noAttemptRate: Number(noAttemptRate.toFixed(4)),
    },
    qualityFlags: { interpretable: !excessiveRuleViolations && !insufficientAttemptedProblems, excessiveRuleViolations, insufficientAttemptedProblems, interrupted: interruptedCount > 0 },
  }
}
