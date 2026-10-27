import {finalDraftStore,IndexedDbFinalDraftStore,assertFinalDraftWriteIdentity,type FinalDraftStore,type FinalDraftWriteIdentity} from '../../../../services/persistence/finalDraftStore'
import {enumerationDigest,type EnumerationArtifact} from './display'
/** Local host association only. Artifact/record v1 and their original JSON hash scheme are unchanged. */
export interface FrozenEnumerationArtifact {
 sessionId:string
 attemptEpoch:number
 definitionHash:string
 artifact:EnumerationArtifact
}
export const ENUMERATION_LOCAL_ARTIFACT_KEY='cognitive.enumeration.artifact.v1'
export function enumerationLocalArtifact(expected:FinalDraftWriteIdentity,artifact:EnumerationArtifact):FrozenEnumerationArtifact {
 if(expected.instrument!=='cognitive'||!expected.attemptId||!Number.isSafeInteger(expected.attemptEpoch)||expected.attemptEpoch<1||!expected.definitionHash)
  throw Error('缺少真实测验归属')
 if(!artifact||artifact.schemaVersion!==1||artifact.hashScheme!=='candidate-json-stringify-sha256-v1'
  ||!artifact.context?.contextId||!artifact.context.attemptId||!artifact.context.calibration||!artifact.context.recipe
  ||!artifact.pageOrigin?.pageInstanceId||!Number.isFinite(artifact.pageOrigin.timeOrigin)||artifact.pageOrigin.timeOrigin<0
  ||artifact.pageOrigin.source!=='performance.timeOrigin-and-crypto.randomUUID'
  ||!Array.isArray(artifact.maskBits)||artifact.maskBits.length!==2304||artifact.maskBits.some(v=>v!==0&&v!==1))
  throw Error('缺少完整枚举原件')
 // Rest preserves original insertion order. Never sort, canonicalize, or reconstruct this payload.
 const {artifactHash,...payload}=artifact
 if(!/^[a-f0-9]{64}$/.test(artifactHash)||enumerationDigest(payload)!==artifactHash)throw Error('枚举原件摘要不一致')
 return {sessionId:expected.attemptId,attemptEpoch:expected.attemptEpoch,definitionHash:expected.definitionHash,artifact:structuredClone(artifact)}
}
export async function freezeEnumerationArtifact(expected:FinalDraftWriteIdentity,artifact:EnumerationArtifact,store:FinalDraftStore=finalDraftStore):Promise<FrozenEnumerationArtifact>{
 const original=enumerationLocalArtifact(expected,artifact)
 if(typeof indexedDB==='undefined'||!(store instanceof IndexedDbFinalDraftStore))throw Error('本机耐久存储不可用，测验尚未开始')
 const frozen=await store.freezeInstrumentArtifact(expected,ENUMERATION_LOCAL_ARTIFACT_KEY,original)
 return frozen.value
}
export async function readFrozenEnumerationArtifact(expected:FinalDraftWriteIdentity,store:FinalDraftStore=finalDraftStore):Promise<FrozenEnumerationArtifact|null>{
 const meta=await store.get(expected.draftKey)
 if(!meta)return null
 assertFinalDraftWriteIdentity(meta,expected)
 const original=meta.frozenInstrumentArtifacts?.[ENUMERATION_LOCAL_ARTIFACT_KEY] as FrozenEnumerationArtifact|undefined
 if(!original)return null
 if(original.sessionId!==expected.attemptId||original.attemptEpoch!==expected.attemptEpoch||original.definitionHash!==expected.definitionHash)
  throw Error('枚举原件归属不一致')
 enumerationLocalArtifact(expected,original.artifact)
 return structuredClone(original)
}
