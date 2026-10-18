import { Prisma, type SjtReleaseGrant } from '@prisma/client'
import { prisma } from '../../../config/database'
import { SJT_COURSE_GRANT_POLICY, sjtCourseGrantReceiptSchema, sjtCourseGrantScopeSchema,
  type SjtCourseGrantReceipt, type SjtCourseGrantScope, type SjtGrantPermission } from './grant-contract'
export * from './grant-contract'

export interface SjtGrantActor { userId: string; admin: boolean }
export interface SjtGrantRelease {
  id: string; instrumentKey: string; instrumentVersion: string
  definitionHash: string; contentDigest: string; authorizationPolicy: string | null
}
export type SjtGrantExactInput = Omit<SjtGrantRelease, 'id' | 'authorizationPolicy'>
const problem = (message: string, statusCode = 403) => Object.assign(new Error(message), { statusCode })
const hash = /^[a-f0-9]{64}$/
const auditSnapshot = (grant: SjtReleaseGrant) => JSON.parse(JSON.stringify(grant)) as Prisma.InputJsonValue
const releaseSelect = { id: true, instrumentKey: true, instrumentVersion: true,
  definitionHash: true, contentDigest: true, authorizationPolicy: true, status: true } as const
const sameRelease = (a: SjtGrantRelease, b: SjtGrantRelease) => a.id === b.id
  && a.instrumentKey === b.instrumentKey && a.instrumentVersion === b.instrumentVersion
  && a.definitionHash === b.definitionHash && a.contentDigest === b.contentDigest
  && a.authorizationPolicy === b.authorizationPolicy
function receipt(grant: SjtReleaseGrant, at = new Date()): SjtCourseGrantReceipt {
  return sjtCourseGrantReceiptSchema.parse({ policy: SJT_COURSE_GRANT_POLICY,
    grantId: grant.id, grantVersion: grant.version, permission: grant.permission,
    releaseId: grant.releaseId, instrumentKey: grant.instrumentKey, instrumentVersion: grant.instrumentVersion,
    definitionHash: grant.definitionHash, contentDigest: grant.contentDigest,
    granteeTeacherId: grant.granteeTeacherId, courseId: grant.courseId, purpose: grant.purpose,
    validFrom: grant.validFrom.toISOString(), expiresAt: grant.expiresAt.toISOString(), admittedAt: at.toISOString() })
}
async function assertAdmin(tx: Prisma.TransactionClient, actor: SjtGrantActor) {
  if (!actor.admin) throw problem('仅管理员可管理 SJT 授权')
  const user = await tx.user.findUnique({ where: { id: actor.userId },
    select: { role: true, isActive: true, isFrozen: true, expiresAt: true } })
  if (!user || user.role !== 'ADMIN' || !user.isActive || user.isFrozen
    || (user.expiresAt && user.expiresAt <= new Date())) throw problem('管理员身份已失效')
}
async function assertScope(tx: Prisma.TransactionClient, scope: SjtCourseGrantScope, now: Date) {
  const parsed = sjtCourseGrantScopeSchema.safeParse(scope)
  if (!parsed.success) throw problem('受控题包需要明确的培训课程授权范围')
  const [teacher, course] = await Promise.all([
    tx.user.findUnique({ where: { id: scope.teacherId }, select: {
      role: true, isActive: true, isFrozen: true, teacherApproved: true, expiresAt: true,
    } }),
    tx.course.findUnique({ where: { id: scope.courseId }, select: { creatorId: true, courseType: true, isLibrary: true } }),
  ])
  if (!teacher || !['TEACHER', 'ADMIN'].includes(teacher.role) || !teacher.isActive || teacher.isFrozen
    || (teacher.role === 'TEACHER' && !teacher.teacherApproved) || (teacher.expiresAt && teacher.expiresAt <= now)
    || !course || course.isLibrary || course.creatorId !== scope.teacherId || course.courseType !== 'TRAINING_COURSE')
    throw problem('SJT 授权仅限真实教师及其拥有的培训课程')
}
/** One operation-local batch. Null policy is legacy-compatible. A controlled
 * release has no standalone/global grant. Call within the existing parent
 * transaction; lock order is parent, release id, grant id, managed asset id.
 * releaseLocked may be set only after the caller locks and revalidates every
 * supplied release's exact scalar identity in that same transaction. */
