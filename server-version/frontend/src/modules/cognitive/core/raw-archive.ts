import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {finalDraftStore,IndexedDbFinalDraftStore,type FinalDraftStore,type FinalDraftMeta} from '../../../services/persistence/finalDraftStore'
import type {CognitiveArchiveIdentity,CognitiveArchiveReceipt,CognitiveRawArchiveState} from '../../../services/persistence/cognitiveRawArchiveState'
export type {CognitiveArchiveIdentity,CognitiveArchiveReceipt,CognitiveRawArchiveState}
const canonical=(v:unknown):unknown=>{
 if(v===null||typeof v==='string'||typeof v==='boolean')return v
 if(typeof v==='number'&&Number.isFinite(v))return v
 if(Array.isArray(v))return v.map(canonical)
 if(v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype)return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical((v as Record<string,unknown>)[k])]))
 throw Error('Raw archive must contain finite JSON values')
}
export const cognitiveRawDigest=(raw:unknown)=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(canonical(raw)))))
export function requireCognitiveDurability(store:FinalDraftStore=finalDraftStore){
 if(typeof indexedDB==='undefined'||!(store instanceof IndexedDbFinalDraftStore))throw Error('本机耐久存储不可用，测验尚未开始')
 return store
}
export const cognitiveArchiveIdentity=(meta:FinalDraftMeta):CognitiveArchiveIdentity=>({sessionId:meta.attemptId,attemptEpoch:meta.attemptEpoch,submissionId:meta.submissionId,definitionHash:meta.definitionHash})
export async function sealCognitiveArchive(draftKey:string,rawPayload:unknown,store:FinalDraftStore=finalDraftStore){
 requireCognitiveDurability(store)
 const meta=await store.get(draftKey);if(!meta)throw Error('本地认知草稿不存在')
 return store.mutateCognitiveArchive(draftKey,cognitiveArchiveIdentity(meta),{kind:'seal',rawPayload:structuredClone(rawPayload),rawSha256:cognitiveRawDigest(rawPayload)})
}
/** Legacy drafts without sidecars retain their existing cleanup; native raw survives until COS confirmation. */
export async function finishCognitiveCoreDraft(draftKey:string,store:FinalDraftStore=finalDraftStore){
 const meta=await store.get(draftKey);if(!meta)return null
 if(meta.cognitiveRawArchive){
  const next=await store.mutateCognitiveArchive(draftKey,cognitiveArchiveIdentity(meta),{kind:'core-saved'})
  await store.setStatus(draftKey,'COMPLETED')
  if(next.cognitiveRawArchive?.archiveConfirmed)await store.delete(draftKey)
  return next.cognitiveRawArchive??null
 }
 await store.delete(draftKey);return null
}
type ArchiveSender=(identity:CognitiveArchiveIdentity,raw:{rawPayload:unknown;rawSha256:string})=>Promise<CognitiveArchiveReceipt>
/** One in-page upload per durable store/key, including receipt persistence and cleanup. */
const archiveFlights=new WeakMap<FinalDraftStore,Map<string,Promise<CognitiveRawArchiveState>>>()
export function retryCognitiveRawArchive(draftKey:string,send:ArchiveSender,store:FinalDraftStore=finalDraftStore):Promise<CognitiveRawArchiveState>{
 let flights=archiveFlights.get(store)
 if(!flights){flights=new Map();archiveFlights.set(store,flights)}
 const existing=flights.get(draftKey)
 if(existing)return existing
 const task=uploadCognitiveRawArchive(draftKey,send,store).finally(()=>{
  if(flights.get(draftKey)===task)flights.delete(draftKey)
  if(flights.size===0)archiveFlights.delete(store)
 })
 flights.set(draftKey,task)
 return task
}
async function uploadCognitiveRawArchive(draftKey:string,send:ArchiveSender,store:FinalDraftStore):Promise<CognitiveRawArchiveState>{
 const meta=await store.get(draftKey),raw=meta?.cognitiveRawArchive
 if(!meta||!raw||!raw.coreSaved||!meta.sealedSubmission)throw Error('提交保存尚未确认，不能上传原件')
 if(raw.archiveConfirmed)return raw
 const identity=cognitiveArchiveIdentity(meta)
 try{
  if(cognitiveRawDigest(raw.rawPayload)!==raw.rawSha256)throw Error('Local raw archive changed after sealing')
  const receipt=await send(identity,{rawPayload:structuredClone(raw.rawPayload),rawSha256:raw.rawSha256})
  const next=await store.mutateCognitiveArchive(draftKey,identity,{kind:'receipt',receipt})
  if(next.cognitiveRawArchive?.archiveConfirmed)await store.delete(draftKey)
  return next.cognitiveRawArchive!
 }catch(error){await store.mutateCognitiveArchive(draftKey,identity,{kind:'retry',message:error instanceof Error?error.message:'原件上传尚未确认'}).catch(()=>{});throw error}
}
