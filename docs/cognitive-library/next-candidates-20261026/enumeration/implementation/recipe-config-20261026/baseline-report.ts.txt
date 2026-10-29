import { ENUMERATION_IDENTITY, ENUMERATION_QUANTITIES, enumerationConfig, type EnumerationConfig } from './protocol'
/** Host-owned authoritative result; this structural projection does not authenticate a host or replace frozen storage. */
export interface EnumerationPublicResult {
  metrics: Record<string, unknown>
  quality: { state: 'interpretable' | 'limited' | 'invalid'; flags: Record<string, boolean>; reasons: string[] }
  audit?: { trialCount: number; scorerVersion: string }
}
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
function projectBoundEnumerationReport(result: EnumerationPublicResult, requireAudit: boolean,
  expected?: { config: EnumerationConfig; randomSeed: string }) {
  const hidden = { state: 'invalid' as const, headline: null, rows: [],
    interpretationPolicy: 'session_descriptive_v1' as const, summary: null,
    reasonCode: 'no_usable_or_compatible_result' }
  const m = result.metrics, binding = object(m.reportBinding), id = ENUMERATION_IDENTITY
  const config = object(binding?.config)
  if (!binding || !config || !['research', 'experience'].includes(String(config.profile))) return hidden
  const canonical = enumerationConfig(config.profile as 'research' | 'experience')
  if (Object.keys(config).length !== Object.keys(canonical).length
    || Object.entries(canonical).some(([key, value]) => config[key] !== value)
    || binding.candidateId !== id.candidateId || binding.engineVersion !== id.engineVersion
    || binding.scoringVersion !== id.scoringVersion || binding.configVersion !== id.configVersion
    || typeof binding.configHash !== 'string' || !/^[a-f0-9]{64}$/.test(binding.configHash)
    || typeof binding.protocolSignature !== 'string' || !/^[a-f0-9]{64}$/.test(binding.protocolSignature)
    || typeof binding.randomSeed !== 'string' || !binding.randomSeed.length || binding.randomSeed.length > 256
    || (requireAudit && result.audit?.scorerVersion !== id.scoringVersion)
    || (expected && (binding.randomSeed !== expected.randomSeed
      || Object.entries(canonical).some(([key, value]) => expected.config[key as keyof EnumerationConfig] !== value)))) return hidden
  const names = ['expectedTrialCount', 'receivedTrialCount', 'includedTrialCount', 'excludedTrialCount',
    'correctTrialCount', 'overReportedTrialCount', 'underReportedTrialCount'] as const
  if (names.some(key => !count(m[key]))) return hidden
  const expectedN = m.expectedTrialCount as number, received = m.receivedTrialCount as number
  const included = m.includedTrialCount as number, excluded = m.excludedTrialCount as number
  const correct = m.correctTrialCount as number, over = m.overReportedTrialCount as number, under = m.underReportedTrialCount as number
  if (expectedN !== canonical.totalTrials || received > expectedN || (requireAudit && received !== result.audit?.trialCount)
    || included + excluded !== received || correct + over + under !== included
    || !Array.isArray(m.excludedTrialIndices) || m.excludedTrialIndices.length !== excluded
    || new Set(m.excludedTrialIndices).size !== excluded
    || m.excludedTrialIndices.some(value => !count(value) || value >= received)) return hidden
  const reasons = object(m.excludedTrialReasons)
  if (!reasons || Object.keys(reasons).length !== excluded || m.excludedTrialIndices.some(index =>
    !Array.isArray(reasons[index]) || !(reasons[index] as unknown[]).length
      || (reasons[index] as unknown[]).some(value => typeof value !== 'string'))) return hidden
  if (!Array.isArray(m.byQuantity) || m.byQuantity.length !== 5) return hidden
  const rows: Array<{ targetValue: number; expected: number; observed: number; included: number; correct: number;
    overReported: number; underReported: number; accuracy: number | null; signedMeanError: number | null;
    meanAbsoluteError: number | null }> = []
  let signedTotal = 0, absoluteTotal = 0
  for (let i = 0; i < 5; i++) {
    const r = object(m.byQuantity[i])
    if (!r || r.targetValue !== ENUMERATION_QUANTITIES[i] || r.expected !== expectedN / 5
      || ['observed', 'included', 'correct', 'overReported', 'underReported'].some(key => !count(r[key]))) return hidden
    const n = r.included as number, c = r.correct as number, o = r.overReported as number, u = r.underReported as number
    if (n > (r.observed as number) || (r.observed as number) > expectedN / 5 || c + o + u !== n
      || r.accuracy !== (n ? c / n : null)) return hidden
    if (n === 0) {
      if (r.signedMeanError !== null || r.meanAbsoluteError !== null || r.medianReportOperationMs !== null) return hidden
    } else {
      if (typeof r.signedMeanError !== 'number' || !Number.isFinite(r.signedMeanError)
        || typeof r.meanAbsoluteError !== 'number' || !Number.isFinite(r.meanAbsoluteError)
        || typeof r.medianReportOperationMs !== 'number' || !Number.isFinite(r.medianReportOperationMs) || r.medianReportOperationMs < 0) return hidden
      const sum = Math.round(r.signedMeanError * n), absolute = Math.round(r.meanAbsoluteError * n)
      if (r.signedMeanError !== sum / n || r.meanAbsoluteError !== absolute / n
        || Math.abs(sum) > absolute || absolute > 14 * n || absolute < 0) return hidden
      signedTotal += sum; absoluteTotal += absolute
    }
    rows.push({ targetValue: r.targetValue as number, expected: r.expected as number, observed: r.observed as number,
      included: n, correct: c, overReported: o, underReported: u, accuracy: r.accuracy as number | null,
      signedMeanError: r.signedMeanError as number | null, meanAbsoluteError: r.meanAbsoluteError as number | null })
  }
  if (rows.reduce((sum, row) => sum + row.observed, 0) !== received
    || rows.reduce((sum, row) => sum + row.included, 0) !== included
    || rows.reduce((sum, row) => sum + row.correct, 0) !== correct
    || rows.reduce((sum, row) => sum + row.overReported, 0) !== over
    || rows.reduce((sum, row) => sum + row.underReported, 0) !== under
    || m.overallAccuracy !== (included ? correct / included : null)
    || m.signedMeanError !== (included ? signedTotal / included : null)
    || m.meanAbsoluteError !== (included ? absoluteTotal / included : null)) return hidden
  const state = included === 0 ? 'invalid' : received < expectedN || excluded > 0 ? 'limited' : 'interpretable'
  // Re-derive the gate from validated counts; a forged state alone can never release metrics.
  if (state === 'invalid' || result.quality.state !== state
    || result.quality.flags.descriptiveOnly !== true
    || result.quality.flags.noIncludedRecords !== (included === 0)
    || result.quality.flags.incompleteRecords !== (received !== expectedN)
    || result.quality.flags.technicalExclusions !== (excluded > 0)) return hidden
  return { state, headline: { correct, denominator: included }, rows,
    interpretationPolicy: 'session_descriptive_v1' as const,
    summary: { expected: expectedN, received, included, excluded, correct, overReported: over, underReported: under,
      accuracy: correct / included, signedMeanError: m.signedMeanError as number,
      meanAbsoluteError: m.meanAbsoluteError as number }, reasonCode: state === 'limited' ? 'partial_records' : 'complete_records' }
}

