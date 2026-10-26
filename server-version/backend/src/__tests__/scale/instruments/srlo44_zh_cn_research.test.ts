import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/srlo44_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { scoreScale, type ScaleAnswer } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

const pkg = projectScalePackage(source)!, d = pkg.definition
const keys = ['online_academic_self_efficacy', 'online_intrinsic_motivation', 'online_extrinsic_motivation', 'online_negative_achievement_emotion', 'planning_time_management', 'metacognition', 'study_environment', 'online_effort_regulation', 'online_social_support', 'online_task_strategies']
const facetCodes = [[1,2,3,4],[5,6,7,8,9],[10,11,12],[13,14,15,16,17],[18,19,20,21,22],[23,24,25,26,27],[28,29,30],[31,32,33,34],[35,36,37,38,39],[40,41,42,43,44]]
const code = (i: number) => `SRLO_${String(i).padStart(2, '0')}`
const allFour: ScaleAnswer[] = Array.from({ length: 44 }, (_, i) => ({ itemCode: code(i + 1), responseValue: '4' }))
const build = (answers: ScaleAnswer[]) => parseScaleResultV2(buildScaleResult({ scaleId: 'synthetic-srlo44', instrumentKey: source.identity.instrumentKey, instrumentVersion: source.identity.instrumentVersion, name: source.catalog.identity.canonicalName, definition: d, answers }))
const archive = resolve(__dirname, '../../../../../../docs/scale-instruments/research-drafts/srlo44/1.0.0')
const bilingual = JSON.parse(readFileSync(resolve(archive, 'bilingual-content.json'), 'utf8')) as {
  questions: Array<{ itemCode: string; publishedTable8English: string; platformChinese: string; scoreKey: string; reverse: boolean }>
  instructions: Array<{ beforeItemCode: string; throughItemCode: string; originalEnglish: string; platformChinese: string }>
  options: Array<{ value: string; originalEnglish: string; platformChinese: string; score: number }>
}