export async function assertSjtCourseGrants(
  tx: Prisma.TransactionClient, releases: readonly SjtGrantRelease[],
  scope: SjtCourseGrantScope | null | undefined, permission: SjtGrantPermission = 'DISTRIBUTE',
  options: { lock?: boolean; releaseLocked?: boolean; now?: Date } = {},
): Promise<Map<string, SjtCourseGrantReceipt | null>> {
  const results = new Map<string, SjtCourseGrantReceipt | null>()
  const byId = new Map<string, SjtGrantRelease>()
  for (const r of releases) {
    const old = byId.get(r.id)
    if (old && !sameRelease(old, r)) throw problem('SJT 发布身份冲突', 409)
    byId.set(r.id, r)
    if (r.authorizationPolicy === null) results.set(r.id, null)
    else if (r.authorizationPolicy !== SJT_COURSE_GRANT_POLICY) throw problem('未知 SJT 授权策略')
  }
  const controlled = [...byId.values()].filter(r => r.authorizationPolicy === SJT_COURSE_GRANT_POLICY)
  if (!controlled.length) return results
  if (!scope || !['DISTRIBUTE', 'ADAPT'].includes(permission)) throw problem('受控题包需要课程专属授权')
  const now = options.now ?? new Date()
  await assertScope(tx, scope, now)
  const ids = controlled.map(r => r.id).sort()
  if (options.lock && !options.releaseLocked) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM sjt_author_releases WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`)
  }
  if (!options.releaseLocked) {
    const current = await tx.sjtAuthorRelease.findMany({ where: { id: { in: ids } }, select: releaseSelect })
    const currentById = new Map(current.map(r => [r.id, r]))
    for (const r of controlled) {
      const actual = currentById.get(r.id)
      if (!actual || actual.status !== 'PUBLISHED' || !sameRelease(r, actual))
        throw problem('SJT 发布版本已变化或停用', 409)
    }
  }
  if (options.lock) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM sjt_release_grants
      WHERE release_id IN (${Prisma.join(ids)}) AND grantee_teacher_id=${scope.teacherId}
      AND course_id=${scope.courseId} AND purpose=${scope.purpose} AND permission=${permission}
      ORDER BY id FOR SHARE`)
  }
  const admittedAt = options.now ?? new Date()
  const grants = await tx.sjtReleaseGrant.findMany({ where: { releaseId: { in: ids },
    granteeTeacherId: scope.teacherId, courseId: scope.courseId, purpose: scope.purpose,
    permission, status: 'ACTIVE', validFrom: { lte: admittedAt }, expiresAt: { gt: admittedAt } }, orderBy: { id: 'asc' } })
  for (const r of controlled) {
    if (!hash.test(r.definitionHash) || !hash.test(r.contentDigest)) throw problem('SJT 发布摘要无效', 409)
    const matches = grants.filter(g => g.status === 'ACTIVE' && g.permission === permission
      && g.granteeTeacherId === scope.teacherId && g.courseId === scope.courseId && g.purpose === scope.purpose
      && g.validFrom <= admittedAt && g.expiresAt > admittedAt
      && g.releaseId === r.id && g.instrumentKey === r.instrumentKey
      && g.instrumentVersion === r.instrumentVersion && g.definitionHash === r.definitionHash
      && g.contentDigest === r.contentDigest)
    if (matches.length !== 1) throw problem(`缺少有效的 ${permission} 课程授权`)
    results.set(r.id, receipt(matches[0], admittedAt))
  }
  return results
}

