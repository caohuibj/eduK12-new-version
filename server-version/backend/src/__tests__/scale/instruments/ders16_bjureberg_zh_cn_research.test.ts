import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/ders16_bjureberg_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
const pkg=projectScalePackage(source)!,d=pkg.definition
const id=(n:number)=>'DERS16_'+String(n).padStart(2,'0')
const all=(v:string)=>Array.from({length:16},(_,i)=>({itemCode:id(i+1),responseValue:v}))
const facets={"clarity":[1,2],"goals":[3,7,15],"impulse":[4,8,11],"strategies":[5,6,12,14,16],"nonacceptance":[9,10,13]}
describe('Bjureberg DERS-16 2016 independently translated DRAFT (NOTRUN)',()=>{
 it('maintains author Appendix sixteen-item sequence, five frequency anchors and DRAFT release',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.executable?.releaseStatus).toBe('DRAFT')
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:16},(_,i)=>id(i+1)))
  expect(d.responseSets[0].options.map(x=>x.score)).toEqual([1,2,3,4,5])
  expect(d.items[10].content).toContain('控制自己的行为')
  expect(d.items[13].content).toContain('自己')
 })
 it('sums 16 items to 16–80 and five correct short-form facets; no Awareness',()=>{
  expect(d.scoring.scores.map(x=>x.key)).toEqual(['total',...Object.keys(facets)])
  expect(d.scoring.itemRules.every(x=>x.transform.type==='identity')).toBe(true)
  const expectedRanges=[16,...Object.values(facets).map(v=>v.length)]
  for(const [index,s] of d.scoring.scores.entries()){
   if(s.source.type!=='items')throw new Error('direct item source required')
   expect(s.source.aggregation).toBe('sum')
   expect(s.source.items.length).toBe(expectedRanges[index])
   if(index>0)expect(s.source.items.map(x=>x.itemCode)).toEqual(Object.values(facets)[index-1].map(id))
  }
  expect(d.scoring.scores.every(x=>x.key!=='awareness')).toBe(true)
  expect(scoreScale(d,all('1')).scores[0].value).toBe(16)
  expect(scoreScale(d,all('5')).scores[0].value).toBe(80)
  expect(d.referencePolicy).toEqual({type:'none'})
 })
 it('matches all 12 golden cases incl each facet extreme and missingness',()=>{
  for(const fx of pkg.goldenCases){
   const out=scoreScale(d,fx.answers)
   expect(out.quality.status).toBe(fx.expected.quality)
   expect(Object.fromEntries(out.scores.map(x=>[x.key,x.value]))).toEqual(fx.expected.scores)
  }
 })
 it('keeps eight axes, no made-up reference cutoffs and unknown redistribution permissions',()=>{
  expect(source.localization?.reviewStatus).toBe('PENDING')
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(source.catalog.construct.constructOverlapTags).toContain('license:author_contact_required')
  expect(d.report.interpretations).toHaveLength(6)
  expect(d.report.interpretations.every(x=>x.source.type==='score_only'&&x.bands.length===0)).toBe(true)
 })
 it('rejects invalid or duplicate answers',()=>{
  for(const bad of ['0','6','bad',3,3.5,Number.NaN])expect(()=>scoreScale(d,[{itemCode:id(1),responseValue:bad},...all('3').slice(1)])).toThrow('量表回答不合法')
  expect(()=>scoreScale(d,[...all('3'),{itemCode:id(1),responseValue:'3'}])).toThrow('量表回答不合法')
 })
})
