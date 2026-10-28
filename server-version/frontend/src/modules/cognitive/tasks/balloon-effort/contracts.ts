import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {EFFORT_IDENTITY,EFFORT_PROTOCOL,EFFORT_QUIZ,assertEffortConfig,same,effortPlan,type EffortConfig,type EffortRaw,type EffortQuizRaw} from './generated/protocol'
import type {EffortReport} from './generated/report'
export interface EffortSnapshot {schemaVersion:1;testType:string;engineVersion:string;scoringVersion:string;configVersion:string;config:EffortConfig;protocol:typeof EFFORT_PROTOCOL;configHash:string;protocolSignature:string;frozenAt:string}
export interface EffortContext {contextKey:string;snapshot:EffortSnapshot;randomSeed:string;manifestHash:string}
export type EffortPayload={kind:'trial';raw:EffortRaw}|{kind:'quiz';raw:EffortQuizRaw}
export type EffortDraft=EffortPayload&{contextKey:string;recordKey:string;configHash:string;protocolSignature:string;manifestHash:string;realm:{timeOriginMs:number;pageInstanceId:string};recordDigest:string}
export interface EffortFinal {contextKey:string;configHash:string;protocolSignature:string;manifestHash:string;formalCount:number;practiceCount:number;quizCount:number;termination:'completed'|'aborted';terminationReason:string|null;recordDigests:string[];finalPayloadDigest:string}
export interface EffortReceipt {contextKey:string;finalPayloadDigest:string;finalSaved:true;receiptId:string;report:EffortReport}
export const effortManifest=(context:EffortContext)=>({formal:effortPlan(context.snapshot.config,context.randomSeed),practice:[0,1,2].map(round=>effortPlan(context.snapshot.config,context.randomSeed,'practice',round)),quiz:EFFORT_QUIZ})
export interface EffortPorts {
 /** Host must durably retain the frozen snapshot/manifest/realm and reject already-exposed identities. */
 prepareLocalAttempt(context:EffortContext,manifest:ReturnType<typeof effortManifest>,realm:EffortDraft['realm']):Promise<{contextKey:string;bindingDigest:string;fresh:true}>
 /** Local durable writes, never per-press HTTP. Memory is not a durable implementation. */
 persistLocalDraft(record:EffortDraft):Promise<{contextKey:string;recordKey:string;recordDigest:string;retained:true}>
 /** Core/report acknowledgement only. Full raw archival is independent and must not clear drafts until acknowledged. */
 finalize(claim:EffortFinal):Promise<EffortReceipt>
}
function sorted(v:unknown):unknown{if(Array.isArray(v))return v.map(sorted);if(v!==null&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted((v as Record<string,unknown>)[k])]));return v}
export const digest=(v:unknown)=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(sorted(v)))))
export function validateEffortContext(value:EffortContext){const c=structuredClone(value),s=c.snapshot
 if(!c.contextKey||c.contextKey.length>512||!c.randomSeed||c.randomSeed.length>256||s.schemaVersion!==1||s.testType!==EFFORT_IDENTITY.testType||s.engineVersion!==EFFORT_IDENTITY.engineVersion
  ||s.scoringVersion!==EFFORT_IDENTITY.scoringVersion||s.configVersion!==EFFORT_IDENTITY.configVersion||!same(s.protocol,EFFORT_PROTOCOL))throw Error('Unknown frozen effort context')
 assertEffortConfig(s.config);if(digest(s.config)!==s.configHash||digest(s.protocol)!==s.protocolSignature||digest(effortPlan(s.config,c.randomSeed))!==c.manifestHash)throw Error('Effort frozen hash/manifest mismatch')
 return c
}
