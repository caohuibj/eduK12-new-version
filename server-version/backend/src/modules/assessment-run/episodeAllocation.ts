import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AssessmentRunRepositoryError } from './repository'

type Tx = Prisma.TransactionClient

export interface OrganizationEpisodeAllocationRecord {
  id: string
  organizationId: string
  runId: string
  trackId: string
  subjectActorSnapshotId: string
  assessmentEpisodeId: string
}

async function getOrCreateOrganizationEpisodeAllocationInTransaction(
  tx: Tx,
  input: {
    organizationId: string
    runId: string
    trackId: string
    subjectActorSnapshotId: string
    initiatedByUserId: string
    label?: string | null
  },
): Promise<OrganizationEpisodeAllocationRecord> {
  // Serialize allocation with every publish/track operation on the Run row.
  const runs = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT "status"
    FROM "assessment_runs"
    WHERE "organization_id" = ${input.organizationId}
      AND "id" = ${input.runId}
    FOR UPDATE
  `
  if (!runs[0]) throw new AssessmentRunRepositoryError('RUN_NOT_FOUND', 'Run not found', 404)

  const existing = await tx.$queryRaw<OrganizationEpisodeAllocationRecord[]>`
    SELECT "id", "organization_id" AS "organizationId", "run_id" AS "runId",
      "track_id" AS "trackId", "subject_actor_snapshot_id" AS "subjectActorSnapshotId",
      "assessment_episode_id" AS "assessmentEpisodeId"
    FROM "organization_episode_allocations"
    WHERE "run_id" = ${input.runId}
      AND "track_id" = ${input.trackId}
      AND "subject_actor_snapshot_id" = ${input.subjectActorSnapshotId}
    LIMIT 1
  `
  if (existing[0]) return existing[0]

  const actors = await tx.$queryRaw<Array<{ userId: string }>>`
    SELECT "user_id" AS "userId"
    FROM "assessment_run_actor_snapshots"
    WHERE "organization_id" = ${input.organizationId}
      AND "run_id" = ${input.runId}
      AND "id" = ${input.subjectActorSnapshotId}
    LIMIT 1
  `
  const actor = actors[0]
  if (!actor) throw new AssessmentRunRepositoryError('RUN_SUBJECT_ACTOR_NOT_FOUND', 'Frozen subject actor not found', 404)

  const episodeId = randomUUID()
  await tx.$executeRaw`
    INSERT INTO "assessment_episodes" (
      "id", "subject_user_id", "initiated_by_user_id", "initiation_mode",
      "course_id", "campaign_key", "label", "updated_at"
    ) VALUES (
      ${episodeId}, ${actor.userId}, ${input.initiatedByUserId},
      'ORGANIZATION_RUN'::"AssessmentEpisodeInitiationMode",
      NULL, NULL, ${input.label ?? null}, transaction_timestamp()
    )
  `

  const allocationId = randomUUID()
  const rows = await tx.$queryRaw<OrganizationEpisodeAllocationRecord[]>`
    INSERT INTO "organization_episode_allocations" (
      "id", "organization_id", "run_id", "track_id", "subject_actor_snapshot_id", "assessment_episode_id"
    ) VALUES (
      ${allocationId}, ${input.organizationId}, ${input.runId}, ${input.trackId},
      ${input.subjectActorSnapshotId}, ${episodeId}
    )
    RETURNING "id", "organization_id" AS "organizationId", "run_id" AS "runId",
      "track_id" AS "trackId", "subject_actor_snapshot_id" AS "subjectActorSnapshotId",
      "assessment_episode_id" AS "assessmentEpisodeId"
  `
  return rows[0]
}

export const getOrCreateOrganizationEpisodeAllocation = (input: {
  organizationId: string
  runId: string
  trackId: string
  subjectActorSnapshotId: string
  initiatedByUserId: string
  label?: string | null
}): Promise<OrganizationEpisodeAllocationRecord> => (
  prisma.$transaction((tx) => getOrCreateOrganizationEpisodeAllocationInTransaction(tx, input))
)

export { getOrCreateOrganizationEpisodeAllocationInTransaction }
