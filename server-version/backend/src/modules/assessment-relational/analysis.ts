import { canonicalHash } from '../assessment-runtime/canonical'
import { relationalFail } from './errors'
import type { RelationalAssignmentRepository } from './repository'
import type { RelationalAssignmentRecordV1, RelationalResourceKindV1 } from './types'

const HASH = /^[0-9a-f]{64}$/
const EXACT_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/
const FORBIDDEN_REPORT_KEYS = new Set([
  'answers',
  'rawAnswers',
  'rawInput',
  'responsePayload',
  'sensitiveContext',
])

export interface RelationalCohortAnalysisPolicyV1 {
  schemaVersion: 1
  policyKey: string
  policyVersion: string
  /** Must equal the minimum frozen into every assignment from applicability. */
  minimumRespondents: number
  metricKeys: string[]
}

interface RelationalCohortResultInputV1 {
  assignment: RelationalAssignmentRecordV1
  canonicalResultHash: string
  metrics: Record<string, number | null>
}

export interface RelationalCanonicalResultProjectionV1 {
  canonicalResultHash: string
  metrics: Record<string, number | null>
}

/**
 * Internal authority boundary. Implementations must resolve the canonical/report-safe
 * result for the persisted assignment; callers cannot inject metrics directly into
 * cohort generation.
 */
export interface RelationalCanonicalResultSourceV1 {
  loadForAssignment(assignment: RelationalAssignmentRecordV1): Promise<RelationalCanonicalResultProjectionV1 | null>
}

export type RelationalAggregateMetricV1 =
  | { state: 'present'; validN: number; missingN: number; mean: number }
  | { state: 'insufficient'; validN: number; missingN: number }

export interface RelationalCohortAnalysisSnapshotV1 {
  schemaVersion: 1
  kind: 'COHORT_AGGREGATE'
  subjectUserId: string
  episodeId: string
  courseId: string
  resourceKind: RelationalResourceKindV1
  resourceKey: string
  resourceVersion: string
  applicabilityHash: string
  minimumRespondents: number
  policyKey: string
  policyVersion: string
  policyHash: string
  respondentCount: number
  inputResultHashes: string[]
  metrics: Record<string, RelationalAggregateMetricV1>
  createdAt: string
  snapshotHash: string
}

const assertReportSafe = (value: unknown, path = '$'): void => {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertReportSafe(entry, `${path}[${index}]`))
    return
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_REPORT_KEYS.has(key)) {
      relationalFail('RELATIONAL_RAW_DISCLOSURE', `report projection contains forbidden field ${path}.${key}`)
    }
    assertReportSafe(entry, `${path}.${key}`)
  }
}

export const validateRelationalCohortPolicy = (
  policy: RelationalCohortAnalysisPolicyV1,
): RelationalCohortAnalysisPolicyV1 => {
  if (policy.schemaVersion !== 1) relationalFail('RELATIONAL_ANALYSIS_POLICY', 'schemaVersion must be 1')
  if (!policy.policyKey.trim()) relationalFail('RELATIONAL_ANALYSIS_POLICY', 'policyKey is required')
  if (!EXACT_VERSION.test(policy.policyVersion)) relationalFail('RELATIONAL_ANALYSIS_POLICY', 'policyVersion must be exact semver')
  if (!Number.isInteger(policy.minimumRespondents) || policy.minimumRespondents < 3) {
    relationalFail('RELATIONAL_MINIMUM_N', 'cohort policy minimumRespondents must be >= 3')
  }
  if (!Array.isArray(policy.metricKeys) || policy.metricKeys.length === 0) {
    relationalFail('RELATIONAL_ANALYSIS_POLICY', 'metricKeys must be non-empty')
  }
  const unique = new Set(policy.metricKeys)
  if (unique.size !== policy.metricKeys.length || [...unique].some((key) => !key.trim())) {
    relationalFail('RELATIONAL_ANALYSIS_POLICY', 'metricKeys must be unique non-empty keys')
  }
  return { ...policy, metricKeys: [...policy.metricKeys] }
}

export const hashRelationalCohortPolicy = (policy: RelationalCohortAnalysisPolicyV1): string => (
  canonicalHash({ schema: 'RelationalCohortAnalysisPolicyV1', policy: validateRelationalCohortPolicy(policy) })
)

