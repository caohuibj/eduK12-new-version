import { assertNumericDeltaAllowed, resolveReportingComparability } from './comparability'
import { reportingEvidenceFor } from './engine'
import { finiteReportingNumber, reportingAggregations } from './statistics'
import {
  reportingFail,
  type ReportingComparabilityDecisionV1,
  type ReportingComparabilityRuleV1,
  type ReportingEvidenceProjectionV1,
  type ReportingMetricRuleV1,
  type ReportingMaturity,
  type ReportingSeriesWaveRecordV1,
} from './types'

export interface ReportingMatchedLongitudinalSpecV1 {
  schemaVersion: 1
  analysisKind: 'MATCHED_LONGITUDINAL'
  engineKey: 'ORG_MATCHED_LONGITUDINAL_V1'
  engineVersion: '1.0.0'
  privacyUnit: 'SUBJECT'
  selectionPolicy: 'UNIQUE_OR_REJECT'
  minimumCohortN: number
  minimumContributorN: number
  reportEvidenceCeiling: ReportingMaturity
  metricRules: ReportingMetricRuleV1[]
  comparabilityRules: ReportingComparabilityRuleV1[]
}

export type ReportingMatchedModeV1 = 'PAIRWISE' | 'FULL_CASE'

export interface ReportingMatchedMetricProjectionV1 {
  state: 'present' | 'suppressed'
  countKind?: 'PAIRED_VALID' | 'COMPLETE_CASE'
  validCaseN?: number
  waveMeans?: Array<{ waveId: string; waveKey: string; mean: number }>
  comparisons?: Array<{
    fromWaveId: string
    toWaveId: string
    comparability: ReportingComparabilityDecisionV1
    delta?: number
  }>
}

export interface ReportingMatchedLongitudinalProjectionV1 {
  schemaVersion: 1
  kind: 'MATCHED_LONGITUDINAL'
  mode: ReportingMatchedModeV1
  state: 'present' | 'suppressed'
  waveIds: string[]
  matchedEligibleN?: number
  metrics?: Record<string, ReportingMatchedMetricProjectionV1>
  evidence: ReportingEvidenceProjectionV1
}

export interface ReportingMatchedMetricCaseV1 {
  userId: string
  memberships: Record<string, string>
  values: Record<string, number>
}

export interface ReportingMatchedMetricSelectionV1 {
  metricId: string
  matchedEligibleN: number
  cases: ReportingMatchedMetricCaseV1[]
}

const allWaveInputs = (wave: ReportingSeriesWaveRecordV1) => [
  ...wave.inputManifest.resolved,
  ...wave.inputManifest.unresolved,
]

const populationByUser = (wave: ReportingSeriesWaveRecordV1): Map<string, { membershipId: string }> => {
  const map = new Map<string, { membershipId: string }>()
  for (const input of allWaveInputs(wave)) {
    if (map.has(input.subjectUserId)) {
      reportingFail('AMBIGUOUS_OBSERVATION', 'Wave contains more than one observation for the same stable user', 409)
    }
    map.set(input.subjectUserId, { membershipId: input.membershipId })
  }
  return map
}

const resolvedByUser = (wave: ReportingSeriesWaveRecordV1) => {
  const map = new Map<string, ReportingSeriesWaveRecordV1['inputManifest']['resolved'][number]>()
  for (const input of wave.inputManifest.resolved) {
    if (map.has(input.subjectUserId)) {
      reportingFail('AMBIGUOUS_OBSERVATION', 'Wave contains more than one resolved observation for the same stable user', 409)
    }
    map.set(input.subjectUserId, input)
  }
  return map
}

const eligibleMetricValue = (
  input: ReportingSeriesWaveRecordV1['inputManifest']['resolved'][number] | undefined,
  rule: ReportingMetricRuleV1,
): number | null => {
  if (!input) return null
  const candidates = input.metrics.filter((metric) => metric.key === rule.sourceMetricKey)
  if (candidates.length > 1) reportingFail('AMBIGUOUS_OBSERVATION', `metric ${rule.sourceMetricKey} is ambiguous`, 409)
  const metric = candidates[0]
  if (!metric || !rule.acceptedResultQuality.includes(metric.resultQuality)) return null
  if (rule.acceptedMetricQuality !== 'IGNORE_METRIC_QUALITY') {
    if (!metric.metricQuality || !rule.acceptedMetricQuality.includes(metric.metricQuality)) return null
  }
  return finiteReportingNumber(metric.value)
}

