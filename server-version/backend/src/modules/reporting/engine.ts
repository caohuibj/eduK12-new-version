import { canonicalHash } from '../assessment-runtime/canonical'
import { finiteReportingNumber, reportingAggregations } from './statistics'
import {
  reportingFail,
  type ReportingAnalysisSpecRecord,
  type ReportingArtifactPayloadV1,
  type ReportingCohortSnapshotRecord,
  type ReportingMaturity,
  type ReportingResolvedExecutionV1,
  type ReportingResultBatchV1,
  type ReportingSafeProjectionV1,
} from './types'

const maturityRank: Record<ReportingMaturity, number> = { PILOT: 0, RESEARCH_READY: 1, RESEARCH_GRADE: 2 }
const maturityByRank: ReportingMaturity[] = ['PILOT', 'RESEARCH_READY', 'RESEARCH_GRADE']

const subjectKey = (userId: string, membershipId: string): string => `${userId}\u0000${membershipId}`

export const reportingEvidenceFor = (
  resolved: Array<Pick<ReportingResolvedExecutionV1, 'scientificMaturity' | 'provenanceState'>>,
  ceiling: ReportingMaturity,
): { level: ReportingMaturity; limitations: string[]; profile: Record<string, number> } => {
  const profile: Record<string, number> = { PILOT: 0, RESEARCH_READY: 0, RESEARCH_GRADE: 0, LEGACY_UNFROZEN: 0 }
  const limitations = new Set<string>()
  let weakest: ReportingMaturity = 'RESEARCH_GRADE'
  if (resolved.length === 0) weakest = 'PILOT'
  for (const input of resolved) {
    if (input.provenanceState === 'LEGACY_UNFROZEN' || !input.scientificMaturity) {
      profile.LEGACY_UNFROZEN += 1
      limitations.add('LEGACY_UNFROZEN_INPUT')
      weakest = 'PILOT'
      continue
    }
    profile[input.scientificMaturity] = (profile[input.scientificMaturity] ?? 0) + 1
    if (maturityRank[input.scientificMaturity] < maturityRank[weakest]) weakest = input.scientificMaturity
  }
  const explicitLevels = Object.entries(profile).filter(([key, count]) => key !== 'LEGACY_UNFROZEN' && count > 0)
  if (explicitLevels.length > 1 || (profile.LEGACY_UNFROZEN > 0 && explicitLevels.length > 0)) limitations.add('MIXED_MATURITY_INPUTS')
  const level = maturityByRank[Math.min(maturityRank[weakest], maturityRank[ceiling])]
  if (maturityRank[ceiling] < maturityRank[weakest]) limitations.add('REPORT_EVIDENCE_CEILING')
  return { level, limitations: [...limitations].sort(), profile }
}