/** Immediate scorer result path: audit must originate from that scorer execution. */
export function projectEnumerationReport(result: EnumerationPublicResult,
  expected?: { config: EnumerationConfig; randomSeed: string }) {
  return projectBoundEnumerationReport(result, true, expected)
}
/** Mirrors the existing v2 CognitiveResultSnapshot shape, with no invented audit field. */
export interface EnumerationStoredSnapshot {
  schemaVersion: 1; completedAt: string; testType: string; configVersion: string;
  engineVersion: string; scoringVersion: string; protocolSignature: string;
  profile: 'experience' | 'standard' | 'research' | null;
  metrics: Record<string, unknown>; quality: EnumerationPublicResult['quality'];
  references: Array<Record<string, unknown>>; report: Record<string, unknown>;
  assessmentContext: { schemaVersion: 1; snapshotHash: string } | null;
}
/** Structural adapter only. Host must read an authorized authoritative frozen snapshot. */
export function projectStoredEnumerationReport(snapshot: EnumerationStoredSnapshot,
  expected?: { config: EnumerationConfig; randomSeed: string }) {
  const unavailable = () => projectEnumerationReport({ metrics: {}, quality: { state: 'invalid', flags: {}, reasons: [] } })
  const s = object(snapshot), binding = object(s && object(s.metrics)?.reportBinding)
  const config = object(binding?.config), q = object(s?.quality)
  const keys = ['schemaVersion', 'completedAt', 'testType', 'configVersion', 'engineVersion', 'scoringVersion',
    'protocolSignature', 'profile', 'metrics', 'quality', 'references', 'report', 'assessmentContext']
  if (!s || Object.keys(s).length !== keys.length || keys.some(key => !(key in s))
    || s.schemaVersion !== 1 || s.testType !== ENUMERATION_IDENTITY.testType
    || typeof s.completedAt !== 'string' || !Number.isFinite(Date.parse(s.completedAt))
    || !/(Z|[+-]\d{2}:\d{2})$/.test(s.completedAt)
    || !binding || !config || s.profile !== config.profile
    || ['engineVersion', 'scoringVersion', 'configVersion', 'protocolSignature'].some(key => s[key] !== binding[key])
    || !q || Object.keys(q).length !== 3 || !['interpretable', 'limited', 'invalid'].includes(String(q.state))
    || !object(q.flags) || Object.values(q.flags as Record<string, unknown>).some(value => typeof value !== 'boolean')
    || !Array.isArray(q.reasons) || q.reasons.some(value => typeof value !== 'string')
    || !Array.isArray(s.references) || s.references.some(value => !object(value)) || !object(s.report)) return unavailable()
  const context = object(s.assessmentContext)
  if (s.assessmentContext !== null && (!context || Object.keys(context).length !== 2
    || context.schemaVersion !== 1 || typeof context.snapshotHash !== 'string' || !context.snapshotHash.length)) return unavailable()
  // No audit is manufactured: counts come from the frozen metrics, identity from the frozen outer tuple.
  return projectBoundEnumerationReport({ metrics: snapshot.metrics, quality: snapshot.quality }, false, expected)
}
