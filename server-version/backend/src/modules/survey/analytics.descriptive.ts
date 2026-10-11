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
  combinationFrequencies:{value:string;count:number}[]
  responseType:string
  numericMean:number|null
  numericSampleSd:number|null
}
const numeric=(values:number[])=>{
  if(!values.length)return {mean:null,sd:null}
  const mean=values.reduce((a,b)=>a+b,0)/values.length
  const sd=values.length>1
    ?Math.sqrt(values.reduce((sum,x)=>sum+(x-mean)**2,0)/(values.length-1))
    :null
  return {mean,sd}
}
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
    const combinations=new Map<string,number>()
    const possible=new Set(codebook.options.map(o=>o.code))
    const multi=codebook.responseType==='MULTIPLE'||codebook.responseType==='SJT_MULTIPLE'
    const values:number[]=[]
    for(const row of rows){
      if(row.missingReason){
        missingByReason[row.missingReason]=(missingByReason[row.missingReason]||0)+1
        continue
      }
      if(row.value===null)continue
      if(typeof row.value==='number'&&Number.isFinite(row.value))values.push(row.value)
      else if(codebook.options.length&&typeof row.value==='string'){
        if(multi){
          let selected:unknown
          try{selected=JSON.parse(row.value)}catch{throw new Error('Frozen multi-choice response is not valid JSON')}
          if(!Array.isArray(selected)||selected.some(x=>typeof x!=='string'||!possible.has(x))
            ||new Set(selected).size!==selected.length)
            throw new Error('Frozen multi-choice source contains invalid or duplicate options')
          const normalized=[...selected].sort() as string[]
          for(const item of normalized)frequencies.set(item,(frequencies.get(item)||0)+1)
          const combination=JSON.stringify(normalized)
          combinations.set(combination,(combinations.get(combination)||0)+1)
        }else if(possible.has(row.value)){
          frequencies.set(row.value,(frequencies.get(row.value)||0)+1)
        }
      }
    }
    const stats=numeric(values)
    items.push({columnKey:column,itemKey:codebook.itemKey,prompt:codebook.prompt,
      instrumentKey:codebook.instrumentKey,kind:codebook.kind,responseType:codebook.responseType,
      combinationFrequencies:[...combinations].map(([value,count])=>({value,count})),
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
    projectId:source.projectId,observations:source.scores,
    expectedColumns:source.scoreColumns,...input,
  })
}


/** Survey-only, project-scoped descriptive comparison. Group membership must
 * come from one frozen Form categorical item; no free text, small-cell detail,
 * causal attribution or access to other products is permitted.
 */
export function describeWaveGroups(source:SurveySourceProjection,input:{
  waveId:string;groupInstrumentKey:string;groupItemKey:string;
  scoreInstrumentKey:string;scoreKey:string
}){
  const {waveId,groupInstrumentKey,groupItemKey,scoreInstrumentKey,scoreKey}=input
  const candidates=source.codebook.filter(c=>c.waveId===waveId&&c.kind==='FORM'
    &&c.instrumentKey===groupInstrumentKey&&c.itemKey===groupItemKey
    &&['SINGLE','LIKERT'].includes(c.responseType))
  if(candidates.length!==1)throw new Error('分组变量必须是当前冻结 Form 的单选或 Likert 项')
  const variable=candidates[0]
  const allowed=new Map(variable.options.map(o=>[o.code,o.label]))
  const answers=source.raw.filter(x=>x.waveId===waveId&&x.columnKey===variable.columnKey
    &&x.missingReason===null&&typeof x.value==='string')
  const scoreRows=source.scores.filter(s=>s.waveId===waveId
    &&s.measurement.instrumentKey===scoreInstrumentKey
    &&s.measurement.scoreKey===scoreKey)
  if(!scoreRows.length)throw new Error('此波次暂无已完成的研究性计分指标')
  const signatures=new Set(scoreRows.map(x=>[
    x.measurement.scoringDigest,x.measurement.responseSignature,
    x.measurement.respondentType,x.measurement.unit].join(':')))
  if(signatures.size!==1)throw new Error('本波次包含不可混合的评分版本')
  const scores=new Map(scoreRows.map(s=>[s.attemptId,s]))
  const buckets=new Map<string,{attempts:Set<string>;numbers:number[]}>()
  for(const answer of answers){
    const code=answer.value as string
    if(!allowed.has(code))throw new Error('已冻结的分组回答包含未知编码')
    const bucket=buckets.get(code)||{attempts:new Set<string>(),numbers:[]}
    if(bucket.attempts.has(answer.attemptId))throw new Error('重复的完成答卷分组标记')
    bucket.attempts.add(answer.attemptId)
    const score=scores.get(answer.attemptId)
    if(score&&score.missingReason===null&&score.value!==null&&Number.isFinite(score.value))
      bucket.numbers.push(score.value)
    buckets.set(code,bucket)
  }
  const minGroupN=5
  const groups=[...buckets].filter(([,b])=>b.attempts.size>=minGroupN)
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([code,b])=>({
      optionCode:code,optionLabel:allowed.get(code)!,
      respondentN:b.attempts.size,scoreValidN:b.numbers.length,
      mean:numeric(b.numbers).mean,sampleSd:numeric(b.numbers).sd,
    }))
  return {waveId,groupInstrumentKey,groupItemKey,scoreInstrumentKey,scoreKey,
    minGroupN,groups,suppressedGroups:buckets.size-groups.length,
    note:'仅对冻结的 Form 单选分组做描述性比较；少于 5 份答卷的小组不展示。组均值不能证明因果或诊断。'}
}
