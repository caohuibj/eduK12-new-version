import type { PrismaClient } from '@prisma/client'
import { publishScaleMeasurement } from '../../modules/measurement-content/scale'

/** Synthetic fixture setup only. Production registration never converts a source
 * or creates a release; a real source owner must explicitly publish/convert it. */
export async function publishRegisteredScaleFixture(db: PrismaClient, scaleId: string) {
  return db.$transaction(async tx => {
    const scale = await tx.scale.findUniqueOrThrow({ where: { id: scaleId } })
    const release = await publishScaleMeasurement(tx, {
      localId: scale.id, version: 'synthetic-registration-v1',
      instrumentVersion: scale.instrumentVersion, definition: scale.definition,
      instrumentClass: scale.instrumentClass,
      scope: { kind: 'PRIVATE', product: 'TRAINING', ownerId: scale.creatorId, resourceId: scale.id },
    }, scale.creatorId)
    await tx.scale.update({ where: { id: scale.id }, data: { measurementReleaseId: release.releaseId } })
    return release
  })
}
