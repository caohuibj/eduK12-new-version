import { Prisma, type PrismaClient, type Scale } from '@prisma/client'
import { z } from 'zod'
import { canonicalHash } from '../../assessment-runtime/canonical'
import { assertAssessmentOperationallyActive } from '../../assessment-governance/operational-hold'
import { lockInstrumentSourceIdentity } from '../../assessment-authorization/source-identity-lock'
import { getContentRelease, publishContentRelease } from '../../measurement-content/repository'
import { ContentReleaseError, prepareRelease } from '../../measurement-content/release'
import { scaleMeasurementRelease } from '../../measurement-content/scale'
import { hashScaleDefinition } from '../scale-definition'
import { validateScaleProductDefinition } from '../product-definition-readiness'
import { assertScaleCopyPublishSource, scaleCopySourceSchema } from '../scale-copy.service'
import { publishedScaleMediaOwner, retainScaleAssessmentImages } from '../scale-image.adapter'
import { readManagedScaleSourceIdentity as standardIdentity } from '../measurement-source'
import { getScaleInstrumentSource } from './instrument-registry'
import { planStandardScalePublication } from './publish'

const operation = 'LEGACY_SCALE_MEASUREMENT_CONVERSION_V1' as const
const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const legacyScaleConversionInputSchema = z.object({
  requestId: z.string().guid(), scaleId: z.string().min(1).max(240), actorUserId: z.string().min(1).max(240),
  // An operator identifies an already verified recoverable point. This does not
  // create or verify a backup, and must never contain credentials or a dump.
  recoveryPoint: z.string().trim().min(1).max(500),
}).strict()
export const legacyScaleConversionApplySchema = legacyScaleConversionInputSchema.extend({ expectedProofHash: digest })
type Input = z.infer<typeof legacyScaleConversionInputSchema>
type Tx = Prisma.TransactionClient
type Actor = { id: string; account_domain: string; role: string; platform_role: string; teacher_approved: boolean;
  is_active: boolean; is_frozen: boolean; must_change_password: boolean; expires_at: Date | null }
const options = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 }
function fail(code: string): never { throw new ContentReleaseError('CONTENT_LEGACY_SCALE_' + code) }
async function now(tx: Tx) {
  const [clock] = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS now`)
  if (!clock) fail('CLOCK_UNAVAILABLE')
  return clock.now
}
function checkActor(actor: Actor | undefined, scale: Scale, actorId: string, at: Date) {
  if (!actor || actor.id !== actorId || !['TRAINING', 'LEGACY'].includes(actor.account_domain) || !actor.is_active
    || actor.is_frozen || actor.must_change_password || actor.expires_at && actor.expires_at <= at) fail('ACTOR_UNAVAILABLE')
  if (scale.instrumentClass === 'STANDARD') {
    // Retains the existing code-package publication authority; no new web
    // endpoint, entry-admin projection, role, grant or account is introduced.
    if (actor.platform_role !== 'SYSTEM_ADMIN') fail('SYSTEM_PUBLISHER_REQUIRED')
  } else if (scale.creatorId !== actorId || actor.role !== 'TEACHER' || !actor.teacher_approved) fail('AUTHOR_REQUIRED')
}

/** One named object only. Request -> source identity -> Scale/copy-source rows
 * -> User -> deployment/license -> release. Authorizations use the same source
 * lock as their writers. ReadCommitted deliberately sees writes after waits. */
async function lockedSource(tx: Tx, input: Input) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${operation + ':' + input.requestId},0))`)
  const before = await tx.scale.findUnique({ where: { id: input.scaleId } })
  if (!before) fail('SOURCE_MISSING')
  if (before.instrumentClass === 'STANDARD') await lockInstrumentSourceIdentity(tx,
    { instrumentKey: before.code, instrumentVersion: before.instrumentVersion }, 'READ')
  const copy = before.copySource == null ? null : scaleCopySourceSchema.safeParse(before.copySource)
  if (copy && !copy.success) fail('COPY_SOURCE_INVALID')
  const ids = [...new Set([before.id, ...(copy?.success ? [copy.data.parentId] : [])])].sort()
  await tx.$queryRaw(Prisma.sql`SELECT id FROM scales WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`)
  const scale = await tx.scale.findUnique({ where: { id: input.scaleId } })
  if (!scale || scale.code !== before.code || scale.instrumentVersion !== before.instrumentVersion
    || scale.instrumentClass !== before.instrumentClass || canonicalHash(scale.copySource) !== canonicalHash(before.copySource)) fail('SOURCE_CHANGED')
  // Survey holds User SHARE before locking its sources. Do not queue behind a
  // User writer while holding a source/Scale lock: NOWAIT breaks that possible
  // three-way queue cycle before conversion has written anything.
  let actor: Actor | undefined
  try {
    ;[actor] = await tx.$queryRaw<Actor[]>(Prisma.sql`SELECT id,account_domain,role::text,platform_role::text,teacher_approved,
      is_active,is_frozen,must_change_password,expires_at FROM users WHERE id=${input.actorUserId} FOR SHARE NOWAIT`)
  } catch (error) {
    const failure = error as { code?: string; meta?: { code?: string } }
    if (failure.code === '55P03' || failure.code === 'P2010' && failure.meta?.code === '55P03') fail('ACTOR_BUSY_RETRY')
    throw error
  }
  checkActor(actor, scale, input.actorUserId, await now(tx))
  return { scale, actor }
}


