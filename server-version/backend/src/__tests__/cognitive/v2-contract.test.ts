import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import {
  assertProtocolSignature,
  assertTaskCanPublish,
  assertTaskContractValid,
  buildQualityAssessment,
  computeConfigSnapshotHash,
  computeProtocolSignature,
  createTrialEnvelope,
  projectThreeLayerReport,
  runAuthoritativeScorer,
  trialEnvelopeSchema,
  validateTaskDefinition,
  type TaskDefinition,
} from '../../modules/cognitive/v2'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import {
  prepareAuthoritativeScorerContext,
  runPreparedAuthoritativeScorer,
} from '../../modules/cognitive/v2/authoritative-scorer'

const protocol = {
  schemaVersion: 1 as const,
  key: 'fixture-protocol',
  version: '1.0.0',
  clock: 'performance' as const,
  randomizationAlgorithmVersion: 'fixture-v1',
  trialEnvelopeVersion: 1 as const,
  phases: [{ key: 'test' as const, persists: true, required: true }],
  measurementCriticalConfigPaths: ['trialCount'],
}

const definition = (): TaskDefinition<{ trialCount: number }, { correct: boolean }> => ({
  schemaVersion: 1,
  testType: 'fixture',
  name: 'Fixture task',
  category: 'framework',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: z.object({ trialCount: z.number().int().positive() }).strict(),
  trialSchema: z.object({ correct: z.boolean() }).strict(),
  protocol,
  scorer: ({ trials }) => ({
    metrics: { accuracy: trials.filter((trial) => trial.payload.correct).length / trials.length },
    quality: buildQualityAssessment({
      flags: { insufficientTrials: trials.length < 2 },
      definitions: {
        insufficientTrials: { key: 'insufficientTrials', label: '试次不足', description: '试次不足。', effect: 'limited' },
      },
    }),
    audit: { trialCount: trials.length, scorerVersion: '1.0.0' },
  }),
  finalSubmission: { maxTrials: (config) => config.trialCount },
  profiles: {
    experience: { estimatedMinutes: [1, 1], configPatch: {}, reportCaveats: [] },
    standard: { estimatedMinutes: [2, 3], configPatch: {}, reportCaveats: [] },
    research: { estimatedMinutes: [3, 4], configPatch: {}, reportCaveats: [] },
  },
  metrics: {
    accuracy: {
      key: 'accuracy', label: '正确率', category: 'accuracy', construct: 'accuracy', description: '正确率',
      unit: 'ratio', valueType: 'number', direction: 'higher_is_better', visibility: 'headline', role: 'primary',
      availableProfiles: ['experience', 'standard', 'research'], referenceEligible: false,
      export: { summary: true, label: '正确率' },
    },
    userAccuracy: {
      key: 'userAccuracy', label: '用户正确率', category: 'accuracy', construct: 'accuracy', description: '用户正确率',
      unit: 'ratio', valueType: 'number', direction: 'higher_is_better', visibility: 'user', role: 'primary',
      availableProfiles: ['experience', 'standard', 'research'], referenceEligible: false,
      export: { summary: true, label: '用户正确率' },
    },
    detailAccuracy: {
      key: 'detailAccuracy', label: '详情正确率', category: 'accuracy', construct: 'accuracy', description: '详情正确率',
      unit: 'ratio', valueType: 'number', direction: 'higher_is_better', visibility: 'detail', role: 'secondary',
      availableProfiles: ['experience', 'standard', 'research'], referenceEligible: false,
      export: { summary: false, label: '详情正确率' },
    },
  },
  quality: {
    insufficientTrials: { key: 'insufficientTrials', label: '试次不足', description: '试次不足。', effect: 'limited' },
  },
  references: [],
  report: {
    schemaVersion: 1,
    version: '1.0.0',
    title: 'Fixture task',
    headlineMetrics: ['accuracy'],
    userMetrics: ['userAccuracy'],
    detailMetrics: ['detailAccuracy'],
    disclaimer: '仅用于测试。',
    practicalTips: [],
  },
  publication: { status: 'PUBLISHED', referenceRequired: false, evidenceNote: 'fixture' },
})

const snapshot = () => ({
  schemaVersion: 1 as const,
  frozenAt: '2026-08-27T00:00:00.000Z',
  testType: 'fixture',
  configVersion: '1.0.0',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: { trialCount: 1 },
  configHash: computeConfigSnapshotHash({ trialCount: 1 }),
  protocol,
  protocolSignature: computeProtocolSignature(protocol),
})

