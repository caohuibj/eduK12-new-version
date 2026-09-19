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
  const matchedUsers = intersectStableUsers(waves)
  const populations = new Map(waves.map((wave) => [wave.id, populationByUser(wave)]))
  const resolved = new Map(waves.map((wave) => [wave.id, resolvedByUser(wave)]))
  const cases: ReportingMatchedMetricCaseV1[] = []
  for (const userId of matchedUsers) {
    const memberships: Record<string, string> = {}
    const values: Record<string, number> = {}
    let complete = true
    for (const wave of waves) {
      const membership = populations.get(wave.id)!.get(userId)
      if (!membership) return reportingFail('REPORT_RESULT_INTEGRITY', 'matched population intersection became inconsistent', 500)
      memberships[wave.id] = membership.membershipId
      const value = eligibleMetricValue(resolved.get(wave.id)!.get(userId), input.rule)
      if (value === null) {
        complete = false
        break
      }
      values[wave.id] = value
    }
    if (complete) cases.push({ userId, memberships, values })
  }
  return { metricId: input.rule.metricId, matchedEligibleN: matchedUsers.length, cases }
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

const finiteDelta = (left: number, right: number): number => {
  const delta = finiteReportingNumber(right - left)
  if (delta === null) reportingFail('REPORT_STATISTIC_OVERFLOW', 'matched delta produced a non-finite result', 500)
  return delta
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
    const selected = selectMatchedMetricCases({ waves, rule })
    if (selected.matchedEligibleN !== matchedEligibleN) reportingFail('REPORT_RESULT_INTEGRITY', 'metric selection changed matched population identity', 500)
    const effectiveFloor = Math.max(
      input.spec.minimumContributorN,
      rule.minimumMetricN,
      ...waves.map((wave) => wave.inputManifest.resource.minimumN ?? 0),
    )
    if (!overallPresent || selected.cases.length < effectiveFloor) {
      metrics[rule.metricId] = { state: 'suppressed' }
      continue
    }
    const waveMeans = waves.map((wave) => {
      const values = selected.cases.map((item) => item.values[wave.id])
      if (values.some((value) => value === undefined)) reportingFail('REPORT_RESULT_INTEGRITY', 'complete case is missing a Wave value', 500)
      const mean = reportingAggregations({ values: values as number[], aggregations: ['MEAN'], distributionCellFloor: effectiveFloor }).mean
      if (typeof mean !== 'number') reportingFail('REPORT_STATISTIC', 'matched mean is unavailable', 500)
      return { waveId: wave.id, waveKey: wave.waveKey, mean }
    })
    const comparisons: NonNullable<ReportingMatchedMetricProjectionV1['comparisons']> = []
    for (let index = 0; index < waves.length - 1; index += 1) {
      const left = waves[index]
      const right = waves[index + 1]
      const comparability = ruleForPair({ spec: input.spec, metricId: rule.metricId, left, right })
      const comparison: NonNullable<ReportingMatchedMetricProjectionV1['comparisons']>[number] = {
        fromWaveId: left.id,
        toWaveId: right.id,
        comparability,
      }
      if (comparability.allowedOperations.includes('NUMERIC_DELTA')) {
        assertNumericDeltaAllowed(comparability)
        comparison.delta = finiteDelta(waveMeans[index].mean, waveMeans[index + 1].mean)
      }
      comparisons.push(comparison)
    }
    metrics[rule.metricId] = {
      state: 'present',
      countKind: input.mode === 'PAIRWISE' ? 'PAIRED_VALID' : 'COMPLETE_CASE',
      validCaseN: selected.cases.length,
      waveMeans,
      comparisons,
    }
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
