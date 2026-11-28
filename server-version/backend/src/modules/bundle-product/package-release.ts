import { verifyPackageFixtures } from '../assessment-bundle/onboarding/fixtures'
import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient, type BundlePackageRelease } from '@prisma/client'
import { z } from 'zod'
import { hashDeclarativePackage, parseDeclarativePackage } from '../assessment-bundle/onboarding/contract'
import { dependencyBlockers } from '../assessment-bundle/onboarding/dependencies'
import { isProvisionedGitScalePublisher } from '../scale/onboarding/git-release-actor'
import { GIT_RELEASE_ACTOR_ID } from '../../utils/gitReleaseIdentity'
import type { BundleDefinitionProvider } from './definition-provider'
const claimsSchema = z.array(z.enum(['independent_summary', 'cross_source_condition', 'joint_conclusion'])).max(3)
type Package = ReturnType<typeof parseDeclarativePackage>
export const gitBundleReviewSchema = z.object({
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  claims: claimsSchema.refine(value => new Set(value).size === value.length, '重复的结论批准'),
  note: z.string().trim().min(1).max(500).optional(),
}).strict()
export type GitBundleReview = z.infer<typeof gitBundleReviewSchema>
const reviewSchema = z.object({
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewerId: z.string().min(1).optional(),
  reviewedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  claims: claimsSchema.optional(),
  scientific: z.boolean().optional(),
  rights: z.boolean().optional(),
  language: z.boolean().optional(),
  report: z.boolean().optional(),
  signature: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  note: z.string().max(500).optional(),
}).passthrough()

