import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {SEARCH_IDENTITY,SEARCH_PROTOCOL,assertSearchConfig,same,searchPlan,type SearchConfig,type SearchRaw} from './generated/protocol'
import type {SearchReport} from './generated/report'
export interface SearchSnapshot {schemaVersion:1;testType:string;engineVersion:string;scoringVersion:string;configVersion:string;config:SearchConfig;protocol:typeof SEARCH_PROTOCOL;configHash:string;protocolSignature:string;frozenAt:string}
export interface SearchContext {contextKey:string;snapshot:SearchSnapshot;randomSeed:string;manifestHash:string}
export interface SearchDraft {contextKey:string;phase:'practice'|'test';round:number;index:number;raw:SearchRaw;configHash:string;protocolSignature:string;manifestHash:string;realm:{timeOriginMs:number;pageInstanceId:string};recordKey:string;recordDigest:string}
export interface SearchFinal {contextKey:string;configHash:string;protocolSignature:string;manifestHash:string;formalCount:number;practiceCount:number;termination:'completed'|'aborted';terminationReason:string|null;recordDigests:string[];finalPayloadDigest:string}
export interface SearchReceipt {contextKey:string;finalPayloadDigest:string;finalSaved:true;receiptId:string;report:SearchReport}
export interface SearchPorts {
 /** Durably freeze full context/plans/realm; reject an already exposed identity. Memory is not a durable implementation. */
 prepareLocalAttempt(context:SearchContext,manifest:ReturnType<typeof searchManifest>,realm:SearchDraft['realm']):Promise<{fresh:true;contextKey:string;bindingDigest:string}>
 /** Per-trial local durable save, no per-frame network writes. */
 persistLocalDraft(record:SearchDraft):Promise<{retained:true;contextKey:string;recordKey:string;recordDigest:string}>
 /** Confirm core/report only. Full raw archival is independent; do not clear drafts before actual archive acknowledgement. */
 finalize(claim:SearchFinal):Promise<SearchReceipt>
}
function sorted(v:unknown):unknown{if(Array.isArray(v))return v.map(sorted);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted((v as Record<string,unknown>)[k])]));return v}
export const digest=(v:unknown)=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(sorted(v)))))
export const searchManifest=(c:SearchContext)=>({formal:searchPlan(c.snapshot.config,c.randomSeed),practice:[0,1,2].map(round=>searchPlan(c.snapshot.config,c.randomSeed,'practice',round))})
export function validateSearchContext(value:SearchContext){const c=structuredClone(value),s=c.snapshot;if(!c.contextKey||c.contextKey.length>512||!c.randomSeed||c.randomSeed.length>256||s.schemaVersion!==1||s.testType!==SEARCH_IDENTITY.testType||s.engineVersion!==SEARCH_IDENTITY.engineVersion||s.scoringVersion!==SEARCH_IDENTITY.scoringVersion||s.configVersion!==SEARCH_IDENTITY.configVersion||!same(s.protocol,SEARCH_PROTOCOL))throw Error('Unknown frozen search identity')
 assertSearchConfig(s.config);if(digest(s.config)!==s.configHash||digest(s.protocol)!==s.protocolSignature||digest(searchPlan(s.config,c.randomSeed))!==c.manifestHash)throw Error('Frozen search hash mismatch');return c}
