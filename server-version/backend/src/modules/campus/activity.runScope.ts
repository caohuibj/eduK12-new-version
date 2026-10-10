import type { Prisma } from '@prisma/client'
import { CampusActivityError } from './activity.service'

/** A SCHOOL Run is always scoped to one Activity. Legacy runs retain their
 * existing delivery semantics. The result is used only as a narrowing input,
 * never as a source of scientific scoring or FINAL identity.
 */
export async function campusRunParticipantScope(tx:Prisma.TransactionClient,input:{
  organizationId:string;runId:string;actorUserId:string;publish:boolean
}):Promise<Set<string>|null>{
  const org=await tx.$queryRaw<Array<{productDomain:string}>>`
    SELECT "product_domain" AS "productDomain" FROM "organizations"
    WHERE "id"=${input.organizationId}
  `
  if(org[0]?.productDomain!=='SCHOOL')return null
  const rows=await tx.$queryRaw<Array<{courseId:string;status:string;admin:boolean}>>`
    SELECT a."course_id" AS "courseId",a."status",
      EXISTS(
        SELECT 1 FROM "organization_memberships" m JOIN "users" u ON u."id"=m."user_id"
        WHERE m."organization_id"=a."organization_id"
          AND m."user_id"=${input.actorUserId}
          AND m."org_role"='ORG_ADMIN' AND u."account_domain"='SCHOOL'
          AND u."is_active"=TRUE AND u."is_frozen"=FALSE
      AND u."must_change_password"=FALSE
          AND m."valid_from"<=statement_timestamp()
          AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
      ) AS "admin"
    FROM "campus_activity_runs" ar
    JOIN "campus_activities" a ON a."organization_id"=ar."organization_id"
      AND a."course_id"=ar."course_id"
    WHERE ar."organization_id"=${input.organizationId} AND ar."run_id"=${input.runId}
    FOR SHARE OF a
  `
  const a=rows[0]
  if(!a)throw new CampusActivityError('CAMPUS_RUN_MUST_HAVE_ACTIVITY',403)
  if(input.publish&&(!a.admin||a.status!=='OPEN'))
    throw new CampusActivityError('CAMPUS_RUN_REQUIRES_OPEN_GOVERNED_ACTIVITY',403)
  if(!['DRAFT','SUBMITTED','OPEN'].includes(a.status))
    throw new CampusActivityError('CAMPUS_ACTIVITY_INACTIVE',409)
  const selected=await tx.$queryRaw<Array<{membershipId:string}>>`
    SELECT DISTINCT p."membership_id" AS "membershipId"
    FROM "campus_activity_participants" p
    JOIN "organization_memberships" m ON m."organization_id"=p."organization_id"
      AND m."id"=p."membership_id"
      AND m."valid_from"<=statement_timestamp()
      AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
    JOIN "organization_persona_grants" pg
      ON pg."organization_id"=m."organization_id"
      AND pg."membership_id"=m."id" AND pg."persona"='STUDENT'
      AND pg."revoked_at" IS NULL AND pg."granted_at"<=statement_timestamp()
    JOIN "campus_student_enrollments" e ON e."organization_id"=m."organization_id"
      AND e."user_id"=m."user_id" AND e."status"='APPROVED'
    JOIN "campus_class_admissions" ca ON ca."organization_id"=e."organization_id"
      AND ca."class_unit_id"=e."class_unit_id" AND ca."status"='APPROVED'
    JOIN "organization_student_class_assignments" sc ON sc."organization_id"=m."organization_id"
      AND sc."membership_id"=m."id" AND sc."class_unit_id"=e."class_unit_id"
      AND sc."valid_from"<=statement_timestamp()
      AND (sc."valid_until" IS NULL OR sc."valid_until">statement_timestamp())
    JOIN "users" u ON u."id"=m."user_id" AND u."account_domain"='SCHOOL'
      AND u."is_active"=TRUE AND u."is_frozen"=FALSE
    WHERE p."organization_id"=${input.organizationId}
      AND p."course_id"=${a.courseId} AND p."status"='ACTIVE'
  `
  if(!selected.length)throw new CampusActivityError('CAMPUS_RUN_NO_APPROVED_STUDENTS')
  return new Set(selected.map(row=>row.membershipId))
}
