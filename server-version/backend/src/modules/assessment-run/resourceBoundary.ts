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
}): Promise<void> => {
  const rows = await prisma.$queryRaw<Array<{
    createdByUserId: string
    membershipId: string | null
    orgRole: string | null
    teacherPersona: boolean
    counselorPersona: boolean
    denied: boolean
  }>>`
    SELECT r."created_by_user_id" AS "createdByUserId",
      m."id" AS "membershipId", m."org_role" AS "orgRole",
      COALESCE(EXISTS (
        SELECT 1 FROM "organization_persona_grants" pg
        WHERE pg."organization_id" = r."organization_id"
          AND pg."membership_id" = m."id"
          AND pg."persona" = 'TEACHER'
          AND pg."revoked_at" IS NULL
      ), FALSE) AS "teacherPersona",
      COALESCE(EXISTS (
        SELECT 1 FROM "organization_persona_grants" pg
        WHERE pg."organization_id" = r."organization_id"
          AND pg."membership_id" = m."id"
          AND pg."persona" = 'COUNSELOR'
          AND pg."revoked_at" IS NULL
      ), FALSE) AS "counselorPersona",
      EXISTS (
        SELECT 1 FROM "organization_access_denies" d
        WHERE d."organization_id" = r."organization_id"
          AND d."user_id" = ${input.actorUserId}
          AND d."lifted_at" IS NULL
          AND d."permission" IN ('*','ORGANIZATION_GOVERNANCE','ASSESSMENT_DELIVERY','ASSESSMENT_RUN_PUBLISH','RUN_PUBLISH')
      ) AS "denied"
    FROM "assessment_runs" r
    LEFT JOIN "organization_memberships" m
      ON m."organization_id" = r."organization_id"
      AND m."user_id" = ${input.actorUserId}
      AND m."valid_from" <= statement_timestamp()
      AND (m."valid_until" IS NULL OR statement_timestamp() < m."valid_until")
    WHERE r."organization_id" = ${input.organizationId}
      AND r."id" = ${input.runId}
    ORDER BY m."valid_from" DESC NULLS LAST
    LIMIT 1
  `
  const row = rows[0]
  if (!row) throw new RunResourceBoundaryError('RUN_NOT_FOUND', 'Run not found in organization', 404)
  if (!row.membershipId || row.denied) {
    throw new RunResourceBoundaryError('RUN_DELIVERY_FORBIDDEN', 'current Organization delivery authority is required', 403)
  }
  if (row.orgRole === 'ORG_ADMIN') return
  if (!row.teacherPersona && !row.counselorPersona) {
    throw new RunResourceBoundaryError('RUN_DELIVERY_FORBIDDEN', 'delivery requires ORG_ADMIN, TEACHER, or COUNSELOR authority', 403)
  }
  if (row.createdByUserId !== input.actorUserId) {
    throw new RunResourceBoundaryError('RUN_DELIVERY_FORBIDDEN', 'scoped professionals may manage only their own assessment campaigns', 403)
  }
}

/** Backward-compatible name used by publish routes and existing tests. */
export const assertCurrentRunPublisherBoundary = assertCurrentRunManagerBoundary
