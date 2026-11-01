import { describe, expect, it } from 'vitest'
import { buildLineangleTrials, anglePool } from '../prng'

describe('lineangle prng', () => {
  it('builds the 0..180 angle pool with the configured step', () => {
    expect(anglePool(15)).toEqual([0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180])
  })

  it('places the target exactly once among distinct, separated options', () => {
    const trials = buildLineangleTrials('seed-1', 30, 15, 4, 2)
    const first = buildLineangleTrials('seed-1', 30, 15, 4, 2)
    expect(trials).toEqual(first)
    for (const trial of trials) {
      expect(trial.optionAngles).toHaveLength(4)
      expect(new Set(trial.optionAngles).size).toBe(4)
      expect(trial.optionAngles.filter((angle) => angle === trial.targetAngle)).toHaveLength(1)
      const targetIndex = anglePool(15).indexOf(trial.targetAngle)
      for (const option of trial.optionAngles) {
        if (option !== trial.targetAngle) {
          expect(Math.abs(anglePool(15).indexOf(option) - targetIndex)).toBeGreaterThanOrEqual(2)
        }
      }
    }
  })

  it('changes the sequence when the seed changes', () => {
    expect(buildLineangleTrials('a', 8, 15, 4, 2)).not.toEqual(buildLineangleTrials('b', 8, 15, 4, 2))
  })
})
