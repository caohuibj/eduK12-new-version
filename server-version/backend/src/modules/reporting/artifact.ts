import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import {
  reportingFail,
  type ReportingArtifactPayloadV1,
  type ReportingArtifactRecord,
  type ReportingGroupArtifactPayloadV1,
  type ReportingGroupArtifactRecord,
  type ReportingLongitudinalArtifactPayloadV1,
  type ReportingLongitudinalArtifactRecord,
  type ReportingLongitudinalWaveBindingV1,
  type ReportingProtectedArtifactPayloadV1,
  type ReportingProtectedArtifactRecord,
} from './types'

type Tx = Prisma.TransactionClient

type ArtifactRow = {
  id: string
  organizationId: string
  analysisKind: string
  policyDomain: string
  cohortSnapshotId: string | null
  seriesId: string | null
  sourceRunId: string | null
  sourceTrackId: string | null
  subjectActorSnapshotId: string | null
  relationshipKind: string | null
  perspective: string | null
  specId: string
  analysisIdentityHash: string
  artifactPayload: ReportingArtifactPayloadV1
  snapshotHash: string
  generatedByUserId: string
  generatedAt: Date
}

type ArtifactWaveRow = {
  waveId: string
  ordinal: number
  inputIdentityHash: string
  snapshotHash: string
  waveKey: string
  cohortSnapshotId: string
}

const readWaveBindings = async (tx: Tx, artifactId: string): Promise<ReportingLongitudinalWaveBindingV1[]> => {
  const rows = await tx.$queryRaw<ArtifactWaveRow[]>`
    SELECT aw."wave_id" AS "waveId", aw."ordinal", aw."input_identity_hash" AS "inputIdentityHash",
      aw."wave_snapshot_hash" AS "snapshotHash", w."wave_key" AS "waveKey", w."cohort_snapshot_id" AS "cohortSnapshotId"
    FROM "reporting_analysis_artifact_waves" aw
    JOIN "reporting_series_waves" w
      ON w."organization_id"=aw."organization_id" AND w."series_id"=aw."series_id" AND w."id"=aw."wave_id"
    WHERE aw."artifact_id"=${artifactId}
    ORDER BY aw."ordinal", aw."wave_id"
  `
  return rows
}

const assertProtectedSubjectBinding = async (tx: Tx, row: ArtifactRow, payload: ReportingProtectedArtifactPayloadV1): Promise<void> => {
  const rows = await tx.$queryRaw<Array<{ userId: string }>>`
    SELECT actor."user_id" AS "userId"
    FROM "assessment_run_actor_snapshots" actor
    WHERE actor."organization_id"=${row.organizationId}
      AND actor."run_id"=${payload.source.runId}
      AND actor."id"=${payload.source.subjectActorSnapshotId}
      AND EXISTS (
        SELECT 1 FROM "assessment_run_executions" execution
        WHERE execution."organization_id"=actor."organization_id"
          AND execution."run_id"=actor."run_id"
          AND execution."track_id"=${payload.source.trackId}
          AND execution."subject_actor_snapshot_id"=actor."id"
      )
    LIMIT 1
  `
  if (rows[0]?.userId !== payload.source.subjectUserId) {
    reportingFail('REPORT_ARTIFACT_INTEGRITY', 'protected artifact subject actor does not match its frozen Run/Track subject', 500)
  }
}

const verifyCommon = (row: ArtifactRow): void => {
  const payload = row.artifactPayload
  if (
    payload.artifactId !== row.id
    || payload.organizationId !== row.organizationId
    || payload.specId !== row.specId
    || payload.analysisIdentityHash !== row.analysisIdentityHash
    || canonicalHash(payload) !== row.snapshotHash
  ) reportingFail('REPORT_ARTIFACT_INTEGRITY', 'stored reporting artifact failed integrity verification', 500)
}