export async function createSjtReleaseGrant(actor: SjtGrantActor, releaseId: string,
  input: SjtGrantExactInput & { granteeTeacherId: string; courseId: string; purpose: 'TRAINING_COURSE';
    permission: SjtGrantPermission; validFrom: Date; expiresAt: Date; note: string }) {
  return prisma.$transaction(async tx => {
    await assertAdmin(tx, actor)
    const now = new Date()
    if (!['DISTRIBUTE', 'ADAPT'].includes(input.permission) || !Number.isFinite(input.validFrom.getTime())
      || !Number.isFinite(input.expiresAt.getTime()) || input.expiresAt <= input.validFrom
      || input.expiresAt <= now || !input.note.trim()) throw problem('授权用途、时限或说明无效', 400)
    // Course ownership is protected before the release/grant locks.
    await tx.$queryRaw`SELECT id FROM courses WHERE id=${input.courseId} FOR SHARE`
    await assertScope(tx, { teacherId: input.granteeTeacherId, courseId: input.courseId, purpose: input.purpose }, now)
    await tx.$queryRaw`SELECT id FROM sjt_author_releases WHERE id=${releaseId} FOR SHARE`
    const release = await tx.sjtAuthorRelease.findUnique({ where: { id: releaseId }, select: releaseSelect })
    if (!release || release.status !== 'PUBLISHED' || release.authorizationPolicy !== SJT_COURSE_GRANT_POLICY
      || !sameRelease(release, { ...input, id: releaseId, authorizationPolicy: SJT_COURSE_GRANT_POLICY }))
      throw problem('只能授权精确匹配的受控已发布版本', 409)
    if (input.expiresAt <= new Date()) throw problem('授权有效期已结束', 409)
    const grant = await tx.sjtReleaseGrant.create({ data: { releaseId,
      instrumentKey: release.instrumentKey, instrumentVersion: release.instrumentVersion,
      definitionHash: release.definitionHash, contentDigest: release.contentDigest,
      granteeTeacherId: input.granteeTeacherId, courseId: input.courseId, purpose: input.purpose,
      permission: input.permission, validFrom: input.validFrom, expiresAt: input.expiresAt,
      grantorId: actor.userId, note: input.note.trim() } })
    await tx.sjtReleaseGrantAudit.create({ data: { grantId: grant.id, actorId: actor.userId,
      action: 'CREATE', version: grant.version, note: grant.note, snapshot: auditSnapshot(grant) } })
    return grant
  }).catch(error => {
    if ((error as { code?: string }).code === 'P2002') throw problem('该范围已有有效授权，请先撤销旧授权', 409)
    throw error
  })
}
export async function revokeSjtReleaseGrant(actor: SjtGrantActor, id: string, version: number, note: string) {
  return prisma.$transaction(async tx => {
    await assertAdmin(tx, actor)
    if (!note.trim()) throw problem('请填写撤销说明', 400)
    const initial = await tx.sjtReleaseGrant.findUnique({ where: { id }, select: { releaseId: true } })
    if (!initial) throw problem('授权不存在', 404)
    await tx.$queryRaw`SELECT id FROM sjt_author_releases WHERE id=${initial.releaseId} FOR SHARE`
    await tx.$queryRaw`SELECT id FROM sjt_release_grants WHERE id=${id} FOR UPDATE`
    const changed = await tx.sjtReleaseGrant.updateMany({ where: { id, version, status: 'ACTIVE' },
      data: { status: 'REVOKED', version: { increment: 1 }, revokedAt: new Date(), revokedBy: actor.userId, revokeNote: note.trim() } })
    if (changed.count !== 1) throw problem('授权已变化或已撤销，请重新加载', 409)
    const grant = await tx.sjtReleaseGrant.findUniqueOrThrow({ where: { id } })
    await tx.sjtReleaseGrantAudit.create({ data: { grantId: id, actorId: actor.userId,
      action: 'REVOKE', version: grant.version, note: note.trim(), snapshot: auditSnapshot(grant) } })
    return grant
  })
}
export async function listSjtReleaseGrants(actor: SjtGrantActor, releaseId: string) {
  return prisma.sjtReleaseGrant.findMany({ where: { releaseId,
    ...(actor.admin ? {} : { granteeTeacherId: actor.userId }) }, orderBy: { createdAt: 'desc' }, take: 200 })
}
export async function listSjtControlledReleases(actor: SjtGrantActor) {
  // Lightweight scalar catalog: no package, template, answer key, or grantor audit blobs.
  return prisma.sjtAuthorRelease.findMany({ where: { authorizationPolicy: SJT_COURSE_GRANT_POLICY,
    ...(actor.admin ? {} : { grants: { some: { granteeTeacherId: actor.userId } } }) },
    select: { ...releaseSelect, authorId: true, grants: { where: actor.admin ? {} : { granteeTeacherId: actor.userId },
      orderBy: { createdAt: 'desc' }, take: 200 } }, orderBy: { createdAt: 'desc' }, take: 200 })
}
