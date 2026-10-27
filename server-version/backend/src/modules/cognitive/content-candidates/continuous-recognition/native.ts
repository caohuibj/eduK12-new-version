import { z } from 'zod'
import type { AuthoritativeScorerInput, CognitiveScoreResult, ProtocolDefinition, TrialEnvelope } from '../../v2/types'
import { parseSessionConfigSnapshot } from '../../v2/session-snapshot'
import { canonicalJson } from '../../v2/canonical'
import { parseTrialEnvelope } from '../../v2/trial-envelope'
import { freezeCandidate, digest, IDENTITY, type Profile } from './protocol'
import {RECOGNITION_GUIDED_IDENTITY,RECOGNITION_PRACTICE_POLICY,assertRecognitionPracticePolicy,recognitionPracticeManifest} from './practice'
import { scoreRecognition, type RawRecord, type RawEvent } from './scorer'

export const NATIVE_IDENTITY = Object.freeze({ testType:'continuous-recognition',engineVersion:'0.1.0',
  scoringVersion:'0.2.0',configVersion:'0.2.0' } as const)
export const NATIVE_PROTOCOL:ProtocolDefinition={schemaVersion:1,key:'continuous-recognition/0.1.0/0.2.0',
  version:'0.1.0',clock:'performance',randomizationAlgorithmVersion:IDENTITY.generatorVersion,trialEnvelopeVersion:1,
  phases:[{key:'test',persists:true,required:true}],measurementCriticalConfigPaths:['*']}
