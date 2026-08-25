import { describe, expect, it } from 'vitest'
import { projectCompositeReport } from '../../modules/composite/composite-report.projector'

  const evidence = {
    id: 'evidence-1',
    sourceType: 'cognitive_metric' as const,
    sourceResultId: 'session-1',
  construct: 'sustained_attention' as const,
  facet: 'response_stability',
  metricKey: 'blockSlopeRt',
    value: { observed: 12, payloadEncrypted: 'must-not-leak' },
    payloadEncrypted: 'must-not-leak',
  role: 'primary' as const,
  interpretation: 'criterion' as const,
  directionClass: 'more_difficulty' as const,
  interpretable: true,
  qualityFlags: [],
    provenance: { slotKey: 'attention', testType: 'cpt', internal: 'hidden', payloadEncrypted: 'must-not-leak' },
}

const makeInput = () => {
  const unit: any = {
    itemId: 'item-1',
    type: 'COGNITIVE',
    kind: 'cognitive',
    label: '持续注意',
    sessionId: 'session-1',
    score: 88,
    metrics: { blockSlopeRt: 12 },
    qualityFlags: { interpretable: true },
    singleTaskReport: {
      testType: 'cpt',
      profile: 'research',
      profileLabel: '科研版',
      title: '持续注意',
      interpretable: true,
      qualityState: 'interpretable',
      qualityFlags: [],
      headline: { key: 'blockSlopeRt', label: '跨 block RT 斜率', value: 12, formatted: '12 ms' },
      productIndex: { label: '任务表现指数', value: 88 },
      primaryMetrics: [{ key: 'blockSlopeRt', label: '跨 block RT 斜率', value: 12, formatted: '12 ms' }],
      secondaryMetrics: [{ key: 'unknownResearchMetric', label: '未知科研指标', value: 99, formatted: '99' }],
      caveats: [],
      practicalTips: [],
      method: { testType: 'cpt', engineVersion: '1.0.0', scoringVersion: '1.0.0', configVersion: '1.0.0', profile: 'research' },
      disclaimer: '不是诊断',
      reference: null,
    },
  }
  Object.defineProperty(unit, '__frozenMetricDefinitions', {
    value: { blockSlopeRt: { role: 'research_only', availableProfiles: ['research'] } },
    enumerable: false,
  })
  return {
    report: {
      id: 'attempt-1',
      assessmentId: 'assessment-1',
      name: '综合测评',
      anonymousCode: null,
      completedAt: new Date('2026-08-25T00:00:00Z'),
      totalTime: 100,
      backgroundValues: [],
      unitReports: [unit, {
        itemId: 'scale-1',
        type: 'SCALE',
        kind: 'scale',
        scaleId: 'scale-definition-1',
        scaleCode: 'S1',
        label: '量表',
        scaleName: '量表',
        dimensionScores: [{ dimensionId: 'd1', rawScore: 99, normalizedScore: 88 }],
        feedback: {
          overall: '解释文本',
          dimensions: [{
            dimensionId: 'd1', dimensionCode: 'D1', dimensionName: '维度', score: 88,
            minScore: 0, maxScore: 100, level: 'high', interpretation: '解释', suggestions: ['建议'],
            payloadEncrypted: 'must-not-leak',
          }],
        },
        caveats: [],
        disclaimer: '不作诊断',
        completedAt: new Date('2026-08-25T00:30:00Z'),
        totalTime: 60,
        method: { reportDefinitionVersion: 'internal-version', payloadEncrypted: 'must-not-leak' },
      }],
      payloadEncrypted: 'must-not-leak',
    },
    packageSnapshot: {
      snapshotVersion: 1,
      packageKey: 'attention_stability_v1',
      packageVersion: '1.0.0',
      profile: 'research',
      packageDefinition: { name: '注意稳定性报告包' },
      analysisProtocolSnapshot: {},
    } as any,
    snapshot: {
      id: 'snapshot-1',
      attemptId: 'attempt-1',
      packageKey: 'attention_stability_v1',
      packageVersion: '1.0.0',
      analysisDefinitionVersion: '1.0.0',
      analysisVersion: 'analysis-1',
      reportSchemaVersion: 'schema-1',
      inputFingerprint: 'f'.repeat(64),
      generationReason: 'REANALYSIS' as const,
      generatedBy: 'admin-1',
      createdAt: new Date('2026-08-25T01:00:00Z'),
      payload: {
        packageKey: 'attention_stability_v1',
        packageVersion: '1.0.0',
        analysisProtocolKey: 'attention_stability_v1',
        analysisProtocolVersion: '1.0.0',
        profile: 'research',
        analysisVersion: 'analysis-1',
        reportSchemaVersion: 'schema-1',
        qualitySummary: { interpretableModules: 1, excludedModules: [], warnings: [], payloadEncrypted: 'must-not-leak' },
        evidence: [evidence],
        cognitiveDomains: [{
          domain: 'sustained_attention',
          label: '持续注意与稳定性',
          status: 'interpretable',
          consistency: 'not_applicable',
          evidence: [evidence],
          summary: '存在方向性证据。',
          strengths: [],
          watchItems: ['可观察线索'],
          caveats: ['限制'],
        }],
        crossSourceFindings: [],
        recommendations: [],
        limitations: ['不作诊断。'],
        provenance: { attemptId: 'attempt-1', sourceResultId: 'should-not-be-top-level', payloadEncrypted: 'must-not-leak' },
      },
    } as any,
  }
}

