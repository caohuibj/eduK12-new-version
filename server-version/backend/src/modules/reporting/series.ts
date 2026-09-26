import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { readReportingCohort } from './cohort'
import { resolveAuthoritativeRunResults } from './resultSource'
import {
  reportingFail,
  type ReportingResourceFamily,
  type ReportingResultBatchV1,
  type ReportingSeriesRecordV1,
  type ReportingSeriesScopeV1,
  type ReportingSeriesWaveRecordV1,
  type ReportingWaveInputManifestV1,
} from './types'

type SeriesRow = {
  id: string
  organizationId: string
  seriesKey: string
  scope: ReportingSeriesScopeV1
  seriesIdentityHash: string
  snapshotHash: string
  createdByUserId: string
  createdAt: Date
}

type WaveRow = {
  id: string
  organizationId: string
  seriesId: string
  waveKey: string
  ordinal: number
  cohortSnapshotId: string
  sourceRunId: string
  sourceTrackId: string
  inputManifest: ReportingWaveInputManifestV1
  inputIdentityHash: string
  snapshotHash: string
  createdByUserId: string
  createdAt: Date
}

const resourceFamilies = new Set<ReportingResourceFamily>(['BUNDLE', 'SCALE', 'COGNITIVE', 'SITUATIONAL'])

export const validateReportingSeriesScope = (input: ReportingSeriesScopeV1 | unknown): ReportingSeriesScopeV1 => {
  const scope = input as ReportingSeriesScopeV1
  if (!scope || scope.schemaVersion !== 1 || !resourceFamilies.has(scope.resourceFamily)) {
    reportingFail('REPORT_SERIES_SCOPE_INVALID', 'reporting series scope is invalid', 400)
  }
  if (typeof scope.resourceKey !== 'string' || scope.resourceKey.trim().length === 0) {
    reportingFail('REPORT_SERIES_SCOPE_INVALID', 'reporting series resourceKey is required', 400)
  }
  return { schemaVersion: 1, resourceFamily: scope.resourceFamily, resourceKey: scope.resourceKey.trim() }
}

const validateWaveManifest = (input: ReportingWaveInputManifestV1 | unknown): ReportingWaveInputManifestV1 => {
  const manifest = input as ReportingWaveInputManifestV1
  if (
    !manifest
    || manifest.schemaVersion !== 1
    || !manifest.resource
    || !resourceFamilies.has(manifest.resource.family)
    || typeof manifest.resource.key !== 'string'
    || manifest.resource.key.length === 0
    || typeof manifest.resource.version !== 'string'
    || manifest.resource.version.length === 0
    || !Array.isArray(manifest.resolved)
    || !Array.isArray(manifest.unresolved)
  ) reportingFail('REPORT_WAVE_INTEGRITY', 'stored Wave manifest is invalid', 500)
  return manifest
}

const seriesSnapshotPayload = (row: SeriesRow) => ({
  schemaVersion: 1 as const,
  id: row.id,
  organizationId: row.organizationId,
  seriesKey: row.seriesKey,
  scope: row.scope,
  seriesIdentityHash: row.seriesIdentityHash,
  createdByUserId: row.createdByUserId,
  createdAt: row.createdAt.toISOString(),
})

const assertSeriesIntegrity = (row: SeriesRow): ReportingSeriesRecordV1 => {
  const scope = validateReportingSeriesScope(row.scope)
  const expectedIdentity = canonicalHash({
    schema: 'ReportingSeriesIdentityV1',
    organizationId: row.organizationId,
    seriesKey: row.seriesKey,
    scope,
  })
  if (expectedIdentity !== row.seriesIdentityHash || canonicalHash(seriesSnapshotPayload({ ...row, scope })) !== row.snapshotHash) {
    reportingFail('REPORT_SERIES_INTEGRITY', 'stored reporting series failed integrity verification', 500)
  }
  return { ...row, scope }
}

