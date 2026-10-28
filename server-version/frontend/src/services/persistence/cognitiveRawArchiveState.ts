import type {FinalDraftMeta} from './finalDraftStore'
export interface CognitiveArchiveIdentity {sessionId:string;attemptEpoch:number;submissionId:string;definitionHash:string}
export interface CognitiveArchiveReceipt extends CognitiveArchiveIdentity {
 coreSaved:true;archiveState:'pending'|'confirmed';archiveConfirmed:boolean;rawSubmissionId:string;coreHash:string;
 rawSha256?:string;logicalHash?:string;assetId?:string;objectKey?:string;sha256?:string;sizeBytes?:number
}
export interface CognitiveRawArchiveState {
 schemaVersion:1;identity:CognitiveArchiveIdentity;rawPayload:unknown;rawSha256:string;
 coreSaved:boolean;archiveState:'sealed'|'pending'|'retry'|'confirmed';archiveConfirmed:boolean;
 receipt?:CognitiveArchiveReceipt;lastError?:string
}
export type CognitiveArchiveMutation={kind:'seal';rawPayload:unknown;rawSha256:string}|{kind:'core-saved'}
 |{kind:'receipt';receipt:CognitiveArchiveReceipt}|{kind:'retry';message:string}
export const archiveIdentityMatches=(a:CognitiveArchiveIdentity,b:CognitiveArchiveIdentity)=>
 a.sessionId===b.sessionId&&a.attemptEpoch===b.attemptEpoch&&a.submissionId===b.submissionId&&a.definitionHash===b.definitionHash
const clone=<T,>(value:T):T=>structuredClone(value)
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
/** Local lifecycle metadata only; neither a client permission claim nor an alternative FINAL payload. */
export function mutateCognitiveRawArchive(meta:FinalDraftMeta,identity:CognitiveArchiveIdentity,mutation:CognitiveArchiveMutation):FinalDraftMeta {
 if(meta.instrument!=='cognitive'||meta.attemptId!==identity.sessionId||meta.attemptEpoch!==identity.attemptEpoch
  ||meta.submissionId!==identity.submissionId||meta.definitionHash!==identity.definitionHash)throw Error('Raw archive frozen identity mismatch')
 const current=meta.cognitiveRawArchive
 if(current&&!archiveIdentityMatches(current.identity,identity))throw Error('Existing raw archive identity mismatch')
 if(mutation.kind==='seal'){
  if(!hex(mutation.rawSha256)||mutation.rawPayload===undefined)throw Error('Raw archive needs sealed JSON and SHA256')
  if(current){if(current.rawSha256!==mutation.rawSha256||JSON.stringify(current.rawPayload)!==JSON.stringify(mutation.rawPayload))throw Error('Raw archive cannot replace an already sealed original');return clone(meta)}
  if(meta.status!=='DRAFT'||meta.sealedSubmission)throw Error('Raw archive must be sealed before core FINAL')
  return {...meta,cognitiveRawArchive:{schemaVersion:1,identity:clone(identity),rawPayload:clone(mutation.rawPayload),rawSha256:mutation.rawSha256,coreSaved:false,archiveState:'sealed',archiveConfirmed:false},updatedAt:Date.now()}
 }
 if(!current||!meta.sealedSubmission)throw Error('No sealed raw/core identity to update')
 let next=clone(current)
 if(mutation.kind==='core-saved'){next.coreSaved=true;if(!next.archiveConfirmed)next.archiveState='pending'}
 else if(mutation.kind==='retry'){if(!next.archiveConfirmed){next.archiveState='retry';next.lastError=mutation.message.slice(0,500)}}
 else{
  const r=mutation.receipt
  if(!r||!archiveIdentityMatches(r,identity)||r.coreSaved!==true||!r.rawSubmissionId||!hex(r.coreHash)
   ||!['pending','confirmed'].includes(r.archiveState)||r.archiveConfirmed!==(r.archiveState==='confirmed')
   ||(r.rawSha256!==undefined&&r.rawSha256!==current.rawSha256))throw Error('Archive receipt does not match this sealed original')
  if(r.archiveConfirmed&&(!r.assetId||!r.objectKey||!hex(r.sha256)||!hex(r.logicalHash)||r.rawSha256!==current.rawSha256
   ||!Number.isSafeInteger(r.sizeBytes)||r.sizeBytes!<=0))throw Error('Confirmed archive receipt is incomplete')
  if(next.archiveConfirmed&&JSON.stringify(next.receipt)!==JSON.stringify(r))throw Error('Confirmed archive receipt cannot be downgraded or replaced')
  next={...next,coreSaved:true,archiveState:r.archiveConfirmed?'confirmed':'pending',archiveConfirmed:r.archiveConfirmed,receipt:clone(r),lastError:undefined}
 }
 return {...meta,cognitiveRawArchive:next,updatedAt:Date.now()}
}
