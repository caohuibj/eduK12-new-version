import type { Prisma } from '@prisma/client'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'

/** Current School psychology scope, independent of teaching/classroom personas.
 * The professional may select approved students in this school, not read reports. */
export async function resolveSchoolPsychologyScope(tx:Prisma.TransactionClient,input:{
  actorUserId:string;organizationId:string
}){
  const member=await resolveEducationProductMemberScope({
    ...input,product:'HUISCHOOL',requiredCapability:'PSYCHOLOGY_STAFF',
  },tx)
  if(!member)return null
  const rows=await tx.$queryRaw<Array<{allowed:boolean}>>`
    SELECT EXISTS(SELECT 1 FROM "users" actor WHERE actor."id"=${input.actorUserId}
      AND (actor."role"<>'TEACHER' OR actor."teacher_approved"=TRUE)
      AND EXISTS(SELECT 1 FROM "organization_persona_grants" p
        WHERE p."organization_id"=${input.organizationId} AND p."membership_id"=${member.membershipId}
          AND p."persona"='COUNSELOR' AND p."revoked_at" IS NULL AND p."granted_at"<=statement_timestamp())
      AND EXISTS(SELECT 1 FROM "organization_capability_grants" c
        WHERE c."organization_id"=${input.organizationId} AND c."membership_id"=${member.membershipId}
          AND c."capability"='PSYCHOLOGY_STAFF' AND c."revoked_at" IS NULL AND c."granted_at"<=statement_timestamp())
      AND NOT EXISTS(SELECT 1 FROM "organization_access_denies" d
        WHERE d."organization_id"=${input.organizationId} AND d."user_id"=actor."id"
          AND d."lifted_at" IS NULL AND d."permission" IN (
            '*','ORGANIZATION_GOVERNANCE','ACTIVITY_MANAGE','PSYCHOLOGY_STAFF'))) AS "allowed"
  `
  return rows[0]?.allowed?member:null
}

/** A live business permission, never a product-admin or report-read grant. */
export async function resolveOwnSchoolActivityPublisher(tx:Prisma.TransactionClient,input:{
  actorUserId:string;organizationId:string;courseId?:string;runId?:string
}):Promise<{membershipId:string;courseId:string}|null>{
  const member=await resolveSchoolPsychologyScope(tx,input)
  if(!member)return null
  const rows=await tx.$queryRaw<Array<{courseId:string}>>`
    SELECT a."course_id" AS "courseId" FROM "campus_activities" a
    WHERE a."organization_id"=${input.organizationId}
      AND a."owner_membership_id"=${member.membershipId}
      AND EXISTS(SELECT 1 FROM "users" actor WHERE actor."id"=${input.actorUserId}
        AND (actor."role"<>'TEACHER' OR actor."teacher_approved"=TRUE))
      AND (${input.courseId??null}::text IS NULL OR a."course_id"=${input.courseId??null})
      AND (${input.runId??null}::text IS NULL OR EXISTS(
        SELECT 1 FROM "campus_activity_runs" link
        JOIN "assessment_runs" r ON r."id"=link."run_id"
          AND r."organization_id"=link."organization_id"
        WHERE link."organization_id"=a."organization_id" AND link."course_id"=a."course_id"
          AND r."id"=${input.runId??null} AND r."created_by_user_id"=${input.actorUserId}
          AND NOT EXISTS(SELECT 1 FROM "huiteacher_evaluation_run_links" teacher
            WHERE teacher."organization_id"=r."organization_id" AND teacher."run_id"=r."id")
      ))
      AND NOT EXISTS(SELECT 1 FROM "organization_access_denies" d
        WHERE d."organization_id"=a."organization_id" AND d."user_id"=${input.actorUserId}
          AND d."lifted_at" IS NULL AND d."permission" IN (
            '*','ORGANIZATION_GOVERNANCE','ACTIVITY_MANAGE','ASSESSMENT_DELIVERY',
            'ASSESSMENT_RUN_PUBLISH','RUN_PUBLISH','PSYCHOLOGY_STAFF'))
    LIMIT 1
  `
  return rows[0]?{membershipId:member.membershipId,courseId:rows[0].courseId}:null
}

/** Current approved/enrolled students intersect the selected same-school population.
 * Missing/withdrawn eligibility invalidates the whole chosen population, not silently
 * publishing a smaller cohort than the author reviewed. */
export async function ownSchoolActivityPopulationIsCurrent(tx:Prisma.TransactionClient,input:{
  organizationId:string;courseId:string;membershipId:string
}):Promise<boolean>{
  const rows=await tx.$queryRaw<Array<{allowed:boolean}>>`
    SELECT EXISTS(SELECT 1 FROM "campus_activity_participants" selected
      WHERE selected."organization_id"=${input.organizationId} AND selected."course_id"=${input.courseId}
        AND selected."status"='ACTIVE') AND NOT EXISTS(
      SELECT 1 FROM "campus_activity_participants" p
      WHERE p."organization_id"=${input.organizationId} AND p."course_id"=${input.courseId}
        AND p."status"='ACTIVE' AND NOT EXISTS(
          SELECT 1 FROM "organization_student_class_assignments" sc
          JOIN "organization_memberships" m ON m."id"=sc."membership_id"
            AND m."organization_id"=sc."organization_id"
            AND m."valid_from"<=statement_timestamp()
            AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
          JOIN "users" student ON student."id"=m."user_id" AND student."account_domain"='SCHOOL'
            AND student."role"='STUDENT' AND student."is_active"=TRUE AND student."is_frozen"=FALSE
            AND student."must_change_password"=FALSE
            AND (student."expires_at" IS NULL OR student."expires_at">statement_timestamp())
          JOIN "organization_persona_grants" persona ON persona."organization_id"=m."organization_id"
            AND persona."membership_id"=m."id" AND persona."persona"='STUDENT'
            AND persona."revoked_at" IS NULL AND persona."granted_at"<=statement_timestamp()
          JOIN "campus_student_enrollments" e ON e."organization_id"=sc."organization_id"
            AND e."user_id"=m."user_id" AND e."class_unit_id"=sc."class_unit_id" AND e."status"='APPROVED'
          JOIN "campus_class_admissions" ca ON ca."organization_id"=sc."organization_id"
            AND ca."class_unit_id"=sc."class_unit_id" AND ca."status"='APPROVED'
          WHERE sc."organization_id"=p."organization_id" AND sc."membership_id"=p."membership_id"
            AND NOT EXISTS(SELECT 1 FROM "organization_access_denies" denied
              WHERE denied."organization_id"=m."organization_id" AND denied."user_id"=m."user_id"
                AND denied."lifted_at" IS NULL AND denied."permission" IN ('*','ACTIVITY_READ','RUN_START'))
            AND sc."valid_from"<=statement_timestamp()
            AND (sc."valid_until" IS NULL OR sc."valid_until">statement_timestamp())
        )
    ) AS "allowed"
  `
  return rows[0]?.allowed===true
}
