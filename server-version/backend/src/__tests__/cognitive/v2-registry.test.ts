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
  validateRegistryReferenceEligibility,
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

  it('separates product lifecycle from recommendation and reference eligibility', () => {
    const definitions = listCognitiveV2TaskDefinitions()
    const entries = listCognitiveRegistryEntries()
    const published = definitions.filter((definition) => definition.publication.status === 'PUBLISHED')
    const drafts = definitions.filter((definition) => definition.publication.status === 'DRAFT')
    const retired = definitions.filter((definition) => definition.publication.status === 'RETIRED')

    expect(published).toHaveLength(24)
    expect(drafts.map((definition) => definition.testType)).toEqual(['fake'])
    expect(retired.map((definition) => `${definition.testType}/${definition.engineVersion}/${definition.scoringVersion}`).sort()).toEqual([
      'memory/1.0.0/1.0.0',
      'reaction/1.0.0/1.0.0',
      'stroop/1.0.0/1.0.0',
    ])

    const expectedEligible = entries.reduce((count, entry) => (
      count + (Array.isArray(entry.referenceEligibleMetricKeys) ? entry.referenceEligibleMetricKeys.length : 0)
    ), 0)
    const actualEligible = definitions.reduce((count, definition) => (
      count + Object.values(definition.metrics).filter((metric) => metric.referenceEligible).length
    ), 0)
    expect(actualEligible).toBe(expectedEligible)

    expect(getCognitiveV2TaskDefinition('nback', '1.0.0', '1.0.0')?.metrics.dPrimeByN.referenceEligible).toBe(false)
    expect(getCognitiveV2TaskDefinition('nback', '1.0.0', '1.0.0')?.metrics.maxReliableN.referenceEligible).toBe(false)

    const audit = auditCognitiveV2Registry(definitions)
    expect(audit).toMatchObject({ status: 'PASS', registryCount: 28, publishedCount: 24, draftCount: 1, retiredCount: 3 })
    expect(audit.entries).toHaveLength(28)
  })

  it('keeps eligibility on exact RegistryEntry metadata and audits malformed allowlists', () => {
    const entries = listCognitiveRegistryEntries()
    expect(entries).toHaveLength(28)
    expect(entries.every((entry) => Array.isArray(entry.referenceEligibleMetricKeys))).toBe(true)
    expect(entries.every((entry) => Object.values(entry.metricDefinitions)
      .every((metric) => !Object.prototype.hasOwnProperty.call(metric, 'referenceEligible')))).toBe(true)

    const reaction = entries.find((entry) => entry.testType === 'reaction' && entry.scoringVersion === '1.1.0')
    if (!reaction) throw new Error('reaction v1.1 registry entry missing')
    expect(validateRegistryReferenceEligibility({
      ...reaction,
      referenceEligibleMetricKeys: ['medianRtMs', 'medianRtMs'],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: 'duplicate eligible metric key: medianRtMs' }),
    ]))
    expect(validateRegistryReferenceEligibility({
      ...reaction,
      referenceEligibleMetricKeys: ['unknownMetric'],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: 'unknown eligible metric key: unknownMetric' }),
    ]))
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
