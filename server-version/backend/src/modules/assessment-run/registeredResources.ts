import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { config } from '../../config'
import { canUseScale } from '../../services/materialGrant'
import { UserRole } from '../../types'
import { canonicalHash } from '../assessment-runtime/canonical'
import { createRelationalProductRegistry, relationalProductRegistry, type RelationalProductEntryV1 } from '../assessment-relational/product-registry'
import { hashScaleDefinition, validateScaleDefinition, type ScaleDefinitionV2 } from '../scale/scale-definition'
import { reportingFail } from '../reporting/types'

type Actor = { userId: string; platformRole: string }
type Row = { id: string; resource_key: string; resource_version: string; scale_id: string; definition_hash: string; composite_id: string; entry: RelationalProductEntryV1; entry_hash: string; status: string; created_by_user_id: string; reviewed_by_user_id: string | null }
const admin = (actor: Actor) => { if (actor.platformRole !== 'SYSTEM_ADMIN') reportingFail('RESOURCE_AUTHORITY', '只有平台管理员可以注册、审核和发布测量资源', 403) }

export function validateDescriptiveResourceScale(scale: { status: string; instrumentClass: string; definition: unknown; definitionHash: string | null }): ScaleDefinitionV2 {
  if (scale.status !== 'PUBLISHED' || scale.instrumentClass !== 'CUSTOM_DESCRIPTIVE') reportingFail('RESOURCE_SCALE_INVALID', '请先发布原创描述性量表；标准或受限量表需走原有内容审核流程', 409)
  const parsed = validateScaleDefinition(scale.definition, { instrumentClass: 'CUSTOM_DESCRIPTIVE', forPublish: true })
  if (!parsed.definition || parsed.issues.some(issue => issue.severity === 'error')) reportingFail('RESOURCE_SCALE_INVALID', '量表定义未通过发布检查', 409)
  const definition = parsed.definition!
  if (definition.license.status !== 'self_authored' || definition.license.redistribution !== 'allowed' || definition.respondentType !== 'participant_self_report' || !definition.scoring.scores.length) {
    reportingFail('RESOURCE_SCALE_INVALID', '当前注册入口仅支持允许再分发的原创自评计分量表', 409)
  }
  if (hashScaleDefinition(definition) !== scale.definitionHash) reportingFail('RESOURCE_INTEGRITY', '量表定义与发布指纹不一致', 409)
  return definition
}

export function descriptiveResourceEntry(input: { scaleId: string; name: string; definition: ScaleDefinitionV2; definitionHash: string; compositeId: string; version: string; mode: 'INDIVIDUAL' | 'GROUP' }): RelationalProductEntryV1 {
  const key = `custom-scale:${input.scaleId}:${input.mode}`
  const metricKeys = input.definition.scoring.scores.map(score => score.key)
  const individual = { mode: 'INDIVIDUAL_SUMMARY' as const, metricKeys, longitudinalMetricKeys: metricKeys }
  const none = { mode: 'NONE' as const, metricKeys: [], longitudinalMetricKeys: [] }
  const entry: RelationalProductEntryV1 = {
    title: `${input.name}（${input.mode === 'INDIVIDUAL' ? '个人自评' : '群体汇总'}）`, description: '原创描述性自评；仅用于描述回答及其变化，不作诊断或科学效度声明。',
    releaseStatus: 'PUBLISHED', scienceMaturity: 'PILOT', initiationModes: ['ORG_ASSIGN', 'CLASS_ASSIGN'], subjectReportMode: input.mode === 'INDIVIDUAL' ? 'INDIVIDUAL_SUMMARY' : 'AGGREGATE_ONLY',
    applicability: { schemaVersion: 1, resourceKind: 'SCALE', resourceKey: key, resourceVersion: input.version,
      subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'], perspectives: ['SELF_REPORT'],
      analysisMode: input.mode === 'INDIVIDUAL' ? 'INDIVIDUAL_ONLY' : 'COHORT_AGGREGATE', visibilityPolicyKey: 'ORG_CUSTOM_SELF_V1', minimumRespondents: input.mode === 'INDIVIDUAL' ? null : 3 },
    cohortAnalysisPolicy: input.mode === 'INDIVIDUAL' ? null : { schemaVersion: 1, policyKey: 'ORG_CUSTOM_GROUP_V1', policyVersion: '1.0.0', minimumRespondents: 3, metricKeys }, launchTarget: { runtime: 'COMPOSITE', compositeAssessmentId: input.compositeId },
    resultDisclosure: { schemaVersion: 1, policyKey: 'ORG_CUSTOM_SELF_V1', minimumRespondents: input.mode === 'INDIVIDUAL' ? null : 3,
      audiences: input.mode === 'INDIVIDUAL' ? { RESPONDENT: individual, SUBJECT: individual, TEACHER: individual, PROFESSIONAL: individual, PARENT: none, RESEARCH: none, ORGANIZATION: none } : {
        RESPONDENT: { mode: 'AGGREGATE_ONLY', metricKeys, longitudinalMetricKeys: [] }, SUBJECT: { mode: 'AGGREGATE_ONLY', metricKeys, longitudinalMetricKeys: [] },
        TEACHER: { mode: 'CLASS_AGGREGATE', metricKeys, longitudinalMetricKeys: [] }, PROFESSIONAL: { mode: 'ORGANIZATION_AGGREGATE', metricKeys, longitudinalMetricKeys: [] },
        ORGANIZATION: { mode: 'ORGANIZATION_AGGREGATE', metricKeys, longitudinalMetricKeys: [] }, PARENT: none, RESEARCH: none } },
  }
  // Reuse the production applicability/disclosure validator; no client policy JSON.
  createRelationalProductRegistry([entry])
  return entry
}

