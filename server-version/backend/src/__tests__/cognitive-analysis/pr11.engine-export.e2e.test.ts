import { describe, expect, it } from 'vitest'
import { freezeAssignmentProfile, readFrozenReport } from '../../modules/cognitive/profile-freeze'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import {
  buildFrozenReportPackageSnapshot,
  buildPackageCognitiveAnalysis,
  getAnalysisProtocolDefinition,
  getReportPackageDefinition,
  type FrozenCognitiveModuleResult,
  type FrozenReportPackageSnapshot,
  type FrozenScaleModuleResult,
} from '../../modules/cognitive-analysis'
import { buildCompositeAnalysisExport } from '../../modules/composite/composite-analysis-export.service'
import { projectCompositePackageAnalysis } from '../../modules/composite/composite-report.projector'
import { ADEXI_V2_DEFINITION } from '../../modules/scale/packages/adexi-v2'

const zipEntry = (zip: Buffer, target: string): string => {
  let offset = 0
  while (offset <= zip.length - 30) {
    if (zip.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1
      continue
    }
    const nameLength = zip.readUInt16LE(offset + 26)
    const extraLength = zip.readUInt16LE(offset + 28)
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8')
    const dataStart = offset + 30 + nameLength + extraLength
    const dataLength = zip.readUInt32LE(offset + 18)
    if (name === target) return zip.subarray(dataStart, dataStart + dataLength).toString('utf8')
    offset = dataStart + dataLength
  }
  throw new Error(`missing zip entry ${target}`)
}

const makeSnapshotAndResults = (): {
  packageSnapshot: FrozenReportPackageSnapshot
  moduleResults: FrozenCognitiveModuleResult[]
  scaleResults: FrozenScaleModuleResult[]
} => {
  const packageDefinition = getReportPackageDefinition('inhibitory_control_multisource_v1', '1.0.0')
  if (!packageDefinition) throw new Error('missing multi-source package')
  const protocol = getAnalysisProtocolDefinition(packageDefinition.key, packageDefinition.version)
  if (!protocol) throw new Error('missing multi-source protocol')
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
  const cognitiveItem = {
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
  }
  const scaleItem = {
    id: 'item-adexi',
    type: 'SCALE',
    position: 1,
    required: true,
    scaleId: 'scale-adexi',
    scale: {
      id: 'scale-adexi',
      code: 'adexi_v1',
      name: 'ADEXI',
      description: 'fixture',
      status: 'PUBLISHED',
      visibility: 'HIDDEN',
      instrumentClass: 'STANDARD' as const,
      instrumentVersion: '2.0.0',
      definition: ADEXI_V2_DEFINITION,
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
        content: 'fixture item',
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
  }
  const packageSnapshot = buildFrozenReportPackageSnapshot(packageDefinition, protocol, [cognitiveItem, scaleItem])
  const frozenReport = readFrozenReport(freeze.resolvedReportSnapshotEncrypted)
  if (!frozenReport) throw new Error('missing frozen Go/No-Go report')
  const gonogoMeasurement = packageSnapshot.analysisProtocolSnapshot.cognitiveMeasurements
    .find((measurement) => measurement.slotKey === 'gonogo')
  const scaleMeasurement = packageSnapshot.analysisProtocolSnapshot.scaleMeasurements?.[0]
  if (!gonogoMeasurement || !scaleMeasurement) throw new Error('missing frozen measurements')

  const moduleResults: FrozenCognitiveModuleResult[] = [{
    slotKey: 'gonogo',
    sourceResultId: 'cognitive-result-1',
    assignmentId: 'assignment-gonogo',
    profile: 'standard',
    testType: 'gonogo',
    configVersion: '1.0.0',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    metrics: { commissionRate: 0.2, dPrime: 1.1 },
    qualityFlags: { interpretable: true },
    frozenReport,
    metricInterpretations: {
      commissionRate: {
        interpretation: 'criterion',
        directionClass: 'more_difficulty',
        provenance: { basisId: 'fixture-criterion', basisVersion: 'fixture-criterion-v1' },
      },
    },
    provenance: { resultVersion: 'fixture-result-v1' },
  }]
  const scaleResults: FrozenScaleModuleResult[] = [{
    slotKey: 'adexi_inhibition',
    sourceResultId: 'scale-result-1',
    compositeItemId: 'item-adexi',
    scaleId: scaleMeasurement.scaleId,
    scaleCode: scaleMeasurement.scaleCode,
    dimensionCode: scaleMeasurement.dimensionCode,
    scaleDefinitionHash: scaleMeasurement.scaleDefinitionHash,
    dimensionScore: 17,
    profile: 'standard',
    mappingKey: scaleMeasurement.mappingKey,
    mappingVersion: scaleMeasurement.mappingVersion,
    respondentType: scaleMeasurement.respondentType,
    valueSelector: scaleMeasurement.valueSelector,
    qualityFlags: { interpretable: true },
    provenance: { sourceType: 'scale_assessment' },
  }]
  return { packageSnapshot, moduleResults, scaleResults }
}

describe('PR11 engine to projected export chain', () => {
  it('keeps a clear behavioral difficulty watch through 1.1.0 engine, projection and CSV export', () => {
    const { packageSnapshot, moduleResults, scaleResults } = makeSnapshotAndResults()
    const analysis = buildPackageCognitiveAnalysis({
      packageSnapshot,
      moduleResults,
      scaleResults,
      attemptId: 'attempt-pr11',
      assessmentId: 'assessment-pr11',
    })

    expect(analysis.provenance.recommendationRuleVersion).toBe('1.1.0')
    expect(analysis.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'clear_difficulty_watch', construct: 'domain', audience: 'participant' }),
      expect.objectContaining({ ruleId: 'paired_source_description_info', construct: 'cross_source', audience: 'researcher' }),
    ]))
    expect(analysis.recommendations.some((recommendation) => recommendation.ruleId === 'mixed_or_divergent_context')).toBe(false)
    expect(analysis.limitations.join(' ')).toContain('建议仅基于冻结 Domain/finding 证据生成')

    const snapshot = {
      id: 'snapshot-pr11',
      attemptId: 'attempt-pr11',
      packageKey: packageSnapshot.packageKey,
      packageVersion: packageSnapshot.packageVersion,
      analysisDefinitionVersion: packageSnapshot.analysisProtocolSnapshot.protocolVersion,
      analysisVersion: analysis.analysisVersion,
      reportSchemaVersion: analysis.reportSchemaVersion,
      inputFingerprint: 'a'.repeat(64),
      generationReason: 'COMPLETION' as const,
      generatedBy: null,
      createdAt: new Date('2026-08-25T00:00:00Z'),
      payload: analysis,
    }
    const projected = projectCompositePackageAnalysis({ packageSnapshot, snapshot, audience: 'researcher' })
    expect(projected.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'clear_difficulty_watch', construct: 'domain' }),
    ]))

    const exported = buildCompositeAnalysisExport({
      attemptId: 'attempt-pr11',
      assessmentId: 'assessment-pr11',
      assessmentName: 'PR11 fixture',
      audience: 'researcher',
      packageSnapshot,
      snapshot,
    }, 'zip')
    const recommendationsCsv = zipEntry(exported.body, 'recommendations.csv')
    expect(recommendationsCsv).toContain('clear_difficulty_watch')
    expect(recommendationsCsv).toContain('domain')
  })
})