/** Validates release content hash without enforcing human-review expiry timers, HMAC keys, or dual-admin deadlocks. */
export function validateReview(raw: unknown, hash: string, _secret?: string, _now = Date.now()) {
  const parsed = reviewSchema.safeParse(raw)
  if (!parsed.success || hash !== parsed.data.contentHash) throw new Error('BUNDLE_REVIEW_INVALID_OR_EXPIRED')
  return { ...parsed.data, claims: parsed.data.claims ?? [] }
}
async function admin(db:Prisma.TransactionClient,id:string){
  const user=await db.user.findUnique({where:{id},select:{platformRole:true,isActive:true,isFrozen:true,expiresAt:true}})
  if(!user||user.platformRole!=='SYSTEM_ADMIN'||!user.isActive||user.isFrozen
    ||(user.expiresAt&&user.expiresAt<=new Date()))throw new Error('BUNDLE_ADMIN_REQUIRED')
}
function packageWhere(bundleKey: string, bundleVersion: string) {
  return { bundleKey_bundleVersion: { bundleKey, bundleVersion } }
}
export async function lockBundleRelease(db: Prisma.TransactionClient, key: string, version: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key+'@'+version},0))`
}
export function assertBundleInstallationIdentity(catalog: BundleDefinitionProvider, pack: Package, contentHash: string) {
  const { bundleKey, bundleVersion } = pack.manifest.definition
  const existing = catalog.exact(bundleKey, bundleVersion)
  if (existing && !existing.declarativePackage) throw new Error('BUNDLE_LEGACY_IDENTITY_RESERVED')
  if (existing?.declarativePackage && hashDeclarativePackage(existing.declarativePackage) !== contentHash) {
    throw new Error('BUNDLE_VERSION_IMMUTABLE')
  }
}
async function prepareInstallation(raw: unknown) {
  const pack = parseDeclarativePackage(raw)
  const contentHash = hashDeclarativePackage(pack)
  const { createCodeBundleDefinitionProvider } = await import('./code-catalog')
  assertBundleInstallationIdentity(createCodeBundleDefinitionProvider(), pack, contentHash)
  verifyPackageFixtures(pack)
  const blockers = dependencyBlockers(pack)
  if (blockers.length) throw new Error(blockers.join('; '))
  return { pack, contentHash }
}
async function installPreparedPackage(
  tx: Prisma.TransactionClient, actorId: string, { pack, contentHash }: Awaited<ReturnType<typeof prepareInstallation>>
) {
  const { bundleKey, bundleVersion } = pack.manifest.definition
  const previous = await tx.bundlePackageRelease.findUnique({where: packageWhere(bundleKey, bundleVersion)})
  if (previous) {
    if (previous.contentHash !== contentHash) throw new Error('BUNDLE_VERSION_IMMUTABLE')
    return previous
  }
  // Bind the JSON text directly: the Prisma 5.22 JSON-object write path
  // changes some valid fractional numbers before they reach jsonb.
  const [installed] = await tx.$queryRaw<BundlePackageRelease[]>`
    INSERT INTO bundle_package_releases
      (id, "bundleKey", "bundleVersion", "contentHash", content, "installedBy", "updatedAt")
    VALUES (${randomUUID()}, ${bundleKey}, ${bundleVersion}, ${contentHash}, ${JSON.stringify(pack)}::jsonb, ${actorId}, CURRENT_TIMESTAMP)
    RETURNING *
  `
  return installed
}
export async function installPackage(db: PrismaClient, actorId: string, raw: unknown) {
  const prepared = await prepareInstallation(raw)
  const { bundleKey, bundleVersion } = prepared.pack.manifest.definition
  return db.$transaction(async tx => {
    await admin(tx, actorId)
    await lockBundleRelease(tx, bundleKey, bundleVersion)
    return installPreparedPackage(tx, actorId, prepared)
  })
}
async function assertPublishedDependencies(db: Prisma.TransactionClient, p: ReturnType<typeof parseDeclarativePackage>) {
    for(const slot of p.manifest.definition.slots){
      if(slot.unitType==='COGNITIVE'){
        const dep=p.manifest.cognitiveDependencies.find(d=>d.slotKey===slot.slotKey)!
        const cfg=await db.cognitiveTestConfig.findUnique({where:{testType_configVersion:{testType:slot.instrumentKey,configVersion:dep.configVersion}}})
        if(!cfg||cfg.status!=='PUBLISHED'||cfg.engineVersion!==dep.engineVersion||cfg.scoringVersion!==dep.scoringVersion)throw new Error('BUNDLE_COGNITIVE_DEPENDENCY_UNAVAILABLE')
      }
      if(slot.unitType==='SCALE'){const {getExecutableScalePackage}=await import('../scale/onboarding/executable-registry');if(getExecutableScalePackage(slot.instrumentKey,slot.instrumentVersion)?.releaseStatus!=='PUBLISHED')throw new Error('BUNDLE_SCALE_DEPENDENCY_UNAVAILABLE')}
      if(slot.unitType==='SITUATIONAL'){const {selectPublishedSituationPackage,listSituationPackages}=await import('../situational/situation-package.registry');if(!selectPublishedSituationPackage(listSituationPackages(),slot.instrumentKey,slot.instrumentVersion))throw new Error('BUNDLE_SJT_DEPENDENCY_UNAVAILABLE')}
    }
}
export function assertApprovedBundleClaims(pack: Package, claims: z.infer<typeof claimsSchema>) {
  if (pack.schemaVersion === 2 && !claims.includes('cross_source_condition')) throw new Error('BUNDLE_CLAIM_NOT_APPROVED')
  if (pack.rules.items.some(rule => rule.kind !== 'limitation' && !claims.includes(rule.kind))) {
    throw new Error('BUNDLE_CLAIM_NOT_APPROVED')
  }
}
async function publishInstalledPackage(
  tx: Prisma.TransactionClient, actorId: string, row: BundlePackageRelease, rawReview?: unknown
) {
  if (row.status === 'RETIRED') throw new Error('BUNDLE_RETIRED')
  if (row.status === 'PUBLISHED') return row
  const pack = parseDeclarativePackage(row.content)
  if (hashDeclarativePackage(pack) !== row.contentHash) throw new Error('BUNDLE_CONTENT_HASH_MISMATCH')
  verifyPackageFixtures(pack)
  const defaultClaims: z.infer<typeof claimsSchema> = pack.schemaVersion === 2
    ? [...new Set(['cross_source_condition' as const, ...pack.rules.items.filter(rule => rule.kind !== 'limitation').map(rule => rule.kind)])]
        .filter(claim => claim !== 'limitation')
    : []
  const candidate = rawReview ?? { contentHash: row.contentHash, claims: defaultClaims }
  const parsed = validateReview(candidate, row.contentHash)
  const explicitlyNamedClaims = rawReview !== null && typeof rawReview === 'object' && 'claims' in rawReview
  const claims = parsed.claims.length || explicitlyNamedClaims ? parsed.claims : defaultClaims
  const blockers = dependencyBlockers(pack)
  if (blockers.length) throw new Error(blockers.join('; '))
  assertApprovedBundleClaims(pack, claims)
  return publishPreparedPackage(tx, actorId, row, pack, { ...parsed, claims })
}
async function publishPreparedPackage(
  tx: Prisma.TransactionClient, actorId: string, row: BundlePackageRelease, pack: Package,
  review: ReturnType<typeof validateReview>, gitCommitSha?: string,
) {
  await assertPublishedDependencies(tx, pack)
  if (gitCommitSha) {
    const { assertGitBundleDependencies } = await import('./git-release-dependencies')
    await assertGitBundleDependencies(tx, pack)
  }
  const releaseMeta = gitCommitSha
    ? { ...review, source: 'SYSTEM_GIT_RELEASE', gitCommitSha }
    : { ...review, reviewerId: actorId, reviewedAt: new Date().toISOString() }
  return tx.bundlePackageRelease.update({
    where: packageWhere(row.bundleKey, row.bundleVersion),
    data: { status: 'PUBLISHED', review: releaseMeta as Prisma.InputJsonValue, publishedBy: actorId },
  })
}
export async function publishPackage(db: PrismaClient, actorId: string, key: string, version: string, rawReview?: unknown) {
  return db.$transaction(async tx => {
    await admin(tx, actorId)
    await lockBundleRelease(tx, key, version)
    const row = await tx.bundlePackageRelease.findUniqueOrThrow({ where: packageWhere(key, version) })
    return publishInstalledPackage(tx, actorId, row, rawReview)
  })
}
async function updateReleaseStatus(tx: Prisma.TransactionClient, row: BundlePackageRelease, status: 'HOLD' | 'RETIRED') {
  if (row.status === 'RETIRED' && status !== 'RETIRED') throw new Error('BUNDLE_RETIRED')
  // Keep release metadata for historical audit; lifecycle blocks new admission.
  // Keep manual lifecycle changes distinguishable from a Git receipt even
  // when two operations land in the same clock millisecond.
  const updatedAt = row.installedBy === GIT_RELEASE_ACTOR_ID
    ? new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1))
    : undefined
  return tx.bundlePackageRelease.update({ where: packageWhere(row.bundleKey, row.bundleVersion), data: { status, updatedAt } })
}
export async function changePackageStatus(db: PrismaClient, actorId: string, key: string, version: string, status: 'HOLD' | 'RETIRED') {
  return db.$transaction(async tx => {
    await admin(tx, actorId)
    await lockBundleRelease(tx, key, version)
    const row = await tx.bundlePackageRelease.findUniqueOrThrow({ where: packageWhere(key, version) })
    return updateReleaseStatus(tx, row, status)
  })
}

export type GitBundleAction = 'PUBLISHED' | 'RESTORED' | 'UNCHANGED' | 'WITHDRAWN' | 'RETIRED' | 'ABSENT' | 'MANUAL' | 'MANUAL_HOLD' | 'MANUAL_OVERRIDE'
type GitBundleReceipt = { rowStatus: string; rowUpdatedAt: string; contentHash: string }
export async function applyGitBundleRelease(tx: Prisma.TransactionClient, input: {
  actorId: string
  gitCommitSha: string
  pack: Package
  contentHash: string
  state: 'ONLINE' | 'HOLD' | 'WITHDRAWN' | 'RETIRED'
  effectiveState: 'ONLINE' | 'WITHDRAWN' | 'RETIRED'
  allowedEntries: ['SURVEY']
  review?: GitBundleReview
  replaces?: string
}): Promise<{ action: GitBundleAction; releaseId?: string }> {
  const { actorId, gitCommitSha, pack, contentHash, state, effectiveState, allowedEntries, replaces } = input
  const { bundleKey, bundleVersion } = pack.manifest.definition
  if (!/^[a-f0-9]{40}$/.test(gitCommitSha) || !await isProvisionedGitScalePublisher(tx, actorId)) {
    throw new Error('BUNDLE_GIT_AUTHORITY_REQUIRED')
  }
  const { review } = input
  await lockBundleRelease(tx, bundleKey, bundleVersion)
  const prior = await tx.bundlePackageRelease.findUnique({ where: packageWhere(bundleKey, bundleVersion) })
  if (prior && (prior.contentHash !== contentHash || hashDeclarativePackage(prior.content) !== contentHash)) {
    throw new Error('BUNDLE_VERSION_IMMUTABLE')
  }
  if (!prior && effectiveState !== 'ONLINE') return { action: 'ABSENT' }

  if (prior && prior.installedBy !== actorId) {
    if (effectiveState === 'ONLINE' && prior.status === 'PUBLISHED') {
      await validatePackageAdmission(tx, pack, prior, contentHash)
      const { assertGitBundleDependencies } = await import('./git-release-dependencies')
      await assertGitBundleDependencies(tx, pack)
      return { action: 'MANUAL', releaseId: prior.id }
    }
    throw new Error('BUNDLE_GIT_MANUAL_RELEASE_CONFLICT')
  }
  const receipt = prior ? (await tx.surveyEvent.findFirst({
    where: { actorUserId: actorId, action: 'GIT_BUNDLE_RELEASE_SYNCED', metadata: { path: ['releaseId'], equals: prior.id } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { metadata: true },
  }))?.metadata as GitBundleReceipt | undefined : undefined
  if (prior && (!receipt || receipt.rowStatus !== prior.status || receipt.contentHash !== contentHash
    || (prior.status === 'PUBLISHED' && prior.publishedBy !== actorId)
    || receipt.rowUpdatedAt !== prior.updatedAt.toISOString())) {
    return { action: prior.status === 'PUBLISHED' ? 'MANUAL_OVERRIDE' : 'MANUAL_HOLD', releaseId: prior.id }
  }
  if (effectiveState === 'ONLINE' && review && prior?.review) {
    const existing = validateReview(prior.review, contentHash)
    const claimKey = (claims: GitBundleReview['claims']) => [...claims].sort().join(',')
    if (typeof prior.review !== 'object' || !('source' in prior.review) || prior.review.source !== 'SYSTEM_GIT_RELEASE' ||
      existing.note !== review.note || claimKey(existing.claims) !== claimKey(review.claims)) {
      throw new Error('BUNDLE_GIT_REVIEW_IMMUTABLE')
    }
  }

  let row: BundlePackageRelease, action: GitBundleAction
  if (effectiveState === 'ONLINE') {
    if (prior?.status === 'PUBLISHED') {
      await validatePackageAdmission(tx, pack, prior, contentHash)
      const { assertGitBundleDependencies } = await import('./git-release-dependencies')
      await assertGitBundleDependencies(tx, pack)
      return { action: 'UNCHANGED', releaseId: prior.id }
    }
    if (!review) throw new Error('BUNDLE_GIT_REVIEW_HASH_REQUIRED')
    if (prior?.status === 'RETIRED') throw new Error('BUNDLE_RETIRED')
    const installed = prior ?? await installPreparedPackage(tx, actorId, { pack, contentHash })
    // A new insert must preserve the exact preflighted content across the JSONB round-trip.
    if (!prior && hashDeclarativePackage(installed.content) !== contentHash) throw new Error('BUNDLE_CONTENT_HASH_MISMATCH')
    row = await publishPreparedPackage(tx, actorId, installed, pack, review, gitCommitSha)
    action = prior ? 'RESTORED' : 'PUBLISHED'
  } else {
    if (!prior) return { action: 'ABSENT' }
    const nativeStatus = effectiveState === 'WITHDRAWN' ? 'HOLD' : 'RETIRED'
    if (prior.status === nativeStatus || prior.status === 'RETIRED') return { action: 'UNCHANGED', releaseId: prior.id }
    row = await updateReleaseStatus(tx, prior, nativeStatus)
    action = effectiveState
  }
  await tx.surveyEvent.create({ data: {
    id: randomUUID(), actorUserId: actorId, action: 'GIT_BUNDLE_RELEASE_SYNCED',
    metadata: {
      source: 'SYSTEM_GIT_RELEASE', gitCommitSha, bundleKey, bundleVersion, contentHash,
      toolKey: bundleKey, releaseKey: bundleVersion, state, effectiveState, allowedEntries,
      releaseId: row.id, rowStatus: row.status, rowUpdatedAt: row.updatedAt.toISOString(), action,
      ...(replaces ? { replaces } : {}),
    },
  } })
  return { action, releaseId: row.id }
}
export async function assertPackageAdmission(db:Prisma.TransactionClient,raw:unknown){
  const p=parseDeclarativePackage(raw),d=p.manifest.definition
  await db.$queryRaw`SELECT id FROM bundle_package_releases WHERE "bundleKey"=${d.bundleKey} AND "bundleVersion"=${d.bundleVersion} FOR SHARE`
  const row=await db.bundlePackageRelease.findUnique({where:{bundleKey_bundleVersion:{bundleKey:d.bundleKey,bundleVersion:d.bundleVersion}}})
  return validatePackageAdmission(db,p,row)
}
async function validatePackageAdmission(
  db: Prisma.TransactionClient, p: Package, row: BundlePackageRelease | null, preparedContentHash?: string,
) {
  if (!row || row.status !== 'PUBLISHED' || row.contentHash !== (preparedContentHash ?? hashDeclarativePackage(p))) {
    throw new Error('BUNDLE_PACKAGE_NOT_PUBLISHED')
  }
  const review = row.review ? validateReview(row.review, row.contentHash) : null
  if (review && p.schemaVersion === 2 && !review.claims.includes('cross_source_condition')) throw new Error('BUNDLE_CLAIM_NOT_APPROVED')
  if (!preparedContentHash) {
    const blockers = dependencyBlockers(p)
    if (blockers.length) throw new Error(blockers.join('; '))
  }
  await assertPublishedDependencies(db, p)
  return row
}
/** Exact public-directory consumption: one locked source read, with the SAME
 * review/dependency admission as native Training. No duplicate body lookup. */
export async function readPackageReleaseAdmission(db:Prisma.TransactionClient,versionId:string,contentHash:string){
  const [row]=await db.$queryRaw<BundlePackageRelease[]>`SELECT * FROM bundle_package_releases WHERE id=${versionId} AND "contentHash"=${contentHash} FOR SHARE`
  if(!row)throw new Error('BUNDLE_PACKAGE_NOT_PUBLISHED')
  const p=parseDeclarativePackage(row.content),d=p.manifest.definition
  if(d.bundleKey!==row.bundleKey||d.bundleVersion!==row.bundleVersion)throw new Error('BUNDLE_CONTENT_HASH_MISMATCH')
  return validatePackageAdmission(db,p,row)
}
