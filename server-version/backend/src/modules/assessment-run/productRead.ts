import { boundCompositeContinuationSql } from './boundCompositeContinuation'
import { Prisma } from '@prisma/client'
import { currentRunPopulationAuthoritySql } from './currentPopulationAuthority'
import {completedSchoolOrdinaryFeedbackSql} from './completedSchoolFeedback'
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
  title?:string
  sourceRevision?:number
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
      SELECT t."id",t."resource_family" AS "resourceFamily",t."resource_key" AS "resourceKey",
        t."resource_version" AS "resourceVersion",t."subject_selector" AS "subjectSelector",
        t."respondent_selector" AS "respondentSelector",t."requested_policy" AS "requestedPolicy",
        t."frozen_resource_policy" AS "frozenResourcePolicy",t."resource_policy_hash" AS "resourcePolicyHash",
        v.title,v.source_revision AS "sourceRevision"
      FROM "assessment_run_tracks" t LEFT JOIN education_private_tool_versions v ON v.id=split_part(t.resource_key,':',3)
       AND v.organization_id=t.organization_id AND v.kind='COMPOSITION' AND t.resource_family='BUNDLE'
       AND t.resource_key='education-composition:'||v.entry||':'||v.id||':'||(v.definition#>>'{administration,population}')||':'||(v.definition#>>'{administration,responseMode}')||':1.0.0'
      WHERE t."organization_id" = ${organizationId} AND t."run_id" = ${runId}
      ORDER BY t."created_at",t."id"
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
    tracks:tracks.map(({title,sourceRevision,...track})=>title==null?track:{...track,title,sourceRevision}),
    frozenPopulation: { actors, relationships },
    executions,
  }
}

/** Keyset cursor for run-task pagination: the (created_at, id) pair of the
 * last row of the previous page, in the reader's ORDER BY
 * (created_at DESC, id DESC). The wire form is an opaque base64url JSON
 * string; it is a page bookmark, not a capability, so it is unsigned.
 *
 * createdAt MUST carry the full TIMESTAMPTZ(6) microsecond precision
 * (e.g. `2026-11-06T12:00:00.123456Z`). A JavaScript Date only holds
 * milliseconds: building the cursor from `Date.toISOString()` truncates
 * `12:00:00.123456` to `12:00:00.123`, and the next page's
 * `(created_at, id) < (cursor, id)` comparison then excludes every
 * remaining row sharing the original microsecond timestamp — which is the
 * normal case, because a Run publish inserts all its executions in one
 * transaction and CURRENT_TIMESTAMP is the transaction start. The cursor
 * is therefore sourced from PostgreSQL itself
 * (`to_char(created_at AT TIME ZONE 'UTC', ...US...)`) and passed back to
 * PostgreSQL as a timestamptz parameter, never through a Date. */
export interface RunTaskCursor { createdAt: string; id: string }

const MICROSECOND_CURSOR_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3})(\d{3})?Z$/

/** Canonicalize a cursor timestamp to six fractional digits. A legacy
 * three-digit (millisecond) value is zero-padded; anything else is rejected.
 *
 * The calendar is validated component by component. `new Date()` must NOT
 * be used here: it normalizes nonexistent dates (2026-02-31 becomes
 * 2026-03-03) instead of rejecting them, and the original string would
 * then reach PostgreSQL's ::timestamptz, which rejects it — surfacing as
 * HTTP 500 instead of the promised 400 for a bad cursor. The microsecond
 * digits are kept verbatim (never rebuilt from a Date). Year 0000 is also
 * rejected: PostgreSQL's timestamptz range starts at year 0001. */
function canonicalCursorTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = MICROSECOND_CURSOR_TIMESTAMP.exec(value)
  if (!match) return null
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0] = match[1].split(/[-T:]/).map(Number)
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!
  if (day < 1 || day > daysInMonth) return null
  return `${match[1]}.${match[2]}${match[3] ?? '000'}Z`
}

