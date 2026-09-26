import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { assertOrganizationGroupReportGenerateAccess, type ReportingPrincipal } from './authorization'
import { assertOrganizationReportingWorkspaceAccess } from './pr4Authorization'
import { assertProtectedFeedbackManagerAccess } from './protectedFeedback'
import { readReportingSeries, readReportingSeriesWave } from './series'
import { getPublishedReportingSpec } from './spec'
import { ReportingError, type ReportingAnalysisKindV1, type ReportingAnalysisSpecDefinitionV1 } from './types'

const MAX_SERIES_WAVES = 100
const MAX_PROTECTED_SOURCE_CANDIDATES = 500
const MAX_PROTECTED_SOURCES = 100

export interface PublishedReportingSpecSummary {
  specId: string
  specKey: string
  version: number
  analysisKind: ReportingAnalysisKindV1
  engineKey: string
  reportEvidenceCeiling: string
  metricIds: string[]
  privacy: {
    minimumCohortN?: number
    minimumRespondentN?: number
    minimumContributorN: number
  }
  publishedAt: string | null
}

export interface ReportingSeriesDiscoveryItem {
  seriesId: string
  seriesKey: string
  scope: { schemaVersion: 1; resourceFamily: string; resourceKey: string }
  createdAt: string
  waveCount: number
  wavesTruncated: boolean
  waves: Array<{
    waveId: string
    waveKey: string
    ordinal: number
    source: { runId: string; trackId: string }
    createdAt: string
  }>
}

export interface ReportingSourceSummary {
  runId: string
  runName: string
  runStatus: string
  publishedAt: string | null
  trackId: string
  resource: { family: string; key: string; version: string }
}

export interface ProtectedReportingSourceSummary extends ReportingSourceSummary {
  subject: { userId: string; membershipId: string | null }
  relationshipKind: string
  perspective: 'SELF_REPORT' | 'OBSERVER_REPORT' | 'RELATIONAL_EXPERIENCE'
}

const specSummary = (input: Awaited<ReturnType<typeof getPublishedReportingSpec>>): PublishedReportingSpecSummary => {
  const definition: ReportingAnalysisSpecDefinitionV1 = input.definition
  const privacy = definition.analysisKind === 'PROTECTED_FEEDBACK'
    ? { minimumRespondentN: definition.minimumRespondentN, minimumContributorN: definition.minimumContributorN }
    : { minimumCohortN: definition.minimumCohortN, minimumContributorN: definition.minimumContributorN }
  return {
    specId: input.id,
    specKey: input.specKey,
    version: input.version,
    analysisKind: definition.analysisKind,
    engineKey: definition.engineKey,
    reportEvidenceCeiling: definition.reportEvidenceCeiling,
    metricIds: definition.metricRules.map((rule) => rule.metricId),
    privacy,
    publishedAt: input.publishedAt?.toISOString() ?? null,
  }
}

const hiddenReportingDenial = (error: unknown): boolean => (
  error instanceof ReportingError && error.statusCode === 404
)

export async function listPublishedReportingSpecs(input: {
  principal: ReportingPrincipal
  organizationId: string
  analysisKind?: ReportingAnalysisKindV1
  page: number
  pageSize: number
}) {
  await assertOrganizationReportingWorkspaceAccess(input)
  const offset = (input.page - 1) * input.pageSize
  const filter = input.analysisKind
    ? Prisma.sql`AND "definition"->>'analysisKind' = ${input.analysisKind}`
    : Prisma.empty
  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "reporting_analysis_specs"
      WHERE "status" = 'PUBLISHED' ${filter}
      ORDER BY "spec_key", "version" DESC, "id"
      LIMIT ${input.pageSize} OFFSET ${offset}
    `),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "reporting_analysis_specs"
      WHERE "status" = 'PUBLISHED' ${filter}
    `),
  ])
  const list = await Promise.all(rows.map(async (row) => specSummary(await getPublishedReportingSpec(row.id))))
  await assertOrganizationReportingWorkspaceAccess(input)
  return { list, total: totals[0]?.count ?? 0, page: input.page, pageSize: input.pageSize }
}

