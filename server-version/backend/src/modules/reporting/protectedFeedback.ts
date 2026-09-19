import { prisma } from '../../config/database'
import { resolveOrganizationAccessContext } from '../organization/access'
import { reportingAggregations } from './statistics'
import { reportingFail, type ReportingAggregation, type ReportingMetricRuleV1 } from './types'
import type { ReportingPrincipal } from './authorization'
import type { ReportingSeparatedMultiRaterV1, ReportingSeparatedRaterObservationV1 } from './multiRater'

export const ORG_PROTECTED_FEEDBACK_POLICY = 'ORG_PROTECTED_FEEDBACK_V1' as const

export interface ReportingProtectedFeedbackSpecV1 {
  schemaVersion: 1
  analysisKind: 'PROTECTED_FEEDBACK'
  engineKey: 'ORG_PROTECTED_FEEDBACK_V1'
  engineVersion: '1.0.0'
  privacyUnit: 'RESPONDENT'
  selectionPolicy: 'UNIQUE_OR_REJECT'
  minimumRespondentN: number
  minimumContributorN: number
  metricRules: ReportingMetricRuleV1[]
}

export interface ReportingProtectedMetricProjectionV1 {
  state: 'present' | 'suppressed'
  aggregations?: Record<string, unknown>
}

export interface ReportingProtectedFeedbackProjectionV1 {
  schemaVersion: 1
  kind: 'PROTECTED_FEEDBACK'
  policyDomain: typeof ORG_PROTECTED_FEEDBACK_POLICY
  state: 'present' | 'suppressed'
  metrics?: Record<string, ReportingProtectedMetricProjectionV1>
  limitations: ['RESPONDENT_PRIVACY_PROTECTED', 'NO_RESPONDENT_IDENTITIES']
}

export interface ReportingProtectedFeedbackInternalCountsV1 {
  eligibleRespondentN: number
  resultContributorN: number
  metricValidN: Record<string, number>
}

const hidden = (): never => reportingFail('REPORT_NOT_FOUND', 'reporting resource not found', 404)

export const assertProtectedSubjectNotViewer = (viewerUserId: string, subjectUserId: string): void => {
  if (viewerUserId === subjectUserId) {
    reportingFail('SUBJECT_EXCLUDED', 'protected feedback is not readable by its subject', 403)
  }
}

const hasTeacherSubjectScope = async (input: {
  organizationId: string
  teacherMembershipId: string
  subjectUserId: string
}): Promise<boolean> => {
  const rows = await prisma.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM "organization_staff_class_assignments" staff
      JOIN "organization_student_class_assignments" student
        ON student."organization_id"=staff."organization_id"
       AND student."class_unit_id"=staff."class_unit_id"
       AND student."valid_until" IS NULL
      JOIN "organization_memberships" subject_membership
        ON subject_membership."organization_id"=student."organization_id"
       AND subject_membership."id"=student."membership_id"
       AND subject_membership."user_id"=${input.subjectUserId}
       AND subject_membership."valid_until" IS NULL
      JOIN "organization_persona_grants" subject_persona
        ON subject_persona."organization_id"=subject_membership."organization_id"
       AND subject_persona."membership_id"=subject_membership."id"
       AND subject_persona."persona"='STUDENT'
       AND subject_persona."revoked_at" IS NULL
      WHERE staff."organization_id"=${input.organizationId}
        AND staff."membership_id"=${input.teacherMembershipId}
        AND staff."valid_until" IS NULL
    ) AS "allowed"
  `
  return rows[0]?.allowed === true
}

const hasCounselorSubjectScope = async (input: {
  organizationId: string
  counselorMembershipId: string
  subjectUserId: string
}): Promise<boolean> => {
  const rows = await prisma.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM "organization_counselor_client_relationships" relation
      JOIN "organization_memberships" client
        ON client."organization_id"=relation."organization_id"
       AND client."id"=relation."client_membership_id"
       AND client."user_id"=${input.subjectUserId}
       AND client."valid_until" IS NULL
      JOIN "organization_persona_grants" client_persona
        ON client_persona."organization_id"=client."organization_id"
       AND client_persona."membership_id"=client."id"
       AND client_persona."persona"='CLIENT'
       AND client_persona."revoked_at" IS NULL
      WHERE relation."organization_id"=${input.organizationId}
        AND relation."counselor_membership_id"=${input.counselorMembershipId}
        AND relation."valid_until" IS NULL
    ) AS "allowed"
  `
  return rows[0]?.allowed === true
}

export const assertProtectedFeedbackManagerAccess = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  subjectUserId: string
}): Promise<void> => {
  // Explicit subject deny precedes every platform/Organization allow basis.
  assertProtectedSubjectNotViewer(input.principal.userId, input.subjectUserId)
  const context = await resolveOrganizationAccessContext({ principal: input.principal, organizationId: input.organizationId })
  if (!context || context.membershipId === null) hidden()
  if (context.organizationStatus !== 'ACTIVE') reportingFail('ORGANIZATION_SUSPENDED', 'organization is suspended', 409)
  if (
    context.explicitDenies.includes('*')
    || context.explicitDenies.includes('REPORT_READ')
    || context.explicitDenies.includes(ORG_PROTECTED_FEEDBACK_POLICY)
  ) hidden()

  // SYSTEM_ADMIN alone is not sensitive-content authority. A current Organization
  // role/capability/relationship is still required.
  if (context.orgRole === 'ORG_ADMIN' || context.capabilities.includes('PSYCHOLOGY_STAFF')) return
  if (context.personas.includes('TEACHER')) {
    if (await hasTeacherSubjectScope({
      organizationId: input.organizationId,
      teacherMembershipId: context.membershipId,
      subjectUserId: input.subjectUserId,
    })) return
  }
  if (context.personas.includes('COUNSELOR')) {
    if (await hasCounselorSubjectScope({
      organizationId: input.organizationId,
      counselorMembershipId: context.membershipId,
      subjectUserId: input.subjectUserId,
    })) return
  }
  hidden()
}

