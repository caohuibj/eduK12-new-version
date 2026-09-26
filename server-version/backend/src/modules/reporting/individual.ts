import { resolveReportingComparability } from './comparability'
import { reportingEvidenceFor } from './engine'
import { finiteReportingNumber } from './statistics'
import { reportingFail, type ReportingIndividualLongitudinalSpecV1, type ReportingIndividualProjectionV1, type ReportingSeriesWaveRecordV1 } from './types'

/** Personal observations are authorized, never passed through group-N suppression. */
export function buildIndividualLongitudinalProjection(input: {
  subjectUserId: string; waves: ReportingSeriesWaveRecordV1[]; spec: ReportingIndividualLongitudinalSpecV1
}): ReportingIndividualProjectionV1 {
  const waves = [...input.waves].sort((a, b) => a.ordinal - b.ordinal)
  if (!input.subjectUserId || waves.length < 2 || new Set(waves.map(w => w.ordinal)).size !== waves.length
    || new Set(waves.map(w => w.sourceRunId)).size !== waves.length) {
    reportingFail('REPORT_INDIVIDUAL_SOURCE_INVALID', 'distinct repeated measurements and stable subject required', 409)
  }
  const projected = waves.map(wave => {
    const observations = [...wave.inputManifest.resolved, ...wave.inputManifest.unresolved]
    if (observations.length !== 1 || observations[0].subjectUserId !== input.subjectUserId) {
      reportingFail('REPORT_INDIVIDUAL_SOURCE_INVALID', 'each Wave must contain exactly the selected subject', 409)
    }
    const row = wave.inputManifest.resolved[0]
    const metrics: ReportingIndividualProjectionV1['waves'][number]['metrics'] = {}
    for (const rule of input.spec.metricRules) {
      if (rule.sourceFamily !== wave.inputManifest.resource.family || rule.sourceResourceKey !== wave.inputManifest.resource.key) {
        reportingFail('REPORT_SPEC_RESOURCE_MISMATCH', 'individual metric resource mismatch', 409)
      }
      const matches = row?.metrics.filter(m => m.key === rule.sourceMetricKey) ?? []
      if (matches.length > 1) reportingFail('AMBIGUOUS_OBSERVATION', 'duplicate source metric', 409)
      const metric = matches[0]
      const value = metric ? finiteReportingNumber(metric.value) : null
      const accepted = metric && rule.acceptedResultQuality.includes(metric.resultQuality)
        && (rule.acceptedMetricQuality === 'IGNORE_METRIC_QUALITY'
          || (metric.metricQuality !== null && rule.acceptedMetricQuality.includes(metric.metricQuality)))
      metrics[rule.metricId] = accepted && value !== null
        ? { state: 'present', value }
        : { state: 'missing', reason: row ? 'METRIC_UNAVAILABLE' : 'NOT_COMPLETED' }
    }
    const evidence = reportingEvidenceFor(row ? [row] : [], input.spec.reportEvidenceCeiling)
    return { waveId: wave.id, waveKey: wave.waveKey, ordinal: wave.ordinal, metrics,
      evidence: { level: evidence.level, limitations: evidence.limitations } }
  })
  const comparisons: ReportingIndividualProjectionV1['comparisons'] = []
  for (let i = 1; i < waves.length; i++) {
    const left = waves[i - 1].inputManifest.resource, right = waves[i].inputManifest.resource
    const metrics: ReportingIndividualProjectionV1['comparisons'][number]['metrics'] = {}
    for (const metric of input.spec.metricRules) {
      const rule = input.spec.comparabilityRules.find(r => r.metricId === metric.metricId
        && r.resourceFamily === left.family && r.resourceKey === left.key && r.fromVersion === left.version && r.toVersion === right.version)
      const comparability = resolveReportingComparability({ metricId: metric.metricId, left, right, rule })
      const a = projected[i - 1].metrics[metric.metricId], b = projected[i].metrics[metric.metricId]
      metrics[metric.metricId] = { comparability }
      if (a.state === 'present' && b.state === 'present' && comparability.allowedOperations.includes('NUMERIC_DELTA')) {
        const delta = b.value - a.value
        if (Number.isFinite(delta)) metrics[metric.metricId].delta = delta
      }
    }
    comparisons.push({ fromWaveId: waves[i - 1].id, toWaveId: waves[i].id, metrics })
  }
  return { schemaVersion: 1, kind: 'INDIVIDUAL_LONGITUDINAL', state: 'present', waves: projected, comparisons,
    limitations: ['DESCRIPTIVE_ONLY', 'NOT_A_DIAGNOSIS', 'NO_CAUSAL_INFERENCE'] }
}
