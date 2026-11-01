import { describe, expect, it } from 'vitest'
import { buildSentencecheckTrials, SENTENCECHECK_PRACTICE_TRIALS } from '../prng'

const actualValueOf = (trial: { questionKind: string; shape: string; color: string }): string =>
  trial.questionKind === 'shape'
    ? ({ circle: '圆形', square: '方形', triangle: '三角形' } as Record<string, string>)[trial.shape]
    : ({ red: '红色', blue: '蓝色', green: '绿色', yellow: '黄色' } as Record<string, string>)[trial.color]

describe('sentencecheck prng', () => {
  it('produces deterministic trials with the requested true/false split', () => {
    const first = buildSentencecheckTrials('seed-1', 10, 0.5, 0.5)
    const second = buildSentencecheckTrials('seed-1', 10, 0.5, 0.5)
    expect(first).toEqual(second)
    const trueStatements = first.filter((trial) => {
      const actual = actualValueOf(trial)
      return trial.negated ? trial.askedValue !== actual : trial.askedValue === actual
    })
    expect(trueStatements).toHaveLength(5)
  })

  it('honours the negation ratio and matches askedValue to the question kind', () => {
    const trials = buildSentencecheckTrials('seed-2', 30, 0.5, 0.5)
    const negated = trials.filter((trial) => trial.negated)
    expect(negated).toHaveLength(15)
    for (const trial of trials) {
      if (trial.questionKind === 'shape') {
        expect(['圆形', '方形', '三角形']).toContain(trial.askedValue)
      } else {
        expect(['红色', '蓝色', '绿色', '黄色']).toContain(trial.askedValue)
      }
      expect(trial.sentence).toContain(trial.askedValue)
    }
  })

  it('changes the sequence when the seed changes and keeps the practice pair fixed', () => {
    expect(buildSentencecheckTrials('a', 10, 0.5, 0.5)).not.toEqual(buildSentencecheckTrials('b', 10, 0.5, 0.5))
    expect(SENTENCECHECK_PRACTICE_TRIALS).toHaveLength(2)
    expect(SENTENCECHECK_PRACTICE_TRIALS[0].negated).toBe(false)
    expect(SENTENCECHECK_PRACTICE_TRIALS[1].negated).toBe(true)
  })
})