const assertWaveScope = (waves: ReportingSeriesWaveRecordV1[]): ReportingSeriesWaveRecordV1[] => {
  if (waves.length < 2) reportingFail('REPORT_LONGITUDINAL_WAVES_REQUIRED', 'matched analysis requires at least two Waves', 400)
  const sorted = [...waves].sort((a, b) => a.ordinal - b.ordinal)
  const first = sorted[0]
  const ids = new Set<string>()
  const ordinals = new Set<number>()
  for (const wave of sorted) {
    if (ids.has(wave.id) || ordinals.has(wave.ordinal)) reportingFail('REPORT_WAVE_CONFLICT', 'duplicate Wave in matched analysis', 409)
    ids.add(wave.id)
    ordinals.add(wave.ordinal)
    if (wave.organizationId !== first.organizationId || wave.seriesId !== first.seriesId) {
      reportingFail('REPORT_SERIES_SCOPE_MISMATCH', 'matched Waves must belong to one Organization Series', 409)
    }
    if (
      wave.inputManifest.resource.family !== first.inputManifest.resource.family
      || wave.inputManifest.resource.key !== first.inputManifest.resource.key
    ) reportingFail('REPORT_SERIES_RESOURCE_MISMATCH', 'matched Waves must remain inside one resource scope', 409)
  }
  return sorted
}

/** Product-neutral numeric kernel. Identity and authorization are resolved by
 * product adapters before entering this function. No organizational facade or
 * implicit latest-attempt selection belongs in this layer. */
export interface MatchedNumericWaveV1 {
  waveId: string
  waveKey: string
  observations: Array<{ participantKey: string; value: number | null }>
}
export interface MatchedNumericSelectionV1 {
  matchedEligibleN: number
  cases: Array<{ participantKey: string; values: Record<string, number> }>
}
export const selectMatchedNumericCases = (waves: MatchedNumericWaveV1[]): MatchedNumericSelectionV1 => {
  if (waves.length < 2) reportingFail('REPORT_LONGITUDINAL_WAVES_REQUIRED', 'matched analysis requires at least two Waves', 400)
  const ids = new Set<string>()
  const populations = waves.map((wave) => {
    if (ids.has(wave.waveId)) reportingFail('REPORT_WAVE_CONFLICT', 'duplicate Wave in matched analysis', 409)
    ids.add(wave.waveId)
    const population = new Map<string, number | null>()
    for (const observation of wave.observations) {
      if (population.has(observation.participantKey)) {
        reportingFail('AMBIGUOUS_OBSERVATION', 'Wave contains more than one observation for the same stable participant', 409)
      }
      population.set(observation.participantKey, finiteReportingNumber(observation.value))
    }
    return population
  })
  const [first, ...rest] = populations
  const matched = [...first.keys()].filter((key) => rest.every((population) => population.has(key))).sort()
  const cases: MatchedNumericSelectionV1['cases'] = []
  for (const participantKey of matched) {
    const values: Record<string, number> = Object.create(null)
    let complete = true
    waves.forEach((wave, index) => {
      const value = populations[index].get(participantKey)
      if (value === null || value === undefined) complete = false
      else values[wave.waveId] = value
    })
    if (complete) cases.push({ participantKey, values })
  }
  return { matchedEligibleN: matched.length, cases }
}

const numericWavesFor = (waves: ReportingSeriesWaveRecordV1[], rule?: ReportingMetricRuleV1): MatchedNumericWaveV1[] => {
  // Preserve the organizational wrapper's historical eligibility semantics:
  // resolve each matched user in Wave order and stop at the first absent value.
  // A later Wave's metrics were never inspected for an already incomplete case.
  // This compatibility adapter does not change the strict generic kernel.
  const common = intersectStableUsers(waves)
  const populations = waves.map(populationByUser)
  const resolved = waves.map(resolvedByUser)
  const values = waves.map(() => new Map<string, number | null>())
  if (rule) for (const participantKey of common) {
    for (let index = 0; index < waves.length; index += 1) {
      const value = eligibleMetricValue(resolved[index].get(participantKey), rule)
      values[index].set(participantKey, value)
      if (value === null) break
    }
  }
  return waves.map((wave, index) => ({
    waveId: wave.id,
    waveKey: wave.waveKey,
    observations: [...populations[index].keys()].map((participantKey) => ({
      participantKey,
      value: values[index].get(participantKey) ?? null,
    })),
  }))
}

