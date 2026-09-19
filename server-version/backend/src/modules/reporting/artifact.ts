import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { reportingFail, type ReportingArtifactPayloadV1, type ReportingArtifactRecord } from './types'

type ArtifactRow = {
  id: string
  organizationId: string
  cohortSnapshotId: string
  specId: string
  analysisIdentityHash: string
  artifactPayload: ReportingArtifactPayloadV1
  snapshotHash: string
  generatedByUserId: string
  generatedAt: Date
}

const verify = (row: ArtifactRow): ReportingArtifactRecord => {
  if (
    row.artifactPayload.artifactId !== row.id
    || row.artifactPayload.organizationId !== row.organizationId
    || row.artifactPayload.cohortSnapshotId !== row.cohortSnapshotId
    || row.artifactPayload.specId !== row.specId
    || row.artifactPayload.analysisIdentityHash !== row.analysisIdentityHash
    || canonicalHash(row.artifactPayload) !== row.snapshotHash
  ) reportingFail('REPORT_ARTIFACT_INTEGRITY', 'stored reporting artifact failed integrity verification', 500)
  return row
}

export const createOrReuseReportingArtifact = async (input: {
  organizationId: string
  cohortSnapshotId: string
  specId: string
  analysisIdentityHash: string
  artifactPayload: ReportingArtifactPayloadV1
  snapshotHash: string
  generatedByUserId: string
  generatedAt: Date
}): Promise<ReportingArtifactRecord> => prisma.$transaction(async (tx) => {
  const rows = await tx.$queryRaw<ArtifactRow[]>`
    INSERT INTO "reporting_analysis_artifacts"
      ("id","organization_id","cohort_snapshot_id","spec_id","analysis_identity_hash","artifact_payload","snapshot_hash","generated_by_user_id","generated_at")
    VALUES (${input.artifactPayload.artifactId},${input.organizationId},${input.cohortSnapshotId},${input.specId},${input.analysisIdentityHash},
      ${JSON.stringify(input.artifactPayload)}::jsonb,${input.snapshotHash},${input.generatedByUserId},${input.generatedAt})
    ON CONFLICT ("analysis_identity_hash") DO NOTHING
    RETURNING "id", "organization_id" AS "organizationId", "cohort_snapshot_id" AS "cohortSnapshotId", "spec_id" AS "specId",
      "analysis_identity_hash" AS "analysisIdentityHash", "artifact_payload" AS "artifactPayload", "snapshot_hash" AS "snapshotHash",
      "generated_by_user_id" AS "generatedByUserId", "generated_at" AS "generatedAt"
  `
  if (rows[0]) {
    await tx.$executeRaw`
      INSERT INTO "organization_governance_audits"
        ("id","organization_id","actor_user_id","action","target_type","target_id","domain_event_id","payload")
      VALUES (${randomUUID()},${input.organizationId},${input.generatedByUserId},'REPORTING_ANALYSIS_CREATED','ReportingAnalysisArtifact',
        ${rows[0].id},${rows[0].id},${JSON.stringify({ specId: input.specId, cohortSnapshotId: input.cohortSnapshotId })}::jsonb)
    `
    return verify(rows[0])
  }
  const existing = await tx.$queryRaw<ArtifactRow[]>`
    SELECT "id", "organization_id" AS "organizationId", "cohort_snapshot_id" AS "cohortSnapshotId", "spec_id" AS "specId",
      "analysis_identity_hash" AS "analysisIdentityHash", "artifact_payload" AS "artifactPayload", "snapshot_hash" AS "snapshotHash",
      "generated_by_user_id" AS "generatedByUserId", "generated_at" AS "generatedAt"
    FROM "reporting_analysis_artifacts" WHERE "analysis_identity_hash"=${input.analysisIdentityHash} LIMIT 1
  `
  return verify(existing[0] ?? reportingFail('REPORT_ANALYSIS_REUSE', 'analysis create-or-reuse failed', 500))
}, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })

export const readReportingArtifactRecord = async (artifactId: string): Promise<ReportingArtifactRecord> => {
  const rows = await prisma.$queryRaw<ArtifactRow[]>`
    SELECT "id", "organization_id" AS "organizationId", "cohort_snapshot_id" AS "cohortSnapshotId", "spec_id" AS "specId",
      "analysis_identity_hash" AS "analysisIdentityHash", "artifact_payload" AS "artifactPayload", "snapshot_hash" AS "snapshotHash",
      "generated_by_user_id" AS "generatedByUserId", "generated_at" AS "generatedAt"
    FROM "reporting_analysis_artifacts" WHERE "id"=${artifactId} LIMIT 1
  `
  return verify(rows[0] ?? reportingFail('REPORT_ARTIFACT_NOT_FOUND', 'reporting artifact not found', 404))
}