describe('SRL-O44 corrected Table 8 independent Chinese research working translation', () => {
  it('validates only this complete DRAFT source with independent version axes and no fabricated scientific approval', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(source.identity).toEqual({ instrumentKey: 'srlo44_zh_cn_research', instrumentVersion: '1.0.0' })
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.catalog.scientificMaturity).toBe('PILOT')
    expect(source.scientificReview).toBeUndefined()
    expect(d.scoring.scoringVersion).toBe('1.0.0')
    expect(d.report.reportVersion).toBe('1.0.0')
    expect(d.versionAxes).toEqual({ schemaVersion: 1, subjectKey: 'srlo44', locale: 'zh-CN', localizationVersion: '1.0.0' })
    expect(source.catalog.catalogManifestVersion).toBe(1)
  })
  it('preserves all 44 corrected published English items, original order and independent Chinese working text', () => {
    expect(d.items.map(i => i.itemCode)).toEqual(Array.from({ length: 44 }, (_, i) => code(i + 1)))
    expect(d.items.map(i => i.content)).toEqual(bilingual.questions.map(q => q.platformChinese))
    expect(bilingual.questions).toHaveLength(44)
    expect(createHash('sha256').update(JSON.stringify(bilingual.questions.map(q => q.publishedTable8English))).digest('hex')).toBe('b253eca4f0113f1a00ed6492eb9164002db5a778f9b924184f2fe79f731d409e')
    expect(d.items.every(i => i.required && !i.randomizeOptions)).toBe(true)
    expect(d.display.randomizeItems).toBe(false)
    expect(bilingual.questions.every(q => !q.reverse)).toBe(true)
    expect(bilingual.questions[7].publishedTable8English).toContain('new material')
    expect(bilingual.questions[8].publishedTable8English).toContain('new skills')
    expect(bilingual.questions[26].publishedTable8English).toContain('the marking criteria')
  })
  it('labels only the two endpoint anchors and keeps both instruction blocks outside questions as unconnected prepared content', () => {
    expect(d.responseSets).toHaveLength(1)
    const expected = ['完全不符合我','2','3','4','5','6','非常符合我'].map((label,i) => ({ value: String(i+1), score:i+1,label }))
    expect(d.responseSets[0].options).toEqual(expected)
    expect(bilingual.options.map(o => o.originalEnglish)).toEqual(['Not at all true of me','2','3','4','5','6','Very true of me'])
    expect(bilingual.instructions.map(i => [i.beforeItemCode,i.throughItemCode])).toEqual([[code(1),code(17)],[code(18),code(44)]])
    expect(bilingual.instructions[0].originalEnglish).toContain('motivation for and attitudes')
    expect(bilingual.instructions[1].originalEnglish).toContain('learning strategies')
    const sidecar = JSON.parse(readFileSync(resolve(archive, 'administration-sidecar.prepared.json'), 'utf8')) as { status: string; instructions: typeof bilingual.instructions; recallPeriod: unknown }
    expect(sidecar.status).toBe('PREPARED_NOT_RUNTIME_CONNECTED')
    expect(sidecar.instructions).toEqual(bilingual.instructions)
    expect(sidecar.recallPeriod).toBeNull()
    expect(d.items[0].content).not.toMatch(/请|对错|选7|选1/)
    expect(d.items[17].content).not.toMatch(/请|对错|选7|选1/)
  })
  it('defines precisely ten direct means with the author denominators and no reverse, total or inferred higher-order score', () => {
    expect(d.scoring.scores.map(s => s.key)).toEqual(keys)
    expect(d.scoring.scores.map(s => s.type)).toEqual(Array(10).fill('dimension'))
    expect(d.scoring.scores.map(s => s.source)).toEqual(facetCodes.map(nums => ({ type:'items',items:nums.map(n => ({itemCode:code(n),weight:1})),aggregation:'mean' })))
    expect(d.scoring.scores.every(s => s.canonical && s.direction === 'higher_is_more' && s.displayPrecision === 2)).toBe(true)
    expect(d.scoring.itemRules).toEqual(Array.from({length:44},(_,i) => ({ itemCode:code(i+1),transform:{type:'identity'} })))
    expect(d.scoring.defaultMissingPolicy).toEqual({type:'complete_required'})
    expect(d.scoring.scores.every(s => s.missingPolicy?.type === 'complete_required')).toBe(true)
    expect(source.catalog.administration.layoutConstraints.join(' ')).toContain('complete_required是平台')
  })
  for (const fixture of pkg.goldenCases) it(`matches independently pinned arithmetic: ${fixture.name}`, () => {
    const actual = scoreScale(d, fixture.answers)
    expect(actual.quality.status).toBe(fixture.expected.quality)
    expect(actual.scores.map(s => s.key)).toEqual(keys)
    expect(Object.fromEntries(actual.scores.map(s => [s.key,s.value]))).toEqual(fixture.expected.scores)
    expect(actual.scores.every(s => s.range?.min === 1 && s.range?.max === 7 && !s.prorated)).toBe(true)
  })
  it('checks every legal answer moves only its own facet by its direct fraction of the facet denominator', () => {
    for(let n=1;n<=44;n++) for(let value=1;value<=7;value++) {
      const facet = facetCodes.findIndex(nums => nums.includes(n))
      const actual = scoreScale(d, allFour.map(a => a.itemCode === code(n) ? {...a,responseValue:String(value)} : a))
      actual.scores.forEach((s,j) => expect(s.value).toBeCloseTo(j === facet ? 4 + (value-4)/facetCodes[j].length : 4,12))
      expect(actual.itemScores.find(i => i.itemCode === code(n))?.score).toBe(value)
    }
  })
  it('never fills zero or changes the denominator for any omitted item and suppresses interpretation for incomplete results', () => {
    for(let n=1;n<=44;n++) {
      const facet = facetCodes.findIndex(nums => nums.includes(n))
      const actual = build(allFour.filter(a => a.itemCode !== code(n)))
      expect(actual.quality.status).toBe('invalid')
      expect(actual.scores.map(s => s.value)).toEqual(keys.map((_,j) => j === facet ? null : 4))
      expect(actual.scores.every(s => !s.prorated)).toBe(true)
      expect(actual.interpretations).toEqual([])
      expect(actual.itemScores).toHaveLength(43)
    }
    expect(build([]).scores.every(s => s.value === null)).toBe(true)
  })
  it('rejects illegal, duplicate and unknown responses instead of coercing them into legal scores', () => {
    for(const responseValue of ['0','8','','bad',2.5,4,Number.NaN]) expect(() => build([{itemCode:code(1),responseValue},...allFour.slice(1)])).toThrow('量表回答不合法')
    expect(() => build([...allFour,allFour[0]])).toThrow('量表回答不合法')
    expect(() => build([...allFour,{itemCode:code(45),responseValue:'4'}])).toThrow('量表回答不合法')
  })
  it('requires adult SELF and explicit current university online or blended course context without inferring missing facts', () => {
    const eligibility = (ageMonths?: number, assessmentContext?: string, respondentType: 'SELF'|'PARENT' = 'SELF') => evaluateInstrumentEligibility(source.applicability!, {respondentType,subject: ageMonths === undefined ? undefined : {ageMonths},assessmentContext,availableContextKeys:[]})
    const context = 'UNIVERSITY_ONLINE_OR_BLENDED_CURRENT_COURSE'
    expect(eligibility(216,context).outcome).toBe('ELIGIBLE')
    expect(eligibility(1200,context).outcome).toBe('ELIGIBLE')
    expect(eligibility(215,context).outcome).toBe('INELIGIBLE')
    expect(eligibility(undefined,context).outcome).toBe('INDETERMINATE')
    expect(eligibility(360).outcome).toBe('INDETERMINATE')
    expect(eligibility(360,'K12_ONLINE_COURSE').outcome).toBe('INELIGIBLE')
    expect(eligibility(360,context,'PARENT').outcome).toBe('INELIGIBLE')
  })
  it('builds five actual ten-part score-only reports with consistent versions and no score-contingent bands', () => {
    const reports = pkg.goldenCases.filter(f => f.expected.quality === 'interpretable').map(f => ({fixture:f.name,answers:f.answers,result:build(f.answers)}))
    expect(reports).toHaveLength(5)
    for(const {result:r} of reports) {
      expect(r.interpretations).toHaveLength(10)
      expect(r.interpretations.map(i => i.scoreKey)).toEqual(keys)
      for(const feedback of r.interpretations) {
        expect(feedback.label).toBeNull()
        expect(feedback.referenceVersion).toBeNull()
        expect(feedback.interpretation.length).toBeGreaterThanOrEqual(100)
        expect(feedback.guidance.some(g => g.category === 'reflection')).toBe(true)
        expect(feedback.guidance.some(g => g.category === 'strategy')).toBe(true)
        expect(feedback.interpretation).not.toMatch(/你的能力很差|诊断为|人格缺陷|一定能提高成绩|低于4|高于4|百分位/)
      }
      expect(r.references).toEqual([])
      expect(r.method).toMatchObject({instrumentVersion:'1.0.0',scoringVersion:'1.0.0',reportVersion:'1.0.0',localizationVersion:'1.0.0',referenceVersions:[]})
    }
    keys.forEach((_,j) => expect(new Set(reports.map(r => r.result.interpretations[j].interpretation)).size).toBe(1))
    expect(d.report.interpretations.every(i => i.source.type === 'score_only' && i.bands.length === 0)).toBe(true)
    expect(d.referencePolicy).toEqual({type:'none'})
    expect(pkg.references).toEqual([])
    const plan = JSON.parse(readFileSync(resolve(archive,'parameter-plan.json'),'utf8')) as {runtimeIndependentParameterVersionSupported:boolean;parameterPlanVersion:string}
    expect(plan.runtimeIndependentParameterVersionSupported).toBe(false)
    expect(plan.parameterPlanVersion).toBe('1.0.0')
    if(process.env.SRLO44_REPORT_EVIDENCE_PATH) writeFileSync(process.env.SRLO44_REPORT_EVIDENCE_PATH,JSON.stringify(reports,null,2)+'\n')
  })
  it('explains negative emotion and extrinsic motivation in their actual directions rather than universally better or worse', () => {
    const negative = d.report.interpretations[3], extrinsic = d.report.interpretations[2]
    expect(negative.summary).toContain('这些不舒服的感受更多')
    expect(negative.summary).not.toContain('反向计分')
    expect(extrinsic.summary).toContain('并不统一表示学习更好或更差')
    expect(d.scoring.scores[3].description).toContain('不反向')
    expect(d.scoring.scores[2].description).toContain('不统一表示好坏')
  })
  it('keeps report, catalog and measurement identities separate without altering prior definitions', () => {
    const hash = hashScaleDefinition(d)
    const reportChange = structuredClone(d); reportChange.report.reportVersion='1.0.1';reportChange.report.disclaimer+=' 说明修订'
    expect(hashScaleDefinition(reportChange)).toBe(hash)
    expect(reportChange.scoring.scoringVersion).toBe('1.0.0')
    const catalogChange=structuredClone(source);catalogChange.catalog.construct.constructOverlapTags.push('新检索词')
    expect(hashScaleDefinition(projectScalePackage(catalogChange)!.definition)).toBe(hash)
    const contentChange=structuredClone(d);contentChange.items[0].content+='（修订）'
    expect(hashScaleDefinition(contentChange)).not.toBe(hash)
  })
  it('retains exact CC BY4 scope, eight carrier differences and the correction without fabricating Chinese validation or a country', () => {
    expect(d.license).toMatchObject({status:'verified',redistribution:'allowed'})
    for(const text of ['CC BY 4.0','Broadbent','Panadero','Lodge','Fuller-Tyszkiewicz','26a57eed8fb02538edfb306303da61ed7c9a7460eccfc320f935d8e88402e5a4']) expect(d.license.note).toContain(text)
    expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL','COMMERCIAL'])
    expect(source.localization).toMatchObject({sourceLocale:'en',targetLocale:'zh-CN',expertReviewStatus:'PENDING',cognitiveDebriefStatus:'NOT_ESTABLISHED',localEvidenceRefs:[]})
    expect(source.catalog.evidence).toEqual([])
    expect(source.catalog.population.populationNotes).toContain('随机分313/321')
    const diffs=JSON.parse(readFileSync(resolve(archive,'cross-carrier-differences.json'),'utf8')) as {differences:unknown[];selectedQuestionCarrier:string}
    expect(diffs.differences).toHaveLength(8)
    expect(diffs.selectedQuestionCarrier).toContain('Corrected2022publishedTable8')
    const refs=readFileSync(resolve(archive,'scoring-and-parameters.md'),'utf8')
    expect(refs).toContain('09323-w')
    expect(refs).toContain('Extrinsic→Intrinsic')
    const tags=source.catalog.construct.constructOverlapTags
    expect(new Set(tags).size).toBe(tags.length)
    expect(tags.length).toBeGreaterThanOrEqual(35)
    for(const axis of ['domain','construct','orientation','population','response','use','license','language_validation']) expect(tags.some(t => t.startsWith(axis+':'))).toBe(true)
    expect(tags.filter(t => /[\u4e00-\u9fff]/.test(t)).length).toBeGreaterThanOrEqual(10)
    expect(tags).not.toContain('orientation:ACT');expect(tags).not.toContain('orientation:DBT')
  })
})
