import type { SurveySourceProjection, ResearchRawCodebook } from './analytics.source'
import { pairedDescriptive } from './analytics.cohorts'
export interface ItemSummary {
  columnKey:string
  itemKey:string
  prompt:string
  instrumentKey:string
  kind:string
  respondentN:number
  missingByReason:Record<string,number>
  frequencies:{value:string;count:number}[]
  numericMean:number|null
  numericSampleSd:number|null
}
const numeric=(values:number[])=>({
  mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,
  sd:values.length>1?Math.sqrt(
    values.reduce((sum,x)=>sum+(x-values.reduce((a,b)=>a+b,0)/values.length)**2,0)/(values.length-1),
  ):null,
})
/** Aggregate in memory only from an already bounded, verified FINAL source.
 * Raw free-text values must never leak via descriptive frequency charts.
 */
export function describeWave(source:SurveySourceProjection,waveId:string){
  if(!source.projectId)throw new Error('Missing scoped research source')
  const dictionary=new Map<string,ResearchRawCodebook>(
    source.codebook.filter(c=>c.waveId===waveId).map(c=>[c.columnKey,c]))
  const grouped=new Map<string,typeof source.raw>()
  for(const row of source.raw.filter(x=>x.waveId===waveId)){
    const set=grouped.get(row.columnKey)||[]
    set.push(row);grouped.set(row.columnKey,set)
  }
  const items:ItemSummary[]=[]
  for(const [column,rows] of grouped){
    const codebook=dictionary.get(column)
    if(!codebook)throw new Error('Observation without frozen item dictionary')
    const missingByReason:Record<string,number>={}
    const frequencies=new Map<string,number>()
    const values:number[]=[]
    for(const row of rows){
      if(row.missingReason){
        missingByReason[row.missingReason]=(missingByReason[row.missingReason]||0)+1
        continue
      }
      if(row.value===null)continue
      if(typeof row.value==='number'&&Number.isFinite(row.value))values.push(row.value)
      else if(codebook.options.length&&typeof row.value==='string'){
        // A multi-select is serialized JSON, not a numeric response score.
        if(codebook.options.some(o=>o.code===row.value))
          frequencies.set(row.value,(frequencies.get(row.value)||0)+1)
      }
    }
    const stats=numeric(values)
    items.push({columnKey:column,itemKey:codebook.itemKey,prompt:codebook.prompt,
      instrumentKey:codebook.instrumentKey,kind:codebook.kind,
      respondentN:rows.filter(x=>x.value!==null&&!x.missingReason).length,
      missingByReason,
      frequencies:[...frequencies].map(([value,count])=>({value,count})),
      numericMean:stats.mean,numericSampleSd:stats.sd,
    })
  }
  const scoreGroups=new Map<string,number[]>()
  for(const score of source.scores.filter(s=>s.waveId===waveId&&s.missingReason===null&&s.value!==null)){
    const key=[score.measurement.instrumentKey,score.measurement.scoreKey,
      score.measurement.scoringDigest,score.measurement.responseSignature].join('|')
    const group=scoreGroups.get(key)||[];group.push(score.value!);scoreGroups.set(key,group)
  }
  const descriptiveScores=[...scoreGroups].map(([key,values])=>{
    const [instrumentKey,scoreKey,scoringDigest,responseSignature]=key.split('|')
    return {instrumentKey,scoreKey,scoringDigest,responseSignature,
      validN:values.length,mean:numeric(values).mean,sampleSd:numeric(values).sd}
  })
  return {projectId:source.projectId,waveId,source:'VERIFIED_ENCRYPTED_SURVEY_FINAL',
    items,descriptiveScores,
    note:'自由文本不进入自动频数公开输出；均值/SD 为描述性科研统计，不构成诊断或常模。'}
}
export function describePairedScores(source:SurveySourceProjection,input:{
  baselineWaveId:string;followupWaveId:string;instrumentKey:string;scoreKey:string
}){
  if(source.collectionMode!=='LINKED_WAVES')throw new Error('无法关联匿名研究，不可计算个体配对统计')
  return pairedDescriptive({
    projectId:source.projectId,observations:source.scores,...input,
  })
}
