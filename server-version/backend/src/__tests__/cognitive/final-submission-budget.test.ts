import { describe, expect, it } from 'vitest'
import { COGNITIVE_SEEDS } from '../../../prisma/seeds/cognitive'
import { CognitiveServiceError } from '../../modules/cognitive/cognitive.errors'
import { FINAL_SUBMISSION_MAX_BYTES } from '../../services/instrumentFinalSubmit'
import {
  COGNITIVE_FINAL_ABSOLUTE_MAX_TRIALS,
  CognitiveFinalSubmissionConfigError,
  createSessionConfigSnapshot,
  createTrialEnvelope,
  getCognitiveV2TaskDefinition,
  resolveCognitiveFinalMaxTrials,
} from '../../modules/cognitive/v2'
import { validateAndNormalizeTrials } from '../../modules/cognitive/v2/trial-normalizer'

const profiles = ['standard', 'research'] as const

const expectedByTask = {
  reaction: { standard: 20, research: 60 },
  memory: { standard: 12, research: 14 },
  stroop: { standard: 40, research: 96 },
  gonogo: { standard: 120, research: 240 },
  cpt: { standard: 180, research: 360 },
  nback: { standard: 100, research: 360 },
  corsi: { standard: 12, research: 14 },
  sst: { standard: 96, research: 200 },
  taskswitch: { standard: 128, research: 256 },
  patterncompare: { standard: 1000, research: 1000 },
  flanker: { standard: 80, research: 160 },
  cardsort: { standard: 72, research: 144 },
  digitbackward: { standard: 12, research: 14 },
  picturesequence: { standard: 3, research: 4 },
  pairedassociate: { standard: 3, research: 5 },
  matrix: { standard: 16, research: 24 },
  mentalrotation: { standard: 40, research: 80 },
  tower: { standard: 10, research: 18 },
  trailmaking: { standard: 24, research: 48 },
  reversallearning: { standard: 120, research: 240 },
  bart: { standard: 30, research: 50 },
  wordlist: { standard: 3, research: 6 },
  lexicaldecision: { standard: 100, research: 200 },
  emotionrecognition: { standard: 60, research: 120 },
} as const

type RealTaskType = keyof typeof expectedByTask

const seedFor = (testType: RealTaskType | 'fake') => {
  const candidates = COGNITIVE_SEEDS.filter((seed) => seed.testType === testType)
  return candidates.find((seed) => seed.scoringVersion === '1.1.0') ?? candidates[0]
}

const definitionFor = (testType: RealTaskType | 'fake') => {
  const seed = seedFor(testType)
  if (!seed) throw new Error(`cognitive seed missing for ${testType}`)
  const definition = getCognitiveV2TaskDefinition(testType, seed.engineVersion, seed.scoringVersion)
  if (!definition) throw new Error(`cognitive definition missing for ${testType}`)
  return { seed, definition }
}

describe('Cognitive FINAL submission budget', () => {
  it.each(Object.keys(expectedByTask) as RealTaskType[])('resolves %s standard/research frozen maxima from the task contract', (testType) => {
    const { seed, definition } = definitionFor(testType)
    for (const profile of profiles) {
      const config = definition.configSchema.parse({
        ...seed.config,
        ...definition.profiles[profile].configPatch,
      })
      expect(definition.finalSubmission.maxTrials(config), `${testType}/${profile}`).toBe(expectedByTask[testType][profile])
      expect(resolveCognitiveFinalMaxTrials(definition, config), `${testType}/${profile}`).toBe(expectedByTask[testType][profile])
    }
  })

  it('rejects an oversized N-back configuration while it is being frozen', () => {
    const { seed, definition } = definitionFor('nback')
    const config = definition.configSchema.parse({
      ...seed.config,
      nLevels: [1, 2, 3],
      trialCountByN: [80, 80, 80],
      blockCountByN: [5, 5, 5],
    })
    expect(definition.finalSubmission.maxTrials(config)).toBe(1200)
    expect(() => resolveCognitiveFinalMaxTrials(definition, config)).toThrow(CognitiveFinalSubmissionConfigError)
    expect(() => createSessionConfigSnapshot({
      definition,
      configVersion: 'oversized-test-only',
      config,
    })).toThrowError('该认知任务配置超过最终提交试次数上限，请调整配置后再发布')

    try {
      createSessionConfigSnapshot({ definition, configVersion: 'oversized-test-only', config })
    } catch (error) {
      expect(error).toBeInstanceOf(CognitiveServiceError)
      expect((error as CognitiveServiceError).statusCode).toBe(400)
      return
    }
    throw new Error('expected oversized N-back configuration to be rejected')
  })

  it('accepts a fixed-count maximum and rejects max plus one before per-trial schema parsing', () => {
    const { definition } = definitionFor('fake')
    const trial = (trialIndex: number) => createTrialEnvelope({
      trialIndex,
      phase: 'test',
      payload: { correct: true, rtMs: 400 },
      startedAtPerfMs: trialIndex * 500,
      endedAtPerfMs: trialIndex * 500 + 400,
    })
    expect(validateAndNormalizeTrials({
      definition,
      values: [trial(0), trial(1), trial(2)],
      maxTrials: 3,
    })).toHaveLength(3)

    expect(() => validateAndNormalizeTrials({
      definition,
      values: [
        trial(0),
        trial(1),
        trial(2),
        { ...trial(3), payload: { correct: 'not-a-boolean' } },
      ],
      maxTrials: 3,
    })).toThrow('submitted trial count exceeds frozen task limit')
  })

  it('keeps the 1000-trial absolute ceiling and accepts early-stopped adaptive submissions', () => {
    const patternCompare = getCognitiveV2TaskDefinition('patterncompare', '1.0.0', '1.0.0')
    if (!patternCompare) throw new Error('patterncompare definition missing')
    expect(resolveCognitiveFinalMaxTrials(patternCompare, patternCompare.configSchema.parse({
      durationSec: 60,
      trialTimeoutMs: 2500,
      isiMs: 250,
      validRtFloorMs: 150,
      stimulusSetVersion: 'geometric-v1.0.0',
      report: { reportVersion: '1.0.0', referenceMode: 'none' },
    }))).toBe(COGNITIVE_FINAL_ABSOLUTE_MAX_TRIALS)
    expect(() => validateAndNormalizeTrials({
      definition: patternCompare,
      values: Array.from({ length: COGNITIVE_FINAL_ABSOLUTE_MAX_TRIALS + 1 }, () => null),
    })).toThrow('submitted trial count exceeds frozen task limit')

    const { seed, definition } = definitionFor('memory')
    const config = definition.configSchema.parse({
      ...seed.config,
      ...definition.profiles.standard.configPatch,
    })
    const maxTrials = resolveCognitiveFinalMaxTrials(definition, config)
    const trial = (trialIndex: number) => createTrialEnvelope({
      trialIndex,
      phase: 'test',
      payload: {
        length: 3,
        trialWithinLevel: trialIndex === 0 ? 1 : 2,
        sequence: [1, 2, 3],
        response: [1, 2, 3],
        responseDurationMs: 1000,
        interrupted: false,
      },
      startedAtPerfMs: trialIndex * 1000,
      endedAtPerfMs: trialIndex * 1000 + 900,
    })
    expect(maxTrials).toBe(12)
    expect(validateAndNormalizeTrials({
      definition,
      values: [trial(0), trial(1)],
      maxTrials,
    })).toHaveLength(2)
  })

  it('keeps the existing Cognitive FINAL byte budget unchanged', () => {
    expect(FINAL_SUBMISSION_MAX_BYTES.cognitive).toBe(1536 * 1024)
  })
})
