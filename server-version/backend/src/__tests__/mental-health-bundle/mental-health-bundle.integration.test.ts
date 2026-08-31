import { describe, expect, it } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)

import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import {
  buildCompletionSnapshotExpectation,
  readCompletionPackageAnalysisSnapshot,
  type CompositeAnalysisSnapshotRow,
} from '../../modules/composite/composite-analysis-snapshot.service'
import { buildCompositeAnalysisExport } from '../../modules/composite/composite-analysis-export.service'
import {
  buildMentalHealthBundleAnalysis,
  listMentalHealthBundleReportPackages,
  MENTAL_HEALTH_ANALYSIS_ENGINE_KEY,
  type FrozenBundleScaleEvidence,
} from '../../modules/mental-health-bundle'
import type { FrozenReportPackageSnapshot } from '../../modules/cognitive-analysis/report-package-freeze'

const makeBundleEvidence = (
  bundle: NonNullable<ReturnType<typeof listMentalHealthBundleReportPackages>[number]['bundleDefinition']>,
): FrozenBundleScaleEvidence[] => {
  const core = bundle.coreRules[0]
  const classifications = new Map(core.requiredEvidence.map((item) => [item.mappingKey, item.classification]))
  return bundle.scaleSlots.flatMap((slot) => slot.mappings.map((mapping) => ({
    slotKey: slot.key,
    sourceResultId: `result-${slot.key}`,
    compositeItemId: `item-${slot.key}`,
    scaleId: `scale-${slot.key}`,
    scaleCode: mapping.scaleCode,
    instrumentVersion: '1.0.0',
    scoreKey: mapping.scoreKey,
    value: 1,
    scoreStatus: 'calculated' as const,
    classification: classifications.get(mapping.mappingKey) ?? mapping.classificationCodes?.[0] ?? 'OBSERVED',
    profile: 'standard' as const,
    mappingKey: mapping.mappingKey,
    mappingVersion: mapping.mappingVersion,
    role: mapping.role,
    construct: mapping.construct,
    ...(mapping.facet ? { facet: mapping.facet } : {}),
    direction: mapping.direction,
    respondentType: slot.respondentType,
    qualityState: 'interpretable' as const,
    qualityFlags: [],
    provenance: {
      sourceType: 'scale_assessment',
      sourceResultId: `result-${slot.key}`,
    },
  })))
}

const makeMentalPackageSnapshot = (): {
  snapshot: FrozenReportPackageSnapshot
  analysis: ReturnType<typeof buildMentalHealthBundleAnalysis>
} => {
  const packageDefinition = listMentalHealthBundleReportPackages().find(
    (definition) => definition.key === 'youth_anxiety_comprehensive_v1',
  )
  if (!packageDefinition || !packageDefinition.bundleDefinition) throw new Error('missing youth package fixture')
  const bundle = packageDefinition.bundleDefinition
  const protocolDefinition = {
    key: packageDefinition.analysisProtocolKey,
    version: packageDefinition.analysisProtocolVersion,
    status: packageDefinition.status,
    name: packageDefinition.name,
    description: packageDefinition.description,
    recommendedForCreate: false,
    profiles: [...packageDefinition.profiles],
    estimatedMinutes: packageDefinition.estimatedMinutes,
    cognitiveSlots: [],
    scaleSlots: packageDefinition.slots,
    outputDomains: [],
    domainDefinitionVersion: 'not-applicable',
    evidenceMappingVersion: bundle.evidenceMappingVersion,
    recommendationRuleVersion: bundle.ruleSetVersion,
  }
  const snapshot = {
    snapshotVersion: 2 as const,
    packageKey: packageDefinition.key,
    packageVersion: packageDefinition.version,
    profile: 'standard' as const,
    packageDefinition,
    analysisEngineKey: MENTAL_HEALTH_ANALYSIS_ENGINE_KEY,
    bundleDefinitionSnapshot: bundle,
    analysisProtocolSnapshot: {
      snapshotVersion: 2 as const,
      protocolKey: packageDefinition.analysisProtocolKey,
      protocolVersion: packageDefinition.analysisProtocolVersion,
      profile: 'standard' as const,
      protocolDefinition,
      cognitiveMeasurements: [],
      scaleMeasurements: [],
    },
  } as unknown as FrozenReportPackageSnapshot
  const analysis = buildMentalHealthBundleAnalysis({
    bundle,
    packageKey: packageDefinition.key,
    packageVersion: packageDefinition.version,
    profile: 'standard',
    scaleResults: makeBundleEvidence(bundle),
    attemptId: 'attempt-mental-1',
    assessmentId: 'assessment-mental-1',
    subject: { userId: 'subject-1', subjectKey: 'subject:1' },
    respondent: { userId: 'respondent-1', respondentKey: 'respondent:1', respondentType: 'participant_self_report' },
    assessmentEpisodeId: 'episode-1',
  })
  return { snapshot, analysis }
}

