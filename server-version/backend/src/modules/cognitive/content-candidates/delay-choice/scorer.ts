import { z } from 'zod'
import type { AuthoritativeScorerInput, CognitiveScoreResult, TrialEnvelope } from '../../v2/types'
import { parseSessionConfigSnapshot } from '../../v2/session-snapshot'
import { parseTrialEnvelope } from '../../v2/trial-envelope'
import { IDENTITY, PROTOCOL, plan, review, same, DELAYS, RATIOS, conditionId, type Config, type Raw } from './protocol'
import { configSchema, rawSchema } from './schema'
import { combine, contrasts, type Condition } from './report'
export const envelope = (raw: Raw): TrialEnvelope<Raw> => ({ schemaVersion: 1, phase: 'test', trialIndex: raw.plan.index, condition: raw.plan.conditionId, startedAtPerfMs: raw.startedAtPerfMs, endedAtPerfMs: raw.endedAtPerfMs, durationMs: raw.endedAtPerfMs - raw.startedAtPerfMs, flags: { timeout: false, premature: false }, qualityEvents: raw.status === 'interrupted' ? ['resume'] : [], payload: raw })
export function score(input: AuthoritativeScorerInput<Config, Raw>): CognitiveScoreResult {
  const call = z.object({ session: z.unknown(), config: z.unknown(), randomSeed: z.string().min(1).max(256), trials: z.array(z.unknown()).max(72) }).strict().parse(input), s = parseSessionConfigSnapshot<Config>(call.session)
  if (s.testType !== IDENTITY.testType || [s.engineVersion, s.scoringVersion, s.configVersion].some(v => v !== '0.1.0') || !same(s.protocol, PROTOCOL) || (s.referenceBindings?.length ?? 0)) throw Error('Unsupported frozen delay identity')
  const c = configSchema.parse(s.config); if (!same(c, configSchema.parse(call.config))) throw Error('Delay config differs from snapshot')
  const plans = plan(c, call.randomSeed), observations: { index: number; conditionId: string; choice: 'sooner' | 'later' | null; skipped: boolean; interrupted: boolean; rtMs: number | null; input: string | null }[] = []; let previousEnd: number | null = null, interrupted = false
  if (call.trials.length > plans.length) throw Error('Delay profile budget exceeded')
  for (const [i, v] of call.trials.entries()) {
    const e = parseTrialEnvelope<Raw>(v), r = rawSchema.parse(e.payload), p = plans[i]
    if (interrupted || e.phase !== 'test' || e.trialIndex !== i || e.condition !== p.conditionId || e.startedAtPerfMs !== r.startedAtPerfMs || e.endedAtPerfMs !== r.endedAtPerfMs || e.durationMs !== r.endedAtPerfMs - r.startedAtPerfMs || previousEnd !== null && r.startedAtPerfMs < previousEnd || e.flags.timeout || e.flags.premature || !same(e.qualityEvents, r.status === 'interrupted' ? ['resume'] : [])) throw Error('Delay envelope/order/termination differs')
    const state = review(r, p); previousEnd = r.endedAtPerfMs; interrupted = r.status === 'interrupted'
    observations.push({ index: i, conditionId: p.conditionId, choice: state.choice, skipped: state.terminal === 'skipped', interrupted, rtMs: state.rtMs, input: state.input })
  }
  const conditions: Condition[] = DELAYS.flatMap(([soonerDays, laterDays]) => RATIOS.map(ratioPercent => { const id = conditionId(ratioPercent, soonerDays, laterDays), rows = observations.filter(r => r.conditionId === id), later = rows.filter(r => r.choice === 'later').length, sooner = rows.filter(r => r.choice === 'sooner').length, answered = later + sooner; return { conditionId: id, ratioPercent, soonerDays, laterDays, planned: c.repetitions, presented: rows.length, answered, later, sooner, skipped: rows.filter(r => r.skipped).length, interrupted: rows.filter(r => r.interrupted).length, laterRate: answered ? later / answered : null } }))
  const summary = combine(conditions), flags = { noChoices: !summary.answered, incompleteConditions: summary.answered !== c.totalTrials, interrupted: observations.some(r => r.interrupted) }
  return { metrics: { planned: c.totalTrials, presented: observations.length, summary, conditions, contrasts: contrasts(conditions), observations, reportBinding: { ...IDENTITY, profile: c.profile, configHash: s.configHash, protocolSignature: s.protocolSignature, reportDefinitionVersion: c.reportDefinitionVersion, presentationVersion: c.presentationVersion, parameterExplanationVersion: c.parameterExplanationVersion } }, quality: { state: flags.noChoices ? 'invalid' : flags.incompleteConditions ? 'limited' : 'interpretable', flags, reasons: Object.entries(flags).filter(([, v]) => v).map(([k]) => k) }, audit: { scorerVersion: IDENTITY.scoringVersion, trialCount: observations.length } }
}
