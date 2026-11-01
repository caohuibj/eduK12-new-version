import { describe, expect, it } from 'vitest'
import { buildSentencecheckTrials, type SentencecheckStimulus } from '../prng'
import { buildSentencecheckTrialsV11 } from '../generator-v1.1'
import { buildSentencecheckTrialsV11 as backendTrials } from '../../../../../../../backend/src/modules/cognitive/tasks/sentencecheck/generator-v1.1'
import { scoreSentencecheckV11, sentencecheckConfigV11Schema } from '../../../../../../../backend/src/modules/cognitive/tasks/sentencecheck/scoring-v1.1'
import { scoreSentencecheckV1 } from '../../../../../../../backend/src/modules/cognitive/scoring/sentencecheck.v1'
import { sentencecheckTrialSchema, type SentencecheckTrial } from '../../../../../../../backend/src/modules/cognitive/schemas/sentencecheck.trial'
import { executionEntries } from '../../../../../../../backend/src/modules/cognitive/tasks/sentencecheck/package'
import legacyFixture from '../../../../../../../backend/src/modules/cognitive/tasks/sentencecheck/fixtures/1.0.1-1.0.0.json'
import currentFixture from '../../../../../../../backend/src/modules/cognitive/tasks/sentencecheck/fixtures/1.1.0-1.1.0.json'

const config = {
  totalTrials: 12, trueRatio: 0.5, negationRatio: 0.5, fixationMs: 500,
  timeoutMs: 8000, validRtFloorMs: 300,
  report: { reportVersion: '1.1.0', referenceMode: 'none' as const },
}

const makeInput = () => ({
  config,
  randomSeed: 'crossed-conditions',
  trials: buildSentencecheckTrialsV11('crossed-conditions', 12, 0.5, 0.5).map(({ sentence: _sentence, ...stimulus }, trialIndex) => ({
    trialIndex, payload: sentencecheckTrialSchema.parse({ ...stimulus, response: truthOf({ ...stimulus, sentence: '' }) as boolean | null,
      rtMs: (stimulus.negated ? 800 : 500) as number | null, interrupted: false }),
  })),
})

const actualValueOf = (trial: SentencecheckStimulus): SentencecheckTrial['askedValue'] => trial.questionKind === 'shape'
    ? ({ circle: '圆形', square: '方形', triangle: '三角形' } as const)[trial.shape]
    : ({ red: '红色', blue: '蓝色', green: '绿色', yellow: '黄色' } as const)[trial.color]
const truthOf = (trial: SentencecheckStimulus): boolean => {
  const actual = actualValueOf(trial)
  return trial.negated ? trial.askedValue !== actual : trial.askedValue === actual
}

