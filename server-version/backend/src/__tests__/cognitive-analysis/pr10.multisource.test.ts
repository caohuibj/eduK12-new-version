import { describe, expect, it } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)

import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { freezeAssignmentProfile } from '../../modules/cognitive/profile-freeze'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import {
  buildFrozenReportPackageSnapshot,
  buildPackageCognitiveAnalysis,
  getAnalysisProtocolDefinition,
  getReportPackageDefinition,
} from '../../modules/cognitive-analysis'
import {
  buildPackageAnalysisForAttempt,
  buildPackageAnalysisInputFingerprint,
  type PackageAnalysisAttemptInput,
} from '../../modules/composite/composite-analysis-snapshot.service'
import { ADEXI_V2_DEFINITION } from '../../modules/scale/packages/adexi-v2'

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
      result: {
        schemaVersion: 2,
        scores: [{ key: 'inhibition', value: 17 }],
        method: { assessmentContext: null },
      },
      completedAt: new Date('2026-08-25T00:00:00Z'),
    }],
  }
}

describe('PR10 multi-source package analysis', () => {
  it('combines Go/No-Go and ADEXI without an age or teacher-answering gate', () => {
    const built = buildPackageAnalysisForAttempt(makeAttempt())
    expect(built?.scaleResults).toHaveLength(1)
    expect(built?.analysis.analysisVersion).toBe('cognitive-evidence-domain-v1.1.1')
    expect(built?.analysis.reportSchemaVersion).toBe('cognitive-package-analysis-v2')
    const scaleEvidence = built?.analysis.evidence.find((item) => item.sourceType === 'scale_dimension')
    expect(scaleEvidence).toMatchObject({
      construct: 'response_inhibition',
      facet: 'action_withholding',
      interpretation: 'self_report',
      directionClass: 'unknown',
      interpretable: true,
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

  it('hashes the complete frozen scale definition rather than only id/code', () => {
    const firstAttempt = makeAttempt()
    const secondAttempt = makeAttempt()
    const secondScale = secondAttempt.compositeAssessment.items[1]?.scale
    const secondScaleDefinition = secondScale?.definition as typeof ADEXI_V2_DEFINITION | undefined
    if (!secondScaleDefinition?.items?.[0]) throw new Error('missing scale definition fixture')
    secondScaleDefinition.items[0].content = 'changed draft item'

    const definition = getReportPackageDefinition('inhibitory_control_multisource_v1', '1.0.0')
    const protocol = definition && getAnalysisProtocolDefinition(definition.key, definition.version)
    if (!definition || !protocol) throw new Error('missing PR10 package')
    const first = buildFrozenReportPackageSnapshot(definition, protocol, firstAttempt.compositeAssessment.items)
    const second = buildFrozenReportPackageSnapshot(definition, protocol, secondAttempt.compositeAssessment.items)
    expect(first.analysisProtocolSnapshot.scaleMeasurements?.[0].scaleDefinitionHash)
      .not.toBe(second.analysisProtocolSnapshot.scaleMeasurements?.[0].scaleDefinitionHash)
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
})
