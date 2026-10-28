import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {DUAL_IDENTITY,DUAL_PROTOCOL,assertDualConfig,same,dualPlan,type DualConfig,type DualRaw} from './generated/protocol'
import type {DualReport} from './generated/report'
export interface DualSnapshot {schemaVersion:1;testType:string;engineVersion:string;scoringVersion:string;configVersion:string;config:DualConfig;protocol:typeof DUAL_PROTOCOL;configHash:string;protocolSignature:string;frozenAt:string}
export interface DualContext {contextKey:string;snapshot:DualSnapshot;randomSeed:string;manifestHash:string}
export interface DualDraft {contextKey:string;phase:'practice'|'test';round:number;index:number;raw:DualRaw;configHash:string;protocolSignature:string;manifestHash:string;realm:{timeOriginMs:number;pageInstanceId:string};recordKey:string;recordDigest:string}
export interface DualFinal {contextKey:string;configHash:string;protocolSignature:string;manifestHash:string;formalCount:number;practiceCount:number;termination:'completed'|'aborted';terminationReason:string|null;recordDigests:string[];finalPayloadDigest:string}
export interface DualReceipt {contextKey:string;finalPayloadDigest:string;finalSaved:true;receiptId:string;report:DualReport}
export interface DualPorts {
 /** Durably freeze full context/plans/realm; reject an already exposed identity. Memory is not a durable implementation. */
 prepareLocalAttempt(context:DualContext,manifest:ReturnType<typeof dualManifest>,realm:DualDraft['realm']):Promise<{fresh:true;contextKey:string;bindingDigest:string}>
 /** Per-trial local durable save, no per-frame network writes. */
 persistLocalDraft(record:DualDraft):Promise<{retained:true;contextKey:string;recordKey:string;recordDigest:string}>
 /** Confirm core/report only. Full raw archival is independent; do not clear drafts before actual archive acknowledgement. */
 finalize(claim:DualFinal):Promise<DualReceipt>
}
function sorted(v:unknown):unknown{if(Array.isArray(v))return v.map(sorted);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted((v as Record<string,unknown>)[k])]));return v}
export const digest=(v:unknown)=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(sorted(v)))))
export const dualManifest=(c:DualContext)=>({formal:dualPlan(c.snapshot.config,c.randomSeed),practice:[0,1,2].map(round=>dualPlan(c.snapshot.config,c.randomSeed,'practice',round))})
export function validateDualContext(value:DualContext){const c=structuredClone(value),s=c.snapshot;if(!c.contextKey||c.contextKey.length>512||!c.randomSeed||c.randomSeed.length>256||s.schemaVersion!==1||s.testType!==DUAL_IDENTITY.testType||s.engineVersion!==DUAL_IDENTITY.engineVersion||s.scoringVersion!==DUAL_IDENTITY.scoringVersion||s.configVersion!==DUAL_IDENTITY.configVersion||!same(s.protocol,DUAL_PROTOCOL))throw Error('Unknown frozen dual identity')
 assertDualConfig(s.config);if(digest(s.config)!==s.configHash||digest(s.protocol)!==s.protocolSignature||digest(dualPlan(s.config,c.randomSeed))!==c.manifestHash)throw Error('Frozen dual hash mismatch');return c}
