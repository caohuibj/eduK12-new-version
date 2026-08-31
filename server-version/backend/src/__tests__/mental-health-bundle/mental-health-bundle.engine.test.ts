import { describe, expect, it } from 'vitest'
import {
  buildMentalHealthBundleAnalysis,
  extractBundleScaleEvidence,
  getMentalHealthBundleDefinition,
  listMentalHealthBundleDefinitions,
  listMentalHealthBundleReportPackages,
  MENTAL_HEALTH_ANALYSIS_ENGINE_KEY,
  type BundleEvidenceMappingDefinition,
  type FrozenBundleScaleEvidence,
} from '../../modules/mental-health-bundle'
import { validateReportPackageDefinitions } from '../../modules/cognitive-analysis'

const evidenceFor = (
  bundleKey: string,
  classifications: Record<string, string>,
  overrides: Partial<FrozenBundleScaleEvidence> = {},
): FrozenBundleScaleEvidence[] => {
  const bundle = getMentalHealthBundleDefinition(bundleKey, '1.0.0')
  if (!bundle) throw new Error(`missing bundle ${bundleKey}`)
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
    classification: classifications[mapping.mappingKey] ?? 'OBSERVED',
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
    provenance: { sourceResultId: `result-${slot.key}` },
    ...overrides,
  })))
}

const youthCoreMappingKeys = () => {
  const bundle = getMentalHealthBundleDefinition('youth_anxiety_comprehensive_v1', '1.0.0')
  if (!bundle) throw new Error('missing youth bundle')
  return {
    scared: bundle.coreRules[0].requiredEvidence[0].mappingKey,
    rcads: bundle.coreRules[0].requiredEvidence[1].mappingKey,
    wellbeing: bundle.coreRules[0].requiredEvidence[2].mappingKey,
  }
}

