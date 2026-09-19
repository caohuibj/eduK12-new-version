import { prisma } from '../../config/database'
import { AssessmentRunRepositoryError, type AssessmentRunStatus } from './repository'

export interface AssessmentRunProductListItem {
  id: string
  organizationId: string
  name: string
  status: AssessmentRunStatus
  version: number
  createdByUserId: string
  intakeDeadline: Date | null
  publishedAt: Date | null
  closedAt: Date | null
  cancelledAt: Date | null
  createdAt: Date
  updatedAt: Date
  trackCount: number
  executionCount: number
}

export interface AssessmentRunProductTrack {
  id: string
  resourceFamily: string
  resourceKey: string
  resourceVersion: string
  subjectSelector: unknown
  respondentSelector: unknown
  requestedPolicy: unknown
  frozenResourcePolicy: unknown | null
  resourcePolicyHash: string | null
}

export interface AssessmentRunFrozenActorSummary {
  provenanceKind: string
  actorRole: string
  count: number
}

export interface AssessmentRunFrozenRelationshipSummary {
  relationshipKind: string
  count: number
}

export interface AssessmentRunExecutionSummary {
  status: string
  count: number
}

export interface AssessmentRunProductDetail {
  run: AssessmentRunProductListItem
  tracks: AssessmentRunProductTrack[]
  frozenPopulation: {
    actors: AssessmentRunFrozenActorSummary[]
    relationships: AssessmentRunFrozenRelationshipSummary[]
  }
  executions: AssessmentRunExecutionSummary[]
}

const runSelect = `
  r."id", r."organization_id" AS "organizationId", r."name", r."status", r."version",
  r."created_by_user_id" AS "createdByUserId", r."intake_deadline" AS "intakeDeadline",
  r."published_at" AS "publishedAt", r."closed_at" AS "closedAt", r."cancelled_at" AS "cancelledAt",
  r."created_at" AS "createdAt", r."updated_at" AS "updatedAt",
  COUNT(DISTINCT t."id")::int AS "trackCount",
  COUNT(DISTINCT e."id")::int AS "executionCount"
`

export async function listAssessmentRunProducts(input: {
  organizationId: string
  page: number
  pageSize: number
  status?: AssessmentRunStatus
}): Promise<{ list: AssessmentRunProductListItem[]; total: number; page: number; pageSize: number }> {
  const offset = (input.page - 1) * input.pageSize
  const whereStatus = input.status ? 'AND r."status" = $4' : ''
  const params = input.status
    ? [input.organizationId, input.pageSize, offset, input.status]
    : [input.organizationId, input.pageSize, offset]
  const list = await prisma.$queryRawUnsafe<AssessmentRunProductListItem[]>(
    `SELECT ${runSelect}
     FROM "assessment_runs" r
     LEFT JOIN "assessment_run_tracks" t
       ON t."organization_id" = r."organization_id" AND t."run_id" = r."id"
     LEFT JOIN "assessment_run_executions" e
       ON e."organization_id" = r."organization_id" AND e."run_id" = r."id"
     WHERE r."organization_id" = $1 ${whereStatus}
     GROUP BY r."id"
     ORDER BY r."created_at" DESC, r."id" DESC
     LIMIT $2 OFFSET $3`,
    ...params,
  )
  const totals = input.status
    ? await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count"
        FROM "assessment_runs"
        WHERE "organization_id" = ${input.organizationId} AND "status" = ${input.status}
      `
    : await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count"
        FROM "assessment_runs"
        WHERE "organization_id" = ${input.organizationId}
      `
  return { list, total: totals[0]?.count ?? 0, page: input.page, pageSize: input.pageSize }
}

export async function readAssessmentRunProduct(
  organizationId: string,
  runId: string,
): Promise<AssessmentRunProductDetail> {
  const runs = await prisma.$queryRawUnsafe<AssessmentRunProductListItem[]>(
    `SELECT ${runSelect}
     FROM "assessment_runs" r
     LEFT JOIN "assessment_run_tracks" t
       ON t."organization_id" = r."organization_id" AND t."run_id" = r."id"
     LEFT JOIN "assessment_run_executions" e
       ON e."organization_id" = r."organization_id" AND e."run_id" = r."id"
     WHERE r."organization_id" = $1 AND r."id" = $2
     GROUP BY r."id"`,
    organizationId,
    runId,
  )
  const run = runs[0]
  if (!run) throw new AssessmentRunRepositoryError('RUN_NOT_FOUND', 'Run not found', 404)

  const [tracks, actors, relationships, executions] = await Promise.all([
    prisma.$queryRaw<AssessmentRunProductTrack[]>`
      SELECT "id", "resource_family" AS "resourceFamily", "resource_key" AS "resourceKey",
             "resource_version" AS "resourceVersion", "subject_selector" AS "subjectSelector",
             "respondent_selector" AS "respondentSelector", "requested_policy" AS "requestedPolicy",
             "frozen_resource_policy" AS "frozenResourcePolicy", "resource_policy_hash" AS "resourcePolicyHash"
      FROM "assessment_run_tracks"
      WHERE "organization_id" = ${organizationId} AND "run_id" = ${runId}
      ORDER BY "created_at", "id"
    `,
    prisma.$queryRaw<AssessmentRunFrozenActorSummary[]>`
      SELECT "provenance_kind" AS "provenanceKind", "actor_role" AS "actorRole", COUNT(*)::int AS "count"
      FROM "assessment_run_actor_snapshots"
      WHERE "organization_id" = ${organizationId} AND "run_id" = ${runId}
      GROUP BY "provenance_kind", "actor_role"
      ORDER BY "provenance_kind", "actor_role"
    `,
    prisma.$queryRaw<AssessmentRunFrozenRelationshipSummary[]>`
      SELECT "relationship_kind" AS "relationshipKind", COUNT(*)::int AS "count"
      FROM "assessment_run_relationship_snapshots"
      WHERE "organization_id" = ${organizationId} AND "run_id" = ${runId}
      GROUP BY "relationship_kind"
      ORDER BY "relationship_kind"
    `,
    prisma.$queryRaw<AssessmentRunExecutionSummary[]>`
      SELECT "status", COUNT(*)::int AS "count"
      FROM "assessment_run_executions"
      WHERE "organization_id" = ${organizationId} AND "run_id" = ${runId}
      GROUP BY "status"
      ORDER BY "status"
    `,
  ])

  return {
    run,
    tracks,
    frozenPopulation: { actors, relationships },
    executions,
  }
}
