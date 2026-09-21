import { describe, expect, it } from 'vitest'
import { compileCognitiveRuntime } from '../../modules/assessment-runtime/compiler'
import { listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'
import { resolveCognitiveProtocolPresentation } from '../../modules/cognitive/protocol-presentation'
import {
  computeProtocolSignature,
  listCognitiveV2TaskDefinitions,
} from '../../modules/cognitive/v2'

const EXPECTED_EXACT_IDENTITIES = [
  'bart/1.0.0/1.0.0',
  'cardsort/1.0.0/1.0.0',
  'corsi/1.0.0/1.0.0',
  'cpt/1.0.0/1.0.0',
  'digitbackward/1.0.0/1.0.0',
  'emotionrecognition/1.0.0/1.0.0',
  'fake/1.0.0/1.0.0',
  'flanker/1.0.0/1.0.0',
  'gonogo/1.0.0/1.0.0',
  'lexicaldecision/1.0.0/1.0.0',
  'matrix/1.0.0/1.0.0',
  'memory/1.0.0/1.0.0',
  'memory/1.0.0/1.1.0',
  'mentalrotation/1.0.0/1.0.0',
  'nback/1.0.0/1.0.0',
  'pairedassociate/1.0.0/1.0.0',
  'patterncompare/1.0.0/1.0.0',
  'picturesequence/1.0.0/1.0.0',
  'reaction/1.0.0/1.0.0',
  'reaction/1.0.0/1.1.0',
  'reversallearning/1.0.0/1.0.0',
  'sst/1.0.0/1.0.0',
  'stroop/1.0.0/1.0.0',
  'stroop/1.0.0/1.1.0',
  'taskswitch/1.0.0/1.0.0',
  'tower/1.0.0/1.0.0',
  'trailmaking/1.0.0/1.0.0',
  'wordlist/1.0.0/1.0.0',
] as const

const exactIdentity = (input: {
  testType: string
  engineVersion: string
  scoringVersion: string
}) => `${input.testType}/${input.engineVersion}/${input.scoringVersion}`

describe('Cognitive onboarding compatibility baseline', () => {
  it('freezes the exact backend identity inventory before task-package migration', () => {
    const identities = listCognitiveRegistryEntries()
      .map(exactIdentity)
      .sort()

    expect(identities).toEqual(EXPECTED_EXACT_IDENTITIES)
  })

  it('freezes current profile availability so PR1 cannot leak PR2 optionality changes', () => {
    for (const entry of listCognitiveRegistryEntries()) {
      expect(Object.keys(entry.profiles).sort(), exactIdentity(entry)).toEqual([
        'experience',
        'research',
        'standard',
      ])
    }
  })

  it('keeps protocol and compiled-runtime identity deterministic for every exact identity', () => {
    const definitions = listCognitiveV2TaskDefinitions()
      .sort((left, right) => exactIdentity(left).localeCompare(exactIdentity(right)))

    expect(definitions.map(exactIdentity)).toEqual(EXPECTED_EXACT_IDENTITIES)

    for (const definition of definitions) {
      const firstProtocol = computeProtocolSignature(definition.protocol)
      const secondProtocol = computeProtocolSignature(definition.protocol)
      expect(firstProtocol, exactIdentity(definition)).toMatch(/^[0-9a-f]{64}$/)
      expect(secondProtocol, exactIdentity(definition)).toBe(firstProtocol)

      const firstRuntime = compileCognitiveRuntime({ definition })
      const secondRuntime = compileCognitiveRuntime({ definition })
      expect(secondRuntime.sourceDefinitionHash, exactIdentity(definition))
        .toBe(firstRuntime.sourceDefinitionHash)
      expect(secondRuntime.compiledRuntimeHash, exactIdentity(definition))
        .toBe(firstRuntime.compiledRuntimeHash)
    }
  })

  it('freezes the two reviewed publish-prep presentation identities present at the PR1 base', () => {
    expect(resolveCognitiveProtocolPresentation({
      testType: 'patterncompare',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      profile: 'standard',
    })).toMatchObject({ tier: 'PILOT', profileLabel: 'Pilot 版', showProductIndex: false })

    expect(resolveCognitiveProtocolPresentation({
      testType: 'patterncompare',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      profile: 'research',
    })).toMatchObject({ tier: 'RESEARCH_READY', profileLabel: 'Research Ready 版', showProductIndex: false })

    expect(resolveCognitiveProtocolPresentation({
      testType: 'flanker',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      profile: 'standard',
    })).toMatchObject({ tier: 'PILOT', profileLabel: 'Pilot 版', showProductIndex: false })

    expect(resolveCognitiveProtocolPresentation({
      testType: 'flanker',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      profile: 'research',
    })).toMatchObject({ tier: 'RESEARCH_READY', profileLabel: 'Research Ready 版', showProductIndex: false })
  })
})
