import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/cfsr12_zh_cn_research/1.0.1/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { hashScaleDefinition, validateScaleDefinition } from '../../../modules/scale/scale-definition'
import { scoreScale, type ScaleAnswer } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

const pkg = projectScalePackage(source)!
const def = pkg.definition
const keys = ['abandonment', 'recoping', 'metacoping']
const code = (n: number) => `CFSR_${String(n).padStart(2, '0')}`
const allOne: ScaleAnswer[] = Array.from({ length: 12 }, (_, i) => ({ itemCode: code(i + 1), responseValue: '1' }))
const result = (answers: ScaleAnswer[]) => buildScaleResult({
  scaleId: 'synthetic-cfsr12-only', instrumentKey: source.identity.instrumentKey,
  name: source.catalog.identity.canonicalName, instrumentVersion: source.identity.instrumentVersion,
  definition: def, answers,
})

describe('CFS-R-12 Chinese working draft, derived from Kato 2020 Table 1', () => {
  it('parses into existing schema and stays DRAFT without installation', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(validateScaleDefinition(def, { instrumentClass: 'STANDARD', forPublish: false }).issues.filter(i => i.severity === 'error')).toEqual([])
    expect(source.identity).toEqual({ instrumentKey: 'cfsr12_zh_cn_research', instrumentVersion: '1.0.1' })
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.catalog.scientificMaturity).toBe('PILOT')
  })
  it('preserves all 12 items in published Table 1 subgroup sequence', () => {
    expect(def.items.map(item => item.itemCode)).toEqual(Array.from({ length: 12 }, (_, i) => code(i+1)))
    expect(def.items.map(item => item.sortOrder)).toEqual(Array.from({ length: 12 }, (_, i) => i))
    expect(def.items.every(item => item.required && !item.randomizeOptions)).toBe(true)
    expect(def.display.randomizeItems).toBe(false)
    expect(def.responseSets[0].options.map(option => option.score)).toEqual([0, 1, 2, 3])
    expect(def.responseSets[0].options.map(option => option.value)).toEqual(['0', '1', '2', '3'])
    expect(source.catalog.administration.layoutConstraints.join(' ')).toContain('不得把它并入第一题') // standalone instructions only
  })
  it('uses three disjoint 4-item sums, not OpenScales mean nor fabricated total', () => {
    expect(def.scoring.scoringVersion).toBe('1.0.0')
    expect(def.scoring.itemRules).toHaveLength(12)
    expect(def.scoring.itemRules.every(rule => rule.transform.type === 'identity')).toBe(true)
    expect(def.scoring.scores.map(score => score.key)).toEqual(keys)
    expect(def.scoring.scores.every(score => score.type === 'dimension' && score.source.type === 'items' && score.source.aggregation === 'sum')).toBe(true)
    expect(def.scoring.scores.map(score => score.source.type === 'items' ? score.source.items.map(item => item.itemCode) : [])).toEqual([
      [1,2,3,4], [5,6,7,8], [9,10,11,12]
    ].map(seq => seq.map(code)))
    expect(def.scoring.defaultMissingPolicy).toEqual({ type: 'complete_required' })
    expect(def.report.primaryScoreKeys).toEqual(keys)
    expect(def.referencePolicy).toEqual({ type: 'none' })
  })
  for(const fixture of pkg.goldenCases){
    it(`reproduces independent golden ${fixture.name}`, () => {
      const actual = scoreScale(def, fixture.answers)
      expect(actual.quality.status).toBe(fixture.expected.quality)
      expect(actual.scores.map(s => s.key)).toEqual(fixture.expected.totalScoreKeys)
      expect(Object.fromEntries(actual.scores.map(s => [s.key, s.value]))).toEqual(fixture.expected.scores)
    })
  }
  it('does not contaminate dimensions when one item varies', () => {
    for(let n=1;n<=12;n++){
      const a=allOne.map(x => x.itemCode === code(n) ? { ...x, responseValue: '3' } : x)
      const values=scoreScale(def, a).scores.map(s => s.value)
      expect(values).toEqual([0,1,2].map(k => Math.floor((n-1)/4) === k ? 6 : 4))
    }
  })
  it('rejects invalid, duplicate and alien answers', () => {
    for(const responseValue of ['-1','4','invalid','',1.5,Number.NaN]){
      expect(() => result([{ itemCode: code(1), responseValue }, ...allOne.slice(1)])).toThrow('量表回答不合法')
    }
    expect(() => result([...allOne, allOne[0]])).toThrow('量表回答不合法')
    expect(() => result([...allOne, { itemCode: 'CFSR_13', responseValue: '2' }])).toThrow('量表回答不合法')
  })
  it('suppresses interpretation when incomplete and never prorates', () => {
    const value=result(allOne.slice(1))
    expect(value.quality.status).toBe('invalid')
    expect(value.scores.map(s => s.value)).toEqual([null,4,4])
    expect(value.interpretations).toEqual([])
    expect(value.references).toEqual([])
  })
  it('builds the actual report at min/mid/max without bands or reference leakage', () => {
    for(const fixture of pkg.goldenCases.filter(f => ['minimum','all_one','maximum'].includes(f.name))){
      const r=parseScaleResultV2(JSON.parse(JSON.stringify(result(fixture.answers))))
      expect(r.quality.status).toBe('interpretable')
      expect(r.interpretations).toHaveLength(3)
      expect(r.interpretations.every(i => i.label === null && i.referenceVersion === null && i.guidance.length >= 2)).toBe(true)
      expect(r.references).toEqual([])
    }
    expect(def.report.interpretations.every(i => i.source.type === 'score_only' && i.bands.length === 0 && i.summary.length >= 120)).toBe(true)
  })
  it('only permits eligible adults and never assumes age when missing', () => {
    expect(source.applicability?.subject?.ageMonths).toEqual({ minInclusive: 240 })
    const eligibility=(ageMonths?:number)=>evaluateInstrumentEligibility(source.applicability!,{
      respondentType:'SELF', subject:ageMonths===undefined?undefined:{ageMonths}, availableContextKeys:[]
    })
    expect(eligibility(239).outcome).toBe('INELIGIBLE')
    expect(eligibility(240).outcome).toBe('ELIGIBLE')
    expect(eligibility().outcome).toBe('INDETERMINATE')
  })
  it('labels language provenance and CC-BY source without claiming Chinese norms', () => {
    expect(source.localization?.sourceLocale).toBe('en')
    expect(source.localization?.targetLocale).toBe('zh-CN')
    expect(source.localization?.localizationVersion).toBe('1.0.1')
    expect(def.items[5].content).toBe('如果之前应对得不好，我会使用另一种应对方式。')
    expect(def.items[10].content).toBe('我通过确立清晰的目标来应对压力。')
    expect(source.localization?.expertReviewStatus).toBe('PENDING')
    expect(source.localization?.localEvidenceRefs).toEqual([])
    expect(source.catalog.evidence.every(e => e.locale === 'ja' && e.territory === 'JP')).toBe(true)
    expect(source.catalog.population.minAge).toBe(20)
    expect(def.license.note).toContain('© 2020 Tsukasa Kato')
    expect(def.license.note).toContain('https://creativecommons.org/licenses/by/4.0/')
    expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL','COMMERCIAL'])
    expect(def.report.limitations.join(' ')).toContain('不能单凭这份结果判断疾病')
    expect(source.disclosure?.audiences.teacher).toBeUndefined()
  })
  it('does not modify measurement hash on report-only updates', () => {
    const amended=structuredClone(def)
    amended.report.reportVersion='1.0.3'
    amended.report.disclaimer+=' 新版本解释'
    expect(hashScaleDefinition(amended)).toBe(hashScaleDefinition(def))
    amended.items[0].content+='（测试改动）'
    expect(hashScaleDefinition(amended)).not.toBe(hashScaleDefinition(def))
  })
})
