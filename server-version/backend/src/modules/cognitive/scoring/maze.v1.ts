import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { MazeConfig } from '../schemas/maze.config'
import { MazeTrial } from '../schemas/maze.trial'
import { generateMaze, isMoveLegal } from '../tasks/maze/generator'

const round = (value: number): number => Number(value.toFixed(4))

/** Maze v1：迷宫结构由服务端重建，路径合法性由服务端逐步验证，效率由服务端换算。 */
export const scoreMazeV1 = (input: {
  config: MazeConfig
  trials: ScoringTrial<MazeTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  const { config } = input
  if (!input.randomSeed) throw new CognitiveScoringInputError('maze v1 requires randomSeed to regenerate mazes')
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `maze v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `maze v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })

  let totalOptimal = 0
  let totalActual = 0
  let totalDeadEnds = 0
  let completedCount = 0
  let totalCompletionTimeMs = 0

  for (const trial of sorted) {
    const maze = generateMaze(input.randomSeed as string, trial.payload.mazeIndex, config.mazeCols, config.mazeRows)
    let row = 0
    let col = 0
    const visited = new Set<string>(['0,0'])
    let deadEnds = 0
    let reachedGoal = false

    for (let stepIndex = 0; stepIndex < trial.payload.moves.length; stepIndex += 1) {
      const direction = trial.payload.moves[stepIndex]
      if (!isMoveLegal(maze.walls, row, col, direction)) {
        throw new CognitiveScoringInputError(`maze v1 trial ${trial.trialIndex} move ${stepIndex} crosses a wall`)
      }
      row += [-1, 0, 1, 0][direction]
      col += [0, 1, 0, -1][direction]
      const cellKey = `${row},${col}`
      if (visited.has(cellKey)) deadEnds += 1
      visited.add(cellKey)
      if (row === maze.rows - 1 && col === maze.cols - 1) {
        reachedGoal = true
        break
      }
    }

    if (reachedGoal && trial.payload.completed) {
      completedCount += 1
      totalOptimal += maze.optimalPathLength
      totalActual += trial.payload.moves.length
      if (trial.payload.completionTimeMs !== null) totalCompletionTimeMs += trial.payload.completionTimeMs
    }
    totalDeadEnds += deadEnds
  }

  const pathEfficiency = completedCount === 0 || totalActual === 0 ? null : round(Math.min(1, totalOptimal / totalActual))

  return {
    score: pathEfficiency === null ? 0 : Math.round(pathEfficiency * 100),
    metrics: {
      pathEfficiency,
      completedCount,
      totalDeadEnds,
      medianCompletionTimeMs: completedCount === 0 ? null : Math.round(totalCompletionTimeMs / completedCount),
    },
    qualityFlags: {
      interpretable: completedCount === config.totalTrials,
      incompleteMazes: completedCount < config.totalTrials,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
