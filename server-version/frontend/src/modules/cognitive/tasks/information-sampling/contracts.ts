import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { IST_IDENTITY, IST_PROTOCOL, assertIstConfig, istPlan, same, type IstConfig, type IstRaw, type IstQuizRaw } from './generated/protocol'
import type { IstReport } from './generated/report'
export interface IstSnapshot { schemaVersion: 1; testType: string; engineVersion: string; scoringVersion: string; configVersion: string; config: IstConfig; protocol: typeof IST_PROTOCOL; configHash: string; protocolSignature: string; frozenAt: string }
export type IstLanguage = 'zh' | 'en'
export interface IstContext { language: IstLanguage; contextKey: string; snapshot: IstSnapshot; randomSeed: string; manifestHash: string }
interface DraftBinding { language: IstLanguage; contextDigest: string; contextKey: string; round: number; index: number; configHash: string; protocolSignature: string; manifestHash: string; realm: { timeOriginMs: number; pageInstanceId: string }; recordKey: string; recordDigest: string }
export type IstDraft = DraftBinding & ({ phase: 'practice' | 'test'; raw: IstRaw } | { phase: 'quiz'; raw: IstQuizRaw })
export interface IstFinal { language: IstLanguage; contextDigest: string; contextKey: string; configHash: string; protocolSignature: string; manifestHash: string; formalCount: number; practiceCount: number; quizCount: number; termination: 'completed' | 'aborted'; terminationReason: string | null; recordDigests: string[]; finalPayloadDigest: string }
export interface IstReceipt { contextKey: string; finalPayloadDigest: string; finalSaved: true; receiptId: string; report: IstReport }
export interface IstPorts {
  /** Existing product integration must durably bind the actual teaching language, full context, complete plan and realm before exposure. */
  prepareLocalAttempt(context: IstContext, manifest: ReturnType<typeof istManifest>, realm: DraftBinding['realm']): Promise<{ fresh: true; contextKey: string; bindingDigest: string }>
  persistLocalDraft(record: IstDraft): Promise<{ retained: true; contextKey: string; recordKey: string; recordDigest: string }>
  /** This acknowledges core/report only. Keep raw records pending a separate actual archival receipt. */
  finalize(claim: IstFinal): Promise<IstReceipt>
}
function sorted(v: unknown): unknown { if (Array.isArray(v)) return v.map(sorted); if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted((v as Record<string, unknown>)[k])])); return v }
export const digest = (v: unknown) => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(sorted(v)))))
export const istManifest = (c: IstContext) => ({ formal: istPlan(c.snapshot.config, c.randomSeed), practice: [0, 1, 2].map(round => istPlan(c.snapshot.config, c.randomSeed, 'practice', round)) })
export function validateIstContext(value: IstContext) {
  const c = structuredClone(value), s = c.snapshot
  if (!['zh', 'en'].includes(c.language) || !c.contextKey || c.contextKey.length > 512 || !c.randomSeed || c.randomSeed.length > 256 || s.schemaVersion !== 1 || s.testType !== IST_IDENTITY.testType || s.engineVersion !== IST_IDENTITY.engineVersion || s.scoringVersion !== IST_IDENTITY.scoringVersion || s.configVersion !== IST_IDENTITY.configVersion || !same(s.protocol, IST_PROTOCOL) || !Number.isFinite(Date.parse(s.frozenAt))) throw Error('Unknown frozen IST identity')
  assertIstConfig(s.config)
  if (digest(s.config) !== s.configHash || digest(s.protocol) !== s.protocolSignature || digest(istPlan(s.config, c.randomSeed)) !== c.manifestHash) throw Error('Frozen IST hash differs')
  return c
}
