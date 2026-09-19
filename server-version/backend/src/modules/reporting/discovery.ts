import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { ReportingPrincipal } from './authorization'
import { assertOrganizationReportingWorkspaceAccess } from './pr4Authorization'
import { readReportingSeries, readReportingSeriesWave } from './series'
import { getPublishedReportingSpec } from './spec'
import type { ReportingAnalysisKindV1, ReportingAnalysisSpecDefinitionV1 } from './types'

const MAX_SERIES_WAVES = 100

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
