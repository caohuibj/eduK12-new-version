import { sjtMeasurementRelease } from '../../measurement-content/sjt'
import { publishContentRelease } from '../../measurement-content/repository'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../config/database'
import { canonicalHash } from '../../assessment-runtime/canonical'
import {
  listSituationPackages,
  validateSituationPackage,
  type SituationPackage,
} from '../situation-package.registry'
import { compileSjtAuthorDocument, assertSjtAuthorReleaseReady } from './dispatcher'
import { assertSjtCourseGrants, lockSjtGrantScope, SJT_COURSE_GRANT_POLICY, sjtAdaptationSourceSchema,
  type SjtGrantExactInput, type SjtAdaptationSource } from './grants'
import { assertSjtAuthorMedia, retainSjtAuthorReleaseMedia, type SjtAuthorMediaOptions } from './media'

export interface SjtAuthorActor {
  userId: string
  admin: boolean
}
const problem = (message: string, statusCode = 409) =>
  Object.assign(new Error(message), { statusCode })
const json = (v: unknown) => v as Prisma.InputJsonValue
const assertUnreserved = (key: string) => {
  if (listSituationPackages().some((p) => p.key === key))
    throw problem('该标识属于代码题包，请使用新的上传题包标识')
}
const assertAccess = (ownerId: string, actor: SjtAuthorActor) => {
  if (ownerId !== actor.userId && !actor.admin) throw problem('无权限读取该草稿', 403)
}

