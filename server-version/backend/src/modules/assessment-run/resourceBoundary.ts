import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'

export class RunResourceBoundaryError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 404) {
    super(message)
    this.name = 'RunResourceBoundaryError'
  }
}

export const assertRunExecutionParent = async (input: {
  organizationId: string
  runId: string
  executionId: string
}): Promise<void> => {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "assessment_run_executions"
    WHERE "organization_id" = ${input.organizationId}
      AND "run_id" = ${input.runId}
      AND "id" = ${input.executionId}
    LIMIT 1
  `
  if (!rows[0]) {
    throw new RunResourceBoundaryError('RUN_EXECUTION_NOT_FOUND', 'Run execution not found in parent resource', 404)
  }
}

/**
 * Run management is assessment delivery, not tenant governance.
 *
 * ORG_ADMIN may manage any Run in the organization. A TEACHER/COUNSELOR
 * persona may manage only a Run it created; publish/preview additionally
 * re-check every resolved pair against class/client scope.
 */
export const assertCurrentRunManagerBoundary = async (input: {
  organizationId: string
  runId: string
  actorUserId: string
}, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<void> => {
  const rows = await db.$queryRaw<Array<{
    createdByUserId: string
    membershipId: string | null
    orgRole: string | null
    productDomain: string
    actorDomain: string | null
    teacherRun: boolean
    teacherEnabled: boolean
    schoolEnabled: boolean
    teacherAdmin: boolean
    schoolAdmin: boolean
    teacherPersona: boolean
    counselorPersona: boolean
    denied: boolean
  }>>`
    SELECT r."created_by_user_id" AS "createdByUserId",
      m."id" AS "membershipId",m."org_role" AS "orgRole",
      o."product_domain" AS "productDomain",
      u."account_domain" AS "actorDomain",
      EXISTS(
        SELECT 1 FROM "huiteacher_evaluation_run_links" link
        WHERE link."run_id"=r."id" AND link."organization_id"=r."organization_id"
      ) AS "teacherRun",
      EXISTS(
        SELECT 1 FROM "education_product_entitlements" e
        WHERE e."organization_id"=r."organization_id"
          AND e."product"='HUITEACHER' AND e."status"='ACTIVE'
      ) AS "teacherEnabled",
      EXISTS(
        SELECT 1 FROM "education_product_entitlements" e
        WHERE e."organization_id"=r."organization_id"
          AND e."product"='HUISCHOOL' AND e."status"='ACTIVE'
      ) AS "schoolEnabled",
      COALESCE(EXISTS(
        SELECT 1 FROM "education_product_role_grants" g
        WHERE g."organization_id"=r."organization_id"
          AND g."membership_id"=m."id"
          AND g."product"='HUITEACHER'
          AND g."role"='PRODUCT_ADMIN' AND g."revoked_at" IS NULL
      ),FALSE) AS "teacherAdmin",
      COALESCE(EXISTS(
        SELECT 1 FROM "education_product_role_grants" g
        WHERE g."organization_id"=r."organization_id"
          AND g."membership_id"=m."id"
          AND g."product"='HUISCHOOL'
          AND g."role"='PRODUCT_ADMIN' AND g."revoked_at" IS NULL
      ),FALSE) AS "schoolAdmin",
      COALESCE(EXISTS (
        SELECT 1 FROM "organization_persona_grants" pg
        WHERE pg."organization_id"=r."organization_id"
          AND pg."membership_id"=m."id"
          AND pg."persona"='TEACHER' AND pg."revoked_at" IS NULL
      ),FALSE) AS "teacherPersona",
      COALESCE(EXISTS (
        SELECT 1 FROM "organization_persona_grants" pg
        WHERE pg."organization_id"=r."organization_id"
          AND pg."membership_id"=m."id"
          AND pg."persona"='COUNSELOR' AND pg."revoked_at" IS NULL
      ),FALSE) AS "counselorPersona",
      EXISTS (
        SELECT 1 FROM "organization_access_denies" deny
        WHERE deny."organization_id"=r."organization_id"
          AND deny."user_id"=${input.actorUserId}
          AND deny."lifted_at" IS NULL
          AND (deny."permission" IN (
            '*','ORGANIZATION_GOVERNANCE','ASSESSMENT_DELIVERY',
            'ASSESSMENT_RUN_PUBLISH','RUN_PUBLISH','EDUCATION_ACCESS')
            OR (deny."permission"='HUITEACHER_ACCESS' AND EXISTS(
              SELECT 1 FROM "huiteacher_evaluation_run_links" teacher
              WHERE teacher."run_id"=r."id"
            ))
            OR (deny."permission"='HUISCHOOL_ACCESS' AND NOT EXISTS(
              SELECT 1 FROM "huiteacher_evaluation_run_links" teacher
              WHERE teacher."run_id"=r."id"
            ))
          )
      ) AS "denied"
    FROM "assessment_runs" r
    JOIN "organizations" o ON o."id"=r."organization_id"
      AND o."status"='ACTIVE'
    LEFT JOIN "organization_memberships" m
      ON m."organization_id"=r."organization_id"
      AND m."user_id"=${input.actorUserId}
      AND m."valid_from"<=statement_timestamp()
      AND (m."valid_until" IS NULL OR statement_timestamp()<m."valid_until")
    LEFT JOIN "users" u ON u."id"=${input.actorUserId}
      AND u."is_active"=TRUE AND u."is_frozen"=FALSE
      AND u."must_change_password"=FALSE
      AND (u."expires_at" IS NULL OR u."expires_at">statement_timestamp())
    WHERE r."organization_id"=${input.organizationId}
      AND r."id"=${input.runId}
    ORDER BY m."valid_from" DESC NULLS LAST LIMIT 1
  `
  const row=rows[0]
  if(!row)throw new RunResourceBoundaryError('RUN_NOT_FOUND','Run not found in organization',404)
  if(!row.membershipId||row.denied||!row.actorDomain)
    throw new RunResourceBoundaryError('RUN_DELIVERY_FORBIDDEN','current Organization delivery authority required',403)

  if(row.productDomain==='SCHOOL'){
    if(row.actorDomain!=='SCHOOL')
      throw new RunResourceBoundaryError('RUN_DELIVERY_FORBIDDEN','education account required',403)
    if(row.teacherRun){
      if(!row.teacherEnabled||!row.teacherAdmin)
        throw new RunResourceBoundaryError('RUN_DELIVERY_FORBIDDEN','current Teacher product admin required',403)
      return
    }
    // Shared ORG_ADMIN is NOT automatically a School psychology admin.
    if(!row.schoolEnabled)
      throw new RunResourceBoundaryError('RUN_DELIVERY_FORBIDDEN','Huischool product not enabled',403)
    if(row.orgRole==='ORG_ADMIN'&&row.schoolAdmin)return
  } else if(row.orgRole==='ORG_ADMIN'){
    if(!['LEGACY','TRAINING'].includes(row.actorDomain))
      throw new RunResourceBoundaryError('RUN_DELIVERY_FORBIDDEN','legacy account required',403)
    return
  }
  if(!row.teacherPersona&&!row.counselorPersona)
    throw new RunResourceBoundaryError('RUN_DELIVERY_FORBIDDEN','professional delivery authority required',403)
  if(row.createdByUserId!==input.actorUserId)
    throw new RunResourceBoundaryError('RUN_DELIVERY_FORBIDDEN','only the Run creator may manage this campaign',403)
}

/**
 * Backward-compatible publisher contract. New management callers use the
 * delivery-specific error code; existing publish callers retain the historical
 * RUN_PUBLISH_FORBIDDEN code while sharing the same authority decision.
 */
export const assertCurrentRunPublisherBoundary = async (input: {
  organizationId: string
  runId: string
  actorUserId: string
}): Promise<void> => {
  try {
    await assertCurrentRunManagerBoundary(input)
  } catch (error) {
    if (error instanceof RunResourceBoundaryError && error.code === 'RUN_DELIVERY_FORBIDDEN') {
      throw new RunResourceBoundaryError('RUN_PUBLISH_FORBIDDEN', error.message, error.statusCode)
    }
    throw error
  }
}