const checkedEntry = (row: Row): RelationalProductEntryV1 => {
  if (canonicalHash(row.entry) !== row.entry_hash || row.entry.applicability.resourceKey !== row.resource_key || row.entry.applicability.resourceVersion !== row.resource_version || row.entry.launchTarget?.compositeAssessmentId !== row.composite_id) {
    return reportingFail('RESOURCE_INTEGRITY', '测量资源注册记录校验失败', 409)
  }
  createRelationalProductRegistry([row.entry])
  return row.entry
}

export async function registerDescriptiveResource(actor: Actor, scaleId: string, mode: 'INDIVIDUAL' | 'GROUP' = 'INDIVIDUAL') {
  admin(actor)
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM scales WHERE id=${scaleId} FOR UPDATE`
    const scale = await tx.scale.findUnique({ where: { id: scaleId } })
    if (!scale) return reportingFail('RESOURCE_NOT_FOUND', '量表不存在', 404)
    const definition = validateDescriptiveResourceScale(scale)
    const hash = hashScaleDefinition(definition), key = `custom-scale:${scale.id}:${mode}`
    const existing = await tx.$queryRaw<Row[]>`SELECT * FROM registered_assessment_resources WHERE resource_key=${key} AND definition_hash=${hash} ORDER BY created_at DESC,id DESC`
    if (existing[0]) {
      const prior = existing[0]; checkedEntry(prior)
      // Legacy self-reviewed, unpublished rows cannot pass the new publish
      // gate. Registration creates a fresh version without rewriting old audit.
      const needsIndependentVersion = prior.status === 'REVIEWED'
        && (!prior.reviewed_by_user_id || [prior.created_by_user_id, scale.creatorId].includes(prior.reviewed_by_user_id))
      if (!needsIndependentVersion) return prior
    }
    const versions = await tx.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM registered_assessment_resources WHERE resource_key=${key}`
    const version = `1.0.${versions[0].n + 1}`
    const target = await tx.compositeAssessment.create({ data: {
      code: `org-resource-${randomUUID()}`, name: scale.name, instruction: scale.instruction,
      createdBy: actor.userId, productKind: 'ORGANIZATION_RESOURCE', publicEnabled: false,
      items: { create: { type: 'SCALE', position: 0, required: true, scaleId } },
    } })
    const entry = descriptiveResourceEntry({ scaleId, name: scale.name, definition, definitionHash: hash, compositeId: target.id, version, mode })
    const rows = await tx.$queryRaw<Row[]>`INSERT INTO registered_assessment_resources
      (id,resource_key,resource_version,scale_id,definition_hash,composite_id,entry,entry_hash,created_by_user_id)
      VALUES (${randomUUID()},${key},${version},${scaleId},${hash},${target.id},${JSON.stringify(entry)}::jsonb,${canonicalHash(entry)},${actor.userId}) RETURNING *`
    return rows[0]
  })
}

