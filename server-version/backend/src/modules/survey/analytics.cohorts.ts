/** Researcher-only deterministic longitudinal cohort algorithms. No normality,
 * causal, clinical or norm-based inference. Data must already be projected from
 * an authenticated project-scoped, frozen FINAL source (PR4 read adapter).
 */
export type MissingReason =
  | 'NOT_SHOWN' | 'SHOWN_MISSING' | 'REFUSED' | 'NO_WAVE'
  | 'ABANDONED' | 'NOT_COMPARABLE' | 'WITHDRAWN' | 'QUALITY_EXCLUDED'
export interface SurveyMeasurementIdentity {
  instrumentKey:string
  scoreKey:string
  scoringDigest:string
  responseSignature:string
  respondentType:string
  unit:string|null
}
export interface FrozenScoreObservation {
  projectId:string
  waveId:string
  waveOrdinal:number
  attemptId:string
  researchCode:string|null
  sourceFinalHash:string
  sourceVerified:true
  measurement:SurveyMeasurementIdentity
  value:number|null
  missingReason:MissingReason|null
  completedAt:string
}
export interface PairedDescriptive {
  baselineWaveId:string
  followupWaveId:string
  baselineN:number
  followupN:number
  matchedN:number
  attritionN:number
  lateJoinN:number
  meanPairedChange:number|null
  comparability:'COMPARABLE'|'NOT_COMPARABLE'
  reason?:string
}
const finite=(v:number|null):v is number=>v!==null&&Number.isFinite(v)
const measurementMatches=(a:SurveyMeasurementIdentity,b:SurveyMeasurementIdentity)=>
  a.instrumentKey===b.instrumentKey&&a.scoreKey===b.scoreKey
  &&a.scoringDigest===b.scoringDigest&&a.responseSignature===b.responseSignature
  &&a.respondentType===b.respondentType&&a.unit===b.unit
const distinct=(xs:string[])=>new Set(xs).size===xs.length

export function pairedDescriptive(input:{
  projectId:string;baselineWaveId:string;followupWaveId:string;
  instrumentKey:string;scoreKey:string;observations:readonly FrozenScoreObservation[]
  expectedColumns?:readonly Pick<FrozenScoreObservation,'projectId'|'waveId'|'measurement'>[]
}):PairedDescriptive {
  const {projectId,baselineWaveId,followupWaveId,instrumentKey,scoreKey,observations}=input
  if(baselineWaveId===followupWaveId)throw new Error('Paired waves must be distinct')
  if(observations.some(o=>o.projectId!==projectId||o.sourceVerified!==true))
    throw new Error('Longitudinal inputs require one authorized project and verified FINAL sources')
  const filtered=observations.filter(o=>
    (o.waveId===baselineWaveId||o.waveId===followupWaveId)
    &&o.measurement.instrumentKey===instrumentKey
    &&o.measurement.scoreKey===scoreKey
    &&o.missingReason!== 'WITHDRAWN')
  if(filtered.some(o=>!o.researchCode))
    throw new Error('SINGLE_UNLINKED cannot be individually matched')
  const baselines=filtered.filter(o=>o.waveId===baselineWaveId)
  const followups=filtered.filter(o=>o.waveId===followupWaveId)
  const allKeys=filtered.map(o=>o.waveId+':'+o.researchCode)
  if(!distinct(allKeys))throw new Error('Duplicate completed participant/wave measurement')
  const byCode=(items:FrozenScoreObservation[])=>new Map(items.map(o=>[o.researchCode!,o]))
  const early=byCode(baselines),late=byCode(followups)
  const valid=(o:FrozenScoreObservation)=>finite(o.value)&&o.missingReason===null
  const eligibleA=[...early.values()].filter(valid),eligibleB=[...late.values()].filter(valid)
  const before=new Set(eligibleA.map(o=>o.researchCode!))
  const after=new Set(eligibleB.map(o=>o.researchCode!))
  const candidates=[...before].filter(code=>after.has(code))
  // Comparability is first a property of the immutable frozen measurements,
  // not something inferred solely from whatever participants finished.
  let comparable=true
  const frozen=input.expectedColumns||[]
  if(frozen.some(x=>x.projectId!==projectId))
    throw new Error('Measurement dictionaries must belong to this project')
  if(frozen.length){
    const metric=(waveId:string)=>frozen.filter(x=>x.waveId===waveId
      &&x.measurement.instrumentKey===instrumentKey&&x.measurement.scoreKey===scoreKey)
    const baselineMetric=metric(baselineWaveId),followupMetric=metric(followupWaveId)
    if(baselineMetric.length!==1||followupMetric.length!==1
      ||!measurementMatches(baselineMetric[0].measurement,followupMetric[0].measurement))
      comparable=false
  }
  for(const code of candidates){
    const a=early.get(code)!,b=late.get(code)!
    if(!measurementMatches(a.measurement,b.measurement)){comparable=false;break}
  }
  const matched=candidates.length
  if(matched===0)comparable=false
  const changes=comparable?candidates.map(code=>late.get(code)!.value!-early.get(code)!.value!):[]
  // A wave's complete sample and a truly paired sample have distinct denominators.
  return {
    baselineWaveId,followupWaveId,
    baselineN:eligibleA.length,followupN:eligibleB.length,matchedN:matched,
    attritionN:eligibleA.filter(o=>!after.has(o.researchCode!)).length,
    lateJoinN:eligibleB.filter(o=>!before.has(o.researchCode!)).length,
    meanPairedChange:comparable&&matched?changes.reduce((n,x)=>n+x,0)/matched:null,
    comparability:comparable?'COMPARABLE':'NOT_COMPARABLE',
    ...(!comparable?{reason:matched===0
      ?'两个波次没有共同的有效配对样本，无法计算或证明可比较的变化'
      :'评分、响应编码、研究视角或测量单位不同，不能自动计算变化'}:{}),
  }
}
export interface WaveSummary {
  waveId:string
  finished:number
  excluded:number
  distinctResearchCodes:number|null
  missingByReason:Partial<Record<MissingReason,number>>
}
export function summarizeWaveScores(projectId:string,waveId:string,rows:readonly FrozenScoreObservation[]):WaveSummary {
  if(rows.some(r=>r.projectId!==projectId||r.sourceVerified!==true))
    throw new Error('Unauthorized or unverified longitudinal source')
  const matches=rows.filter(r=>r.waveId===waveId)
  const attempts=new Set(matches.map(r=>r.attemptId))
  const codes=new Set(matches.map(r=>r.researchCode).filter((v):v is string=>typeof v==='string'))
  const reasons:WaveSummary['missingByReason']={}
  for(const row of matches)if(row.missingReason)
    reasons[row.missingReason]=(reasons[row.missingReason]??0)+1
  return {
    waveId,finished:attempts.size,excluded:0,
    distinctResearchCodes:matches.every(m=>m.researchCode!==null)?codes.size:null,
    missingByReason:reasons,
  }
}
/** The read adapter must filter withdrawn/excluded source attempts and ensure
 * status COMPLETED itself is authoritative. This function does not inspect DB.
 */