const verifyStored = async (tx: Tx, row: ArtifactRow): Promise<ReportingArtifactRecord> => {
  verifyCommon(row)
  const payload = row.artifactPayload

  if (row.analysisKind === 'GROUP') {
    if (
      row.policyDomain !== 'ORG_GROUP_REPORT_V1'
      || row.cohortSnapshotId === null
      || row.seriesId !== null
      || row.sourceRunId !== null || row.sourceTrackId !== null || row.subjectActorSnapshotId !== null
      || row.relationshipKind !== null || row.perspective !== null
      || !('cohortSnapshotId' in payload)
      || 'analysisKind' in payload
      || payload.cohortSnapshotId !== row.cohortSnapshotId
    ) reportingFail('REPORT_ARTIFACT_INTEGRITY', 'GROUP artifact row shape is invalid', 500)
    return { ...row, analysisKind: 'GROUP', policyDomain: 'ORG_GROUP_REPORT_V1', artifactPayload: payload as ReportingGroupArtifactPayloadV1 } as ReportingGroupArtifactRecord
  }

  if (row.analysisKind === 'REPEATED_COHORT' || row.analysisKind === 'MATCHED_LONGITUDINAL') {
    if (
      row.policyDomain !== 'ORG_GROUP_REPORT_V1'
      || row.cohortSnapshotId !== null
      || row.seriesId === null
      || row.sourceRunId !== null || row.sourceTrackId !== null || row.subjectActorSnapshotId !== null
      || row.relationshipKind !== null || row.perspective !== null
      || !('analysisKind' in payload)
      || (payload.analysisKind !== 'REPEATED_COHORT' && payload.analysisKind !== 'MATCHED_LONGITUDINAL')
      || payload.analysisKind !== row.analysisKind
      || payload.source.kind !== 'SERIES' || payload.source.seriesId !== row.seriesId
    ) reportingFail('REPORT_ARTIFACT_INTEGRITY', 'longitudinal artifact row shape is invalid', 500)
    const longitudinal = payload as ReportingLongitudinalArtifactPayloadV1
    const storedBindings = await readWaveBindings(tx, row.id)
    if (canonicalHash(storedBindings) !== canonicalHash(longitudinal.waveBindings)) {
      reportingFail('REPORT_ARTIFACT_INTEGRITY', 'longitudinal artifact Wave bindings failed integrity verification', 500)
    }
    return { ...row, analysisKind: row.analysisKind, policyDomain: 'ORG_GROUP_REPORT_V1', artifactPayload: longitudinal } as ReportingLongitudinalArtifactRecord
  }

  if (row.analysisKind === 'PROTECTED_FEEDBACK') {
    if (
      row.policyDomain !== 'ORG_PROTECTED_FEEDBACK_V1'
      || row.cohortSnapshotId !== null || row.seriesId !== null
      || row.sourceRunId === null || row.sourceTrackId === null || row.subjectActorSnapshotId === null
      || !row.relationshipKind || !row.perspective
      || !('analysisKind' in payload) || payload.analysisKind !== 'PROTECTED_FEEDBACK'
      || payload.source.kind !== 'RUN_TRACK_PROTECTED'
      || payload.source.runId !== row.sourceRunId || payload.source.trackId !== row.sourceTrackId
      || payload.source.subjectActorSnapshotId !== row.subjectActorSnapshotId
      || payload.source.relationshipKind !== row.relationshipKind || payload.source.perspective !== row.perspective
    ) reportingFail('REPORT_ARTIFACT_INTEGRITY', 'protected artifact row shape is invalid', 500)
    const protectedPayload = payload as ReportingProtectedArtifactPayloadV1
    await assertProtectedSubjectBinding(tx, row, protectedPayload)
    return {
      ...row,
      analysisKind: 'PROTECTED_FEEDBACK',
      policyDomain: 'ORG_PROTECTED_FEEDBACK_V1',
      perspective: row.perspective as ReportingProtectedArtifactRecord['perspective'],
      artifactPayload: protectedPayload,
    } as ReportingProtectedArtifactRecord
  }

  return reportingFail('REPORT_ARTIFACT_INTEGRITY', 'stored reporting artifact has unknown analysis kind', 500)
}

