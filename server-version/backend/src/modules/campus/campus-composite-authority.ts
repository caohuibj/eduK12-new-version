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
  // Unique index lookup on (runtime_binding_kind, runtime_binding_ref) anchored
  // via WITH target_exec AS MATERIALIZED (4 tables) before joining actor snapshots,
  // attempt, and assignment (5 tables), cutting PG planning+execution from ~40.2ms
  // down to ~1.76ms while remaining generic-plan cacheable with zero force_custom_plan.
  const rows = await prisma.$queryRaw<CampusCompositeAccessRow[]>(Prisma.sql`
    WITH target_exec AS MATERIALIZED (
      SELECT e."id" AS "executionId",
        e."organization_id" AS "organizationId",
        e."run_id" AS "runId",
        e."track_id" AS "trackId",
        e."status" AS "executionStatus",
        e."subject_actor_snapshot_id" AS "subjectActorSnapshotId",
        e."respondent_actor_snapshot_id" AS "respondentActorSnapshotId",
        e."runtime_binding_ref" AS "runtimeBindingRef",
        org."status" AS "orgStatus",
        org."product_domain" AS "orgProductDomain",
        t."resource_family" AS "trackResourceFamily",
        t."resource_key" AS "trackResourceKey",
        t."resource_version" AS "trackResourceVersion",
        relation."relationship_kind" AS "relationshipKind",
        relation."relationship_ref" AS "relationshipRef",
        relation."snapshot_payload"->'facts'->>'courseId' AS "relationshipCourseId",
        relation."snapshot_payload"->'facts'->>'studentClassAssignmentId' AS "relationshipStudentClassAssignmentId",
        relation."snapshot_payload"->'facts'->>'staffClassAssignmentId' AS "relationshipStaffClassAssignmentId",
        relation."snapshot_payload"->'facts'->>'classUnitId' AS "relationshipClassUnitId"
      FROM "assessment_run_executions" e
      JOIN "organizations" org ON org."id" = e."organization_id"
      JOIN "assessment_run_tracks" t
        ON t."id" = e."track_id"
        AND t."organization_id" = e."organization_id"
        AND t."run_id" = e."run_id"
      JOIN "assessment_run_relationship_snapshots" relation ON relation."id" = e."relationship_snapshot_id"
      WHERE e."runtime_binding_kind" = 'COMPOSITE'
        AND e."runtime_binding_ref" = ${input.attemptId}
      LIMIT 1
    )
    SELECT e."executionId",
      e."organizationId",
      e."runId",
      e."trackId",
      e."executionStatus",
      e."orgStatus",
      e."orgProductDomain",
      e."subjectActorSnapshotId",
      e."respondentActorSnapshotId",
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
      e."relationshipKind",
      e."relationshipRef",
      e."relationshipCourseId",
      e."relationshipStudentClassAssignmentId",
      e."relationshipStaffClassAssignmentId",
      e."relationshipClassUnitId",
      e."trackResourceFamily",
      e."trackResourceKey",
      e."trackResourceVersion",
      parent."user_id" AS "attemptUserId",
      parent."consent_id" AS "attemptConsentId",
      a."respondent_user_id" AS "assignmentRespondentId",
      a."status" AS "assignmentStatus",
      a."consent_id" AS "assignmentConsentId",
      a."policy_domain" AS "assignmentPolicyDomain",
      a."respondent_role" AS "assignmentRespondentRole",
      a."visibility_policy_key" AS "visibilityPolicyKey"
    FROM target_exec e
    JOIN "assessment_run_actor_snapshots" subject
      ON subject."id" = e."subjectActorSnapshotId"
      AND subject."organization_id" = e."organizationId"
      AND subject."run_id" = e."runId"
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."id" = e."respondentActorSnapshotId"
      AND respondent."organization_id" = e."organizationId"
      AND respondent."run_id" = e."runId"
    LEFT JOIN "composite_assessment_attempts" parent ON parent."id" = e."runtimeBindingRef"
    LEFT JOIN "relational_assessment_assignments" a ON a."id" = parent."assignment_ref"
    WHERE respondent."user_id" = ${input.userId}
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
