import { describe, expect, it } from 'vitest'
import { visualwmTrial, VISUALWM_COLORS } from '../generator'

describe('visualwm generator', () => {
  it('produces deterministic stimuli for a fixed seed+index', () => {
    const a = visualwmTrial('seed-1', 5)
    const b = visualwmTrial('seed-1', 5)
    expect(a).toEqual(b)
  })

  it('cycles set sizes 3-6 and uses unique colors per trial', () => {
    for (let index = 0; index < 8; index += 1) {
      const trial = visualwmTrial('seed-2', index)
      expect(trial.setSize).toBe(3 + (index % 4))
      expect(trial.colors).toHaveLength(trial.setSize)
      expect(new Set(trial.colors).size).toBe(trial.setSize)
      expect(trial.probePosition).toBeLessThan(trial.setSize)
    }
  })

  it('changes probe color only when isChange is true', () => {
    for (let index = 0; index < 20; index += 1) {
      const trial = visualwmTrial('seed-3', index)
      const originalColor = trial.colors[trial.probePosition]
      if (!trial.isChange) expect(trial.probeColor).toBe(originalColor)
      else expect(trial.probeColor).not.toBe(originalColor)
    }
  })

  it('changes stimuli when the seed changes', () => {
    expect(visualwmTrial('seed-a', 5)).not.toEqual(visualwmTrial('seed-b', 5))
  })
})