describe('sentencecheck condition identity boundary', () => {
  it('retains the legacy counterexample at the actual experience and research settings', () => {
    for (const count of [12, 60]) {
      const trials = buildSentencecheckTrials('legacy-condition-counterexample', count, 0.5, 0.5)
      // The old synchronized shuffle makes truth predictable from negation alone.
      expect(trials.every((trial) => trial.negated === truthOf(trial))).toBe(true)
      expect(trials.filter((trial) => truthOf(trial))).toHaveLength(count / 2)
    }
  })

  it('crosses all four cells exactly at E12/R60 and within one trial at standard30', () => {
    for (const count of [12, 30, 60]) {
      for (const seed of ['crossed-conditions', 'different-seed']) {
        const trials = buildSentencecheckTrialsV11(seed, count, 0.5, 0.5)
        const cells = [false, true].flatMap((negated) => [false, true].map((truth) =>
          trials.filter((trial) => trial.negated === negated && truthOf(trial) === truth).length))
        expect(Math.min(...cells)).toBeGreaterThan(0)
        expect(Math.max(...cells) - Math.min(...cells)).toBeLessThanOrEqual(1)
        expect(trials.filter(truthOf)).toHaveLength(count / 2)
        expect(trials.filter((trial) => trial.negated)).toHaveLength(count / 2)
        expect(trials.every((trial) => trial.negated === truthOf(trial))).toBe(false)
        expect(backendTrials(seed, count, 0.5, 0.5)).toEqual(trials)
        expect(buildSentencecheckTrialsV11(seed, count, 0.5, 0.5)).toEqual(trials)
      }
    }
    expect(buildSentencecheckTrialsV11('a', 12, 0.5, 0.5)).not.toEqual(buildSentencecheckTrialsV11('b', 12, 0.5, 0.5))
  })

  it('preserves feasible custom margins while requiring all four conditions', () => {
    const trials = buildSentencecheckTrialsV11('unequal-margins', 12, 0.75, 0.25)
    expect(trials.filter(truthOf)).toHaveLength(9)
    expect(trials.filter((trial) => trial.negated)).toHaveLength(3)
    for (const negated of [false, true]) for (const truth of [false, true]) {
      expect(trials.some((trial) => trial.negated === negated && truthOf(trial) === truth)).toBe(true)
    }
    expect(sentencecheckConfigV11Schema.safeParse({ ...config, totalTrials: 2 }).success).toBe(false)
    expect(sentencecheckConfigV11Schema.safeParse({ ...config, negationRatio: 0 }).success).toBe(false)
  })

  it('keeps numeric scoring, omissions and completeness rules and adds authoritative stimulus rejection', () => {
    const input = makeInput()
    expect(scoreSentencecheckV11(input)).toEqual(scoreSentencecheckV1(input))
    expect(scoreSentencecheckV11(input).metrics).toMatchObject({ accuracy: 1, medianRtMs: 650, negationPenaltyMs: 300, validRtCount: 12 })
    input.trials[0].payload.response = null
    input.trials[0].payload.rtMs = null
    input.trials[1].payload.response = !input.trials[1].payload.response
    expect(scoreSentencecheckV11(input).metrics).toMatchObject({ accuracy: 10 / 12, timeoutCount: 1, errorCount: 1 })
    expect(() => scoreSentencecheckV11({ ...input, trials: [] })).toThrow('expects exactly 12 trials')
    expect(() => scoreSentencecheckV11({ ...input, trials: [input.trials[0], ...input.trials.slice(0, -1)] })).toThrow('requires contiguous trialIndex')
    expect(() => scoreSentencecheckV11({ ...input, randomSeed: undefined })).toThrow('requires randomSeed')
    expect(() => scoreSentencecheckV11({ ...input, randomSeed: 'wrong-seed' })).toThrow('does not match the frozen regeneration')
    const countTamper = makeInput()
    countTamper.trials[0].payload.negated = !countTamper.trials[0].payload.negated
    expect(() => scoreSentencecheckV11(countTamper)).toThrow('expects 6 matching and 6 non-matching statements')
    const tampered = makeInput()
    // The unused attribute can change without altering truth/counts in the legacy scorer.
    const trial = tampered.trials[0].payload
    if (trial.questionKind === 'shape') trial.color = trial.color === 'red' ? 'blue' : 'red'
    else trial.shape = trial.shape === 'circle' ? 'square' : 'circle'
    expect(() => scoreSentencecheckV1(tampered)).not.toThrow()
    expect(() => scoreSentencecheckV11(tampered)).toThrow('does not match the frozen regeneration')
    const conditionTamper = makeInput()
    const condition = conditionTamper.trials[0].payload
    const stimulus = { ...condition, sentence: '' }
    const truth = truthOf(stimulus)
    condition.negated = !condition.negated
    const actual = actualValueOf(stimulus)
    const other = condition.questionKind === 'shape' ? ['圆形', '方形', '三角形'] as const : ['红色', '蓝色', '绿色', '黄色'] as const
    condition.askedValue = truth !== condition.negated ? actual : other.find((value) => value !== actual)!
    expect(() => scoreSentencecheckV1(conditionTamper)).not.toThrow()
    expect(() => scoreSentencecheckV11(conditionTamper)).toThrow('does not match the frozen regeneration')
  })

  it('preserves the legacy identity, seed-free scorer and historical fixture outputs', () => {
    expect(executionEntries[0].engineVersion).toBe('1.0.1')
    expect(executionEntries[0].score).toBe(scoreSentencecheckV1)
    expect(executionEntries[1].engineVersion).toBe('1.1.0')
    expect(executionEntries[1].score).toBe(scoreSentencecheckV11)
    for (const fixture of legacyFixture.cases) {
      const input = fixture.input as unknown as Parameters<typeof scoreSentencecheckV1>[0]
      if ('expectedError' in fixture) expect(() => scoreSentencecheckV1(input)).toThrow(fixture.expectedError)
      else expect(scoreSentencecheckV1(input)).toEqual(fixture.expected)
    }
  })

  it('matches the new four-cell fixture and its independently specified numeric expectations', () => {
    for (const fixture of currentFixture.cases) {
      const input = fixture.input as unknown as Parameters<typeof scoreSentencecheckV11>[0]
      if ('expectedError' in fixture) expect(() => scoreSentencecheckV11(input)).toThrow(fixture.expectedError)
      else expect(scoreSentencecheckV11(input)).toEqual(fixture.expected)
    }
  })
})
