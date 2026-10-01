import { Prisma } from '@prisma/client'
import { prisma } from '../../../config/database'
import { canonicalHash } from '../../assessment-runtime/canonical'
import {
  listSituationPackages,
  validateSituationPackage,
  type SituationPackage,
} from '../situation-package.registry'
import { compileSjtTemplate, assertSjtReleaseReady } from './template'

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

export async function createSjtDraft(actor: SjtAuthorActor, input: unknown) {
  const c = compileSjtTemplate(input)
  assertUnreserved(c.template.instrumentKey)
  return prisma.$transaction(async (tx) => {
    const draft = await tx.sjtAuthorDraft.create({
      data: { ownerId: actor.userId, template: json(c.template), contentDigest: c.contentDigest },
    })
    await tx.sjtAuthorAudit.create({
      data: {
        draftId: draft.id,
        actorId: actor.userId,
        revision: 1,
        action: 'UPLOAD',
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
      release: { select: { status: true } },
    },
  })
  if (!draft) throw problem('草稿不存在', 404)
  assertAccess(draft.ownerId, actor)
  return draft
}
export async function reviseSjtDraft(
  actor: SjtAuthorActor,
  id: string,
  revision: number,
  input: unknown,
  audit: { action: 'REVISE' | 'RESTORE'; note?: string } = { action: 'REVISE' },
) {
  const c = compileSjtTemplate(input)
  assertUnreserved(c.template.instrumentKey)
  return prisma.$transaction(async (tx) => {
    const old = await tx.sjtAuthorDraft.findUnique({ where: { id } })
    if (!old) throw problem('草稿不存在', 404)
    // Administrators review; authors own edits, keeping the reviewer independent.
    if (old.ownerId !== actor.userId) throw problem('仅作者可修订草稿', 403)
    if (old.status === 'PUBLISHED') throw problem('发布内容不可修改，请另建新版本')
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
        contentDigest: c.contentDigest,
        template: json(c.template),
        ...(audit.note ? { note: audit.note } : {}),
      },
    })
    return tx.sjtAuthorDraft.findUniqueOrThrow({ where: { id } })
  })
}
export async function requestSjtReview(
  actor: SjtAuthorActor,
  id: string,
  revision: number,
  digest: string,
) {
  const draft = await getSjtDraft(actor, id)
  if (draft.ownerId !== actor.userId) throw problem('仅作者可提交审核', 403)
  const c = compileSjtTemplate(draft.template)
  assertSjtReleaseReady(c)
  if (c.contentDigest !== digest || draft.contentDigest !== digest) throw problem('内容摘要已变化')
  return prisma.$transaction(async (tx) => {
    const changed = await tx.sjtAuthorDraft.updateMany({
      where: { id, revision, contentDigest: digest, status: 'DRAFT' },
      data: { status: 'IN_REVIEW' },
    })
    if (changed.count !== 1) throw problem('草稿已变化或不可提交审核')
    await tx.sjtAuthorAudit.create({
      data: {
        draftId: id,
        actorId: actor.userId,
        revision,
        action: 'REQUEST_REVIEW',
        contentDigest: digest,
      },
    })
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
      const c = compileSjtTemplate(draft.template)
      assertUnreserved(c.template.instrumentKey)
      if (c.contentDigest !== digest) throw problem('存储内容摘要不一致')
      if (approve) {
        assertSjtReleaseReady(c)
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
        await tx.sjtAuthorRelease.create({
          data: {
            instrumentKey: pkg.key,
            instrumentVersion: pkg.instrumentVersion,
            sourceDraftId: id,
            contentDigest: digest,
            definitionHash: c.definitionHash,
            package: json(pkg),
            authorId: draft.ownerId,
            reviewerId: actor.userId,
          },
        })
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
    where: { status: 'PUBLISHED' },
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
  const a = compileSjtTemplate(before).template,
    b = compileSjtTemplate(after).template
  return Object.keys(b).filter(
    (key) => canonicalHash(a[key as keyof typeof a]) !== canonicalHash(b[key as keyof typeof b]),
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
  if (data.instrument.scoringVersion !== 'author-key-sum-v1') return data
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
