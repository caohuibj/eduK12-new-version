import {CognitiveScoringInputError,type CognitiveScoreResult,type ScoringTrial} from '../cognitive.types'
import type {SharegameConfig} from '../schemas/sharegame.config'
import {sharegameV2TrialSchema,type SharegameV2Trial} from '../schemas/sharegame.v2.trial'
export function scoreSharegameV2({config,trials}:{config:SharegameConfig;trials:ScoringTrial<SharegameV2Trial>[]}):CognitiveScoreResult{
 const rows=[...trials].sort((a,b)=>a.trialIndex-b.trialIndex)
 if(rows.length!==config.endowments.length)throw new CognitiveScoringInputError('sharegame v2 requires every planned round; absent trials are not zero choices')
 const payloads=rows.map((r,i)=>{
  const p=sharegameV2TrialSchema.safeParse(r.payload)
  if(r.trialIndex!==i||!p.success||p.data.endowment!==config.endowments[i]||(p.data.response==='choice'&&p.data.rtMs>=config.timeoutMs))throw new CognitiveScoringInputError('sharegame v2 invalid frozen round or response')
  return p.data
 })
 const valid=payloads.filter((p):p is Extract<SharegameV2Trial,{response:'choice'}>=>p.response==='choice')
 const n=valid.length, total=valid.reduce((s,p)=>s+p.endowment,0), rates=valid.map(p=>p.given/p.endowment)
 const round=(v:number)=>Number(v.toFixed(4))
 const mean=n?rates.reduce((s,v)=>s+v,0)/n:0
 const times=valid.map(p=>p.rtMs).sort((a,b)=>a-b), mid=Math.floor(n/2)
 return {score:0,showProductIndex:false,metrics:{
  plannedRounds:rows.length,answeredRounds:n,timeoutRounds:payloads.filter(p=>p.response==='timeout').length,
  omittedRounds:payloads.filter(p=>p.response==='omitted').length,responseRate:n/rows.length,
  answeredEndowment:total,zeroChoiceCount:valid.filter(p=>p.given===0).length,
  givingRate:n?round(valid.reduce((s,p)=>s+p.given,0)/total):null,
  equalSplitCount:n?valid.filter(p=>p.given*2===p.endowment).length:null,
  generousRate:n?round(valid.filter(p=>p.given*2>=p.endowment).length/n):null,
  givingRateSd:n?round(Math.sqrt(rates.reduce((s,r)=>s+(r-mean)**2,0)/n)):null,
  medianDecisionMs:n?(n%2?times[mid]:(times[mid-1]+times[mid])/2):null,
 },qualityFlags:{interpretable:n>0,incomplete:n<rows.length,interrupted:payloads.some(p=>p.interrupted)}}
}