/**
 * Discover source Run/Tracks that satisfy the immutable generic cohort shape.
 * No population counts are returned: suppressed report projections intentionally
 * omit those counts, so discovery must not become a privacy side channel.
 */
export async function listOrganizationReportingSources(input: {
  principal: ReportingPrincipal
  organizationId: string
  page?: number
  pageSize?: number
}) {
  await assertOrganizationReportingWorkspaceAccess(input)
  const rows = await prisma.$queryRaw<Array<{
    runId: string
    runName: string
    runStatus: string
    publishedAt: Date | null
    trackId: string
    resourceFamily: string
    resourceKey: string
    resourceVersion: string
  }>>`
    SELECT
      r."id" AS "runId", r."name" AS "runName", r."status" AS "runStatus", r."published_at" AS "publishedAt",
      t."id" AS "trackId", t."resource_family" AS "resourceFamily", t."resource_key" AS "resourceKey",
      t."resource_version" AS "resourceVersion"
    FROM "assessment_runs" r
    JOIN "assessment_run_tracks" t
      ON t."organization_id"=r."organization_id" AND t."run_id"=r."id"
    JOIN "assessment_run_executions" e
      ON e."organization_id"=t."organization_id" AND e."run_id"=t."run_id" AND e."track_id"=t."id"
    JOIN "assessment_run_actor_snapshots" subject
      ON subject."organization_id"=e."organization_id" AND subject."run_id"=e."run_id" AND subject."id"=e."subject_actor_snapshot_id"
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."organization_id"=e."organization_id" AND respondent."run_id"=e."run_id" AND respondent."id"=e."respondent_actor_snapshot_id"
    JOIN "assessment_run_relationship_snapshots" relationship
      ON relationship."organization_id"=e."organization_id" AND relationship."run_id"=e."run_id" AND relationship."id"=e."relationship_snapshot_id"
    WHERE r."organization_id"=${input.organizationId}
      AND r."status" <> 'DRAFT'
      AND t."resource_family" <> 'FORM'
    GROUP BY r."id", r."name", r."status", r."published_at", r."created_at",
             t."id", t."resource_family", t."resource_key", t."resource_version"
    HAVING COUNT(e."id") > 0
      AND BOOL_AND(
        relationship."relationship_kind"='SELF'
        AND subject."user_id"=respondent."user_id"
        AND subject."membership_id" IS NOT NULL
      )
    ORDER BY r."published_at" DESC, r."id", t."id"
    LIMIT ${input.pageSize ?? 100} OFFSET ${((input.page ?? 1) - 1) * (input.pageSize ?? 100)}
  `
  const allowedRuns = new Map<string, boolean>()
  for (const runId of [...new Set(rows.map((row) => row.runId))]) {
    try {
      await assertOrganizationGroupReportGenerateAccess({ ...input, runId })
      allowedRuns.set(runId, true)
    } catch (error) {
      if (!hiddenReportingDenial(error)) throw error
      allowedRuns.set(runId, false)
    }
  }
  await assertOrganizationReportingWorkspaceAccess(input)
  return {
    list: rows.filter((row) => allowedRuns.get(row.runId)).map<ReportingSourceSummary>((row) => ({
      runId: row.runId,
      runName: row.runName,
      runStatus: row.runStatus,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      trackId: row.trackId,
      resource: { family: row.resourceFamily, key: row.resourceKey, version: row.resourceVersion },
    })),
    truncated: rows.length === (input.pageSize ?? 100),
    nextPage: rows.length === (input.pageSize ?? 100) ? (input.page ?? 1) + 1 : null,
  }
}

