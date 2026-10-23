import type { Prisma } from '@prisma/client'
import { CampusActivityError } from './activity.service'
import { resolveOwnSchoolActivityPublisher, ownSchoolActivityPopulationIsCurrent } from './activity.publisher'

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
  // A Teacher-linked Run is never a Huischool activity, even though it shares
  // the same education Organization. Verify Teacher entitlement, manager and
  // event state before letting the canonical Run machinery continue.
  const teacherLinks=await tx.$queryRaw<Array<{eventStatus:string;productAdmin:boolean}>>`
    SELECT event."status" AS "eventStatus",
      EXISTS(
        SELECT 1 FROM "organization_memberships" m
        JOIN "education_product_role_grants" grant_row
          ON grant_row."organization_id"=m."organization_id"
          AND grant_row."membership_id"=m."id"
          AND grant_row."product"='HUITEACHER'
          AND grant_row."role"='PRODUCT_ADMIN'
          AND grant_row."revoked_at" IS NULL
        WHERE m."organization_id"=link."organization_id"
          AND m."user_id"=${input.actorUserId}
          AND m."valid_from"<=statement_timestamp()
          AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
      ) AS "productAdmin"
    FROM "huiteacher_evaluation_run_links" link
    JOIN "huiteacher_evaluation_events" event
      ON event."organization_id"=link."organization_id"
      AND event."id"=link."event_id"
    JOIN "education_product_entitlements" entitlement
      ON entitlement."organization_id"=link."organization_id"
      AND entitlement."product"='HUITEACHER'
      AND entitlement."status"='ACTIVE'
    JOIN "organizations" school ON school."id"=link."organization_id"
      AND school."status"='ACTIVE'
    WHERE link."organization_id"=${input.organizationId}
      AND link."run_id"=${input.runId}
  `
  const teacher=teacherLinks[0]
  if(teacher){
    if(!teacher.productAdmin || teacher.eventStatus==='CANCELLED'||teacher.eventStatus==='CLOSED')
      throw new CampusActivityError('HUITEACHER_RUN_NOT_AUTHORIZED',403)
    if(input.publish&&teacher.eventStatus!=='OPEN')
      throw new CampusActivityError('HUITEACHER_RUN_EVENT_MUST_BE_OPEN',403)
    return null
  }

  const rows=await tx.$queryRaw<Array<{courseId:string;status:string;admin:boolean}>>`
    SELECT a."course_id" AS "courseId",a."status",
      EXISTS(
        SELECT 1 FROM "organization_memberships" m JOIN "users" u ON u."id"=m."user_id"
        WHERE m."organization_id"=a."organization_id"
          AND m."user_id"=${input.actorUserId}
          AND m."org_role"='ORG_ADMIN' AND u."account_domain"='SCHOOL'
          AND EXISTS(
            SELECT 1 FROM "education_product_role_grants" g
            WHERE g."organization_id"=m."organization_id"
              AND g."membership_id"=m."id"
              AND g."product"='HUISCHOOL'
              AND g."role"='PRODUCT_ADMIN' AND g."revoked_at" IS NULL
          )
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
  const own=!a.admin?await resolveOwnSchoolActivityPublisher(tx,{
    actorUserId:input.actorUserId,organizationId:input.organizationId,courseId:a.courseId,runId:input.runId,
  }):null
  if(own&&!await ownSchoolActivityPopulationIsCurrent(tx,{
    organizationId:input.organizationId,courseId:a.courseId,membershipId:own.membershipId,
  }))throw new CampusActivityError('ACTIVITY_PUBLISH_CLASS_SCOPE',403)
  if(input.publish&&((!a.admin&&!own)||a.status!=='OPEN'))
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