export const NATIVE_QUALITY_RULE='product-session-descriptive-0.2.0' as const
export const NATIVE_REPORT_VERSION='0.2.0' as const
export const assetManifestBindingSchema=z.object({status:z.enum(['authorized','pending','synthetic-review-only']),
  manifestHash:z.string().regex(/^[a-f0-9]{64}$/).nullable(),evidenceRef:z.string().min(1).max(2000).nullable()}).strict().superRefine((v,ctx)=>{
  if(v.status==='authorized'&&(!v.manifestHash||!v.evidenceRef))ctx.addIssue({code:'custom',message:'Authorized assets require a real manifest hash and evidence reference'})
})
export type AssetManifestBinding=z.infer<typeof assetManifestBindingSchema>
const time=z.number().finite().nonnegative(), asset=z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/)
export const nativeConfigSchema=z.object({profile:z.enum(['research','experience']),formalAssetIds:z.array(asset).min(1).max(4096),
  practiceAssetIds:z.array(asset).length(6),imageMs:z.literal(750),isiMs:z.literal(800),
  responseRule:z.literal(IDENTITY.responseRule),generatorVersion:z.literal(IDENTITY.generatorVersion),
  qualityRule:z.literal(NATIVE_QUALITY_RULE),assetManifestBinding:assetManifestBindingSchema}).strict().superRefine((v,ctx)=>{
  const all=[...v.formalAssetIds,...v.practiceAssetIds]
  if(new Set(all).size!==all.length) ctx.addIssue({code:'custom',message:'Formal/practice asset pools must be unique and isolated'})
  if(v.formalAssetIds.length<(v.profile==='research'?184:74))ctx.addIssue({code:'custom',message:'Insufficient formal asset identities'})
})
export type NativeConfig=z.infer<typeof nativeConfigSchema>
export function nativeConfig(profile:Profile,formalAssetIds:string[],practiceAssetIds:string[],
  assetManifestBinding:AssetManifestBinding={status:'pending',manifestHash:null,evidenceRef:null}):NativeConfig {
  return nativeConfigSchema.parse({profile,formalAssetIds,practiceAssetIds,imageMs:750,isiMs:800,
    responseRule:IDENTITY.responseRule,generatorVersion:IDENTITY.generatorVersion,qualityRule:NATIVE_QUALITY_RULE,assetManifestBinding})
}
export const guidedRecognitionConfigSchema=z.object({...nativeConfigSchema.shape,practicePolicy:z.custom<typeof RECOGNITION_PRACTICE_POLICY>(value=>{
  try{assertRecognitionPracticePolicy(value);return true}catch{return false}
})}).strict().superRefine((v,ctx)=>{
  const {practicePolicy,...base}=v,parsed=nativeConfigSchema.safeParse(base)
  if(!parsed.success)for(const issue of parsed.error.issues)ctx.addIssue({code:'custom',path:issue.path,message:issue.message})
})
export type GuidedRecognitionConfig=z.infer<typeof guidedRecognitionConfigSchema>
export type RecognitionConfig=NativeConfig|GuidedRecognitionConfig
export function guidedRecognitionConfig(profile:Profile,formalAssetIds:string[],practiceAssetIds:string[],
  binding:AssetManifestBinding={status:'pending',manifestHash:null,evidenceRef:null}):GuidedRecognitionConfig {
  return guidedRecognitionConfigSchema.parse({...nativeConfig(profile,formalAssetIds,practiceAssetIds,binding),practicePolicy:{...RECOGNITION_PRACTICE_POLICY}})
}
export const GUIDED_RECOGNITION_PROTOCOL:ProtocolDefinition={...NATIVE_PROTOCOL,key:'continuous-recognition/0.2.0/0.2.0',version:'0.2.0'}
/** Host preparation helper. Formal randomization is unchanged; the entire new teaching config/manifest is bound. */
export function freezeGuidedRecognitionManifest(value:GuidedRecognitionConfig,randomSeed:string){
  const config=guidedRecognitionConfigSchema.parse(value),base=freezeCandidate({profile:config.profile,seed:randomSeed,
    formalAssetIds:config.formalAssetIds,practiceAssetIds:config.practiceAssetIds})
  const manifest={...base.manifest,practice:recognitionPracticeManifest(config.practiceAssetIds)}
  return {manifest,manifestHash:digest({identity:RECOGNITION_GUIDED_IDENTITY,config,randomSeed,manifest})}
}
export const getRecognitionIdentity=(engineVersion:string,scoringVersion:string)=>[NATIVE_IDENTITY,RECOGNITION_GUIDED_IDENTITY]
  .find(id=>id.engineVersion===engineVersion&&id.scoringVersion===scoringVersion)
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
function scoreRecognitionIdentity(input:AuthoritativeScorerInput<RecognitionConfig,NativeTrial>,identity:ReturnType<typeof getRecognitionIdentity>,protocol:ProtocolDefinition,parseConfig:(value:unknown)=>RecognitionConfig):CognitiveScoreResult {
  if(!identity)throw Error('Unknown recognition identity')
  const call=invocationSchema.parse(input), session=parseSessionConfigSnapshot<NativeConfig>(call.session)
  if(session.testType!==NATIVE_IDENTITY.testType||session.engineVersion!==identity.engineVersion
    ||session.scoringVersion!==identity.scoringVersion||session.configVersion!==identity.configVersion
    ||canonicalJson(session.protocol)!==canonicalJson(protocol))throw new Error('Unsupported exact native recognition identity/protocol')
  if((session.referenceBindings?.length??0)>0)throw new Error('Recognition candidate has no authorized reference binding')
  const config=parseConfig(session.config), supplied=parseConfig(call.config)
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
  const flags={assetAuthorizationMissing:config.assetManifestBinding.status!=='authorized',noValidTargetPairs:result.metrics.completeTargetPairs===0,
    incompleteRecords:records.length!==frozen.manifest.counts.total,
    technicalLoss:Object.keys(exclusions).length>0||result.audit.validPresentations!==records.length,
    incompleteTargetPairs:result.metrics.completeTargetPairs!==result.metrics.plannedTargetPairs}
  const reasons=result.quality.reasons.filter(reason=>reason!=='quality-and-timing-review-required')
  if(flags.assetAuthorizationMissing)reasons.push('asset-authorization-not-confirmed')
  if(Object.keys(exclusions).length)reasons.push('native-envelope-technical-exclusions')
  const state=flags.noValidTargetPairs?'invalid':Object.values(flags).some(Boolean)?'limited':'interpretable'
  return {metrics:{...result.metrics,reportPolicy:{qualityRule:NATIVE_QUALITY_RULE,reportVersion:NATIVE_REPORT_VERSION,
    configHash:session.configHash,protocolSignature:session.protocolSignature,assetManifestBinding:config.assetManifestBinding},receivedTrialCount:records.length,expectedTrialCount:frozen.manifest.counts.total,
    validTrialCount:result.audit.validPresentations,nativeExclusionReasons:exclusions,candidateAudit:result.audit},
    quality:{state,flags,reasons},
    audit:{trialCount:records.length,scorerVersion:NATIVE_IDENTITY.scoringVersion}}
}
export const scoreNativeRecognition=(input:AuthoritativeScorerInput<NativeConfig,NativeTrial>):CognitiveScoreResult=>
  scoreRecognitionIdentity(input,NATIVE_IDENTITY,NATIVE_PROTOCOL,value=>nativeConfigSchema.parse(value))
export const scoreGuidedRecognition=(input:AuthoritativeScorerInput<GuidedRecognitionConfig,NativeTrial>):CognitiveScoreResult=>
  scoreRecognitionIdentity(input,RECOGNITION_GUIDED_IDENTITY,GUIDED_RECOGNITION_PROTOCOL,value=>guidedRecognitionConfigSchema.parse(value))
