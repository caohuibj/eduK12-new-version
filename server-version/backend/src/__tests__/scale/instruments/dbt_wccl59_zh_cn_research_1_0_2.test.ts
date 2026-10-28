import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/dbt_wccl59_zh_cn_research/1.0.2/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'

const pkg = projectScalePackage(source)!
const definition = pkg.definition
const itemCode = (n: number) => 'DBTWC' + String(n).padStart(2, '0')
const responses = (v: string) => Array.from({ length: 59 }, (_, i) => ({ itemCode: itemCode(i + 1), responseValue: v }))
const originalFacets = {
  dss: [1,2,4,6,9,10,11,13,16,18,19,21,22,23,26,27,29,31,33,34,35,36,38,39,40,42,43,44,47,49,50,51,53,54,56,57,58,59],
  dcs1: [3,5,8,12,14,17,20,25,32,37,41,45,46,52,55],
  dcs2: [7,15,24,28,30,48],
}
describe('DBT-WCCL 59 direct-from-English zh-CN v1.0.2 content candidate', () => {
  it('preserves 59 unique ordered identities, original 0–3 anchors and confirmed review and published package (not DB publication)', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(source.identity.instrumentVersion).toBe('1.0.2')
    expect(source.executable?.releaseStatus).toBe('PUBLISHED')
    expect(source.catalog.catalogStatus).toBe('ACCEPTED')
    expect(source.localization).toMatchObject({
      sourceLocale:'en',targetLocale:'zh-CN',localizationVersion:'1.0.2',
      reviewStatus:'APPROVED',expertReviewStatus:'COMPLETED',
    })
    expect(definition.items.map(it => it.itemCode)).toEqual(Array.from({length:59},(_,i)=>itemCode(i+1)))
    expect(new Set(definition.items.map(it=>it.itemCode)).size).toBe(59)
    expect(definition.responseSets[0].options.map(o=>o.score)).toEqual([0,1,2,3])
    expect(definition.items[9].content).toBe('找人谈谈自己的感受。')
    expect(definition.items[56].content).toContain('作比较')
  })
  it('uses original 38/15/6 author subscale means and no 59-item total or reversal', () => {
    expect(definition.scoring.scoringVersion).toBe('1.0.0')
    expect(definition.scoring.scores.map(s=>s.key)).toEqual(['dss','dcs1','dcs2'])
    expect(definition.scoring.itemRules.every(r=>r.transform.type==='identity')).toBe(true)
    for (const [i,score] of definition.scoring.scores.entries()) {
      if(score.source.type!=='items') throw new Error('items score source required')
      expect(score.source.aggregation).toBe('mean')
      expect(score.source.items.map(r=>r.itemCode)).toEqual(Object.values(originalFacets)[i].map(itemCode))
      expect(score.missingPolicy).toEqual({type:'complete_required'})
    }
    expect(definition.referencePolicy).toEqual({type:'none'})
    expect(scoreScale(definition,responses('0')).scores.map(s=>s.value)).toEqual([0,0,0])
    expect(scoreScale(definition,responses('3')).scores.map(s=>s.value)).toEqual([3,3,3])
  })
  it('checks 12 predeclared synthetic golden expectations', () => {
    expect(pkg.goldenCases).toHaveLength(12)
    for (const golden of pkg.goldenCases) {
      const actual=scoreScale(definition,golden.answers)
      expect(actual.quality.status).toBe(golden.expected.quality)
      expect(Object.fromEntries(actual.scores.map(x=>[x.key,x.value]))).toEqual(golden.expected.scores)
    }
  })
  it('marks approved linguistic review without inventing scientific validation or redistribution rights', () => {
    expect(source.localization?.reviewStatus).toBe('APPROVED')
    expect(source.localization?.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    expect(source.localization?.expertReviewStatus).toBe('COMPLETED')
    expect(source.catalog.scientificMaturity).toBe('PILOT')
    expect(source.catalog.construct.constructOverlapTags).toContain('license:noncommercial')
    expect(source.catalog.construct.constructOverlapTags).toContain('非商用')
    expect(definition.license).toMatchObject({status:'unknown',redistribution:'restricted'})
    expect(definition.report.interpretations).toHaveLength(3)
    expect(definition.report.reportVersion).toBe('1.0.3')
    expect(definition.report.audienceContract).toMatchObject({schemaVersion:1,respondent:'ADULT_SELF',audience:'student',locale:'zh-CN'})
    expect(definition.report.interpretations.map(x => x.scoreKey)).toEqual(['dss','dcs1','dcs2'])
    expect(definition.report.interpretations.every(x=>x.source.type==='score_only'&&x.bands.length===0)).toBe(true)
    expect(source.applicability?.policyVersion).toBe('dbt_wccl59_zh_cn_research-1.0.2')
  })
})