export const buildReportingWaveInputManifest = (batch: ReportingResultBatchV1): ReportingWaveInputManifestV1 => ({
  schemaVersion: 1,
  resource: {
    family: batch.resourceFamily,
    key: batch.resourceKey,
    version: batch.resourceVersion,
    minimumN: batch.resourceMinimumN,
  },
  resolved: batch.resolved.map((result) => ({
    executionId: result.executionId,
    subjectUserId: result.subjectUserId,
    membershipId: result.membershipId,
    canonicalResultHash: result.canonicalResultHash,
    metrics: [...result.metrics].sort((a, b) => a.key.localeCompare(b.key)),
    scientificMaturity: result.scientificMaturity,
    provenanceState: result.provenanceState,
    scientificProvenanceHash: result.scientificProvenanceHash,
  })).sort((a, b) => a.executionId.localeCompare(b.executionId)),
  unresolved: batch.unresolved.map((result) => ({
    executionId: result.executionId,
    subjectUserId: result.subjectUserId,
    membershipId: result.membershipId,
    reason: result.reason,
  })).sort((a, b) => a.executionId.localeCompare(b.executionId)),
})

export const reportingWaveInputIdentity = (input: {
  cohortIdentityHash: string
  manifest: ReportingWaveInputManifestV1
}): string => canonicalHash({
  schema: 'ReportingWaveInputIdentityV1',
  cohortIdentityHash: input.cohortIdentityHash,
  manifest: input.manifest,
})

const waveSnapshotPayload = (row: WaveRow) => ({
  schemaVersion: 1 as const,
  id: row.id,
  organizationId: row.organizationId,
  seriesId: row.seriesId,
  waveKey: row.waveKey,
  ordinal: row.ordinal,
  cohortSnapshotId: row.cohortSnapshotId,
  source: { runId: row.sourceRunId, trackId: row.sourceTrackId },
  inputManifest: row.inputManifest,
  inputIdentityHash: row.inputIdentityHash,
  createdByUserId: row.createdByUserId,
  createdAt: row.createdAt.toISOString(),
})

const assertWaveIntegrity = (row: WaveRow): ReportingSeriesWaveRecordV1 => {
  if (!Number.isInteger(row.ordinal) || row.ordinal < 1) reportingFail('REPORT_WAVE_INTEGRITY', 'stored Wave ordinal is invalid', 500)
  const inputManifest = validateWaveManifest(row.inputManifest)
  const normalized = { ...row, inputManifest }
  if (canonicalHash(waveSnapshotPayload(normalized)) !== row.snapshotHash) {
    reportingFail('REPORT_WAVE_INTEGRITY', 'stored reporting Wave failed integrity verification', 500)
  }
  return normalized
}

const isUniqueViolation = (error: unknown): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code === 'P2002') return true
  if (error.code !== 'P2010') return false
  const meta = error.meta as Record<string, unknown> | undefined
  return meta?.code === '23505'
}

