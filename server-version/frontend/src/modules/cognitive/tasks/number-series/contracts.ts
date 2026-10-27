import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {NUMBER_SERIES_IDENTITY,NUMBER_SERIES_PROTOCOL,assertNumberSeriesConfig,canonicalValue,numberSeriesPlan,same,freeze,type NumberSeriesConfig,type NumberSeriesRaw} from './generated/protocol'
import type {NumberSeriesReport,Language} from './generated/report'
export const digest=(value:unknown)=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(canonicalValue(value)))))
export interface NumberSeriesSnapshot {
  schemaVersion:1;testType:string;engineVersion:string;scoringVersion:string;configVersion:string
  config:NumberSeriesConfig
  protocol:Omit<typeof NUMBER_SERIES_PROTOCOL,'phases'>&{phases:{key:'test'|'learning'|'delayed';persists:boolean;required:boolean}[]}
  configHash:string;protocolSignature:string;frozenAt:string
}
export interface NumberSeriesContext {contextKey:string;language:Language;snapshot:NumberSeriesSnapshot;randomSeed:string;manifestHash:string}
export interface NumberSeriesDraft {
  contextKey:string;phase:'practice'|'test';round:number;index:number;raw:NumberSeriesRaw
  configHash:string;protocolSignature:string;manifestHash:string;realm:{timeOriginMs:number;pageInstanceId:string}
  recordKey:string;recordDigest:string
}
export interface NumberSeriesFinal {
  contextKey:string;configHash:string;protocolSignature:string;manifestHash:string
  formalCount:number;practiceCount:number;termination:'completed'|'aborted';terminationReason:string|null
  recordDigests:string[];finalPayloadDigest:string
}
export interface NumberSeriesReceipt {contextKey:string;finalPayloadDigest:string;finalSaved:true;receiptId:string;report:NumberSeriesReport}
/** Candidate-local ports; no API/DB/COS implementation or global interface is added. */
export interface NumberSeriesPorts {
  /** Retain the complete context, including language, once under contextKey before exposure; the acknowledgement binds it. */
  prepareLocalAttempt(context:NumberSeriesContext,manifest:ReturnType<typeof numberSeriesManifest>,realm:NumberSeriesDraft['realm']):Promise<{fresh:true;contextKey:string;bindingDigest:string}>
  /** Existing host must retain one exact draft idempotently before acknowledging it. */
  persistLocalDraft(record:NumberSeriesDraft):Promise<{retained:true;contextKey:string;recordKey:string;recordDigest:string}>
  /** Core/report receipt only; never claims the full raw archive succeeded. */
  finalize(claim:NumberSeriesFinal):Promise<NumberSeriesReceipt>
}
export const numberSeriesManifest=(context:NumberSeriesContext)=>freeze({formal:numberSeriesPlan(context.snapshot.config,context.randomSeed),practice:[0,1,2].map(round=>numberSeriesPlan(context.snapshot.config,context.randomSeed,'practice',round))})
export function validateNumberSeriesContext(value:NumberSeriesContext):NumberSeriesContext {
  const c=structuredClone(value),s=c.snapshot
  if(c.language!=='zh'&&c.language!=='en')throw Error('Unknown frozen number-series teaching language')
  if(!c.contextKey||c.contextKey.length>512||typeof c.contextKey!=='string'||s.schemaVersion!==1||s.testType!==NUMBER_SERIES_IDENTITY.testType||s.engineVersion!==NUMBER_SERIES_IDENTITY.engineVersion||s.scoringVersion!==NUMBER_SERIES_IDENTITY.scoringVersion||s.configVersion!==NUMBER_SERIES_IDENTITY.configVersion||!same(s.protocol,NUMBER_SERIES_PROTOCOL)||!Number.isFinite(Date.parse(s.frozenAt)))throw Error('Unknown frozen number-series identity')
  assertNumberSeriesConfig(s.config)
  if(digest(s.config)!==s.configHash||digest(s.protocol)!==s.protocolSignature||digest(numberSeriesPlan(s.config,c.randomSeed))!==c.manifestHash)throw Error('Number-series snapshot/manifest hash mismatch')
  return freeze(c)
}
