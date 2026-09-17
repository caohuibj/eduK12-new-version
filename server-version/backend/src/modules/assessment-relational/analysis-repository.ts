import { randomUUID } from 'node:crypto'
import type { RelationalSqlClient } from './repository'
import type { RelationalCohortAnalysisSnapshotV1 } from './analysis'
import type { RelationalResourceKindV1 } from './types'

export interface RelationalCohortScopeV1 {
  subjectUserId: string
  courseId: string
  episodeId: string
  resourceKind: RelationalResourceKindV1
  resourceKey: string
  resourceVersion: string
  applicabilityHash: string
}

export interface RelationalAnalysisRepository {
  saveCohort(snapshot: RelationalCohortAnalysisSnapshotV1): Promise<string>
  latestCohort(input: RelationalCohortScopeV1): Promise<RelationalCohortAnalysisSnapshotV1 | null>
}

export const createSqlRelationalAnalysisRepository = (
  db: RelationalSqlClient,
): RelationalAnalysisRepository => ({
  async saveCohort(snapshot) {
    const id = randomUUID()
    await db.$executeRawUnsafe(
      `INSERT INTO relational_analysis_snapshots (
        id, subject_user_id, resource_kind, resource_key, resource_version,
        analysis_kind, policy_key, policy_version, policy_hash, respondent_count,
        input_result_hashes_json, payload_json, snapshot_hash, created_at
      ) VALUES ($1,$2,$3,$4,$5,'COHORT_AGGREGATE',$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13::timestamp)`,
      id,
      snapshot.subjectUserId,
      snapshot.resourceKind,
      snapshot.resourceKey,
      snapshot.resourceVersion,
      snapshot.policyKey,
      snapshot.policyVersion,
      snapshot.policyHash,
      snapshot.respondentCount,
      JSON.stringify(snapshot.inputResultHashes),
      JSON.stringify(snapshot),
      snapshot.snapshotHash,
      snapshot.createdAt,
    )
    return id
  },

  async latestCohort(input) {
    const rows = await db.$queryRawUnsafe<Array<{ payload: RelationalCohortAnalysisSnapshotV1 }>>(
      `SELECT payload_json AS payload
       FROM relational_analysis_snapshots
       WHERE subject_user_id = $1
         AND resource_kind = $2
         AND resource_key = $3
         AND resource_version = $4
         AND payload_json->>'courseId' = $5
         AND payload_json->>'episodeId' = $6
         AND payload_json->>'applicabilityHash' = $7
         AND analysis_kind = 'COHORT_AGGREGATE'
       ORDER BY created_at DESC LIMIT 1`,
      input.subjectUserId,
      input.resourceKind,
      input.resourceKey,
      input.resourceVersion,
      input.courseId,
      input.episodeId,
      input.applicabilityHash,
    )
    return rows[0]?.payload ?? null
  },
})