async function buildPlan(tx: Tx, input: Input, scale: Scale) {
  if (scale.status !== 'PUBLISHED') fail('SOURCE_NOT_PUBLISHED')
  if (scale.measurementReleaseId !== null) fail('ALREADY_MAPPED')
  assertAssessmentOperationallyActive({ family: 'SCALE', key: scale.code, version: scale.instrumentVersion })
  const checked = validateScaleProductDefinition(scale.definition, scale.instrumentClass)
  if (!checked.valid || !checked.definition) fail('DEFINITION_INVALID')
  const definition = checked.definition, computedDefinitionHash = hashScaleDefinition(definition)
  if (scale.definitionHash !== null && scale.definitionHash !== computedDefinitionHash) fail('DEFINITION_HASH_MISMATCH')
  let standard: Awaited<ReturnType<typeof planStandardScalePublication>> | null = null
  let deploymentIdentity: Awaited<ReturnType<typeof standardIdentity>> | null = null
  if (scale.instrumentClass === 'STANDARD') {
    const source = getScaleInstrumentSource(scale.code, scale.instrumentVersion)
    if (!source?.executable || source.executable.releaseStatus !== 'PUBLISHED') fail('REGISTRY_SOURCE_NOT_PUBLISHED')
    // Do not substitute a newer package for database bytes, even when the old
    // record's measurement-only hash happens to match.
    if (canonicalHash(scale.definition) !== canonicalHash(source.executable.definition)) fail('REGISTRY_DEFINITION_MISMATCH')
    await tx.$queryRaw(Prisma.sql`SELECT id FROM scale_deployment_policies WHERE scale_id=${scale.id} ORDER BY revision FOR SHARE`)
    standard = await planStandardScalePublication(tx, { instrumentKey: scale.code, instrumentVersion: scale.instrumentVersion,
      actorUserId: input.actorUserId, visibility: scale.visibility })
    if (!standard.allowPublish) fail('STANDARD_PUBLICATION_BLOCKED:' + standard.blockers.join(','))
    deploymentIdentity = await standardIdentity(tx, scale, await now(tx))
  } else {
    await assertScaleCopyPublishSource(tx, scale)
  }
  const source = { scaleId: scale.id, code: scale.code, instrumentClass: scale.instrumentClass, instrumentVersion: scale.instrumentVersion,
    creatorId: scale.creatorId, status: scale.status, visibility: scale.visibility, updatedAt: scale.updatedAt.toISOString(),
    recordedDefinitionHash: scale.definitionHash, recordedHashScheme: 'LEGACY_UNRECORDED',
    observedDefinitionDigest: canonicalHash(scale.definition), computedDefinitionHash, copySourceDigest: canonicalHash(scale.copySource) }
  const registered = scale.instrumentClass === 'STANDARD' ? getScaleInstrumentSource(scale.code, scale.instrumentVersion)! : null
  const releaseInput = scaleMeasurementRelease({ localId: registered ? scale.code : scale.id,
    version: registered ? [scale.instrumentVersion, definition.scoring.scoringVersion, registered.localization?.localizationVersion ?? 'unversioned'].join(':')
      : 'legacy-v1:' + canonicalHash(source), instrumentVersion: scale.instrumentVersion, definition, instrumentClass: scale.instrumentClass,
    scope: registered ? { kind: 'PLATFORM', ownerId: scale.creatorId }
      : { kind: 'PRIVATE', ownerId: scale.creatorId, product: 'TRAINING', resourceId: scale.id },
    provenance: registered ? { sourceIdentity: registered.identity }
      : { ...(scale.copySource ? { copySource: scale.copySource } : {}), conversionSource: { scaleId: scale.id,
        recordedDefinitionHash: scale.definitionHash, observedDefinitionDigest: source.observedDefinitionDigest } } })
  const target = prepareRelease(releaseInput)
  if (target.layer !== 'MEASUREMENT') fail('LAYER_MISMATCH')
  const proof = { operation, actorUserId: input.actorUserId, recoveryPoint: input.recoveryPoint, source, target: {
    key: target.key, version: target.version, contentHash: target.contentHash, measurementHash: target.content.measurementHash },
    standardPublicationProofHash: standard?.proofHash ?? null, sourceDeploymentIdentity: deploymentIdentity,
    objectCount: 1, historicalRecordWrites: 0, originalDefinitionWrites: 0 }
  return { proof, proofHash: canonicalHash(proof), releaseInput, definition }
}

