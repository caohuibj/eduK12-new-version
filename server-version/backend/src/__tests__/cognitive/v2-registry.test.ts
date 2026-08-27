import { describe, expect, it } from 'vitest'
import {
  buildCognitiveV2TaskDefinition,
  getCognitiveV2TaskDefinition,
  listCognitiveV2TaskDefinitions,
  validateTaskDefinition,
  computeConfigSnapshotHash,
  computeProtocolSignature,
  createTrialEnvelope,
  runAuthoritativeScorer,
} from '../../modules/cognitive/v2'
import { listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'

describe('Cognitive v2 registry adapter', () => {
  it('migrates every static cognitive registry entry without changing task inventory', () => {
    const legacy = listCognitiveRegistryEntries()
    const definitions = listCognitiveV2TaskDefinitions()
    expect(definitions).toHaveLength(legacy.length)
    expect(new Set(definitions.map((definition) => `${definition.testType}/${definition.engineVersion}/${definition.scoringVersion}`)).size)
      .toBe(legacy.length)
    for (const definition of definitions) {
      const errors = validateTaskDefinition(definition).filter((candidate) => candidate.severity === 'error')
      expect(errors, `${definition.testType}/${definition.scoringVersion}`).toEqual([])
      expect(definition.protocol.clock).toBe('performance')
    }
  })

  it('requires exact task versions and does not fall back to another scorer', () => {
    expect(getCognitiveV2TaskDefinition('reaction', '1.0.0', '1.1.0')?.scoringVersion).toBe('1.1.0')
    expect(getCognitiveV2TaskDefinition('reaction', '1.0.0', '9.9.9')).toBeUndefined()
  })

  it('adapts an existing pure scorer behind the v2 authoritative boundary', () => {
    const legacy = listCognitiveRegistryEntries().find((entry) => entry.testType === 'fake')
    if (!legacy) throw new Error('fake registry entry missing')
    const task = buildCognitiveV2TaskDefinition(legacy, 'DRAFT')
    const config = { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 }
    const session = {
      schemaVersion: 1 as const,
      frozenAt: '2026-08-27T00:00:00.000Z',
      testType: task.testType,
      configVersion: '1.0.0',
      engineVersion: task.engineVersion,
      scoringVersion: task.scoringVersion,
      config,
      configHash: computeConfigSnapshotHash(config),
      protocol: task.protocol,
      protocolSignature: computeProtocolSignature(task.protocol),
    }
    const result = runAuthoritativeScorer({
      definition: task,
      session,
      randomSeed: 'seed-for-test-only',
      trials: [0, 1, 2].map((trialIndex) => createTrialEnvelope({
        trialIndex,
        phase: 'test',
        payload: { correct: trialIndex !== 1, rtMs: 400 + trialIndex },
        startedAtPerfMs: trialIndex * 100,
        endedAtPerfMs: trialIndex * 100 + 50,
      })),
    })
    expect(result.metrics).toMatchObject({ trialCount: 3, correctCount: 2 })
    expect(result.audit).toEqual({ trialCount: 3, scorerVersion: '1.0.0' })
  })
})
