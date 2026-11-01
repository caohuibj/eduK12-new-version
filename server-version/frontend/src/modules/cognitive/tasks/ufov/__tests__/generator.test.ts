import { describe, expect, it } from 'vitest'
import { ufovStimulus } from '../generator'

describe('ufov generator', () => {
  it('produces deterministic stimuli for a fixed seed+index', () => {
    const a = ufovStimulus('seed-1', 5)
    const b = ufovStimulus('seed-1', 5)
    expect(a).toEqual(b)
  })

  it('uses only valid central targets and peripheral positions', () => {
    for (let index = 0; index < 20; index += 1) {
      const stimulus = ufovStimulus('seed-2', index)
      expect(['circle', 'triangle']).toContain(stimulus.centralTarget)
      expect(stimulus.peripheralPosition).toBeGreaterThanOrEqual(0)
      expect(stimulus.peripheralPosition).toBeLessThanOrEqual(7)
    }
  })

  it('changes stimuli when the seed changes', () => {
    const a = ufovStimulus('seed-a', 10)
    const b = ufovStimulus('seed-b', 10)
    expect(a).not.toEqual(b)
  })
})
