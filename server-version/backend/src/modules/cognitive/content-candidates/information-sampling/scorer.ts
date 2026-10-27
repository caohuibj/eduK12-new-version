import { z } from 'zod'
import type { AuthoritativeScorerInput, CognitiveScoreResult, TrialEnvelope } from '../../v2/types'
import { parseSessionConfigSnapshot } from '../../v2/session-snapshot'
import { parseTrialEnvelope } from '../../v2/trial-envelope'
import { IST_IDENTITY, IST_PROTOCOL, istPlan, reviewIst, same, type IstConfig, type IstRaw, type Rule } from './protocol'
import { istConfigSchema, istRawSchema } from './schema'
import { comparableDelta, type IstCondition, type IstGroup } from './report'
interface Observation { index: number; rule: Rule; majorityCount: number; completed: boolean; interrupted: boolean; reveals: number | null; correct: boolean | null; points: number | null; decisionMs: number | null; revealedBeforeStop: number; input: string | null }
const median = (v: number[]) => { if (!v.length) return null; const a = [...v].sort((x, y) => x - y), i = Math.floor(a.length / 2); return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2 }
function summary(planned: number, rows: Observation[]): Omit<IstCondition, 'majorityCount'> {
  const answered = rows.filter(r => r.correct !== null), n = answered.length
  return { planned, presented: rows.length, decided: n, correct: answered.filter(r => r.correct).length, completed: rows.filter(r => r.completed).length, omissions: rows.length - n, interruptions: rows.filter(r => r.interrupted).length, meanReveals: n ? answered.reduce((v, r) => v + r.reveals!, 0) / n : null, medianReveals: median(answered.map(r => r.reveals!)), medianDecisionMs: median(answered.map(r => r.decisionMs!)), points: n ? answered.reduce((v, r) => v + r.points!, 0) : null }
}
export const istEnvelope = (raw: IstRaw): TrialEnvelope<IstRaw> => ({ schemaVersion: 1, trialIndex: raw.plan.index, phase: 'test', condition: `${raw.plan.rule}:${raw.plan.majorityCount}`, startedAtPerfMs: raw.startedAtPerfMs, endedAtPerfMs: raw.endedAtPerfMs, durationMs: raw.endedAtPerfMs - raw.startedAtPerfMs, flags: { timeout: false, premature: false }, qualityEvents: raw.status === 'interrupted' ? ['resume'] : [], payload: raw })
export function scoreIst(input: AuthoritativeScorerInput<IstConfig, IstRaw>): CognitiveScoreResult {
  const call = z.object({ session: z.unknown(), config: z.unknown(), randomSeed: z.string().min(1).max(256), trials: z.array(z.unknown()).max(20) }).strict().parse(input), s = parseSessionConfigSnapshot<IstConfig>(call.session)
  if (s.testType !== IST_IDENTITY.testType || s.engineVersion !== '0.1.0' || s.scoringVersion !== '0.1.0' || s.configVersion !== IST_IDENTITY.configVersion || !same(s.protocol, IST_PROTOCOL) || (s.referenceBindings?.length ?? 0) > 0) throw Error('Unsupported exact IST identity')
  const c = istConfigSchema.parse(s.config)
  if (!same(c, istConfigSchema.parse(call.config))) throw Error('IST config differs from frozen snapshot')
  const plan = istPlan(c, call.randomSeed), observations: Observation[] = []; let previousEnd: number | null = null, interrupted = false
  if (call.trials.length > plan.length) throw Error('IST profile budget exceeded')
  for (const [index, v] of call.trials.entries()) {
    const e = parseTrialEnvelope<IstRaw>(v), raw = istRawSchema.parse(e.payload), p = plan[index]
    if (interrupted || e.phase !== 'test' || e.trialIndex !== index || e.condition !== `${p.rule}:${p.majorityCount}` || e.startedAtPerfMs !== raw.startedAtPerfMs || e.endedAtPerfMs !== raw.endedAtPerfMs || e.durationMs !== raw.endedAtPerfMs - raw.startedAtPerfMs || (previousEnd !== null && raw.startedAtPerfMs < previousEnd) || e.flags.timeout || e.flags.premature || !same(e.qualityEvents, raw.status === 'interrupted' ? ['resume'] : [])) throw Error('IST envelope/clock/termination ownership differs')
    previousEnd = raw.endedAtPerfMs; interrupted = raw.status === 'interrupted'
    const r = reviewIst(raw, p, c), d = r.decision
    observations.push({ index, rule: p.rule, majorityCount: p.majorityCount, completed: r.completed, interrupted, reveals: d?.revealedCount ?? null, correct: d?.correct ?? null, points: d?.points ?? null, decisionMs: d?.rtMs ?? null, revealedBeforeStop: raw.state.reveals.length, input: d?.input ?? null })
  }
  const groups = Object.fromEntries((['fixed', 'decreasing'] as const).map(rule => { const rows = observations.filter(r => r.rule === rule); return [rule, { ...summary(c.totalTrials / 2, rows), conditions: c.majorityCounts.map(majorityCount => ({ ...summary(c.repetitions, rows.filter(r => r.majorityCount === majorityCount)), majorityCount })) }] })) as Record<Rule, IstGroup>
  const decided = groups.fixed.decided + groups.decreasing.decided, completed = groups.fixed.completed + groups.decreasing.completed, flags = { noJudgments: decided === 0, incompleteRecords: completed !== c.totalTrials, interrupted: observations.some(r => r.interrupted) }
  return { metrics: { planned: c.totalTrials, presented: observations.length, completed, decided, groups, decreasingMinusFixedReveals: comparableDelta(groups), observations, reportBinding: { ...IST_IDENTITY, profile: c.profile, configHash: s.configHash, protocolSignature: s.protocolSignature, reportDefinitionVersion: c.reportDefinitionVersion, presentationVersion: c.presentationVersion, parameterExplanationVersion: c.parameterExplanationVersion } }, quality: { state: flags.noJudgments ? 'invalid' : Object.values(flags).some(Boolean) ? 'limited' : 'interpretable', flags, reasons: Object.entries(flags).filter(([, v]) => v).map(([k]) => k) }, audit: { trialCount: observations.length, scorerVersion: IST_IDENTITY.scoringVersion } }
}
