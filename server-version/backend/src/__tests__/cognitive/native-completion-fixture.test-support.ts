import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {getNativeContentDefinition} from '../../modules/cognitive/content-candidates/native-registry/definitions'
import {completionFromNativeClaim} from '../../modules/cognitive/native-completion'
const retained=JSON.parse(readFileSync(resolve(__dirname,'../../../../../docs/cognitive-library/onboarding-content-20261028/parallel-review/hearts-flowers/completion-claim-regression.json'),'utf8'))
/** Reuse old complete raw; this new case tests an abort after the last actual window closed. */
export function nativeCompletionFixture(sessionId='native-completion-fixture',epoch=1){
 const input=structuredClone(retained.input),s=input.session,adapter=getNativeContentDefinition(s.testType,s.engineVersion,s.scoringVersion)!
 const contextKey=JSON.stringify([sessionId,epoch,s.configHash]),manifest=adapter.manifest(s.config,input.randomSeed),manifestHash=adapter.manifestHash(s.config,input.randomSeed)
 const context={contextKey,randomSeed:input.randomSeed,manifestHash,snapshot:s},realm={timeOriginMs:100,pageInstanceId:'SYNTHETIC-COMPLETION-REALM'}
 const records=input.trials.map((trial:any,index:number)=>{const body={contextKey,configHash:s.configHash,protocolSignature:s.protocolSignature,manifestHash,realm,recordKey:'test:0:'+index,phase:'test',round:0,index,raw:trial.payload};return {...body,recordDigest:canonicalHash(body)}})
 const body={contextKey,configHash:s.configHash,protocolSignature:s.protocolSignature,manifestHash,formalCount:records.length,practiceCount:0,termination:'aborted',terminationReason:'window-blur-after-final-record',recordDigests:records.map((r:any)=>r.recordDigest)}
 const claim={...body,finalPayloadDigest:canonicalHash(body)},completion=completionFromNativeClaim(claim)
 return {input,records,claim,completion,detail:{schemaVersion:1,kind:'COGNITIVE_NATIVE_CONTENT_V1',context,manifest,realm,records,claim}}
}
