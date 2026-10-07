import { verifyPackageFixtures } from '../assessment-bundle/onboarding/fixtures'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { canonicalJsonString } from '../assessment-runtime/canonical'
import { hashDeclarativePackage, parseDeclarativePackage } from '../assessment-bundle/onboarding/contract'
import { dependencyBlockers } from '../assessment-bundle/onboarding/dependencies'
const reviewSchema=z.object({contentHash:z.string().regex(/^[a-f0-9]{64}$/),reviewerId:z.string().min(1),expiresAt:z.string().datetime(),claims:z.array(z.enum(['independent_summary','cross_source_condition','joint_conclusion'])),scientific:z.literal(true),rights:z.literal(true),language:z.literal(true),report:z.literal(true),signature:z.string().regex(/^[a-f0-9]{64}$/)}).strict()
export function validateReview(raw:unknown,hash:string,secret:string|undefined,now=Date.now()) {
  const review=reviewSchema.parse(raw),{signature,...material}=review
  if(!secret||secret.length<32)throw new Error('BUNDLE_REVIEW_KEY_REQUIRED')
  const expected=createHmac('sha256',secret).update(canonicalJsonString(material)).digest()
  if(hash!==review.contentHash||Date.parse(review.expiresAt)<=now||!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw new Error('BUNDLE_REVIEW_INVALID_OR_EXPIRED')
  return review
}
async function admin(db:Prisma.TransactionClient,id:string){const user=await db.user.findUnique({where:{id}});if(user?.role!=='ADMIN')throw new Error('BUNDLE_ADMIN_REQUIRED')}
export async function installPackage(db:PrismaClient,actorId:string,raw:unknown){
  const p=parseDeclarativePackage(raw),hash=hashDeclarativePackage(p),d=p.manifest.definition
  const existing = (await import('./code-catalog')).createCodeBundleDefinitionProvider().exact(d.bundleKey, d.bundleVersion)
  if (existing && !existing.declarativePackage) throw new Error('BUNDLE_LEGACY_IDENTITY_RESERVED')
  if (existing?.declarativePackage && hashDeclarativePackage(existing.declarativePackage) !== hash) throw new Error('BUNDLE_VERSION_IMMUTABLE')
  verifyPackageFixtures(p)
  const blockers=dependencyBlockers(p);if(blockers.length)throw new Error(blockers.join('; '))
  return db.$transaction(async tx=>{
    await admin(tx,actorId)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${d.bundleKey+'@'+d.bundleVersion},0))`
    const where={bundleKey_bundleVersion:{bundleKey:d.bundleKey,bundleVersion:d.bundleVersion}}
    const previous=await tx.bundlePackageRelease.findUnique({where})
    if(previous){if(previous.contentHash!==hash)throw new Error('BUNDLE_VERSION_IMMUTABLE');return previous}
    return tx.bundlePackageRelease.create({data:{bundleKey:d.bundleKey,bundleVersion:d.bundleVersion,contentHash:hash,content:p as unknown as Prisma.InputJsonValue,installedBy:actorId}})
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
export async function publishPackage(db:PrismaClient,actorId:string,key:string,version:string,rawReview:unknown){
  return db.$transaction(async tx=>{
    await admin(tx,actorId)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key+'@'+version},0))`
    const where={bundleKey_bundleVersion:{bundleKey:key,bundleVersion:version}},row=await tx.bundlePackageRelease.findUniqueOrThrow({where})
    if(row.status==='RETIRED')throw new Error('BUNDLE_RETIRED')
    const p=parseDeclarativePackage(row.content),review=validateReview(rawReview,row.contentHash,process.env.BUNDLE_REVIEW_SIGNING_KEY)
    await admin(tx,review.reviewerId)
    // Review is independent of the content installer. The actual publisher
    // may be that reviewer; publishedBy must identify the caller, not the installer.
    if(review.reviewerId===row.installedBy)throw new Error('BUNDLE_INDEPENDENT_REVIEW_REQUIRED')
    if(hashDeclarativePackage(p)!==row.contentHash)throw new Error('BUNDLE_CONTENT_HASH_MISMATCH')
    const blockers=dependencyBlockers(p);if(blockers.length)throw new Error(blockers.join('; '))
    if(p.rules.items.some(r=>r.kind!=='limitation'&&!review.claims.includes(r.kind)))throw new Error('BUNDLE_CLAIM_NOT_APPROVED')
    await assertPublishedDependencies(tx, p)
    return tx.bundlePackageRelease.update({where,data:{status:'PUBLISHED',review:review as Prisma.InputJsonValue,publishedBy:actorId}})
  })
}
export async function changePackageStatus(db:PrismaClient,actorId:string,key:string,version:string,status:'HOLD'|'RETIRED') {
  return db.$transaction(async tx => {
    await admin(tx,actorId)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key+'@'+version},0))`
    const where = {bundleKey_bundleVersion:{bundleKey:key,bundleVersion:version}}
    const row = await tx.bundlePackageRelease.findUniqueOrThrow({where})
    if (row.status === 'RETIRED' && status !== 'RETIRED') throw new Error('BUNDLE_RETIRED')
    // Keep signed review evidence for historical audit; lifecycle blocks new admission.
    return tx.bundlePackageRelease.update({where,data:{status}})
  })
}
export async function assertPackageAdmission(db:Prisma.TransactionClient,raw:unknown){
  const p=parseDeclarativePackage(raw),d=p.manifest.definition
  await db.$queryRaw`SELECT id FROM bundle_package_releases WHERE "bundleKey"=${d.bundleKey} AND "bundleVersion"=${d.bundleVersion} FOR SHARE`
  const row=await db.bundlePackageRelease.findUnique({where:{bundleKey_bundleVersion:{bundleKey:d.bundleKey,bundleVersion:d.bundleVersion}}})
  if(!row||row.status!=='PUBLISHED'||row.contentHash!==hashDeclarativePackage(p))throw new Error('BUNDLE_PACKAGE_NOT_PUBLISHED')
  const review=validateReview(row.review,row.contentHash,process.env.BUNDLE_REVIEW_SIGNING_KEY)
  await admin(db,review.reviewerId)
  if(review.reviewerId===row.installedBy)throw new Error('BUNDLE_INDEPENDENT_REVIEW_REQUIRED')
  const blockers = dependencyBlockers(p); if (blockers.length) throw new Error(blockers.join('; '))
  await assertPublishedDependencies(db, p)
  return row
}
