import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {SPATIAL_IDENTITY,SPATIAL_PROTOCOL,assertSpatialConfig,same,spatialPlan,type SpatialConfig,type SpatialRaw} from './generated/protocol'
import type {SpatialReport} from './generated/report'
export interface SpatialSnapshot {schemaVersion:1;testType:string;engineVersion:string;scoringVersion:string;configVersion:string;config:SpatialConfig;protocol:typeof SPATIAL_PROTOCOL;configHash:string;protocolSignature:string;frozenAt:string}
export interface SpatialContext {contextKey:string;snapshot:SpatialSnapshot;randomSeed:string;manifestHash:string}
export interface SpatialDraft {contextKey:string;recordKey:string;configHash:string;protocolSignature:string;manifestHash:string;realm:{timeOriginMs:number;pageInstanceId:string};raw:SpatialRaw;recordDigest:string}
export interface SpatialFinal {contextKey:string;configHash:string;protocolSignature:string;manifestHash:string;formalCount:number;practiceCount:number;termination:'completed'|'aborted';terminationReason:string|null;recordDigests:string[];finalPayloadDigest:string}
export interface SpatialReceipt {contextKey:string;finalPayloadDigest:string;finalSaved:true;receiptId:string;report:SpatialReport}
export interface SpatialPorts {
  /** Host must durably bind the complete frozen manifest/snapshot/realm; previously exposed attempts cannot reopen fresh. */
  prepareLocalAttempt(context:SpatialContext,manifest:ReturnType<typeof spatialPlan>,realm:SpatialDraft['realm']):Promise<{contextKey:string;bindingDigest:string;fresh:true}>
  /** Local durable draft only: no per-trial server/COS calls. No in-memory substitute for durability. */
  persistLocalDraft(record:SpatialDraft):Promise<{contextKey:string;recordKey:string;recordDigest:string;retained:true}>
  /** Host owns final core/report persistence and independent archive; report receipt does not imply raw archive success. */
  finalize(claim:SpatialFinal):Promise<SpatialReceipt>
}
function sorted(v:unknown):unknown{if(Array.isArray(v))return v.map(sorted);if(v!==null&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted((v as Record<string,unknown>)[k])]));return v}
export const digest=(v:unknown)=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(sorted(v)))))
export function validateSpatialContext(value:SpatialContext){const c=structuredClone(value),s=c.snapshot
  if(!c.contextKey||c.contextKey.length>512||!c.randomSeed||c.randomSeed.length>256||s.schemaVersion!==1||s.testType!==SPATIAL_IDENTITY.testType||s.engineVersion!==SPATIAL_IDENTITY.engineVersion
    ||s.scoringVersion!==SPATIAL_IDENTITY.scoringVersion||s.configVersion!==SPATIAL_IDENTITY.configVersion||!same(s.protocol,SPATIAL_PROTOCOL))throw Error('Unknown frozen spatial context')
  assertSpatialConfig(s.config)
  if(digest(s.config)!==s.configHash||digest(s.protocol)!==s.protocolSignature)throw Error('Spatial frozen hash mismatch')
  const manifest=spatialPlan(s.config,c.randomSeed)
  if(digest(manifest)!==c.manifestHash)throw Error('Spatial manifest mismatch')
  return c
}