const intersectStableUsers = (waves: ReportingSeriesWaveRecordV1[]): string[] => {
  const populations = waves.map(populationByUser)
  const [first, ...rest] = populations
  return [...first.keys()].filter((userId) => rest.every((population) => population.has(userId))).sort()
}

export const selectMatchedMetricCases = (input: {
  waves: ReportingSeriesWaveRecordV1[]
  rule: ReportingMetricRuleV1
}): ReportingMatchedMetricSelectionV1 => {
  const waves = assertWaveScope(input.waves)
  const selection = selectMatchedNumericCases(numericWavesFor(waves, input.rule))
  const populations = new Map(waves.map((wave) => [wave.id, populationByUser(wave)]))
  return {
    metricId: input.rule.metricId,
    matchedEligibleN: selection.matchedEligibleN,
    cases: selection.cases.map((item) => ({
      userId: item.participantKey,
      memberships: Object.fromEntries(waves.map((wave) => [wave.id, populations.get(wave.id)!.get(item.participantKey)!.membershipId])),
      values: { ...item.values },
    })),
  }
}

const ruleForPair = (input: {
  spec: ReportingMatchedLongitudinalSpecV1
  metricId: string
  left: ReportingSeriesWaveRecordV1
  right: ReportingSeriesWaveRecordV1
}): ReportingComparabilityDecisionV1 => {
  const rules = input.spec.comparabilityRules.filter((rule) => (
    rule.metricId === input.metricId
    && rule.resourceFamily === input.left.inputManifest.resource.family
    && rule.resourceKey === input.left.inputManifest.resource.key
    && rule.fromVersion === input.left.inputManifest.resource.version
    && rule.toVersion === input.right.inputManifest.resource.version
  ))
  if (rules.length > 1) reportingFail('REPORT_COMPARABILITY_RULE_INVALID', 'multiple comparability rules match one metric Wave pair', 409)
  return resolveReportingComparability({
    metricId: input.metricId,
    left: input.left.inputManifest.resource,
    right: input.right.inputManifest.resource,
    rule: rules[0] ?? null,
  })
}

const requireFiniteStatistic = (value: unknown, errorCode: string, message: string): number => {
  const numeric = finiteReportingNumber(value)
  return numeric === null ? reportingFail(errorCode, message, 500) : numeric
}

const finiteDelta = (left: number, right: number): number => (
  requireFiniteStatistic(right - left, 'REPORT_STATISTIC_OVERFLOW', 'matched delta produced a non-finite result')
)

/** Applies the caller's frozen privacy thresholds to one complete-case set.
 * Comparability decisions stay explicit; numeric deltas cannot be inferred from
 * matching display labels, resource keys or adjacent Wave positions. */
