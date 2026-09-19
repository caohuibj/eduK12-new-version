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
 * Publish is not platform administration. A current Organization membership plus
 * ORG_ADMIN, TEACHER or COUNSELOR product authority is required even for an
 * idempotent replay of an already-published Run. Population scope is still
 * rechecked by publishAssessmentRun for the first publish transaction.
 */
export const assertCurrentRunPublisherBoundary = async (input: {
  organizationId: string
  runId: string
  actorUserId: string
}): Promise<void> => {
  const rows = await prisma.$queryRaw<Array<{
    orgRole: string
    teacherPersona: boolean
    counselorPersona: boolean
  }>>`
    SELECT m."org_role" AS "orgRole",
      EXISTS (
        SELECT 1 FROM "organization_persona_grants" pg
        WHERE pg."organization_id" = m."organization_id"
          AND pg."membership_id" = m."id"
          AND pg."persona" = 'TEACHER'
          AND pg."revoked_at" IS NULL
      ) AS "teacherPersona",
      EXISTS (
        SELECT 1 FROM "organization_persona_grants" pg
        WHERE pg."organization_id" = m."organization_id"
          AND pg."membership_id" = m."id"
          AND pg."persona" = 'COUNSELOR'
          AND pg."revoked_at" IS NULL
      ) AS "counselorPersona"
    FROM "assessment_runs" r
    JOIN "organization_memberships" m
      ON m."organization_id" = r."organization_id"
      AND m."user_id" = ${input.actorUserId}
      AND m."valid_until" IS NULL
    WHERE r."organization_id" = ${input.organizationId}
      AND r."id" = ${input.runId}
    LIMIT 1
  `
  const row = rows[0]
  if (!row) {
    throw new RunResourceBoundaryError('RUN_PUBLISH_FORBIDDEN', 'current Organization publisher authority is required', 403)
  }
  if (row.orgRole !== 'ORG_ADMIN' && !row.teacherPersona && !row.counselorPersona) {
    throw new RunResourceBoundaryError('RUN_PUBLISH_FORBIDDEN', 'publisher requires ORG_ADMIN, TEACHER, or COUNSELOR authority', 403)
  }
}
