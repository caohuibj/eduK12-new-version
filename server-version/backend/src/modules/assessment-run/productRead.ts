import { Prisma } from '@prisma/client'
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
  (SELECT COUNT(*)::int FROM "assessment_run_tracks" t WHERE t."organization_id" = r."organization_id" AND t."run_id" = r."id") AS "trackCount",
  (SELECT COUNT(*)::int FROM "assessment_run_executions" e WHERE e."organization_id" = r."organization_id" AND e."run_id" = r."id") AS "executionCount"
`

export async function listAssessmentRunProducts(input: {
  organizationId: string
  page: number
  pageSize: number
  status?: AssessmentRunStatus
  /** Scoped professionals see only campaigns they created; ORG_ADMIN omits this filter. */
  createdByUserId?: string
}): Promise<{ list: AssessmentRunProductListItem[]; total: number; page: number; pageSize: number }> {
  const offset = (input.page - 1) * input.pageSize
  const ownerFilter = input.createdByUserId ?? null
  const statusFilter = input.status ?? null
  const list = await prisma.$queryRaw<AssessmentRunProductListItem[]>`
    SELECT ${Prisma.raw(runSelect)}
    FROM "assessment_runs" r
    WHERE r."organization_id" = ${input.organizationId}
      AND (${ownerFilter}::text IS NULL OR r."created_by_user_id" = ${ownerFilter})
      AND (${statusFilter}::text IS NULL OR r."status" = ${statusFilter})
    ORDER BY r."created_at" DESC, r."id" DESC
    LIMIT ${input.pageSize} OFFSET ${offset}
  `
  const totals = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS "count"
    FROM "assessment_runs" r
    WHERE r."organization_id" = ${input.organizationId}
      AND (${ownerFilter}::text IS NULL OR r."created_by_user_id" = ${ownerFilter})
      AND (${statusFilter}::text IS NULL OR r."status" = ${statusFilter})
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
     WHERE r."organization_id" = $1 AND r."id" = $2`,
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

/** Assigned-respondent inbox: no tenant navigation, subjects or other respondents. */
export async function listAssignedRunTasks(userId: string) {
  const list = await prisma.$queryRaw<Array<{
    executionId: string; organizationId: string; runId: string; runName: string;
    subjectUserId: string; subjectRole: string; subjectName: string; respondentRole: string; relationship: string; perspective: string; deadline: Date | null;
    runStatus: string; status: string; claimState: string | null;
    resourceFamily: string; resourceKey: string; resourceVersion: string;
    reportAttemptId: string | null; consentRequired: boolean; consentPurpose: string | null; consentVisibility: string | null;
  }>>`
    SELECT e."id" AS "executionId", e."organization_id" AS "organizationId", e."run_id" AS "runId",
      r."name" AS "runName", r."status" AS "runStatus", r."intake_deadline" AS "deadline",
      subject."user_id" AS "subjectUserId", subject."actor_role" AS "subjectRole", subject_user."username" AS "subjectName", respondent."actor_role" AS "respondentRole",
      a."relationship_kind" AS "relationship", a."perspective" AS "perspective",
      CASE WHEN ca."status" = 'COMPLETED' THEN 'COMPLETED' ELSE e."status" END AS "status",
      c."state" AS "claimState", t."resource_family" AS "resourceFamily",
      t."resource_key" AS "resourceKey", t."resource_version" AS "resourceVersion",
      (a."consent_id" IS NOT NULL) AS "consentRequired",
      consent."purpose" AS "consentPurpose", consent."visibility_scope" AS "consentVisibility",
      CASE WHEN ca."status" = 'COMPLETED' AND a."analysis_mode" = 'INDIVIDUAL_ONLY'
        AND a."perspective" <> 'RELATIONAL_EXPERIENCE'
        THEN ca."id" ELSE NULL END AS "reportAttemptId"
    FROM "assessment_run_executions" e
    JOIN "assessment_run_actor_snapshots" respondent ON respondent."id" = e."respondent_actor_snapshot_id"
      AND respondent."organization_id" = e."organization_id" AND respondent."run_id" = e."run_id"
    JOIN "assessment_run_actor_snapshots" subject ON subject."id" = e."subject_actor_snapshot_id" AND subject."organization_id" = e."organization_id"
    JOIN "users" subject_user ON subject_user."id" = subject."user_id"
    JOIN "assessment_runs" r ON r."id" = e."run_id" AND r."organization_id" = e."organization_id"
    JOIN "assessment_run_tracks" t ON t."id" = e."track_id" AND t."organization_id" = e."organization_id"
    LEFT JOIN "assessment_run_execution_start_claims" c ON c."execution_id" = e."id"
    LEFT JOIN "relational_assessment_assignments" a ON a."id" = e."relational_assignment_id"
    LEFT JOIN "composite_assessment_attempts" ca ON e."runtime_binding_kind" = 'COMPOSITE'
      AND ca."id" = e."runtime_binding_ref" AND ca."user_id" = ${userId}
    LEFT JOIN "assessment_attempt_consents" consent ON consent."id" = a."consent_id"
    WHERE respondent."user_id" = ${userId}
      AND NOT EXISTS (SELECT 1 FROM "organization_access_denies" d
        WHERE d."organization_id" = e."organization_id" AND d."user_id" = ${userId}
          AND d."lifted_at" IS NULL AND d."permission" IN ('*', 'RUN_START'))
    ORDER BY e."created_at" DESC, e."id" DESC LIMIT 101
  `
  return { list: list.slice(0, 100), truncated: list.length > 100 }
}
