import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/curiosity_5dcr24_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'

const pkg = projectScalePackage(source)!, definition = pkg.definition

describe('5DCR-24 2022 GESIS six-facet independent Chinese DRAFT (not executed by content preparation)', () => {
  it('parses source and preserves official fixed order and 1–7 anchors', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(definition.items).toHaveLength(24)
    expect(definition.items.map(i => i.itemCode)).toEqual(Array.from({ length:24 }, (_,i)=>'DCR5_'+String(i+1).padStart(2,'0')))
    expect(definition.responseSets[0].options.map(o => o.score)).toEqual([1,2,3,4,5,6,7])
    expect(definition.display.randomizeItems).toBe(false)
  })
  it('reverses only Q9–Q12, emits six dimension means and never a total', () => {
    expect(definition.scoring.itemRules.filter(x=>x.transform.type==='reverse').map(x=>x.itemCode)).toEqual(['DCR5_09','DCR5_10','DCR5_11','DCR5_12'])
    expect(definition.scoring.scores).toHaveLength(6)
    expect(definition.scoring.scores.every(x=>x.type==='dimension' && x.source.type==='items' && x.source.aggregation==='mean' && x.canonical)).toBe(true)
    expect(definition.scoring.scores.every(x=>x.missingPolicy?.type==='complete_required')).toBe(true)
    expect(definition.referencePolicy).toEqual({type:'none'})
  })
  it('honors the preserved r2 synthetic vectors (including partial facets)', () => {
    for (const golden of pkg.goldenCases) {
      const actual=scoreScale(definition,golden.answers)
      expect(actual.quality.status).toBe(golden.expected.quality)
      expect(Object.fromEntries(actual.scores.map(s=>[s.key,s.value]))).toEqual(golden.expected.scores)
    }
  })
  it('does not assert research deployment or published Chinese norms', () => {
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.localization?.reviewStatus).toBe('PENDING')
    expect(definition.report.interpretations.every(x=>x.source.type==='score_only' && x.bands.length===0)).toBe(true)
    expect(source.catalog.construct.constructOverlapTags).toContain('language_validation:local_validation_pending')
  })
})
