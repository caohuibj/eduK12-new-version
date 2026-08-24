import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)

import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import {
  encryptCognitivePayload,
  decryptCognitivePayload,
} from '../../modules/cognitive/cognitive.security'
import { freezeAssignmentProfile } from '../../modules/cognitive/profile-freeze'
import {
  buildFrozenReportPackageSnapshot,
  getAnalysisProtocolDefinition,
  getReportPackageDefinition,
  listCognitiveEvidenceMappingsForTask,
} from '../../modules/cognitive-analysis'
import {
  buildPackageAnalysisForAttempt,
  buildPackageAnalysisInputFingerprint,
  persistOrGetPackageAnalysisSnapshot,
  readCompletionPackageAnalysisSnapshot,
  type CompositeAnalysisSnapshotRow,
  type PackageAnalysisAttemptInput,
} from '../../modules/composite/composite-analysis-snapshot.service'

const reportNone = { reportVersion: '1.0.0', referenceMode: 'none' as const }

const baseConfigs: Record<string, Record<string, unknown>> = {
  reaction: {
    totalTrials: 20,
    foreperiodMinMs: 700,
    foreperiodMaxMs: 1500,
    timeoutMs: 2000,
    readyDurationMs: 1000,
    report: reportNone,
  },
  cpt: {
    totalTrials: 180,
    targetRatio: 0.2,
    blockCount: 3,
    stimulusMs: 500,
    isiMs: 1000,
    validRtFloorMs: 100,
    perseverationRtMs: 100,
    report: reportNone,
  },
  patterncompare: {
    durationSec: 60,
    trialTimeoutMs: 2500,
    isiMs: 250,
    validRtFloorMs: 150,
    stimulusSetVersion: 'geometric-v1.0.0',
    report: reportNone,
  },
}

const makePackageAttempt = (): PackageAnalysisAttemptInput => {
  const packageDefinition = getReportPackageDefinition('attention_stability_v1', '1.0.0')
  if (!packageDefinition) throw new Error('missing package fixture')
  const protocol = getAnalysisProtocolDefinition(
    packageDefinition.analysisProtocolKey,
    packageDefinition.analysisProtocolVersion,
  )
  if (!protocol) throw new Error('missing protocol fixture')

  const assignments = protocol.cognitiveSlots.map((slot) => {
    const entry = getCognitiveRegistryEntry(slot.testType, slot.engineVersion, slot.scoringVersion)
    if (!entry) throw new Error(`missing registry fixture ${slot.testType}`)
    const freeze = freezeAssignmentProfile({
      entry,
      baseConfig: baseConfigs[slot.testType],
      profile: 'standard',
    })
    return {
      slot,
      entry,
      freeze,
      assignment: {
        id: `assignment-${slot.key}`,
        profile: 'standard' as const,
        profileDefinitionVersion: freeze.profileDefinitionVersion,
        resolvedConfigSnapshotEncrypted: freeze.resolvedConfigSnapshotEncrypted,
        resolvedConfigHash: freeze.resolvedConfigHash,
        resolvedReportSnapshotEncrypted: freeze.resolvedReportSnapshotEncrypted,
        config: {
          testType: slot.testType,
          configVersion: slot.configVersion,
          engineVersion: slot.engineVersion,
          scoringVersion: slot.scoringVersion,
          status: 'PUBLISHED',
        },
      },
    }
  })
  const items = assignments.map(({ slot, assignment }) => ({
    id: `item-${slot.key}`,
    type: 'COGNITIVE',
    position: slot.position,
    required: true,
    cognitiveAssignment: assignment,
  }))
  const packageSnapshot = buildFrozenReportPackageSnapshot(
    packageDefinition,
    protocol,
    items,
  )

  const sessions = assignments.map(({ slot, entry, assignment }) => {
    const metrics: Record<string, unknown> = {}
    for (const mapping of listCognitiveEvidenceMappingsForTask(
      slot.testType,
      slot.engineVersion,
      slot.scoringVersion,
      protocol.evidenceMappingVersion,
    )) {
      const definition = entry.metricDefinitions[mapping.metricKey]
      if (!definition) throw new Error(`missing metric fixture ${mapping.metricKey}`)
      if (definition.valueType === 'object') metrics[mapping.metricKey] = { fixture: 1 }
      else if (definition.valueType === 'array') metrics[mapping.metricKey] = [1, null]
      else metrics[mapping.metricKey] = definition.valueType === 'integer' ? 1 : 1.25
    }
    return {
      id: `session-${slot.key}`,
      assignmentId: assignment.id,
      compositeItemId: `item-${slot.key}`,
      status: 'COMPLETED',
      testType: slot.testType,
      configVersion: slot.configVersion,
      engineVersion: slot.engineVersion,
      scoringVersion: slot.scoringVersion,
      configSnapshotEncrypted: assignment.resolvedConfigSnapshotEncrypted,
      scoreEncrypted: encryptCognitivePayload(1),
      metricsEncrypted: encryptCognitivePayload(metrics),
      qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: true }),
      attemptNo: 1,
    }
  })

  return {
    id: 'attempt-1',
    compositeAssessmentId: 'composite-1',
    compositeAssessment: {
      reportPackageKey: packageDefinition.key,
      reportPackageVersion: packageDefinition.version,
      reportPackageProfile: 'standard',
      reportPackageSnapshotEncrypted: encryptCognitivePayload(packageSnapshot),
      items,
    },
    cognitiveSessions: sessions,
  }
}