export const buildReportingArtifact = (input: {
  artifactId: string
  generatedByUserId: string
  generatedAt: string
  spec: ReportingAnalysisSpecRecord
  cohort: ReportingCohortSnapshotRecord
  batch: ReportingResultBatchV1
  options?: Record<string, never>
}): { payload: ReportingArtifactPayloadV1; snapshotHash: string; analysisIdentityHash: string } => {
  if (input.spec.status !== 'PUBLISHED') reportingFail('REPORT_SPEC_NOT_PUBLISHED', 'analysis requires a published reporting spec', 409)
  const definition = input.spec.definition
  if (definition.analysisKind !== 'GROUP' || definition.engineKey !== 'ORG_GROUP_V1') {
    reportingFail('REPORT_ANALYSIS_KIND_UNSUPPORTED', 'generic group engine requires GROUP spec', 409)
  }
  if (input.batch.resolved.length + input.batch.unresolved.length !== input.cohort.eligibleN) {
    reportingFail('REPORT_RESULT_INTEGRITY', 'resolved and unresolved executions do not cover frozen cohort', 500)
  }
  const cohortByExecution = new Map(input.cohort.members.map((member) => [member.executionId, member]))
  const observedSubjects = new Set<string>()
  for (const result of input.batch.resolved) {
    const member = cohortByExecution.get(result.executionId)
    if (!member || member.userId !== result.subjectUserId || member.membershipId !== result.membershipId) {
      reportingFail('REPORT_RESULT_INTEGRITY', 'resolved observation does not belong to frozen cohort', 500)
    }
    const key = subjectKey(result.subjectUserId, result.membershipId)
    if (observedSubjects.has(key)) reportingFail('AMBIGUOUS_OBSERVATION', 'duplicate subject observation is not selectable under UNIQUE_OR_REJECT', 409)
    observedSubjects.add(key)
  }
  for (const result of input.batch.unresolved) {
    const member = cohortByExecution.get(result.executionId)
    if (!member || member.userId !== result.subjectUserId || member.membershipId !== result.membershipId) {
      reportingFail('REPORT_RESULT_INTEGRITY', 'unresolved observation does not belong to frozen cohort', 500)
    }
    const key = subjectKey(result.subjectUserId, result.membershipId)
    if (observedSubjects.has(key)) reportingFail('AMBIGUOUS_OBSERVATION', 'subject has multiple resolved/unresolved observations', 409)
    observedSubjects.add(key)
  }
  if (observedSubjects.size !== input.cohort.eligibleN) reportingFail('REPORT_RESULT_INTEGRITY', 'subject observations do not exactly cover eligible cohort', 500)

  const resourceFloor = input.batch.resourceMinimumN ?? 0
  const contributorFloor = Math.max(definition.minimumContributorN, resourceFloor)
  const overallPresent = input.cohort.eligibleN >= definition.minimumCohortN
    && input.batch.resolved.length >= contributorFloor
  const metrics: ReportingSafeProjectionV1['metrics'] = {}

  for (const rule of definition.metricRules) {
    const values: number[] = []
    for (const result of input.batch.resolved) {
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
    const validN = values.length
    const missingN = input.cohort.eligibleN - validN
    const metricFloor = Math.max(rule.minimumMetricN, resourceFloor)
    if (!overallPresent || validN < metricFloor) {
      metrics[rule.metricId] = { state: 'suppressed' }
      continue
    }
    metrics[rule.metricId] = {
      state: 'present',
      validN,
      missingN,
      aggregations: reportingAggregations({ values, aggregations: rule.aggregations, distributionCellFloor: metricFloor }),
    }
  }

  const evidence = reportingEvidenceFor(input.batch.resolved, definition.reportEvidenceCeiling)
  const projection: ReportingSafeProjectionV1 = overallPresent
    ? {
        schemaVersion: 1,
        kind: 'GROUP',
        state: 'present',
        eligibleN: input.cohort.eligibleN,
        resultContributorN: input.batch.resolved.length,
        metrics,
        evidence: { level: evidence.level, limitations: evidence.limitations },
      }
    : {
        schemaVersion: 1,
        kind: 'GROUP',
        state: 'suppressed',
        evidence: { level: evidence.level, limitations: evidence.limitations },
      }

  const inputManifest = input.batch.resolved.map((result) => ({
    executionId: result.executionId,
    subjectUserId: result.subjectUserId,
    membershipId: result.membershipId,
    canonicalResultHash: result.canonicalResultHash,
    scientificMaturity: result.scientificMaturity,
    provenanceState: result.provenanceState,
    scientificProvenanceHash: result.scientificProvenanceHash,
  })).sort((left, right) => left.executionId < right.executionId ? -1 : left.executionId > right.executionId ? 1 : 0)

  const analysisIdentityHash = canonicalHash({
    schema: 'ReportingAnalysisIdentityV1',
    analysisKind: definition.analysisKind,
    engine: { key: definition.engineKey, version: definition.engineVersion },
    organizationId: input.cohort.organizationId,
    cohortIdentityHash: input.cohort.cohortIdentityHash,
    spec: { id: input.spec.id, hash: input.spec.specHash },
    resource: {
      family: input.batch.resourceFamily,
      key: input.batch.resourceKey,
      version: input.batch.resourceVersion,
      effectiveMinimumN: input.batch.resourceMinimumN,
    },
    inputs: inputManifest,
    options: input.options ?? {},
  })

  const payload: ReportingArtifactPayloadV1 = {
    schemaVersion: 1,
    artifactId: input.artifactId,
    organizationId: input.cohort.organizationId,
    source: { runId: input.cohort.sourceRunId, trackId: input.cohort.sourceTrackId },
    cohortSnapshotId: input.cohort.id,
    cohortIdentityHash: input.cohort.cohortIdentityHash,
    specId: input.spec.id,
    specHash: input.spec.specHash,
    analysisIdentityHash,
    generatedByUserId: input.generatedByUserId,
    generatedAt: input.generatedAt,
    inputManifest,
    maturityProfile: evidence.profile,
    projection,
  }
  return { payload, snapshotHash: canonicalHash(payload), analysisIdentityHash }
}
