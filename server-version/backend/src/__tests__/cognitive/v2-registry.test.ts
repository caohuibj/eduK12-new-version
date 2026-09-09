import { describe, expect, it } from 'vitest'
import {
  buildCognitiveV2TaskDefinition,
  getCognitiveV2TaskDefinition,
  listCognitiveV2TaskDefinitions,
  auditCognitiveV2Registry,
  validateTaskDefinition,
  computeConfigSnapshotHash,
  computeProtocolSignature,
  createTrialEnvelope,
  resolveCognitiveFinalMaxTrials,
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

  it('binds FINAL admission to every exact registry identity', () => {
    const legacy = listCognitiveRegistryEntries()
    const definitions = listCognitiveV2TaskDefinitions()
    const legacyByKey = new Map(legacy.map((entry) => [
      `${entry.testType}/${entry.engineVersion}/${entry.scoringVersion}`,
      entry,
    ]))

    expect(legacy).toHaveLength(28)
    expect(definitions).toHaveLength(28)
    for (const definition of definitions) {
      const entry = legacyByKey.get(`${definition.testType}/${definition.engineVersion}/${definition.scoringVersion}`)
      expect(entry, `${definition.testType}/${definition.engineVersion}/${definition.scoringVersion}`).toBeDefined()
      expect(typeof entry?.finalSubmission.maxTrials).toBe('function')
      expect(definition.finalSubmission).toBe(entry?.finalSubmission)
    }

    const audit = auditCognitiveV2Registry(definitions)
    expect(audit.registryCount).toBe(28)
    expect(audit.entries.every((entry) => entry.issues.every((issue) => issue.severity !== 'error'))).toBe(true)
  })

  it('uses explicit fail-closed eligibility for the 28-identity audit', () => {
    const definitions = listCognitiveV2TaskDefinitions()
    const published = definitions.filter((definition) => definition.publication.status === 'PUBLISHED')
    const eligible = published.flatMap((definition) => Object.values(definition.metrics).filter((metric) => metric.referenceEligible))

    expect(published).toHaveLength(9)
    expect(eligible).toHaveLength(15)
    expect(definitions.filter((definition) => definition.publication.status === 'DRAFT')
      .every((definition) => Object.values(definition.metrics).every((metric) => metric.referenceEligible === false))).toBe(true)
    expect(getCognitiveV2TaskDefinition('nback', '1.0.0', '1.0.0')?.metrics.dPrimeByN.referenceEligible).toBe(false)
    expect(getCognitiveV2TaskDefinition('nback', '1.0.0', '1.0.0')?.metrics.maxReliableN.referenceEligible).toBe(false)

    const audit = auditCognitiveV2Registry(definitions)
    expect(audit).toMatchObject({ status: 'PASS', registryCount: 28, publishedCount: 9, draftCount: 19, retiredCount: 0 })
    expect(audit.entries).toHaveLength(28)
  })

  it('keeps same-test-type contracts independent across exact versions', () => {
    const legacy = listCognitiveRegistryEntries().find((entry) => entry.testType === 'fake')
    if (!legacy) throw new Error('fake registry entry missing')

    const firstContract = { maxTrials: () => 3 }
    const secondContract = { maxTrials: () => 7 }
    const first = buildCognitiveV2TaskDefinition({
      ...legacy,
      scoringVersion: '1.0.0-test',
      finalSubmission: firstContract,
    }, 'DRAFT')
    const second = buildCognitiveV2TaskDefinition({
      ...legacy,
      scoringVersion: '1.1.0-test',
      finalSubmission: secondContract,
    }, 'DRAFT')

    expect(first.testType).toBe(second.testType)
    expect(first.scoringVersion).not.toBe(second.scoringVersion)
    expect(first.finalSubmission).toBe(firstContract)
    expect(second.finalSubmission).toBe(secondContract)
    expect(resolveCognitiveFinalMaxTrials(first, {})).toBe(3)
    expect(resolveCognitiveFinalMaxTrials(second, {})).toBe(7)
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
