import { describe, expect, it } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)

import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { freezeAssignmentProfile } from '../../modules/cognitive/profile-freeze'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import {
  LEGACY_MULTISOURCE_ANALYSIS_VERSION,
  MULTISOURCE_ANALYSIS_VERSION,
  buildFrozenReportPackageSnapshot,
  buildPackageCognitiveAnalysis,
  getAnalysisProtocolDefinition,
  getReportPackageDefinition,
} from '../../modules/cognitive-analysis'
import {
  buildPackageAnalysisForAttempt,
  buildPackageAnalysisInputFingerprint,
  readCompletionPackageAnalysisSnapshot,
  type CompositeAnalysisSnapshotRow,
  type PackageAnalysisAttemptInput,
} from '../../modules/composite/composite-analysis-snapshot.service'
import { ADEXI_V2_DEFINITION } from '../../modules/scale/packages/adexi-v2'
import { buildScaleResult, parseScaleResultV2 } from '../../modules/scale/scale-result'

const completeAdexiResult = () => buildScaleResult({
  scaleId: 'scale-adexi',
  instrumentKey: 'adexi_v1',
  name: 'ADEXI',
  instrumentVersion: '2.0.0',
  definition: ADEXI_V2_DEFINITION,
  answers: ADEXI_V2_DEFINITION.items.map((item) => ({
    itemCode: item.itemCode,
    responseValue: 'sometimes',
  })),
})

const makeAttempt = (): PackageAnalysisAttemptInput => {
  const packageDefinition = getReportPackageDefinition('inhibitory_control_multisource_v1', '1.0.0')
  if (!packageDefinition) throw new Error('missing PR10 package')
  const protocol = getAnalysisProtocolDefinition(packageDefinition.key, packageDefinition.version)
  if (!protocol) throw new Error('missing PR10 protocol')
  const entry = getCognitiveRegistryEntry('gonogo', '1.0.0', '1.0.0')
  if (!entry) throw new Error('missing Go/No-Go registry entry')

  const freeze = freezeAssignmentProfile({
    entry,
    profile: 'standard',
    baseConfig: {
      totalTrials: 120,
      nogoRatio: 0.25,
      stimulusMs: 800,
      isiMs: 500,
      validRtFloorMs: 100,
      report: { reportVersion: '1.0.0', referenceMode: 'none' },
    },
  })
  const items = [
    {
      id: 'item-gonogo',
      type: 'COGNITIVE',
      position: 0,
      required: true,
      cognitiveAssignment: {
        id: 'assignment-gonogo',
        profile: 'standard' as const,
        profileDefinitionVersion: freeze.profileDefinitionVersion,
        resolvedConfigSnapshotEncrypted: freeze.resolvedConfigSnapshotEncrypted,
        resolvedConfigHash: freeze.resolvedConfigHash,
        resolvedReportSnapshotEncrypted: freeze.resolvedReportSnapshotEncrypted,
        config: {
          testType: 'gonogo',
          configVersion: '1.0.0',
          engineVersion: '1.0.0',
          scoringVersion: '1.0.0',
          status: 'PUBLISHED',
        },
      },
    },
    {
      id: 'item-adexi',
      type: 'SCALE',
      position: 1,
      required: true,
      scaleId: 'scale-adexi',
      scale: {
        id: 'scale-adexi',
        code: 'adexi_v1',
        name: 'ADEXI',
        description: 'draft fixture',
        status: 'PUBLISHED',
        visibility: 'HIDDEN',
        instrumentClass: 'STANDARD',
        instrumentVersion: '2.0.0',
        definition: structuredClone(ADEXI_V2_DEFINITION),
        config: { respondentType: 'participant_self_report' },
        estimatedTime: 5,
        instruction: 'self report',
        tags: ['ADEXI'],
        dimensions: [{
          id: 'dimension-inhibition',
          code: 'inhibition',
          name: '抑制',
          description: 'self-report inhibition',
          scoringMethod: 'sum',
          weight: 1,
          minScore: 1,
          maxScore: 5,
          levelFeedback: null,
        }],
        items: [{
          id: 'scale-item-1',
          itemCode: 'ADEXI-01',
          content: 'draft item',
          type: 'single',
          reverse: false,
          required: true,
          weight: 1,
          sortOrder: 0,
          options: [{ value: 1, label: '1' }],
          randomizeOptions: false,
          itemDimensions: [{ dimensionId: 'dimension-inhibition', weight: 1, reverse: false }],
        }],
      },
    },
  ]
  const packageSnapshot = buildFrozenReportPackageSnapshot(packageDefinition, protocol, items)

  return {
    id: 'attempt-pr10',
    compositeAssessmentId: 'composite-pr10',
    compositeAssessment: {
      reportPackageKey: packageDefinition.key,
      reportPackageVersion: packageDefinition.version,
      reportPackageProfile: 'standard',
      reportPackageSnapshotEncrypted: encryptCognitivePayload(packageSnapshot),
      items,
    },
    cognitiveSessions: [{
      id: 'session-gonogo',
      assignmentId: 'assignment-gonogo',
      compositeItemId: 'item-gonogo',
      status: 'COMPLETED',
      testType: 'gonogo',
      configVersion: '1.0.0',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      configSnapshotEncrypted: freeze.resolvedConfigSnapshotEncrypted,
      scoreEncrypted: encryptCognitivePayload(76),
      metricsEncrypted: encryptCognitivePayload({ commissionRate: 0.2, dPrime: 1.1 }),
      qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: true }),
      attemptNo: 1,
    }],
    scaleAssessments: [{
      id: 'assessment-adexi',
      compositeItemId: 'item-adexi',
      scaleId: 'scale-adexi',
      status: 'COMPLETED',
      result: completeAdexiResult(),
      completedAt: new Date('2026-08-25T00:00:00Z'),
    }],
  }
}

