import {z} from 'zod'
import type {AuthoritativeScorerInput,CognitiveScoreResult,TrialEnvelope} from '../../v2/types'
import {parseSessionConfigSnapshot} from '../../v2/session-snapshot'
import {parseTrialEnvelope} from '../../v2/trial-envelope'
import {GRAD_IDENTITY,GRAD_PROTOCOL,gradPlan,same,type GradConfig,type GradRaw} from './protocol'
import {gradConfigSchema,gradRawSchema} from './schema'
import {reviewGrad,gradStatistics} from './analysis'
export const gradEnvelope=(raw:GradRaw):TrialEnvelope<GradRaw>=>({schemaVersion:1,trialIndex:0,phase:'test',condition:'continuous',startedAtPerfMs:raw.startedAtPerfMs,endedAtPerfMs:raw.endedAtPerfMs,durationMs:raw.endedAtPerfMs-raw.startedAtPerfMs,flags:{timeout:false,premature:false},qualityEvents:raw.status==='interrupted'?['resume']:[],payload:raw})
export function scoreGrad(input:AuthoritativeScorerInput<GradConfig,GradRaw>):CognitiveScoreResult{const call=z.object({session:z.unknown(),config:z.unknown(),randomSeed:z.string().min(1).max(256),trials:z.array(z.unknown()).max(1)}).strict().parse(input),s=parseSessionConfigSnapshot<GradConfig>(call.session)
 if(s.testType!==GRAD_IDENTITY.testType||s.engineVersion!==GRAD_IDENTITY.engineVersion||s.scoringVersion!==GRAD_IDENTITY.scoringVersion||s.configVersion!==GRAD_IDENTITY.configVersion||!same(s.protocol,GRAD_PROTOCOL)||(s.referenceBindings?.length??0)>0)throw Error('Unsupported exact gradCPT identity')
 const c=gradConfigSchema.parse(s.config);if(!same(c,gradConfigSchema.parse(call.config)))throw Error('GradCPT config differs from snapshot')
 let stats:ReturnType<typeof gradStatistics>={city:0,mountain:0,hits:0,omissions:0,falseAlarms:0,correctRejections:0,rtCount:0,meanMs:null,medianMs:null,sdMs:null,cv:null,correctedHitRate:null,correctedFalseAlarmRate:null,dPrime:null,criterion:null},complete=false,presented=0,ignored:Record<string,number>={},inputs:Record<string,number>={},technical=false
 if(call.trials.length){const e=parseTrialEnvelope<GradRaw>(call.trials[0]),raw=gradRawSchema.parse(e.payload)
  if(e.phase!=='test'||e.trialIndex!==0||e.condition!=='continuous'||e.startedAtPerfMs!==raw.startedAtPerfMs||e.endedAtPerfMs!==raw.endedAtPerfMs||e.durationMs!==raw.endedAtPerfMs-raw.startedAtPerfMs)throw Error('GradCPT envelope ownership mismatch')
  const review=reviewGrad(raw,gradPlan(c,call.randomSeed));stats=gradStatistics(review);complete=review.complete;presented=review.presented;ignored=review.ignored;technical=e.flags.timeout||e.flags.premature||e.qualityEvents.length>0
  for(const [slot,response] of Object.entries(review.assigned)){if(raw.plan[Number(slot)].kind==='boundary')continue;const event=raw.events[response.eventIndex];inputs[event.input]=(inputs[event.input]??0)+1}
 }
 const flags={noSettledImages:stats.city+stats.mountain===0,incompleteSequence:!complete,technicalRecord:technical}
 return {metrics:{statistics:stats,cityOmissions:stats.omissions,mountainFalseAlarms:stats.falseAlarms,medianCorrectRT:stats.medianMs,presentedImageCount:presented,expectedImageCount:c.totalTrials,inputResponses:inputs,ignoredInput:ignored,reportBinding:{...GRAD_IDENTITY,profile:c.profile,configHash:s.configHash,protocolSignature:s.protocolSignature,reportDefinitionVersion:c.reportDefinitionVersion}},quality:{state:flags.noSettledImages?'invalid':Object.values(flags).some(Boolean)?'limited':'interpretable',flags,reasons:Object.entries(flags).filter(([,v])=>v).map(([k])=>k)},audit:{trialCount:call.trials.length,scorerVersion:GRAD_IDENTITY.scoringVersion}}
}
