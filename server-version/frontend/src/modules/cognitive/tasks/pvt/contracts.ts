import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {canonical,pvtManifest,type PvtContext,type PvtDraft,type PvtFinal,type PvtRealm} from './generated/protocol'
import type {PvtReport} from './generated/report'
export type {PvtContext,PvtDraft,PvtFinal,PvtRealm} from './generated/protocol'
export const digest=(v:unknown)=>bytesToHex(sha256(new TextEncoder().encode(canonical(v))))
export interface PvtReceipt {contextKey:string;finalPayloadDigest:string;finalSaved:true;receiptId:string;report:PvtReport}
export interface PvtPorts {
  /** Freeze language, all possible waits, exact versions/parameters and realm once before any exposure; reject a reused attempt. */
  prepareLocalAttempt(context:PvtContext,manifest:ReturnType<typeof pvtManifest>,realm:PvtRealm):Promise<{fresh:true;contextKey:string;bindingDigest:string}>
  /** Local durable confirmation. Serial queue does not hold up stimulus presentation. */
  persistLocalDraft(record:PvtDraft):Promise<{retained:true;contextKey:string;recordKey:string;recordDigest:string}>
  /** This acknowledges the core/report only; complete original archival must be confirmed independently. */
  finalize(claim:PvtFinal):Promise<PvtReceipt>
}
