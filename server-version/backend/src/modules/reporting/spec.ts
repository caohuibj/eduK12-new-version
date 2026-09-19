import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import {
  reportingFail,
  type ReportingAnalysisSpecDefinitionV1,
  type ReportingAnalysisSpecRecord,
  type ReportingSpecStatus,
} from './types'

const quality = z.enum(['interpretable', 'limited', 'invalid'])
const aggregation = z.enum(['MEAN', 'MEDIAN', 'SD_POPULATION', 'SD_SAMPLE', 'MIN_MAX', 'QUARTILES', 'DISTRIBUTION'])
const metricRule = z.object({
  metricId: z.string().trim().min(1).max(160),
  sourceMetricKey: z.string().trim().min(1).max(240),
  acceptedResultQuality: z.array(quality).min(1),
  acceptedMetricQuality: z.union([
    z.literal('IGNORE_METRIC_QUALITY'),
    z.array(z.string().trim().min(1).max(120)).min(1),
  ]),
  aggregations: z.array(aggregation).min(1),
  missingnessRule: z.literal('EXCLUDE'),
  minimumMetricN: z.number().int().min(3),
  observationUnit: z.literal('SUBJECT'),
  selectionPolicy: z.literal('UNIQUE_OR_REJECT'),
}).strict()

const definitionSchema = z.object({
  schemaVersion: z.literal(1),
  analysisKind: z.literal('GROUP'),
  engineKey: z.literal('ORG_GROUP_V1'),
  engineVersion: z.literal('1.0.0'),
  privacyUnit: z.literal('SUBJECT'),
  selectionPolicy: z.literal('UNIQUE_OR_REJECT'),
  minimumCohortN: z.number().int().min(3),
  minimumContributorN: z.number().int().min(3),
  reportEvidenceCeiling: z.enum(['PILOT', 'RESEARCH_READY', 'RESEARCH_GRADE']),
  metricRules: z.array(metricRule).min(1),
}).strict()

type SpecRow = {
  id: string
  specKey: string
  version: number
  status: ReportingSpecStatus
  definition: unknown
  specHash: string
  createdByUserId: string
  createdAt: Date
  reviewedAt: Date | null
  publishedAt: Date | null
}

type Tx = Prisma.TransactionClient

export const validateReportingSpecDefinition = (input: unknown): ReportingAnalysisSpecDefinitionV1 => {
  const parsed = definitionSchema.safeParse(input)
  if (!parsed.success) reportingFail('REPORT_SPEC_INVALID', parsed.error.errors[0]?.message ?? 'reporting spec is invalid', 400)
  const definition = parsed.data as ReportingAnalysisSpecDefinitionV1
  const metricIds = new Set<string>()
  const sourceMetricKeys = new Set<string>()
  for (const rule of definition.metricRules) {
    if (metricIds.has(rule.metricId)) reportingFail('REPORT_SPEC_INVALID', `duplicate metricId ${rule.metricId}`, 400)
    if (sourceMetricKeys.has(rule.sourceMetricKey)) reportingFail('REPORT_SPEC_INVALID', `duplicate sourceMetricKey ${rule.sourceMetricKey}`, 400)
    if (new Set(rule.acceptedResultQuality).size !== rule.acceptedResultQuality.length) {
      reportingFail('REPORT_SPEC_INVALID', `duplicate accepted result quality for ${rule.metricId}`, 400)
    }
    if (Array.isArray(rule.acceptedMetricQuality) && new Set(rule.acceptedMetricQuality).size !== rule.acceptedMetricQuality.length) {
      reportingFail('REPORT_SPEC_INVALID', `duplicate accepted metric quality for ${rule.metricId}`, 400)
    }
    if (new Set(rule.aggregations).size !== rule.aggregations.length) {
      reportingFail('REPORT_SPEC_INVALID', `duplicate aggregation for ${rule.metricId}`, 400)
    }
    metricIds.add(rule.metricId)
    sourceMetricKeys.add(rule.sourceMetricKey)
  }
  return definition
}