export const buildMatchedNumericProjection = (input: {
  waves: MatchedNumericWaveV1[]
  mode: ReportingMatchedModeV1
  minimumCohortN: number
  minimumContributorN: number
  comparability: (left: MatchedNumericWaveV1, right: MatchedNumericWaveV1) => ReportingComparabilityDecisionV1
}): ReportingMatchedMetricProjectionV1 => {
  if (input.mode === 'PAIRWISE' && input.waves.length !== 2) {
    reportingFail('REPORT_LONGITUDINAL_PAIR_REQUIRED', 'PAIRWISE analysis requires exactly two Waves', 400)
  }
  const selected = selectMatchedNumericCases(input.waves)
  if (selected.matchedEligibleN < input.minimumCohortN || selected.cases.length < input.minimumContributorN) return { state: 'suppressed' }
  const waveMeans = input.waves.map((wave) => {
    const values = selected.cases.map((item) => item.values[wave.waveId])
    if (values.some((value) => value === undefined)) reportingFail('REPORT_RESULT_INTEGRITY', 'complete case is missing a Wave value', 500)
    const aggregations = reportingAggregations({ values, aggregations: ['MEAN'], distributionCellFloor: input.minimumContributorN })
    return { waveId: wave.waveId, waveKey: wave.waveKey, mean: requireFiniteStatistic(aggregations.mean, 'REPORT_STATISTIC', 'matched mean is unavailable') }
  })
  const comparisons: NonNullable<ReportingMatchedMetricProjectionV1['comparisons']> = []
  for (let index = 0; index < input.waves.length - 1; index += 1) {
    const left = input.waves[index], right = input.waves[index + 1]
    const comparability = input.comparability(left, right)
    const comparison: NonNullable<ReportingMatchedMetricProjectionV1['comparisons']>[number] = {
      fromWaveId: left.waveId, toWaveId: right.waveId, comparability,
    }
    if (comparability.allowedOperations.includes('NUMERIC_DELTA')) {
      assertNumericDeltaAllowed(comparability)
      comparison.delta = finiteDelta(waveMeans[index].mean, waveMeans[index + 1].mean)
    }
    comparisons.push(comparison)
  }
  return {
    state: 'present',
    countKind: input.mode === 'PAIRWISE' ? 'PAIRED_VALID' : 'COMPLETE_CASE',
    validCaseN: selected.cases.length,
    waveMeans,
    comparisons,
  }
}

export const buildMatchedLongitudinalProjection = (input: {
  waves: ReportingSeriesWaveRecordV1[]
  spec: ReportingMatchedLongitudinalSpecV1
  mode: ReportingMatchedModeV1
}): ReportingMatchedLongitudinalProjectionV1 => {
  if (input.spec.analysisKind !== 'MATCHED_LONGITUDINAL' || input.spec.engineKey !== 'ORG_MATCHED_LONGITUDINAL_V1') {
    reportingFail('REPORT_ANALYSIS_KIND_UNSUPPORTED', 'matched engine requires MATCHED_LONGITUDINAL spec', 409)
  }
  const waves = assertWaveScope(input.waves)
  if (input.mode === 'PAIRWISE' && waves.length !== 2) {
    reportingFail('REPORT_LONGITUDINAL_PAIR_REQUIRED', 'PAIRWISE analysis requires exactly two Waves', 400)
  }
  const matchedEligibleN = intersectStableUsers(waves).length
  const overallPresent = matchedEligibleN >= input.spec.minimumCohortN
  const metrics: Record<string, ReportingMatchedMetricProjectionV1> = {}

  for (const rule of input.spec.metricRules) {
    const effectiveFloor = Math.max(
      input.spec.minimumContributorN,
      rule.minimumMetricN,
      ...waves.map((wave) => wave.inputManifest.resource.minimumN ?? 0),
    )
    metrics[rule.metricId] = buildMatchedNumericProjection({
      waves: numericWavesFor(waves, rule),
      mode: input.mode,
      minimumCohortN: input.spec.minimumCohortN,
      minimumContributorN: effectiveFloor,
      comparability: (left, right) => ruleForPair({
        spec: input.spec,
        metricId: rule.metricId,
        left: waves.find((wave) => wave.id === left.waveId)!,
        right: waves.find((wave) => wave.id === right.waveId)!,
      }),
    })
  }

  const evidenceInputs = waves.flatMap((wave) => wave.inputManifest.resolved)
  const evidence = reportingEvidenceFor(evidenceInputs, input.spec.reportEvidenceCeiling)
  if (!overallPresent) {
    return {
      schemaVersion: 1,
      kind: 'MATCHED_LONGITUDINAL',
      mode: input.mode,
      state: 'suppressed',
      waveIds: waves.map((wave) => wave.id),
      evidence: { level: evidence.level, limitations: evidence.limitations },
    }
  }
  return {
    schemaVersion: 1,
    kind: 'MATCHED_LONGITUDINAL',
    mode: input.mode,
    state: 'present',
    waveIds: waves.map((wave) => wave.id),
    matchedEligibleN,
    metrics,
    evidence: { level: evidence.level, limitations: evidence.limitations },
  }
}