/** Read-only preview. Failures remain explicit unmapped objects, never inferred
 * identities. It does not backfill old attempts, scores, templates or exports. */
export async function planLegacyScaleMeasurementConversion(db: PrismaClient, raw: unknown) {
  const input = legacyScaleConversionInputSchema.parse(raw)
  return db.$transaction(async tx => {
    const { scale, actor } = await lockedSource(tx, input)
    const plan = await buildPlan(tx, input, scale)
    checkActor(actor, scale, input.actorUserId, await now(tx))
    return { allowApply: true as const, proofHash: plan.proofHash, proof: plan.proof }
  }, options)
}

/** Trusted operator entry point, like publish-scale-instrument.ts; never expose
 * actorUserId or this method directly as an authenticated HTTP operation. */
export async function convertLegacyScaleMeasurement(db: PrismaClient, raw: unknown) {
  const input = legacyScaleConversionApplySchema.parse(raw)
  const requestHash = canonicalHash(input)
  return db.$transaction(async tx => {
    const { scale, actor } = await lockedSource(tx, input)
    const prior = await tx.scalePublicationAudit.findUnique({ where: { id: input.requestId } })
    if (prior) {
      const saved = prior.proof as { operation?: string; requestHash?: string; target?: { releaseId?: string; contentHash?: string } }
      if (prior.scaleId !== input.scaleId || prior.actorUserId !== input.actorUserId || prior.proofHash !== input.expectedProofHash
        || saved.operation !== operation || saved.requestHash !== requestHash || !saved.target?.releaseId) fail('REQUEST_CONFLICT')
      const release = await getContentRelease(tx, saved.target.releaseId, true)
      if (!release || release.layer !== 'MEASUREMENT' || release.family !== 'SCALE' || release.contentHash !== saved.target.contentHash) fail('AUDIT_TARGET_INVALID')
      checkActor(actor, scale, input.actorUserId, await now(tx))
      // Recovery reports the committed operation, even if a later explicit
      // publication changed the current pointer or retired this release.
      return { scaleId: scale.id, measurementReleaseId: release.releaseId, contentHash: release.contentHash,
        proofHash: prior.proofHash, requestId: input.requestId, converted: false }
    }
    const plan = await buildPlan(tx, input, scale)
    if (plan.proofHash !== input.expectedProofHash) fail('PREVIEW_STALE')
    await retainScaleAssessmentImages({ owner: publishedScaleMediaOwner(scale.id, plan.proof.source.computedDefinitionHash),
      definition: plan.definition, db: tx as never })
    const release = await publishContentRelease(tx, plan.releaseInput, input.actorUserId)
    if (release.layer !== 'MEASUREMENT' || release.status !== 'PUBLISHED') fail('RELEASE_NOT_PUBLISHED')
    const at = await now(tx)
    checkActor(actor, scale, input.actorUserId, at)
    if (scale.instrumentClass === 'STANDARD') {
      const liveIdentity = await standardIdentity(tx, scale, at)
      if (canonicalHash(liveIdentity) !== canonicalHash(plan.proof.sourceDeploymentIdentity)) fail('SOURCE_DEPLOYMENT_CHANGED')
    }
    const changed = await tx.$executeRaw(Prisma.sql`UPDATE scales SET measurement_release_id=${release.releaseId}
      WHERE id=${scale.id} AND measurement_release_id IS NULL AND status='PUBLISHED' AND updated_at=${scale.updatedAt}`)
    if (changed !== 1) fail('SOURCE_CHANGED')
    await tx.scalePublicationAudit.create({ data: { id: input.requestId, scaleId: scale.id, actorUserId: input.actorUserId,
      proofHash: plan.proofHash, proof: { operation, requestHash, sourceProof: plan.proof,
        target: { releaseId: release.releaseId, contentHash: release.contentHash } } as Prisma.InputJsonValue } })
    return { scaleId: scale.id, measurementReleaseId: release.releaseId, contentHash: release.contentHash,
      proofHash: plan.proofHash, requestId: input.requestId, converted: true }
  }, options)
}