const minimalAnalysis = (overrides: Record<string, unknown> = {}) => ({
  packageKey: 'attention_stability_v1',
  packageVersion: '1.0.0',
  analysisProtocolKey: 'attention_stability_v1',
  analysisProtocolVersion: '1.0.0',
  profile: 'standard',
  analysisVersion: 'cognitive-evidence-domain-v1.0.0',
  reportSchemaVersion: 'cognitive-package-analysis-v1',
  qualitySummary: { interpretableModules: 0, excludedModules: [], warnings: [] },
  evidence: [],
  cognitiveDomains: [],
  crossSourceFindings: [],
  recommendations: [],
  limitations: [],
  provenance: {
    attemptId: 'attempt-1',
    assessmentId: 'composite-1',
    packageKey: 'attention_stability_v1',
    packageVersion: '1.0.0',
    packageSnapshotVersion: '1',
    analysisProtocolKey: 'attention_stability_v1',
    analysisProtocolVersion: '1.0.0',
    analysisProtocolSnapshotVersion: '1',
    profile: 'standard',
    packageReportDefinitionVersion: 'report-package-v1',
    domainDefinitionVersion: '1.0.0',
    evidenceMappingVersion: '1.0.0',
    recommendationRuleVersion: '1.0.0',
  },
  ...overrides,
})

const snapshotExpectation = {
  attemptId: 'attempt-1',
  assessmentId: 'composite-1',
  packageKey: 'attention_stability_v1',
  packageVersion: '1.0.0',
  profile: 'standard',
  packageSnapshotVersion: '1',
  analysisProtocolKey: 'attention_stability_v1',
  analysisProtocolVersion: '1.0.0',
  analysisProtocolSnapshotVersion: '1',
  packageReportDefinitionVersion: 'report-package-v1',
  domainDefinitionVersion: '1.0.0',
  evidenceMappingVersion: '1.0.0',
  recommendationRuleVersion: '1.0.0',
}

