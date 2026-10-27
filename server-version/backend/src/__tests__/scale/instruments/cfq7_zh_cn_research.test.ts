import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/cfq7_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { previewScaleInstrument } from '../../../modules/scale/onboarding/preview'
import { scoreScale, type ScaleAnswer } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

const pkg = projectScalePackage(source)!, d = pkg.definition
const code = (n: number) => `CFQ7_${String(n).padStart(2, '0')}`
const all = (value: string): ScaleAnswer[] => Array.from({ length: 7 }, (_, i) => ({ itemCode: code(i + 1), responseValue: value }))
const middle = all('4')
const result = (answers: ScaleAnswer[]) => buildScaleResult({ scaleId: 'synthetic-cfq7', instrumentKey: source.identity.instrumentKey, instrumentVersion: source.identity.instrumentVersion, name: source.catalog.identity.canonicalName, definition: d, answers })

describe('CFQ-7 independent Chinese adult self-report DRAFT', () => {
  it('validates as DRAFT/CANDIDATE with seven fixed stems and the original frequency anchors', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(source.identity).toEqual({ instrumentKey: 'cfq7_zh_cn_research', instrumentVersion: '1.0.0' })
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(d.items).toHaveLength(7)
    expect(d.items.map(i => i.itemCode)).toEqual([1, 2, 3, 4, 5, 6, 7].map(code))
    expect(d.display.randomizeItems).toBe(false)
    expect(d.responseSets[0].options.map(o => [o.value, o.score, o.label])).toEqual(
      [['1', 1, '从不如此'], ['2', 2, '极少如此'], ['3', 3, '很少如此'], ['4', 4, '有时如此'],
       ['5', 5, '经常如此'], ['6', 6, '几乎总是如此'], ['7', 7, '总是如此']],
    )
  })

  it('scores one sum 7-49 with no reverse items and no subscales', () => {
    expect(d.scoring.itemRules).toHaveLength(7)
    expect(d.scoring.itemRules.every(r => r.transform.type === 'identity')).toBe(true)
    expect(d.scoring.scores).toHaveLength(1)
    expect(d.scoring.scores[0]).toMatchObject({ key: 'total', type: 'total', canonical: true, direction: 'higher_is_more', missingPolicy: { type: 'complete_required' }, source: { type: 'items', aggregation: 'sum' } })
    expect(d.scoring.scores.filter(s => s.type === 'dimension')).toEqual([])
    expect(d.scoring.scores.every(s => s.range === undefined)).toBe(true)
    expect(d.referencePolicy).toEqual({ type: 'none' })
    // Derived range must come from the response mapping, not a hand-written value.
    expect(scoreScale(d, middle).scores[0].range).toEqual({ min: 7, max: 49 })
  })

  it('scores every golden fixture and reaches both extremes', () => {
    for (const fixture of pkg.goldenCases) {
      const actual = scoreScale(d, fixture.answers)
      expect(actual.quality.status).toBe(fixture.expected.quality)
      expect(Object.fromEntries(actual.scores.map(s => [s.key, s.value]))).toEqual(fixture.expected.scores)
      expect(actual.scores.map(s => s.key)).toEqual(fixture.expected.totalScoreKeys)
    }
    expect(scoreScale(d, all('1')).scores[0].value).toBe(7)
    expect(scoreScale(d, all('7')).scores[0].value).toBe(49)
    expect(scoreScale(d, all('4')).scores[0].value).toBe(28)
  })

  it('leaves an incomplete total null without zero fill, imputation or prorating', () => {
    for (const n of [1, 4, 7]) {
      const r = result(middle.filter(a => a.itemCode !== code(n)))
      expect(r.quality.status).toBe('invalid')
      expect(r.scores[0]).toMatchObject({ key: 'total', value: null, prorated: false })
      expect(r.interpretations).toEqual([])
    }
    expect(result([]).scores[0].value).toBeNull()
  })

  it('rejects out-of-range/wrong-type responses, unknown items and duplicates', () => {
    for (const value of ['0', '8', '', 'x', 4, 1.5, Number.NaN]) expect(() => result([{ itemCode: code(1), responseValue: value }, ...middle.slice(1)])).toThrow('量表回答不合法')
    expect(() => result([...middle, middle[0]])).toThrow('量表回答不合法')
    expect(() => result([...middle, { itemCode: code(8), responseValue: '4' }])).toThrow('量表回答不合法')
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

  it('reports score-only in plain language and states that higher means more fusion', () => {
    const built = result(middle)
    const parsed = parseScaleResultV2(JSON.parse(JSON.stringify(built)))
    expect(parsed.scores.map(s => s.key)).toEqual(['total'])
    expect(parsed.interpretations).toHaveLength(1)
    expect(parsed.interpretations[0].interpretation.length).toBeGreaterThanOrEqual(100)
    expect(parsed.interpretations[0].label).toBeNull()
    expect(parsed.interpretations[0].referenceVersion).toBeNull()
    const interpretation = d.report.interpretations[0]
    expect(interpretation.source.type).toBe('score_only')
    expect(interpretation.bands).toEqual([])
    // Higher must be described as more fusion, never as "better".
    expect(d.scoring.scores[0].description).toContain('越高表示认知融合越多')
    expect(JSON.stringify(d.report.interpretations)).not.toMatch(/越好|越优秀|越强/)
    expect(source.catalog.intendedUse.forbiddenUses).toContain('DIAGNOSIS')
  })

  it('records the authorization risk honestly instead of claiming cleared rights', () => {
    expect(d.license.status).toBe('unknown')
    expect(d.license.redistribution).toBe('restricted')
    const tags = source.catalog.construct.constructOverlapTags
    expect(tags).toContain('license:authorization_pending')
    expect(tags).toContain('license:author_contact_pending')
    expect(tags).toContain('license:risk_noted')
    expect(source.usageRequirements!.notes.join('')).toContain('non-commercial')
    expect(source.usageRequirements!.notes.join('')).toContain('不作已授权主张')
  })

  it('refuses DRAFT activation despite the ACBS research-use statement', () => {
    const preview = previewScaleInstrument({ source, authorizations: [], locale: 'zh-CN', territory: 'CN', commercialNature: 'NON_COMMERCIAL', deploymentModes: ['STANDALONE'], nowIso: '2026-10-27T00:00:00.000Z' })
    expect(preview.sourceValidation.ok).toBe(true)
    expect(preview.allowActivation).toBe(false)
    expect(preview.blockers).toContain('EXECUTABLE_NOT_PUBLISHED')
    expect(preview.blockers).toContain('LOCALIZATION_REVIEW_PENDING')
  })
})
