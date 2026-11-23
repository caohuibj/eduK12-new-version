import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { hashDeclarativePackage, parseDeclarativePackage } from '../assessment-bundle/onboarding/contract'
import { packageEntry } from '../assessment-bundle/onboarding/catalog'
import { dependencyBlockers } from '../assessment-bundle/onboarding/dependencies'
import { verifyPackageFixtures } from '../assessment-bundle/onboarding/fixtures'
import { BundleDefinitionProvider } from './definition-provider'
import { installPackage, publishPackage } from './package-release'
import { compositeBadRequest, compositeConflict, compositeForbidden, compositeNotFound } from '../composite/composite.errors'
import type { BundleActor } from './service'

type BundleAdministrator = BundleActor & { platformRole?: 'SYSTEM_ADMIN' | 'STANDARD' }
const administrator = (actor: BundleAdministrator) => {
  if (actor.platformRole !== 'SYSTEM_ADMIN') throw compositeForbidden('只有系统管理员可以制作和审批固定测评包')
}
const releaseConflicts: Record<string, string> = {
  BUNDLE_VERSION_IMMUTABLE: '该版本内容已锁定，请更换版本号后保存',
  BUNDLE_LEGACY_IDENTITY_RESERVED: '该包标识和版本已被历史定义占用，请使用新的标识或版本',
  BUNDLE_RETIRED: '该版本已退役，请制作新版本',
  BUNDLE_CONTENT_HASH_MISMATCH: '登记内容校验失败，请联系管理员复核',
  BUNDLE_CLAIM_NOT_APPROVED: '仍有整体报告结论未包含在声明中，请重新预览当前版本',
  BUNDLE_COGNITIVE_DEPENDENCY_UNAVAILABLE: '引用的认知任务版本不可用，请核对发布状态',
  BUNDLE_SCALE_DEPENDENCY_UNAVAILABLE: '引用的量表版本不可用，请核对发布状态',
  BUNDLE_SJT_DEPENDENCY_UNAVAILABLE: '引用的情境题包版本不可用，请核对发布状态',
  BUNDLE_REVIEW_INVALID_OR_EXPIRED: '发布摘要与当前版本不一致，请重新预览当前版本',
}
function releaseError(cause: unknown): never {
  if (cause instanceof Error) {
    if (cause.message === 'BUNDLE_ADMIN_REQUIRED') {
      throw compositeForbidden('需要当前系统管理员权限执行此操作')
    }
    const message = releaseConflicts[cause.message]
    if (message) throw compositeConflict(message)
  }
  throw cause
}
function previewValidatedPackage(actor: BundleAdministrator, raw: unknown) {
  administrator(actor)
  const p = parseDeclarativePackage(raw)
  const entry = packageEntry(p)
  const provider = new BundleDefinitionProvider([entry])
  const fixtures = verifyPackageFixtures(p)
  const fixtureRuleIds = new Map(Object.entries(p.fixtures).map(([name, fixture]) => [name, fixture.expectedRuleIds]))
  return { contentHash: hashDeclarativePackage(p), definition: p.manifest.definition,
    blockers: [...dependencyBlockers(p), ...provider.publicationBlockers(entry.definition.bundleKey, entry.definition.bundleVersion).filter(value => value !== 'BUNDLE_NOT_PUBLISHED')],
    requiredClaims: [...new Set([...p.rules.items.filter(rule => rule.kind !== 'limitation').map(rule => rule.kind),...(p.schemaVersion===2?['cross_source_condition' as const]:[])])],
    report: p.report, scientific: p.scientific, ...(p.schemaVersion===2?{profile:p.profile}:{}),
    scenarios: fixtures.map(({ name, result }) => ({ name, kind: result.kind, ruleIds: fixtureRuleIds.get(name)!, synthetic: true,
      conclusions: result.kind === 'COMPUTED' ? (result.payload as { conclusions: Array<{ ruleId: string; text: string }> }).conclusions.map(({ ruleId, text }) => ({ ruleId, text })) : [],
      ...(p.schemaVersion===2 && result.kind==='COMPUTED'?{profile:(result.payload as {profile:{state:string;profileId:string|null}}).profile}:{}),
      message: result.kind === 'UNAVAILABLE' ? p.report.states.unavailable : null,
    })),
  }
}
export function previewPackage(actor: BundleAdministrator, raw: unknown) {
  administrator(actor)
  try { return previewValidatedPackage(actor, raw) }
  catch (cause: any) {
    if (cause.statusCode || cause instanceof z.ZodError) throw cause
    throw compositeBadRequest('固定包定义未通过校验：' + cause.message)
  }
}
export async function savePackage(db: PrismaClient, actor: BundleAdministrator, raw: unknown) {
  const preview = previewPackage(actor, raw)
  if (preview.blockers.length) throw compositeConflict(preview.blockers.join('; '))
  const row = await installPackage(db, actor.userId, raw).catch(releaseError)
  return getPackageDraft(db, actor, row.bundleKey, row.bundleVersion)
}
export async function listPackageDrafts(db: PrismaClient, actor: BundleAdministrator) {
  administrator(actor)
  return db.bundlePackageRelease.findMany({ orderBy: [{ bundleKey: 'asc' }, { bundleVersion: 'asc' }],
    select: { id: true, bundleKey: true, bundleVersion: true, status: true, contentHash: true, installedBy: true, publishedBy: true, createdAt: true } })
}
export async function getPackageDraft(db: PrismaClient, actor: BundleAdministrator, key: string, version: string) {
  administrator(actor)
  const row = await db.bundlePackageRelease.findUnique({ where: { bundleKey_bundleVersion: { bundleKey: key, bundleVersion: version } } })
  if (!row) throw compositeNotFound('固定包版本不存在')
  return {
    ...row,
    review: row.review
      ? {
        contentHash: (row.review as any).contentHash,
        reviewerId: (row.review as any).reviewerId,
        reviewedAt: (row.review as any).reviewedAt,
        ...((row.review as any).expiresAt !== undefined ? { expiresAt: (row.review as any).expiresAt } : {}),
      }
      : null,
  }
}
const approval = z.object({
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  claims: z.array(z.enum(['independent_summary', 'cross_source_condition', 'joint_conclusion'])).max(3).optional(),
  note: z.string().max(500).optional(),
  scientific: z.boolean().optional(),
  rights: z.boolean().optional(),
  language: z.boolean().optional(),
  report: z.boolean().optional(),
}).strict()
export async function approvePackage(db: PrismaClient, actor: BundleAdministrator, key: string, version: string, raw: unknown) {
  administrator(actor)
  const checked = approval.parse(raw)
  const row = await getPackageDraft(db, actor, key, version)
  if (checked.contentHash !== row.contentHash) throw compositeConflict('审批内容与当前版本不一致，请重新预览')
  const preview = previewValidatedPackage(actor, row.content)
  if (preview.blockers.length > 0) throw compositeConflict(`包结构或合成试验未通过校验：${preview.blockers.join('、')}`)
  const releaseRecord = {
    contentHash: checked.contentHash,
    reviewerId: actor.userId,
    reviewedAt: new Date().toISOString(),
    claims: checked.claims ?? preview.requiredClaims,
    ...(checked.note ? { note: checked.note } : {}),
  }
  await publishPackage(db, actor.userId, key, version, releaseRecord).catch(releaseError)
  return getPackageDraft(db, actor, key, version)
}
/** Published JSON definitions use the same validator and admission signature
 * as code-catalog packages. Loading a definition never grants permission. */
export async function refreshPublishedPackages(db: PrismaClient, provider: BundleDefinitionProvider) {
  const rows = await db.bundlePackageRelease.findMany({ where: { status: 'PUBLISHED' }, select: { content: true, contentHash: true } })
  for (const row of rows) {
    const p = parseDeclarativePackage(row.content)
    if (hashDeclarativePackage(p) !== row.contentHash) throw compositeConflict('固定包登记内容校验失败')
    provider.register(packageEntry(p))
  }
}