const assertCohortAssignment = (
  assignment: RelationalAssignmentRecordV1,
): { courseId: string; minimumRespondents: number } => {
  if (assignment.status !== 'COMPLETED') {
    relationalFail('RELATIONAL_COHORT_ASSIGNMENT', 'cohort input requires COMPLETED assignments')
  }
  if (assignment.perspective !== 'RELATIONAL_EXPERIENCE') {
    relationalFail('RELATIONAL_COHORT_ASSIGNMENT', 'cohort input requires RELATIONAL_EXPERIENCE assignments')
  }
  if (assignment.analysisMode !== 'COHORT_AGGREGATE') {
    relationalFail('RELATIONAL_COHORT_ASSIGNMENT', 'cohort input requires COHORT_AGGREGATE assignments')
  }
  if (!Number.isInteger(assignment.minimumRespondents) || (assignment.minimumRespondents ?? 0) < 3) {
    relationalFail('RELATIONAL_COHORT_ASSIGNMENT', 'cohort assignment is missing frozen minimumRespondents')
  }
  if (assignment.relationshipKind !== 'COURSE_TEACHER_STUDENT') {
    relationalFail('RELATIONAL_COHORT_ASSIGNMENT', 'V1 relational-experience cohort requires course teacher/student relationship')
  }
  const courseId = assignment.relationshipSnapshot.courseId
  if (!courseId) relationalFail('RELATIONAL_COHORT_ASSIGNMENT', 'cohort assignment is missing frozen courseId')
  if (!HASH.test(assignment.applicabilityHash)) {
    relationalFail('RELATIONAL_COHORT_ASSIGNMENT', 'cohort assignment is missing frozen applicability hash')
  }
  return { courseId, minimumRespondents: assignment.minimumRespondents! }
}

