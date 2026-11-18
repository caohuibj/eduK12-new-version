import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { currentRunPopulationAuthoritySql } from '../assessment-run/currentPopulationAuthority'
import { withBoundedPlannerRead } from '../assessment-run/plannerBound'

export type CampusCompositeAccessResult = {
  allowed: boolean
  consentFreeFinalReady?: boolean
}

export async function checkCampusCompositeAccessDetails(input: {
  attemptId: string
  userId: string
}): Promise<CampusCompositeAccessResult> {
  const rows = await withBoundedPlannerRead(prisma, client => client.$queryRaw<Array<{
    id: string
    attemptUserId?: string | null
    attemptConsentId?: string | null
    assignmentRespondentId?: string | null
    assignmentStatus?: string | null
    assignmentConsentId?: string | null
    assignmentPolicyDomain?: string | null
    respondentRole?: string | null
    visibilityPolicyKey?: string | null
  }>>(Prisma.sql`
    SELECT e."id",
      parent."user_id" AS "attemptUserId",
      parent."consent_id" AS "attemptConsentId",
      a."respondent_user_id" AS "assignmentRespondentId",
      a."status" AS "assignmentStatus",
      a."consent_id" AS "assignmentConsentId",
      a."policy_domain" AS "assignmentPolicyDomain",
      a."respondent_role" AS "respondentRole",
      a."visibility_policy_key" AS "visibilityPolicyKey"
    FROM "assessment_run_executions" e
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."id"=e."respondent_actor_snapshot_id"
      AND respondent."organization_id"=e."organization_id"
      AND respondent."run_id"=e."run_id"
    JOIN "campus_activity_runs" ca ON ca."run_id"=e."run_id"
      AND ca."organization_id"=e."organization_id"
    LEFT JOIN "composite_assessment_attempts" parent ON parent."id"=e."runtime_binding_ref"
    LEFT JOIN "relational_assessment_assignments" a ON a."id"=parent."assignment_ref"
    WHERE e."runtime_binding_kind"='COMPOSITE'
      AND e."runtime_binding_ref"=${input.attemptId}
      AND respondent."user_id"=${input.userId}
      AND ${currentRunPopulationAuthoritySql(Prisma.sql`e."id"`, 'COLLECTION', 'CAMPUS_ONLY')}
    LIMIT 1
  `))
  const row = rows[0]
  if (!row) return { allowed: false }
  const consentFreeFinalReady = row.attemptUserId === input.userId
    && row.assignmentRespondentId === input.userId
    && (row.assignmentStatus === 'STARTED' || row.assignmentStatus === 'COMPLETED')
    && (row.assignmentStatus === 'COMPLETED' || (
      row.assignmentConsentId === null
      && row.attemptConsentId === null
      && !(row.assignmentPolicyDomain === 'ORGANIZATION_RUN' && (
        row.respondentRole === 'PARENT'
        || Boolean(row.visibilityPolicyKey?.startsWith('observer_'))
      ))
    ))
  return { allowed: true, consentFreeFinalReady }
}

export async function checkCampusCompositeAccessAuthority(input: {
  attemptId: string
  userId: string
}): Promise<boolean> {
  return (await checkCampusCompositeAccessDetails(input)).allowed
}
