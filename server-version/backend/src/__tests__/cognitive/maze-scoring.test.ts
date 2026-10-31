import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreMazeV1 } from '../../modules/cognitive/scoring/maze.v1'
import { generateMaze, isMoveLegal } from '../../modules/cognitive/tasks/maze/generator'
import type { MazeConfig } from '../../modules/cognitive/schemas/maze.config'
import type { MazeTrial } from '../../modules/cognitive/schemas/maze.trial'

const config: MazeConfig = {
  totalTrials: 2,
  mazeCols: 7,
  mazeRows: 7,
  timeLimitMs: 120000,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

/** Solve maze using BFS path */
const solveMaze = (seed: string, mazeIndex: number): number[] => {
  const maze = generateMaze(seed, mazeIndex, 7, 7)
  const dist = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => -1))
  const prev = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => -1))
  dist[0][0] = 0
  const queue: Array<[number, number]> = [[0, 0]]
  while (queue.length > 0) {
    const [r, c] = queue.shift() as [number, number]
    for (let d = 0; d < 4; d += 1) {
      const dr = [-1, 0, 1, 0][d]
      const dc = [0, 1, 0, -1][d]
      const nr = r + dr
      const nc = c + dc
      if (nr >= 0 && nr < 7 && nc >= 0 && nc < 7 && dist[nr][nc] === -1) {
        if (isMoveLegal(maze.walls, r, c, d)) {
          dist[nr][nc] = dist[r][c] + 1
          prev[nr][nc] = d
          queue.push([nr, nc])
        }
      }
    }
  }
  // Backtrack from goal
  const moves: number[] = []
  let r = 6, c = 6
  while (r !== 0 || c !== 0) {
    const d = prev[r][c]
    moves.unshift(d)
    r -= [-1, 0, 1, 0][d]
    c -= [0, 1, 0, -1][d]
  }
  return moves
}

describe('maze scorer', () => {
  it('rebuilds maze from seed, verifies moves, and derives efficiency', () => {
    const moves = solveMaze('seed-1', 0)
    const result = scoreMazeV1({
      config,
      randomSeed: 'seed-1',
      trials: [
        { trialIndex: 0, payload: { mazeIndex: 0, moves, completionTimeMs: 5000, completed: true, interrupted: false } },
        { trialIndex: 1, payload: { mazeIndex: 1, moves: solveMaze('seed-1', 1), completionTimeMs: 6000, completed: true, interrupted: false } },
      ],
    })
    expect(result.metrics.pathEfficiency).toBe(1.0)
    expect(result.metrics.completedCount).toBe(2)
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(result.score).toBe(100)
  })

  it('marks incomplete mazes and sets pathEfficiency to null', () => {
    // Use only legal moves that don't reach the goal
    const maze = generateMaze('seed-1', 0, 7, 7)
    // Find a legal move from start
    const legalDirs = [0, 1, 2, 3].filter((d) => isMoveLegal(maze.walls, 0, 0, d))
    const moves = legalDirs.slice(0, 1) // just 1 legal move, won't reach goal
    const result = scoreMazeV1({
      config,
      randomSeed: 'seed-1',
      trials: [
        { trialIndex: 0, payload: { mazeIndex: 0, moves, completionTimeMs: null, completed: false, interrupted: false } },
        { trialIndex: 1, payload: { mazeIndex: 1, moves, completionTimeMs: null, completed: false, interrupted: false } },
      ],
    })
    expect(result.metrics.pathEfficiency).toBeNull()
    expect(result.qualityFlags.incompleteMazes).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
    expect(result.score).toBe(0)
  })

  it('rejects wall-crossing moves and wrong counts', () => {
    const moves = solveMaze('seed-1', 0)
    expect(() => scoreMazeV1({
      config,
      randomSeed: 'seed-1',
      trials: [
        { trialIndex: 0, payload: { mazeIndex: 0, moves: [0, 0, 0], completionTimeMs: 5000, completed: true, interrupted: false } },
        { trialIndex: 1, payload: { mazeIndex: 1, moves: solveMaze('seed-1', 1), completionTimeMs: 6000, completed: true, interrupted: false } },
      ],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreMazeV1({ config, randomSeed: 'seed-1', trials: [{ trialIndex: 0, payload: { mazeIndex: 0, moves, completionTimeMs: 5000, completed: true, interrupted: false } }] })).toThrow(CognitiveScoringInputError)
  })
})


it('rejects reusing another frozen maze index even when its path is legal', () => {
  const moves = solveMaze('seed-1', 0)
  expect(() => scoreMazeV1({
    config,
    randomSeed: 'seed-1',
    trials: [
      { trialIndex: 0, payload: { mazeIndex: 0, moves, completionTimeMs: 5000, completed: true, interrupted: false } },
      { trialIndex: 1, payload: { mazeIndex: 0, moves, completionTimeMs: 5000, completed: true, interrupted: false } },
    ],
  })).toThrow(/mazeIndex must match/)
})