const buildRelationalCohortAnalysis = (input: {
  policy: RelationalCohortAnalysisPolicyV1
  results: RelationalCohortResultInputV1[]
  createdAt?: string
}): RelationalCohortAnalysisSnapshotV1 => {
  const policy = validateRelationalCohortPolicy(input.policy)
  if (input.results.length === 0) relationalFail('RELATIONAL_COHORT_ASSIGNMENT', 'cohort input must be non-empty')

  const first = input.results[0].assignment
  const firstContract = assertCohortAssignment(first)
  if (policy.minimumRespondents !== firstContract.minimumRespondents) {
    relationalFail('RELATIONAL_MINIMUM_N', 'analysis policy minimumRespondents must equal assignment-frozen applicability minimum')
  }

  const assignmentIds = new Set<string>()
  const respondentIds = new Set<string>()
  for (const result of input.results) {
    const assignment = result.assignment
    const contract = assertCohortAssignment(assignment)
    if (
      assignment.subjectUserId !== first.subjectUserId
      || assignment.episodeId !== first.episodeId
      || contract.courseId !== firstContract.courseId
      || assignment.resourceKind !== first.resourceKind
      || assignment.resourceKey !== first.resourceKey
      || assignment.resourceVersion !== first.resourceVersion
      || assignment.applicabilityHash !== first.applicabilityHash
      || assignment.minimumRespondents !== first.minimumRespondents
      || assignment.visibilityPolicyKey !== first.visibilityPolicyKey
    ) {
      relationalFail('RELATIONAL_COHORT_SCOPE', 'cohort assignments must share subject/course/episode/resource/applicability')
    }
    if (!HASH.test(result.canonicalResultHash)) relationalFail('RELATIONAL_RESULT_HASH', 'canonicalResultHash must be sha256')
    if (assignmentIds.has(assignment.assignmentId)) relationalFail('RELATIONAL_ANALYSIS_DUPLICATE', 'duplicate assignment in cohort input')
    if (respondentIds.has(assignment.respondentUserId)) relationalFail('RELATIONAL_ANALYSIS_DUPLICATE', 'duplicate respondent in cohort input')
    assignmentIds.add(assignment.assignmentId)
    respondentIds.add(assignment.respondentUserId)
    for (const metricKey of policy.metricKeys) {
      const value = result.metrics[metricKey]
      if (value !== null && value !== undefined && (!Number.isFinite(value) || typeof value !== 'number')) {
        relationalFail('RELATIONAL_ANALYSIS_METRIC', `metric ${metricKey} must be finite number or null`)
      }
    }
  }
  if (respondentIds.size < firstContract.minimumRespondents) {
    relationalFail('RELATIONAL_INSUFFICIENT_RESPONDENTS', 'cohort has fewer respondents than assignment-frozen minimum')
  }

  const metrics: Record<string, RelationalAggregateMetricV1> = {}
  for (const metricKey of policy.metricKeys) {
    const values = input.results
      .map((result) => result.metrics[metricKey])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    const missingN = input.results.length - values.length
    if (values.length < firstContract.minimumRespondents) {
      metrics[metricKey] = { state: 'insufficient', validN: values.length, missingN }
      continue
    }
    metrics[metricKey] = {
      state: 'present',
      validN: values.length,
      missingN,
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    }
  }

  const withoutHash = {
    schemaVersion: 1 as const,
    kind: 'COHORT_AGGREGATE' as const,
    subjectUserId: first.subjectUserId,
    episodeId: first.episodeId,
    courseId: firstContract.courseId,
    resourceKind: first.resourceKind,
    resourceKey: first.resourceKey,
    resourceVersion: first.resourceVersion,
    applicabilityHash: first.applicabilityHash,
    minimumRespondents: firstContract.minimumRespondents,
    policyKey: policy.policyKey,
    policyVersion: policy.policyVersion,
    policyHash: hashRelationalCohortPolicy(policy),
    respondentCount: respondentIds.size,
    inputResultHashes: input.results.map((result) => result.canonicalResultHash).sort(),
    metrics,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
  return {
    ...withoutHash,
    snapshotHash: canonicalHash({ schema: 'RelationalCohortAnalysisSnapshotV1', snapshot: withoutHash }),
  }
}

export const createRelationalCohortAnalysisService = (input: {
  assignments: Pick<RelationalAssignmentRepository, 'findById'>
  canonicalResults: RelationalCanonicalResultSourceV1
}) => ({
  async build(request: {
    assignmentIds: string[]
    policy: RelationalCohortAnalysisPolicyV1
    createdAt?: string
  }): Promise<RelationalCohortAnalysisSnapshotV1> {
    if (request.assignmentIds.length === 0) {
      return relationalFail('RELATIONAL_COHORT_ASSIGNMENT', 'cohort assignmentIds must be non-empty')
    }
    if (new Set(request.assignmentIds).size !== request.assignmentIds.length) {
      return relationalFail('RELATIONAL_ANALYSIS_DUPLICATE', 'duplicate assignment id in cohort request')
    }

    const validated: RelationalCohortResultInputV1[] = []
    for (const assignmentId of request.assignmentIds) {
      const assignment = await input.assignments.findById(assignmentId)
      if (!assignment) {
        return relationalFail('RELATIONAL_COHORT_ASSIGNMENT_NOT_FOUND', 'cohort assignment not found')
      }
      const result = await input.canonicalResults.loadForAssignment(assignment)
      if (!result) {
        return relationalFail('RELATIONAL_COHORT_RESULT_NOT_FOUND', 'canonical result not found for assignment')
      }
      validated.push({ assignment, ...result })
    }
    return buildRelationalCohortAnalysis({
      policy: request.policy,
      results: validated,
      createdAt: request.createdAt,
    })
  },
})

export const projectRelationalCohortForSubject = (input: {
  snapshot: RelationalCohortAnalysisSnapshotV1
  viewerUserId: string
}) => {
  if (input.snapshot.subjectUserId !== input.viewerUserId) {
    relationalFail('RELATIONAL_ANALYSIS_ACCESS', 'cohort subject projection is only available to the subject')
  }
  const { inputResultHashes: _privateHashes, ...projection } = input.snapshot
  return projection
}

export const projectIndividualRelationalResult = (input: {
  assignment: RelationalAssignmentRecordV1
  viewerUserId: string
  viewerRole: string
  canonicalResultHash: string
  reportProjection: Record<string, unknown>
}) => {
  if (!HASH.test(input.canonicalResultHash)) relationalFail('RELATIONAL_RESULT_HASH', 'canonicalResultHash must be sha256')
  if (input.assignment.perspective === 'RELATIONAL_EXPERIENCE') {
    relationalFail('RELATIONAL_ANALYSIS_ACCESS', 'relational-experience results require cohort projection')
  }
  const isRespondent = input.viewerUserId === input.assignment.respondentUserId
  const isAssigningViewer = input.viewerUserId === input.assignment.createdByUserId
    && input.assignment.visibilityPolicyKey === 'observer_assigning_teacher_v1'
  if (!isRespondent && !isAssigningViewer) {
    relationalFail('RELATIONAL_ANALYSIS_ACCESS', 'viewer is not allowed to read this individual result')
  }
  assertReportSafe(input.reportProjection)
  return {
    assignmentId: input.assignment.assignmentId,
    subjectUserId: input.assignment.subjectUserId,
    respondentRole: input.assignment.respondentRole,
    perspective: input.assignment.perspective,
    canonicalResultHash: input.canonicalResultHash,
    report: input.reportProjection,
  }
}