describe('PR8 package analysis snapshot service', () => {
  let attempt: PackageAnalysisAttemptInput

  beforeEach(() => {
    attempt = makePackageAttempt()
  })

  it('builds a frozen PR7 input without reading raw trials', () => {
    const built = buildPackageAnalysisForAttempt(attempt)
    expect(built?.analysis.packageKey).toBe('attention_stability_v1')
    expect(built?.moduleResults).toHaveLength(3)
    expect(built?.moduleResults[0]).toMatchObject({
      sourceResultId: expect.stringContaining('session-'),
      profile: 'standard',
    })

    const collectionOnly = {
      ...attempt,
      compositeAssessment: {
        ...attempt.compositeAssessment,
        reportPackageKey: null,
        reportPackageVersion: null,
        reportPackageProfile: null,
        reportPackageSnapshotEncrypted: null,
      },
    }
    expect(buildPackageAnalysisForAttempt(collectionOnly)).toBeNull()
  })

  it('hashes canonical plaintext semantics independent of module/object order', () => {
    const built = buildPackageAnalysisForAttempt(attempt)
    if (!built) throw new Error('missing package fixture')
    const reversed = [...built.moduleResults].reverse().map((result) => ({
      ...result,
      metrics: Object.fromEntries(Object.entries(result.metrics).reverse()),
      qualityFlags: Object.fromEntries(Object.entries(result.qualityFlags).reverse()),
    }))
    const first = buildPackageAnalysisInputFingerprint({
      packageSnapshot: built.packageSnapshot,
      moduleResults: built.moduleResults,
      analysisVersion: built.analysis.analysisVersion,
      reportSchemaVersion: built.analysis.reportSchemaVersion,
    })
    const second = buildPackageAnalysisInputFingerprint({
      packageSnapshot: built.packageSnapshot,
      moduleResults: reversed,
      analysisVersion: built.analysis.analysisVersion,
      reportSchemaVersion: built.analysis.reportSchemaVersion,
    })
    expect(second).toBe(first)

    const changed = reversed.map((result, index) => index === 0
      ? { ...result, metrics: { ...result.metrics, changedMetric: 0 } }
      : result)
    expect(buildPackageAnalysisInputFingerprint({
      packageSnapshot: built.packageSnapshot,
      moduleResults: changed,
      analysisVersion: built.analysis.analysisVersion,
      reportSchemaVersion: built.analysis.reportSchemaVersion,
    })).not.toBe(first)
  })

  it('uses the composite unique key and leaves immutable rows unchanged on retry', async () => {
    const built = buildPackageAnalysisForAttempt(attempt)
    if (!built) throw new Error('missing package fixture')
    const rows = new Map<string, CompositeAnalysisSnapshotRow>()
    const uniqueKey = (args: any) => JSON.stringify(args.where)
    const findUnique = vi.fn(async ({ where }: any) => rows.get(uniqueKey({ where })) ?? null)
    const upsert = vi.fn(async (args: any) => {
      const existing = rows.get(uniqueKey(args))
      if (existing) return existing
      const row = {
        id: `snapshot-${rows.size + 1}`,
        ...args.create,
        createdAt: new Date('2026-08-24T13:00:00Z'),
      }
      rows.set(uniqueKey(args), row)
      return row
    })
    const db = { compositeAnalysisSnapshot: { findUnique, upsert, findFirst: vi.fn() } }

    const first = await persistOrGetPackageAnalysisSnapshot(db, {
      attemptId: attempt.id,
      analysis: built.analysis,
      inputFingerprint: built.inputFingerprint,
      generationReason: 'COMPLETION',
    })
    expect(first.row.id).toBe('snapshot-1')
    expect(first.created).toBe(true)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        attemptId_analysisVersion_inputFingerprint: {
          attemptId: 'attempt-1',
          analysisVersion: 'cognitive-evidence-domain-v1.0.0',
          inputFingerprint: built.inputFingerprint,
        },
      },
      update: {},
    }))
    const payloadCipher = upsert.mock.calls[0][0].create.payloadEncrypted
    expect(decryptCognitivePayload(payloadCipher)).toEqual(built.analysis)
    expect(payloadCipher).not.toContain('session-reaction')

    const retry = await persistOrGetPackageAnalysisSnapshot(db, {
      attemptId: attempt.id,
      analysis: built.analysis,
      inputFingerprint: built.inputFingerprint,
      generationReason: 'REANALYSIS',
      generatedBy: 'admin-1',
    })
    expect(retry).toMatchObject({ row: { id: 'snapshot-1' }, created: false })
    expect(upsert).toHaveBeenCalledTimes(1)

    const changed = await persistOrGetPackageAnalysisSnapshot(db, {
      attemptId: attempt.id,
      analysis: built.analysis,
      inputFingerprint: 'd'.repeat(64),
      generationReason: 'REANALYSIS',
      generatedBy: 'admin-1',
    })
    expect(changed).toMatchObject({
      row: { id: 'snapshot-2', generationReason: 'REANALYSIS', generatedBy: 'admin-1' },
      created: true,
    })
    expect(upsert).toHaveBeenCalledTimes(2)
  })

  it('reads the earliest completion row and rejects payload metadata drift', async () => {
    const payload = minimalAnalysis()
    const row: CompositeAnalysisSnapshotRow = {
      id: 'snapshot-1',
      attemptId: 'attempt-1',
      packageKey: 'attention_stability_v1',
      packageVersion: '1.0.0',
      analysisDefinitionVersion: '1.0.0',
      analysisVersion: 'cognitive-evidence-domain-v1.0.0',
      reportSchemaVersion: 'cognitive-package-analysis-v1',
      inputFingerprint: 'f'.repeat(64),
      generationReason: 'COMPLETION',
      generatedBy: null,
      payloadEncrypted: encryptCognitivePayload(payload),
      createdAt: new Date('2026-08-24T13:00:00Z'),
    }
    const findFirst = vi.fn().mockResolvedValue(row)
    const snapshot = await readCompletionPackageAnalysisSnapshot({
      compositeAnalysisSnapshot: { findUnique: vi.fn(), upsert: vi.fn(), findFirst },
    }, 'attempt-1', snapshotExpectation)
    expect(snapshot?.payload.packageKey).toBe('attention_stability_v1')
    expect(findFirst).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1', generationReason: 'COMPLETION' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    expect(snapshot).not.toHaveProperty('payloadEncrypted')

    const badRow = { ...row, payloadEncrypted: encryptCognitivePayload(minimalAnalysis({ packageVersion: '9.9.9' })) }
    findFirst.mockResolvedValueOnce(badRow)
    await expect(readCompletionPackageAnalysisSnapshot({
      compositeAnalysisSnapshot: { findUnique: vi.fn(), upsert: vi.fn(), findFirst },
    }, 'attempt-1', snapshotExpectation)).rejects.toThrow('版本元数据不匹配')

    const badDefinitionRow = { ...row, analysisDefinitionVersion: '9.9.9' }
    findFirst.mockResolvedValueOnce(badDefinitionRow)
    await expect(readCompletionPackageAnalysisSnapshot({
      compositeAnalysisSnapshot: { findUnique: vi.fn(), upsert: vi.fn(), findFirst },
    }, 'attempt-1', snapshotExpectation)).rejects.toThrow('版本元数据不匹配')

    const copiedRow = {
      ...row,
      payloadEncrypted: encryptCognitivePayload(minimalAnalysis({
        provenance: { ...snapshotExpectation, packageSnapshotVersion: '1' },
      })),
    }
    findFirst.mockResolvedValueOnce(copiedRow)
    await expect(readCompletionPackageAnalysisSnapshot({
      compositeAnalysisSnapshot: { findUnique: vi.fn(), upsert: vi.fn(), findFirst },
    }, 'attempt-1', { ...snapshotExpectation, assessmentId: 'other-assessment' }))
      .rejects.toThrow(/provenance 元数据不匹配/)

    findFirst.mockResolvedValueOnce({
      ...row,
      payloadEncrypted: encryptCognitivePayload(minimalAnalysis({ provenance: {} })),
    })
    await expect(readCompletionPackageAnalysisSnapshot({
      compositeAnalysisSnapshot: { findUnique: vi.fn(), upsert: vi.fn(), findFirst },
    }, 'attempt-1', snapshotExpectation)).rejects.toThrow(/provenance 缺少有效字段/)
  })

  it('does not let a retired live config invalidate frozen package history', () => {
    const retired = {
      ...attempt,
      compositeAssessment: {
        ...attempt.compositeAssessment,
        items: attempt.compositeAssessment.items.map((item) => ({
          ...item,
          cognitiveAssignment: item.cognitiveAssignment
            ? { ...item.cognitiveAssignment, config: { ...item.cognitiveAssignment.config, status: 'RETIRED' } }
            : item.cognitiveAssignment,
        })),
      },
    }
    expect(buildPackageAnalysisForAttempt(retired)?.analysis.packageKey).toBe('attention_stability_v1')
  })

  it('rejects a session whose frozen config no longer matches the package input', () => {
    const broken = {
      ...attempt,
      cognitiveSessions: attempt.cognitiveSessions.map((session, index) => index === 0
        ? { ...session, configSnapshotEncrypted: encryptCognitivePayload({ forged: true }) }
        : session),
    }
    expect(() => buildPackageAnalysisForAttempt(broken)).toThrow(/Session 配置 hash 不匹配/)
  })

  it('does not fall back to an older completed Session behind a newer incomplete attempt', () => {
    const newerInProgress = {
      ...attempt.cognitiveSessions[0],
      id: 'session-reaction-retry',
      status: 'IN_PROGRESS',
      attemptNo: 2,
    }
    const broken = {
      ...attempt,
      cognitiveSessions: [newerInProgress, ...attempt.cognitiveSessions],
    }
    expect(() => buildPackageAnalysisForAttempt(broken)).toThrow(/Session 尚未完成/)
  })
})
