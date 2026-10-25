import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/ccfq18_zh_cn/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { hashScaleDefinition, validateScaleDefinition } from '../../../modules/scale/scale-definition'
import { scoreScale, type ScaleAnswer } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

// Direct import: this standalone draft is not installed in shared registries.
const pkg = projectScalePackage(source)!
const d = pkg.definition
const scoreKeys = ['cognitive_control_over_emotion', 'appraisal_and_coping_flexibility']
const reverseItems = [2, 4, 11, 15, 16, 18]
const controlItems = [2, 4, 7, 8, 11, 14, 15, 16, 18]
const appraisalItems = [1, 3, 5, 6, 9, 10, 12, 13, 17]
const codes = Array.from({ length: 18 }, (_, index) => `CCFQ${index + 1}`)
const midpoint: ScaleAnswer[] = codes.map(itemCode => ({ itemCode, responseValue: '4' }))
const result = (answers: ScaleAnswer[] = midpoint) => buildScaleResult({
  scaleId: 'synthetic-local-only-ccfq18', instrumentKey: source.identity.instrumentKey,
  name: source.catalog.identity.canonicalName, instrumentVersion: source.identity.instrumentVersion,
  definition: d, answers,
})
const scoresFor = (answers: ScaleAnswer[]) => scoreScale(d, answers).scores.map(score => score.value)
const expectedChineseItems = [
  '我会先权衡可选的办法，再决定如何行动。',
  '我觉得自己失去了对想法和情绪的控制。',
  '我会从多个角度看待这件事。',
  '我很难放下那些不由自主冒出来的想法或情绪。',
  '在作出回应之前，我会从多个视角考虑这件事。',
  '在行动之前，我会花时间想出几种尽可能妥善应对这件事的办法。',
  '我发现自己很容易暂且把令人不快的想法或情绪放到一边。',
  '对我来说，不去理会那些分散注意力的想法很容易。',
  '在决定如何回应之前，我能很容易地想到多种应对办法。',
  '在作出反应之前，我会花时间从不同角度看待事情。',
  '令人心烦的想法或感受很容易分散我的注意力。',
  '我会花时间想出不止一种解决问题的办法。',
  '我会通过把事情放在具体背景中理解，来控制自己的想法和感受。',
  '我能够保持对自己想法和情绪的控制。',
  '我很难管理自己的情绪。',
  '我的想法和情绪会妨碍我集中注意力。',
  '我会通过换一种方式理解这件事，来调节自己的想法或感受。',
  '我很难把注意力从消极的想法或感受上移开。',
]

