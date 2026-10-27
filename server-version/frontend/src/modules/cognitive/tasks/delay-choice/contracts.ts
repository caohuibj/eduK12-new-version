import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { IDENTITY, PROTOCOL, assertConfig, plan, same, type Config, type Raw, type QuizRaw } from './generated/protocol'
import type { Report } from './generated/report'
export interface DelaySnapshot { schemaVersion: 1; testType: string; engineVersion: string; scoringVersion: string; configVersion: string; config: Config; protocol: typeof PROTOCOL; configHash: string; protocolSignature: string; frozenAt: string }
export type DelayLanguage = 'zh' | 'en'
export interface DelayContext { language: DelayLanguage; contextKey: string; snapshot: DelaySnapshot; randomSeed: string; manifestHash: string }
interface DraftBinding { language: DelayLanguage; contextDigest: string; contextKey: string; round: number; index: number; configHash: string; protocolSignature: string; manifestHash: string; realm: { timeOriginMs: number; pageInstanceId: string }; recordKey: string; recordDigest: string }
export type DelayDraft = DraftBinding & ({ phase: 'practice' | 'test'; raw: Raw } | { phase: 'quiz'; raw: QuizRaw })
export interface DelayFinal { language: DelayLanguage; contextDigest: string; contextKey: string; configHash: string; protocolSignature: string; manifestHash: string; formalCount: number; practiceCount: number; quizCount: number; termination: 'completed' | 'aborted'; terminationReason: string | null; recordDigests: string[]; finalPayloadDigest: string }
export interface DelayReceipt { contextKey: string; finalPayloadDigest: string; finalSaved: true; receiptId: string; report: Report }
export interface DelayPorts {
  /** Existing product integration must durably bind the actual teaching language, full context, complete plan and realm before exposure. */
  prepareLocalAttempt(context: DelayContext, frozenManifest: ReturnType<typeof manifest>, realm: DraftBinding['realm']): Promise<{ fresh: true; contextKey: string; bindingDigest: string }>
  persistLocalDraft(record: DelayDraft): Promise<{ retained: true; contextKey: string; recordKey: string; recordDigest: string }>
  /** This acknowledges core/report only. Keep raw records pending a separate actual archival receipt. */
  finalize(claim: DelayFinal): Promise<DelayReceipt>
}
function sorted(v: unknown): unknown { if (Array.isArray(v)) return v.map(sorted); if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted((v as Record<string, unknown>)[k])])); return v }
export const digest = (v: unknown) => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(sorted(v)))))
export const manifest = (c: DelayContext) => ({ formal: plan(c.snapshot.config, c.randomSeed), practice: [0, 1, 2].map(round => plan(c.snapshot.config, c.randomSeed, 'practice', round)) })
export function validateContext(value: DelayContext) {
  const c = structuredClone(value), s = c.snapshot
  if (!['zh', 'en'].includes(c.language) || !c.contextKey || c.contextKey.length > 512 || !c.randomSeed || c.randomSeed.length > 256 || s.schemaVersion !== 1 || s.testType !== IDENTITY.testType || s.engineVersion !== IDENTITY.engineVersion || s.scoringVersion !== IDENTITY.scoringVersion || s.configVersion !== IDENTITY.configVersion || !same(s.protocol, PROTOCOL) || !Number.isFinite(Date.parse(s.frozenAt))) throw Error('Unknown frozen delay identity')
  assertConfig(s.config)
  if (digest(s.config) !== s.configHash || digest(s.protocol) !== s.protocolSignature || digest(plan(s.config, c.randomSeed)) !== c.manifestHash) throw Error('Frozen delay hash differs')
  return c
}