async function adaptationMediaOptions(
  tx: Prisma.TransactionClient, draft: { ownerId: string; adaptationSource: unknown; authorizationPolicy: string | null },
  lock: boolean,
): Promise<SjtAuthorMediaOptions> {
  if (draft.adaptationSource == null) return {}
  const parsed = sjtAdaptationSourceSchema.safeParse(draft.adaptationSource)
  if (!parsed.success || draft.authorizationPolicy !== SJT_COURSE_GRANT_POLICY)
    throw problem('改编来源记录无效', 403)
  const source = parsed.data
  if (source.receipt.granteeTeacherId !== draft.ownerId) throw problem('改编来源教师身份不匹配', 403)
  const release = await tx.sjtAuthorRelease.findUnique({ where: { id: source.receipt.releaseId },
    select: { id: true, instrumentKey: true, instrumentVersion: true, definitionHash: true, contentDigest: true,
      authorizationPolicy: true, sourceDraftId: true, authorId: true, status: true } })
  if (!release || release.sourceDraftId !== source.sourceDraftId || release.authorId !== source.sourceAuthorId
    || release.instrumentKey !== source.receipt.instrumentKey || release.instrumentVersion !== source.receipt.instrumentVersion
    || release.definitionHash !== source.receipt.definitionHash || release.contentDigest !== source.receipt.contentDigest)
    throw problem('改编来源发布身份不匹配', 409)
  const grants = await assertSjtCourseGrants(tx, [release], {
    teacherId: draft.ownerId, courseId: source.receipt.courseId, purpose: source.receipt.purpose,
  }, 'ADAPT', { lock })
  const grant = grants.get(release.id)
  if (!grant || grant.grantId !== source.receipt.grantId || grant.grantVersion !== source.receipt.grantVersion)
    throw problem('改编来源授权已变化', 403)
  const original = await tx.sjtAuthorDraft.findUnique({ where: { id: source.sourceDraftId } })
  if (!original || original.status !== 'PUBLISHED' || original.contentDigest !== release.contentDigest
    || original.ownerId !== source.sourceAuthorId) throw problem('改编来源草稿身份不匹配', 409)
  return { adaptSource: { template: original.template, sourceOwnerId: source.sourceAuthorId,
    grantId: grant.grantId, provenance: source } }
}
function assertPolicy(policy: unknown): asserts policy is typeof SJT_COURSE_GRANT_POLICY | null | undefined {
  if (policy != null && policy !== SJT_COURSE_GRANT_POLICY) throw problem('未知发布授权策略', 400)
}
function assertAdaptedVersion(source: unknown, template: { instrumentVersion: string }) {
  if (source == null) return
  const parsed = sjtAdaptationSourceSchema.safeParse(source)
  if (!parsed.success || template.instrumentVersion === parsed.data.receipt.instrumentVersion)
    throw problem('改编必须使用新的内容版本', 409)
}
export async function createSjtDraft(actor: SjtAuthorActor, input: unknown,
  options: { authorizationPolicy?: typeof SJT_COURSE_GRANT_POLICY | null } = {}) {
  assertPolicy(options.authorizationPolicy)
  const c = compileSjtAuthorDocument(input)
  assertUnreserved(c.template.instrumentKey)
  return prisma.$transaction(async (tx) => {
    await assertSjtAuthorMedia(tx, actor.userId, c.template)
    const draft = await tx.sjtAuthorDraft.create({
      data: { ownerId: actor.userId, template: json(c.template), contentDigest: c.contentDigest,
        authorizationPolicy: options.authorizationPolicy ?? null },
    })
    await tx.sjtAuthorAudit.create({
      data: {
        draftId: draft.id,
        actorId: actor.userId,
        revision: 1,
        action: 'UPLOAD',
        authorizationPolicy: options.authorizationPolicy ?? null,
        contentDigest: c.contentDigest,
        template: json(c.template),
      },
    })
    return draft
  })
}
export async function listSjtDrafts(actor: SjtAuthorActor) {
  const drafts = await prisma.sjtAuthorDraft.findMany({
    where: actor.admin ? {} : { ownerId: actor.userId },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })
  return drafts.map((d) => {
    const t = d.template as Record<string, unknown>
    return {
      ...d,
      template: {
        templateVersion: t.templateVersion,
        title: t.title,
        instrumentKey: t.instrumentKey,
        instrumentVersion: t.instrumentVersion,
      },
    }
  })
}
export async function getSjtDraft(actor: SjtAuthorActor, id: string) {
  const draft = await prisma.sjtAuthorDraft.findUnique({
    where: { id },
    include: {
      audits: { orderBy: { createdAt: 'desc' }, take: 100 },
      release: { select: { id: true, status: true, instrumentKey: true, instrumentVersion: true,
        definitionHash: true, contentDigest: true, authorizationPolicy: true } },
    },
  })
  if (!draft) throw problem('草稿不存在', 404)
  assertAccess(draft.ownerId, actor)
  if (draft.status !== 'PUBLISHED') await adaptationMediaOptions(prisma, draft, false)
  return draft
}
export async function reviseSjtDraft(
  actor: SjtAuthorActor,
  id: string,
  revision: number,
  input: unknown,
  audit: { action: 'REVISE' | 'RESTORE'; note?: string } = { action: 'REVISE' },
) {
  const c = compileSjtAuthorDocument(input)
  assertUnreserved(c.template.instrumentKey)
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sjt_author_drafts WHERE id=${id} FOR UPDATE`
    const old = await tx.sjtAuthorDraft.findUnique({ where: { id } })
    if (!old) throw problem('草稿不存在', 404)
    // Administrators review; authors own edits, keeping the reviewer independent.
    if (old.ownerId !== actor.userId) throw problem('仅作者可修订草稿', 403)
    if (old.status === 'PUBLISHED') throw problem('发布内容不可修改，请另建新版本')
    assertAdaptedVersion(old.adaptationSource, c.template)
    const mediaOptions = await adaptationMediaOptions(tx, old, true)
    await assertSjtAuthorMedia(tx, old.ownerId, c.template, mediaOptions)
    const result = await tx.sjtAuthorDraft.updateMany({
      where: { id, revision, status: old.status },
      data: {
        template: json(c.template),
        contentDigest: c.contentDigest,
        revision: { increment: 1 },
        status: 'DRAFT',
      },
    })
    if (result.count !== 1) throw problem('草稿已变化，请重新加载')
    await tx.sjtAuthorAudit.create({
      data: {
        draftId: id,
        actorId: actor.userId,
        revision: revision + 1,
        action: audit.action,
        authorizationPolicy: old.authorizationPolicy,
        contentDigest: c.contentDigest,
        template: json(c.template),
        ...(audit.note ? { note: audit.note } : {}),
      },
    })
    return tx.sjtAuthorDraft.findUniqueOrThrow({ where: { id } })
  })
}
export async function requestSjtReview(
  actor: SjtAuthorActor, id: string, revision: number, digest: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sjt_author_drafts WHERE id=${id} FOR UPDATE`
    const draft = await tx.sjtAuthorDraft.findUnique({ where: { id } })
    if (!draft) throw problem('草稿不存在', 404)
    if (draft.ownerId !== actor.userId) throw problem('仅作者可提交审核', 403)
    if (draft.revision !== revision || draft.status !== 'DRAFT' || draft.contentDigest !== digest)
      throw problem('草稿已变化或不可提交审核')
    const c = compileSjtAuthorDocument(draft.template)
    assertSjtAuthorReleaseReady(c)
    assertAdaptedVersion(draft.adaptationSource, c.template)
    if (c.contentDigest !== digest) throw problem('内容摘要已变化')
    const mediaOptions = await adaptationMediaOptions(tx, draft, true)
    await assertSjtAuthorMedia(tx, draft.ownerId, c.template, mediaOptions)
    const changed = await tx.sjtAuthorDraft.updateMany({
      where: { id, revision, contentDigest: digest, status: 'DRAFT' }, data: { status: 'IN_REVIEW' },
    })
    if (changed.count !== 1) throw problem('草稿已变化或不可提交审核')
    await tx.sjtAuthorAudit.create({ data: { draftId: id, actorId: actor.userId, revision,
      action: 'REQUEST_REVIEW', contentDigest: digest, authorizationPolicy: draft.authorizationPolicy } })
    return tx.sjtAuthorDraft.findUniqueOrThrow({ where: { id } })
  })
}
export async function reviewSjtDraft(
  actor: SjtAuthorActor,
  id: string,
  revision: number,
  digest: string,
  approve: boolean,
  note: string,
) {
  if (!actor.admin) throw problem('仅管理员可审核发布', 403)
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "sjt_author_drafts" WHERE "id" = ${id} FOR UPDATE`
      const draft = await tx.sjtAuthorDraft.findUnique({ where: { id } })
      if (!draft) throw problem('草稿不存在', 404)
      if (draft.ownerId === actor.userId) throw problem('作者不能审核自己的上传内容', 403)
      if (
        draft.status !== 'IN_REVIEW' ||
        draft.revision !== revision ||
        draft.contentDigest !== digest
      )
        throw problem('待审核内容已变化')
      const c = compileSjtAuthorDocument(draft.template)
      assertUnreserved(c.template.instrumentKey)
      if (c.contentDigest !== digest) throw problem('存储内容摘要不一致')
      assertAdaptedVersion(draft.adaptationSource, c.template)
      const mediaOptions = await adaptationMediaOptions(tx, draft, true)
      if (approve) {
        assertSjtAuthorReleaseReady(c)
        await assertSjtAuthorMedia(tx, draft.ownerId, c.template, mediaOptions)
        const pkg = { ...c.package, releaseStatus: 'PUBLISHED' as const }
        const existing = await tx.sjtAuthorRelease.findUnique({
          where: {
            instrumentKey_instrumentVersion: {
              instrumentKey: pkg.key,
              instrumentVersion: pkg.instrumentVersion,
            },
          },
        })
        if (existing) throw problem('该版本已存在，请增加内容版本')
        const release = await tx.sjtAuthorRelease.create({
          data: {
            instrumentKey: pkg.key,
            instrumentVersion: pkg.instrumentVersion,
            sourceDraftId: id,
            contentDigest: digest,
            authorizationPolicy: draft.authorizationPolicy,
            definitionHash: c.definitionHash,
            package: json(pkg),
            authorId: draft.ownerId,
            reviewerId: actor.userId,
          },
        })
        await retainSjtAuthorReleaseMedia(tx, draft.ownerId, release.id, c.template, mediaOptions)
        const contentRelease = await publishContentRelease(tx, sjtMeasurementRelease({
          localId: pkg.key, version: pkg.instrumentVersion, instrumentVersion: pkg.instrumentVersion,
          definition: pkg.definition, onlineProtocol: pkg.online,
          scope: { kind: 'PLATFORM', ownerId: draft.ownerId },
          provenance: { authorReleaseId: release.id, adaptationSource: draft.adaptationSource ?? null },
        }), actor.userId)
        await tx.$executeRaw`UPDATE sjt_author_releases SET measurement_release_id=${contentRelease.releaseId} WHERE id=${release.id}`
      }
      await tx.sjtAuthorDraft.update({
        where: { id },
        data: { status: approve ? 'PUBLISHED' : 'DRAFT' },
      })
      await tx.sjtAuthorAudit.create({
        data: {
          draftId: id,
          actorId: actor.userId,
          revision,
          action: approve ? 'APPROVE_RELEASE' : 'RETURN',
          authorizationPolicy: draft.authorizationPolicy,
          contentDigest: digest,
          note,
        },
      })
      return tx.sjtAuthorDraft.findUniqueOrThrow({ where: { id } })
    },
    { timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  )
}
export async function listUploadedSjtPackages(): Promise<SituationPackage[]> {
  const releases = await prisma.sjtAuthorRelease.findMany({
    where: { status: 'PUBLISHED', authorizationPolicy: null },
    take: 500,
  })
  return releases.map((r) => {
    const pkg = r.package as unknown as SituationPackage
    const validation = validateSituationPackage(pkg)
    if (
      !validation.valid ||
      validation.definitionHash !== r.definitionHash ||
      pkg.key !== r.instrumentKey ||
      pkg.instrumentVersion !== r.instrumentVersion ||
      pkg.releaseStatus !== 'PUBLISHED'
    )
      throw problem('上传题包的发布记录校验失败', 500)
    return pkg
  })
}
export async function availableSjtPackages(): Promise<SituationPackage[]> {
  const builtins = listSituationPackages(),
    uploaded = await listUploadedSjtPackages()
  if (uploaded.some((u) => builtins.some((b) => b.key === u.key)))
    throw problem('代码题包与上传题包标识冲突', 500)
  return [...builtins, ...uploaded]
}
export function diffSjtTemplates(before: unknown, after: unknown) {
  const a = compileSjtAuthorDocument(before).template as unknown as Record<string, unknown>,
    b = compileSjtAuthorDocument(after).template as unknown as Record<string, unknown>
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (key) => canonicalHash(a[key] ?? null) !== canonicalHash(b[key] ?? null),
  )
}

export async function restoreSjtRevision(
  actor: SjtAuthorActor,
  id: string,
  revision: number,
  targetRevision: number,
) {
  const draft = await getSjtDraft(actor, id)
  if (draft.ownerId !== actor.userId) throw problem('仅作者可恢复草稿', 403)
  const old = await prisma.sjtAuthorAudit.findFirst({
    where: { draftId: id, revision: targetRevision, template: { not: Prisma.DbNull } },
    orderBy: { createdAt: 'desc' },
  })
  if (!old) throw problem('修订记录不存在', 404)
  return reviseSjtDraft(actor, id, revision, old.template, {
    action: 'RESTORE',
    note: `恢复修订 ${targetRevision}`,
  })
}
export async function retireSjtRelease(actor: SjtAuthorActor, id: string, note: string) {
  if (!actor.admin) throw problem('仅管理员可停用题包', 403)
  return prisma.$transaction(async (tx) => {
    const release = await tx.sjtAuthorRelease.findUnique({ where: { sourceDraftId: id } })
    if (!release || release.status !== 'PUBLISHED') throw problem('发布版本不存在或已停用', 404)
    const changed = await tx.sjtAuthorRelease.updateMany({
      where: { id: release.id, status: 'PUBLISHED' },
      data: { status: 'RETIRED' },
    })
    if (changed.count !== 1) throw problem('发布版本已停用', 409)
    await tx.sjtAuthorAudit.create({
      data: {
        draftId: id,
        actorId: actor.userId,
        revision: (await tx.sjtAuthorDraft.findUniqueOrThrow({ where: { id } })).revision,
        action: 'RETIRE',
        contentDigest: release.contentDigest,
        note,
      },
    })
  })
}
export async function projectSjtReleaseStatus<
  T extends {
    instrument: { key: string; version: string; scoringVersion: string; releaseStatus: string }
  },
>(data: T): Promise<T> {
  if (data.instrument.scoringVersion !== 'author-key-sum-v1' && !data.instrument.scoringVersion.startsWith('sjt-online-')) return data
  const release = await prisma.sjtAuthorRelease.findUnique({
    where: {
      instrumentKey_instrumentVersion: {
        instrumentKey: data.instrument.key,
        instrumentVersion: data.instrument.version,
      },
    },
    select: { status: true },
  })
  return {
    ...data,
    instrument: { ...data.instrument, releaseStatus: release?.status ?? 'RETIRED' },
  }
}


export async function setSjtDraftPolicy(actor: SjtAuthorActor, id: string, revision: number,
  authorizationPolicy: typeof SJT_COURSE_GRANT_POLICY | null) {
  assertPolicy(authorizationPolicy)
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM sjt_author_drafts WHERE id=${id} FOR UPDATE`
    const draft = await tx.sjtAuthorDraft.findUnique({ where: { id } })
    if (!draft) throw problem('草稿不存在', 404)
    if (draft.ownerId !== actor.userId) throw problem('仅作者可选择草稿发布策略', 403)
    if (draft.status === 'PUBLISHED' || draft.revision !== revision) throw problem('草稿已变化或已发布')
    if (draft.authorizationPolicy === SJT_COURSE_GRANT_POLICY && authorizationPolicy !== SJT_COURSE_GRANT_POLICY)
      throw problem('受控发布策略不可降级', 403)
    await adaptationMediaOptions(tx, draft, true)
    const changed = await tx.sjtAuthorDraft.updateMany({ where: { id, revision, status: draft.status },
      data: { authorizationPolicy, revision: { increment: 1 }, status: 'DRAFT' } })
    if (changed.count !== 1) throw problem('草稿已变化')
    await tx.sjtAuthorAudit.create({ data: { draftId: id, actorId: actor.userId, revision: revision + 1,
      action: 'SET_AUTHORIZATION_POLICY', authorizationPolicy, contentDigest: draft.contentDigest,
      note: authorizationPolicy ?? 'LEGACY_NULL' } })
    return tx.sjtAuthorDraft.findUniqueOrThrow({ where: { id } })
  })
}

