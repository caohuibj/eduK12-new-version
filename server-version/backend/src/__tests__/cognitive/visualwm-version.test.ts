import { describe, expect, it } from 'vitest'
import { executionEntries } from '../../modules/cognitive/tasks/visualwm/package'
import { seeds } from '../../modules/cognitive/tasks/visualwm/seeds'
import { participantPresentations } from '../../modules/cognitive/tasks/visualwm/participant-presentation'
import { scoreVisualwmV1 } from '../../modules/cognitive/scoring/visualwm.v1'
import legacyFixture from '../../modules/cognitive/tasks/visualwm/fixtures/1.0.1-1.0.0.json'
import currentFixture from '../../modules/cognitive/tasks/visualwm/fixtures/1.1.0-1.0.0.json'
import type { VisualwmConfig } from '../../modules/cognitive/schemas/visualwm.config'
import type { VisualwmTrial } from '../../modules/cognitive/schemas/visualwm.trial'

const legacy = executionEntries.find((entry) => entry.engineVersion === '1.0.1')!
const current = executionEntries.find((entry) => entry.engineVersion === '1.1.0')!

describe('visualwm 1.1.0 practice-only identity', () => {
  it('registers an independent config/report and preserves the old score, schema and metadata', () => {
    expect(legacy.score).toBe(scoreVisualwmV1)
    expect(current.score).toBe(legacy.score)
    expect(current.scoringVersion).toBe('1.0.0')
    expect(current.configSchema).toBe(legacy.configSchema)
    expect(current.trialSchema).toBe(legacy.trialSchema)
    expect(legacy.qualityDefinitions.interpretable.description).toBe('正确有效 RT 是否足够。')
    expect(current.qualityDefinitions.interpretable.description).toContain('包括正确和错误作答')
    const oldSeed = seeds.find((seed) => seed.engineVersion === '1.0.1')!
    const newSeed = seeds.find((seed) => seed.engineVersion === '1.1.0')!
    expect(oldSeed.configVersion).toBe('1.0.1')
    expect(oldSeed.config.report).toEqual({ reportVersion: '1.0.1', referenceMode: 'none' })
    expect(newSeed.configVersion).toBe('1.1.0')
    expect(newSeed.config.report).toEqual({ reportVersion: '1.1.0', referenceMode: 'none' })
    expect({ ...newSeed.config, report: oldSeed.config.report }).toEqual(oldSeed.config)
    expect(newSeed.config).not.toBe(oldSeed.config)
    expect(participantPresentations.map((p) => [p.engineVersion, p.presentationVersion])).toEqual([
      ['1.0.1', '1.0.1'], ['1.1.0', '1.1.0'],
    ])
  })

  it('replays the frozen formal fixtures through both identities without changing expected results', () => {
    expect(currentFixture.cases).toEqual(legacyFixture.cases)
    for (const entry of [legacy, current]) {
      for (const fixture of currentFixture.cases) {
        const input = fixture.input as { config: VisualwmConfig; trials: { trialIndex: number; payload: VisualwmTrial }[]; randomSeed: string }
        if ('expectedError' in fixture) expect(() => entry.score(input)).toThrow(fixture.expectedError)
        else expect(entry.score(input)).toEqual(fixture.expected)
      }
    }
  })

  it('keeps all planned trials in accuracy, conditionally answered trials in H/FA, and wrong RTs in the median', () => {
    const input = structuredClone(currentFixture.cases[0].input) as {
      config: VisualwmConfig; trials: { trialIndex: number; payload: VisualwmTrial }[]; randomSeed: string
    }
    input.trials[0].payload.rtMs = 200
    input.trials[1].payload.response = 'change' // incorrect same-condition response
    input.trials[1].payload.rtMs = 600
    input.trials[2].payload.interrupted = true
    input.trials[3].payload.response = null
    input.trials[3].payload.rtMs = null
    const result = current.score(input)
    expect(result).toEqual(legacy.score(input))
    expect(result.metrics).toEqual({ accuracy: 0.25, hitRate: 1, falseAlarmRate: 1, medianRtMs: 400, correctCount: 1 })
    expect(result.qualityFlags).toEqual({ interpretable: true, insufficientValidRt: false, lowAccuracy: true, interrupted: true })
  })
})
