import {z} from 'zod'
import type {AuthoritativeScorerInput,CognitiveScoreResult,TrialEnvelope} from '../../v2/types'
import {parseSessionConfigSnapshot} from '../../v2/session-snapshot'
import {parseTrialEnvelope} from '../../v2/trial-envelope'
import {sha256} from '../../v2/canonical'
import {IDENTITY,PROTOCOL,planFor,reviewRaw,same,type Config,type Raw} from './protocol'
import {configValidator,rawValidator} from './validation'
import {emptyRuns,mean,difference,rate,type Counts,type Times} from './analysis'
export const envelopeFor=(raw:Raw):TrialEnvelope<Raw>=>({schemaVersion:1,trialIndex:raw.plan.index,phase:'test',condition:raw.plan.condition,startedAtPerfMs:raw.startedAtPerfMs,endedAtPerfMs:raw.endedAtPerfMs,durationMs:raw.endedAtPerfMs-raw.startedAtPerfMs,flags:{timeout:false,premature:false},qualityEvents:raw.status==='interrupted'&&raw.events.slice(-1)[0]?.kind==='interrupt'?(raw.events.slice(-1)[0] as {reason:string}).reason==='window-blur'?['window_blur']:(raw.events.slice(-1)[0] as {reason:string}).reason==='visibility-lost'?['visibility_lost']:[]:[],payload:raw})
export function scoreSerialReactionLearning(input:AuthoritativeScorerInput<Config,Raw>):CognitiveScoreResult{
  const call=z.object({session:z.unknown(),config:z.unknown(),randomSeed:z.string().min(1).max(256),trials:z.array(z.unknown()).max(420)}).strict().parse(input),snapshot=parseSessionConfigSnapshot<Config>(call.session)
  if(snapshot.testType!==IDENTITY.testType||snapshot.engineVersion!==IDENTITY.engineVersion||snapshot.scoringVersion!==IDENTITY.scoringVersion||snapshot.configVersion!==IDENTITY.configVersion||!same(snapshot.protocol,PROTOCOL)||(snapshot.referenceBindings?.length??0)>0)throw Error('Unknown frozen SRL identity')
  const c=configValidator.parse(snapshot.config);if(!same(c,configValidator.parse(call.config)))throw Error('SRL config differs from snapshot')
  const plan=planFor(c,call.randomSeed);if(call.trials.length>plan.length)throw Error('SRL trial budget exceeded')
  const counts:Counts={planned:plan.length,presented:call.trials.length,answered:0,firstCorrect:0,completed:0,interrupted:0,unanswered:0,unpresented:plan.length-call.trials.length,corrections:0},runs=emptyRuns(c),times:Times[]=runs.map(()=>({R:[],S:[],tail:[]}))
  let previousEnd:number|null=null,technical=false,stopped=false
  for(const [i,value] of call.trials.entries()){
    const e=parseTrialEnvelope<Raw>(value),raw=rawValidator.parse(e.payload)
    if(stopped||e.phase!=='test'||e.trialIndex!==i||e.condition!==plan[i].condition||e.startedAtPerfMs!==raw.startedAtPerfMs||e.endedAtPerfMs!==raw.endedAtPerfMs||e.durationMs!==raw.endedAtPerfMs-raw.startedAtPerfMs||(previousEnd!==null&&raw.startedAtPerfMs<previousEnd))throw Error('SRL envelope/order/clock differs')
    const r=reviewRaw(raw,plan[i]),cell=runs[plan[i].run][plan[i].condition]
    previousEnd=raw.endedAtPerfMs;stopped=r.interrupted
    cell.presented++;if(r.answered){counts.answered++;cell.answered++}else{counts.unanswered++;cell.unanswered++}
    if(r.firstCorrect===true){counts.firstCorrect++;cell.firstCorrect++;times[plan[i].run][plan[i].condition].push(r.firstRtMs!)}
    if(r.completed){counts.completed++;cell.completed++}if(r.interrupted){counts.interrupted++;cell.interrupted++;technical=true}counts.corrections+=r.corrections
    if(e.flags.timeout||e.flags.premature||e.qualityEvents.length)technical=true
  }
  for(const r of runs){for(const k of ['R','S','tail'] as const)r[k].correctRtMs=mean(times[r.run][k]);r.deltaMs=difference(r.R.correctRtMs,r.S.correctRtMs)}
  const incomplete=counts.completed!==counts.planned,lowAccuracy=runs.some(r=>(['R','S'] as const).some(k=>r[k].answered>0&&r[k].firstCorrect/r[k].answered<c.minimumConditionFirstAccuracy)),missingContrast=runs.some(r=>r.deltaMs===null)
  const flags={noFirstResponses:counts.answered===0,incompletePlan:incomplete,technicalInterruption:technical,lowConditionFirstAccuracy:lowAccuracy,missingContrast}
  const state=flags.noFirstResponses?'invalid':Object.values(flags).some(Boolean)?'limited':'interpretable'
  const deltaMs=counts.completed===counts.planned&&!missingContrast?mean(runs.map(r=>r.deltaMs!)):null
  return {metrics:{counts,runs,firstAccuracy:rate(counts.firstCorrect,counts.answered),deltaMs,reportBinding:{...IDENTITY,profile:c.profile,configHash:snapshot.configHash,protocolSignature:snapshot.protocolSignature,manifestHash:sha256(plan),parameterInterpretationVersion:c.parameterInterpretationVersion,reportDefinitionVersion:c.reportDefinitionVersion,presentationVersion:c.presentationVersion,sourceVersion:c.sourceVersion}},quality:{state,flags,reasons:Object.entries(flags).filter(([,v])=>v).map(([k])=>k)},audit:{trialCount:call.trials.length,scorerVersion:IDENTITY.scoringVersion}}
}
