import { z } from 'zod'
import { parseSessionConfigSnapshot } from '../../v2/session-snapshot'
import { parseTrialEnvelope } from '../../v2/trial-envelope'
import type { AuthoritativeScorerInput, CognitiveScoreResult, TrialEnvelope } from '../../v2/types'
import { IDENTITY, PROTOCOL, EMOTIONS, config, plan, manifest, observe, cell, same, type VoiceConfig, type Raw } from './protocol'
import { computeConfigSnapshotHash as digest } from '../../v2/canonical'
import { configSchema, rawSchema } from './schema'
export const envelope = (raw: Raw): TrialEnvelope<Raw> => ({ schemaVersion: 1, trialIndex: raw.plan.index, phase: 'test', condition: raw.plan.condition, startedAtPerfMs: raw.startedAtPerfMs, endedAtPerfMs: raw.endedAtPerfMs, durationMs: raw.endedAtPerfMs - raw.startedAtPerfMs, flags: { timeout: false, premature: false }, qualityEvents: raw.events.some(e => e.kind === 'interrupt') ? ['visibility_lost'] : [], payload: raw })
interface Group { planned: number; valid: number; matched: number }
export function scoreVoice(input: AuthoritativeScorerInput<VoiceConfig, Raw>): CognitiveScoreResult {
  const call = z.object({ session: z.unknown(), config: z.unknown(), randomSeed: z.string().min(1).max(256), trials: z.array(z.unknown()).max(96) }).strict().parse(input)
  const s = parseSessionConfigSnapshot<VoiceConfig>(call.session), c = configSchema.parse(s.config)
  if (Object.entries(IDENTITY).some(([k, v]) => (s as unknown as Record<string, unknown>)[k] !== v) || !same(s.protocol, PROTOCOL) || (s.referenceBindings?.length ?? 0) || !same(c, configSchema.parse(call.config))) throw Error('Unknown exact voice snapshot or config')
  const expected = plan(c, call.randomSeed)
  if (call.trials.length > expected.length) throw Error('Voice profile budget exceeded')
  const groups: Record<string, Group> = {}, intensityGroups: Record<'normal' | 'strong', Group> = { normal: { planned: c.totalTrials / 2, valid: 0, matched: 0 }, strong: { planned: c.totalTrials / 2, valid: 0, matched: 0 } }
  for (const e of EMOTIONS) for (const i of ['normal', 'strong'] as const) for (const t of [1, 2] as const) groups[cell(e, i, t)] = { planned: c.totalTrials / 24, valid: 0, matched: 0 }
  const confusion: Record<string, Record<string, number>> = Object.fromEntries(EMOTIONS.map(e => [e, Object.fromEntries([...EMOTIONS, 'none'].map(k => [k, 0]))]))
  let completed = 0, matched = 0, skipped = 0, interrupted = 0, end: number | null = null
  const times: number[] = []
  call.trials.forEach((value, index) => {
    const e = parseTrialEnvelope<Raw>(value), raw = rawSchema.parse(e.payload), summary = observe(raw)
    if (!same(raw.plan, expected[index]) || e.trialIndex !== index || e.phase !== 'test' || e.condition !== expected[index].condition || e.startedAtPerfMs !== raw.startedAtPerfMs || e.endedAtPerfMs !== raw.endedAtPerfMs || e.durationMs !== raw.endedAtPerfMs - raw.startedAtPerfMs || (end !== null && raw.startedAtPerfMs < end) || e.flags.timeout || e.flags.premature || !same(e.qualityEvents, summary.outcome === 'interrupted' ? ['visibility_lost'] : [])) throw Error('Voice identity, prefix, envelope or clock mismatch')
    end = raw.endedAtPerfMs
    if (summary.outcome === 'skip') { skipped++; return }
    if (summary.outcome === 'interrupted') { interrupted++; return }
    completed++
    const correct = summary.choice === raw.plan.emotion, group = groups[raw.plan.condition], intensity = intensityGroups[raw.plan.intensity]
    group.valid++; intensity.valid++; confusion[raw.plan.emotion][summary.choice!]++
    if (correct) { matched++; group.matched++; intensity.matched++ }
    times.push(summary.responseAt! - summary.answerEnabledAt!)
  })
  const median = times.length ? [...times].sort((a, b) => a - b) : null, n = times.length
  const proportion = (g: Group) => g.valid === 0 ? null : g.matched / g.valid
  const a = proportion(intensityGroups.normal), b = proportion(intensityGroups.strong)
  const completeConditions = Object.values(groups).every(g => g.valid === g.planned)
  const flags = { noUsableFormal: completed === 0, incompleteConditions: !completeConditions, skipped: skipped > 0, interrupted: interrupted > 0 }
  return { metrics: { planned: c.totalTrials, received: call.trials.length, completed, matched, skipped, interrupted, unstarted: c.totalTrials - call.trials.length, groups, intensityGroups, confusion, observedProportion: completed ? matched / completed : null, signedStrongMinusNormal: completeConditions && a !== null && b !== null ? b - a : null, medianPostPlaybackMs: median ? (n % 2 ? median[(n - 1) / 2] : (median[n / 2 - 1] + median[n / 2]) / 2) : null,
    reportBinding: { ...IDENTITY, reportDefinitionVersion: c.reportDefinitionVersion, parameterInterpretationVersion: c.parameterInterpretationVersion, presentationVersion: c.presentationVersion, configHash: s.configHash, protocolSignature: s.protocolSignature, materialsHash: config(c.profile).materialsHash, manifestHash: digest(manifest(c, call.randomSeed)), profile: c.profile } },
    quality: { state: flags.noUsableFormal ? 'invalid' : completeConditions ? 'interpretable' : 'limited', flags, reasons: Object.entries(flags).filter(([, v]) => v).map(([k]) => k) }, audit: { trialCount: call.trials.length, scorerVersion: IDENTITY.scoringVersion } }
}