export const reportingSpecHash = (definition: ReportingAnalysisSpecDefinitionV1): string => (
  canonicalHash({ schema: 'ReportingAnalysisSpecDefinitionV1', definition: validateReportingSpecDefinition(definition) })
)

const toRecord = (row: SpecRow): ReportingAnalysisSpecRecord => {
  const definition = validateReportingSpecDefinition(row.definition)
  if (reportingSpecHash(definition) !== row.specHash) {
    return reportingFail('REPORT_SPEC_INTEGRITY', 'reporting spec hash does not match its definition', 500)
  }
  return { ...row, definition }
}

const readSpecForUpdate = async (tx: Tx, specId: string): Promise<SpecRow> => {
  const rows = await tx.$queryRaw<SpecRow[]>`
    SELECT "id", "spec_key" AS "specKey", "version", "status", "definition", "spec_hash" AS "specHash",
      "created_by_user_id" AS "createdByUserId", "created_at" AS "createdAt",
      "reviewed_at" AS "reviewedAt", "published_at" AS "publishedAt"
    FROM "reporting_analysis_specs" WHERE "id"=${specId} FOR UPDATE
  `
  return rows[0] ?? reportingFail('REPORT_SPEC_NOT_FOUND', 'reporting spec not found', 404)
}

const assertSystemAdmin = (actor: { userId: string; platformRole: string }): void => {
  if (actor.platformRole !== 'SYSTEM_ADMIN') reportingFail('REPORT_SPEC_AUTHORITY', 'platform reporting specs require SYSTEM_ADMIN', 403)
}

const isUniqueViolation = (error: unknown): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code === 'P2002') return true
  if (error.code !== 'P2010') return false
  const meta = error.meta as Record<string, unknown> | undefined
  return meta?.code === '23505'
}

export const createPlatformReportingSpec = async (input: {
  actor: { userId: string; platformRole: string }
  specKey: string
  version: number
  definition: unknown
}): Promise<ReportingAnalysisSpecRecord> => {
  assertSystemAdmin(input.actor)
  const specKey = input.specKey.trim()
  if (!specKey || !Number.isInteger(input.version) || input.version < 1) {
    reportingFail('REPORT_SPEC_INVALID', 'specKey and positive integer version are required', 400)
  }
  const definition = validateReportingSpecDefinition(input.definition)
  const specHash = reportingSpecHash(definition)
  const id = randomUUID()
  try {
    const rows = await prisma.$queryRaw<SpecRow[]>`
      INSERT INTO "reporting_analysis_specs"
        ("id","spec_key","version","status","definition","spec_hash","created_by_user_id")
      VALUES (${id},${specKey},${input.version},'DRAFT',${JSON.stringify(definition)}::jsonb,${specHash},${input.actor.userId})
      RETURNING "id", "spec_key" AS "specKey", "version", "status", "definition", "spec_hash" AS "specHash",
        "created_by_user_id" AS "createdByUserId", "created_at" AS "createdAt",
        "reviewed_at" AS "reviewedAt", "published_at" AS "publishedAt"
    `
    return toRecord(rows[0])
  } catch (error) {
    if (isUniqueViolation(error)) {
      reportingFail('REPORT_SPEC_VERSION_CONFLICT', 'reporting spec key/version already exists', 409)
    }
    throw error
  }
}

