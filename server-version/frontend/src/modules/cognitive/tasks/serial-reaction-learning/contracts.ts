import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {IDENTITY,PROTOCOL,assertConfig,canonical,freeze,planFor,same,type Config,type Language,type Raw} from './generated/protocol'
import type {Report} from './generated/report'
export const digest=(value:unknown)=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(canonical(value)))))
export interface Snapshot{schemaVersion:1;testType:string;engineVersion:string;scoringVersion:string;configVersion:string;config:Config;protocol:Omit<typeof PROTOCOL,'phases'>&{phases:{key:'test'|'learning'|'delayed';persists:boolean;required:boolean}[]};configHash:string;protocolSignature:string;frozenAt:string}
export interface Context{contextKey:string;language:Language;snapshot:Snapshot;randomSeed:string;manifestHash:string}
export interface Draft{contextKey:string;phase:'practice'|'test';round:number;index:number;raw:Raw;configHash:string;protocolSignature:string;manifestHash:string;realm:{timeOriginMs:number;pageInstanceId:string};recordKey:string;recordDigest:string}
export interface FinalClaim{contextKey:string;configHash:string;protocolSignature:string;manifestHash:string;formalCount:number;practiceCount:number;termination:'completed'|'aborted';terminationReason:string|null;recordDigests:string[];finalPayloadDigest:string}
export interface Receipt{contextKey:string;finalPayloadDigest:string;finalSaved:true;receiptId:string;report:Report}
/** Candidate-local ports. No API, DB, COS or global interface is implemented. */
export interface Ports{
  /** Retain complete frozen context (including actual teaching language), manifest and realm before target exposure. */
  prepareLocalAttempt(context:Context,manifest:ReturnType<typeof manifestFor>,realm:Draft['realm']):Promise<{fresh:true;contextKey:string;bindingDigest:string}>
  /** Idempotently retain this exact draft. During a run the queue never waits on IO before the next target. */
  persistLocalDraft(draft:Draft):Promise<{retained:true;contextKey:string;recordKey:string;recordDigest:string}>
  /** Host must validate drafts/practice/claim and use authoritative scorer + explicit public projection.
   * This receipt means core/report saved, never that the full original archive succeeded. */
  finalize(claim:FinalClaim):Promise<Receipt>
}
export const manifestFor=(c:Context)=>freeze({formal:planFor(c.snapshot.config,c.randomSeed),practice:[0,1,2].map(round=>planFor(c.snapshot.config,c.randomSeed,'practice',round))})
export function validateContext(value:Context):Context{
  const c=structuredClone(value),s=c.snapshot
  if(!c.contextKey||typeof c.contextKey!=='string'||c.contextKey.length>512||!['zh','en'].includes(c.language)||s.schemaVersion!==1||s.testType!==IDENTITY.testType||s.engineVersion!==IDENTITY.engineVersion||s.scoringVersion!==IDENTITY.scoringVersion||s.configVersion!==IDENTITY.configVersion||!same(s.protocol,PROTOCOL)||!Number.isFinite(Date.parse(s.frozenAt)))throw Error('Unknown SRL frozen context/language')
  assertConfig(s.config);if(digest(s.config)!==s.configHash||digest(s.protocol)!==s.protocolSignature||digest(planFor(s.config,c.randomSeed))!==c.manifestHash)throw Error('SRL snapshot or manifest changed')
  return freeze(c)
}
