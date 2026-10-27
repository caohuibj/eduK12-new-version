import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {SART_IDENTITY,SART_PROTOCOL,assertSartConfig,same,sartPlan,type SartConfig,type SartRaw} from './generated/protocol'
import type {SartReport} from './generated/report'
export interface SartSnapshot {schemaVersion:1;testType:string;engineVersion:string;scoringVersion:string;configVersion:string;config:SartConfig;protocol:typeof SART_PROTOCOL;configHash:string;protocolSignature:string;frozenAt:string}
export interface SartContext {contextKey:string;snapshot:SartSnapshot;randomSeed:string;manifestHash:string}
export interface SartDraft {contextKey:string;phase:'practice'|'test';round:number;index:number;raw:SartRaw;configHash:string;protocolSignature:string;manifestHash:string;realm:{timeOriginMs:number;pageInstanceId:string};recordKey:string;recordDigest:string}
export interface SartFinal {contextKey:string;configHash:string;protocolSignature:string;manifestHash:string;formalCount:number;practiceCount:number;termination:'completed'|'aborted';terminationReason:string|null;recordDigests:string[];finalPayloadDigest:string}
export interface SartReceipt {contextKey:string;finalPayloadDigest:string;finalSaved:true;receiptId:string;report:SartReport}
export interface SartPorts {
  /** Freeze context, every plan and clock realm durably before exposure; reject reused attempts. */
  prepareLocalAttempt(context:SartContext,manifest:ReturnType<typeof sartManifest>,realm:SartDraft['realm']):Promise<{fresh:true;contextKey:string;bindingDigest:string}>
  /** Local durable port, called serially without delaying the continuous stimulus stream. Failure stops subsequent exposure. */
  persistLocalDraft(record:SartDraft):Promise<{retained:true;contextKey:string;recordKey:string;recordDigest:string}>
  /** Report/core confirmation only. Full raw archival is independent and must not be inferred or drafts cleared. */
  finalize(claim:SartFinal):Promise<SartReceipt>
}
function sorted(v:unknown):unknown{if(Array.isArray(v))return v.map(sorted);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted((v as Record<string,unknown>)[k])]));return v}
export const digest=(v:unknown)=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(sorted(v)))))
export const sartManifestPlans=(c:SartConfig,seed:string)=>({formal:sartPlan(c,seed),practice:[0,1,2].map(round=>sartPlan(c,seed,'practice',round))})
export const sartManifest=(c:SartContext)=>sartManifestPlans(c.snapshot.config,c.randomSeed)
export function validateSartContext(value:SartContext){
  const c=structuredClone(value),s=c.snapshot
  if(!c.contextKey||c.contextKey.length>512||!c.randomSeed||c.randomSeed.length>256||s.schemaVersion!==1||s.testType!==SART_IDENTITY.testType||s.engineVersion!==SART_IDENTITY.engineVersion||s.scoringVersion!==SART_IDENTITY.scoringVersion||s.configVersion!==SART_IDENTITY.configVersion||!same(s.protocol,SART_PROTOCOL)||!Number.isFinite(Date.parse(s.frozenAt)))throw Error('Unknown frozen SART identity')
  assertSartConfig(s.config)
  if(digest(s.config)!==s.configHash||digest(s.protocol)!==s.protocolSignature||digest(sartManifest(c))!==c.manifestHash)throw Error('Frozen SART hash mismatch')
  return c
}