const transition = async (input: {
  actor: { userId: string; platformRole: string }
  specId: string
  expected: ReportingSpecStatus
  next: ReportingSpecStatus
}): Promise<ReportingAnalysisSpecRecord> => {
  assertSystemAdmin(input.actor)
  return prisma.$transaction(async (tx) => {
    const current = await readSpecForUpdate(tx, input.specId)
    if (current.status !== input.expected) {
      reportingFail('REPORT_SPEC_STATE_CONFLICT', `reporting spec must be ${input.expected}`, 409)
    }
    toRecord(current)
    const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT transaction_timestamp() AS "now"`
    const now = nowRows[0].now
    const rows = input.next === 'REVIEWED'
      ? await tx.$queryRaw<SpecRow[]>`
          UPDATE "reporting_analysis_specs" SET "status"='REVIEWED', "reviewed_by_user_id"=${input.actor.userId}, "reviewed_at"=${now}
          WHERE "id"=${input.specId}
          RETURNING "id", "spec_key" AS "specKey", "version", "status", "definition", "spec_hash" AS "specHash",
            "created_by_user_id" AS "createdByUserId", "created_at" AS "createdAt", "reviewed_at" AS "reviewedAt", "published_at" AS "publishedAt"
        `
      : input.next === 'PUBLISHED'
        ? await tx.$queryRaw<SpecRow[]>`
            UPDATE "reporting_analysis_specs" SET "status"='PUBLISHED', "published_by_user_id"=${input.actor.userId}, "published_at"=${now}
            WHERE "id"=${input.specId}
            RETURNING "id", "spec_key" AS "specKey", "version", "status", "definition", "spec_hash" AS "specHash",
              "created_by_user_id" AS "createdByUserId", "created_at" AS "createdAt", "reviewed_at" AS "reviewedAt", "published_at" AS "publishedAt"
          `
        : await tx.$queryRaw<SpecRow[]>`
            UPDATE "reporting_analysis_specs" SET "status"='RETIRED', "retired_by_user_id"=${input.actor.userId}, "retired_at"=${now}
            WHERE "id"=${input.specId}
            RETURNING "id", "spec_key" AS "specKey", "version", "status", "definition", "spec_hash" AS "specHash",
              "created_by_user_id" AS "createdByUserId", "created_at" AS "createdAt", "reviewed_at" AS "reviewedAt", "published_at" AS "publishedAt"
          `
    if (input.next === 'PUBLISHED') {
      await tx.$executeRaw`
        INSERT INTO "organization_governance_audits"
          ("id","organization_id","actor_user_id","action","target_type","target_id","domain_event_id","payload")
        VALUES (${randomUUID()},NULL,${input.actor.userId},'REPORTING_SPEC_PUBLISHED','ReportingAnalysisSpec',${input.specId},${`${input.specId}:published`},${JSON.stringify({ specHash: current.specHash })}::jsonb)
      `
    }
    return toRecord(rows[0])
  })
}

export const reviewPlatformReportingSpec = (input: { actor: { userId: string; platformRole: string }; specId: string }) => (
  transition({ ...input, expected: 'DRAFT', next: 'REVIEWED' })
)
export const publishPlatformReportingSpec = (input: { actor: { userId: string; platformRole: string }; specId: string }) => (
  transition({ ...input, expected: 'REVIEWED', next: 'PUBLISHED' })
)
export const retirePlatformReportingSpec = (input: { actor: { userId: string; platformRole: string }; specId: string }) => (
  transition({ ...input, expected: 'PUBLISHED', next: 'RETIRED' })
)

export const getPublishedReportingSpec = async (specId: string, tx?: Tx): Promise<ReportingAnalysisSpecRecord> => {
  const db = tx ?? (prisma as unknown as Tx)
  const rows = await db.$queryRaw<SpecRow[]>`
    SELECT "id", "spec_key" AS "specKey", "version", "status", "definition", "spec_hash" AS "specHash",
      "created_by_user_id" AS "createdByUserId", "created_at" AS "createdAt",
      "reviewed_at" AS "reviewedAt", "published_at" AS "publishedAt"
    FROM "reporting_analysis_specs" WHERE "id"=${specId} AND "status"='PUBLISHED' LIMIT 1
  `
  if (!rows[0]) reportingFail('REPORT_SPEC_NOT_PUBLISHED', 'published reporting spec not found', 404)
  return toRecord(rows[0])
}