const readByIdentity = async (tx: Tx, analysisIdentityHash: string): Promise<ArtifactRow> => {
  const rows = await tx.$queryRaw<ArtifactRow[]>`
    SELECT "id", "organization_id" AS "organizationId", "analysis_kind" AS "analysisKind", "policy_domain" AS "policyDomain",
      "cohort_snapshot_id" AS "cohortSnapshotId", "series_id" AS "seriesId", "source_run_id" AS "sourceRunId",
      "source_track_id" AS "sourceTrackId", "subject_actor_snapshot_id" AS "subjectActorSnapshotId",
      "relationship_kind" AS "relationshipKind", "perspective", "spec_id" AS "specId",
      "analysis_identity_hash" AS "analysisIdentityHash", "artifact_payload" AS "artifactPayload", "snapshot_hash" AS "snapshotHash",
      "generated_by_user_id" AS "generatedByUserId", "generated_at" AS "generatedAt"
    FROM "reporting_analysis_artifacts" WHERE "analysis_identity_hash"=${analysisIdentityHash} LIMIT 1
  `
  return rows[0] ?? reportingFail('REPORT_ANALYSIS_REUSE', 'analysis create-or-reuse failed', 500)
}

export const createOrReuseReportingArtifact = async (input: {
  organizationId: string
  cohortSnapshotId: string
  specId: string
  analysisIdentityHash: string
  artifactPayload: ReportingGroupArtifactPayloadV1
  snapshotHash: string
  generatedByUserId: string
  generatedAt: Date
}): Promise<ReportingGroupArtifactRecord> => prisma.$transaction(async (tx) => {
  const rows = await tx.$queryRaw<ArtifactRow[]>`
    INSERT INTO "reporting_analysis_artifacts"
      ("id","organization_id","analysis_kind","policy_domain","cohort_snapshot_id","spec_id","analysis_identity_hash","artifact_payload","snapshot_hash","generated_by_user_id","generated_at")
    VALUES (${input.artifactPayload.artifactId},${input.organizationId},'GROUP','ORG_GROUP_REPORT_V1',${input.cohortSnapshotId},${input.specId},${input.analysisIdentityHash},
      ${JSON.stringify(input.artifactPayload)}::jsonb,${input.snapshotHash},${input.generatedByUserId},${input.generatedAt})
    ON CONFLICT ("analysis_identity_hash") DO NOTHING
    RETURNING "id", "organization_id" AS "organizationId", "analysis_kind" AS "analysisKind", "policy_domain" AS "policyDomain",
      "cohort_snapshot_id" AS "cohortSnapshotId", "series_id" AS "seriesId", "source_run_id" AS "sourceRunId",
      "source_track_id" AS "sourceTrackId", "subject_actor_snapshot_id" AS "subjectActorSnapshotId", "relationship_kind" AS "relationshipKind", "perspective",
      "spec_id" AS "specId", "analysis_identity_hash" AS "analysisIdentityHash", "artifact_payload" AS "artifactPayload", "snapshot_hash" AS "snapshotHash",
      "generated_by_user_id" AS "generatedByUserId", "generated_at" AS "generatedAt"
  `
  if (rows[0]) {
    await tx.$executeRaw`
      INSERT INTO "organization_governance_audits"
        ("id","organization_id","actor_user_id","action","target_type","target_id","domain_event_id","payload")
      VALUES (${randomUUID()},${input.organizationId},${input.generatedByUserId},'REPORTING_ANALYSIS_CREATED','ReportingAnalysisArtifact',
        ${rows[0].id},${rows[0].id},${JSON.stringify({ analysisKind: 'GROUP', specId: input.specId, cohortSnapshotId: input.cohortSnapshotId })}::jsonb)
    `
    return await verifyStored(tx, rows[0]) as ReportingGroupArtifactRecord
  }
  const existing = await verifyStored(tx, await readByIdentity(tx, input.analysisIdentityHash))
  if (existing.analysisKind !== 'GROUP') reportingFail('REPORT_ANALYSIS_REUSE', 'analysis identity collides with a different artifact kind', 500)
  return existing as ReportingGroupArtifactRecord
}, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })

