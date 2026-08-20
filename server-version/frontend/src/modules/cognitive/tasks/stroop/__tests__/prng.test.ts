import { describe, expect, it } from 'vitest'
import { buildStroopTrials } from '../prng'

describe('Stroop seeded trial plan', () => {
  it('is deterministic and preserves the configured condition ratio', () => {
    const a = buildStroopTrials('seed-1', 24, 0.5)
    const b = buildStroopTrials('seed-1', 24, 0.5)
    expect(a).toEqual(b)
    expect(a).toHaveLength(24)
    const words = { 红: 'red', 绿: 'green', 蓝: 'blue', 黄: 'yellow' } as const
    expect(a.filter((trial) => words[trial.word] === trial.inkColor)).toHaveLength(12)
    expect(a.filter((trial) => words[trial.word] !== trial.inkColor)).toHaveLength(12)
  })

  it('changes the plan when the retained session seed changes', () => {
    expect(buildStroopTrials('seed-1', 12, 0.5)).not.toEqual(buildStroopTrials('seed-2', 12, 0.5))
  })
})
