import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/dbt_wccl59_zh_cn_research/1.0.2/instrument'
import { SCALE_INSTRUMENT_SOURCE as previous } from '../../../modules/scale/instruments/dbt_wccl59_zh_cn_research/1.0.1/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
const pkg=projectScalePackage(source)!, prior=projectScalePackage(previous)!, d=pkg.definition
const id=(n:number)=>'DBTWC'+String(n).padStart(2,'0')
describe('DBT-WCCL59 English-direct 1.0.2 reviewed candidate (NOTRUN)',()=>{
 it('keeps 59 identities, latest policy versions, and correct semantic anchors',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.identity.instrumentVersion).toBe('1.0.2')
  expect(source.executable.releaseStatus).toBe('DRAFT')
  for (const field of [source.applicability.policyVersion,source.disclosure.policyVersion,source.usageRequirements.policyVersion]) expect(field).toBe('dbt_wccl59_zh_cn_research-1.0.2')
  expect(source.localization).toMatchObject({sourceLocale:'en',targetLocale:'zh-CN',localizationVersion:'1.0.2',reviewStatus:'PENDING'})
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:59},(_,i)=>id(i+1)))
  expect(d.responseSets[0].options.map(x=>x.score)).toEqual([0,1,2,3])
  expect(d.items[9].content).toBe('找人谈谈自己的感受。')
  expect(d.items[21].content).not.toContain('试着改变')
  expect(d.items[32].content).not.toContain('但也不错')
  expect(d.items[47].content).not.toContain('还有谁')
 })
 it('preserves source-backed three dimension means and old scoring and goldens',()=>{
  expect(d.scoring).toEqual(prior.definition.scoring)
  expect(pkg.goldenCases).toEqual(prior.goldenCases)
  expect(d.scoring.scoringVersion).toBe('1.0.0')
  expect(d.scoring.scores.map(x=>x.key)).toEqual(['dss','dcs1','dcs2'])
  expect(d.scoring.scores.map(x=>x.source.items.length)).toEqual([38,15,6])
  expect(d.scoring.scores.every(x=>x.source.aggregation==='mean')).toBe(true)
  expect(d.scoring.itemRules.every(x=>x.transform.type==='identity')).toBe(true)
  expect(d.referencePolicy).toEqual({type:'none'})
 })
 it('prepares existing 12 synthetic scoring expectations without changing them',()=>{
  for(const fx of pkg.goldenCases){
   const actual=scoreScale(d,fx.answers)
   expect(actual.quality.status).toBe(fx.expected.quality)
   expect(Object.fromEntries(actual.scores.map(x=>[x.key,x.value]))).toEqual(fx.expected.scores)
  }
 })
 it('keeps non-diagnostic report and pending scientific review rights',()=>{
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(d.report.reportVersion).toBe('1.0.2')
  expect(d.report.interpretations).toHaveLength(3)
  expect(d.report.interpretations.every(x=>x.source.type==='score_only'&&x.bands.length===0)).toBe(true)
 })
})
