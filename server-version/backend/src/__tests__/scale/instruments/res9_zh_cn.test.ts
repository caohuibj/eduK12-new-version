import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/res9_zh_cn/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { validateScalePackage } from '../../../modules/scale/scale-package.registry'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

const pkg = projectScalePackage(source)!
const definition = pkg.definition
const answers = pkg.goldenCases.find(fixture => fixture.name === 'midpoint')!.answers
const itemCodes = Array.from({ length: 9 }, (_, index) => `RES_${String(index + 1).padStart(2, '0')}`)
const stems = [
  '我对自己有信心',
  '我可以很容易就适应困境',
  '我有毅力',
  '遇到挫折后我可以很容易地继续下去',
  '我很有韧性',
  '我能很好的应对突发问题',
  '我欣赏我自己',
  '我可以同时处理很多事情',
  '我相信我自己',
]
const buildResult = (input = answers) => buildScaleResult({
  scaleId: 'synthetic-res9-content-test',
  instrumentKey: source.identity.instrumentKey,
  name: source.catalog.identity.canonicalName,
  instrumentVersion: source.identity.instrumentVersion,
  definition,
  answers: input,
})

describe('res9_zh_cn content contract', () => {
  it('is a valid DRAFT candidate without invented expert or scientific approval', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(validateScalePackage(pkg).valid).toBe(true)
    expect(source.identity).toEqual({ instrumentKey: 'res9_zh_cn', instrumentVersion: '1.0.0' })
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.catalog.scientificMaturity).toBe('PILOT')
    expect(source.scientificReview).toBeUndefined()
    expect(source.localization?.expertReviewStatus).toBe('PENDING')
    expect(source.localization?.reviewStatus).toBe('PENDING')
    expect(source.localization?.cognitiveDebriefStatus).toBe('NOT_ESTABLISHED')
  })

  it('preserves all nine Table 2 stems verbatim, including item 6, and their order', () => {
    expect(definition.items.map(item => item.itemCode)).toEqual(itemCodes)
    expect(definition.items.map(item => item.content)).toEqual(stems)
    expect(definition.items.map(item => item.sortOrder)).toEqual(Array.from({ length: 9 }, (_, i) => i))
    expect(definition.items.every(item => item.required && item.randomizeOptions === false)).toBe(true)
    expect(definition.display.randomizeItems).toBe(false)
    expect(definition.items[0].content).not.toContain('请选择')
    expect(definition.items[5].content).toContain('很好的')
  })

  it('uses only the Chinese one-factor total, with nine positive equal-weight items', () => {
    expect(definition.scoring.itemRules).toEqual(itemCodes.map(itemCode => ({ itemCode, transform: { type: 'identity' } })))
    expect(definition.scoring.scores).toHaveLength(1)
    expect(definition.scoring.scores[0]).toMatchObject({
      key: 'resilience_total', type: 'total', canonical: true, direction: 'higher_is_more',
      source: { type: 'items', aggregation: 'sum', items: itemCodes.map(itemCode => ({ itemCode, weight: 1 })) },
    })
    expect(definition.scoring.defaultMissingPolicy).toEqual({ type: 'complete_required' })
    expect(definition.scoring.scores[0].missingPolicy).toEqual({ type: 'complete_required' })
  })

  it('separates published stems from platform-translated instructions and response labels', () => {
    expect(definition.responseSets).toEqual([{
      key: 'res_agreement_0_4',
      options: ['完全不同意', '不同意', '中立', '同意', '完全同意'].map((label, score) => ({ value: String(score), label, score })),
    }])
    expect(source.localization?.sourceLocale).toBe('zh-CN')
    expect(source.localization?.adaptationMethod).toBe('ORIGINAL_SOURCE')
    expect(source.localization?.translationSource).toContain('没有重新翻译题干')
    expect(source.localization?.translationSource).toContain('平台工作翻译')
    expect(source.catalog.administration.layoutConstraints.join(' ')).toContain('不把指导语拼入首题')
    expect(source.catalog.administration.timeFrame).toContain('通常如何应对困难情境')
  })

  for (const fixture of pkg.goldenCases) {
    it(`scores the source golden case: ${fixture.name}`, () => {
      const result = scoreScale(definition, fixture.answers)
      expect(result.quality.status).toBe(fixture.expected.quality)
      expect(Object.fromEntries(result.scores.map(score => [score.key, score.value]))).toEqual(fixture.expected.scores)
      expect(result.scores.map(score => score.key)).toEqual(fixture.expected.totalScoreKeys)
    })
  }

  it('does not impute, prorate or interpret eight answers or no answers', () => {
    for (const input of [answers.slice(0, 8), []]) {
      const result = buildResult(input)
      expect(result.quality.status).toBe('invalid')
      expect(result.scores).toHaveLength(1)
      expect(result.scores[0].value).toBeNull()
      expect(result.interpretations).toEqual([])
      expect(result.references).toEqual([])
    }
  })

  it('rejects out-of-range, fractional and unknown answers instead of treating them as zero', () => {
    for (const responseValue of ['-1', '5', '1.5', 'INVALID']) {
      expect(() => buildResult([{ ...answers[0], responseValue }, ...answers.slice(1)])).toThrow('量表回答不合法')
    }
    expect(() => buildResult([...answers, { itemCode: 'RES_10', responseValue: '2' }])).toThrow('量表回答不合法')
    expect(() => buildResult([...answers, answers[0]])).toThrow('量表回答不合法')
  })

  it('restricts the source policy to noncommercial use and keeps third-party attribution', () => {
    expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL'])
    expect(definition.license).toMatchObject({ status: 'verified', redistribution: 'restricted' })
    expect(definition.license.note).toContain('https://creativecommons.org/licenses/by-nc/4.0/')
    expect(definition.license.note).toContain('© 2022 The Author(s)')
    expect(definition.license.note).toContain('不被仓库MIT许可证覆盖')
    expect(definition.license.note).toContain('作者未背书')
    expect(source.catalog.construct.constructOverlapTags).toContain('license:noncommercial_only')
  })

  it('retains adult-only eligibility and does not infer eligibility when age is missing', () => {
    expect(source.catalog.population.minAge).toBe(18)
    expect(source.applicability?.subject?.ageMonths).toEqual({ minInclusive: 216 })
    const evaluate = (ageMonths?: number) => evaluateInstrumentEligibility(source.applicability!, {
      respondentType: 'SELF', subject: ageMonths === undefined ? undefined : { ageMonths }, availableContextKeys: [],
    }).outcome
    expect(evaluate(215)).toBe('INELIGIBLE')
    expect(evaluate(216)).toBe('ELIGIBLE')
    expect(evaluate()).toBe('INDETERMINATE')
    expect(definition.report.audienceContract?.respondent).toBe('ADULT_SELF')
    expect(source.catalog.population.populationNotes).toContain('不表示中小学生')
  })

  it('records scoped adult source evidence without reusing original-language subscales', () => {
    expect(source.catalog.evidence).toHaveLength(2)
    expect(source.catalog.evidence.every(record => record.sampleSize === 484 && record.locale === 'zh-CN')).toBe(true)
    expect(source.catalog.evidence[0].studyDesign).toContain('单因子')
    expect(source.catalog.evidence[0].studyDesign).toContain('49.92%')
    expect(source.catalog.evidence[1].studyDesign).toContain('0.88')
    expect(source.catalog.construct.constructOverlapTags).toContain('population:not_k12_validated')
    expect(source.catalog.construct.constructOverlapTags).not.toContain('orientation:ACT')
    expect(source.catalog.construct.constructOverlapTags).not.toContain('orientation:DBT')
  })

  it('serializes an understandable report without thresholds, references or rankings', () => {
    const result = parseScaleResultV2(JSON.parse(JSON.stringify(buildResult())))
    expect(result.scores[0].value).toBe(18)
    expect(result.interpretations).toHaveLength(1)
    expect(result.interpretations[0]).toMatchObject({ label: null, referenceVersion: null })
    expect(result.interpretations[0].guidance.length).toBeGreaterThanOrEqual(2)
    expect(definition.report.interpretations[0].summary.length).toBeGreaterThanOrEqual(100)
    expect(definition.report.interpretations[0].source).toEqual({ type: 'score_only' })
    expect(definition.report.interpretations[0].bands).toEqual([])
    expect(result.references).toEqual([])
    expect(pkg.references).toEqual([])
    expect(source.catalog.referenceApplicability).toEqual([])
    expect(definition.referencePolicy).toEqual({ type: 'none' })
    expect(Object.values(source.disclosure!.audiences).every(audience => audience?.scoreDerivedLabels === false && audience?.references === false)).toBe(true)
  })

  it('keeps documentation examples synthetic and source population statistics out of runtime references', () => {
    // The repository's Vitest invocation runs from server-version/backend.
    const docs = resolve(process.cwd(), '../../docs/scale-instruments/research-drafts/res9_zh_cn/1.0.0')
    const example = JSON.parse(readFileSync(resolve(docs, 'report-example.json'), 'utf8'))
    const dossier = JSON.parse(readFileSync(resolve(docs, 'external-reference-dossier.json'), 'utf8'))
    const bilingual = JSON.parse(readFileSync(resolve(docs, 'bilingual-content.json'), 'utf8'))
    expect(example.status).toBe('SYNTHETIC_CONTENT_EXAMPLE_NOT_RUNTIME_OUTPUT')
    expect(scoreScale(definition, example.answers).scores[0].value).toBe(example.expectedRawScore)
    expect(example.expectedRawScore).toBe(16)
    expect(example.percentile).toBeNull()
    expect(example.referenceVersion).toBeNull()
    expect(dossier.activationStatus).toBe('SOURCE_EVIDENCE_ONLY_NOT_RUNTIME_NORMS')
    expect(dossier.runtimeReferenceSets).toEqual([])
    expect(dossier.thresholds).toEqual([])
    expect(dossier.descriptiveStatisticsOnly.usedForIndividualComparison).toBe(false)
    expect(bilingual.items.map((item: { zh: string }) => item.zh)).toEqual(stems)
    expect(bilingual.instructions.exact_published_chinese_instruction_available).toBe(false)
  })

  it('keeps measurement and report identity separate on initial version axes', () => {
    expect(definition.scoring.scoringVersion).toBe('1.0.0')
    expect(definition.report.reportVersion).toBe('1.0.0')
    expect(definition.versionAxes).toEqual({ schemaVersion: 1, subjectKey: 'res9', locale: 'zh-CN', localizationVersion: '1.0.0' })
    const changed = structuredClone(definition)
    changed.report.disclaimer += ' 文案'
    expect(hashScaleDefinition(changed)).toBe(hashScaleDefinition(definition))
    changed.items[0].content += ' 改题'
    expect(hashScaleDefinition(changed)).not.toBe(hashScaleDefinition(definition))
  })
})
