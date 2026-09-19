import { finiteReportingNumber } from './statistics'
import { reportingFail, type ReportingMetricRuleV1 } from './types'
import type {
  ReportingObservationActorV1,
  ReportingObservationBatchV1,
  ReportingResolvedObservationV1,
  ReportingUnresolvedObservationV1,
} from './resultSource'

export interface ReportingSeparatedMetricV1 {
  state: 'present' | 'missing'
  value?: number
}

export interface ReportingSeparatedRaterObservationV1 {
  executionId: string
  trackId: string
  state: 'COMPLETED' | 'MISSING'
  subject: ReportingObservationActorV1
  respondent: ReportingObservationActorV1
  relationshipKind: string
  relationshipRef: string | null
  perspective: string
  metrics: Record<string, ReportingSeparatedMetricV1>
}

export interface ReportingSeparatedMultiRaterV1 {
  schemaVersion: 1
  kind: 'MULTI_RATER_SEPARATED'
  subjectUserId: string
  resource: { family: string; key: string; version: string }
  observations: ReportingSeparatedRaterObservationV1[]
  limitations: ['NO_CROSS_RATER_COMBINATION']
}

const observationKey = (observation: ReportingResolvedObservationV1 | ReportingUnresolvedObservationV1): string => [
  observation.trackId,
  observation.relationshipKind,
  observation.perspective,
  observation.respondent.userId,
].join('\u0000')

const metricsFor = (observation: ReportingResolvedObservationV1, rules: ReportingMetricRuleV1[]): Record<string, ReportingSeparatedMetricV1> => {
  const output: Record<string, ReportingSeparatedMetricV1> = {}
  for (const rule of rules) {
    const candidates = observation.metrics.filter((metric) => metric.key === rule.sourceMetricKey)
    if (candidates.length > 1) reportingFail('AMBIGUOUS_OBSERVATION', `metric ${rule.sourceMetricKey} is ambiguous`, 409)
    const metric = candidates[0]
    if (!metric || !rule.acceptedResultQuality.includes(metric.resultQuality)) {
      output[rule.metricId] = { state: 'missing' }
      continue
    }
    if (rule.acceptedMetricQuality !== 'IGNORE_METRIC_QUALITY' && (!metric.metricQuality || !rule.acceptedMetricQuality.includes(metric.metricQuality))) {
      output[rule.metricId] = { state: 'missing' }
      continue
    }
    const value = finiteReportingNumber(metric.value)
    output[rule.metricId] = value === null ? { state: 'missing' } : { state: 'present', value }
  }
  return output
}

export const buildSeparatedMultiRaterObservations = (input: {
  subjectUserId: string
  batches: ReportingObservationBatchV1[]
  metricRules: ReportingMetricRuleV1[]
  allowedExecutionIds: ReadonlySet<string>
}): ReportingSeparatedMultiRaterV1 => {
  if (!input.subjectUserId) reportingFail('REPORT_MULTI_RATER_SUBJECT_REQUIRED', 'multi-rater subject is required', 400)
  if (input.batches.length === 0) reportingFail('REPORT_MULTI_RATER_SOURCE_REQUIRED', 'multi-rater analysis requires at least one source Track', 400)
  const first = input.batches[0]
  if (input.batches.some((batch) => (
    batch.organizationId !== first.organizationId
    || batch.resourceFamily !== first.resourceFamily
    || batch.resourceKey !== first.resourceKey
    || batch.resourceVersion !== first.resourceVersion
  ))) reportingFail('REPORT_MULTI_RATER_SOURCE_MISMATCH', 'multi-rater sources must share Organization and exact resource identity', 409)

  const observations: ReportingSeparatedRaterObservationV1[] = []
  const seen = new Set<string>()
  for (const batch of input.batches) {
    const all: Array<ReportingResolvedObservationV1 | ReportingUnresolvedObservationV1> = [...batch.resolved, ...batch.unresolved]
    for (const observation of all) {
      if (observation.subject.userId !== input.subjectUserId || !input.allowedExecutionIds.has(observation.executionId)) continue
      const key = observationKey(observation)
      if (seen.has(key)) reportingFail('AMBIGUOUS_OBSERVATION', 'multi-rater source tuple has more than one observation', 409)
      seen.add(key)
      const completed = 'canonicalResultHash' in observation
      observations.push({
        executionId: observation.executionId,
        trackId: observation.trackId,
        state: completed ? 'COMPLETED' : 'MISSING',
        subject: observation.subject,
        respondent: observation.respondent,
        relationshipKind: observation.relationshipKind,
        relationshipRef: observation.relationshipRef,
        perspective: observation.perspective,
        metrics: completed
          ? metricsFor(observation as ReportingResolvedObservationV1, input.metricRules)
          : Object.fromEntries(input.metricRules.map((rule) => [rule.metricId, { state: 'missing' as const }])),
      })
    }
  }
  observations.sort((left, right) => observationKey(left as unknown as ReportingResolvedObservationV1).localeCompare(observationKey(right as unknown as ReportingResolvedObservationV1)))
  return {
    schemaVersion: 1,
    kind: 'MULTI_RATER_SEPARATED',
    subjectUserId: input.subjectUserId,
    resource: { family: first.resourceFamily, key: first.resourceKey, version: first.resourceVersion },
    observations,
    limitations: ['NO_CROSS_RATER_COMBINATION'],
  }
}
