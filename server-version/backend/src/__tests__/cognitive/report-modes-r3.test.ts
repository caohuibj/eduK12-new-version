import {describe,it,expect} from 'vitest'
import {projectThreeLayerReport} from '../../modules/cognitive/v2/report'
import type {MetricDefinition} from '../../modules/cognitive/v2/types'
const tasks=['matrix','mentalrotation','tower','lineangle','embeddedfigures','icarmatrix','wordanalogy','wordmeaning','wordproblem','logicdeduce','seriescomplete','readingcomp','proofread','cogest']
function metricsFor(keys:string[]):Record<string,MetricDefinition>{return Object.fromEntries(keys.map(key=>[key,{key,label:key,category:'descriptive',construct:'本次任务',description:'合成报告合同输入',unit:key.includes('Rt')?'ms':key.includes('Rate')||key==='accuracy'?'ratio':'count',valueType:'number',direction:'descriptive',visibility:'user',role:'primary',availableProfiles:['experience','standard','research'],referenceEligible:false,export:{summary:true,label:key}}])) as Record<string,MetricDefinition>}
describe('R3 report-only revisions',()=>{
 it.each(tasks)('%s retains the historical R and projects real zero / missing RT with the revised copy',async task=>{
  const {reportRevision:p,historicalPresentations:old,participantPresentations:preferred}=await import(`../../modules/cognitive/tasks/${task}/report-review-20261101`)
  const prior=old.find((v:any)=>v.engineVersion===p.engineVersion&&v.scoringVersion===p.scoringVersion)
  expect(p).not.toBe(prior);expect(p.presentationVersion).not.toBe(prior.presentationVersion)
  expect(p.engineVersion).toBe(prior.engineVersion);expect(p.scoringVersion).toBe(prior.scoringVersion)
  expect(p.reportReading.metricGates).toEqual(prior.reportReading.metricGates)
  expect(p.reportReading.withholdFlags).toEqual(prior.reportReading.withholdFlags)
  expect(preferred.filter((v:any)=>v.engineVersion===p.engineVersion&&v.scoringVersion===p.scoringVersion)).toEqual([p])
  const keys=Object.keys(p.metrics),defs=metricsFor(keys)
  const values=Object.fromEntries(keys.map(k=>[k,k.includes('Rt')?null:0]))
  for(const profile of ['experience','research'] as const){
   const report=projectThreeLayerReport({participantPresentation:p,testType:task,engineVersion:p.engineVersion,scoringVersion:p.scoringVersion,configVersion:'synthetic',protocolSignature:'r3-template-only',profile,
    definition:{schemaVersion:1,version:p.reportReading.version,title:p.title,headlineMetrics:[task==='tower'?'solveRate':'accuracy'],userMetrics:keys,detailMetrics:[],disclaimer:p.disclaimer,practicalTips:p.practicalTips},
    metrics:values,metricDefinitions:defs,qualityDefinitions:{},score:{metrics:values,quality:{state:'interpretable',flags:{},reasons:[]},audit:{trialCount:task==='tower'?4:18,scorerVersion:p.scoringVersion}}})
   expect(report.reading?.title).toBe(p.reportReading.title)
   expect(report.reading?.popular?.concept).toBe(p.reportReading.popular.concept)
   expect(report.reading?.feedback.summary).not.toMatch(/\{\w+\}/)
   expect([...report.headline,...report.user,...report.detail].filter(m=>m.key.includes('Rt'))).toEqual([])
   expect([...report.headline,...report.user,...report.detail].some(m=>m.value===0)).toBe(true)
   if(profile==='experience')for(const key of p.reportReading.hiddenByProfile?.experience??[])expect(report.reading?.interpretation.withheldMetricKeys).toContain(key)
  }
  expect(prior.reportReading.version).not.toBe(p.reportReading.version)
 })
})
