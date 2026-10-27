import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { IDENTITY, PROTOCOL, canonical, config, assertConfig, same, manifest, type VoiceConfig, type Raw } from './generated/protocol'
import type { PublicReport } from './generated/report'
export interface Snapshot { schemaVersion: 1; testType: string; engineVersion: string; scoringVersion: string; configVersion: string; frozenAt: string; config: VoiceConfig; configHash: string; protocol: Omit<typeof PROTOCOL, 'phases'> & { phases: { key: 'test' | 'learning' | 'delayed'; persists: boolean; required: boolean }[] }; protocolSignature: string }
export interface Context { contextKey: string; language: 'zh' | 'en'; snapshot: Snapshot; randomSeed: string; manifestHash: string }
export interface Realm { timeOriginMs: number; pageInstanceId: string }
export interface Draft { contextKey: string; language: 'zh' | 'en'; configHash: string; protocolSignature: string; manifestHash: string; realm: Realm; recordKey: string; raw: Raw; recordDigest: string }
export interface Final { contextKey: string; language: 'zh' | 'en'; configHash: string; protocolSignature: string; manifestHash: string; recordDigests: string[]; formalCount: number; practiceCount: number; termination: 'completed' | 'aborted'; terminationReason: string | null; finalPayloadDigest: string }
export interface Receipt { contextKey: string; finalPayloadDigest: string; finalSaved: true; receiptId: string; report: PublicReport }
export interface Ports {
  /** Must durably freeze the exclusive, unexposed attempt before any playback.
   * In-memory test ports are not a product persistence implementation. */
  prepareLocalAttempt(context: Context, plans: ReturnType<typeof manifest>, realm: Realm): Promise<{ prepared: true; exclusive: true; contextKey: string; bindingDigest: string }>
  persistLocalDraft(record: Draft): Promise<{ retained: true; contextKey: string; recordKey: string; recordDigest: string }>
  /** Core/report acknowledgement only; complete private raw archival is separate. */
  finalize(claim: Final): Promise<Receipt>
}
export const digest = (v: unknown) => bytesToHex(sha256(new TextEncoder().encode(canonical(v))))
export const digestBytes = (v: Uint8Array) => bytesToHex(sha256(v))
export function freeze<T>(v: T): T {
  if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v) }
  return v
}
export function validateContext(value: Context): Context {
  const c = structuredClone(value), s = c.snapshot
  if (!c.contextKey || c.contextKey.length > 512 || !['zh', 'en'].includes(c.language) || !c.randomSeed || c.randomSeed.length > 256 || !s || s.schemaVersion !== 1 || Object.entries(IDENTITY).some(([k, v]) => (s as unknown as Record<string, unknown>)[k] !== v) || !same(s.protocol, PROTOCOL) || !Number.isFinite(Date.parse(s.frozenAt))) throw Error('Unknown frozen voice identity')
  assertConfig(s.config)
  if (!same(s.config, config(s.config.profile)) || digest(s.config) !== s.configHash || digest(s.protocol) !== s.protocolSignature || digest(manifest(s.config, c.randomSeed)) !== c.manifestHash) throw Error('Voice frozen hash mismatch')
  return freeze(c)
}
