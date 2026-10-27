import { z } from 'zod'
import { computeConfigSnapshotHash as digest } from '../../v2/canonical'
import { parseSessionConfigSnapshot } from '../../v2/session-snapshot'
import type { SessionConfigSnapshot } from '../../v2/types'
import { manifest, observe, same, type VoiceConfig, type Raw } from './protocol'
import { rawSchema } from './schema'
import { envelope, scoreVoice } from './scorer'
import { projectReport } from './report'
const hash = z.string().regex(/^[a-f0-9]{64}$/), text = z.string().min(1).max(512)
const realmSchema = z.object({ timeOriginMs: z.number().finite().nonnegative(), pageInstanceId: text }).strict()
const draftSchema = z.object({ contextKey: text, language: z.enum(['zh', 'en']), configHash: hash, protocolSignature: hash, manifestHash: hash, realm: realmSchema, recordKey: z.string().min(1).max(60), raw: rawSchema, recordDigest: hash }).strict()
const finalSchema = z.object({ contextKey: text, language: z.enum(['zh', 'en']), configHash: hash, protocolSignature: hash, manifestHash: hash, recordDigests: z.array(hash).max(102), formalCount: z.number().int().min(0).max(96), practiceCount: z.number().int().min(0).max(6), termination: z.enum(['completed', 'aborted']), terminationReason: z.string().min(1).max(100).nullable(), finalPayloadDigest: hash }).strict()
/** Pure FINAL candidate consumer; no new route, server storage, or authority is
 * installed. Caller must independently own the attempt/seed and enforce access. */
export function scoreVoiceSubmission(input: { contextKey: string; language: 'zh' | 'en'; session: SessionConfigSnapshot<VoiceConfig>; randomSeed: string; realm: { timeOriginMs: number; pageInstanceId: string }; drafts: unknown[]; claim: unknown }) {
  const s = parseSessionConfigSnapshot<VoiceConfig>(input.session), realm = realmSchema.parse(input.realm), final = finalSchema.parse(input.claim), plans = manifest(s.config, input.randomSeed), mh = digest(plans)
  const { finalPayloadDigest, ...finalBody } = final
  if (finalPayloadDigest !== digest(finalBody) || final.contextKey !== input.contextKey || final.language !== input.language || final.configHash !== s.configHash || final.protocolSignature !== s.protocolSignature || final.manifestHash !== mh || input.drafts.length > 102 || final.recordDigests.length !== input.drafts.length) throw Error('Voice FINAL binding mismatch')
  const practice: Raw[][] = [[], []], formal: Raw[] = [], seen = new Set<string>(); let lastEnd: number | null = null
  for (const [index, value] of input.drafts.entries()) {
    const d = draftSchema.parse(value), { recordDigest, ...body } = d, p = d.raw.plan
    if (recordDigest !== digest(body) || final.recordDigests[index] !== recordDigest || seen.has(d.recordKey) || d.recordKey !== `${p.phase}:${p.round}:${p.index}` || d.contextKey !== input.contextKey || d.language !== input.language || d.configHash !== s.configHash || d.protocolSignature !== s.protocolSignature || d.manifestHash !== mh || !same(d.realm, realm) || (lastEnd !== null && d.raw.startedAtPerfMs < lastEnd)) throw Error('Voice record digest, realm or ownership mismatch')
    seen.add(d.recordKey); lastEnd = d.raw.endedAtPerfMs; observe(d.raw)
    if (p.phase === 'practice') {
      if (formal.length || !same(p, plans.practice[p.round]?.[practice[p.round]?.length]) || (p.round === 1 && practice[0].length !== 3)) throw Error('Voice practice order mismatch')
      practice[p.round].push(d.raw)
    } else {
      if (!same(p, plans.formal[formal.length])) throw Error('Voice formal order mismatch')
      formal.push(d.raw)
    }
  }
  const passed = (rows: Raw[]) => rows.length === 3 && rows.every(r => observe(r).outcome === 'answered') && rows.filter(r => observe(r).choice === r.plan.emotion).length >= 2
  if (practice[1].length && passed(practice[0])) throw Error('Unexpected extra practice after pass')
  if (!passed(practice[practice[1].length ? 1 : 0])) throw Error('Formal submission without completed qualifying practice')
  if (final.formalCount !== formal.length || final.practiceCount !== practice.flat().length || (final.termination === 'completed' ? formal.length !== plans.formal.length || final.terminationReason !== null : !final.terminationReason)) throw Error('Voice completion claim differs from execution')
  const score = scoreVoice({ session: s, config: s.config, randomSeed: input.randomSeed, trials: formal.map(envelope) })
  return { score, report: projectReport(score), finalPayloadDigest }
}