/**
 * Protected source discovery returns only frozen subject/source identity. It
 * never returns respondent identities or respondent counts; each candidate is
 * filtered through the same current subject-scoped manager authorization used
 * by PROTECTED_FEEDBACK generation.
 */
export async function listProtectedReportingSources(input: {
  principal: ReportingPrincipal
  organizationId: string
}) {
  await assertOrganizationReportingWorkspaceAccess(input)
  const rows = await prisma.$queryRaw<Array<{
    runId: string
    runName: string
    runStatus: string
    publishedAt: Date | null
    trackId: string
    resourceFamily: string
    resourceKey: string
    resourceVersion: string
    subjectUserId: string
    subjectMembershipId: string | null
    relationshipKind: string
    perspective: 'SELF_REPORT' | 'OBSERVER_REPORT' | 'RELATIONAL_EXPERIENCE'
  }>>`
    SELECT DISTINCT
      r."id" AS "runId", r."name" AS "runName", r."status" AS "runStatus", r."published_at" AS "publishedAt",
      t."id" AS "trackId", t."resource_family" AS "resourceFamily", t."resource_key" AS "resourceKey",
      t."resource_version" AS "resourceVersion", subject."user_id" AS "subjectUserId",
      subject."membership_id" AS "subjectMembershipId", relationship."relationship_kind" AS "relationshipKind",
      (t."requested_policy"->'perspectives'->>0)::text AS "perspective"
    FROM "assessment_runs" r
    JOIN "assessment_run_tracks" t
      ON t."organization_id"=r."organization_id" AND t."run_id"=r."id"
    JOIN "assessment_run_executions" e
      ON e."organization_id"=t."organization_id" AND e."run_id"=t."run_id" AND e."track_id"=t."id"
    JOIN "assessment_run_actor_snapshots" subject
      ON subject."organization_id"=e."organization_id" AND subject."run_id"=e."run_id" AND subject."id"=e."subject_actor_snapshot_id"
    JOIN "assessment_run_relationship_snapshots" relationship
      ON relationship."organization_id"=e."organization_id" AND relationship."run_id"=e."run_id" AND relationship."id"=e."relationship_snapshot_id"
    WHERE r."organization_id"=${input.organizationId}
      AND r."status" <> 'DRAFT'
      AND relationship."relationship_kind" <> 'SELF'
      AND (t."requested_policy"->'perspectives'->>0) IN ('SELF_REPORT','OBSERVER_REPORT','RELATIONAL_EXPERIENCE')
    ORDER BY r."published_at" DESC NULLS LAST, r."id", t."id", subject."user_id", relationship."relationship_kind"
    LIMIT ${MAX_PROTECTED_SOURCE_CANDIDATES}
  `
  const accessible: ProtectedReportingSourceSummary[] = []
  for (const row of rows) {
    try {
      await assertProtectedFeedbackManagerAccess({
        principal: input.principal,
        organizationId: input.organizationId,
        subjectUserId: row.subjectUserId,
      })
    } catch (error) {
      if (hiddenReportingDenial(error) || (error instanceof ReportingError && error.code === 'SUBJECT_EXCLUDED')) continue
      throw error
    }
    accessible.push({
      runId: row.runId,
      runName: row.runName,
      runStatus: row.runStatus,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      trackId: row.trackId,
      resource: { family: row.resourceFamily, key: row.resourceKey, version: row.resourceVersion },
      subject: { userId: row.subjectUserId, membershipId: row.subjectMembershipId },
      relationshipKind: row.relationshipKind,
      perspective: row.perspective,
    })
    if (accessible.length >= MAX_PROTECTED_SOURCES) break
  }
  await assertOrganizationReportingWorkspaceAccess(input)
  return {
    list: accessible,
    truncated: rows.length === MAX_PROTECTED_SOURCE_CANDIDATES || accessible.length >= MAX_PROTECTED_SOURCES,
  }
}

