import type { PrismaClient } from '@prisma/client'
import { publishScaleMeasurement } from '../../modules/measurement-content/scale'
import { approveToolEntryPolicies } from '../../modules/assessment-governance/tool-entry-policy'
import { scaleSourcePolicyIdentity } from '../../modules/scale/onboarding/source-snapshot'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'

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
    // A published release no longer implies Training admission; record the same
    // policy identity the collection guard checks for this synthetic source.
    const registrySource = getScaleInstrumentSource(scale.code, scale.instrumentVersion)
    const identity = scale.instrumentClass === 'STANDARD' && !scale.libraryEntryId && registrySource
      ? scaleSourcePolicyIdentity(registrySource)
      : { resourceKey: 'release:' + release.releaseId, fingerprint: release.contentHash }
    await approveToolEntryPolicies(tx, identity, ['TRAINING'], scale.creatorId, 'Synthetic registered source Training admission')
    return release
  })
}