export async function transitionDescriptiveResource(actor: Actor, id: string, action: 'review' | 'publish' | 'retire') {
  admin(actor)
  return prisma.$transaction(async tx => {
    const row = (await tx.$queryRaw<Row[]>`SELECT * FROM registered_assessment_resources WHERE id=${id} FOR UPDATE`)[0]
    if (!row) return reportingFail('RESOURCE_NOT_FOUND', '资源不存在', 404)
    const expected = { review: 'DRAFT', publish: 'REVIEWED', retire: 'PUBLISHED' }[action]
    if (row.status !== expected) return reportingFail('RESOURCE_STATE_CONFLICT', '资源状态已变化，请刷新后再试', 409)
    checkedEntry(row)
    if (action !== 'retire') {
      await tx.$queryRaw`SELECT id FROM scales WHERE id=${row.scale_id} FOR UPDATE`
      const scale = await tx.scale.findUniqueOrThrow({ where: { id: row.scale_id } })
      validateDescriptiveResourceScale(scale)
      if (scale.definitionHash !== row.definition_hash) reportingFail('RESOURCE_INTEGRITY', '量表已变化，请重新注册当前版本', 409)
      if (action === 'review' && [row.created_by_user_id, scale.creatorId].includes(actor.userId)) reportingFail('RESOURCE_INDEPENDENT_REVIEW_REQUIRED', '资源注册者和量表作者不能自审，请交由另一位平台管理员审核', 403)
      if (action === 'publish' && (!row.reviewed_by_user_id || [row.created_by_user_id, scale.creatorId].includes(row.reviewed_by_user_id))) reportingFail('RESOURCE_INDEPENDENT_REVIEW_REQUIRED', '发布需要独立审核记录，请重新登记新版本并独立审核', 409)
    }
    if (action === 'publish') await tx.compositeAssessment.update({ where: { id: row.composite_id }, data: { status: 'PUBLISHED', publishedAt: new Date() } })
    const status = { review: 'REVIEWED', publish: 'PUBLISHED', retire: 'RETIRED' }[action]
    const column = { review: 'reviewed', publish: 'published', retire: 'retired' }[action]
    const rows = await tx.$queryRaw<Row[]>(Prisma.sql`UPDATE registered_assessment_resources SET status=${status},
      ${Prisma.raw(`${column}_by_user_id`)}=${actor.userId},${Prisma.raw(`${column}_at`)}=CURRENT_TIMESTAMP WHERE id=${id} RETURNING *`)
    await tx.$executeRaw`INSERT INTO organization_governance_audits (id,organization_id,actor_user_id,action,target_type,target_id,domain_event_id,payload)
      VALUES (${randomUUID()},NULL,${actor.userId},${`MEASUREMENT_RESOURCE_${status}`},'RegisteredAssessmentResource',${id},${`${id}:${status}`},${JSON.stringify({ entryHash: row.entry_hash })}::jsonb)`
    return rows[0]
  })
}

export async function listRegisteredResources(actor: Actor, page = 1) {
  admin(actor)
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) reportingFail('RESOURCE_PAGE_INVALID', '资源页码无效', 400)
  const list = await prisma.$queryRaw<Row[]>`SELECT * FROM registered_assessment_resources ORDER BY created_at DESC,id LIMIT 101 OFFSET ${(page - 1) * 100}`
  return { list: list.slice(0, 100).map(row => ({ ...row, entry: checkedEntry(row) })), truncated: list.length > 100, nextPage: list.length > 100 ? page + 1 : null }
}

export async function readPublishedRegisteredResource(actor: Actor, id: string) {
  admin(actor)
  const [row] = await prisma.$queryRaw<Row[]>`SELECT * FROM registered_assessment_resources WHERE id=${id} AND status='PUBLISHED'`
  if (!row) return reportingFail('RESOURCE_NOT_PUBLISHED', '请先审核并发布测量资源', 409)
  return { ...row, entry: checkedEntry(row) }
}