export async function adaptSjtRelease(actor: SjtAuthorActor, releaseId: string,
  input: SjtGrantExactInput & { courseId: string; grantId: string; grantVersion: number;
    newInstrumentKey: string; newInstrumentVersion: string }) {
  return prisma.$transaction(async tx => {
    await lockSjtGrantScope(tx, { teacherId: actor.userId, courseId: input.courseId, purpose: 'TRAINING_COURSE' })
    await tx.$queryRaw`SELECT id FROM sjt_author_releases WHERE id=${releaseId} FOR SHARE`
    const release = await tx.sjtAuthorRelease.findUnique({ where: { id: releaseId } })
    if (!release || release.status !== 'PUBLISHED' || release.authorizationPolicy !== SJT_COURSE_GRANT_POLICY
      || release.instrumentKey !== input.instrumentKey || release.instrumentVersion !== input.instrumentVersion
      || release.definitionHash !== input.definitionHash || release.contentDigest !== input.contentDigest)
      throw problem('改编来源必须精确匹配已发布受控版本', 409)
    if (input.newInstrumentVersion === release.instrumentVersion) throw problem('改编必须使用新的内容版本')
    const grants = await assertSjtCourseGrants(tx, [release], { teacherId: actor.userId,
      courseId: input.courseId, purpose: 'TRAINING_COURSE' }, 'ADAPT', { lock: true, releaseLocked: true })
    const receipt = grants.get(releaseId)
    if (!receipt || receipt.grantId !== input.grantId || receipt.grantVersion !== input.grantVersion)
      throw problem('改编授权已变化，请重新加载', 409)
    const source = await tx.sjtAuthorDraft.findUnique({ where: { id: release.sourceDraftId } })
    if (!source || source.status !== 'PUBLISHED' || source.ownerId !== release.authorId
      || source.contentDigest !== release.contentDigest) throw problem('来源发布草稿身份不匹配', 409)
    const existing = await tx.sjtAuthorRelease.findUnique({ where: { instrumentKey_instrumentVersion: {
      instrumentKey: input.newInstrumentKey, instrumentVersion: input.newInstrumentVersion,
    } }, select: { id: true } })
    if (existing) throw problem('该内容版本已发布，请使用新版本')
    const template = JSON.parse(JSON.stringify(source.template))
    template.instrumentKey = input.newInstrumentKey
    template.instrumentVersion = input.newInstrumentVersion
    // A copied golden must never stand in for the adapting author's independent checks.
    if (template.templateVersion === 'sjt-online-v1') {
      template.goldenCases = []
      for (const scene of template.display.scenes) if (scene.image) scene.image.rightsStatus = 'authorized'
    } else template.cases = []
    const c = compileSjtAuthorDocument(template)
    assertUnreserved(c.template.instrumentKey)
    const adaptationSource: SjtAdaptationSource = { protocol: 'sjt-adaptation-v1', receipt,
      sourceDraftId: source.id, sourceAuthorId: source.ownerId }
    const mediaOptions = { adaptSource: { template: source.template, sourceOwnerId: source.ownerId,
      grantId: receipt.grantId, provenance: adaptationSource } }
    await assertSjtAuthorMedia(tx, actor.userId, c.template, mediaOptions)
    const draft = await tx.sjtAuthorDraft.create({ data: { ownerId: actor.userId, template: json(c.template),
      contentDigest: c.contentDigest, authorizationPolicy: SJT_COURSE_GRANT_POLICY,
      adaptationSource: json(adaptationSource) } })
    await tx.sjtAuthorAudit.create({ data: { draftId: draft.id, actorId: actor.userId, revision: 1,
      action: 'ADAPT', contentDigest: c.contentDigest, template: json(c.template),
      authorizationPolicy: SJT_COURSE_GRANT_POLICY, note: `ADAPT ${receipt.grantId} v${receipt.grantVersion}; source ${release.id}` } })
    return draft
  })
}