describe('PR10 multi-source package analysis', () => {
  it('combines Go/No-Go and ADEXI without an age or teacher-answering gate', () => {
    const built = buildPackageAnalysisForAttempt(makeAttempt())
    expect(built?.scaleResults).toHaveLength(1)
    expect(built?.analysis.analysisVersion).toBe(MULTISOURCE_ANALYSIS_VERSION)
    expect(built?.analysis.reportSchemaVersion).toBe('cognitive-package-analysis-v2')
    const scaleEvidence = built?.analysis.evidence.find((item) => item.sourceType === 'scale_dimension')
    expect(scaleEvidence).toMatchObject({
      construct: 'response_inhibition',
      facet: 'action_withholding',
      interpretation: 'self_report',
      directionClass: 'unknown',
      interpretable: true,
    })
    expect(built?.scaleResults[0]).toMatchObject({
      qualityState: 'interpretable',
      qualityFlags: { interpretable: true },
    })
    expect(built?.analysis.crossSourceFindings).toMatchObject([{
      construct: 'response_inhibition',
      type: 'paired_description',
      availability: 'available',
    }])
    expect(built?.packageSnapshot.analysisProtocolSnapshot.scaleMeasurements?.[0]).toMatchObject({
      slotKey: 'adexi_inhibition',
      scaleId: 'scale-adexi',
      scaleCode: 'adexi_v1',
      dimensionCode: 'inhibition',
      mappingVersion: '1.0.0',
      mappingDomain: 'response_inhibition',
      mappingFacet: 'action_withholding',
      mappingRole: 'primary',
      mappingDirectionClass: 'more_difficulty',
    })
    expect(built?.analysis.limitations.join(' ')).toContain('青少年或成人')
    expect(built?.analysis.limitations.join(' ')).not.toContain('不能用于成人')
    expect(JSON.stringify(built)).not.toContain('I have difficulty')
  })

  it('includes scale results in the canonical fingerprint', () => {
    const attempt = makeAttempt()
    const built = buildPackageAnalysisForAttempt(attempt)
    if (!built) throw new Error('missing PR10 analysis')
    const changed = [{ ...built.scaleResults[0], dimensionScore: 18 }]
    expect(buildPackageAnalysisInputFingerprint({
      packageSnapshot: built.packageSnapshot,
      moduleResults: built.moduleResults,
      scaleResults: changed,
      analysisVersion: built.analysis.analysisVersion,
      reportSchemaVersion: built.analysis.reportSchemaVersion,
    })).not.toBe(built.inputFingerprint)
  })

  it('uses the STANDARD code package as authority for the frozen scale definition', () => {
    const firstAttempt = makeAttempt()
    const secondAttempt = makeAttempt()
    const secondScale = secondAttempt.compositeAssessment.items[1]?.scale
    const secondScaleDefinition = secondScale?.definition as typeof ADEXI_V2_DEFINITION | undefined
    if (!secondScaleDefinition?.items?.[0]) throw new Error('missing scale definition fixture')
    secondScaleDefinition.items[0].content = 'changed draft item'

    const definition = getReportPackageDefinition('inhibitory_control_multisource_v1', '1.0.0')
    const protocol = definition && getAnalysisProtocolDefinition(definition.key, definition.version)
    if (!definition || !protocol) throw new Error('missing PR10 package')
    buildFrozenReportPackageSnapshot(definition, protocol, firstAttempt.compositeAssessment.items)
    expect(() => buildFrozenReportPackageSnapshot(definition, protocol, secondAttempt.compositeAssessment.items))
      .toThrow(/协议量表冻结内容不匹配/)
  })

  it('rejects a scale result that does not match the frozen scale measurement', () => {
    const built = buildPackageAnalysisForAttempt(makeAttempt())
    if (!built) throw new Error('missing PR10 analysis')
    expect(() => buildPackageCognitiveAnalysis({
      packageSnapshot: built.packageSnapshot,
      moduleResults: built.moduleResults,
      scaleResults: [{ ...built.scaleResults[0], scaleCode: 'other_scale' }],
    })).toThrow(/measurement 不匹配/)
  })

  it('preserves limited and invalid ScaleResultV2 quality in evidence and exclusions', () => {
    const limitedAttempt = makeAttempt()
    const limitedResult = limitedAttempt.scaleAssessments?.[0]?.result
    if (!limitedResult || typeof limitedResult !== 'object') throw new Error('missing scale result')
    const limitedScore = (limitedResult as {
      scores: Array<{ key: string; value: number | null; status: string }>
    }).scores.find((score) => score.key === 'inhibition')
    if (!limitedScore) throw new Error('missing inhibition score')
    limitedScore.status = 'limited'
    ;(limitedResult as { quality: unknown }).quality = { status: 'limited', flags: ['missing_items'] }
    const limited = buildPackageAnalysisForAttempt(limitedAttempt)
    expect(limited?.scaleResults[0]).toMatchObject({
      qualityState: 'limited',
      qualityFlags: { interpretable: false, missing_items: true },
    })
    expect(limited?.analysis.evidence.find((item) => item.sourceType === 'scale_dimension')).toMatchObject({
      interpretable: false,
      value: null,
      qualityFlags: ['missing_items'],
    })
    expect(limited?.analysis.qualitySummary.excludedModules).toContain('adexi_inhibition')

    const invalidAttempt = makeAttempt()
    const invalidResult = invalidAttempt.scaleAssessments?.[0]?.result
    if (!invalidResult || typeof invalidResult !== 'object') throw new Error('missing scale result')
    const invalidScore = (invalidResult as {
      scores: Array<{ key: string; value: number | null; status: string }>
    }).scores.find((score) => score.key === 'inhibition')
    if (!invalidScore) throw new Error('missing inhibition score')
    invalidScore.value = null
    invalidScore.status = 'not_calculable'
    ;(invalidResult as { quality: unknown }).quality = { status: 'invalid', flags: ['score_not_calculable'] }
    const invalid = buildPackageAnalysisForAttempt(invalidAttempt)
    expect(invalid?.scaleResults[0]).toMatchObject({
      qualityState: 'invalid',
      dimensionScore: null,
      qualityFlags: { interpretable: false, score_not_calculable: true },
    })
    expect(invalid?.analysis.qualitySummary.excludedModules).toContain('adexi_inhibition')
  })

  it('rejects ScaleResultV2 score and quality semantic contradictions', () => {
    const result = completeAdexiResult()
    const score = result.scores.find((candidate) => candidate.key === 'inhibition')
    if (!score) throw new Error('missing inhibition score')
    score.status = 'not_calculable'
    score.value = 17
    result.quality = { status: 'interpretable', flags: [] }

    expect(() => parseScaleResultV2(result)).toThrow(/not_calculable scores must have a null value/)
  })

  it('rejects malformed ScaleResultV2 and mismatched frozen provenance', () => {
    const malformedAttempt = makeAttempt()
    const malformed = malformedAttempt.scaleAssessments?.[0]
    if (!malformed) throw new Error('missing scale assessment')
    malformed.result = { schemaVersion: 2, scores: [{ key: 'inhibition', value: 17 }] }
    expect(() => buildPackageAnalysisForAttempt(malformedAttempt)).toThrow(/ScaleResultV2 格式无效/)

    const definitionHashAttempt = makeAttempt()
    const definitionHashResult = definitionHashAttempt.scaleAssessments?.[0]?.result
    if (!definitionHashResult || typeof definitionHashResult !== 'object') throw new Error('missing scale result')
    ;(definitionHashResult as { method: { definitionHash: string } }).method.definitionHash = '0'.repeat(64)
    expect(() => buildPackageAnalysisForAttempt(definitionHashAttempt)).toThrow(/provenance.*method\.definitionHash/)

    const scoringVersionAttempt = makeAttempt()
    const scoringVersionResult = scoringVersionAttempt.scaleAssessments?.[0]?.result
    if (!scoringVersionResult || typeof scoringVersionResult !== 'object') throw new Error('missing scale result')
    ;(scoringVersionResult as { method: { scoringVersion: string } }).method.scoringVersion = '9.9.9'
    expect(() => buildPackageAnalysisForAttempt(scoringVersionAttempt)).toThrow(/provenance.*method\.scoringVersion/)
  })

  it('does not use a prior completed scale result when the selected result is incomplete', () => {
    const attempt = makeAttempt()
    const current = attempt.scaleAssessments?.[0]
    if (!current) throw new Error('missing scale assessment')
    attempt.scaleAssessments = [
      { ...current, id: 'assessment-adexi-retry', status: 'IN_PROGRESS', completedAt: new Date('2026-08-26T00:00:00Z') },
      current,
    ]
    expect(() => buildPackageAnalysisForAttempt(attempt)).toThrow(/量表测评尚未完成/)
  })

  it('keeps the cognitive-only engine contract unchanged when scale results are absent', () => {
    const packageDefinition = getReportPackageDefinition('attention_stability_v1', '1.0.0')
    const protocol = packageDefinition && getAnalysisProtocolDefinition(packageDefinition.key, packageDefinition.version)
    if (!packageDefinition || !protocol) throw new Error('missing cognitive-only fixture')
    expect(() => buildPackageCognitiveAnalysis({
      packageSnapshot: {
        snapshotVersion: 1,
        packageKey: packageDefinition.key,
        packageVersion: packageDefinition.version,
        profile: 'standard',
        packageDefinition,
        analysisProtocolSnapshot: {
          snapshotVersion: 1,
          protocolKey: protocol.key,
          protocolVersion: protocol.version,
          profile: 'standard',
          protocolDefinition: protocol,
          cognitiveMeasurements: [],
        },
      },
      moduleResults: [],
    })).toThrow()
  })

  it('reads a legacy multisource snapshot without labeling it as the new algorithm version', async () => {
    const built = buildPackageAnalysisForAttempt(makeAttempt())
    if (!built) throw new Error('missing PR10 analysis')
    const legacyAnalysis = structuredClone(built.analysis)
    legacyAnalysis.analysisVersion = LEGACY_MULTISOURCE_ANALYSIS_VERSION
    legacyAnalysis.provenance.analysisVersion = LEGACY_MULTISOURCE_ANALYSIS_VERSION
    legacyAnalysis.evidence.forEach((item) => {
      item.provenance.analysisVersion = LEGACY_MULTISOURCE_ANALYSIS_VERSION
    })
    const expectation = {
      attemptId: 'attempt-pr10',
      assessmentId: 'composite-pr10',
      packageKey: legacyAnalysis.packageKey,
      packageVersion: legacyAnalysis.packageVersion,
      profile: legacyAnalysis.profile,
      packageSnapshotVersion: legacyAnalysis.provenance.packageSnapshotVersion,
      analysisProtocolKey: legacyAnalysis.analysisProtocolKey,
      analysisProtocolVersion: legacyAnalysis.analysisProtocolVersion,
      analysisProtocolSnapshotVersion: legacyAnalysis.provenance.analysisProtocolSnapshotVersion,
      packageReportDefinitionVersion: legacyAnalysis.provenance.packageReportDefinitionVersion,
      domainDefinitionVersion: legacyAnalysis.provenance.domainDefinitionVersion,
      evidenceMappingVersion: legacyAnalysis.provenance.evidenceMappingVersion,
      recommendationRuleVersion: legacyAnalysis.provenance.recommendationRuleVersion,
    }
    const row: CompositeAnalysisSnapshotRow = {
      id: 'snapshot-legacy-pr10',
      attemptId: expectation.attemptId,
      packageKey: expectation.packageKey,
      packageVersion: expectation.packageVersion,
      analysisDefinitionVersion: expectation.analysisProtocolVersion,
      analysisVersion: LEGACY_MULTISOURCE_ANALYSIS_VERSION,
      reportSchemaVersion: legacyAnalysis.reportSchemaVersion,
      inputFingerprint: 'f'.repeat(64),
      generationReason: 'COMPLETION',
      generatedBy: null,
      payloadEncrypted: encryptCognitivePayload(legacyAnalysis),
      createdAt: new Date('2026-08-25T00:00:00Z'),
    }
    const snapshot = await readCompletionPackageAnalysisSnapshot({
      compositeAnalysisSnapshot: {
        findUnique: async (_args: unknown) => null,
        upsert: async (_args: unknown) => row,
        findFirst: async (_args: unknown) => row,
      },
    }, expectation.attemptId, expectation)

    expect(snapshot?.payload.analysisVersion).toBe(LEGACY_MULTISOURCE_ANALYSIS_VERSION)
    expect(snapshot?.payload.analysisVersion).not.toBe(MULTISOURCE_ANALYSIS_VERSION)
  })
})
