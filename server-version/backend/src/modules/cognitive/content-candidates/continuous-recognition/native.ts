import { z } from 'zod'
import type { AuthoritativeScorerInput, CognitiveScoreResult, ProtocolDefinition, TrialEnvelope } from '../../v2/types'
import { parseSessionConfigSnapshot } from '../../v2/session-snapshot'
import { canonicalJson } from '../../v2/canonical'
import { parseTrialEnvelope } from '../../v2/trial-envelope'
import { freezeCandidate, IDENTITY, type Profile } from './protocol'
import { scoreRecognition, type RawRecord, type RawEvent } from './scorer'

export const NATIVE_IDENTITY = Object.freeze({ testType:'continuous-recognition',engineVersion:'0.1.0',
  scoringVersion:'0.1.0',configVersion:'0.1.0' } as const)
export const NATIVE_PROTOCOL:ProtocolDefinition={schemaVersion:1,key:'continuous-recognition/0.1.0/0.1.0',
  version:'0.1.0',clock:'performance',randomizationAlgorithmVersion:IDENTITY.generatorVersion,trialEnvelopeVersion:1,
  phases:[{key:'test',persists:true,required:true}],measurementCriticalConfigPaths:['*']}
const time=z.number().finite().nonnegative(), asset=z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/)
export const nativeConfigSchema=z.object({profile:z.enum(['research','experience']),formalAssetIds:z.array(asset).min(1).max(4096),
  practiceAssetIds:z.array(asset).length(6),imageMs:z.literal(750),isiMs:z.literal(800),
  responseRule:z.literal(IDENTITY.responseRule),generatorVersion:z.literal(IDENTITY.generatorVersion)}).strict().superRefine((v,ctx)=>{
  const all=[...v.formalAssetIds,...v.practiceAssetIds]
  if(new Set(all).size!==all.length) ctx.addIssue({code:'custom',message:'Formal/practice asset pools must be unique and isolated'})
  if(v.formalAssetIds.length<(v.profile==='research'?184:74))ctx.addIssue({code:'custom',message:'Insufficient formal asset identities'})
})
export type NativeConfig=z.infer<typeof nativeConfigSchema>
export function nativeConfig(profile:Profile,formalAssetIds:string[],practiceAssetIds:string[]):NativeConfig {
  return nativeConfigSchema.parse({profile,formalAssetIds,practiceAssetIds,imageMs:750,isiMs:800,
    responseRule:IDENTITY.responseRule,generatorVersion:IDENTITY.generatorVersion})
}
const recordSchema=z.object({index:z.number().int().min(0).max(259),assetId:asset,
  kind:z.enum(['target-first','target-repeat','filler-first','vigilance-repeat']),imageOnsetMs:time.nullable(),
  imageOffsetMs:time.nullable(),windowEndMs:time.nullable(),status:z.enum(['complete','load-failure','timeout','interrupted']),
  interruptions:z.array(z.object({atMs:time,type:z.enum(['blur','hidden','rotation','pause'])}).strict()).max(32)}).strict()
const eventSchema=z.object({id:z.string().min(1).max(80),atMs:time,action:z.enum(['seen','other']),
  input:z.enum(['touch','mouse','pen','keyboard','unknown']),key:z.string().max(32).nullable(),isRepeat:z.boolean()}).strict()
export const nativeTrialSchema=z.object({record:recordSchema,events:z.array(eventSchema).max(20),
  startedAtPerfMs:time,endedAtPerfMs:time,recordOrigin:z.enum(['live','recovered_without_timing']),
  telemetryOverflow:z.boolean()}).strict()
export type NativeTrial=z.infer<typeof nativeTrialSchema>
const invocationSchema=z.object({config:z.unknown(),session:z.unknown(),trials:z.array(z.unknown()).max(260),
  randomSeed:z.string().min(1).max(256)}).strict()
