import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {BLINK_IDENTITY,BLINK_PROTOCOL,assertBlinkConfig,same,blinkPlan,type BlinkConfig,type BlinkRaw} from './generated/protocol'
import type {BlinkReport} from './generated/report'
export interface BlinkSnapshot {schemaVersion:1;testType:string;engineVersion:string;scoringVersion:string;configVersion:string;config:BlinkConfig;protocol:typeof BLINK_PROTOCOL;configHash:string;protocolSignature:string;frozenAt:string}
export interface BlinkContext {contextKey:string;snapshot:BlinkSnapshot;randomSeed:string;manifestHash:string}
export interface BlinkDraft {contextKey:string;phase:'practice'|'test';round:number;index:number;raw:BlinkRaw;configHash:string;protocolSignature:string;manifestHash:string;realm:{timeOriginMs:number;pageInstanceId:string};recordKey:string;recordDigest:string}
export interface BlinkFinal {contextKey:string;configHash:string;protocolSignature:string;manifestHash:string;formalCount:number;practiceCount:number;termination:'completed'|'aborted';terminationReason:string|null;recordDigests:string[];finalPayloadDigest:string}
export interface BlinkReceipt {contextKey:string;finalPayloadDigest:string;finalSaved:true;receiptId:string;report:BlinkReport}
export interface BlinkPorts {
 /** Durably freeze full context/plans/realm; reject an already exposed identity. Memory is not a durable implementation. */
 prepareLocalAttempt(context:BlinkContext,manifest:ReturnType<typeof blinkManifest>,realm:BlinkDraft['realm']):Promise<{fresh:true;contextKey:string;bindingDigest:string}>
 /** Per-trial local durable save, no per-frame network writes. */
 persistLocalDraft(record:BlinkDraft):Promise<{retained:true;contextKey:string;recordKey:string;recordDigest:string}>
 /** Confirm core/report only. Full raw archival is independent; do not clear drafts before actual archive acknowledgement. */
 finalize(claim:BlinkFinal):Promise<BlinkReceipt>
}
function sorted(v:unknown):unknown{if(Array.isArray(v))return v.map(sorted);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted((v as Record<string,unknown>)[k])]));return v}
export const digest=(v:unknown)=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(sorted(v)))))
export const blinkManifest=(c:BlinkContext)=>({formal:blinkPlan(c.snapshot.config,c.randomSeed),practice:[0,1,2].map(round=>blinkPlan(c.snapshot.config,c.randomSeed,'practice',round))})
export function validateBlinkContext(value:BlinkContext){const c=structuredClone(value),s=c.snapshot;if(!c.contextKey||c.contextKey.length>512||!c.randomSeed||c.randomSeed.length>256||s.schemaVersion!==1||s.testType!==BLINK_IDENTITY.testType||s.engineVersion!==BLINK_IDENTITY.engineVersion||s.scoringVersion!==BLINK_IDENTITY.scoringVersion||s.configVersion!==BLINK_IDENTITY.configVersion||!same(s.protocol,BLINK_PROTOCOL))throw Error('Unknown frozen blink identity')
 assertBlinkConfig(s.config);if(digest(s.config)!==s.configHash||digest(s.protocol)!==s.protocolSignature||digest(blinkPlan(s.config,c.randomSeed))!==c.manifestHash)throw Error('Frozen blink hash mismatch');return c}
