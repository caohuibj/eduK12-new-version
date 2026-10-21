import {readLibraryScaleMeasurementSource} from '../scale-library-governance/training-source'
import { Prisma, type Scale } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import { mapAuthorizationRowToDomain } from '../assessment-authorization/repository'
import { hashInstrumentAuthorizationRecord } from '../assessment-authorization/records'
import { getContentRelease, type StoredRelease } from '../measurement-content/repository'
import { ContentReleaseError, prepareRelease } from '../measurement-content/release'
import { scaleMeasurementRelease } from '../measurement-content/scale'
import { resolveScaleStartDeployment } from './deployment/service'
import { frozenDatabaseScaleDefinition } from './scale-workflow.service'
import { hashScaleDefinition } from './scale-definition'

function fail(code: string): never { throw new ContentReleaseError('CONTENT_SCALE_SOURCE_' + code) }
/** Caller holds source identity READ, source row and deployment SHARE locks.
 * This excludes the legacy runtime fallback and verifies stored license hashes. */
export async function readManagedScaleSourceRights(tx: Prisma.TransactionClient, scale: Scale, at: Date) {
  const resolution = await resolveScaleStartDeployment({ db: tx, scale, now: at })
  if (resolution.kind !== 'MANAGED_V2' || !resolution.allowNewStarts) fail('MANAGED_SOURCE_LICENSE_REQUIRED')
  const rows = await tx.instrumentAuthorization.findMany({ where: { instrumentKey: scale.code, instrumentVersion: scale.instrumentVersion },
    orderBy: [{ authorizationKey: 'asc' }, { version: 'desc' }] })
  for (const row of rows) if (hashInstrumentAuthorizationRecord(mapAuthorizationRowToDomain(row)) !== row.recordHash) fail('LICENSE_HASH_MISMATCH')
  const effective = rows.find(row => row.authorizationKey === resolution.decision.authorization?.authorizationId && row.version === resolution.decision.authorization?.version)
  if (!effective) fail('LICENSE_IDENTITY_MISSING')
  return { validFrom: effective.validFrom.toISOString(), validTo: effective.validTo.toISOString(), runtimePolicyHash: resolution.runtimePolicy.runtimePolicyHash, deploymentPolicyHash: resolution.deployment.policyHash,
    deploymentRevision: resolution.deployment.revision, authorization: resolution.decision.authorization,
    authorizationStateHash: canonicalHash(rows.map(row => ({ authorizationId: row.authorizationKey, version: row.version, recordHash: row.recordHash }))) }
}

/** Read-only source admission, not conversion/publication. Existing attempts do
 * not call it: they keep their frozen identities and their current data access. */
export async function readPublishedScaleMeasurementSource(tx: Prisma.TransactionClient, scale: Scale, releases?: ReadonlyMap<string, StoredRelease>) {
  if(scale.libraryEntryId)return readLibraryScaleMeasurementSource(tx,scale)
  if (!scale.measurementReleaseId) fail('EXPLICIT_CONVERSION_REQUIRED')
  if (scale.status !== 'PUBLISHED') fail('NOT_PUBLISHED')
  const definition = frozenDatabaseScaleDefinition(scale)
  if (scale.definitionHash !== null && scale.definitionHash !== hashScaleDefinition(definition)) fail('DEFINITION_HASH_MISMATCH')
  if (scale.instrumentClass === 'CUSTOM_DESCRIPTIVE' && (definition.license.status !== 'self_authored' || definition.license.redistribution !== 'allowed')) fail('CUSTOM_RIGHTS_UNPROVEN')
  if (scale.instrumentClass === 'STANDARD') await tx.$queryRaw(Prisma.sql`SELECT id FROM scale_deployment_policies WHERE scale_id=${scale.id} ORDER BY revision FOR SHARE`)
  const release = releases ? releases.get(scale.measurementReleaseId) : await getContentRelease(tx, scale.measurementReleaseId, true)
  if (!release || release.family !== 'SCALE' || release.layer !== 'MEASUREMENT' || release.status !== 'PUBLISHED') fail('RELEASE_NOT_PUBLISHED')
  const scope = release.scope
  if (scale.instrumentClass === 'STANDARD' ? scope.kind !== 'PLATFORM' || scope.ownerId !== scale.creatorId
    : scope.kind !== 'PRIVATE' || scope.product !== 'TRAINING' || scope.ownerId !== scale.creatorId || scope.resourceId !== scale.id) fail('SCOPE_MISMATCH')
  const expected = prepareRelease(scaleMeasurementRelease({ localId: scale.instrumentClass === 'STANDARD' ? scale.code : scale.id,
    version: release.version, instrumentVersion: scale.instrumentVersion, definition, instrumentClass: scale.instrumentClass, scope }))
  if (release.key !== expected.key || release.contentHash !== expected.contentHash || canonicalHash(release.content) !== canonicalHash(expected.content)) fail('RELEASE_MISMATCH')
  const [clock] = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS now`)
  if (!clock) fail('CLOCK_UNAVAILABLE')
  const rights = scale.instrumentClass === 'STANDARD' ? await readManagedScaleSourceRights(tx, scale, clock.now) : null
  return { release, definition, rights }
}
