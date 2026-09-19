import { resolveReportingComparability } from './comparability'
import { reportingEvidenceFor } from './engine'
import { finiteReportingNumber, reportingAggregations } from './statistics'
import {
  reportingFail,
  type ReportingMetricProjectionV1,
  type ReportingRepeatedCohortProjectionV1,
  type ReportingRepeatedCohortSpecV1,
  type ReportingRepeatedWaveProjectionV1,
  type ReportingSeriesWaveRecordV1,
} from './types'

const subjectKey = (userId: string, membershipId: string): string => `${userId}\u0000${membershipId}`

const projectWave = (
  wave: ReportingSeriesWaveRecordV1,
  spec: ReportingRepeatedCohortSpecV1,
): ReportingRepeatedWaveProjectionV1 => {
  const manifest = wave.inputManifest
  const seen = new Set<string>()
  for (const input of [...manifest.resolved, ...manifest.unresolved]) {
    const key = subjectKey(input.subjectUserId, input.membershipId)
    if (seen.has(key)) reportingFail('AMBIGUOUS_OBSERVATION', 'Wave contains duplicate subject observation', 409)
    seen.add(key)
  }
  const eligibleN = manifest.resolved.length + manifest.unresolved.length
  const resourceFloor = manifest.resource.minimumN ?? 0
  const contributorFloor = Math.max(spec.minimumContributorN, resourceFloor)
  const overallPresent = eligibleN >= spec.minimumCohortN && manifest.resolved.length >= contributorFloor
  const metrics: Record<string, ReportingMetricProjectionV1> = {}

  for (const rule of spec.metricRules) {
    const values: number[] = []
    for (const result of manifest.resolved) {
      const candidates = result.metrics.filter((metric) => metric.key === rule.sourceMetricKey)
      if (candidates.length > 1) reportingFail('AMBIGUOUS_OBSERVATION', `metric ${rule.sourceMetricKey} is ambiguous`, 409)
      const metric = candidates[0]
      if (!metric || !rule.acceptedResultQuality.includes(metric.resultQuality)) continue
      if (rule.acceptedMetricQuality !== 'IGNORE_METRIC_QUALITY') {
        if (!metric.metricQuality || !rule.acceptedMetricQuality.includes(metric.metricQuality)) continue
      }
      const numeric = finiteReportingNumber(metric.value)
      if (numeric !== null) values.push(numeric)
    }
    const metricFloor = Math.max(rule.minimumMetricN, resourceFloor)
    if (!overallPresent || values.length < metricFloor) {
      metrics[rule.metricId] = { state: 'suppressed' }
    } else {
      metrics[rule.metricId] = {
        state: 'present',
        validN: values.length,
        missingN: eligibleN - values.length,
        aggregations: reportingAggregations({ values, aggregations: rule.aggregations, distributionCellFloor: metricFloor }),
      }
    }
  }
  const evidence = reportingEvidenceFor(manifest.resolved, spec.reportEvidenceCeiling)
  if (!overallPresent) {
    return {
      waveId: wave.id,
      waveKey: wave.waveKey,
      ordinal: wave.ordinal,
      state: 'suppressed',
      evidence: { level: evidence.level, limitations: evidence.limitations },
    }
  }
  return {
    waveId: wave.id,
    waveKey: wave.waveKey,
    ordinal: wave.ordinal,
    state: 'present',
    eligibleN,
    resultContributorN: manifest.resolved.length,
    metrics,
    evidence: { level: evidence.level, limitations: evidence.limitations },
  }
}

export const buildRepeatedCohortProjection = (input: {
  waves: ReportingSeriesWaveRecordV1[]
  spec: ReportingRepeatedCohortSpecV1
}): ReportingRepeatedCohortProjectionV1 => {
  if (input.spec.analysisKind !== 'REPEATED_COHORT' || input.spec.engineKey !== 'ORG_REPEATED_COHORT_V1') {
    reportingFail('REPORT_ANALYSIS_KIND_UNSUPPORTED', 'repeated cohort engine requires REPEATED_COHORT spec', 409)
  }
  if (input.waves.length < 2) reportingFail('REPORT_LONGITUDINAL_WAVES_REQUIRED', 'repeated cohort analysis requires at least two Waves', 400)
  const waves = [...input.waves].sort((a, b) => a.ordinal - b.ordinal)
  const first = waves[0]
  const ordinalSet = new Set<number>()
  const waveSet = new Set<string>()
  for (const wave of waves) {
    if (wave.organizationId !== first.organizationId || wave.seriesId !== first.seriesId) {
      reportingFail('REPORT_SERIES_SCOPE_MISMATCH', 'all Waves must belong to one Organization Series', 409)
    }
    if (ordinalSet.has(wave.ordinal) || waveSet.has(wave.id)) reportingFail('REPORT_WAVE_CONFLICT', 'duplicate Wave in repeated analysis', 409)
    ordinalSet.add(wave.ordinal)
    waveSet.add(wave.id)
    if (
      wave.inputManifest.resource.family !== first.inputManifest.resource.family
      || wave.inputManifest.resource.key !== first.inputManifest.resource.key
    ) reportingFail('REPORT_SERIES_RESOURCE_MISMATCH', 'repeated Waves must remain inside one resource scope', 409)
  }
  const projected = waves.map((wave) => projectWave(wave, input.spec))
  const comparisons = [] as ReportingRepeatedCohortProjectionV1['comparisons']
  for (let index = 0; index < waves.length - 1; index += 1) {
    const left = waves[index]
    const right = waves[index + 1]
    const metrics: ReportingRepeatedCohortProjectionV1['comparisons'][number]['metrics'] = {}
    for (const metric of input.spec.metricRules) {
      const rules = input.spec.comparabilityRules.filter((rule) => (
        rule.metricId === metric.metricId
        && rule.resourceFamily === left.inputManifest.resource.family
        && rule.resourceKey === left.inputManifest.resource.key
        && rule.fromVersion === left.inputManifest.resource.version
        && rule.toVersion === right.inputManifest.resource.version
      ))
      if (rules.length > 1) reportingFail('REPORT_COMPARABILITY_RULE_INVALID', 'multiple comparability rules match one metric Wave pair', 409)
      metrics[metric.metricId] = resolveReportingComparability({
        metricId: metric.metricId,
        left: left.inputManifest.resource,
        right: right.inputManifest.resource,
        rule: rules[0] ?? null,
      })
    }
    comparisons.push({ fromWaveId: left.id, toWaveId: right.id, metrics })
  }
  return {
    schemaVersion: 1,
    kind: 'REPEATED_COHORT',
    state: projected.some((wave) => wave.state === 'present') ? 'present' : 'suppressed',
    waves: projected,
    comparisons,
    limitations: ['INDEPENDENT_WAVE_POPULATIONS', 'NOT_INDIVIDUAL_CHANGE'],
  }
}