export const createOrReuseLongitudinalReportingArtifact = async (input: {
  organizationId: string
  seriesId: string
  specId: string
  analysisIdentityHash: string
  artifactPayload: ReportingLongitudinalArtifactPayloadV1
  snapshotHash: string
  waveBindings: ReportingLongitudinalWaveBindingV1[]
  generatedByUserId: string
  generatedAt: Date
}): Promise<ReportingLongitudinalArtifactRecord> => prisma.$transaction(async (tx) => {
  if (input.waveBindings.length < 2) reportingFail('REPORT_LONGITUDINAL_WAVES_REQUIRED', 'longitudinal artifact requires at least two Waves', 400)
  const rows = await tx.$queryRaw<ArtifactRow[]>`
    INSERT INTO "reporting_analysis_artifacts"
      ("id","organization_id","analysis_kind","policy_domain","cohort_snapshot_id","series_id","spec_id","analysis_identity_hash","artifact_payload","snapshot_hash","generated_by_user_id","generated_at")
    VALUES (${input.artifactPayload.artifactId},${input.organizationId},${input.artifactPayload.analysisKind},'ORG_GROUP_REPORT_V1',NULL,${input.seriesId},${input.specId},${input.analysisIdentityHash},
      ${JSON.stringify(input.artifactPayload)}::jsonb,${input.snapshotHash},${input.generatedByUserId},${input.generatedAt})
    ON CONFLICT ("analysis_identity_hash") DO NOTHING
    RETURNING "id", "organization_id" AS "organizationId", "analysis_kind" AS "analysisKind", "policy_domain" AS "policyDomain",
      "cohort_snapshot_id" AS "cohortSnapshotId", "series_id" AS "seriesId", "source_run_id" AS "sourceRunId",
      "source_track_id" AS "sourceTrackId", "subject_actor_snapshot_id" AS "subjectActorSnapshotId", "relationship_kind" AS "relationshipKind", "perspective",
      "spec_id" AS "specId", "analysis_identity_hash" AS "analysisIdentityHash", "artifact_payload" AS "artifactPayload", "snapshot_hash" AS "snapshotHash",
      "generated_by_user_id" AS "generatedByUserId", "generated_at" AS "generatedAt"
  `
  if (rows[0]) {
    for (const binding of input.waveBindings) {
      await tx.$executeRaw`
        INSERT INTO "reporting_analysis_artifact_waves"
          ("organization_id","artifact_id","series_id","wave_id","ordinal","input_identity_hash","wave_snapshot_hash")
        VALUES (${input.organizationId},${rows[0].id},${input.seriesId},${binding.waveId},${binding.ordinal},${binding.inputIdentityHash},${binding.snapshotHash})
      `
    }
    await tx.$executeRaw`
      INSERT INTO "organization_governance_audits"
        ("id","organization_id","actor_user_id","action","target_type","target_id","domain_event_id","payload")
      VALUES (${randomUUID()},${input.organizationId},${input.generatedByUserId},'REPORTING_ANALYSIS_CREATED','ReportingAnalysisArtifact',
        ${rows[0].id},${rows[0].id},${JSON.stringify({ analysisKind: input.artifactPayload.analysisKind, specId: input.specId, seriesId: input.seriesId, waveIds: input.waveBindings.map((binding) => binding.waveId) })}::jsonb)
    `
    return await verifyStored(tx, rows[0]) as ReportingLongitudinalArtifactRecord
  }
  const existing = await verifyStored(tx, await readByIdentity(tx, input.analysisIdentityHash))
  if (existing.analysisKind !== input.artifactPayload.analysisKind || existing.seriesId !== input.seriesId) {
    reportingFail('REPORT_ANALYSIS_REUSE', 'analysis identity collides with different longitudinal inputs', 500)
  }
  return existing as ReportingLongitudinalArtifactRecord
}, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })

