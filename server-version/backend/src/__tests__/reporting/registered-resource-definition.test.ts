import { describe, expect, it } from 'vitest'
import { createCustomScaleDefinition, hashScaleDefinition } from '../../modules/scale/scale-definition'
import { descriptiveResourceEntry, registerDescriptiveResource, validateDescriptiveResourceScale } from '../../modules/assessment-run/registeredResources'
import { descriptiveReportingDefinition } from '../../modules/reporting/content.controller'
import { validateReportingSpecDefinition } from '../../modules/reporting/spec'

export const descriptiveTestDefinition = () => {
  const definition = createCustomScaleDefinition()
  definition.source = { title: '原创合成测试素材' }
  definition.items = ['Q1','Q2','Q3'].map((itemCode, sortOrder) => ({ itemCode, sortOrder, content: `原创偏好题 ${itemCode}`, type: 'single', required: true, responseSetKey: 'default', randomizeOptions: false }))
  definition.scoring.itemRules = definition.items.map(item => ({ itemCode: item.itemCode, transform: { type: 'identity' } }))
  definition.scoring.scores = [{ key: 'total', type: 'total', label: '总分', direction: 'descriptive', canonical: true, displayPrecision: 1, source: { type: 'items', aggregation: 'sum', items: definition.items.map(item => ({ itemCode: item.itemCode, weight: 1 })) } }]
  definition.report.primaryScoreKeys = ['total']; definition.report.scoreOrder = ['total']
  definition.report.interpretations = [{ scoreKey: 'total', headline: '回答描述', source: { type: 'score_only' }, summary: '描述三题回答合计。', bands: [], guidance: [] }]
  return definition
}

describe('explicit descriptive registration contract', () => {
  it('does not grant platform publication authority to ordinary users', async () => {
    await expect(registerDescriptiveResource({ userId: 'ordinary', platformRole: 'STANDARD' }, 'scale')).rejects.toMatchObject({ code: 'RESOURCE_AUTHORITY', statusCode: 403 })
  })
  it('retains original license, maturity, respondent and definition restrictions', () => {
    const definition = descriptiveTestDefinition(), definitionHash = hashScaleDefinition(definition)
    const scale = { status: 'PUBLISHED', instrumentClass: 'CUSTOM_DESCRIPTIVE', definition, definitionHash }
    expect(validateDescriptiveResourceScale(scale)).toEqual(definition)
    for (const patch of [{status:'DRAFT'}, {instrumentClass:'STANDARD'}, {definitionHash:'0'.repeat(64)}, {definition:{...definition,license:{status:'authorized',redistribution:'allowed'}}}, {definition:{...definition,respondentType:'parent_report'}}]) {
      expect(() => validateDescriptiveResourceScale({...scale,...patch})).toThrow()
    }
  })
  it('keeps personal and aggregate disclosure separate and forbids parent/research access', () => {
    const definition = descriptiveTestDefinition(), hash = hashScaleDefinition(definition)
    const individual = descriptiveResourceEntry({ scaleId:'scale',name:'原创',definition,definitionHash:hash,compositeId:'runtime',version:'1.0.1',mode:'INDIVIDUAL' })
    const group = descriptiveResourceEntry({ scaleId:'scale',name:'原创',definition,definitionHash:hash,compositeId:'runtime',version:'1.0.1',mode:'GROUP' })
    expect(individual.applicability.minimumRespondents).toBeNull()
    expect(individual.resultDisclosure?.audiences.ORGANIZATION.mode).toBe('NONE')
    expect(individual.resultDisclosure?.audiences.TEACHER.longitudinalMetricKeys).toEqual(['total'])
    expect(group.applicability.minimumRespondents).toBe(3)
    expect(group.resultDisclosure?.audiences.SUBJECT.mode).toBe('AGGREGATE_ONLY')
    expect(group.resultDisclosure?.audiences.TEACHER.longitudinalMetricKeys).toEqual([])
    for (const entry of [individual,group]) {
      expect(entry.scienceMaturity).toBe('PILOT')
      expect(entry.resultDisclosure?.audiences.PARENT.mode).toBe('NONE')
      expect(entry.resultDisclosure?.audiences.RESEARCH.mode).toBe('NONE')
    }
  })
  it('creates validated, quality-gated exact-definition specs without claiming cross-version comparability', () => {
    const definition = descriptiveTestDefinition(), definitionHash = hashScaleDefinition(definition)
    const entry = descriptiveResourceEntry({ scaleId:'scale',name:'原创',definition,definitionHash,compositeId:'runtime',version:'1.0.1',mode:'INDIVIDUAL' })
    for (const kind of ['INDIVIDUAL_LONGITUDINAL','REPEATED_COHORT','MATCHED_LONGITUDINAL'] as const) {
      const spec = validateReportingSpecDefinition(descriptiveReportingDefinition({...entry,definitionHash},kind,5))
      expect(spec.metricRules[0].acceptedResultQuality).toEqual(['interpretable'])
      expect(spec.reportEvidenceCeiling).toBe('PILOT')
      if ('comparabilityRules' in spec) expect(spec.comparabilityRules[0]).toMatchObject({fromVersion:'1.0.1',toVersion:'1.0.1',evidenceHash:definitionHash})
      if ('minimumCohortN' in spec) expect(spec.minimumCohortN).toBe(5)
    }
  })
})
