import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/ofs10_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { scoreScale, type ScaleAnswer } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

const pkg = projectScalePackage(source)!, d = pkg.definition
const code = (i: number) => `OFS_${String(i).padStart(2, '0')}`
const allThree: ScaleAnswer[] = Array.from({ length: 10 }, (_, i) => ({ itemCode: code(i + 1), responseValue: '3' }))
const build = (answers: ScaleAnswer[]) => parseScaleResultV2(buildScaleResult({ scaleId: 'synthetic-ofs10', instrumentKey: source.identity.instrumentKey, instrumentVersion: source.identity.instrumentVersion, name: source.catalog.identity.canonicalName, definition: d, answers }))
const archive = resolve(__dirname, '../../../../../../docs/scale-instruments/research-drafts/ofs10/1.0.0')
const bilingual = JSON.parse(readFileSync(resolve(archive, 'bilingual-content.json'), 'utf8')) as {
  validatedSourceLocale: string
  instructions: { platformChinese: string[] }
  options: Array<{ platformChinese: string; originalEnglish: string }>
  questions: Array<{ itemCode: string; originalEnglish: string; originalSpanish: string; platformChinese: string; reverse: boolean }>
  translationDecisions: Record<string, string>
}

describe('OFS10 exact 2018 form independent Chinese research working translation', () => {
  it('validates a standalone complete DRAFT source and records separate version identities', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(source.identity).toEqual({ instrumentKey: 'ofs10_zh_cn_research', instrumentVersion: '1.0.0' })
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.scientificReview).toBeUndefined()
    expect(d.scoring.scoringVersion).toBe('1.0.0')
    expect(d.report.reportVersion).toBe('1.0.0')
    expect(d.versionAxes).toEqual({ schemaVersion: 1, subjectKey: 'ofs10', locale: 'zh-CN', localizationVersion: '1.0.0' })
  })
  it('keeps all ten source items, five labelled anchors and independent prepared instructions', () => {
    expect(d.items.map(i => i.itemCode)).toEqual(Array.from({ length: 10 }, (_, i) => code(i + 1)))
    expect(d.items.map(i => i.content)).toEqual(bilingual.questions.map(i => i.platformChinese))
    expect(d.items.every(i => i.required && !i.randomizeOptions)).toBe(true)
    expect(d.display.randomizeItems).toBe(false)
    expect(d.responseSets).toHaveLength(1)
    expect(d.responseSets[0].options.map(o => [o.value, o.score, o.label])).toEqual(['非常不同意', '有些不同意', '既不同意也不反对', '有些同意', '非常同意'].map((label, i) => [String(i + 1), i + 1, label]))
    expect(bilingual.options.map(o => o.originalEnglish)).toEqual(['Strongly disagree', 'Somewhat disagree', 'Neither agree nor disagree', 'Somewhat agree', 'Strongly agree'])
    expect(bilingual.instructions.platformChinese).toHaveLength(3)
    const sidecar = JSON.parse(readFileSync(resolve(archive, 'administration-sidecar.prepared.json'), 'utf8')) as { status: string; instructions: string[]; recallPeriod: unknown }
    expect(sidecar.status).toBe('PREPARED_NOT_RUNTIME_CONNECTED')
    expect(sidecar.instructions).toEqual(bilingual.instructions.platformChinese)
    expect(sidecar.recallPeriod).toBeNull()
    expect(Object.prototype.hasOwnProperty.call(source, 'instruction')).toBe(false)
    expect(d.items[0].content).not.toMatch(/请|答案|选项/)
  })
  it('freezes English item eight and uses Spanish only to disambiguate illusions in item five', () => {
    expect(bilingual.questions[4].originalEnglish).toBe('I have a lot of illusions and future plans.')
    expect(bilingual.questions[4].originalSpanish).toBe('Tengo un montón de planes y de ilusiones.')
    expect(d.items[4].content).toContain('憧憬')
    expect(d.items[4].content).not.toMatch(/幻觉|妄想/)
    expect(bilingual.questions[7].originalEnglish).toBe('I know I can overcome the obstacles I encounter in life.')
    expect(bilingual.questions[7].originalSpanish).toBe('Sé que la vida me presentará obstáculos, pero confío en que podré superarlos.')
    expect(d.items[7].content).toBe('我知道自己能克服生活中遇到的障碍。')
    expect(bilingual.translationDecisions.OFS_08).toContain('不拼接')
    expect(bilingual.validatedSourceLocale).toBe('es')
  })
  it('defines only the author total sum with precisely reverse item six and a disclosed platform complete-answer policy', () => {
    expect(d.scoring.scores).toHaveLength(1)
    expect(d.scoring.scores[0]).toMatchObject({ key: 'openness_to_future', type: 'total', canonical: true, displayPrecision: 0, direction: 'higher_is_more', missingPolicy: { type: 'complete_required' } })
    expect(d.scoring.scores[0].source).toEqual({ type: 'items', items: Array.from({ length: 10 }, (_, i) => ({ itemCode: code(i + 1), weight: 1 })), aggregation: 'sum' })
    expect(d.scoring.itemRules).toEqual(Array.from({ length: 10 }, (_, i) => ({ itemCode: code(i + 1), transform: { type: i === 5 ? 'reverse' : 'identity' } })))
    expect(bilingual.questions.filter(q => q.reverse).map(q => q.itemCode)).toEqual([code(6)])
    expect(d.scoring.defaultMissingPolicy).toEqual({ type: 'complete_required' })
    expect(source.catalog.administration.layoutConstraints.join(' ')).toContain('complete_required是平台政策')
  })
  for (const fixture of pkg.goldenCases) it(`matches pinned independent arithmetic: ${fixture.name}`, () => {
    const actual = scoreScale(d, fixture.answers)
    expect(actual.quality.status).toBe(fixture.expected.quality)
    expect(actual.scores.map(s => s.key)).toEqual(['openness_to_future'])
    expect(Object.fromEntries(actual.scores.map(s => [s.key, s.value]))).toEqual(fixture.expected.scores)
    expect(actual.scores[0].range).toEqual({ min: 10, max: 50 })
    if (fixture.answers.length === 10) {
      const six = Number(fixture.answers.find(a => a.itemCode === code(6))!.responseValue)
      const handSum = fixture.answers.filter(a => a.itemCode !== code(6)).reduce((sum, a) => sum + Number(a.responseValue), 0) + (6 - six)
      expect(actual.scores[0].value).toBe(handSum)
    }
  })
  it('checks every legal item response direction without changing any other item score', () => {
    const baseline = scoreScale(d, allThree)
    for (let n = 1; n <= 10; n++) for (let value = 1; value <= 5; value++) {
      const output = scoreScale(d, allThree.map(a => a.itemCode === code(n) ? { ...a, responseValue: String(value) } : a))
      expect(output.scores[0].value).toBe(30 + (n === 6 ? 3 - value : value - 3))
      expect(output.itemScores.filter(i => i.itemCode !== code(n))).toEqual(baseline.itemScores.filter(i => i.itemCode !== code(n)))
    }
  })
  it('does not interpret or fill zero for any single omission or an empty form', () => {
    for (let n = 1; n <= 10; n++) {
      const r = build(allThree.filter(a => a.itemCode !== code(n)))
      expect(r.quality.status).toBe('invalid')
      expect(r.scores[0].value).toBeNull()
      expect(r.scores[0].prorated).toBe(false)
      expect(r.interpretations).toEqual([])
      expect(r.itemScores).toHaveLength(9)
    }
    expect(build([]).scores[0].value).toBeNull()
  })
  it('rejects invalid response values, duplicate answers and unknown item codes', () => {
    for (const responseValue of ['0', '6', '', 'bad', 2.5, 3, Number.NaN]) expect(() => build([{ itemCode: code(1), responseValue }, ...allThree.slice(1)])).toThrow('量表回答不合法')
    expect(() => build([...allThree, allThree[0]])).toThrow('量表回答不合法')
    expect(() => build([...allThree, { itemCode: code(11), responseValue: '3' }])).toThrow('量表回答不合法')
  })
  it('uses the provisional adult self-report boundary and refuses to infer a missing age', () => {
    const eligibility = (ageMonths?: number, respondentType: 'SELF' | 'PARENT' = 'SELF') => evaluateInstrumentEligibility(source.applicability!, { respondentType, subject: ageMonths === undefined ? undefined : { ageMonths }, availableContextKeys: [] })
    expect(eligibility(215).outcome).toBe('INELIGIBLE')
    expect(eligibility(216).outcome).toBe('ELIGIBLE')
    expect(eligibility(1200).outcome).toBe('ELIGIBLE')
    expect(eligibility().outcome).toBe('INDETERMINATE')
    expect(eligibility(360, 'PARENT').outcome).toBe('INELIGIBLE')
  })
  it('builds actual uniform score-only feedback without Spanish diagnostic cutoffs or personalised bands', () => {
    const reports = pkg.goldenCases.filter(f => f.expected.quality === 'interpretable').map(f => ({ fixture: f.name, answers: f.answers, result: build(f.answers) }))
    expect(reports).toHaveLength(7)
    for (const { result: r } of reports) {
      expect(r.interpretations).toHaveLength(1)
      const feedback = r.interpretations[0]
      expect(feedback.label).toBeNull()
      expect(feedback.referenceVersion).toBeNull()
      expect(feedback.interpretation.length).toBeGreaterThanOrEqual(100)
      expect(feedback.guidance.some(g => g.category === 'reflection')).toBe(true)
      expect(feedback.guidance.some(g => g.category === 'strategy')).toBe(true)
      expect(feedback.interpretation + feedback.guidance.map(g => g.text).join('')).not.toMatch(/37[.,]5|38|ROC|CFA|Cronbach|百分位|诊断为|疗效|你的能力很差|乐观型人格/)
      expect(r.references).toEqual([])
      expect(r.method).toMatchObject({ instrumentVersion: '1.0.0', scoringVersion: '1.0.0', reportVersion: '1.0.0', localizationVersion: '1.0.0', referenceVersions: [] })
    }
    expect(new Set(reports.map(r => r.result.interpretations[0].interpretation)).size).toBe(1)
    expect(d.report.interpretations[0].source).toEqual({ type: 'score_only' })
    expect(d.report.interpretations[0].bands).toEqual([])
    expect(d.referencePolicy).toEqual({ type: 'none' })
    expect(pkg.references).toEqual([])
    const parameterPlan = JSON.parse(readFileSync(resolve(archive, 'parameter-plan.json'), 'utf8')) as { runtimeIndependentParameterVersionSupported: boolean; parameterPlanVersion: string }
    expect(parameterPlan.runtimeIndependentParameterVersionSupported).toBe(false)
    expect(parameterPlan.parameterPlanVersion).toBe('1.0.0')
    if (process.env.OFS10_REPORT_EVIDENCE_PATH) writeFileSync(process.env.OFS10_REPORT_EVIDENCE_PATH, JSON.stringify(reports, null, 2) + '\n')
  })
  it('keeps version axes independent and catalogue discovery outside the measurement definition', () => {
    const originalHash = hashScaleDefinition(d)
    const updatedReport = structuredClone(d)
    updatedReport.report.reportVersion = '1.0.1'; updatedReport.report.disclaimer += ' 说明更新'
    expect(hashScaleDefinition(updatedReport)).toBe(originalHash)
    expect(updatedReport.scoring.scoringVersion).toBe('1.0.0')
    const updatedCatalogue = structuredClone(source)
    updatedCatalogue.catalog.construct.constructOverlapTags.push('未来研究检索词')
    expect(hashScaleDefinition(projectScalePackage(updatedCatalogue)!.definition)).toBe(originalHash)
    const updatedContent = structuredClone(d); updatedContent.items[0].content += '（修订）'
    expect(hashScaleDefinition(updatedContent)).not.toBe(originalHash)
    expect(source.identity.instrumentKey).not.toMatch(/ipip|lot_r|act|dbt/)
  })
  it('preserves exact reuse permissions, Spanish-only evidence and pending Chinese localisation', () => {
    expect(d.license).toMatchObject({ status: 'verified', redistribution: 'allowed' })
    for (const value of ['CC BY 4.0', 'Permission of Botella et al. (2017)', 'Reproducido con permiso de Botella et al. (2017)', '305d93d48fbf5c40d59dff2e8a977ca46b10be5e435dde73f47cc2d0c0aad500']) expect(d.license.note).toContain(value)
    expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL', 'COMMERCIAL'])
    expect(source.localization).toMatchObject({ sourceLocale: 'en', targetLocale: 'zh-CN', expertReviewStatus: 'PENDING', cognitiveDebriefStatus: 'NOT_ESTABLISHED', localEvidenceRefs: [] })
    expect(source.catalog.evidence).toHaveLength(1)
    expect(source.catalog.evidence[0]).toMatchObject({ locale: 'es', territory: 'ES', sampleSize: 1302, doi: '10.1186/s12955-018-0889-8' })
    expect(source.catalog.referenceApplicability).toEqual([])
    const tags = source.catalog.construct.constructOverlapTags
    expect(new Set(tags).size).toBe(tags.length)
    expect(tags.length).toBeGreaterThanOrEqual(40)
    for (const axis of ['domain', 'construct', 'orientation', 'population', 'response', 'use', 'license', 'language_validation']) expect(tags.some(t => t.startsWith(axis + ':'))).toBe(true)
    expect(tags).not.toContain('orientation:ACT')
    expect(tags).not.toContain('orientation:DBT')
    expect(tags.filter(t => /[\u4e00-\u9fff]/.test(t)).length).toBeGreaterThanOrEqual(8)
  })
})
