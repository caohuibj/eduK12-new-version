import {z} from 'zod'
import type {AuthoritativeScorerInput,CognitiveScoreResult,TrialEnvelope} from '../../v2/types'
import {parseSessionConfigSnapshot} from '../../v2/session-snapshot'
import {parseTrialEnvelope} from '../../v2/trial-envelope'
import {sha256} from '../../v2/canonical'
import {NUMBER_SERIES_IDENTITY,NUMBER_SERIES_PROTOCOL,FAMILIES,numberSeriesPlan,reviewNumberSeriesRaw,same,type NumberSeriesConfig,type NumberSeriesRaw,type Family} from './protocol'
import {numberSeriesConfigValidator,numberSeriesRawValidator} from './validation'
import {emptyConditions,median,rate,difference,type Counts} from './analysis'
export const numberSeriesEnvelope=(raw:NumberSeriesRaw):TrialEnvelope<NumberSeriesRaw>=>({schemaVersion:1,trialIndex:raw.plan.index,phase:'test',condition:raw.plan.family,startedAtPerfMs:raw.startedAtPerfMs,endedAtPerfMs:raw.endedAtPerfMs,durationMs:raw.endedAtPerfMs-raw.startedAtPerfMs,flags:{timeout:false,premature:false},qualityEvents:raw.status==='interrupted'?['resume']:[],payload:raw})
export function scoreNumberSeries(input:AuthoritativeScorerInput<NumberSeriesConfig,NumberSeriesRaw>):CognitiveScoreResult {
  const call=z.object({session:z.unknown(),config:z.unknown(),randomSeed:z.string().min(1).max(256),trials:z.array(z.unknown()).max(24)}).strict().parse(input)
  const snapshot=parseSessionConfigSnapshot<NumberSeriesConfig>(call.session)
  if(snapshot.testType!==NUMBER_SERIES_IDENTITY.testType||snapshot.engineVersion!==NUMBER_SERIES_IDENTITY.engineVersion||snapshot.scoringVersion!==NUMBER_SERIES_IDENTITY.scoringVersion||snapshot.configVersion!==NUMBER_SERIES_IDENTITY.configVersion||!same(snapshot.protocol,NUMBER_SERIES_PROTOCOL)||(snapshot.referenceBindings?.length??0)>0)throw Error('Unknown exact number-series combination')
  const config=numberSeriesConfigValidator.parse(snapshot.config)
  if(!same(config,numberSeriesConfigValidator.parse(call.config)))throw Error('Number-series config differs from frozen snapshot')
  const plan=numberSeriesPlan(config,call.randomSeed)
  if(call.trials.length>plan.length)throw Error('Number-series trial budget exceeded')
  const counts:Counts={planned:plan.length,received:call.trials.length,opportunities:0,correct:0,wrong:0,skipped:0,interrupted:0,unpresented:plan.length-call.trials.length}
  const conditions=emptyConditions(config),times:Record<Family,number[]>={addition:[],multiplication:[],'growing-gap':[]}
  let previousEnd:number|null=null,technical=false
  for(const [index,value] of call.trials.entries()) {
    const envelope=parseTrialEnvelope<NumberSeriesRaw>(value),raw=numberSeriesRawValidator.parse(envelope.payload)
    if(envelope.phase!=='test'||envelope.trialIndex!==index||envelope.condition!==plan[index].family||envelope.startedAtPerfMs!==raw.startedAtPerfMs||envelope.endedAtPerfMs!==raw.endedAtPerfMs||envelope.durationMs!==raw.endedAtPerfMs-raw.startedAtPerfMs||(previousEnd!==null&&raw.startedAtPerfMs<previousEnd))throw Error('Number-series envelope/order/clock differs')
    previousEnd=raw.endedAtPerfMs
    const result=reviewNumberSeriesRaw(raw,plan[index]),bucket=conditions[plan[index].family]
    if(envelope.flags.timeout||envelope.flags.premature||envelope.qualityEvents.length>0)technical=true
    if(!result.opportunity){counts.interrupted++;bucket.interrupted++;technical=true;continue}
    counts.opportunities++;bucket.opportunities++
    if(result.skipped){counts.skipped++;bucket.skipped++}
    else if(result.correct){counts.correct++;bucket.correct++;if(result.rtMs!==null)times[plan[index].family].push(result.rtMs)}
    else{counts.wrong++;bucket.wrong++}
  }
  for(const family of FAMILIES)conditions[family].correctRtMs=median(times[family])
  const flags={noCompleteOpportunities:counts.opportunities===0,incompletePlan:counts.opportunities!==counts.planned,technicalInterruption:technical}
  const conditionRates=Object.fromEntries(FAMILIES.map(f=>[f,{accuracy:rate(conditions[f].correct,conditions[f].opportunities),skipRate:rate(conditions[f].skipped,conditions[f].opportunities)}]))
  return {metrics:{counts,conditions,accuracy:rate(counts.correct,counts.opportunities),skipRate:rate(counts.skipped,counts.opportunities),correctRtMs:median(FAMILIES.flatMap(f=>times[f])),conditionRates,
    growingMinusAdditionAccuracy:difference(rate(conditions['growing-gap'].correct,conditions['growing-gap'].opportunities),rate(conditions.addition.correct,conditions.addition.opportunities)),
    growingMinusAdditionRtMs:difference(conditions['growing-gap'].correctRtMs,conditions.addition.correctRtMs),
    reportBinding:{...NUMBER_SERIES_IDENTITY,profile:config.profile,configHash:snapshot.configHash,protocolSignature:snapshot.protocolSignature,manifestHash:sha256(plan),bankHash:config.bankHash,parameterInterpretationVersion:config.parameterInterpretationVersion,reportDefinitionVersion:config.reportDefinitionVersion,presentationVersion:config.presentationVersion}},
    quality:{state:flags.noCompleteOpportunities?'invalid':Object.values(flags).some(Boolean)?'limited':'interpretable',flags,reasons:Object.entries(flags).filter(([,v])=>v).map(([k])=>k)},audit:{trialCount:call.trials.length,scorerVersion:NUMBER_SERIES_IDENTITY.scoringVersion}}
}