const uniqueFixedSourceObservations = (input: {
  separated: ReportingSeparatedMultiRaterV1
  subjectUserId: string
  trackId: string
  relationshipKind: string
  perspective: string
}): ReportingSeparatedRaterObservationV1[] => {
  if (input.separated.subjectUserId !== input.subjectUserId) {
    reportingFail('REPORT_PROTECTED_SOURCE_INVALID', 'protected feedback subject does not match separated source', 409)
  }
  const byRespondent = new Map<string, ReportingSeparatedRaterObservationV1>()
  for (const observation of input.separated.observations) {
    if (
      observation.trackId !== input.trackId
      || observation.relationshipKind !== input.relationshipKind
      || observation.perspective !== input.perspective
    ) continue
    if (observation.subject.userId !== input.subjectUserId || observation.respondent.userId === input.subjectUserId) {
      reportingFail('REPORT_PROTECTED_SOURCE_INVALID', 'protected feedback requires other-person respondents for the exact subject', 409)
    }
    const existing = byRespondent.get(observation.respondent.userId)
    if (!existing) {
      byRespondent.set(observation.respondent.userId, observation)
      continue
    }
    if (existing.executionId === observation.executionId) continue
    reportingFail('AMBIGUOUS_OBSERVATION', 'respondent has multiple authoritative observations under protected feedback source', 409)
  }
  return [...byRespondent.values()].sort((a, b) => a.respondent.userId.localeCompare(b.respondent.userId))
}

export const buildProtectedFeedbackProjection = (input: {
  separated: ReportingSeparatedMultiRaterV1
  subjectUserId: string
  trackId: string
  relationshipKind: string
  perspective: string
  sourceMinimumRespondents: number | null
  spec: ReportingProtectedFeedbackSpecV1
}): {
  projection: ReportingProtectedFeedbackProjectionV1
  internalCounts: ReportingProtectedFeedbackInternalCountsV1
} => {
  if (input.spec.analysisKind !== 'PROTECTED_FEEDBACK' || input.spec.engineKey !== 'ORG_PROTECTED_FEEDBACK_V1') {
    reportingFail('REPORT_ANALYSIS_KIND_UNSUPPORTED', 'protected feedback engine requires PROTECTED_FEEDBACK spec', 409)
  }
  const observations = uniqueFixedSourceObservations(input)
  const completed = observations.filter((observation) => observation.state === 'COMPLETED')
  const sourceFloor = input.sourceMinimumRespondents ?? 0
  const eligibleFloor = Math.max(input.spec.minimumRespondentN, sourceFloor)
  const contributorFloor = Math.max(input.spec.minimumContributorN, sourceFloor)
  const overallPresent = observations.length >= eligibleFloor && completed.length >= contributorFloor
  const metricValidN: Record<string, number> = {}
  const metrics: Record<string, ReportingProtectedMetricProjectionV1> = {}

  for (const rule of input.spec.metricRules) {
    const values: number[] = []
    for (const observation of completed) {
      const metric = observation.metrics[rule.metricId]
      if (metric?.state === 'present' && typeof metric.value === 'number' && Number.isFinite(metric.value)) values.push(metric.value)
    }
    metricValidN[rule.metricId] = values.length
    const floor = Math.max(rule.minimumMetricN, sourceFloor)
    if (!overallPresent || values.length < floor) {
      metrics[rule.metricId] = { state: 'suppressed' }
      continue
    }
    metrics[rule.metricId] = {
      state: 'present',
      aggregations: reportingAggregations({
        values,
        aggregations: rule.aggregations as ReportingAggregation[],
        distributionCellFloor: floor,
      }),
    }
  }

  const internalCounts = {
    eligibleRespondentN: observations.length,
    resultContributorN: completed.length,
    metricValidN,
  }
  if (!overallPresent) {
    return {
      internalCounts,
      projection: {
        schemaVersion: 1,
        kind: 'PROTECTED_FEEDBACK',
        policyDomain: ORG_PROTECTED_FEEDBACK_POLICY,
        state: 'suppressed',
        limitations: ['RESPONDENT_PRIVACY_PROTECTED', 'NO_RESPONDENT_IDENTITIES'],
      },
    }
  }
  return {
    internalCounts,
    projection: {
      schemaVersion: 1,
      kind: 'PROTECTED_FEEDBACK',
      policyDomain: ORG_PROTECTED_FEEDBACK_POLICY,
      state: 'present',
      metrics,
      limitations: ['RESPONDENT_PRIVACY_PROTECTED', 'NO_RESPONDENT_IDENTITIES'],
    },
  }
}