export function encodeRunTaskCursor(cursor: RunTaskCursor): string {
  const createdAt = canonicalCursorTimestamp(cursor.createdAt)
  if (typeof cursor.id !== 'string' || !cursor.id || createdAt === null)
    throw new Error('RUN_TASK_CURSOR_INVALID')
  return Buffer.from(JSON.stringify({ createdAt, id: cursor.id })).toString('base64url')
}

export function decodeRunTaskCursor(value: unknown): RunTaskCursor | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > 500) throw new Error('RUN_TASK_CURSOR_INVALID')
  let parsed: unknown
  try { parsed = JSON.parse(Buffer.from(value, 'base64url').toString()) }
  catch { throw new Error('RUN_TASK_CURSOR_INVALID') }
  const createdAt = canonicalCursorTimestamp((parsed as { createdAt?: unknown } | null)?.createdAt)
  const id = (parsed as { id?: unknown } | null)?.id
  if (typeof id !== 'string' || !id || createdAt === null) throw new Error('RUN_TASK_CURSOR_INVALID')
  return { createdAt, id }
}

/** Exact respondent tasks with their assigned subject; no peer respondents, answers or scores. */
export async function listAssignedRunTasks(userId: string, options?: {
  runIds?: string[]
  /** DB-side allowlist: only these executions are returned. The teacher task
   * list uses it so non-eligible executions cannot consume the reader's
   * top-100 slots (A-01). */
  executionIds?: string[]
  /** Keyset page bookmark from a previous response's nextCursor. */
  cursor?: RunTaskCursor
  /** Page size, default 100, hard-capped at 100. Pagination, not a raise. */
  limit?: number
  /** Campus inbox only: restore an already bound attempt, never new admission. */
  preserveBoundSchoolContinuation?: boolean
  /** Own completed ordinary observer feedback; does not authorize collection. */
  includeCompletedSchoolFeedback?: boolean
}) {
  if(options?.runIds && options.runIds.length===0) return { list:[], truncated:false, nextCursor:null as RunTaskCursor | null }
  if(options?.executionIds && options.executionIds.length===0) return { list:[], truncated:false, nextCursor:null as RunTaskCursor | null }
  const limit = Math.min(100, Math.max(1, Math.floor(options?.limit ?? 100)))
  // The cursor timestamp is a microsecond ISO string, validated by the
  // canonicalizer; it is passed to PostgreSQL as a timestamptz parameter so
  // the comparison keeps full TIMESTAMPTZ(6) precision. Never route it
  // through a JavaScript Date here: that truncates to milliseconds and
  // drops same-microsecond rows from later pages.
  const cursorCreatedAt = options?.cursor ? canonicalCursorTimestamp(options.cursor.createdAt) : null
  if (options?.cursor && (cursorCreatedAt === null || !options.cursor.id))
    throw new Error('RUN_TASK_CURSOR_INVALID')
  const runScope=options?.runIds
    ? Prisma.sql`AND r."id" IN (${Prisma.join(options.runIds)})`
    : Prisma.empty
  const executionScope=options?.executionIds
    ? Prisma.sql`AND e."id" IN (${Prisma.join(options.executionIds)})`
    : Prisma.empty
  const cursorScope=cursorCreatedAt
    ? Prisma.sql`AND (e."created_at", e."id") < (${cursorCreatedAt}::timestamptz, ${options!.cursor!.id})`
    : Prisma.empty
  const schoolScope = options?.preserveBoundSchoolContinuation
    ? Prisma.sql`(EXISTS (SELECT 1 FROM "campus_activity_runs" ar
        JOIN "campus_activities" activity ON activity."organization_id"=ar."organization_id"
          AND activity."course_id"=ar."course_id" AND activity."status"='OPEN'
        WHERE ar."organization_id"=e."organization_id" AND ar."run_id"=e."run_id")
      AND NOT EXISTS (SELECT 1 FROM "huiteacher_evaluation_run_links" h
        WHERE h."organization_id"=e."organization_id" AND h."run_id"=e."run_id"))`
    : Prisma.sql`FALSE`
  const schoolContinuation = options?.preserveBoundSchoolContinuation
    ? Prisma.sql`(${schoolScope} AND r."status" IN ('PUBLISHED','CLOSED')
      AND ${boundCompositeContinuationSql(Prisma.sql`e."id"`, userId)})`
    : Prisma.sql`FALSE`
  const closedScope = options?.preserveBoundSchoolContinuation
    ? Prisma.sql`(r."status" <> 'CLOSED' OR NOT ${schoolScope} OR ${schoolContinuation})`
    : Prisma.sql`TRUE`
  const completedSchoolFeedback=options?.includeCompletedSchoolFeedback
    ? completedSchoolOrdinaryFeedbackSql(Prisma.sql`e."id"`,userId)
    : Prisma.sql`FALSE`
  const list = await prisma.$queryRaw<Array<{
    __boundSchoolContinuation: boolean; createdAtMicros: string;
    executionId: string; organizationId: string; runId: string; runName: string;
    subjectUserId: string; subjectRole: string; subjectName: string; respondentRole: string; relationship: string; perspective: string; deadline: Date | null;
    runStatus: string; status: string; claimState: string | null;
    resourceFamily: string; resourceKey: string; resourceVersion: string;
    governedReport: boolean; reportAttemptId: string | null; consentRequired: boolean; consentPurpose: string | null; consentVisibility: string | null;
  }>>`
    SELECT ${schoolContinuation} AS "__boundSchoolContinuation",
      to_char(e."created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAtMicros",
      e."id" AS "executionId", e."organization_id" AS "organizationId", e."run_id" AS "runId",
      r."name" AS "runName", r."status" AS "runStatus", r."intake_deadline" AS "deadline",
      subject."user_id" AS "subjectUserId", subject."actor_role" AS "subjectRole", subject_user."username" AS "subjectName", respondent."actor_role" AS "respondentRole",
      a."relationship_kind" AS "relationship", a."perspective" AS "perspective",
      (t."frozen_resource_policy" ? 'resultDisclosure') AS "governedReport",
      CASE WHEN ca."status" = 'COMPLETED' THEN 'COMPLETED'
        WHEN r."status" = 'CANCELLED' THEN 'CANCELLED'
        WHEN e."status" IN ('REVOKED', 'EXPIRED', 'CANCELLED', 'COMPLETED') THEN e."status"
        WHEN ${schoolContinuation} AND r."status" IN ('PUBLISHED','CLOSED') THEN 'STARTED'
        WHEN r."status" = 'CLOSED' OR r."intake_deadline" <= statement_timestamp() THEN 'EXPIRED'
        ELSE e."status" END AS "status",
      c."state" AS "claimState", t."resource_family" AS "resourceFamily",
      t."resource_key" AS "resourceKey", t."resource_version" AS "resourceVersion",
      (a."consent_id" IS NOT NULL) AS "consentRequired",
      consent."purpose" AS "consentPurpose", consent."visibility_scope" AS "consentVisibility",
      CASE WHEN ca."status" = 'COMPLETED' AND a."analysis_mode" = 'INDIVIDUAL_ONLY'
        AND a."perspective" <> 'RELATIONAL_EXPERIENCE' AND NOT (t."frozen_resource_policy" ? 'resultDisclosure')
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
      ${runScope}
      ${executionScope}
      ${cursorScope}
      AND ((${closedScope}
      AND ${currentRunPopulationAuthoritySql(Prisma.sql`e."id"`)}
      AND NOT EXISTS (SELECT 1 FROM "organization_access_denies" d
        WHERE d."organization_id" = e."organization_id" AND d."user_id" = ${userId}
          AND d."lifted_at" IS NULL AND d."permission" IN ('*', 'RUN_START')))
        OR ${completedSchoolFeedback})
    ORDER BY e."created_at" DESC, e."id" DESC LIMIT ${limit + 1}
  `
  const page = list.slice(0, limit)
  const last = page[page.length - 1]
  return {
    list: page.map(({__boundSchoolContinuation, createdAtMicros: _createdAtMicros, ...task})=>({
      ...task,...(__boundSchoolContinuation?{canResumeExisting:true}:{}),
    })),
    truncated: list.length > limit,
    nextCursor: list.length > limit && last
      ? { createdAt: last.createdAtMicros, id: last.executionId }
      : null,
  }
}
