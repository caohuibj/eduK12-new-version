import {createHash} from 'node:crypto'
import {z} from 'zod'
import type {AuthoritativeScorerInput,CognitiveScoreResult,TrialEnvelope} from '../../v2/types'
import {parseSessionConfigSnapshot} from '../../v2/session-snapshot'
import {parseTrialEnvelope} from '../../v2/trial-envelope'
import {PVT_IDENTITY,PVT_PROTOCOL,canonical,same,pvtManifest,type PvtConfig,type PvtRaw} from './protocol'
import {pvtConfigSchema,pvtRawSchema} from './validation'
import {reviewPvt,pvtStats,type PvtReview} from './analysis'
export const pvtDigest=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex')
export function pvtEnvelope(raw:PvtRaw):TrialEnvelope<PvtRaw>{return {schemaVersion:1,trialIndex:raw.plan.index,phase:'test',condition:'single_target',startedAtPerfMs:raw.waitStartedAtMs,endedAtPerfMs:raw.endedAtMs,durationMs:raw.endedAtMs-raw.waitStartedAtMs,flags:{timeout:false,premature:false},qualityEvents:[],payload:raw}}
export function scorePvt(input:AuthoritativeScorerInput<PvtConfig,PvtRaw>):CognitiveScoreResult{
  const call=z.object({session:z.unknown(),config:z.unknown(),randomSeed:z.string().min(1).max(256),trials:z.array(z.unknown()).max(602)}).strict().parse(input),s=parseSessionConfigSnapshot<PvtConfig>(call.session)
  if(s.testType!==PVT_IDENTITY.testType||s.engineVersion!==PVT_IDENTITY.engineVersion||s.scoringVersion!==PVT_IDENTITY.scoringVersion||s.configVersion!==PVT_IDENTITY.configVersion||!same(s.protocol,PVT_PROTOCOL)||(s.referenceBindings?.length??0)>0)throw Error('Unsupported exact PVT identity')
  const c=pvtConfigSchema.parse(s.config);if(!same(c,pvtConfigSchema.parse(call.config)))throw Error('PVT config differs from snapshot')
  const manifest=pvtManifest(c,call.randomSeed),rows:{raw:PvtRaw;review:PvtReview}[]=[];let previous:PvtRaw|null=null,held:string[]|undefined,stopped=false,finished=false
  for(const [i,value] of call.trials.entries()){
    const e=parseTrialEnvelope<PvtRaw>(value),raw=pvtRawSchema.parse(e.payload)
    if(stopped||e.phase!=='test'||e.trialIndex!==i||e.condition!=='single_target'||raw.plan.phase!=='test'||e.startedAtPerfMs!==raw.waitStartedAtMs||e.endedAtPerfMs!==raw.endedAtMs||e.durationMs!==raw.endedAtMs-raw.waitStartedAtMs||e.flags.timeout||e.flags.premature||e.qualityEvents.length||previous&&(raw.waitStartedAtMs!==previous.endedAtMs||raw.phaseStartedAtMs!==previous.phaseStartedAtMs)||!previous&&raw.waitStartedAtMs!==raw.phaseStartedAtMs)throw Error('PVT envelope/continuous ownership mismatch')
    const review=reviewPvt(raw,manifest.formal[i],c,held);held=review.heldAfter;previous=raw;finished=review.completedBudget;stopped=finished||raw.outcome==='interrupted';rows.push({raw,review})
  }
  const statistics=pvtStats(rows),first=rows[0]?.raw.phaseStartedAtMs,observedMs=first===undefined?null:Math.min(c.durationMs,rows[rows.length-1].raw.endedAtMs-first)
  const halves=first===undefined?[pvtStats([]),pvtStats([])]:[0,1].map(k=>pvtStats(rows.filter(r=>r.review.targetOnsetMs!==null&&Math.min(1,Math.floor((r.review.targetOnsetMs-first)/(c.durationMs/2)))===k)))
  const before=halves[0].responseSpeed,after=halves[1].responseSpeed,flags={noCompleteTargets:statistics.completeTargets===0,incompleteBudget:!finished,interrupted:rows.some(r=>r.raw.outcome==='interrupted'),inputLogBound:rows.some(r=>r.raw.overflow)}
  return {metrics:{durationMs:c.durationMs,observedMs,receivedCycleCount:rows.length,completion:{finishedBudget:finished},statistics,internal:{halves,responseSpeedDifference:before===null||after===null?null:after-before,noGo:null,lapseThresholdMs:null},reportBinding:{...PVT_IDENTITY,configHash:s.configHash,protocolSignature:s.protocolSignature,manifestHash:pvtDigest(manifest),profile:c.profile,reportDefinitionVersion:c.reportDefinitionVersion,presentationVersion:c.presentationVersion}},quality:{state:statistics.completeTargets===0?'invalid':finished?'interpretable':'limited',flags,reasons:Object.entries(flags).filter(([,v])=>v).map(([k])=>k)},audit:{trialCount:rows.length,scorerVersion:PVT_IDENTITY.scoringVersion}}
}