/** Static content stays authoritative; registered content uses an exact, persisted identity. */
export async function resolveReleasedRelationalEntry(ref: { resourceKind: string; resourceKey: string; resourceVersion: string }, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const staticEntry = relationalProductRegistry.findExact(ref as Parameters<typeof relationalProductRegistry.findExact>[0])
  if (staticEntry) return staticEntry
  if (ref.resourceKind !== 'SCALE' || !ref.resourceKey.startsWith('custom-scale:')) return null
  const row = (await db.$queryRaw<Row[]>`SELECT * FROM registered_assessment_resources WHERE resource_key=${ref.resourceKey} AND resource_version=${ref.resourceVersion} AND status='PUBLISHED' LIMIT 1`)[0]
  return row ? checkedEntry(row) : null
}

/** Retirement stops new delivery; frozen reports still require all current subject/organization grants. */
export async function resolveHistoricalRelationalEntry(ref: { resourceKind: string; resourceKey: string; resourceVersion: string }, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const staticEntry = relationalProductRegistry.findExact(ref as Parameters<typeof relationalProductRegistry.findExact>[0])
  if (staticEntry) return staticEntry
  if (ref.resourceKind !== 'SCALE' || !ref.resourceKey.startsWith('custom-scale:')) return null
  const row = (await db.$queryRaw<Row[]>`SELECT * FROM registered_assessment_resources WHERE resource_key=${ref.resourceKey} AND resource_version=${ref.resourceVersion} AND status IN ('PUBLISHED','RETIRED') LIMIT 1`)[0]
  return row ? checkedEntry(row) : null
}

export async function listReleasedRegisteredResources(userId: string, role: UserRole) {
  return (await listReleasedRegisteredResourcePage(userId, role)).entries
}

export async function listReleasedRegisteredResourcePage(userId: string, role: UserRole, page = 1) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) reportingFail('RESOURCE_PAGE_INVALID', '资源页码无效', 400)
  // Permission filtering precedes the page limit; source status/hash and grants
  // are read in the same statement, without per-resource DB lookups.
  const rows = await prisma.$queryRaw<Row[]>`SELECT resource.* FROM registered_assessment_resources resource
    JOIN scales scale ON scale.id=resource.scale_id AND scale.status='PUBLISHED' AND scale.definition_hash=resource.definition_hash
    WHERE resource.status='PUBLISHED' AND (${role === UserRole.ADMIN} OR scale.creator_id=${userId}
      OR (${config.materialGrantsEnabled} AND EXISTS (SELECT 1 FROM material_grants grant_row
        WHERE grant_row.teacher_id=${userId} AND grant_row.resource_type='SCALE' AND grant_row.resource_id=scale.id)))
    ORDER BY resource.created_at DESC,resource.id LIMIT 101 OFFSET ${(page - 1) * 100}`
  return { entries: rows.slice(0, 100).map(checkedEntry), nextPage: rows.length > 100 ? page + 1 : null }
}

export async function assertRegisteredResourceUse(ref: { family: string; key: string; version: string }, userId: string, db: Prisma.TransactionClient | typeof prisma = prisma, lock = false) {
  if (ref.family !== 'SCALE' || !ref.key.startsWith('custom-scale:')) return
  const row = (await db.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM registered_assessment_resources WHERE resource_key=${ref.key} AND resource_version=${ref.version} ${lock ? Prisma.sql`FOR SHARE` : Prisma.empty}`))[0]
  if (lock && row) {
    // Serialize publication against retirement, source edits and material revocation.
    await db.$queryRaw`SELECT id FROM scales WHERE id=${row.scale_id} FOR SHARE`
    await db.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR SHARE`
    await db.$queryRaw`SELECT id FROM material_grants WHERE teacher_id=${userId} AND resource_type='SCALE' AND resource_id=${row.scale_id} FOR SHARE`
  }
  const scale = row && await db.scale.findUnique({ where: { id: row.scale_id } })
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!row || row.status !== 'PUBLISHED' || !scale || !user || scale.status !== 'PUBLISHED' || scale.definitionHash !== row.definition_hash || !await canUseScale(userId, user.role as UserRole, scale, db)) {
    reportingFail('RESOURCE_USE_FORBIDDEN', '量表未发布、版本已变化或材料授权已撤销，请重新选择资源', 403)
  }
  checkedEntry(row)
}
