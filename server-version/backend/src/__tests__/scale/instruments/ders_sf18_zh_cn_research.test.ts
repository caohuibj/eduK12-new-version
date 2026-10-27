import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/ders_sf18_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'
const pkg = projectScalePackage(source)!, d = pkg.definition
const id = (n: number) => 'DERS_SF18_' + String(n).padStart(2, '0')
const all = (value: string) => Array.from({ length: 18 }, (_, i) => ({ itemCode: id(i + 1), responseValue: value }))
describe('Kaufman DERS-SF-18 independent Chinese DRAFT (authored, not executed)', () => {
  it('maintains original item order and five percentage-anchored response options', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(d.items.map(x => x.itemCode)).toEqual(Array.from({ length: 18 }, (_, i) => id(i + 1)))
    expect(d.responseSets[0].options.map(x => x.score)).toEqual([1, 2, 3, 4, 5])
    expect(d.display.randomizeItems).toBe(false)
  })
  it('reverses exactly Awareness 1, 4, 6 and assigns each original 3-item facet', () => {
    expect(d.scoring.itemRules.filter(x => x.transform.type === 'reverse').map(x => x.itemCode)).toEqual([1, 4, 6].map(id))
    const groups = {"strategies":[10,15,18],"nonacceptance":[7,12,16],"impulse":[9,14,17],"goals":[8,11,13],"awareness":[1,4,6],"clarity":[2,3,5]}
    expect(d.scoring.scores.map(x => x.key)).toEqual(['total', ...Object.keys(groups)])
    for (const dimension of d.scoring.scores.slice(1)) {
      if (dimension.source.type !== 'items') throw new Error('Direct item dimension required')
      expect(dimension.source.items.map(x => x.itemCode)).toEqual(groups[dimension.key as keyof typeof groups].map(id))
      expect(dimension.source.aggregation).toBe('mean')
      expect(dimension.missingPolicy).toEqual({ type: 'complete_required' })
    }
    expect(d.scoring.scores[0]).toMatchObject({ key: 'total', type: 'total', source: { type: 'items', aggregation: 'sum' } })
    expect(d.referencePolicy).toEqual({ type: 'none' })
  })
  it('applies 9 synthetic complete/mixed/missing golden responses', () => {
    for (const c of pkg.goldenCases) {
      const result = scoreScale(d, c.answers)
      expect(result.quality.status).toBe(c.expected.quality)
      expect(result.scores.map(x => x.key)).toEqual(c.expected.totalScoreKeys)
      expect(Object.fromEntries(result.scores.map(x => [x.key, x.value]))).toEqual(c.expected.scores)
    }
    expect(scoreScale(d, all('1')).scores[0].value).toBe(30)
    expect(scoreScale(d, all('5')).scores[0].value).toBe(78)
  })
  it('keeps rights/scientific uncertainty and no diagnostic bands', () => {
    expect(d.license).toMatchObject({ status: 'unknown', redistribution: 'restricted' })
    expect(source.localization?.reviewStatus).toBe('PENDING')
    expect(source.catalog.construct.constructOverlapTags).toContain('license:author_contact_required')
    expect(d.report.interpretations).toHaveLength(7)
    expect(d.report.interpretations.every(x => x.source.type === 'score_only' && x.bands.length === 0)).toBe(true)
  })
  it('rejects invalid answers and does not admit minors into this draft', () => {
    for (const v of ['0','6','bad',2,2.5,Number.NaN]) expect(() => scoreScale(d, [{ itemCode: id(1), responseValue: v }, ...all('3').slice(1)])).toThrow('量表回答不合法')
    const eligible = (months?: number) => evaluateInstrumentEligibility(source.applicability!, { respondentType: 'SELF', subject: months === undefined ? undefined : { ageMonths: months }, availableContextKeys: [] })
    expect(eligible(215).outcome).toBe('INELIGIBLE')
    expect(eligible(216).outcome).toBe('ELIGIBLE')
    expect(eligible(undefined).outcome).not.toBe('ELIGIBLE')
  })
})