const near=(a:number,b:number)=>Math.abs(a-b)<=1e-6
/** Only real v2 SessionConfigSnapshot is external truth. FrozenCandidate is rebuilt internally, never client supplied. */
export function scoreNativeRecognition(input:AuthoritativeScorerInput<NativeConfig,NativeTrial>):CognitiveScoreResult {
  const call=invocationSchema.parse(input), session=parseSessionConfigSnapshot<NativeConfig>(call.session)
  if(session.testType!==NATIVE_IDENTITY.testType||session.engineVersion!==NATIVE_IDENTITY.engineVersion
    ||session.scoringVersion!==NATIVE_IDENTITY.scoringVersion||session.configVersion!==NATIVE_IDENTITY.configVersion
    ||canonicalJson(session.protocol)!==canonicalJson(NATIVE_PROTOCOL))throw new Error('Unsupported exact native recognition identity/protocol')
  if((session.referenceBindings?.length??0)>0)throw new Error('Recognition candidate has no authorized reference binding')
  const config=nativeConfigSchema.parse(session.config), supplied=nativeConfigSchema.parse(call.config)
  if(canonicalJson(config)!==canonicalJson(supplied))throw new Error('Scorer config differs from frozen session config')
  const frozen=freezeCandidate({profile:config.profile,seed:call.randomSeed,formalAssetIds:config.formalAssetIds,
    practiceAssetIds:config.practiceAssetIds})
  if(call.trials.length>frozen.manifest.counts.total)throw new Error('Frozen profile trial budget exceeded')
  const records:RawRecord[]=[], events:RawEvent[]=[], exclusions:Record<string,string[]>={}
  let previousEnd:number|null=null
  for(const [index,value] of call.trials.entries()) {
    const e=parseTrialEnvelope<NativeTrial>(value),p=nativeTrialSchema.parse(e.payload)
    if(e.trialIndex!==index||e.phase!=='test'||p.record.index!==index||e.condition!==p.record.kind)
      throw new Error('Envelope phase/index/condition does not match its owned record')
    if(!near(e.startedAtPerfMs,p.startedAtPerfMs)||!near(e.endedAtPerfMs,p.endedAtPerfMs)
      ||!near(e.durationMs,p.endedAtPerfMs-p.startedAtPerfMs))throw new Error('Envelope/payload actual clock mismatch')
    if(previousEnd!==null&&!near(e.startedAtPerfMs,previousEnd))throw new Error('Native recognition actual trial clock is not continuous')
    previousEnd=e.endedAtPerfMs
    if((p.record.imageOnsetMs!==null&&!near(p.record.imageOnsetMs,e.startedAtPerfMs))
      ||(p.record.windowEndMs!==null&&!near(p.record.windowEndMs,e.endedAtPerfMs)))
      throw new Error('Record actual onset/window end differs from envelope')
    for(const event of p.events)if(event.atMs<e.startedAtPerfMs||event.atMs>=e.endedAtPerfMs)
      throw new Error('Response must belong to exactly its owning half-open envelope window')
    const reasons=[...(e.flags.timeout?['technical-timeout']:[]),...(e.flags.premature?['premature-input']:[]),
      ...e.qualityEvents.map(q=>'envelope-'+q),...(p.recordOrigin!=='live'?['recovered-without-timing']:[]),
      ...(p.telemetryOverflow?['telemetry-overflow']:[])]
    if(reasons.length)exclusions[index]=reasons
    // Ordinary absence of a seen response is valid. flags.timeout denotes technical failure only.
    records.push({...p.record,status:reasons.length&&p.record.status==='complete'?'interrupted':p.record.status})
    events.push(...p.events)
  }
  // Never accepts a ResearchReview from raw or any other client-owned invocation field.
  const result=scoreRecognition(frozen,{snapshotHash:frozen.snapshotHash,phase:'formal',records,events,
    termination:records.length===frozen.manifest.counts.total?'completed':'aborted'})
  const flags={researchReviewRequired:true,noValidTargetPairs:result.metrics.completeTargetPairs===0,
    incompleteRecords:records.length!==frozen.manifest.counts.total,
    technicalLoss:Object.keys(exclusions).length>0||result.audit.validPresentations!==records.length,
    incompleteTargetPairs:result.metrics.completeTargetPairs!==result.metrics.plannedTargetPairs}
  return {metrics:{...result.metrics,receivedTrialCount:records.length,expectedTrialCount:frozen.manifest.counts.total,
    validTrialCount:result.audit.validPresentations,nativeExclusionReasons:exclusions,candidateAudit:result.audit},
    quality:{state:result.quality.state,flags,reasons:[...result.quality.reasons,
      ...(Object.keys(exclusions).length?['native-envelope-technical-exclusions']:[])]},
    audit:{trialCount:records.length,scorerVersion:NATIVE_IDENTITY.scoringVersion}}
}
/** Structural constructor only; authority/truth and cross-trial checks still run in the scorer. */
export function recognitionTrialEnvelope(value:unknown,flags={timeout:false,premature:false},
  qualityEvents:TrialEnvelope['qualityEvents']=[]):TrialEnvelope<NativeTrial> {
  const p=nativeTrialSchema.parse(value)
  return parseTrialEnvelope<NativeTrial>({schemaVersion:1,trialIndex:p.record.index,phase:'test',condition:p.record.kind,
    startedAtPerfMs:p.startedAtPerfMs,endedAtPerfMs:p.endedAtPerfMs,durationMs:p.endedAtPerfMs-p.startedAtPerfMs,
    flags,qualityEvents,payload:p})
}
/** No research-review authority exists on this native candidate path, including for forged state/flags. */
export function projectNativeRecognitionReport(result:CognitiveScoreResult) {
  const safeCount=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=260?value:null
  return {state:result.quality.state==='invalid'?'invalid' as const:'limited' as const,
    hitRate:null,falseAlarmRate:null,correctedRecognitionRate:null,targetHits:null,targetFalseAlarms:null,denominator:null,
    completeTargetPairs:safeCount(result.metrics.completeTargetPairs),plannedTargetPairs:safeCount(result.metrics.plannedTargetPairs),
    receivedTrialCount:safeCount(result.metrics.receivedTrialCount),expectedTrialCount:safeCount(result.metrics.expectedTrialCount),
    reasons:[...new Set([...result.quality.reasons,'native-research-review-authority-not-enabled'])],
    canGenerateTakeHomeImage:false,logo:'EDUK12.TOP' as const}
}