export const createOrReuseProtectedReportingArtifact = async (input: {
  organizationId: string
  specId: string
  analysisIdentityHash: string
  artifactPayload: ReportingProtectedArtifactPayloadV1
  snapshotHash: string
  generatedByUserId: string
  generatedAt: Date
}): Promise<ReportingProtectedArtifactRecord> => prisma.$transaction(async (tx) => {
  const source = input.artifactPayload.source
  const rows = await tx.$queryRaw<ArtifactRow[]>`
    INSERT INTO "reporting_analysis_artifacts"
      ("id","organization_id","analysis_kind","policy_domain","cohort_snapshot_id","series_id","source_run_id","source_track_id","subject_actor_snapshot_id",
       "relationship_kind","perspective","spec_id","analysis_identity_hash","artifact_payload","snapshot_hash","generated_by_user_id","generated_at")
    VALUES (${input.artifactPayload.artifactId},${input.organizationId},'PROTECTED_FEEDBACK','ORG_PROTECTED_FEEDBACK_V1',NULL,NULL,${source.runId},${source.trackId},${source.subjectActorSnapshotId},
      ${source.relationshipKind},${source.perspective},${input.specId},${input.analysisIdentityHash},${JSON.stringify(input.artifactPayload)}::jsonb,${input.snapshotHash},${input.generatedByUserId},${input.generatedAt})
    ON CONFLICT ("analysis_identity_hash") DO NOTHING
    RETURNING "id", "organization_id" AS "organizationId", "analysis_kind" AS "analysisKind", "policy_domain" AS "policyDomain",
      "cohort_snapshot_id" AS "cohortSnapshotId", "series_id" AS "seriesId", "source_run_id" AS "sourceRunId",
      "source_track_id" AS "sourceTrackId", "subject_actor_snapshot_id" AS "subjectActorSnapshotId", "relationship_kind" AS "relationshipKind", "perspective",
      "spec_id" AS "specId", "analysis_identity_hash" AS "analysisIdentityHash", "artifact_payload" AS "artifactPayload", "snapshot_hash" AS "snapshotHash",
      "generated_by_user_id" AS "generatedByUserId", "generated_at" AS "generatedAt"
  `
  if (rows[0]) {
    const verified = await verifyStored(tx, rows[0]) as ReportingProtectedArtifactRecord
    await tx.$executeRaw`
      INSERT INTO "organization_governance_audits"
        ("id","organization_id","actor_user_id","action","target_type","target_id","domain_event_id","payload")
      VALUES (${randomUUID()},${input.organizationId},${input.generatedByUserId},'REPORTING_ANALYSIS_CREATED','ReportingAnalysisArtifact',
        ${rows[0].id},${rows[0].id},${JSON.stringify({ analysisKind: 'PROTECTED_FEEDBACK', specId: input.specId, runId: source.runId, trackId: source.trackId })}::jsonb)
    `
    return verified
  }
  const existing = await verifyStored(tx, await readByIdentity(tx, input.analysisIdentityHash))
  if (existing.analysisKind !== 'PROTECTED_FEEDBACK') reportingFail('REPORT_ANALYSIS_REUSE', 'analysis identity collides with a different artifact kind', 500)
  return existing as ReportingProtectedArtifactRecord
}, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })

export const readReportingArtifactRecord = async (artifactId: string): Promise<ReportingArtifactRecord> => prisma.$transaction(async (tx) => {
  const rows = await tx.$queryRaw<ArtifactRow[]>`
    SELECT "id", "organization_id" AS "organizationId", "analysis_kind" AS "analysisKind", "policy_domain" AS "policyDomain",
      "cohort_snapshot_id" AS "cohortSnapshotId", "series_id" AS "seriesId", "source_run_id" AS "sourceRunId",
      "source_track_id" AS "sourceTrackId", "subject_actor_snapshot_id" AS "subjectActorSnapshotId",
      "relationship_kind" AS "relationshipKind", "perspective", "spec_id" AS "specId",
      "analysis_identity_hash" AS "analysisIdentityHash", "artifact_payload" AS "artifactPayload", "snapshot_hash" AS "snapshotHash",
      "generated_by_user_id" AS "generatedByUserId", "generated_at" AS "generatedAt"
    FROM "reporting_analysis_artifacts" WHERE "id"=${artifactId} LIMIT 1
  `
  return verifyStored(tx, rows[0] ?? reportingFail('REPORT_ARTIFACT_NOT_FOUND', 'reporting artifact not found', 404))
})