describe('PR9 composite report projector', () => {
  it('projects three audiences without leaking forbidden fields', () => {
    const input = makeInput()
    const participant = projectCompositeReport({ ...input, audience: 'participant' })
    const participantPackage = participant.packageReport
    expect(Object.keys(participantPackage).sort()).toEqual([
      'audience', 'packageName', 'packageKey', 'packageVersion', 'profile',
      'qualitySummary', 'cognitiveDomains', 'recommendations', 'limitations',
    ].sort())
    expect(participantPackage).not.toHaveProperty('evidence')
    expect(participantPackage).not.toHaveProperty('inputFingerprint')
    expect(participantPackage).not.toHaveProperty('provenance')
    expect(participant.unitReports[0]).not.toHaveProperty('score')
    expect(participant.unitReports[0]).not.toHaveProperty('metrics')
    expect(participant.unitReports[0]).not.toHaveProperty('sessionId')
    expect(participant.unitReports[0].singleTaskReport.primaryMetrics).toEqual([])
    expect(participant.unitReports[0].singleTaskReport.secondaryMetrics).toEqual([])
    expect(Object.keys(participant.unitReports[0]).sort()).toEqual([
      'finishedAt', 'itemId', 'kind', 'label', 'qualityState', 'singleTaskReport', 'testType', 'type',
    ].sort())
    expect(participant.unitReports[1]).toHaveProperty('dimensionScores')
    expect(participant.unitReports[1]).toHaveProperty('method')
    expect(participant.unitReports[1].dimensionScores[0]).toMatchObject({ rawScore: 99 })
    expect(JSON.stringify(participant.unitReports[1])).not.toContain('payloadEncrypted')

    const teacher = projectCompositeReport({ ...input, audience: 'teacher' })
    expect(teacher.packageReport).toMatchObject({
      audience: 'teacher',
      snapshotId: 'snapshot-1',
      generationReason: 'REANALYSIS',
    })
    expect(teacher.packageReport).not.toHaveProperty('inputFingerprint')
    expect(teacher.packageReport).not.toHaveProperty('provenance')
    expect(teacher.packageReport.sourceSummary[0]).not.toHaveProperty('sourceResultId')
    expect(teacher.packageReport.observationPrompts).toEqual(['可观察线索'])
    expect(Object.keys(teacher.packageReport).sort()).toEqual([
      'audience', 'cognitiveDomains', 'generationReason', 'limitations', 'observationPrompts',
      'packageKey', 'packageName', 'packageVersion', 'profile', 'qualityFlags', 'qualitySummary',
      'recommendations', 'snapshotCreatedAt', 'snapshotId', 'sourceSummary',
    ].sort())
    expect(Object.keys(teacher.packageReport.sourceSummary[0]).sort()).toEqual([
      'directionClass', 'facet', 'interpretable', 'qualityFlags', 'role', 'slotKey', 'taskType',
    ].sort())

    const researcher = projectCompositeReport({ ...input, audience: 'researcher' })
    expect(researcher.packageReport).toMatchObject({
      audience: 'researcher',
      inputFingerprint: 'f'.repeat(64),
      evidence: [{ id: 'evidence-1', sourceResultId: 'session-1' }],
      provenance: { sourceResultId: 'should-not-be-top-level' },
    })
    expect(researcher.packageReport.qualitySummary).toEqual({
      interpretableModules: 1,
      excludedModules: [],
      warnings: [],
    })
    expect(Object.keys(researcher.packageReport).sort()).toEqual([
      'analysisDefinitionVersion', 'analysisProtocolKey', 'analysisProtocolVersion', 'analysisVersion',
      'audience', 'cognitiveDomains', 'crossSourceFindings', 'evidence', 'generationReason',
      'inputFingerprint', 'limitations', 'packageKey', 'packageName', 'packageVersion', 'profile',
      'provenance', 'qualitySummary', 'recommendations', 'reportSchemaVersion', 'snapshotCreatedAt',
      'snapshotId',
    ].sort())
    expect(Object.keys(researcher.packageReport.evidence[0]).sort()).toEqual([
      'construct', 'directionClass', 'facet', 'id', 'interpretable', 'interpretation', 'metricKey',
      'provenance', 'qualityFlags', 'role', 'sourceResultId', 'sourceType', 'value',
    ].sort())
    expect(researcher.unitReports[0]).toMatchObject({ score: 88, metrics: { blockSlopeRt: 12 }, sessionId: 'session-1' })
    expect(researcher.unitReports[1]).toMatchObject({
      dimensionScores: [{ rawScore: 99 }],
      method: { reportDefinitionVersion: 'internal-version' },
    })
    expect(JSON.stringify(researcher.unitReports)).not.toContain('payloadEncrypted')
    expect(JSON.stringify(participant)).not.toContain('payloadEncrypted')
    expect(JSON.stringify(teacher)).not.toContain('payloadEncrypted')
    expect(JSON.stringify(researcher)).not.toContain('payloadEncrypted')
  })
})