describe('mental health Bundle registry and deterministic engine', () => {
  it('registers four explicit Bundle families and the reference Youth Anxiety 12-way CORE matrix', () => {
    const definitions = listMentalHealthBundleDefinitions()
    expect(definitions).toHaveLength(4)
    expect(definitions.map((definition) => definition.category)).toEqual([
      'youth_self',
      'adult_self',
      'parent_caregiver',
      'teacher',
    ])
    const youth = definitions.find((definition) => definition.category === 'youth_self')
    expect(youth?.coreRules).toHaveLength(12)
    expect(youth?.scaleSlots.find((slot) => slot.key === 'youth.scared41')?.mappings.length).toBeGreaterThan(1)
    expect(listMentalHealthBundleReportPackages()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'youth_anxiety_comprehensive_v1',
        analysisEngineKey: MENTAL_HEALTH_ANALYSIS_ENGINE_KEY,
        bundleDefinition: expect.objectContaining({ ruleSetKey: 'YouthAnxietyBundleRuleSetV1' }),
      }),
    ]))
  })

  it('does not allow a failed scientific, rights, or safety gate to become published', () => {
    const packageDefinition = listMentalHealthBundleReportPackages().find(
      (definition) => definition.key === 'adult_depression_context_v1',
    )
    if (!packageDefinition) throw new Error('missing adult package fixture')
    const publishedBundle = {
      ...(packageDefinition.bundleDefinition as object),
      status: 'PUBLISHED' as const,
    }
    const publishedPackage = {
      ...packageDefinition,
      status: 'PUBLISHED' as const,
      bundleDefinition: publishedBundle,
    }
    expect(() => validateReportPackageDefinitions([publishedPackage])).toThrow(/publication gate/i)
  })

  it.each([
    ['NEGATIVE', 'NORMAL', 'ADEQUATE', 'LOW_CONCERN'],
    ['POSITIVE', 'NORMAL', 'ADEQUATE', 'MIXED_RESULTS'],
    ['NEGATIVE', 'CLINICAL', 'ADEQUATE', 'MIXED_RESULTS'],
    ['POSITIVE', 'CLINICAL', 'ADEQUATE', 'STRONG_CONVERGENCE'],
    ['POSITIVE', 'BORDERLINE', 'LOW', 'CONCERN_WITH_LOW_WELLBEING'],
    ['NEGATIVE', 'NORMAL', 'LOW', 'MIXED_RESULTS'],
  ])('matches reviewed Youth Anxiety core combination %s/%s/%s', (scared, rcads, wellbeing, expectedOutcome) => {
    const keys = youthCoreMappingKeys()
    const result = buildMentalHealthBundleAnalysis({
      bundle: getMentalHealthBundleDefinition('youth_anxiety_comprehensive_v1', '1.0.0')!,
      packageKey: 'youth_anxiety_comprehensive_v1',
      packageVersion: '1.0.0',
      profile: 'standard',
      scaleResults: evidenceFor('youth_anxiety_comprehensive_v1', {
        [keys.scared]: scared,
        [keys.rcads]: rcads,
        [keys.wellbeing]: wellbeing,
      }),
      attemptId: 'attempt-youth-1',
      assessmentId: 'assessment-youth-1',
      subject: { userId: 'subject-1', subjectKey: 'subject:1' },
      respondent: { userId: 'respondent-1', respondentKey: 'respondent:1', respondentType: 'participant_self_report' },
      assessmentEpisodeId: 'episode-1',
    })
    expect(result.outcomeCode).toBe(expectedOutcome)
    expect(result.bundleReportFacts).not.toHaveProperty('mentalHealthIndex')
    expect(result.bundleReportFacts).not.toHaveProperty('average')
    expect(result.bundleReportFacts.provenance).toMatchObject({
      analysisEngineKey: MENTAL_HEALTH_ANALYSIS_ENGINE_KEY,
      attemptId: 'attempt-youth-1',
      assessmentId: 'assessment-youth-1',
    })
  })

  it('fails closed when a necessary PRIMARY mapping is unavailable', () => {
    const keys = youthCoreMappingKeys()
    const results = evidenceFor('youth_anxiety_comprehensive_v1', {
      [keys.scared]: 'POSITIVE',
      [keys.rcads]: 'CLINICAL',
      [keys.wellbeing]: 'LOW',
    }).map((entry) => entry.mappingKey === keys.rcads
      ? { ...entry, qualityState: 'invalid' as const, value: null, scoreStatus: 'not_calculable' as const }
      : entry)
    const result = buildMentalHealthBundleAnalysis({
      bundle: getMentalHealthBundleDefinition('youth_anxiety_comprehensive_v1', '1.0.0')!,
      packageKey: 'youth_anxiety_comprehensive_v1',
      packageVersion: '1.0.0',
      profile: 'standard',
      scaleResults: results,
    })
    expect(result.outcomeCode).toBe('INSUFFICIENT_QUALITY')
    expect(result.bundleReportFacts.core.matched).toBe(false)
    expect(result.bundleReportFacts.quality.primaryAvailable).toBe(false)
  })

  it('lets a safety mapping override normal Bundle output', () => {
    const bundle = getMentalHealthBundleDefinition('adult_depression_context_v1', '1.0.0')!
    const safety = bundle.scaleSlots.flatMap((slot) => slot.mappings).find((mapping) => mapping.role === 'SAFETY')!
    const phq = bundle.coreRules[0].requiredEvidence[0].mappingKey
    const wellbeing = bundle.coreRules[0].requiredEvidence[1].mappingKey
    const result = buildMentalHealthBundleAnalysis({
      bundle,
      packageKey: bundle.key,
      packageVersion: bundle.version,
      profile: 'standard',
      scaleResults: evidenceFor(bundle.key, {
        [phq]: 'MINIMAL',
        [wellbeing]: 'ADEQUATE',
        [safety.mappingKey]: 'PRESENT',
      }),
    })
    expect(result.outcomeCode).toBe('SAFETY_ESCALATED')
    expect(result.actionTier).toBe('SAFETY_ESCALATION')
    expect(result.bundleReportFacts.safetySignals).toEqual(expect.arrayContaining([
      expect.objectContaining({ mappingKey: safety.mappingKey, active: true, code: 'PRESENT' }),
    ]))
  })

  it('extracts multiple scores from one authoritative ScaleResultV2', () => {
    const mappingDefinitions: BundleEvidenceMappingDefinition[] = [
      { mappingKey: 'fixture.total', mappingVersion: '1.0.0', scaleCode: 'fixture-scale', scoreKey: 'total', role: 'PRIMARY', construct: 'fixture', direction: 'descriptive' },
      { mappingKey: 'fixture.facet', mappingVersion: '1.0.0', scaleCode: 'fixture-scale', scoreKey: 'facet', role: 'FACET', construct: 'fixture', facet: 'facet', direction: 'descriptive' },
    ]
    const result = extractBundleScaleEvidence({
      slotKey: 'fixture.slot',
      sourceResultId: 'scale-result-1',
      scaleId: 'scale-1',
      result: {
        schemaVersion: 2,
        instrument: { scaleId: 'scale-1', code: 'fixture-scale', name: 'Fixture', instrumentVersion: '1.0.0' },
        method: { scaleId: 'scale-1', instrumentVersion: '1.0.0', scoringVersion: '1.0.0', reportVersion: '1.0.0', definitionHash: 'hash', referenceVersions: [], assessmentContext: null },
        quality: { status: 'interpretable', flags: [] },
        itemScores: [],
        scores: [
          { key: 'total', type: 'total', label: 'Total', direction: 'descriptive', canonical: true, displayPrecision: 1, value: 4, range: { min: 0, max: 10 }, expectedItems: [], answeredItems: [], status: 'calculated', prorated: false, classification: 'POSITIVE' },
          { key: 'facet', type: 'dimension', label: 'Facet', direction: 'descriptive', canonical: false, displayPrecision: 1, value: 2, range: { min: 0, max: 5 }, expectedItems: [], answeredItems: [], status: 'calculated', prorated: false },
        ],
        references: [],
        interpretations: [],
        caveats: [],
        disclaimer: 'fixture',
      },
      profile: 'standard',
      mappings: mappingDefinitions,
      respondentType: 'participant_self_report',
    })
    expect(result).toHaveLength(2)
    expect(result.map((entry) => entry.scoreKey)).toEqual(['total', 'facet'])
    expect(result[0]?.classification).toBe('POSITIVE')
    expect(result[0]?.sourceResultId).toBe(result[1]?.sourceResultId)
  })
})