const makeContext = (
  snapshot: FrozenReportPackageSnapshot,
  payload: ReturnType<typeof buildMentalHealthBundleAnalysis>,
  audience: 'participant' | 'teacher' | 'researcher',
) => ({
  attemptId: 'attempt-mental-1',
  assessmentId: 'assessment-mental-1',
  assessmentName: 'Mental Bundle fixture',
  audience,
  packageSnapshot: snapshot,
  snapshot: {
    id: 'snapshot-mental-1',
    attemptId: 'attempt-mental-1',
    packageKey: payload.packageKey,
    packageVersion: payload.packageVersion,
    analysisDefinitionVersion: payload.analysisProtocolVersion,
    analysisVersion: payload.analysisVersion,
    reportSchemaVersion: payload.reportSchemaVersion,
    inputFingerprint: 'fingerprint-mental-1',
    generationReason: 'COMPLETION' as const,
    generatedBy: null,
    createdAt: new Date('2026-08-30T00:00:00.000Z'),
    payload,
  },
})

describe('mental health Bundle package integration', () => {
  it('accepts the deterministic mental payload through completion snapshot provenance validation', async () => {
    const { snapshot, analysis } = makeMentalPackageSnapshot()
    const row: CompositeAnalysisSnapshotRow = {
      id: 'snapshot-mental-1',
      attemptId: 'attempt-mental-1',
      packageKey: analysis.packageKey,
      packageVersion: analysis.packageVersion,
      analysisDefinitionVersion: analysis.analysisProtocolVersion,
      analysisVersion: analysis.analysisVersion,
      reportSchemaVersion: analysis.reportSchemaVersion,
      inputFingerprint: 'fingerprint-mental-1',
      generationReason: 'COMPLETION',
      generatedBy: null,
      payloadEncrypted: encryptCognitivePayload(analysis),
      createdAt: new Date('2026-08-30T00:00:00.000Z'),
    }
    const db = {
      compositeAnalysisSnapshot: {
        findFirst: async () => row,
      },
    } as any
    const expected = buildCompletionSnapshotExpectation({
      attemptId: 'attempt-mental-1',
      assessmentId: 'assessment-mental-1',
      packageSnapshot: snapshot,
    })
    const read = await readCompletionPackageAnalysisSnapshot(db, 'attempt-mental-1', expected)
    expect(read?.payload.analysisEngineKey).toBe(MENTAL_HEALTH_ANALYSIS_ENGINE_KEY)
    expect(read?.payload.bundleReportFacts.provenance).toMatchObject({
      attemptId: 'attempt-mental-1',
      assessmentId: 'assessment-mental-1',
    })
  })

  it('exports mental Bundle facts for researchers and keeps restricted audiences free of raw evidence', async () => {
    const { snapshot, analysis } = makeMentalPackageSnapshot()
    const researcher = await buildCompositeAnalysisExport(
      makeContext(snapshot, analysis, 'researcher'),
      'json',
    )
    const researcherDocument = JSON.parse(researcher.body.toString('utf8'))
    expect(researcherDocument.analysis.bundleReportFacts).toBeDefined()
    expect(researcherDocument.analysis.outcomeCode).toBe(analysis.outcomeCode)

    const participant = await buildCompositeAnalysisExport(
      makeContext(snapshot, analysis, 'participant'),
      'zip',
    )
    expect(participant.body.length).toBeGreaterThan(0)
    const teacher = await buildCompositeAnalysisExport(
      makeContext(snapshot, analysis, 'teacher'),
      'json',
    )
    const teacherDocument = JSON.parse(teacher.body.toString('utf8'))
    expect(teacherDocument.analysis.bundleReportFacts).toBeUndefined()
    expect(teacherDocument.analysis).not.toHaveProperty('evidence')
  })
})
