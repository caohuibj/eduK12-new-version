import { individualSubjectScope } from './individualAuthorization'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { type ReportingPrincipal } from './authorization'
import { assertOrganizationReportingWorkspaceAccess, resolveOrganizationReportingWorkspaceContext } from './pr4Authorization'
import { resolveProtectedFeedbackManagerContext } from './protectedFeedback'
import { readReportingSeriesBatch, readReportingSeriesWavesBatch } from './series'
import { getPublishedReportingSpec } from './spec'
import { type ReportingAnalysisKindV1, type ReportingAnalysisSpecDefinitionV1 } from './types'

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
    minimumContributorN?: number
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
  const privacy = definition.analysisKind === 'INDIVIDUAL_LONGITUDINAL' ? {} : definition.analysisKind === 'PROTECTED_FEEDBACK'
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
  await (input.analysisKind === 'INDIVIDUAL_LONGITUDINAL' ? individualSubjectScope(input) : assertOrganizationReportingWorkspaceAccess(input))
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
  await (input.analysisKind === 'INDIVIDUAL_LONGITUDINAL' ? individualSubjectScope(input) : assertOrganizationReportingWorkspaceAccess(input))
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
  const context = await resolveOrganizationReportingWorkspaceContext(input)
  const organizationManager = context.orgRole === 'ORG_ADMIN' || context.capabilities.includes('PSYCHOLOGY_STAFF')
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
      AND (${organizationManager} OR r."created_by_user_id"=${input.principal.userId})
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
  await assertOrganizationReportingWorkspaceAccess(input)
  return {
    list: rows.map<ReportingSourceSummary>((row) => ({
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
  const context = await resolveProtectedFeedbackManagerContext(input)
  // In SCHOOL a psychology capability is required just to enter this workflow;
  // it does NOT turn the counselor into a school-wide subject enumerator.
  // Dual TEACHER+COUNSELOR personas must use the current CLIENT relationship,
  // never the broader same-class teacher path. LEGACY semantics are unchanged.
  const school = context.productDomain === 'SCHOOL'
  const organizationManager = !school && (context.orgRole === 'ORG_ADMIN' || context.capabilities.includes('PSYCHOLOGY_STAFF'))
  const teacher = !school && context.personas.includes('TEACHER')
  const counselor = context.personas.includes('COUNSELOR')
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
      AND subject."user_id" <> ${input.principal.userId}
      AND (t."requested_policy"->'perspectives'->>0) IN ('SELF_REPORT','OBSERVER_REPORT','RELATIONAL_EXPERIENCE')
      AND (
        ${organizationManager}
        OR (${teacher} AND EXISTS (
          SELECT 1
          FROM "organization_memberships" current_subject
          JOIN "organization_persona_grants" subject_persona
            ON subject_persona."organization_id"=current_subject."organization_id"
           AND subject_persona."membership_id"=current_subject."id"
           AND subject_persona."persona"='STUDENT'
           AND subject_persona."revoked_at" IS NULL
          JOIN "organization_student_class_assignments" student
            ON student."organization_id"=current_subject."organization_id"
           AND student."membership_id"=current_subject."id"
           AND student."valid_from" <= statement_timestamp()
           AND (student."valid_until" IS NULL OR student."valid_until" > statement_timestamp())
          JOIN "organization_staff_class_assignments" staff
            ON staff."organization_id"=student."organization_id"
           AND staff."class_unit_id"=student."class_unit_id"
           AND staff."membership_id"=${context.membershipId}
           AND staff."valid_from" <= statement_timestamp()
           AND (staff."valid_until" IS NULL OR staff."valid_until" > statement_timestamp())
          WHERE current_subject."organization_id"=${input.organizationId}
            AND current_subject."user_id"=subject."user_id"
            AND current_subject."valid_from" <= statement_timestamp()
            AND (current_subject."valid_until" IS NULL OR current_subject."valid_until" > statement_timestamp())
        ))
        OR (${counselor} AND EXISTS (
          SELECT 1
          FROM "organization_memberships" current_subject
          JOIN "organization_persona_grants" subject_persona
            ON subject_persona."organization_id"=current_subject."organization_id"
           AND subject_persona."membership_id"=current_subject."id"
           AND subject_persona."persona"='CLIENT'
           AND subject_persona."revoked_at" IS NULL
          JOIN "organization_counselor_client_relationships" relation
            ON relation."organization_id"=current_subject."organization_id"
           AND relation."client_membership_id"=current_subject."id"
           AND relation."counselor_membership_id"=${context.membershipId}
           AND relation."valid_from" <= statement_timestamp()
           AND (relation."valid_until" IS NULL OR relation."valid_until" > statement_timestamp())
          WHERE current_subject."organization_id"=${input.organizationId}
            AND current_subject."user_id"=subject."user_id"
            AND current_subject."valid_from" <= statement_timestamp()
            AND (current_subject."valid_until" IS NULL OR current_subject."valid_until" > statement_timestamp())
        ))
      )
    ORDER BY r."published_at" DESC NULLS LAST, r."id", t."id", subject."user_id", relationship."relationship_kind"
    LIMIT ${MAX_PROTECTED_SOURCE_CANDIDATES}
  `
  await resolveProtectedFeedbackManagerContext(input)
  await assertOrganizationReportingWorkspaceAccess(input)
  const list = rows.slice(0, MAX_PROTECTED_SOURCES).map<ProtectedReportingSourceSummary>((row) => ({
    runId: row.runId,
    runName: row.runName,
    runStatus: row.runStatus,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    trackId: row.trackId,
    resource: { family: row.resourceFamily, key: row.resourceKey, version: row.resourceVersion },
    subject: { userId: row.subjectUserId, membershipId: row.subjectMembershipId },
    relationshipKind: row.relationshipKind,
    perspective: row.perspective,
  }))
  return {
    list,
    truncated: rows.length === MAX_PROTECTED_SOURCE_CANDIDATES || rows.length > MAX_PROTECTED_SOURCES,
  }
}

export async function listOrganizationReportingSeries(input: {
  principal: ReportingPrincipal
  organizationId: string
  page: number
  pageSize: number
}) {
  const context = await resolveOrganizationReportingWorkspaceContext(input)
  const organizationManager = context.orgRole === 'ORG_ADMIN' || context.capabilities.includes('PSYCHOLOGY_STAFF')
  const seriesScope = organizationManager ? Prisma.empty : Prisma.sql`AND s."created_by_user_id"=${input.principal.userId}`
  const countScope = organizationManager ? Prisma.empty : Prisma.sql`AND "created_by_user_id"=${input.principal.userId}`
  const offset = (input.page - 1) * input.pageSize
  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; waveCount: number }>>(Prisma.sql`
      SELECT s."id", COUNT(w."id")::int AS "waveCount"
      FROM "reporting_series" s
      LEFT JOIN "reporting_series_waves" w
        ON w."organization_id" = s."organization_id" AND w."series_id" = s."id"
      WHERE s."organization_id" = ${input.organizationId} AND s."series_key" NOT LIKE 'AUTO-IND-V1:%' ${seriesScope}
      GROUP BY s."id", s."created_at"
      ORDER BY s."created_at" DESC, s."id"
      LIMIT ${input.pageSize} OFFSET ${offset}
    `),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "reporting_series"
      WHERE "organization_id" = ${input.organizationId} AND "series_key" NOT LIKE 'AUTO-IND-V1:%' ${countScope}
    `),
  ])
  const seriesIds = rows.map((row) => row.id)
  const [seriesRecords, waves] = await Promise.all([
    readReportingSeriesBatch({ organizationId: input.organizationId, seriesIds }),
    readReportingSeriesWavesBatch({ organizationId: input.organizationId, seriesIds, maxPerSeries: MAX_SERIES_WAVES }),
  ])
  const seriesById = new Map(seriesRecords.map((series) => [series.id, series]))
  const wavesBySeries = new Map<string, typeof waves>()
  for (const wave of waves) {
    const current = wavesBySeries.get(wave.seriesId) ?? []
    current.push(wave)
    wavesBySeries.set(wave.seriesId, current)
  }
  const list: ReportingSeriesDiscoveryItem[] = rows.map((row) => {
    const series = seriesById.get(row.id)
    if (!series) throw new Error('verified reporting series missing from batch')
    const seriesWaves = wavesBySeries.get(row.id) ?? []
    return {
      seriesId: series.id,
      seriesKey: series.seriesKey,
      scope: series.scope,
      createdAt: series.createdAt.toISOString(),
      waveCount: row.waveCount,
      wavesTruncated: row.waveCount > seriesWaves.length,
      waves: seriesWaves.map((wave) => ({
        waveId: wave.id,
        waveKey: wave.waveKey,
        ordinal: wave.ordinal,
        source: { runId: wave.sourceRunId, trackId: wave.sourceTrackId },
        createdAt: wave.createdAt.toISOString(),
      })),
    }
  })
  await assertOrganizationReportingWorkspaceAccess(input)
  return { list, total: totals[0]?.count ?? 0, page: input.page, pageSize: input.pageSize, maxWavesPerSeries: MAX_SERIES_WAVES }
}

