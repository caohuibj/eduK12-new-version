import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {HORIZON_IDENTITY,HORIZON_PROTOCOL,assertHorizonConfig,same,horizonPlan,type HorizonConfig,type HorizonRaw} from './generated/protocol'
import type {HorizonReport} from './generated/report'
export interface HorizonSnapshot {schemaVersion:1;testType:string;engineVersion:string;scoringVersion:string;configVersion:string;config:HorizonConfig;protocol:typeof HORIZON_PROTOCOL;configHash:string;protocolSignature:string;frozenAt:string}
export interface HorizonContext {contextKey:string;snapshot:HorizonSnapshot;randomSeed:string;manifestHash:string}
export interface HorizonDraft {contextKey:string;phase:'practice'|'test';round:number;index:number;raw:HorizonRaw;configHash:string;protocolSignature:string;manifestHash:string;realm:{timeOriginMs:number;pageInstanceId:string};recordKey:string;recordDigest:string}
export interface HorizonFinal {contextKey:string;configHash:string;protocolSignature:string;manifestHash:string;formalCount:number;practiceCount:number;termination:'completed'|'aborted';terminationReason:string|null;recordDigests:string[];finalPayloadDigest:string}
export interface HorizonReceipt {contextKey:string;finalPayloadDigest:string;finalSaved:true;receiptId:string;report:HorizonReport}
export interface HorizonPorts {
 /** Durably freeze full context/plans/realm; reject an already exposed identity. Memory is not a durable implementation. */
 prepareLocalAttempt(context:HorizonContext,manifest:ReturnType<typeof horizonManifest>,realm:HorizonDraft['realm']):Promise<{fresh:true;contextKey:string;bindingDigest:string}>
 /** Per-trial local durable save, no per-frame network writes. */
 persistLocalDraft(record:HorizonDraft):Promise<{retained:true;contextKey:string;recordKey:string;recordDigest:string}>
 /** Confirm core/report only. Full raw archival is independent; do not clear drafts before actual archive acknowledgement. */
 finalize(claim:HorizonFinal):Promise<HorizonReceipt>
}
function sorted(v:unknown):unknown{if(Array.isArray(v))return v.map(sorted);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted((v as Record<string,unknown>)[k])]));return v}
export const digest=(v:unknown)=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(sorted(v)))))
export const horizonManifest=(c:HorizonContext)=>({formal:horizonPlan(c.snapshot.config,c.randomSeed),practice:[0,1,2].map(round=>horizonPlan(c.snapshot.config,c.randomSeed,'practice',round))})
export function validateHorizonContext(value:HorizonContext){const c=structuredClone(value),s=c.snapshot;if(!c.contextKey||c.contextKey.length>512||!c.randomSeed||c.randomSeed.length>256||s.schemaVersion!==1||s.testType!==HORIZON_IDENTITY.testType||s.engineVersion!==HORIZON_IDENTITY.engineVersion||s.scoringVersion!==HORIZON_IDENTITY.scoringVersion||s.configVersion!==HORIZON_IDENTITY.configVersion||!same(s.protocol,HORIZON_PROTOCOL))throw Error('Unknown frozen horizon identity')
 assertHorizonConfig(s.config);if(digest(s.config)!==s.configHash||digest(s.protocol)!==s.protocolSignature||digest(horizonPlan(s.config,c.randomSeed))!==c.manifestHash)throw Error('Frozen horizon hash mismatch');return c}