export const createReportingSeries = async (input: {
  organizationId: string
  seriesKey: string
  scope: ReportingSeriesScopeV1
  createdByUserId: string
  reuse?: boolean
}): Promise<ReportingSeriesRecordV1> => {
  const seriesKey = input.seriesKey.trim()
  if (!seriesKey) reportingFail('REPORT_SERIES_KEY_INVALID', 'seriesKey is required', 400)
  const scope = validateReportingSeriesScope(input.scope)
  const createdAt = new Date()
  const row: SeriesRow = {
    id: randomUUID(),
    organizationId: input.organizationId,
    seriesKey,
    scope,
    seriesIdentityHash: canonicalHash({
      schema: 'ReportingSeriesIdentityV1',
      organizationId: input.organizationId,
      seriesKey,
      scope,
    }),
    snapshotHash: '',
    createdByUserId: input.createdByUserId,
    createdAt,
  }
  row.snapshotHash = canonicalHash(seriesSnapshotPayload(row))
  try {
    const rows = await prisma.$queryRaw<SeriesRow[]>`
      INSERT INTO "reporting_series"
        ("id","organization_id","series_key","scope","series_identity_hash","snapshot_hash","created_by_user_id","created_at")
      VALUES (${row.id},${row.organizationId},${row.seriesKey},${JSON.stringify(row.scope)}::jsonb,${row.seriesIdentityHash},${row.snapshotHash},${row.createdByUserId},${row.createdAt})
      ${input.reuse ? Prisma.sql`ON CONFLICT ("organization_id", "series_key") DO NOTHING` : Prisma.empty}
      RETURNING "id", "organization_id" AS "organizationId", "series_key" AS "seriesKey", "scope",
        "series_identity_hash" AS "seriesIdentityHash", "snapshot_hash" AS "snapshotHash",
        "created_by_user_id" AS "createdByUserId", "created_at" AS "createdAt"
    `
    if (rows[0]) return assertSeriesIntegrity(rows[0])
    if (input.reuse) {
      const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM reporting_series WHERE organization_id=${input.organizationId} AND series_key=${seriesKey}`
      const existing = await readReportingSeries(rows[0]?.id ?? '')
      if (canonicalHash(existing.scope) !== canonicalHash(scope)) reportingFail('REPORT_SERIES_RESOURCE_MISMATCH', 'existing series scope differs', 409)
      return existing
    }
    return reportingFail('REPORT_SERIES_KEY_CONFLICT', 'reporting series could not be created', 409)
  } catch (error) {
    if (isUniqueViolation(error)) reportingFail('REPORT_SERIES_KEY_CONFLICT', 'reporting series key already exists in this Organization', 409)
    throw error
  }
}

export const readReportingSeries = async (seriesId: string): Promise<ReportingSeriesRecordV1> => {
  const rows = await prisma.$queryRaw<SeriesRow[]>`
    SELECT "id", "organization_id" AS "organizationId", "series_key" AS "seriesKey", "scope",
      "series_identity_hash" AS "seriesIdentityHash", "snapshot_hash" AS "snapshotHash",
      "created_by_user_id" AS "createdByUserId", "created_at" AS "createdAt"
    FROM "reporting_series" WHERE "id"=${seriesId} LIMIT 1
  `
  return assertSeriesIntegrity(rows[0] ?? reportingFail('REPORT_SERIES_NOT_FOUND', 'reporting series not found', 404))
}

export const bindReportingSeriesWave = async (input: {
  organizationId: string
  seriesId: string
  waveKey: string
  ordinal: number
  cohortSnapshotId: string
  createdByUserId: string
  preparedBatch?: ReportingResultBatchV1
}): Promise<ReportingSeriesWaveRecordV1> => {
  const waveKey = input.waveKey.trim()
  if (!waveKey || !Number.isInteger(input.ordinal) || input.ordinal < 1) {
    reportingFail('REPORT_WAVE_INVALID', 'Wave requires a non-empty waveKey and positive integer ordinal', 400)
  }
  const [series, cohort] = await Promise.all([
    readReportingSeries(input.seriesId),
    readReportingCohort(input.cohortSnapshotId),
  ])
  if (series.organizationId !== input.organizationId || cohort.organizationId !== input.organizationId) {
    reportingFail('REPORT_SERIES_SCOPE_MISMATCH', 'Series and Wave cohort must belong to the same Organization', 404)
  }
  const batch = input.preparedBatch ?? await resolveAuthoritativeRunResults(cohort)
  const members = new Map(cohort.members.map(member => [member.executionId, member]))
  const observations = [...batch.resolved, ...batch.unresolved]
  if (observations.length !== members.size || new Set(observations.map(row => row.executionId)).size !== members.size
    || observations.some(row => {
      const member = members.get(row.executionId)
      return !member || member.userId !== row.subjectUserId || member.membershipId !== row.membershipId
    })) reportingFail('REPORT_RESULT_INTEGRITY', 'Wave results must exactly cover the frozen cohort', 500)
  if (batch.resourceFamily !== series.scope.resourceFamily || batch.resourceKey !== series.scope.resourceKey) {
    reportingFail('REPORT_SERIES_RESOURCE_MISMATCH', 'Wave resource is outside the Series resource scope', 409)
  }
  const inputManifest = buildReportingWaveInputManifest(batch)
  const inputIdentityHash = reportingWaveInputIdentity({ cohortIdentityHash: cohort.cohortIdentityHash, manifest: inputManifest })
  const createdAt = new Date()
  const row: WaveRow = {
    id: randomUUID(),
    organizationId: input.organizationId,
    seriesId: series.id,
    waveKey,
    ordinal: input.ordinal,
    cohortSnapshotId: cohort.id,
    sourceRunId: cohort.sourceRunId,
    sourceTrackId: cohort.sourceTrackId,
    inputManifest,
    inputIdentityHash,
    snapshotHash: '',
    createdByUserId: input.createdByUserId,
    createdAt,
  }
  row.snapshotHash = canonicalHash(waveSnapshotPayload(row))
  try {
    const inserted = await prisma.$queryRaw<WaveRow[]>`
      INSERT INTO "reporting_series_waves"
        ("id","organization_id","series_id","wave_key","ordinal","cohort_snapshot_id","source_run_id","source_track_id",
         "input_manifest","input_identity_hash","snapshot_hash","created_by_user_id","created_at")
      VALUES (${row.id},${row.organizationId},${row.seriesId},${row.waveKey},${row.ordinal},${row.cohortSnapshotId},${row.sourceRunId},${row.sourceTrackId},
        ${JSON.stringify(row.inputManifest)}::jsonb,${row.inputIdentityHash},${row.snapshotHash},${row.createdByUserId},${row.createdAt})
      ON CONFLICT ("organization_id","series_id","wave_key") DO NOTHING
      RETURNING "id"
    `
    if (inserted[0]) return readReportingSeriesWave({ organizationId: row.organizationId, seriesId: row.seriesId, waveKey: row.waveKey })
  } catch (error) {
    if (isUniqueViolation(error)) reportingFail('REPORT_WAVE_CONFLICT', 'Wave ordinal or source binding conflicts with an existing Wave', 409)
    throw error
  }
  const existing = await readReportingSeriesWave({ organizationId: input.organizationId, seriesId: input.seriesId, waveKey })
  if (
    existing.ordinal !== input.ordinal
    || existing.cohortSnapshotId !== cohort.id
    || existing.inputIdentityHash !== inputIdentityHash
  ) reportingFail('REPORT_WAVE_CONFLICT', 'Wave key is already bound to different immutable inputs', 409)
  return existing
}

export const readReportingSeriesWave = async (input: {
  organizationId: string
  seriesId: string
  waveKey: string
}): Promise<ReportingSeriesWaveRecordV1> => {
  const rows = await prisma.$queryRaw<WaveRow[]>`
    SELECT "id", "organization_id" AS "organizationId", "series_id" AS "seriesId", "wave_key" AS "waveKey", "ordinal",
      "cohort_snapshot_id" AS "cohortSnapshotId", "source_run_id" AS "sourceRunId", "source_track_id" AS "sourceTrackId",
      "input_manifest" AS "inputManifest", "input_identity_hash" AS "inputIdentityHash", "snapshot_hash" AS "snapshotHash",
      "created_by_user_id" AS "createdByUserId", "created_at" AS "createdAt"
    FROM "reporting_series_waves"
    WHERE "organization_id"=${input.organizationId} AND "series_id"=${input.seriesId} AND "wave_key"=${input.waveKey}
    LIMIT 1
  `
  const row = assertWaveIntegrity(rows[0] ?? reportingFail('REPORT_WAVE_NOT_FOUND', 'reporting Wave not found', 404))
  const cohort = await readReportingCohort(row.cohortSnapshotId)
  if (
    cohort.organizationId !== row.organizationId
    || cohort.sourceRunId !== row.sourceRunId
    || cohort.sourceTrackId !== row.sourceTrackId
  ) reportingFail('REPORT_WAVE_INTEGRITY', 'Wave source binding no longer matches its frozen cohort', 500)
  const expectedInput = reportingWaveInputIdentity({ cohortIdentityHash: cohort.cohortIdentityHash, manifest: row.inputManifest })
  if (expectedInput !== row.inputIdentityHash) reportingFail('REPORT_WAVE_INTEGRITY', 'Wave input identity failed integrity verification', 500)
  return row
}