export async function listOrganizationReportingSeries(input: {
  principal: ReportingPrincipal
  organizationId: string
  page: number
  pageSize: number
}) {
  await assertOrganizationReportingWorkspaceAccess(input)
  const offset = (input.page - 1) * input.pageSize
  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; waveCount: number }>>`
      SELECT s."id", COUNT(w."id")::int AS "waveCount"
      FROM "reporting_series" s
      LEFT JOIN "reporting_series_waves" w
        ON w."organization_id" = s."organization_id" AND w."series_id" = s."id"
      WHERE s."organization_id" = ${input.organizationId}
      GROUP BY s."id", s."created_at"
      ORDER BY s."created_at" DESC, s."id"
      LIMIT ${input.pageSize} OFFSET ${offset}
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM "reporting_series"
      WHERE "organization_id" = ${input.organizationId}
    `,
  ])
  const seriesIds = rows.map((row) => row.id)
  const waveKeys = seriesIds.length === 0 ? [] : await prisma.$queryRaw<Array<{ seriesId: string; waveKey: string }>>(Prisma.sql`
    SELECT "seriesId", "waveKey"
    FROM (
      SELECT
        "series_id" AS "seriesId",
        "wave_key" AS "waveKey",
        ROW_NUMBER() OVER (PARTITION BY "series_id" ORDER BY "ordinal", "created_at", "id") AS rn
      FROM "reporting_series_waves"
      WHERE "organization_id" = ${input.organizationId}
        AND "series_id" IN (${Prisma.join(seriesIds)})
    ) ranked
    WHERE rn <= ${MAX_SERIES_WAVES}
    ORDER BY "seriesId", rn
  `)
  const keysBySeries = new Map<string, string[]>()
  for (const row of waveKeys) {
    const current = keysBySeries.get(row.seriesId) ?? []
    current.push(row.waveKey)
    keysBySeries.set(row.seriesId, current)
  }
  const list: ReportingSeriesDiscoveryItem[] = await Promise.all(rows.map(async (row) => {
    const series = await readReportingSeries(row.id)
    const waves = await Promise.all((keysBySeries.get(row.id) ?? []).map((waveKey) => readReportingSeriesWave({
      organizationId: input.organizationId,
      seriesId: row.id,
      waveKey,
    })))
    return {
      seriesId: series.id,
      seriesKey: series.seriesKey,
      scope: series.scope,
      createdAt: series.createdAt.toISOString(),
      waveCount: row.waveCount,
      wavesTruncated: row.waveCount > waves.length,
      waves: waves.map((wave) => ({
        waveId: wave.id,
        waveKey: wave.waveKey,
        ordinal: wave.ordinal,
        source: { runId: wave.sourceRunId, trackId: wave.sourceTrackId },
        createdAt: wave.createdAt.toISOString(),
      })),
    }
  }))
  await assertOrganizationReportingWorkspaceAccess(input)
  return { list, total: totals[0]?.count ?? 0, page: input.page, pageSize: input.pageSize, maxWavesPerSeries: MAX_SERIES_WAVES }
}

/** Reporting metadata only; no assignments, member identities, or counts. */
export async function listReportingCohortOptions(input: { principal: ReportingPrincipal; organizationId: string }) {
  await assertOrganizationReportingWorkspaceAccess(input)
  const classes = await prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT id, name FROM organization_units WHERE organization_id=${input.organizationId} AND unit_kind='CLASS' ORDER BY name, id`
  const dimensions = await prisma.$queryRaw<Array<{ id: string; key: string; name: string }>>`SELECT id, key, name FROM organization_classification_dimensions WHERE organization_id=${input.organizationId} ORDER BY name, id`
  const labels = await prisma.$queryRaw<Array<{ id: string; dimensionId: string; name: string }>>`SELECT id, dimension_id AS "dimensionId", name FROM organization_labels WHERE organization_id=${input.organizationId} ORDER BY name, id`
  await assertOrganizationReportingWorkspaceAccess(input)
  return { classes, dimensions, labels }
}
