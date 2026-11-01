import { describe, expect, it } from 'vitest'
import { buildArithverifyTrials, ARITHVERIFY_PRACTICE_TRIALS } from '../prng'

describe('arithverify prng', () => {
  it('produces deterministic trials with the requested true/false split', () => {
    const first = buildArithverifyTrials('seed-1', 10, 10, 0.5)
    const second = buildArithverifyTrials('seed-1', 10, 10, 0.5)
    expect(first).toEqual(second)
    expect(first.filter((trial) => trial.isTrue)).toHaveLength(5)
    expect(first.filter((trial) => !trial.isTrue)).toHaveLength(5)
  })

  it('keeps operands in range and false results distinct from the true sum', () => {
    const trials = buildArithverifyTrials('seed-2', 30, 10, 0.5)
    for (const trial of trials) {
      expect(trial.leftOperand).toBeGreaterThanOrEqual(1)
      expect(trial.leftOperand).toBeLessThanOrEqual(10)
      expect(trial.rightOperand).toBeGreaterThanOrEqual(1)
      expect(trial.rightOperand).toBeLessThanOrEqual(10)
      expect(trial.displayedResult).toBeGreaterThanOrEqual(0)
      if (!trial.isTrue) {
        expect(trial.displayedResult).not.toBe(trial.leftOperand + trial.rightOperand)
        expect(Math.abs(trial.displayedResult - (trial.leftOperand + trial.rightOperand))).toBeLessThanOrEqual(3)
      }
    }
  })

  it('changes the sequence when the seed changes', () => {
    const a = buildArithverifyTrials('seed-a', 10, 10, 0.5)
    const b = buildArithverifyTrials('seed-b', 10, 10, 0.5)
    expect(a).not.toEqual(b)
  })

  it('keeps the practice pair fixed with one true and one false equation', () => {
    expect(ARITHVERIFY_PRACTICE_TRIALS.map((trial) => trial.isTrue)).toEqual([true, false])
  })
})