describe('CCFQ-18 standalone Chinese working-draft content contract', () => {
  it('passes strict source and definition validation without registry installation', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(validateScaleDefinition(d, { instrumentClass: 'STANDARD', forPublish: false }).issues.filter(issue => issue.severity === 'error')).toEqual([])
    expect(source.identity).toEqual({ instrumentKey: 'ccfq18_zh_cn', instrumentVersion: '1.0.0' })
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.catalog.scientificMaturity).toBe('PILOT')
    expect(source.scientificReview).toBeUndefined()
  })
  it('preserves final administration order and translations without instructions in item stems', () => {
    expect(d.items.map(item => item.itemCode)).toEqual(codes)
    expect(d.items.map(item => item.sortOrder)).toEqual(Array.from({ length: 18 }, (_, i) => i))
    expect(d.items.map(item => item.content)).toEqual(expectedChineseItems)
    expect(d.items.every(item => item.required && !item.randomizeOptions)).toBe(true)
    expect(d.display.randomizeItems).toBe(false)
    expect(source.catalog.administration.layoutConstraints.join(' ')).toContain('#356')
    expect(source.catalog.administration.layoutConstraints.join(' ')).toContain('不拼接至题1')
    expect(source.catalog.administration.timeFrame).toContain('无固定近期回忆时段')
  })
  it('keeps numeric options and translates only the two source-verified endpoints', () => {
    const options = d.responseSets[0].options
    expect(options.map(option => option.value)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(options.map(option => option.score)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(options.map(option => option.label)).toEqual(['非常不同意', '2', '3', '4', '5', '6', '非常同意'])
    expect(d.report.limitations.join(' ')).toContain('中间2–6仅显示数字')
  })
  it('declares six reverse keys and two disjoint nine-item means, never a total', () => {
    expect(d.scoring.itemRules.filter(rule => rule.transform.type === 'reverse').map(rule => rule.itemCode))
      .toEqual(reverseItems.map(number => `CCFQ${number}`))
    expect(d.scoring.scores.map(score => score.key)).toEqual(scoreKeys)
    expect(d.scoring.scores.map(score => score.type)).toEqual(['dimension', 'dimension'])
    expect(d.scoring.scores.map(score => score.source.type === 'items' ? score.source.items.map(item => item.itemCode) : []))
      .toEqual([controlItems, appraisalItems].map(items => items.map(number => `CCFQ${number}`)))
    expect(new Set([...controlItems, ...appraisalItems]).size).toBe(18)
    expect(d.scoring.scores.every(score => score.source.aggregation === 'mean' && score.canonical)).toBe(true)
    expect(d.scoring.scores.every(score => score.source.type === 'items' && score.source.items.every(item => item.weight === 1))).toBe(true)
    expect(d.scoring.scorerKey).toBeUndefined()
  })
  for (const fixture of pkg.goldenCases) {
    it(`scores golden case ${fixture.name} through the actual engine`, () => {
      const actual = scoreScale(d, fixture.answers)
      expect(actual.quality.status).toBe(fixture.expected.quality)
      expect(actual.scores.map(score => score.key)).toEqual(fixture.expected.totalScoreKeys)
      expect(Object.fromEntries(actual.scores.map(score => [score.key, score.value]))).toEqual(fixture.expected.scores)
      expect(actual.scores.every(score => !score.prorated && score.type === 'dimension')).toBe(true)
    })
  }
  it('applies 8-x or identity independently for every item and all seven response values', () => {
    for (let number = 1; number <= 18; number += 1) {
      for (let response = 1; response <= 7; response += 1) {
        const answers = midpoint.map(answer => answer.itemCode === `CCFQ${number}` ? { ...answer, responseValue: String(response) } : answer)
        const scored = scoreScale(d, answers).itemScores.find(item => item.itemCode === `CCFQ${number}`)!
        expect(scored.baseScore).toBe(response)
        expect(scored.score).toBe(reverseItems.includes(number) ? 8 - response : response)
      }
    }
  })
  it('matches independently calculated mixed means instead of sums or a global total', () => {
    const responses = [1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4]
    expect(scoresFor(codes.map((itemCode, index) => ({ itemCode, responseValue: String(responses[index]) }))))
      .toEqual([46 / 9, 34 / 9])
    expect(d.report.primaryScoreKeys).toEqual(scoreKeys)
    expect(d.report.scoreOrder).toEqual(scoreKeys)
  })
  it('keeps dimension membership isolated when each item changes', () => {
    for (let number = 1; number <= 18; number += 1) {
      const values = scoresFor(midpoint.map(answer => answer.itemCode === `CCFQ${number}` ? { ...answer, responseValue: '5' } : answer))
      const affected = controlItems.includes(number) ? 0 : 1
      expect(values[affected]).toBeCloseTo(4 + (reverseItems.includes(number) ? -1 : 1) / 9, 12)
      expect(values[1 - affected]).toBe(4)
    }
  })
  it('retains fractional precision and is independent of answer transport order', () => {
    const answers = pkg.goldenCases.find(fixture => fixture.name === 'fractional_means')!.answers
    expect(scoresFor(answers)).toEqual([35 / 9, 37 / 9])
    expect(scoresFor([...answers].reverse())).toEqual(scoresFor(answers))
    expect(d.scoring.scores.every(score => score.displayPrecision === 2)).toBe(true)
  })
  it('requires all nine items per dimension and suppresses interpretation for any missing response', () => {
    expect(d.scoring.defaultMissingPolicy).toEqual({ type: 'complete_required' })
    expect(d.scoring.scores.every(score => score.missingPolicy?.type === 'complete_required')).toBe(true)
    for (let number = 1; number <= 18; number += 1) {
      const actual = result(midpoint.filter(answer => answer.itemCode !== `CCFQ${number}`))
      const affected = controlItems.includes(number) ? 0 : 1
      expect(actual.quality.status).toBe('invalid')
      expect(actual.scores[affected].value).toBeNull()
      expect(actual.scores[affected].status).toBe('not_calculable')
      expect(actual.scores[1 - affected].value).toBe(4)
      expect(actual.scores.every(score => !score.prorated)).toBe(true)
      expect(actual.interpretations).toEqual([])
      expect(actual.references).toEqual([])
    }
    expect(result([]).scores.every(score => score.value === null)).toBe(true)
    expect(result([]).interpretations).toEqual([])
  })
  for (const responseValue of ['0', '8', 'INVALID', '', 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    it(`rejects illegal response ${String(responseValue)} instead of using it as a score`, () => {
      expect(() => result([{ ...midpoint[0], responseValue }, ...midpoint.slice(1)])).toThrow('量表回答不合法')
    })
  }
  it('rejects duplicate and unknown item answers', () => {
    expect(() => result([...midpoint, midpoint[0]])).toThrow('量表回答不合法')
    expect(() => result([...midpoint, { itemCode: 'CCFQ19', responseValue: '4' }])).toThrow('量表回答不合法')
  })
  it('builds serializable descriptive reports at extremes and midpoint without bands or references', () => {
    for (const name of ['minimum_after_reverse', 'midpoint', 'maximum_after_reverse']) {
      const answers = pkg.goldenCases.find(fixture => fixture.name === name)!.answers
      const actual = parseScaleResultV2(JSON.parse(JSON.stringify(result(answers))))
      expect(actual.quality.status).toBe('interpretable')
      expect(actual.scores).toHaveLength(2)
      expect(actual.scores.every(score => score.type === 'dimension' && score.range?.min === 1 && score.range?.max === 7)).toBe(true)
      expect(actual.interpretations).toHaveLength(2)
      expect(actual.interpretations.every(item => item.label === null && item.referenceVersion === null && item.guidance.length >= 2)).toBe(true)
      expect(actual.references).toEqual([])
      expect(actual.method.referenceVersions).toEqual([])
      expect(actual.rawScoreFeedback ?? []).toEqual([])
    }
    expect(d.report.interpretations.every(item => item.summary.length >= 100 && item.source.type === 'score_only' && item.bands.length === 0)).toBe(true)
    expect(d.referencePolicy).toEqual({ type: 'none' })
    expect(pkg.references).toEqual([])
    expect(source.catalog.referenceApplicability).toEqual([])
  })
  it('separates adult English evidence, unvalidated Chinese text and platform-authored feedback', () => {
    expect(source.localization?.sourceLocale).toBe('en')
    expect(source.localization?.targetLocale).toBe('zh-CN')
    expect(source.localization?.adaptationMethod).toBe('DIRECT_TRANSLATION')
    expect(source.localization?.reviewStatus).toBe('PENDING')
    expect(source.localization?.expertReviewStatus).toBe('PENDING')
    expect(source.localization?.cognitiveDebriefStatus).toBe('NOT_ESTABLISHED')
    expect(source.localization?.localEvidenceRefs).toEqual([])
    expect(source.catalog.evidence.every(evidence => evidence.locale === 'en' && evidence.territory === 'CA')).toBe(true)
    expect(source.catalog.population.minAge).toBe(18)
    expect(d.report.audienceContract?.respondent).toBe('ADULT_SELF')
    expect(d.report.audienceContract?.qcReview.reviewer).toContain('not human expert approval')
    expect(d.report.disclaimer).toContain('报告解释和建议由平台原创')
    expect(d.report.disclaimer).toContain('中文工作译稿未经验证')
    expect(source.disclosure?.audiences.teacher).toBeUndefined()
    expect(source.disclosure?.unknownAudience).toBe('DENY')
  })
  it('enforces adult eligibility at 216 months and does not infer a missing age', () => {
    expect(source.applicability?.subject?.ageMonths).toEqual({ minInclusive: 216 })
    const evaluate = (ageMonths?: number) => evaluateInstrumentEligibility(source.applicability!, {
      respondentType: 'SELF', subject: ageMonths === undefined ? undefined : { ageMonths }, availableContextKeys: [],
    })
    expect(evaluate(215).outcome).toBe('INELIGIBLE')
    expect(evaluate(215).reasons.map(reason => reason.code)).toContain('SUBJECT_AGE_BELOW_MIN')
    expect(evaluate(216)).toEqual({ outcome: 'ELIGIBLE', reasons: [] })
    expect(evaluate().outcome).toBe('INDETERMINATE')
    expect(evaluate().reasons.map(reason => reason.code)).toContain('SUBJECT_AGE_MISSING')
    expect(source.catalog.population.populationNotes).toContain('真实入口')
    expect(d.report.limitations.join(' ')).toContain('缺龄不推定符合')
  })
  it('keeps multi-axis tags without treating CCFQ as ACT or exclusive CBT treatment', () => {
    const tags = source.catalog.construct.constructOverlapTags
    for (const prefix of ['domain:', 'construct:', 'orientation:', 'population:', 'response:', 'use:', 'license:', 'language_validation:']) {
      expect(tags.some(tag => tag.startsWith(prefix))).toBe(true)
    }
    expect(tags).toContain('orientation:CBT_related_not_exclusive')
    expect(tags).not.toContain('orientation:ACT')
    expect(source.catalog.construct.constructDefinition).toContain('不等同ACT心理灵活性')
    expect(d.report.interpretations[0].summary).toContain('不是要求你消除、压住或否定正常情绪')
  })
  it('preserves CC BY 4.0 attribution and changes without adding noncommercial restrictions', () => {
    expect(d.source.citation).toContain('Gabrys, R. L., Tabri, N., Anisman, H., & Matheson, K. (2018)')
    expect(d.license.status).toBe('verified')
    expect(d.license.redistribution).toBe('allowed')
    expect(d.license.note).toContain('© 2018 Gabrys, Tabri, Anisman and Matheson.')
    expect(d.license.note).toContain('https://creativecommons.org/licenses/by/4.0/')
    expect(d.license.note).toContain('非原作者审定或背书')
    expect(d.license.note).toContain('改动为英文转中文')
    expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL', 'COMMERCIAL'])
    expect(d.report.disclaimer).toContain('10.3389/fpsyg.2018.02219')
  })
  it('keeps version axes independent and report-only edits outside the measurement hash', () => {
    expect(d.scoring.scoringVersion).toBe('1.0.0')
    expect(d.report.reportVersion).toBe('1.0.0')
    expect(d.versionAxes).toEqual({ schemaVersion: 1, subjectKey: 'ccfq18', locale: 'zh-CN', localizationVersion: '1.0.0' })
    const revised = structuredClone(d)
    revised.report.reportVersion = '1.0.1'
    revised.report.disclaimer += ' 文案修订'
    expect(hashScaleDefinition(revised)).toBe(hashScaleDefinition(d))
    revised.items[0].content += ' 题文修订'
    expect(hashScaleDefinition(revised)).not.toBe(hashScaleDefinition(d))
  })
})