/** Structural constructor only; authority/truth and cross-trial checks still run in the scorer. */
export function recognitionTrialEnvelope(value:unknown,flags={timeout:false,premature:false},
  qualityEvents:TrialEnvelope['qualityEvents']=[]):TrialEnvelope<NativeTrial> {
  const p=nativeTrialSchema.parse(value)
  return parseTrialEnvelope<NativeTrial>({schemaVersion:1,trialIndex:p.record.index,phase:'test',condition:p.record.kind,
    startedAtPerfMs:p.startedAtPerfMs,endedAtPerfMs:p.endedAtPerfMs,durationMs:p.endedAtPerfMs-p.startedAtPerfMs,
    flags,qualityEvents,payload:p})
}
export interface NativeRecognitionReport {
  state:'interpretable'|'limited'|'invalid';profile:'experience'|'research'|null;
  reportVersion:typeof NATIVE_REPORT_VERSION;scoringVersion:typeof NATIVE_IDENTITY.scoringVersion;qualityRule:typeof NATIVE_QUALITY_RULE;
  configHash:string|null;protocolSignature:string|null;assetManifestHash:string|null;
  hitRate:number|null;falseAlarmRate:number|null;correctedRecognitionRate:number|null;
  targetHits:number|null;targetFalseAlarms:number|null;denominator:number|null;
  completeTargetPairs:number|null;plannedTargetPairs:number|null;receivedTrialCount:number|null;expectedTrialCount:number|null;
  reasons:string[];canGenerateTakeHomeImage:false;logo:'EDUK12.TOP';interpretationScope:'this-session-descriptive-only'
}
/** Public/export projection: no norms or physical timing certificate needed for an honest description of this run. */
export function projectNativeRecognitionReport(result:CognitiveScoreResult):NativeRecognitionReport {
  const count=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=260?v:null
  const m=result.metrics,q=result.quality,p=m.reportPolicy as {qualityRule?:unknown;reportVersion?:unknown;configHash?:unknown;protocolSignature?:unknown;assetManifestBinding?:AssetManifestBinding}|undefined
  const hex=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)
  const n=count(m.completeTargetPairs),planned=count(m.plannedTargetPairs),received=count(m.receivedTrialCount),expected=count(m.expectedTrialCount)
  const hits=count(m.targetHits),fa=count(m.targetFalseAlarms),rate=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1
  const profile=planned===20?'experience':planned===60?'research':null
  const permitted=result.audit.scorerVersion===NATIVE_IDENTITY.scoringVersion&&q.state==='interpretable'&&q.reasons.length===0
    &&['assetAuthorizationMissing','noValidTargetPairs','incompleteRecords','technicalLoss','incompleteTargetPairs'].every(key=>q.flags[key]===false)
    &&p?.qualityRule===NATIVE_QUALITY_RULE&&p.reportVersion===NATIVE_REPORT_VERSION&&hex(p.configHash)&&hex(p.protocolSignature)
    &&p.assetManifestBinding?.status==='authorized'&&hex(p.assetManifestBinding.manifestHash)&&!!p.assetManifestBinding.evidenceRef
    &&profile!==null&&n!==null&&n>0&&n===planned&&expected===(profile==='experience'?100:260)&&received===expected
    &&m.validTrialCount===expected&&result.audit.trialCount===received&&hits!==null&&fa!==null&&hits<=n&&fa<=n
    &&rate(m.hitRate)&&rate(m.falseAlarmRate)&&m.hitRate===hits/n&&m.falseAlarmRate===fa/n
    &&m.correctedRecognitionRate===m.hitRate-m.falseAlarmRate
  return {state:permitted?'interpretable':q.state==='invalid'?'invalid':'limited',profile,
    reportVersion:NATIVE_REPORT_VERSION,scoringVersion:NATIVE_IDENTITY.scoringVersion,qualityRule:NATIVE_QUALITY_RULE,
    configHash:hex(p?.configHash)?p.configHash:null,protocolSignature:hex(p?.protocolSignature)?p.protocolSignature:null,
    assetManifestHash:hex(p?.assetManifestBinding?.manifestHash)?p!.assetManifestBinding!.manifestHash:null,
    hitRate:permitted?m.hitRate as number:null,falseAlarmRate:permitted?m.falseAlarmRate as number:null,
    correctedRecognitionRate:permitted?m.correctedRecognitionRate as number:null,targetHits:permitted?hits:null,
    targetFalseAlarms:permitted?fa:null,denominator:permitted?n:null,completeTargetPairs:n,plannedTargetPairs:planned,
    receivedTrialCount:received,expectedTrialCount:expected,reasons:[...q.reasons,...(!permitted&&q.state==='interpretable'?['report-binding-or-metric-inconsistent']:[])],
    canGenerateTakeHomeImage:false,logo:'EDUK12.TOP',interpretationScope:'this-session-descriptive-only'}
}
