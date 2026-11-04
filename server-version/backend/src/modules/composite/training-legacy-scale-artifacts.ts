import { Prisma, type PrismaClient } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import { appendPublishedScaleArtifact, type PublishedScaleArtifactRef } from '../assessment-runtime/published-scale-artifact'
import { getContentRelease } from '../measurement-content/repository'
import { buildScaleUnitArtifact, publishedArtifactEligible, trainingContentSnapshotSchema } from './training-content-binding'
import { logger } from '../../utils/logger'

export type LegacyScaleArtifactRow = { itemId: string; artifact: PublishedScaleArtifactRef; releaseId: string; contentHash: string }
export type LegacyBackfillSkip = { compositeId: string; itemId?: string; reason: string }
export type LegacyBackfillReport = { composites: number; mapped: number; alreadyMapped: number; skipped: LegacyBackfillSkip[] }

/** START read: the verified artifact map for one exact legacy publication. */
export async function loadLegacyScaleArtifactMap(db: { $queryRaw: Prisma.TransactionClient['$queryRaw'] }, compositeId: string, publicationHash: string) {
  const rows = await db.$queryRaw<Array<{ item_id: string; artifact_hash: string; release_id: string; content_hash: string }>>(Prisma.sql`
    SELECT item_id, artifact_hash, release_id, content_hash FROM training_legacy_scale_artifacts
    WHERE composite_assessment_id=${compositeId} AND publication_hash=${publicationHash}`)
  return new Map<string, LegacyScaleArtifactRow>(rows.map(row => [row.item_id,
    { itemId: row.item_id, artifact: { formatVersion: 3, hash: row.artifact_hash }, releaseId: row.release_id, contentHash: row.content_hash }]))
}

/**
 * Local/test-only backfill. Idempotent (ON CONFLICT DO NOTHING), read-only on
 * publications. A unit whose live scale no longer reproduces the pinned
 * releaseId/contentHash is skipped, logged and reported — never fabricated.
 */
export async function backfillLegacyTrainingScaleArtifacts(db: PrismaClient, options: { compositeIds?: string[] } = {}): Promise<LegacyBackfillReport> {
  if (process.env.NODE_ENV === 'production') throw new Error('LEGACY_ARTIFACT_BACKFILL_NOT_FOR_PRODUCTION')
  const filter = options.compositeIds ? Prisma.sql`AND id = ANY(${options.compositeIds}::text[])` : Prisma.empty
  const publications = await db.$queryRaw<Array<{ id: string; snapshot: unknown; hash: string }>>(Prisma.sql`
    SELECT id, training_content_snapshot AS snapshot, training_content_snapshot_hash AS hash FROM composite_assessments
    WHERE training_content_snapshot IS NOT NULL AND training_content_snapshot->>'schemaVersion'='1' ${filter} ORDER BY id`)
  const report: LegacyBackfillReport = { composites: 0, mapped: 0, alreadyMapped: 0, skipped: [] }
  const skip = (entry: LegacyBackfillSkip) => { report.skipped.push(entry); logger.warn('legacy training artifact backfill skipped', entry) }
  for (const publication of publications) {
    report.composites++
    const parsed = trainingContentSnapshotSchema.safeParse(publication.snapshot)
    if (!parsed.success) { skip({ compositeId: publication.id, reason: 'SNAPSHOT_INVALID' }); continue }
    const snapshot = parsed.data
    if (snapshot.compositeId !== publication.id || canonicalHash(snapshot) !== publication.hash) { skip({ compositeId: publication.id, reason: 'SNAPSHOT_HASH_MISMATCH' }); continue }
    if (snapshot.educationBinding) continue
    for (const unit of snapshot.units.filter(publishedArtifactEligible)) {
      const outcome = await db.$transaction(async tx => {
        const item = await tx.compositeAssessmentItem.findFirst({ where: { id: unit.itemId, compositeAssessmentId: publication.id }, include: { scale: true } })
        const release = await getContentRelease(tx, unit.measurement.releaseId, true)
        const built = await buildScaleUnitArtifact(tx, item, unit, release)
        if (typeof built === 'string') return built
        const ref = await appendPublishedScaleArtifact(tx, built)
        const inserted = await tx.$executeRaw(Prisma.sql`INSERT INTO training_legacy_scale_artifacts
          (composite_assessment_id, publication_hash, item_id, artifact_hash, release_id, content_hash)
          VALUES (${publication.id}, ${publication.hash}, ${unit.itemId}, ${ref.hash}, ${unit.measurement.releaseId}, ${unit.measurement.contentHash})
          ON CONFLICT DO NOTHING`)
        return inserted ? 'MAPPED' : 'ALREADY'
      })
      if (outcome === 'MAPPED') report.mapped++
      else if (outcome === 'ALREADY') report.alreadyMapped++
      else skip({ compositeId: publication.id, itemId: unit.itemId, reason: outcome })
    }
  }
  return report
}
