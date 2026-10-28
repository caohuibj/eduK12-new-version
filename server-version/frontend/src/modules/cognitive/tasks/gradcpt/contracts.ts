import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {GRAD_IDENTITY,GRAD_PROTOCOL,assertGradConfig,same,gradPlan,gradPracticePlans,type GradConfig,type GradRaw} from './generated/protocol'
import type {GradReport} from './generated/report'
export interface GradSnapshot {schemaVersion:1;testType:string;engineVersion:string;scoringVersion:string;configVersion:string;config:GradConfig;protocol:typeof GRAD_PROTOCOL;configHash:string;protocolSignature:string;frozenAt:string}
export interface GradContext {contextKey:string;snapshot:GradSnapshot;randomSeed:string;manifestHash:string}
export interface GradDraft {contextKey:string;phase:'practice'|'test';round:number;index:number;raw:GradRaw;configHash:string;protocolSignature:string;manifestHash:string;realm:{timeOriginMs:number;pageInstanceId:string};recordKey:string;recordDigest:string}
export interface GradFinal {contextKey:string;configHash:string;protocolSignature:string;manifestHash:string;formalCaptureCount:number;presented:number;practiceCount:number;termination:'completed'|'aborted';terminationReason:string|null;recordDigests:string[];finalPayloadDigest:string}
export interface GradReceipt {contextKey:string;finalPayloadDigest:string;finalSaved:true;receiptId:string;report:GradReport}
export interface GradPorts {
 /** Must durably retain frozen identity, full plan, realm and reject an already-exposed identity; memory is not durable. */
 prepareLocalAttempt(context:GradContext,manifest:ReturnType<typeof gradManifest>,realm:GradDraft['realm']):Promise<{fresh:true;contextKey:string;bindingDigest:string}>
 /** One local capture after each practice item or formal continuous sequence, never per-frame HTTP. */
 persistLocalDraft(record:GradDraft):Promise<{retained:true;contextKey:string;recordKey:string;recordDigest:string}>
 /** Only confirmed core/report receipt, independent of full raw archival. Never clear draft without actual archival confirmation. */
 finalize(claim:GradFinal):Promise<GradReceipt>
}
function sorted(v:unknown):unknown{if(Array.isArray(v))return v.map(sorted);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted((v as Record<string,unknown>)[k])]));return v}
export const digest=(v:unknown)=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(sorted(v)))))
export const gradManifest=(c:GradContext)=>({formal:gradPlan(c.snapshot.config,c.randomSeed),practice:[0,1,2].map(round=>gradPracticePlans(c.snapshot.config,c.randomSeed,round))})
export function validateGradContext(value:GradContext){const c=structuredClone(value),s=c.snapshot;if(!c.contextKey||c.contextKey.length>512||!c.randomSeed||c.randomSeed.length>256||s.schemaVersion!==1||s.testType!==GRAD_IDENTITY.testType||s.engineVersion!==GRAD_IDENTITY.engineVersion||s.scoringVersion!==GRAD_IDENTITY.scoringVersion||s.configVersion!==GRAD_IDENTITY.configVersion||!same(s.protocol,GRAD_PROTOCOL))throw Error('Unknown frozen gradCPT identity')
 assertGradConfig(s.config);if(digest(s.config)!==s.configHash||digest(s.protocol)!==s.protocolSignature||digest(gradPlan(s.config,c.randomSeed))!==c.manifestHash)throw Error('Frozen gradCPT hash mismatch');return c}
