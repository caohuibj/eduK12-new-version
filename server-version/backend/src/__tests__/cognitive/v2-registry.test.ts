import { listNativeCognitiveTaskDefinitions } from '../../modules/cognitive/content-candidates/native-registry/definitions'
import { describe, expect, it } from 'vitest'
import { buildCognitiveV2TaskDefinition,getCognitiveV2TaskDefinition,listCognitiveV2TaskDefinitions,
  validateRegistryReferenceEligibility } from '../../modules/cognitive/v2/registry'
import { auditCognitiveV2Registry } from '../../modules/cognitive/v2/audit'
import { validateTaskDefinition } from '../../modules/cognitive/v2/publication-gate'
import { computeConfigSnapshotHash,computeProtocolSignature } from '../../modules/cognitive/v2/canonical'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { resolveCognitiveFinalMaxTrials } from '../../modules/cognitive/v2/final-submission-budget'
import { runAuthoritativeScorer } from '../../modules/cognitive/v2/authoritative-scorer'
import { listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'

describe('Cognitive v2 registry adapter', () => {
  it('preserves every legacy identity and adds only the explicit native task inventory', () => {
    const legacy = listCognitiveRegistryEntries()
    const definitions = listCognitiveV2TaskDefinitions()
    const native = listNativeCognitiveTaskDefinitions()
    expect(definitions).toHaveLength(legacy.length + native.length)
    expect(new Set(definitions.map((definition) => `${definition.testType}/${definition.engineVersion}/${definition.scoringVersion}`)).size)
      .toBe(legacy.length + native.length)
    for (const definition of definitions) {
      const errors = validateTaskDefinition(definition).filter((candidate) => candidate.severity === 'error')
      expect(errors, `${definition.testType}/${definition.scoringVersion}`).toEqual([])
      expect(definition.protocol.clock).toBe('performance')
    }
  })

  it('binds FINAL admission to every exact registry identity without a fixed inventory count', () => {
    const legacy = listCognitiveRegistryEntries()
    const definitions = listCognitiveV2TaskDefinitions()
    const legacyByKey = new Map(legacy.map((entry) => [
      `${entry.testType}/${entry.engineVersion}/${entry.scoringVersion}`,
      entry,
    ]))

    const native = listNativeCognitiveTaskDefinitions()
    expect(definitions).toHaveLength(legacy.length + native.length)
    for (const definition of definitions) {
      const entry = legacyByKey.get(`${definition.testType}/${definition.engineVersion}/${definition.scoringVersion}`)
      if (entry) {
        expect(typeof entry.finalSubmission.maxTrials).toBe('function')
        expect(definition.finalSubmission).toBe(entry.finalSubmission)
      } else {
        expect(native).toContain(definition)
        expect(typeof definition.finalSubmission.maxTrials).toBe('function')
      }
    }

    const audit = auditCognitiveV2Registry(definitions)
    expect(audit.registryCount).toBe(legacy.length + native.length)
    expect(audit.entries).toHaveLength(legacy.length + native.length)
    expect(audit.entries.every((entry) => entry.issues.every((issue) => issue.severity !== 'error'))).toBe(true)
  })

  it('separates product lifecycle from compatibility publication metadata and reference eligibility', () => {
    const definitions = listCognitiveV2TaskDefinitions()
    const entries = listCognitiveRegistryEntries()
    const compatibilityPublished = definitions.filter((definition) => definition.publication.status === 'PUBLISHED')
    const compatibilityDrafts = definitions.filter((definition) => definition.publication.status === 'DRAFT')
    const compatibilityRetired = definitions.filter((definition) => definition.publication.status === 'RETIRED')

    expect(compatibilityDrafts.map((definition) => definition.testType).sort()).toEqual([
      'fake', ...listNativeCognitiveTaskDefinitions().filter(definition => definition.publication.status === 'DRAFT').map(definition => definition.testType),
    ].sort())
    expect(compatibilityRetired.map((definition) => `${definition.testType}/${definition.engineVersion}/${definition.scoringVersion}`).sort()).toEqual([
      'memory/1.0.0/1.0.0',
      'reaction/1.0.0/1.0.0',
      'stroop/1.0.0/1.0.0',
    ])
    expect(compatibilityPublished.length + compatibilityDrafts.length + compatibilityRetired.length).toBe(definitions.length)

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
    expect(audit.status).toBe('PASS')
    expect(audit.registryCount).toBe(definitions.length)
    expect(audit.compatibilityPublishedCount).toBe(compatibilityPublished.length)
    expect(audit.compatibilityDraftCount).toBe(compatibilityDrafts.length)
    expect(audit.compatibilityRetiredCount).toBe(compatibilityRetired.length)
    expect(audit.publishedCount).toBe(audit.compatibilityPublishedCount)
    expect(audit.draftCount).toBe(audit.compatibilityDraftCount)
    expect(audit.retiredCount).toBe(audit.compatibilityRetiredCount)
  })

  it('keeps eligibility on exact RegistryEntry metadata and audits malformed allowlists', () => {
    const entries = listCognitiveRegistryEntries()
    expect(entries.length).toBeGreaterThan(0)
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

  it('fails audit on structural registry/definition drift rather than a hard-coded inventory size', () => {
    const definitions = listCognitiveV2TaskDefinitions()
    expect(definitions.length).toBeGreaterThan(1)
    const audit = auditCognitiveV2Registry(definitions.slice(1))
    expect(audit.status).toBe('FAIL')
    expect(audit.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'registry', message: expect.stringContaining('cardinality mismatch') }),
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
