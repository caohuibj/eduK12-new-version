import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {readCognitiveProfileArtifact,cognitiveProfileArtifactHash,type CognitiveProfileArtifact} from '../assessment-authorization/cognitive-profile-artifact'
import {getCognitiveV2TaskDefinition} from '../cognitive/v2/registry'
import {resolveCognitiveFinalMaxTrials} from '../cognitive/v2/final-submission-budget'
import {createSessionConfigSnapshot,parseSessionConfigSnapshot} from '../cognitive/v2/session-snapshot'
import type {TaskDefinition,SessionConfigSnapshot} from '../cognitive/v2/types'
import {prepareRelease,type ReleaseInput} from '../measurement-content/release'
import type {StoredRelease} from '../measurement-content/repository'
const hash=z.string().regex(/^[a-f0-9]{64}$/)
export const SURVEY_COGNITIVE_PROFILE_TEMPLATE='native-profile-v1' as const
export const surveyCognitiveProfileDraftSchema=z.object({schemaVersion:z.literal(2),templateKey:z.literal(SURVEY_COGNITIVE_PROFILE_TEMPLATE),artifactHash:hash}).strict()
export const surveyCognitiveProfilePointerSchema=surveyCognitiveProfileDraftSchema.extend({configurationHash:hash,measurementDigest:hash,maxTrials:z.number().int().min(1).max(1000)}).strict()
export type SurveyCognitiveProfilePointer=z.infer<typeof surveyCognitiveProfilePointerSchema>
type BaseMeasurement={content:Extract<StoredRelease,{layer:'MEASUREMENT'}>['content'];assetRefs:StoredRelease['assetRefs']}
export type FrozenSurveyCognitiveProfile={schemaVersion:2;templateKey:typeof SURVEY_COGNITIVE_PROFILE_TEMPLATE;
 artifactHash:string;artifact:CognitiveProfileArtifact;sourceMeasurement:BaseMeasurement;sessionSnapshot:SessionConfigSnapshot;measurementDigest:string;maxTrials:number;
 timingPolicy:'NATIVE_PROFILE_V1';devicePolicy:'DESKTOP_KEYBOARD';restartLimit:1;maturity:'PILOT';referenceMode:'frozen-profile';partialRetentionDays:30;
 feedback:{policyVersion:'SURVEY_DESCRIPTIVE_V1';mode:'GENERAL';metricKeys:[];release:'AFTER_FINAL'}}
function fail(message='Survey 精确 profile 冻结定义不一致'):never{throw new Error(message)}
/** The first explicit adapter admits existing text/native reaction and gonogo
 * and span kernels only. Existing span runners and scorers retain stopping rules;
 * no renderer, media authority or norm transfer is introduced. */
export function assertSurveyCognitiveProfileExecutable(artifact:CognitiveProfileArtifact){
 if(artifact.schemaVersion!==2||!artifact.execution||!['reaction','gonogo','digitbackward','corsi'].includes(artifact.identity.testType)
  ||artifact.execution.presentation!==null||artifact.execution.referenceDefinitions.length||artifact.execution.compiledRuntime.referenceBindingDefinition.selections.length)
  fail('此精确 profile 尚无已验证的 Survey 原生/媒体/参考适配，暂不可选')
}
/** Exact versioned kernel only; all serializable scientific/report declarations
 * come from the original artifact. No default profile or seed is selected. */
