import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/psyflex6_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { previewScaleInstrument } from '../../../modules/scale/onboarding/preview'
import { scoreScale, type ScaleAnswer } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

const pkg = projectScalePackage(source)!, d = pkg.definition
const code = (n: number) => `PSYFLEX6_${n}`
const all = (value: string): ScaleAnswer[] => Array.from({ length: 6 }, (_, i) => ({ itemCode: code(i + 1), responseValue: value }))
const middle = all('3')
const result = (answers: ScaleAnswer[]) => buildScaleResult({ scaleId: 'synthetic-psyflex6', instrumentKey: source.identity.instrumentKey, instrumentVersion: source.identity.instrumentVersion, name: source.catalog.identity.canonicalName, definition: d, answers })

describe('Psy-Flex independent Chinese adult self-report DRAFT', () => {
  it('validates as DRAFT/CANDIDATE with six fixed stems and the five frequency anchors', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(source.identity).toEqual({ instrumentKey: 'psyflex6_zh_cn_research', instrumentVersion: '1.0.0' })
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(d.items).toHaveLength(6)
    expect(d.items.map(i => i.itemCode)).toEqual([1, 2, 3, 4, 5, 6].map(code))
    expect(d.display.randomizeItems).toBe(false)
    expect(d.responseSets[0].options.map(o => [o.value, o.score, o.label])).toEqual(
      [['1', 1, '极少如此'], ['2', 2, '很少如此'], ['3', 3, '有时如此'], ['4', 4, '经常如此'], ['5', 5, '总是如此']],
    )
  })

  it('carries the authors last-seven-days recall window in the frozen instruction', () => {
    expect(source.instruction).toBeDefined()
    expect(source.instruction!.text).toContain('过去七天')
    expect(source.catalog.administration.timeFrame).toContain('过去七天')
    // The recall window must not be smuggled into an item.
    expect(d.items.every(i => !i.content.includes('过去七天'))).toBe(true)
  })

  it('scores one sum 6-30 with no reverse items and no subscales', () => {
    expect(d.scoring.itemRules).toHaveLength(6)
    expect(d.scoring.itemRules.every(r => r.transform.type === 'identity')).toBe(true)
    expect(d.scoring.scores).toHaveLength(1)
    expect(d.scoring.scores[0]).toMatchObject({ key: 'total', type: 'total', canonical: true, direction: 'higher_is_more', missingPolicy: { type: 'complete_required' }, source: { type: 'items', aggregation: 'sum' } })
    expect(d.scoring.scores.filter(s => s.type === 'dimension')).toEqual([])
    expect(d.scoring.scores.every(s => s.range === undefined)).toBe(true)
    expect(scoreScale(d, middle).scores[0].range).toEqual({ min: 6, max: 30 })
    expect(d.referencePolicy).toEqual({ type: 'none' })
  })

  it('scores every golden fixture and reaches both extremes', () => {
    for (const fixture of pkg.goldenCases) {
      const actual = scoreScale(d, fixture.answers)
      expect(actual.quality.status).toBe(fixture.expected.quality)
      expect(Object.fromEntries(actual.scores.map(s => [s.key, s.value]))).toEqual(fixture.expected.scores)
      expect(actual.scores.map(s => s.key)).toEqual(fixture.expected.totalScoreKeys)
    }
    expect(scoreScale(d, all('1')).scores[0].value).toBe(6)
    expect(scoreScale(d, all('5')).scores[0].value).toBe(30)
    expect(scoreScale(d, all('3')).scores[0].value).toBe(18)
  })

  it('leaves an incomplete total null without zero fill, imputation or prorating', () => {
    for (const n of [1, 3, 6]) {
      const r = result(middle.filter(a => a.itemCode !== code(n)))
      expect(r.quality.status).toBe('invalid')
      expect(r.scores[0]).toMatchObject({ key: 'total', value: null, prorated: false })
      expect(r.interpretations).toEqual([])
    }
    expect(result([]).scores[0].value).toBeNull()
  })

  it('rejects out-of-range/wrong-type responses, unknown items and duplicates', () => {
    for (const value of ['0', '6', '', 'x', 3, 1.5, Number.NaN]) expect(() => result([{ itemCode: code(1), responseValue: value }, ...middle.slice(1)])).toThrow('量表回答不合法')
    expect(() => result([...middle, middle[0]])).toThrow('量表回答不合法')
    expect(() => result([...middle, { itemCode: code(7), responseValue: '3' }])).toThrow('量表回答不合法')
  })

  it('requires the adult self respondent and never lets a missing age pass', () => {
    const eligibility = (ageMonths?: number, respondentType: 'SELF' | 'PARENT' | 'TEACHER' = 'SELF') => evaluateInstrumentEligibility(source.applicability!, { respondentType, subject: ageMonths === undefined ? undefined : { ageMonths }, availableContextKeys: [] })
    expect(source.catalog.population.respondentTypes).toEqual(['SELF'])
    expect(eligibility(215).outcome).toBe('INELIGIBLE')
    expect(eligibility(216).outcome).toBe('ELIGIBLE')
    expect(eligibility(undefined).outcome).not.toBe('ELIGIBLE')
    expect(eligibility(300, 'PARENT').outcome).toBe('INELIGIBLE')
    expect(eligibility(300, 'TEACHER').outcome).toBe('INELIGIBLE')
  })

  it('reports score-only in plain language without promising outcomes', () => {
    const parsed = parseScaleResultV2(JSON.parse(JSON.stringify(result(middle))))
    expect(parsed.interpretations).toHaveLength(1)
    expect(parsed.interpretations[0].interpretation.length).toBeGreaterThanOrEqual(100)
    expect(parsed.interpretations[0].label).toBeNull()
    expect(parsed.interpretations[0].referenceVersion).toBeNull()
    const interpretation = d.report.interpretations[0]
    expect(interpretation.source.type).toBe('score_only')
    expect(interpretation.bands).toEqual([])
    // Higher means more flexibility, a state description, not a value judgement.
    expect(d.scoring.scores[0].description).toContain('心理灵活性越高')
    expect(JSON.stringify(d.report.interpretations)).not.toMatch(/保证|一定能|彻底改变|必然/)
    expect(source.catalog.intendedUse.forbiddenUses).toContain('DIAGNOSIS')
  })

  it('records the authorization risk honestly instead of claiming cleared rights', () => {
    expect(d.license.status).toBe('unknown')
    expect(d.license.redistribution).toBe('restricted')
    const tags = source.catalog.construct.constructOverlapTags
    expect(tags).toContain('license:authorization_pending')
    expect(tags).toContain('license:author_contact_pending')
    expect(tags).toContain('license:official_chinese_version_exists_not_copied')
    expect(source.usageRequirements!.notes.join('')).toContain('不作已授权主张')
    // The author's official Chinese wording must not be copied.
    expect(d.items.map(i => i.content).join('')).not.toContain('思维在其他地方')
  })

  it('refuses DRAFT activation despite the openly downloadable official PDF', () => {
    const preview = previewScaleInstrument({ source, authorizations: [], locale: 'zh-CN', territory: 'CN', commercialNature: 'NON_COMMERCIAL', deploymentModes: ['STANDALONE'], nowIso: '2026-10-27T00:00:00.000Z' })
    expect(preview.sourceValidation.ok).toBe(true)
    expect(preview.allowActivation).toBe(false)
    expect(preview.blockers).toContain('EXECUTABLE_NOT_PUBLISHED')
    expect(preview.blockers).toContain('LOCALIZATION_REVIEW_PENDING')
  })
})
