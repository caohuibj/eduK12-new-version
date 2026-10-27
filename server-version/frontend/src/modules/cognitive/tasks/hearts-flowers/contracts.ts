import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {HF_IDENTITY,HF_PROTOCOL,assertHFConfig,same,hfPlan,type HFConfig,type HFRaw} from './generated/protocol'
import type {HFReport} from './generated/report'
export interface HFSnapshot {schemaVersion:1;testType:string;engineVersion:string;scoringVersion:string;configVersion:string;config:HFConfig;protocol:typeof HF_PROTOCOL;configHash:string;protocolSignature:string;frozenAt:string}
export interface HFContext {contextKey:string;snapshot:HFSnapshot;randomSeed:string;manifestHash:string;administration:{language:'zh'|'en';deviceClass:'PHONE'|'TABLET'|'DESKTOP_LAPTOP'|'UNKNOWN';viewportCss:{width:number;height:number}|null;dpr:number|null;displayCalibration:null}}
export interface HFDraft {contextKey:string;phase:'practice'|'test';round:number;index:number;raw:HFRaw;configHash:string;protocolSignature:string;manifestHash:string;realm:{timeOriginMs:number;pageInstanceId:string};recordKey:string;recordDigest:string}
export interface HFFinal {contextKey:string;configHash:string;protocolSignature:string;manifestHash:string;formalCount:number;practiceCount:number;termination:'completed'|'aborted';terminationReason:string|null;recordDigests:string[];finalPayloadDigest:string}
export interface HFReceipt {contextKey:string;finalPayloadDigest:string;finalSaved:true;receiptId:string;reportDigest:string;report:HFReport}
export interface HFPorts {
 /** Durably retain the full frozen context, formal+three practice manifests and realm, and reject prior exposure. Memory fixtures do not implement durability. */
 prepareLocalAttempt(context:HFContext,manifest:ReturnType<typeof hfManifest>,realm:HFDraft['realm']):Promise<{fresh:true;contextKey:string;bindingDigest:string}>
 /** Per-trial local durable write, before another trial is exposed; retry the same immutable record. */
 persistLocalDraft(record:HFDraft):Promise<{retained:true;contextKey:string;recordKey:string;recordDigest:string}>
 /** Report/core acknowledgement only. Raw COS archival is separate; retain drafts until actual archive acknowledgement. */
 finalize(claim:HFFinal):Promise<HFReceipt>
}
function sorted(v:unknown):unknown{if(Array.isArray(v))return v.map(sorted);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted((v as Record<string,unknown>)[k])]));return v}
export const digest=(v:unknown)=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(sorted(v)))))
export const hfManifest=(c:Pick<HFContext,'snapshot'|'randomSeed'>)=>({formal:hfPlan(c.snapshot.config,c.randomSeed),practice:[0,1,2].map(round=>hfPlan(c.snapshot.config,c.randomSeed,'practice',round))})
export function validateHFContext(value:HFContext){const c=structuredClone(value),s=c.snapshot,a=c.administration;if(!c.contextKey||c.contextKey.length>512||!c.randomSeed||c.randomSeed.length>256||s.schemaVersion!==1||s.testType!==HF_IDENTITY.testType||s.engineVersion!==HF_IDENTITY.engineVersion||s.scoringVersion!==HF_IDENTITY.scoringVersion||s.configVersion!==HF_IDENTITY.configVersion||!same(s.protocol,HF_PROTOCOL)||!Number.isFinite(Date.parse(s.frozenAt)))throw Error('Unknown frozen hearts-flowers identity')
 assertHFConfig(s.config);if(digest(s.config)!==s.configHash||digest(s.protocol)!==s.protocolSignature||digest(hfManifest(c))!==c.manifestHash)throw Error('Frozen context hash mismatch')
 if(!a||!['zh','en'].includes(a.language)||!['PHONE','TABLET','DESKTOP_LAPTOP','UNKNOWN'].includes(a.deviceClass)||a.displayCalibration!==null||(a.dpr!==null&&(!Number.isFinite(a.dpr)||a.dpr<=0))||(a.viewportCss!==null&&(!Number.isFinite(a.viewportCss.width)||!Number.isFinite(a.viewportCss.height)||a.viewportCss.width<=0||a.viewportCss.height<=0)))throw Error('Unknown administration context');return c
}
