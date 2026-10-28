import {cognitiveRawDigest as digest} from '../../core/raw-archive'
import type {NativeContentContext,NativeContentRecord,NativeContentClaim,createNativeContentPort} from '../../core/native-content-port'
import type {AntFrozenDisplay,AntNativeRawRecord} from './generated/native-protocol'
import type {NativeAntReport} from './generated/native-report'
import type {AntCompletion,AntSessionOptions} from './session'
export interface NativeAntContext extends NativeContentContext {administration:AntFrozenDisplay}
export interface NativeAntRecord extends NativeContentRecord {phase:'practice'|'test';round:number;index:number;raw:AntNativeRawRecord}
export interface NativeAntClaim extends NativeContentClaim {formalCount:number}
export type NativeAntPort=ReturnType<typeof createNativeContentPort<NativeAntContext,NativeAntRecord,NativeAntClaim,AntNativeRawRecord,NativeAntReport>>
/** Maps the existing ANT queue/receipt contract into the shared durable host; no second storage or scoring engine. */
export function antNativePorts(context:NativeAntContext,port:NativeAntPort){
 const realm={timeOriginMs:performance.timeOrigin,pageInstanceId:crypto.randomUUID()}
 return {
  claimAttemptExposure:async(identity:{contextId:string;configHash:string;protocolSignature:string})=>{
   if(identity.contextId!==context.contextKey||identity.configHash!==context.snapshot.configHash||identity.protocolSignature!==context.snapshot.protocolSignature)throw Error('ANT frozen identity mismatch')
   const receipt=await port.prepareLocalAttempt(context,(await import('./generated/native-protocol')).antNativeManifest(context.snapshot.config as never,context.randomSeed),realm)
   return {contextId:context.contextKey,durable:true as const,fresh:receipt.fresh,claimId:receipt.bindingDigest}
  },
  persistLocalDraft:(async(raw,seal)=>{
   if(raw.contextId!==context.contextKey||seal.contextId!==context.contextKey||seal.key!==raw.key||seal.recordDigest!==digest(raw)||digest(raw.raw.display)!==digest(context.administration))throw Error('ANT local record mismatch')
   const body={contextKey:context.contextKey,recordKey:raw.key,configHash:context.snapshot.configHash,protocolSignature:context.snapshot.protocolSignature,manifestHash:context.manifestHash,realm,phase:raw.phase,round:raw.raw.practice?.round??0,index:raw.core.trialIndex,raw:structuredClone(raw)},row={...body,recordDigest:digest(body)}
   await port.persistLocalDraft(row)
   return {durable:true as const,...seal}
  }) as AntSessionOptions['persistLocalDraft'],
  onTaskComplete:(async(completion:AntCompletion)=>{
   const {requestDigest,...request}=completion,inventory=await port.inventory(),records=inventory.records,keys=records.map(r=>r.raw.key),sealed=records.map(r=>({key:r.raw.key,recordDigest:digest(r.raw)}))
   if(completion.contextId!==context.contextKey||completion.configHash!==context.snapshot.configHash||completion.protocolSignature!==context.snapshot.protocolSignature||completion.fixture!==false
    ||requestDigest!==digest(request)||completion.localRecordSetDigest!==digest(sealed)||completion.localDurableCount!==records.length||digest(completion.localRecordKeys)!==digest(keys))throw Error('ANT final original record set mismatch')
   const body={contextKey:context.contextKey,configHash:context.snapshot.configHash,protocolSignature:context.snapshot.protocolSignature,manifestHash:context.manifestHash,formalCount:records.filter(r=>r.phase==='test').length,practiceCount:records.filter(r=>r.phase==='practice').length,termination:completion.status==='complete'?'completed' as const:'aborted' as const,terminationReason:completion.reason,recordDigests:records.map(r=>r.recordDigest)}
   const saved=await port.finalize({...body,finalPayloadDigest:digest(body)})
   return {contextId:context.contextKey,serverSaved:true,receiptId:saved.receiptId,configHash:context.snapshot.configHash,protocolSignature:context.snapshot.protocolSignature,localRecordSetDigest:completion.localRecordSetDigest,requestDigest}
  }) as AntSessionOptions['onTaskComplete'],
 }
}