export function surveyProfileTaskDefinition(artifact:CognitiveProfileArtifact):TaskDefinition{
 assertSurveyCognitiveProfileExecutable(artifact)
 const i=artifact.identity,definition=getCognitiveV2TaskDefinition(i.testType,i.engineVersion,i.scoringVersion)
 if(!definition)fail('原生执行版本尚不可用')
 return {...definition,protocol:artifact.protocol,presentation:artifact.execution!.presentation??undefined,
  references:artifact.execution!.referenceDefinitions,metrics:artifact.resolvedReport.v2MetricDefinitions!,quality:artifact.resolvedReport.v2QualityDefinitions!,report:artifact.resolvedReport.v2ReportDefinition!}
}
export function compileSurveyCognitiveProfile(raw:CognitiveProfileArtifact,measurement:Extract<StoredRelease,{layer:'MEASUREMENT'}>):FrozenSurveyCognitiveProfile{
 const artifact=readCognitiveProfileArtifact(raw),identity=artifact.identity
 if(measurement.family!=='COGNITIVE'||measurement.scope.kind!=='PLATFORM'||measurement.releaseId!==identity.measurement.releaseId
  ||measurement.contentHash!==identity.measurement.contentHash)fail()
 const definition=surveyProfileTaskDefinition(artifact),sessionSnapshot=createSessionConfigSnapshot({definition,configVersion:identity.configVersion,config:artifact.resolvedConfig,
  // Explicit format anchor; publication/attempt retain their real timestamps.
  frozenAt:new Date('2026-10-30T00:00:00.000Z'),runtime:{runtimeGeneration:'UNIFIED_V1',compiledRuntime:artifact.execution!.compiledRuntime,referenceBindings:[]}})
 const value={schemaVersion:2 as const,templateKey:SURVEY_COGNITIVE_PROFILE_TEMPLATE,artifactHash:cognitiveProfileArtifactHash(artifact),artifact,
  sourceMeasurement:{content:measurement.content,assetRefs:measurement.assetRefs},sessionSnapshot,maxTrials:resolveCognitiveFinalMaxTrials(definition,artifact.resolvedConfig),
  timingPolicy:'NATIVE_PROFILE_V1' as const,devicePolicy:'DESKTOP_KEYBOARD' as const,restartLimit:1 as const,maturity:'PILOT' as const,referenceMode:'frozen-profile' as const,partialRetentionDays:30 as const,
  feedback:{policyVersion:'SURVEY_DESCRIPTIVE_V1' as const,mode:'GENERAL' as const,metricKeys:[] as [],release:'AFTER_FINAL' as const}}
 return JSON.parse(JSON.stringify({...value,measurementDigest:canonicalHash(value)}))
}
export function surveyCognitiveProfilePointer(value:FrozenSurveyCognitiveProfile):SurveyCognitiveProfilePointer{
 return {schemaVersion:2,templateKey:SURVEY_COGNITIVE_PROFILE_TEMPLATE,artifactHash:value.artifactHash,configurationHash:canonicalHash(value.artifact.identity),measurementDigest:value.measurementDigest,maxTrials:value.maxTrials}
}
export function parseFrozenSurveyCognitiveProfile(raw:unknown):FrozenSurveyCognitiveProfile{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail()
 const value=raw as FrozenSurveyCognitiveProfile,{measurementDigest,...body}=value
 surveyCognitiveProfileDraftSchema.parse({schemaVersion:value.schemaVersion,templateKey:value.templateKey,artifactHash:value.artifactHash})
 const artifact=readCognitiveProfileArtifact(value.artifact),identity=artifact.identity,snapshot=parseSessionConfigSnapshot(value.sessionSnapshot)
 if(cognitiveProfileArtifactHash(artifact)!==value.artifactHash||artifact.schemaVersion!==2||!artifact.execution||canonicalHash(body)!==measurementDigest
  ||snapshot.testType!==identity.testType||snapshot.configVersion!==identity.configVersion||snapshot.engineVersion!==identity.engineVersion||snapshot.scoringVersion!==identity.scoringVersion
  ||canonicalHash(snapshot.config)!==canonicalHash(artifact.resolvedConfig)||snapshot.protocolSignature!==identity.protocolSignature
  ||canonicalHash(snapshot.compiledRuntime)!==canonicalHash(artifact.execution.compiledRuntime)||snapshot.referenceBindings?.length!==0
  ||canonicalHash(snapshot.presentation??null)!==canonicalHash(artifact.execution.presentation??null)||canonicalHash(snapshot.protocol)!==canonicalHash(artifact.protocol)||!Number.isSafeInteger(value.maxTrials)||value.maxTrials<1||value.maxTrials>1000
  ||value.timingPolicy!=='NATIVE_PROFILE_V1'||value.devicePolicy!=='DESKTOP_KEYBOARD'||value.restartLimit!==1||value.maturity!=='PILOT'||value.referenceMode!=='frozen-profile'||value.partialRetentionDays!==30
  ||canonicalHash(value.feedback)!==canonicalHash({policyVersion:'SURVEY_DESCRIPTIVE_V1',mode:'GENERAL',metricKeys:[],release:'AFTER_FINAL'}))fail()
 const base=prepareRelease({layer:'MEASUREMENT',family:'COGNITIVE',key:'frozen-original',version:identity.configVersion,scope:{kind:'PLATFORM'},sourceReleaseId:null,provenance:{testType:identity.testType},...value.sourceMeasurement})
 if(base.contentHash!==identity.measurement.contentHash)fail()
 return value
}
/** Existing Survey M publication projection, from frozen scientific content. */
export function surveyProfileMeasurementInput(value:FrozenSurveyCognitiveProfile,input:{localId:string;version:string;scope:ReleaseInput['scope']}):ReleaseInput{
 const frozen=parseFrozenSurveyCognitiveProfile(value),{report:_,...config}=frozen.artifact.resolvedConfig
 const executable=JSON.parse(JSON.stringify(frozen.sourceMeasurement.content.executable));executable.config=config;executable.finalMaxTrials=frozen.maxTrials
 executable.protocolContext={timingPolicy:frozen.timingPolicy,devicePolicy:frozen.devicePolicy,restartLimit:frozen.restartLimit}
 return {layer:'MEASUREMENT',family:'COGNITIVE',key:`cognitive:${canonicalHash(input.scope)}:${input.localId}`,version:input.version,scope:input.scope,
  sourceReleaseId:frozen.artifact.identity.measurement.releaseId,provenance:{testType:frozen.artifact.identity.testType,profileArtifactHash:frozen.artifactHash},assetRefs:frozen.sourceMeasurement.assetRefs,
  content:{...frozen.sourceMeasurement.content,measurementHash:canonicalHash(executable),executable}}
}
