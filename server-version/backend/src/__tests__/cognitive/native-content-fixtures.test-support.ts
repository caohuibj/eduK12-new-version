import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {getNativeCognitiveTaskDefinition,getNativeContentDefinition} from '../../modules/cognitive/content-candidates/native-registry/definitions'
import {projectNativeContentReport} from '../../modules/cognitive/content-candidates/native-registry/public-report'
import {resolveNativeParticipantPresentation} from '../../modules/cognitive/content-candidates/native-registry/participant-presentations'
import {createBalloonEffortSnapshot} from '../../modules/cognitive/content-candidates/balloon-effort/package'
import {effortEnvelope} from '../../modules/cognitive/content-candidates/balloon-effort/scorer'
import type {ContentArchiveAuthority} from '../../modules/cognitive/content-candidates/native-registry/archive-detail'
const docs=resolve(__dirname,'../../../../../docs/cognitive-library/onboarding-content-20261028')
const retained=JSON.parse(readFileSync(resolve(docs,'batch-2/evidence/report-raw-inputs.json'),'utf8')).inputs
const effortRaw=JSON.parse(readFileSync(resolve(docs,'evidence/effort-synthetic-raw.json'),'utf8')).records
const effortSession=createBalloonEffortSnapshot('experience')
const sourceCases=[...Object.values(retained).map((v:any)=>v.complete),{session:effortSession,config:effortSession.config,randomSeed:'onboarding-effort-report-20261028',trials:effortRaw.map(effortEnvelope)}] as any[]
// The retained JSON predates the actual keyboard token contract. Preserve that file;
// adapt only its known synthetic keyboard placeholders, never production raw inputs.
for (const full of sourceCases) if (full.session.testType === 'hearts-flowers') {
 for (const {payload: raw} of full.trials) {
  for (const event of raw.events) if (event.input === 'keyboard' && event.token === 'response:1') event.token = 'key:' + event.key
  if (raw.state.response?.input === 'keyboard' && raw.state.response.token === 'response:1') raw.state.response.token = 'key:' + raw.state.response.key
  raw.state.held = raw.state.held.map((token: string) => token === 'response:1' && raw.state.response?.input === 'keyboard' ? 'key:' + raw.state.response.key : token)
 }
}
/** Existing synthetic inputs; only one formal prefix is scored for each new bridge contract. */
export const nativeContentCases=sourceCases.map(full=>{
 const input={...full,trials:full.trials.slice(0,1)},s=input.session,definition=getNativeCognitiveTaskDefinition(s.testType,s.engineVersion,s.scoringVersion)!,adapter=getNativeContentDefinition(s.testType,s.engineVersion,s.scoringVersion)!
 const score=definition.scorer(input),sessionId='content-'+s.testType,epoch=1,context={contextKey:JSON.stringify([sessionId,epoch,s.configHash]),randomSeed:input.randomSeed,manifestHash:adapter.manifestHash(input.config,input.randomSeed),
  snapshot:{schemaVersion:1 as const,testType:s.testType,engineVersion:s.engineVersion,scoringVersion:s.scoringVersion,configVersion:s.configVersion,config:s.config,protocol:s.protocol,configHash:s.configHash,protocolSignature:s.protocolSignature,frozenAt:s.frozenAt}}
 const presentation=resolveNativeParticipantPresentation(s)!,publicReport=projectNativeContentReport({...s,profile:input.config.profile,reportDefinitionVersion:definition.report.version,presentationVersion:presentation.presentationVersion,score})!
 const authority:ContentArchiveAuthority={sessionId,attemptEpoch:epoch,randomSeed:input.randomSeed,testType:s.testType,engineVersion:s.engineVersion,scoringVersion:s.scoringVersion,configVersion:s.configVersion,
  config:input.config,protocol:s.protocol,configHash:s.configHash,protocolSignature:s.protocolSignature,trials:input.trials,presentedImageCount:score.metrics.presentedImageCount}
 const realm={timeOriginMs:100,pageInstanceId:'synthetic-native-realm'},base={contextKey:context.contextKey,recordKey:'test:0',configHash:s.configHash,protocolSignature:s.protocolSignature,manifestHash:context.manifestHash,realm,raw:input.trials[0].payload,
  ...(s.testType==='balloon-effort'?{kind:'trial'}:s.testType==='precision-working-memory'?{}:{phase:'test',round:0,index:0})}
 const record={...base,recordDigest:canonicalHash(base)},body={contextKey:context.contextKey,configHash:s.configHash,protocolSignature:s.protocolSignature,manifestHash:context.manifestHash,practiceCount:0,termination:'aborted' as const,terminationReason:'synthetic-boundary-stop',recordDigests:[record.recordDigest],
  ...(s.testType==='gradcpt'?{formalCaptureCount:1,presented:score.metrics.presentedImageCount}:{formalCount:1,...(s.testType==='balloon-effort'?{quizCount:0}:{})})}
 const claim={...body,finalPayloadDigest:canonicalHash(body)},detail={schemaVersion:1 as const,kind:'COGNITIVE_NATIVE_CONTENT_V1' as const,context,manifest:adapter.manifest(input.config,input.randomSeed),realm,records:[record],claim}
 return {name:s.testType,definition,adapter,input,allTrials:full.trials,context,authority,publicReport,record,claim,detail,score}
})
