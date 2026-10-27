import { describe, expect, it } from 'vitest'
import { scaleDefinitionSchema, validateScaleDefinition } from '../../modules/scale/scale-definition'
import { validateAudienceReport } from '../../modules/scale/library/audience-report-gate'
import { createScaleInstrumentRegistry, getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { previewScaleInstrument } from '../../modules/scale/onboarding/preview'
import { validateScaleInstrumentSource } from '../../modules/scale/onboarding/validate-instrument'

const source = () => ({ ...structuredClone(getScaleInstrumentSource('academic_self_concept_physics_zh_cn', '1.0.0')!), instruction: { schemaVersion: 1 as const, text: '请选择对应选项。', language: 'zh-CN', version: 'synthetic-1', source: 'Synthetic structural fixture' } })

describe('three-part structural admission', () => {
  it('consumes a short report with no editorial review or forced guidance categories', () => {
    const next = source()
    const report = next.executable!.definition.report
    delete report.audienceContract!.qcReview
    for (const entry of report.interpretations) {
      entry.summary = '当前得分。'
      entry.guidance = []
      for (const band of entry.bands) { band.summary = '得分区间。'; band.guidance = [] }
    }
    expect(scaleDefinitionSchema.safeParse(next.executable!.definition).success).toBe(true)
    expect(validateAudienceReport(next.executable!.definition)).toEqual([])
    expect(validateScaleInstrumentSource(next).issues.filter(issue => issue.severity === 'error')).toEqual([])
    expect(report.audienceContract?.qcReview).toBeUndefined()
    const missingInstruction = { ...next, instruction: undefined }
    expect(validateScaleInstrumentSource(missingInstruction, { requireInstruction: true }).issues.some(issue => issue.message === 'INSTRUCTION_NOT_DECLARED')).toBe(true)
  })

  it('retains report language, respondent, metric coverage and duplicate-band structural failures', () => {
    const definition = source().executable!.definition
    definition.report.audienceContract!.locale = 'en'
    definition.report.interpretations[0].bands.push({ key: 'repeated', label: '区间', summary: '说明', guidance: [] }, { key: 'repeated', label: '区间', summary: '说明', guidance: [] })
    const messages = validateAudienceReport(definition).map(issue => issue.message)
    expect(messages).toEqual(expect.arrayContaining(['AUDIENCE_LANGUAGE_QC_REQUIRED', 'REPORT_BAND_KEYS_DUPLICATE']))
    definition.report.interpretations = []
    expect(validateAudienceReport(definition).some(issue => issue.message === 'REPORT_SCORE_COVERAGE_REQUIRED')).toBe(true)
    expect(validateScaleDefinition(definition, { forPublish: true }).issues.some(issue => issue.message === 'REPORT_SCORE_COVERAGE_REQUIRED')).toBe(true)
  })

  it('keeps a malformed report candidate discoverable while refusing its selected executable and runtime policy', () => {
    const broken = source()
    delete broken.executable!.definition.report.audienceContract
    broken.executable!.releaseStatus = 'DRAFT'
    const healthy = source()
    healthy.identity.instrumentKey = 'synthetic_healthy_structure'
    for (const reference of healthy.executable!.references) reference.instrumentKey = healthy.identity.instrumentKey
    const registry = createScaleInstrumentRegistry([broken, healthy])
    expect(registry.listSources()).toHaveLength(2)
    expect(registry.getSource(broken.identity.instrumentKey, '1.0.0')).toBeDefined()
    expect(() => registry.getExecutable(broken.identity.instrumentKey, '1.0.0')).toThrow('AUDIENCE_LANGUAGE_QC_REQUIRED')
    expect(() => registry.getRuntimePolicy(broken.identity.instrumentKey, '1.0.0')).toThrow('AUDIENCE_LANGUAGE_QC_REQUIRED')
    expect(registry.getRuntimePolicy(healthy.identity.instrumentKey, '1.0.0')).toBeDefined()
    expect(validateScaleInstrumentSource(broken).valid).toBe(false)
  })

  it('quarantines schema-invalid candidates with original diagnostics and still rejects identity collisions', () => {
    const broken = source()
    broken.identity.instrumentKey = 'synthetic_schema_error'
    Object.assign(broken.applicability!.subject, { ageMonths: { maxInclusive: 180 } })
    const registry = createScaleInstrumentRegistry([broken, source()])
    expect(registry.listSources()).toHaveLength(1)
    expect(registry.getSource(broken.identity.instrumentKey, '1.0.0')).toBeUndefined()
    expect(registry.listDiagnostics()).toEqual([expect.objectContaining({ instrumentKey: broken.identity.instrumentKey, issues: [expect.objectContaining({ path: 'applicability.subject.ageMonths' })] })])
    expect(() => createScaleInstrumentRegistry([broken, broken])).toThrow('Duplicate ScaleInstrumentSource identity')
    expect(registry.getRuntimePolicy(source().identity.instrumentKey, '1.0.0')).toBeDefined()
  })

  it('keeps scientific and translation statuses truthful as manual diagnostics with exact locale/version matching', () => {
    const next = source()
    delete next.scientificReview
    next.localization!.reviewStatus = 'PENDING'
    next.localization!.expertReviewStatus = 'PENDING'
    next.localization!.adaptationMethod = 'DIRECT_TRANSLATION'
    next.localization!.sourceLocale = 'en'
    const preview = previewScaleInstrument({ source: next, locale: 'zh-CN', territory: 'US', deploymentModes: ['STANDALONE'] })
    expect(preview.allowActivation).toBe(true)
    expect(preview.scientific.qualification.researchReady.eligible).toBe(false)
    expect(preview.localization?.reviewStatus).toBe('PENDING')
    expect(preview.manualReview.localization).toEqual(['LOCALIZATION_REVIEW_PENDING', 'LOCALIZATION_EXPERT_REVIEW_PENDING'])
    const mismatched = previewScaleInstrument({ source: next, locale: 'en', territory: 'US', deploymentModes: ['STANDALONE'] })
    expect(mismatched.allowActivation).toBe(false)
    expect(mismatched.blockers).toContain('DEPLOYMENT_CONTENT_LOCALE_MISMATCH')
  })
})
