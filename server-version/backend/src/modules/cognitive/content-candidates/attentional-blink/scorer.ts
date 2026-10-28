import {z} from 'zod'
import type {AuthoritativeScorerInput,CognitiveScoreResult,TrialEnvelope} from '../../v2/types'
import {parseSessionConfigSnapshot} from '../../v2/session-snapshot'
import {parseTrialEnvelope} from '../../v2/trial-envelope'
import {BLINK_IDENTITY,BLINK_PROTOCOL,blinkPlan,same,type BlinkConfig,type BlinkRaw} from './protocol'
import {blinkConfigSchema,blinkRawSchema} from './schema'
import {reviewBlink} from './analysis'
import type {BlinkGroup} from './report'
export const blinkEnvelope=(raw:BlinkRaw):TrialEnvelope<BlinkRaw>=>({schemaVersion:1,trialIndex:raw.plan.index,phase:'test',condition:raw.plan.condition,startedAtPerfMs:raw.startedAtPerfMs,endedAtPerfMs:raw.endedAtPerfMs,durationMs:raw.endedAtPerfMs-raw.startedAtPerfMs,flags:{timeout:false,premature:false},qualityEvents:raw.status==='interrupted'?['resume']:[],payload:raw})
export function scoreBlink(input:AuthoritativeScorerInput<BlinkConfig,BlinkRaw>):CognitiveScoreResult{const call=z.object({session:z.unknown(),config:z.unknown(),randomSeed:z.string().min(1).max(256),trials:z.array(z.unknown()).max(200)}).strict().parse(input),s=parseSessionConfigSnapshot<BlinkConfig>(call.session)
 if(s.testType!==BLINK_IDENTITY.testType||s.engineVersion!==BLINK_IDENTITY.engineVersion||s.scoringVersion!==BLINK_IDENTITY.scoringVersion||s.configVersion!==BLINK_IDENTITY.configVersion||!same(s.protocol,BLINK_PROTOCOL)||(s.referenceBindings?.length??0)>0)throw Error('Unsupported exact blink identity')
 const c=blinkConfigSchema.parse(s.config);if(!same(c,blinkConfigSchema.parse(call.config)))throw Error('Blink config differs from snapshot');const plan=blinkPlan(c,call.randomSeed);if(call.trials.length>plan.length)throw Error('Blink profile budget exceeded')
 const byLag:Record<string,BlinkGroup>=Object.fromEntries(c.lags.map(lag=>[lag,{planned:c.totalTrials/5,received:0,valid:0,t1Correct:0,t2Correct:0,bothCorrect:0,t2GivenT1:null}]))
 let valid=0,t1=0,t2=0,both=0,forgot=0,technical=0,previousEnd:number|null=null
 const offsets:{index:number;t1:number|null;t2:number|null}[]=[]
 for(const [index,value] of call.trials.entries()){const e=parseTrialEnvelope<BlinkRaw>(value),raw=blinkRawSchema.parse(e.payload)
  if(e.phase!=='test'||e.trialIndex!==index||e.condition!==plan[index].condition||e.startedAtPerfMs!==raw.startedAtPerfMs||e.endedAtPerfMs!==raw.endedAtPerfMs||e.durationMs!==raw.endedAtPerfMs-raw.startedAtPerfMs||(previousEnd!==null&&raw.startedAtPerfMs<previousEnd))throw Error('Blink envelope/clock ownership mismatch');previousEnd=raw.endedAtPerfMs
  const row=reviewBlink(raw,plan[index],c),g=byLag[plan[index].lag];g.received++;if(!row.valid||e.flags.timeout||e.flags.premature||e.qualityEvents.length)technical++
  if(row.valid){valid++;g.valid++;if(row.t1){t1++;g.t1Correct++}if(row.t2){t2++;g.t2Correct++}if(row.both){both++;g.bothCorrect++}forgot+=row.forgot}offsets.push({index,t1:row.t1Offset,t2:row.t2Offset})
 }
 for(const g of Object.values(byLag))g.t2GivenT1=g.t1Correct?g.bothCorrect/g.t1Correct:null
 const flags={noValidTrials:valid===0,incompleteRecords:valid!==c.totalTrials,technicalLoss:technical>0,conditionalUnavailable:Object.values(byLag).some(g=>g.t1Correct===0)}
 return {metrics:{validTrialCount:valid,receivedTrialCount:call.trials.length,expectedTrialCount:c.totalTrials,t1CorrectCount:t1,t2CorrectCount:t2,bothCorrectCount:both,forgotTargetCount:forgot,t2GivenT1Rate:t1?both/t1:null,byLag,relativePositionErrors:offsets,reportBinding:{...BLINK_IDENTITY,profile:c.profile,configHash:s.configHash,protocolSignature:s.protocolSignature,reportDefinitionVersion:c.reportDefinitionVersion}},quality:{state:flags.noValidTrials?'invalid':Object.values(flags).some(Boolean)?'limited':'interpretable',flags,reasons:Object.entries(flags).filter(([,v])=>v).map(([k])=>k)},audit:{trialCount:call.trials.length,scorerVersion:BLINK_IDENTITY.scoringVersion}}
}
