import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import {
  checkSingleExecutionPopulationAuthority,
  type SingleExecutionAuthorityEnvelope,
} from '../assessment-run/currentPopulationAuthority'

export type CampusCompositeAccessResult = {
  allowed: boolean
  consentFreeFinalReady?: boolean
}

type CampusCompositeAccessRow = SingleExecutionAuthorityEnvelope & {
  attemptUserId?: string | null
  attemptConsentId?: string | null
  assignmentRespondentId?: string | null
  assignmentStatus?: string | null
  assignmentConsentId?: string | null
  assignmentPolicyDomain?: string | null
  respondentRole?: string | null
  visibilityPolicyKey?: string | null
}

export async function checkCampusCompositeAccessDetails(input: {
  attemptId: string
  userId: string
}): Promise<CampusCompositeAccessResult> {
  // Unique index lookup on (runtime_binding_kind, runtime_binding_ref) followed
  // by flat decomposed population verification (generic-plan cacheable, no
  // force_custom_plan or 18-table nested EXISTS on the School student hot path).
  const rows = await prisma.$queryRaw<CampusCompositeAccessRow[]>(Prisma.sql`
    SELECT e."id" AS "executionId",
      e."organization_id" AS "organizationId",
      e."run_id" AS "runId",
      e."track_id" AS "trackId",
      e."status" AS "executionStatus",
      org."status" AS "orgStatus",
      org."product_domain" AS "orgProductDomain",
      e."subject_actor_snapshot_id" AS "subjectActorSnapshotId",
      e."respondent_actor_snapshot_id" AS "respondentActorSnapshotId",
      subject."user_id" AS "subjectUserId",
      subject."actor_role" AS "subjectRole",
      subject."provenance_kind" AS "subjectProvenance",
      subject."membership_id" AS "subjectMembershipId",
      subject."snapshot_payload"->>'personaGrantId' AS "subjectPersonaGrantId",
      respondent."user_id" AS "respondentUserId",
      respondent."actor_role" AS "respondentRole",
      respondent."provenance_kind" AS "respondentProvenance",
      respondent."membership_id" AS "respondentMembershipId",
      respondent."snapshot_payload"->>'personaGrantId' AS "respondentPersonaGrantId",
      relation."relationship_kind" AS "relationshipKind",
      relation."relationship_ref" AS "relationshipRef",
      relation."snapshot_payload"->'facts'->>'courseId' AS "relationshipCourseId",
      relation."snapshot_payload"->'facts'->>'studentClassAssignmentId' AS "relationshipStudentClassAssignmentId",
      relation."snapshot_payload"->'facts'->>'staffClassAssignmentId' AS "relationshipStaffClassAssignmentId",
      relation."snapshot_payload"->'facts'->>'classUnitId' AS "relationshipClassUnitId",
      t."resource_family" AS "trackResourceFamily",
      t."resource_key" AS "trackResourceKey",
      t."resource_version" AS "trackResourceVersion",
      parent."user_id" AS "attemptUserId",
      parent."consent_id" AS "attemptConsentId",
      a."respondent_user_id" AS "assignmentRespondentId",
      a."status" AS "assignmentStatus",
      a."consent_id" AS "assignmentConsentId",
      a."policy_domain" AS "assignmentPolicyDomain",
      a."respondent_role" AS "assignmentRespondentRole",
      a."visibility_policy_key" AS "visibilityPolicyKey"
    FROM "assessment_run_executions" e
    JOIN "organizations" org ON org."id" = e."organization_id"
    JOIN "assessment_run_tracks" t
      ON t."id" = e."track_id"
      AND t."organization_id" = e."organization_id"
      AND t."run_id" = e."run_id"
    JOIN "assessment_run_relationship_snapshots" relation ON relation."id" = e."relationship_snapshot_id"
    JOIN "assessment_run_actor_snapshots" subject
      ON subject."id" = e."subject_actor_snapshot_id"
      AND subject."organization_id" = e."organization_id"
      AND subject."run_id" = e."run_id"
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."id" = e."respondent_actor_snapshot_id"
      AND respondent."organization_id" = e."organization_id"
      AND respondent."run_id" = e."run_id"
    LEFT JOIN "composite_assessment_attempts" parent ON parent."id" = e."runtime_binding_ref"
    LEFT JOIN "relational_assessment_assignments" a ON a."id" = parent."assignment_ref"
    WHERE e."runtime_binding_kind" = 'COMPOSITE'
      AND e."runtime_binding_ref" = ${input.attemptId}
      AND respondent."user_id" = ${input.userId}
    LIMIT 1
  `)
  const row = rows[0] as (CampusCompositeAccessRow & { assignmentRespondentRole?: string | null }) | undefined
  if (!row) return { allowed: false }
  const allowed = await checkSingleExecutionPopulationAuthority(prisma, {
    executionId: row.executionId,
    envelope: row,
    purpose: 'COLLECTION',
    productScope: 'CAMPUS_ONLY',
  })
  if (!allowed) return { allowed: false }
  const consentFreeFinalReady = row.attemptUserId === input.userId
    && row.assignmentRespondentId === input.userId
    && (row.assignmentStatus === 'STARTED' || row.assignmentStatus === 'COMPLETED')
    && row.assignmentConsentId === null
    && row.attemptConsentId === null
    && !(row.assignmentPolicyDomain === 'ORGANIZATION_RUN' && (
      row.assignmentRespondentRole === 'PARENT'
      || Boolean(row.visibilityPolicyKey?.startsWith('observer_'))
    ))
  return { allowed: true, consentFreeFinalReady }
}

export async function checkCampusCompositeAccessAuthority(input: {
  attemptId: string
  userId: string
}): Promise<boolean> {
  return (await checkCampusCompositeAccessDetails(input)).allowed
}
