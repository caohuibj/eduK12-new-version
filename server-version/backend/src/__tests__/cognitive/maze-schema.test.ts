import { describe, expect, it } from 'vitest'
import { mazeConfigSchema } from '../../modules/cognitive/schemas/maze.config'
import { mazeTrialSchema } from '../../modules/cognitive/schemas/maze.trial'

const config = {
  totalTrials: 4,
  mazeCols: 7,
  mazeRows: 7,
  timeLimitMs: 120000,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('maze schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(mazeConfigSchema.safeParse(config).success).toBe(true)
    expect(mazeTrialSchema.safeParse({
      mazeIndex: 0,
      moves: [1, 2, 1, 2],
      completionTimeMs: 5000,
      completed: true,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects invalid directions and client-derived fields', () => {
    expect(mazeTrialSchema.safeParse({
      mazeIndex: 0,
      moves: [4],
      completionTimeMs: 5000,
      completed: false,
      interrupted: false,
    }).success).toBe(false)
    expect(mazeTrialSchema.safeParse({
      mazeIndex: 0,
      moves: [1, 2],
      completionTimeMs: 5000,
      completed: true,
      interrupted: false,
      pathEfficiency: 1.0,
    }).success).toBe(false)
  })
})
