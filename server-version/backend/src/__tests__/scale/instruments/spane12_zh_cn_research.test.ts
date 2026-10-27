import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/spane12_zh_cn_research/1.0.0/instrument'
import { SPANE_SCORER_KEY, spane12BalanceScorer } from '../../../modules/scale/instruments/spane12_zh_cn_research/1.0.0/scorer'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale, getScaleCustomScorerKeys, registerScaleCustomScorer, unregisterScaleCustomScorer } from '../../../modules/scale/scale-scoring'
const pkg=projectScalePackage(source)!, d=pkg.definition
let owned=false
const id=(n:number)=>'SPANE12_'+String(n).padStart(2,'0')
beforeAll(()=>{if(!getScaleCustomScorerKeys().has(SPANE_SCORER_KEY)){registerScaleCustomScorer(SPANE_SCORER_KEY,spane12BalanceScorer);owned=true}})
afterAll(()=>{if(owned)unregisterScaleCustomScorer(SPANE_SCORER_KEY)})
describe('SPANE 12 source and P-N scorer (tests prepared; not run in content phase)',()=>{
 it('keeps the original 12-word order, five frequency labels and four-week instruction',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.executable?.releaseStatus).toBe('DRAFT')
  expect(source.catalog.catalogStatus).toBe('CANDIDATE')
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:12},(_,i)=>id(i+1)))
  expect(d.responseSets[0].options.map(x=>x.score)).toEqual([1,2,3,4,5])
  expect(source.instruction?.text).toContain('过去四周')
 })
 it('computes the official P, N, and P-N balance, never the sum of 12 as happiness',()=>{
  expect(d.scoring.scores.map(x=>x.key)).toEqual(['spane_p','spane_n','spane_b'])
  expect(d.scoring.scores.map(x=>x.range)).toEqual([{min:6,max:30},{min:6,max:30},{min:-24,max:24}])
  expect(d.scoring.itemRules.every(x=>x.transform.type==='identity')).toBe(true)
  const all=(n:number)=>Array.from({length:12},(_,i)=>({itemCode:id(i+1),responseValue:String(n)}))
  expect(scoreScale(d,all(3)).scores.map(x=>x.value)).toEqual([18,18,0])
  expect(d.referencePolicy).toEqual({type:'none'})
 })
 it('matches nine independent golden arithmetic fixtures, including ±24 and missing data',()=>{
  for(const fixture of pkg.goldenCases){const scored=scoreScale(d,fixture.answers);expect(scored.quality.status).toBe(fixture.expected.quality);expect(scored.scores.map(x=>x.key)).toEqual(fixture.expected.totalScoreKeys);expect(Object.fromEntries(scored.scores.map(x=>[x.key,x.value]))).toEqual(fixture.expected.scores)}
 })
 it('has a correct shape and no fictional Chinese clinical bands or norms',()=>{
  expect(source.executable?.scorerPlugins?.map(x=>[x.key,x.version])).toEqual([[SPANE_SCORER_KEY,'1.0.0']])
  expect(d.report.interpretations).toHaveLength(3)
  expect(d.report.interpretations.every(x=>x.source.type==='score_only'&&x.bands.length===0)).toBe(true)
  expect(source.localization?.reviewStatus).toBe('PENDING')
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
 })
 it('does not accept wrong values or duplicate answers',()=>{
  const all=(v:string)=>Array.from({length:12},(_,i)=>({itemCode:id(i+1),responseValue:v}))
  for(const wrong of ['0','6','x',2,2.5,Number.NaN])expect(()=>scoreScale(d,[{itemCode:id(1),responseValue:wrong},...all('3').slice(1)])).toThrow('量表回答不合法')
  expect(()=>scoreScale(d,[...all('3'),{itemCode:id(1),responseValue:'3'}])).toThrow('量表回答不合法')
 })
})