describe('Cognitive Assessment v2 contracts', () => {
  it('uses canonical JSON so protocol signatures are stable and sensitive to measurement changes', () => {
    expect(computeProtocolSignature(protocol)).toBe(computeProtocolSignature({ ...protocol, phases: [...protocol.phases] }))
    expect(computeProtocolSignature(protocol)).not.toBe(computeProtocolSignature({ ...protocol, version: '1.0.1' }))
    expect(() => assertProtocolSignature({ protocol, protocolSignature: 'bad' })).toThrow(/protocolSignature/)
  })

  it('accepts a performance-clock envelope and rejects clock inconsistencies or unknown fields', () => {
    const envelope = createTrialEnvelope({
      trialIndex: 0,
      phase: 'test',
      payload: { correct: true },
      startedAtPerfMs: 100,
      endedAtPerfMs: 250,
    })
    expect(trialEnvelopeSchema.safeParse(envelope).success).toBe(true)
    expect(trialEnvelopeSchema.safeParse({ ...envelope, durationMs: 99 }).success).toBe(false)
    expect(trialEnvelopeSchema.safeParse({ ...envelope, clientScore: 1 }).success).toBe(false)
  })

  it('derives limited before invalid and never accepts client scoring fields through the task schema', () => {
    const invalid = buildQualityAssessment({
      flags: { insufficientTrials: true, corruptedPayload: true },
      definitions: {
        insufficientTrials: { key: 'insufficientTrials', label: '试次不足', description: '试次不足。', effect: 'limited' },
        corruptedPayload: { key: 'corruptedPayload', label: '数据损坏', description: '数据损坏。', effect: 'invalid' },
      },
    })
    expect(invalid.state).toBe('invalid')

    const result = runAuthoritativeScorer({
      definition: definition(),
      session: snapshot(),
      trials: [createTrialEnvelope({ trialIndex: 0, phase: 'test', payload: { correct: true }, startedAtPerfMs: 0, endedAtPerfMs: 10 })],
      randomSeed: 'fixture-seed',
    })
    expect(result.audit.trialCount).toBe(1)
    expect(result.quality.state).toBe('limited')
    expect(() => runAuthoritativeScorer({
      definition: definition(),
      session: snapshot(),
      trials: [createTrialEnvelope({ trialIndex: 0, phase: 'test', payload: { correct: true, score: 100 } as never, startedAtPerfMs: 0, endedAtPerfMs: 10 })],
      randomSeed: 'fixture-seed',
    })).toThrow()

    const preparedDefinition = definition()
    const preparedSnapshot = snapshot()
    const preparedTrials = [
      createTrialEnvelope({
        trialIndex: 0,
        phase: 'test',
        payload: preparedDefinition.trialSchema.parse({ correct: true }),
        startedAtPerfMs: 0,
        endedAtPerfMs: 10,
      }),
    ]
    const prepared = prepareAuthoritativeScorerContext({
      definition: preparedDefinition,
      session: preparedSnapshot,
      config: preparedDefinition.configSchema.parse(preparedSnapshot.config),
      trials: preparedTrials,
      randomSeed: 'fixture-seed',
    })
    expect(runPreparedAuthoritativeScorer(prepared)).toEqual(result)
    expect(() => runPreparedAuthoritativeScorer({
      definition: preparedDefinition,
      session: preparedSnapshot,
      config: preparedSnapshot.config,
      trials: preparedTrials,
      randomSeed: 'fixture-seed',
    } as never)).toThrow(/trusted preparation boundary/)
  })

  it('projects headline, user, and detail layers without exposing invalid quantitative results', () => {
    const task = definition()
    const score = {
      metrics: { accuracy: 0.75, userAccuracy: 0.75, detailAccuracy: 0.75 },
      quality: { state: 'interpretable' as const, flags: {}, reasons: [] },
      audit: { trialCount: 2, scorerVersion: '1.0.0' },
    }
    const report = projectThreeLayerReport({
      testType: task.testType,
      configVersion: '1.0.0',
      protocolSignature: computeProtocolSignature(protocol),
      engineVersion: task.engineVersion,
      scoringVersion: task.scoringVersion,
      profile: 'standard',
      definition: task.report,
      metrics: score.metrics,
      score,
      metricDefinitions: task.metrics,
      qualityDefinitions: task.quality,
    })
    expect(report.headline.map((metric) => metric.key)).toEqual(['accuracy'])
    expect(report.user.map((metric) => metric.key)).toEqual(['userAccuracy'])
    expect(report.detail.map((metric) => metric.key)).toEqual(['detailAccuracy'])
    expect(report.method.protocolSignature).toBe(computeProtocolSignature(protocol))

    const invalidReport = projectThreeLayerReport({
      testType: task.testType,
      configVersion: '1.0.0',
      protocolSignature: computeProtocolSignature(protocol),
      engineVersion: task.engineVersion,
      scoringVersion: task.scoringVersion,
      profile: 'standard',
      definition: task.report,
      metrics: score.metrics,
      score: { ...score, quality: { state: 'invalid', flags: { corruptedPayload: true }, reasons: ['数据损坏'] } },
      metricDefinitions: task.metrics,
      qualityDefinitions: { corruptedPayload: { key: 'corruptedPayload', label: '数据损坏', description: '数据损坏', effect: 'invalid' } },
    })
    expect(invalidReport.headline).toEqual([])
    expect(invalidReport.detail).toEqual([])
  })

  it('reports publication contract errors instead of silently accepting incomplete definitions', () => {
    const task = definition()
    task.report = { ...task.report, userMetrics: ['unknown'] }
    const issues = validateTaskDefinition(task)
    expect(issues.some((candidate) => candidate.path === 'report.unknown')).toBe(true)
  })

  it('keeps explicit eligibility independent from report role and rejects unsafe eligible metrics', () => {
    const task = definition()
    expect(validateTaskDefinition(task).filter((candidate) => candidate.severity === 'error')).toEqual([])
    expect(task.metrics.accuracy.referenceEligible).toBe(false)

    const objectEligible = {
      ...task,
      metrics: { ...task.metrics, detailAccuracy: { ...task.metrics.detailAccuracy, valueType: 'object' as const, referenceEligible: true } },
    }
    expect(validateTaskDefinition(objectEligible).some((candidate) => candidate.path === 'metrics.detailAccuracy.valueType')).toBe(true)

    const qualityEligible = {
      ...task,
      metrics: { ...task.metrics, detailAccuracy: { ...task.metrics.detailAccuracy, role: 'quality' as const, referenceEligible: true } },
    }
    expect(validateTaskDefinition(qualityEligible).some((candidate) => candidate.path === 'metrics.detailAccuracy.role')).toBe(true)

    const researchOnlyEligible = {
      ...task,
      metrics: { ...task.metrics, detailAccuracy: { ...task.metrics.detailAccuracy, role: 'research_only' as const, referenceEligible: true } },
    }
    expect(validateTaskDefinition(researchOnlyEligible).some((candidate) => candidate.path === 'metrics.detailAccuracy.role')).toBe(true)
  })

  it('passes the explicit registry eligibility field through without deriving it from primary/report status', () => {
    expect(getCognitiveV2TaskDefinition('reaction', '1.0.0', '1.1.0')?.metrics).toMatchObject({
      medianRtMs: { referenceEligible: true },
      rtICV: { referenceEligible: true },
      missRate: { referenceEligible: false },
    })
    expect(getCognitiveV2TaskDefinition('nback', '1.0.0', '1.0.0')?.metrics).toMatchObject({
      dPrimeByN: { referenceEligible: false, valueType: 'object' },
      maxReliableN: { referenceEligible: false, valueType: 'integer' },
    })
  })

  it('requires exact measurement applicability on every Cognitive reference mapping', () => {
    const base = getCognitiveV2TaskDefinition('reaction', '1.0.0', '1.1.0')
    if (!base) throw new Error('reaction v1.1 definition missing')
    const mapping = {
      metricKey: 'medianRtMs',
      referenceVersion: 'beta-v1',
      referenceKind: 'normative_distribution' as const,
      evidenceLevel: 'literature_beta' as const,
      instrumentVersion: '1.0.0',
      scoringVersion: '1.1.0',
      direction: base.metrics.medianRtMs.direction,
    }
    const missingApplicability = validateTaskDefinition({ ...base, references: [mapping] })
    expect(missingApplicability).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'references.medianRtMs.profiles' }),
      expect.objectContaining({ path: 'references.medianRtMs.resolvedConfigHashes' }),
    ]))

    const exactApplicability = validateTaskDefinition({
      ...base,
      references: [{ ...mapping, profiles: ['standard'], resolvedConfigHashes: ['a'.repeat(64)] }],
    })
    expect(exactApplicability.filter((candidate) => candidate.severity === 'error')).toEqual([])
  })

  it('keeps structural release readiness independent from deprecated publication metadata', () => {
    const draft = { ...definition(), publication: { ...definition().publication, status: 'DRAFT' as const } }
    expect(() => assertTaskContractValid(draft)).not.toThrow()
    expect(() => assertTaskCanPublish(draft)).not.toThrow()

    const invalidRequiresFlag = {
      ...definition(),
      metrics: {
        ...definition().metrics,
        accuracy: { ...definition().metrics.accuracy, requiresQualityFlags: ['missingQualityFlag'] },
      },
    }
    expect(validateTaskDefinition(invalidRequiresFlag).some((candidate) => (
      candidate.path === 'metrics.accuracy.requiresQualityFlags.0'
    ))).toBe(true)
  })

  it('omits a metric from all user report layers while its declared quality gate is active', () => {
    const task = definition()
    task.metrics = {
      ...task.metrics,
      userAccuracy: { ...task.metrics.userAccuracy, requiresQualityFlags: ['insufficientTrials'] },
    }
    const report = projectThreeLayerReport({
      testType: task.testType,
      configVersion: '1.0.0',
      protocolSignature: computeProtocolSignature(protocol),
      engineVersion: task.engineVersion,
      scoringVersion: task.scoringVersion,
      profile: 'standard',
      definition: task.report,
      metrics: { accuracy: 0.75, userAccuracy: 0.75, detailAccuracy: 0.75 },
      score: {
        metrics: { accuracy: 0.75, userAccuracy: 0.75, detailAccuracy: 0.75 },
        quality: { state: 'limited', flags: { insufficientTrials: true }, reasons: ['试次不足'] },
        audit: { trialCount: 1, scorerVersion: '1.0.0' },
      },
      metricDefinitions: task.metrics,
      qualityDefinitions: task.quality,
    })
    expect(report.headline.map((metric) => metric.key)).toEqual(['accuracy'])
    expect(report.user).toEqual([])
    expect(report.detail.map((metric) => metric.key)).toEqual(['detailAccuracy'])
  })
})
