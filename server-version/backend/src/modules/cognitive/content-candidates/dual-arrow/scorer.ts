import {z} from 'zod'
import type {AuthoritativeScorerInput,CognitiveScoreResult,TrialEnvelope} from '../../v2/types'
import {parseSessionConfigSnapshot} from '../../v2/session-snapshot'
import {parseTrialEnvelope} from '../../v2/trial-envelope'
import {DUAL_IDENTITY,DUAL_PROTOCOL,dualPlan,same,type DualConfig,type DualRaw} from './protocol'
import {dualConfigSchema,dualRawSchema} from './schema'
import {reviewDual,medianDual} from './analysis'
import {DUAL_GROUPS,dualDifferences,type DualGroup} from './report'
export const dualEnvelope=(raw:DualRaw):TrialEnvelope<DualRaw>=>({schemaVersion:1,trialIndex:raw.plan.index,phase:'test',condition:raw.plan.mode,startedAtPerfMs:raw.startedAtPerfMs,endedAtPerfMs:raw.endedAtPerfMs,durationMs:raw.endedAtPerfMs-raw.startedAtPerfMs,flags:{timeout:false,premature:false},qualityEvents:raw.status==='interrupted'?['resume']:[],payload:raw})
export function scoreDual(input:AuthoritativeScorerInput<DualConfig,DualRaw>):CognitiveScoreResult{const call=z.object({session:z.unknown(),config:z.unknown(),randomSeed:z.string().min(1).max(256),trials:z.array(z.unknown()).max(300)}).strict().parse(input),s=parseSessionConfigSnapshot<DualConfig>(call.session)
 if(s.testType!==DUAL_IDENTITY.testType||s.engineVersion!==DUAL_IDENTITY.engineVersion||s.scoringVersion!==DUAL_IDENTITY.scoringVersion||s.configVersion!==DUAL_IDENTITY.configVersion||!same(s.protocol,DUAL_PROTOCOL)||(s.referenceBindings?.length??0)>0)throw Error('Unsupported exact dual identity')
 const c=dualConfigSchema.parse(s.config);if(!same(c,dualConfigSchema.parse(call.config)))throw Error('Dual config differs from snapshot');const plan=dualPlan(c,call.randomSeed);if(call.trials.length>plan.length)throw Error('Dual profile budget exceeded')
 const groups=Object.fromEntries(DUAL_GROUPS.map((key):[typeof DUAL_GROUPS[number],DualGroup&{times:number[]}]=>[key,{plannedRequired:c.totalTrials/3,presentedRequired:0,answered:0,correct:0,missed:0,correctRTCount:0,medianCorrectMs:null,inputs:{},times:[]}])) as Record<typeof DUAL_GROUPS[number],DualGroup&{times:number[]}>
 let valid=0,dualTrials=0,both=0,technical=0,previousEnd:number|null=null
 for(const [index,value] of call.trials.entries()){const e=parseTrialEnvelope<DualRaw>(value),raw=dualRawSchema.parse(e.payload)
  if(e.phase!=='test'||e.trialIndex!==index||e.condition!==plan[index].mode||e.startedAtPerfMs!==raw.startedAtPerfMs||e.endedAtPerfMs!==raw.endedAtPerfMs||e.durationMs!==raw.endedAtPerfMs-raw.startedAtPerfMs||(previousEnd!==null&&raw.startedAtPerfMs<previousEnd))throw Error('Dual envelope/clock ownership mismatch');previousEnd=raw.endedAtPerfMs
  const row=reviewDual(raw,plan[index],c);if(!row.valid||raw.status==='interrupted'||e.flags.timeout||e.flags.premature||e.qualityEvents.length)technical++
  if(row.valid){valid++;if(raw.plan.mode==='dual'){dualTrials++;if(row.blue.correct&&row.red.correct)both++}
   for(const channel of ['blue','red'] as const){const response=row[channel];if(!response.required)continue;const key=(channel+(raw.plan.mode==='dual'?'Dual':'Single')) as typeof DUAL_GROUPS[number],g=groups[key];g.presentedRequired++
    if(response.answered){g.answered++;g.inputs[response.input!]=(g.inputs[response.input!]??0)+1}else g.missed++
    if(response.correct){g.correct++;g.times.push(response.rtMs!)}}}
 }
 const projected=Object.fromEntries(DUAL_GROUPS.map(key=>{const g=groups[key];return [key,{plannedRequired:g.plannedRequired,presentedRequired:g.presentedRequired,answered:g.answered,correct:g.correct,missed:g.missed,correctRTCount:g.correct,medianCorrectMs:medianDual(g.times),inputs:g.inputs}]})) as Record<typeof DUAL_GROUPS[number],DualGroup>
 const flags={noValidTrials:valid===0,incompleteRecords:valid!==c.totalTrials,technicalLoss:technical>0,missingResponses:DUAL_GROUPS.some(key=>projected[key].missed>0),unavailableLatency:DUAL_GROUPS.some(key=>projected[key].correct===0)}
 return {metrics:{validTrialCount:valid,receivedTrialCount:call.trials.length,expectedTrialCount:c.totalTrials,dualTrialCount:dualTrials,bothCorrectDualCount:both,groups:projected,differences:dualDifferences(projected),reportBinding:{...DUAL_IDENTITY,profile:c.profile,configHash:s.configHash,protocolSignature:s.protocolSignature,reportDefinitionVersion:c.reportDefinitionVersion}},quality:{state:flags.noValidTrials?'invalid':Object.values(flags).some(Boolean)?'limited':'interpretable',flags,reasons:Object.entries(flags).filter(([,v])=>v).map(([k])=>k)},audit:{trialCount:call.trials.length,scorerVersion:DUAL_IDENTITY.scoringVersion}}
}
