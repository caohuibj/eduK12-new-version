import {z} from 'zod'
import type {AuthoritativeScorerInput,CognitiveScoreResult,TrialEnvelope} from '../../v2/types'
import {parseSessionConfigSnapshot} from '../../v2/session-snapshot'
import {parseTrialEnvelope} from '../../v2/trial-envelope'
import {HORIZON_IDENTITY,HORIZON_PROTOCOL,horizonPlan,same,type HorizonConfig,type HorizonRaw} from './protocol'
import {horizonConfigSchema,horizonRawSchema} from './schema'
import {reviewHorizon,type FirstFree} from './analysis'
import {HORIZON_GROUPS,horizonGroup,horizonRateDifference,type HorizonGroupKey,type HorizonReport} from './report'
export const horizonEnvelope=(raw:HorizonRaw):TrialEnvelope<HorizonRaw>=>({schemaVersion:1,trialIndex:raw.plan.index,phase:'test',condition:`${raw.plan.information}:${raw.plan.freeChoices}`,startedAtPerfMs:raw.startedAtPerfMs,endedAtPerfMs:raw.endedAtPerfMs,durationMs:raw.endedAtPerfMs-raw.startedAtPerfMs,flags:{timeout:false,premature:false},qualityEvents:raw.status==='interrupted'?['resume']:[],payload:raw})
export function scoreHorizon(input:AuthoritativeScorerInput<HorizonConfig,HorizonRaw>):CognitiveScoreResult {
 const call=z.object({session:z.unknown(),config:z.unknown(),randomSeed:z.string().min(1).max(256),trials:z.array(z.unknown()).max(320)}).strict().parse(input),s=parseSessionConfigSnapshot<HorizonConfig>(call.session)
 if(s.testType!==HORIZON_IDENTITY.testType||s.engineVersion!=='0.1.0'||s.scoringVersion!=='0.1.0'||s.configVersion!=='0.1.0'||!same(s.protocol,HORIZON_PROTOCOL)||(s.referenceBindings?.length??0)>0)throw Error('Unsupported exact Horizon identity')
 const c=horizonConfigSchema.parse(s.config);if(!same(c,horizonConfigSchema.parse(call.config)))throw Error('Horizon config differs from snapshot');const plan=horizonPlan(c,call.randomSeed);if(call.trials.length>plan.length)throw Error('Horizon profile budget exceeded')
 const rows:Record<HorizonGroupKey,FirstFree[]>={equalShort:[],equalLong:[],unequalShort:[],unequalLong:[]};let completed=0,total=0,later=0,reward=0,technical=0,previousEnd:number|null=null
 for(const [index,v] of call.trials.entries()){const e=parseTrialEnvelope<HorizonRaw>(v),raw=horizonRawSchema.parse(e.payload)
  if(e.phase!=='test'||e.trialIndex!==index||e.condition!==`${plan[index].information}:${plan[index].freeChoices}`||e.startedAtPerfMs!==raw.startedAtPerfMs||e.endedAtPerfMs!==raw.endedAtPerfMs||e.durationMs!==raw.endedAtPerfMs-raw.startedAtPerfMs||(previousEnd!==null&&raw.startedAtPerfMs<previousEnd))throw Error('Horizon envelope/clock ownership differs');previousEnd=raw.endedAtPerfMs
  const result=reviewHorizon(raw,plan[index],c);if(raw.status==='interrupted'||e.flags.timeout||e.flags.premature||e.qualityEvents.length)technical++
  if(result.first)rows[(raw.plan.information+(raw.plan.freeChoices===1?'Short':'Long')) as HorizonGroupKey].push(result.first);if(result.completed)completed++;total+=result.totalChoices;later+=result.laterFreeChoices;reward+=result.totalReward
 }
 const groups=Object.fromEntries(HORIZON_GROUPS.map(key=>[key,horizonGroup(c.totalGames/4,key.startsWith('unequal'),rows[key])])) as HorizonReport['groups'],valid=HORIZON_GROUPS.reduce((n,k)=>n+rows[k].length,0),flags={noValidFirstChoices:valid===0,incompleteRecords:completed!==c.totalGames,technicalLoss:technical>0}
 return {metrics:{expectedGameCount:c.totalGames,receivedGameCount:call.trials.length,completedGameCount:completed,validFirstChoiceCount:valid,totalChoiceCount:total,laterFreeChoiceCount:later,totalReward:reward,groups,longMinusShortLessSampledRate:horizonRateDifference(groups),reportBinding:{...HORIZON_IDENTITY,profile:c.profile,configHash:s.configHash,protocolSignature:s.protocolSignature,reportDefinitionVersion:c.reportDefinitionVersion}},quality:{state:flags.noValidFirstChoices?'invalid':Object.values(flags).some(Boolean)?'limited':'interpretable',flags,reasons:Object.entries(flags).filter(([,v])=>v).map(([k])=>k)},audit:{trialCount:call.trials.length,scorerVersion:HORIZON_IDENTITY.scoringVersion}}
}