/** Reporting metadata only; no assignments, member identities, or counts. */
export async function listReportingCohortOptions(input: { principal: ReportingPrincipal; organizationId: string }) {
  const context = await resolveOrganizationReportingWorkspaceContext(input)
  const organizationManager = context.orgRole === 'ORG_ADMIN' || context.capabilities.includes('PSYCHOLOGY_STAFF')
  if (organizationManager) {
    const [classes, dimensions, labels] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT id, name FROM organization_units WHERE organization_id=${input.organizationId} AND unit_kind='CLASS' ORDER BY name, id`,
      prisma.$queryRaw<Array<{ id: string; key: string; name: string }>>`SELECT id, key, name FROM organization_classification_dimensions WHERE organization_id=${input.organizationId} ORDER BY name, id`,
      prisma.$queryRaw<Array<{ id: string; dimensionId: string; name: string }>>`SELECT id, dimension_id AS "dimensionId", name FROM organization_labels WHERE organization_id=${input.organizationId} ORDER BY name, id`,
    ])
    await assertOrganizationReportingWorkspaceAccess(input)
    return { classes, dimensions, labels }
  }

  const teacher = context.personas.includes('TEACHER')
  const counselor = context.personas.includes('COUNSELOR')
  const [classes, labelRows] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
      SELECT DISTINCT unit.id, unit.name
      FROM organization_units unit
      WHERE unit.organization_id=${input.organizationId} AND unit.unit_kind='CLASS' AND (
        (${teacher} AND EXISTS (
          SELECT 1 FROM organization_staff_class_assignments staff
          WHERE staff.organization_id=unit.organization_id AND staff.class_unit_id=unit.id
            AND staff.membership_id=${context.membershipId}
            AND staff.valid_from <= statement_timestamp()
            AND (staff.valid_until IS NULL OR staff.valid_until > statement_timestamp())
        ))
        OR (${counselor} AND EXISTS (
          SELECT 1
          FROM organization_counselor_client_relationships relation
          JOIN organization_memberships client
            ON client.organization_id=relation.organization_id AND client.id=relation.client_membership_id
            AND client.valid_from <= statement_timestamp() AND (client.valid_until IS NULL OR client.valid_until > statement_timestamp())
          JOIN organization_persona_grants persona
            ON persona.organization_id=client.organization_id AND persona.membership_id=client.id
            AND persona.persona='CLIENT' AND persona.revoked_at IS NULL
          JOIN organization_student_class_assignments student
            ON student.organization_id=client.organization_id AND student.membership_id=client.id AND student.class_unit_id=unit.id
            AND student.valid_from <= statement_timestamp() AND (student.valid_until IS NULL OR student.valid_until > statement_timestamp())
          WHERE relation.organization_id=unit.organization_id AND relation.counselor_membership_id=${context.membershipId}
            AND relation.valid_from <= statement_timestamp() AND (relation.valid_until IS NULL OR relation.valid_until > statement_timestamp())
        ))
      )
      ORDER BY unit.name, unit.id
    `),
    prisma.$queryRaw<Array<{ id: string; dimensionId: string; name: string; dimensionKey: string; dimensionName: string }>>(Prisma.sql`
      SELECT DISTINCT label.id, label.dimension_id AS "dimensionId", label.name,
        dimension.key AS "dimensionKey", dimension.name AS "dimensionName"
      FROM organization_labels label
      JOIN organization_classification_dimensions dimension
        ON dimension.organization_id=label.organization_id AND dimension.id=label.dimension_id
      JOIN organization_label_assignments assignment
        ON assignment.organization_id=label.organization_id AND assignment.label_id=label.id
      JOIN organization_memberships member
        ON member.organization_id=assignment.organization_id AND member.id=assignment.membership_id
        AND member.user_id <> ${input.principal.userId}
        AND member.valid_from <= statement_timestamp() AND (member.valid_until IS NULL OR member.valid_until > statement_timestamp())
      WHERE label.organization_id=${input.organizationId} AND (
        (${teacher} AND EXISTS (
          SELECT 1
          FROM organization_student_class_assignments student
          JOIN organization_staff_class_assignments staff
            ON staff.organization_id=student.organization_id AND staff.class_unit_id=student.class_unit_id
            AND staff.membership_id=${context.membershipId}
            AND staff.valid_from <= statement_timestamp() AND (staff.valid_until IS NULL OR staff.valid_until > statement_timestamp())
          JOIN organization_persona_grants persona
            ON persona.organization_id=member.organization_id AND persona.membership_id=member.id
            AND persona.persona='STUDENT' AND persona.revoked_at IS NULL
          WHERE student.organization_id=member.organization_id AND student.membership_id=member.id
            AND student.valid_from <= statement_timestamp() AND (student.valid_until IS NULL OR student.valid_until > statement_timestamp())
        ))
        OR (${counselor} AND EXISTS (
          SELECT 1
          FROM organization_counselor_client_relationships relation
          JOIN organization_persona_grants persona
            ON persona.organization_id=member.organization_id AND persona.membership_id=member.id
            AND persona.persona='CLIENT' AND persona.revoked_at IS NULL
          WHERE relation.organization_id=member.organization_id
            AND relation.counselor_membership_id=${context.membershipId}
            AND relation.client_membership_id=member.id
            AND relation.valid_from <= statement_timestamp() AND (relation.valid_until IS NULL OR relation.valid_until > statement_timestamp())
        ))
      )
      ORDER BY dimension.name, label.name, label.id
    `),
  ])
  const dimensions = [...new Map(labelRows.map((row) => [row.dimensionId, {
    id: row.dimensionId,
    key: row.dimensionKey,
    name: row.dimensionName,
  }])).values()]
  const labels = labelRows.map(({ id, dimensionId, name }) => ({ id, dimensionId, name }))
  await assertOrganizationReportingWorkspaceAccess(input)
  return { classes, dimensions, labels }
}
