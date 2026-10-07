import { createHmac } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { canonicalJsonString } from '../assessment-runtime/canonical'
import { hashDeclarativePackage, parseDeclarativePackage } from '../assessment-bundle/onboarding/contract'
import { packageEntry } from '../assessment-bundle/onboarding/catalog'
import { dependencyBlockers } from '../assessment-bundle/onboarding/dependencies'
import { verifyPackageFixtures } from '../assessment-bundle/onboarding/fixtures'
import { BundleDefinitionProvider } from './definition-provider'
import { installPackage, publishPackage } from './package-release'
import { compositeBadRequest, compositeConflict, compositeForbidden, compositeNotFound } from '../composite/composite.errors'
import type { BundleActor } from './service'

const administrator = (actor: BundleActor) => { if (actor.role !== 'ADMIN') throw compositeForbidden('只有管理员可以制作和审批固定测评包') }
const releaseConflicts: Record<string, string> = {
  BUNDLE_VERSION_IMMUTABLE: '该版本内容已锁定，请更换版本号后保存',
  BUNDLE_LEGACY_IDENTITY_RESERVED: '该包标识和版本已被历史定义占用，请使用新的标识或版本',
  BUNDLE_RETIRED: '该版本已退役，请制作新版本',
  BUNDLE_CONTENT_HASH_MISMATCH: '登记内容校验失败，请联系管理员复核',
  BUNDLE_CLAIM_NOT_APPROVED: '仍有整体报告结论未获审核，请重新核对报告声明',
  BUNDLE_COGNITIVE_DEPENDENCY_UNAVAILABLE: '引用的认知任务版本不可用，请核对发布状态',
  BUNDLE_SCALE_DEPENDENCY_UNAVAILABLE: '引用的量表版本不可用，请核对发布状态',
  BUNDLE_SJT_DEPENDENCY_UNAVAILABLE: '引用的情境题包版本不可用，请核对发布状态',
  BUNDLE_REVIEW_KEY_REQUIRED: '固定包审批签名服务尚未配置，请联系运维',
  BUNDLE_REVIEW_INVALID_OR_EXPIRED: '审核记录已失效，请重新审核当前版本',
}
function releaseError(cause: unknown): never {
  if (cause instanceof Error) {
    if (cause.message === 'BUNDLE_ADMIN_REQUIRED' || cause.message === 'BUNDLE_INDEPENDENT_REVIEW_REQUIRED') {
      throw compositeForbidden('需要有权限的另一位管理员独立审核此版本')
    }
    const message = releaseConflicts[cause.message]
    if (message) throw compositeConflict(message)
  }
  throw cause
}
function previewValidatedPackage(actor: BundleActor, raw: unknown) {
  administrator(actor)
  const p = parseDeclarativePackage(raw)
  const entry = packageEntry(p)
  const provider = new BundleDefinitionProvider([entry])
  const fixtures = verifyPackageFixtures(p)
  return { contentHash: hashDeclarativePackage(p), definition: p.manifest.definition,
    blockers: [...dependencyBlockers(p), ...provider.publicationBlockers(entry.definition.bundleKey, entry.definition.bundleVersion).filter(value => value !== 'BUNDLE_NOT_PUBLISHED')],
    requiredClaims: [...new Set(p.rules.items.filter(rule => rule.kind !== 'limitation').map(rule => rule.kind))],
    report: p.report, scientific: p.scientific,
    scenarios: fixtures.map(({ name, result }) => ({ name, kind: result.kind, ruleIds: p.fixtures[name].expectedRuleIds, synthetic: true,
      conclusions: result.kind === 'COMPUTED' ? (result.payload as { conclusions: Array<{ ruleId: string; text: string }> }).conclusions.map(({ ruleId, text }) => ({ ruleId, text })) : [],
      message: result.kind === 'UNAVAILABLE' ? p.report.states.unavailable : null,
    })),
  }
}
export function previewPackage(actor: BundleActor, raw: unknown) {
  administrator(actor)
  try { return previewValidatedPackage(actor, raw) }
  catch (cause: any) {
    if (cause.statusCode || cause instanceof z.ZodError) throw cause
    throw compositeBadRequest('固定包定义未通过校验：' + cause.message)
  }
}
export async function savePackage(db: PrismaClient, actor: BundleActor, raw: unknown) {
  const preview = previewPackage(actor, raw)
  if (preview.blockers.length) throw compositeConflict(preview.blockers.join('; '))
  const row = await installPackage(db, actor.userId, raw).catch(releaseError)
  return getPackageDraft(db, actor, row.bundleKey, row.bundleVersion)
}
export async function listPackageDrafts(db: PrismaClient, actor: BundleActor) {
  administrator(actor)
  return db.bundlePackageRelease.findMany({ orderBy: [{ bundleKey: 'asc' }, { bundleVersion: 'asc' }],
    select: { id: true, bundleKey: true, bundleVersion: true, status: true, contentHash: true, installedBy: true, publishedBy: true, createdAt: true } })
}
export async function getPackageDraft(db: PrismaClient, actor: BundleActor, key: string, version: string) {
  administrator(actor)
  const row = await db.bundlePackageRelease.findUnique({ where: { bundleKey_bundleVersion: { bundleKey: key, bundleVersion: version } } })
  if (!row) throw compositeNotFound('固定包版本不存在')
  return { ...row, review: row.review ? { contentHash: (row.review as any).contentHash, reviewerId: (row.review as any).reviewerId, expiresAt: (row.review as any).expiresAt } : null }
}
const approval = z.object({ contentHash: z.string().regex(/^[a-f0-9]{64}$/), scientific: z.literal(true), rights: z.literal(true), language: z.literal(true), report: z.literal(true),
  claims: z.array(z.enum(['independent_summary', 'cross_source_condition', 'joint_conclusion'])).max(3) }).strict()
export async function approvePackage(db: PrismaClient, actor: BundleActor, key: string, version: string, raw: unknown) {
  administrator(actor)
  const checked = approval.parse(raw)
  const row = await getPackageDraft(db, actor, key, version)
  if (row.installedBy === actor.userId) throw compositeForbidden('需要另一位管理员独立审核此版本')
  if (checked.contentHash !== row.contentHash) throw compositeConflict('审批内容与当前版本不一致，请重新预览')
  const secret = process.env.BUNDLE_REVIEW_SIGNING_KEY
  if (!secret || secret.length < 32) throw compositeConflict('固定包审批签名服务尚未配置，请联系运维')
  const material = { ...checked, reviewerId: actor.userId, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }
  const signature = createHmac('sha256', secret).update(canonicalJsonString(material)).digest('hex')
  await publishPackage(db, row.installedBy, key, version, { ...material, signature }).catch(releaseError)
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
