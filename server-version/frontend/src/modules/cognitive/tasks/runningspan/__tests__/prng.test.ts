import { describe, expect, it } from 'vitest'
import { buildRunningspanSequences, RUNNINGSPAN_LETTERS } from '../prng'

describe('runningspan prng', () => {
  it('produces deterministic sequences within the frozen length range', () => {
    const first = buildRunningspanSequences('seed-1', 6, 7, 11)
    const second = buildRunningspanSequences('seed-1', 6, 7, 11)
    expect(first).toEqual(second)
    for (const trial of first) {
      expect(trial.sequence.length).toBeGreaterThanOrEqual(7)
      expect(trial.sequence.length).toBeLessThanOrEqual(11)
    }
  })

  it('keeps letters in the pool without adjacent repeats', () => {
    const trials = buildRunningspanSequences('seed-2', 12, 7, 11)
    for (const trial of trials) {
      trial.sequence.forEach((letter, index) => {
        expect(RUNNINGSPAN_LETTERS).toContain(letter)
        if (index > 0) expect(letter).not.toBe(trial.sequence[index - 1])
      })
    }
  })

  it('varies list lengths so the end stays unpredictable', () => {
    const trials = buildRunningspanSequences('seed-3', 12, 7, 11)
    expect(new Set(trials.map((trial) => trial.sequence.length)).size).toBeGreaterThan(1)
  })
})
