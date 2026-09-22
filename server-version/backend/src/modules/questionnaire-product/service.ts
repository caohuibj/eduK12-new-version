import { Prisma, UserRole } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { assertValidItem, getCompositeForTeacher, publishComposite, listAvailableForStudent } from '../composite/composite.service'
import { compositeBadRequest, compositeConflict, compositeForbidden, compositeNotFound } from '../composite/composite.errors'
import { mapCompositeSection, compositeFormSectionDefinitionHash } from '../assessment-runtime/form-section-definition'
import { compositeFormSectionImageReferences, publishedFormMediaOwner, retainFormSectionImages } from '../assessment-runtime/form-image.adapter'
import { compositeFormSectionVideoPresentations, retainFormSectionVideos } from '../assessment-runtime/form-video.adapter'
import { ensureCompositeFormSections } from '../composite/final-submit.service'
import { addCompositeItemSchema } from '../composite/composite.schema'
import { canUseScale } from '../../services/materialGrant'
import { listSituationPackages } from '../situational/situation-package.registry'
import { freezeAssignmentProfile, freezeDataForWrite } from '../cognitive/profile-freeze'
import { requireCognitiveRegistryEntry } from '../cognitive/cognitive.registry'
import { z } from 'zod'

type Actor = { userId: string; role: UserRole }
type Tx = Prisma.TransactionClient
const author = (a: Actor) => { if (!['ADMIN', 'TEACHER'].includes(a.role)) throw compositeForbidden() }
const owner = (a: Actor, row: { createdBy: string | null }) => {
  author(a)
  if (a.role !== 'ADMIN' && row.createdBy !== a.userId) throw compositeForbidden()
}
const metadata = {
  name: z.string().trim().min(1).max(200), description: z.string().max(5000).nullable().optional(),
  instruction: z.string().max(10000).nullable().optional(), courseIds: z.array(z.string().min(1)).max(100).default([]),
  publicEnabled: z.boolean().default(false), opensAt: z.string().datetime().nullable().optional(), expiresAt: z.string().datetime().nullable().optional(),
}
export const createSchema = z.object({ ...metadata, requestId: z.string().uuid(), questionnaireType: z.enum(['COURSE', 'GENERAL']) }).strict()
export const editSchema = z.object({ ...metadata, revision: z.number().int().nonnegative() }).strict()
export const revisionSchema = z.object({ revision: z.number().int().nonnegative() }).strict()
export const itemSchema = z.object({ revision: z.number().int().nonnegative(), item: addCompositeItemSchema }).strict()
export const orderSchema = z.object({ revision: z.number().int().nonnegative(),
  units: z.array(z.object({ id: z.string().min(1), type: z.enum(['FORM_SECTION', 'SCALE', 'COGNITIVE', 'SITUATIONAL']) }).strict()).min(1).max(500),
}).strict()
const date = (v?: string | null) => v ? new Date(v) : null
const windowCheck = (v: { publicEnabled: boolean; opensAt?: string | null; expiresAt?: string | null }) => {
  if (v.publicEnabled && !v.expiresAt) throw compositeBadRequest('公开问卷必须设置有效期')
  if (v.opensAt && v.expiresAt && new Date(v.opensAt) > new Date(v.expiresAt)) throw compositeBadRequest('结束时间不能早于开始时间')
}
async function courses(tx: Tx, actor: Actor, ids: string[], type: string) {
  if (new Set(ids).size !== ids.length) throw compositeBadRequest('课程不能重复')
  if (type === 'GENERAL' && ids.length) throw compositeBadRequest('通用问卷不绑定课程')
  const rows = await tx.course.findMany({ where: { id: { in: ids } } })
  if (rows.length !== ids.length || rows.some(r => r.isLibrary || (actor.role !== 'ADMIN' && r.creatorId !== actor.userId))) throw compositeForbidden('只能投放到有管理权限的非库课程')
}
export async function detail(actor: Actor, id: string) {
  const row = await prisma.compositeAssessment.findUnique({ where: { id } })
  if (!row || row.productKind !== 'QUESTIONNAIRE') throw compositeNotFound('新版问卷不存在')
  owner(actor, row)
  return { ...await getCompositeForTeacher(actor.userId, actor.role, id), supportedChannels: ['WEB'], reportMode: 'COLLECTION_ONLY' }
}
export async function create(actor: Actor, raw: unknown) {
  author(actor)
  if (process.env.QUESTIONNAIRE_PRODUCTS_ENABLED === 'false') throw compositeConflict('暂未开放新版问卷创建')
  const input = createSchema.parse(raw)
  windowCheck(input)
  const creationKey = actor.userId + ':' + input.requestId
  const creationHash = canonicalHash(input)
  const run = () => prisma.$transaction(async tx => {
    const existing = await tx.compositeAssessment.findUnique({ where: { creationKey } })
    if (existing) {
      if (existing.creationHash !== creationHash) throw compositeConflict('同一创建请求不能更换内容')
      return existing.id
    }
    await courses(tx, actor, input.courseIds, input.questionnaireType)
    return (await tx.compositeAssessment.create({ data: {
      code: 'Q-' + randomUUID(), name: input.name, description: input.description, instruction: input.instruction,
      productKind: 'QUESTIONNAIRE', questionnaireType: input.questionnaireType, createdBy: actor.userId,
      creationKey, creationHash, publicEnabled: input.publicEnabled, opensAt: date(input.opensAt), expiresAt: date(input.expiresAt),
      questionnaireCourses: { create: input.courseIds.map(courseId => ({ courseId })) },
    } })).id
  })
  let id: string
  try { id = await run() } catch (e: any) { if (e.code !== 'P2002') throw e; id = await run() }
  return detail(actor, id)
}
async function mutate(actor: Actor, id: string, revision: number, fn: (tx: Tx, row: any) => Promise<void>, draft = true) {
  author(actor)
  await prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe('SELECT "id" FROM "composite_assessments" WHERE "id" = $1 FOR UPDATE', id)
    const row = await tx.compositeAssessment.findUnique({ where: { id }, include: {
      questionnaireCourses: true, items: { orderBy: { position: 'asc' }, include: { cognitiveAssignment: { include: { config: true } }, scale: true } },
      formSections: { orderBy: { position: 'asc' }, include: { items: true } },
    } })
    if (!row || row.productKind !== 'QUESTIONNAIRE') throw compositeNotFound('新版问卷不存在')
    owner(actor, row)
    if (row.revision !== revision) throw compositeConflict('问卷已被其他操作修改，请刷新后重试')
    if (draft && row.status !== 'DRAFT') throw compositeConflict('已发布问卷不能修改，请复制为新草稿')
    if (row.reportPackageKey || row.analysisProtocolKey) throw compositeConflict('问卷必须只收集单项结果')
    await fn(tx, row)
    await tx.compositeAssessment.update({ where: { id }, data: { revision: { increment: 1 } } })
  }, { timeout: 30000 })
  return detail(actor, id)
}
export async function update(actor: Actor, id: string, raw: unknown) {
  const input = editSchema.parse(raw); windowCheck(input)
  return mutate(actor, id, input.revision, async (tx, row) => {
    await courses(tx, actor, input.courseIds, row.questionnaireType)
    await tx.questionnaireCourseDelivery.deleteMany({ where: { compositeId: id } })
    await tx.questionnaireCourseDelivery.createMany({ data: input.courseIds.map(courseId => ({ compositeId: id, courseId })) })
    await tx.compositeAssessment.update({ where: { id }, data: {
      name: input.name, description: input.description ?? null, instruction: input.instruction ?? null,
      publicEnabled: input.publicEnabled, opensAt: date(input.opensAt), expiresAt: date(input.expiresAt),
    } })
  })
}
export async function addItem(actor: Actor, id: string, raw: unknown) {
  const { revision, item } = itemSchema.parse(raw)
  return mutate(actor, id, revision, async (tx, row) => {
    await assertValidItem(item, actor.userId, actor.role, row, tx)
    if (row.items.length >= 500) throw compositeBadRequest('问卷最多包含 500 个内容项')
    const position = Math.max(-1, ...row.items.map((v: any) => v.position), ...row.formSections.map((v: any) => v.position)) + 1
    await tx.compositeAssessmentItem.create({ data: {
      compositeAssessmentId: id, type: item.type, position, required: item.required,
      scaleId: item.type === 'SCALE' ? item.scaleId : null, cognitiveAssignmentId: item.type === 'COGNITIVE' ? item.cognitiveAssignmentId : null,
      situationalInstrumentKey: item.type === 'SITUATIONAL' ? item.situationalInstrumentKey : null,
      situationalInstrumentVersion: item.type === 'SITUATIONAL' ? item.situationalInstrumentVersion : null,
      formType: item.type === 'FORM' ? item.formType : null, formLabel: item.type === 'FORM' ? item.formLabel : null,
      formPlaceholder: item.type === 'FORM' ? item.formPlaceholder : null,
      formOptions: item.type === 'FORM' && item.formOptions ? item.formOptions : Prisma.JsonNull,
      contextKey: item.type === 'FORM' ? item.contextKey : null,
    } })
    await ensureCompositeFormSections(id, tx)
  })
}
export async function removeItem(actor: Actor, id: string, itemId: string, raw: unknown) {
  return mutate(actor, id, revisionSchema.parse(raw).revision, async (tx, row) => {
    const item = row.items.find((v: any) => v.id === itemId)
    if (!item) throw compositeNotFound('问卷内容项不存在')
    await tx.compositeAssessmentItem.delete({ where: { id: itemId } })
    if (item.formSectionId && !await tx.compositeAssessmentItem.count({ where: { formSectionId: item.formSectionId } })) await tx.compositeFormSection.delete({ where: { id: item.formSectionId } })
  })
}
export async function reorder(actor: Actor, id: string, raw: unknown) {
  const { revision, units } = orderSchema.parse(raw)
  return mutate(actor, id, revision, async (tx, row) => {
    const expected = new Map<string, string>([
      ...row.items.filter((v: any) => v.type !== 'FORM').map((v: any) => [v.id, v.type]),
      ...row.formSections.map((v: any) => [v.id, 'FORM_SECTION']),
    ])
    if (units.length !== expected.size || new Set(units.map(v => v.id)).size !== units.length || units.some(v => expected.get(v.id) !== v.type)) throw compositeBadRequest('排序必须包含全部内容单元且不能重复')
    const context = row.formSections.find((s: any) => s.contextSection || s.items.some((v: any) => v.contextKey))
    if (context && units[0]?.id !== context.id) throw compositeBadRequest('人口学上下文区段必须排在第一位')
    const base = Math.max(0, ...row.items.map((v: any) => v.position), ...row.formSections.map((v: any) => v.position)) + 1
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]
      if (unit.type === 'FORM_SECTION') await tx.compositeFormSection.update({ where: { id: unit.id }, data: { position: base + i } })
      else await tx.compositeAssessmentItem.update({ where: { id: unit.id }, data: { position: base + i } })
    }
  })
}
export async function publish(actor: Actor, id: string, raw: unknown) {
  return mutate(actor, id, revisionSchema.parse(raw).revision, async (tx, row) => {
    if (row.questionnaireType === 'COURSE' && !row.questionnaireCourses.length) throw compositeBadRequest('请选择至少一个投放课程')
    if (row.questionnaireType === 'GENERAL' && !row.publicEnabled) throw compositeBadRequest('通用问卷需要启用公开链接')
    await courses(tx, actor, row.questionnaireCourses.map((v: any) => v.courseId), row.questionnaireType)
    for (const item of row.items) {
      const input = { type: item.type, required: item.required,
        ...(item.type === 'SCALE' ? { scaleId: item.scaleId } : {}),
        ...(item.type === 'COGNITIVE' ? { cognitiveAssignmentId: item.cognitiveAssignmentId } : {}),
        ...(item.type === 'SITUATIONAL' ? { situationalInstrumentKey: item.situationalInstrumentKey, situationalInstrumentVersion: item.situationalInstrumentVersion } : {}),
        ...(item.type === 'FORM' ? { formType: item.formType, formLabel: item.formLabel, formOptions: item.formOptions, contextKey: item.contextKey } : {}),
      }
      const copiedBinding = item.type === 'COGNITIVE' && item.cognitiveAssignment?.listedStandalone === false
        && item.cognitiveAssignment?.createdBy === row.createdBy && item.cognitiveAssignment?.courseId === null
        && item.cognitiveAssignment?.resolvedConfigSnapshotEncrypted && item.cognitiveAssignment?.resolvedReportSnapshotEncrypted
      if (!copiedBinding) await assertValidItem(input as any, actor.userId, actor.role, row, tx)
      if (item.type === 'COGNITIVE' && !copiedBinding) {
        const source = item.cognitiveAssignment
        const entry = requireCognitiveRegistryEntry(source.config.testType, source.config.engineVersion, source.config.scoringVersion)
        const freeze = source.resolvedConfigSnapshotEncrypted ? {
          profile: source.profile, profileDefinitionVersion: source.profileDefinitionVersion,
          resolvedConfigSnapshotEncrypted: source.resolvedConfigSnapshotEncrypted, resolvedConfigHash: source.resolvedConfigHash,
          resolvedReportSnapshotEncrypted: source.resolvedReportSnapshotEncrypted,
        } : freezeDataForWrite(freezeAssignmentProfile({ entry, baseConfig: entry.configSchema.parse(source.config.config), profile: 'standard' }))
        const binding = await tx.cognitiveAssignment.create({ data: {
          configId: source.configId, createdBy: actor.userId, title: source.title, instruction: source.instruction,
          status: 'PUBLISHED', publishedAt: new Date(), listedStandalone: false, required: false, ...freeze,
        } })
        await tx.compositeAssessmentItem.update({ where: { id: item.id }, data: { cognitiveAssignmentId: binding.id } })
      }
    }
    for (const section of row.formSections) {
      const definition = mapCompositeSection(section)
      const mediaOwner = publishedFormMediaOwner('COMPOSITE', id, compositeFormSectionDefinitionHash(definition))
      await retainFormSectionImages({ owner: mediaOwner, references: compositeFormSectionImageReferences(definition), db: tx })
      await retainFormSectionVideos({ owner: mediaOwner, presentations: compositeFormSectionVideoPresentations(definition), db: tx })
    }
    await publishComposite(actor.userId, actor.role, id, tx)
  })
}
export async function archive(actor: Actor, id: string, raw: unknown) {
  return mutate(actor, id, revisionSchema.parse(raw).revision, async tx => {
    await tx.compositeAssessment.update({ where: { id }, data: { status: 'ARCHIVED', publicEnabled: false } })
  }, false)
}
export async function remove(actor: Actor, id: string, raw: unknown) {
  author(actor)
  await prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe('SELECT "id" FROM "composite_assessments" WHERE "id" = $1 FOR UPDATE', id)
    const row = await tx.compositeAssessment.findUnique({ where: { id }, include: { _count: { select: { attempts: true } }, items: { select: { cognitiveAssignmentId: true } } } })
    if (!row || row.productKind !== 'QUESTIONNAIRE') throw compositeNotFound()
    owner(actor, row)
    if (row.revision !== revisionSchema.parse(raw).revision || row.status !== 'DRAFT' || row._count.attempts) throw compositeConflict('只能删除没有作答记录的当前草稿')
    await tx.compositeAssessment.delete({ where: { id } })
    await tx.cognitiveAssignment.deleteMany({ where: {
      id: { in: row.items.map(v => v.cognitiveAssignmentId).filter((v): v is string => Boolean(v)) },
      createdBy: row.createdBy, listedStandalone: false, courseId: null,
      compositeItems: { none: {} }, sessions: { none: {} },
    } })
  })
}
export async function list(actor: Actor, page = 1, pageSize = 25) {
  author(actor)
  // SQL is static; values remain positional parameters, never interpolated.
  const union = "SELECT id, name, status::text, created_at AS created, creator_id AS owner_id, 'LEGACY' AS kind, type::text AS questionnaire_type FROM questionnaires UNION ALL SELECT id, name, status::text, created_at AS created, created_by AS owner_id, 'COLLECTION' AS kind, questionnaire_type::text FROM composite_assessments WHERE product_kind = 'QUESTIONNAIRE'"
  const filter = '($1::boolean OR owner_id = $2)'
  const [rows, counts] = await prisma.$transaction([
    prisma.$queryRawUnsafe<any[]>('SELECT * FROM (' + union + ') q WHERE ' + filter + ' ORDER BY created DESC,id,kind LIMIT $3 OFFSET $4', actor.role === 'ADMIN', actor.userId, pageSize, (page - 1) * pageSize),
    prisma.$queryRawUnsafe<Array<{ total: bigint }>>('SELECT COUNT(*) AS total FROM (' + union + ') q WHERE ' + filter, actor.role === 'ADMIN', actor.userId),
  ])
  return { list: rows.map(v => ({ ...v, editHref: v.kind === 'COLLECTION' ? '/questionnaire-products/' + v.id : v.questionnaire_type === 'GENERAL' ? '/general-questionnaires/' + v.id + '/edit' : '/questionnaires/' + v.id })), total: Number(counts[0].total), page, pageSize }
}
export async function available(userId: string) {
  const rows = await listAvailableForStudent(userId)
  return rows.filter(v => v.productKind === 'QUESTIONNAIRE').map(v => ({
    ...v, href: v.canContinue ? '/student/composite/attempts/' + v.attempt!.id :
      v.latestCompletedAttempt && !v.canStartNewAttempt ? '/student/composite/attempts/' + v.latestCompletedAttempt.id + '/report' : '/student/composite/' + v.id,
  }))
}
export async function resources(actor: Actor) {
  author(actor)
  const [scales, cognitive, courseRows] = await Promise.all([
    prisma.scale.findMany({ where: { status: 'PUBLISHED' }, orderBy: { name: 'asc' } }),
    prisma.cognitiveAssignment.findMany({ where: { status: 'PUBLISHED', listedStandalone: true, config: { status: 'PUBLISHED' }, ...(actor.role === 'ADMIN' ? {} : { createdBy: actor.userId }) }, include: { config: true }, orderBy: { title: 'asc' } }),
    prisma.course.findMany({ where: { isLibrary: false, ...(actor.role === 'ADMIN' ? {} : { creatorId: actor.userId }) }, select: { id: true, title: true } }),
  ])
  const usable = []
  for (const row of scales) if (await canUseScale(actor.userId, actor.role, row)) usable.push({ id: row.id, name: row.name, code: row.code, version: row.instrumentVersion })
  return {
    scales: usable, cognitive: cognitive.map(v => ({ id: v.id, name: v.title, profile: v.profile, testType: v.config.testType, configVersion: v.config.configVersion, engineVersion: v.config.engineVersion, scoringVersion: v.config.scoringVersion })),
    situational: listSituationPackages().filter(v => v.releaseStatus === 'PUBLISHED').map(v => ({ id: v.key + '/' + v.instrumentVersion, name: v.definition.source.title || v.key, instrumentKey: v.key, instrumentVersion: v.instrumentVersion })),
    courses: courseRows,
  }
}

/** Copy definitions only; no attempts, responses, tokens or report ciphertext. */
export async function copy(actor: Actor, id: string, raw: unknown) {
  author(actor)
  if (process.env.QUESTIONNAIRE_PRODUCTS_ENABLED === 'false') throw compositeConflict('暂未开放新版问卷创建')
  const { requestId } = z.object({ requestId: z.string().uuid() }).strict().parse(raw)
  const creationKey = actor.userId + ':' + requestId
  const creationHash = canonicalHash({ copySource: id })
  const run = () => prisma.$transaction(async tx => {
    const existing = await tx.compositeAssessment.findUnique({ where: { creationKey } })
    if (existing) {
      if (existing.creationHash !== creationHash) throw compositeConflict('创建请求已用于其他内容')
      return existing.id
    }
    // Resolve storage server-side. A collision is rejected rather than guessed.
    const legacy = await tx.questionnaire.findUnique({ where: { id }, include: {
      questionnaireScales: true, formItems: true, formSections: true, courseQuestionnaires: true,
    } })
    const composite = await tx.compositeAssessment.findUnique({ where: { id }, include: { items: { include: { cognitiveAssignment: true } }, formSections: true, questionnaireCourses: true } })
    if ((!legacy && !composite) || (legacy && composite)) throw compositeNotFound('无法唯一识别来源问卷')
    const source = legacy ?? composite!
    owner(actor, { createdBy: legacy ? legacy.creatorId : composite!.createdBy })
    if (composite && (composite.productKind === 'ASSESSMENT_BUNDLE' || composite.reportPackageKey || composite.analysisProtocolKey)) throw compositeBadRequest('固定报告包不能复制为问卷')
    const questionnaireType = legacy?.type ?? composite!.questionnaireType ?? 'COURSE'
    const sourceCourses = legacy ? legacy.courseQuestionnaires.map(v => v.courseId) : composite!.questionnaireCourses.map(v => v.courseId)
    await courses(tx, actor, sourceCourses, questionnaireType)
    const target = await tx.compositeAssessment.create({ data: {
      code: 'Q-' + randomUUID(), name: source.name + '（副本）', description: source.description, instruction: source.instruction,
      productKind: 'QUESTIONNAIRE', questionnaireType, createdBy: actor.userId, creationKey, creationHash,
      questionnaireCourses: { create: sourceCourses.map(courseId => ({ courseId })) },
    } })
    const sectionIds = new Map<string, string>()
    for (const section of source.formSections) {
      const created = await tx.compositeFormSection.create({ data: {
        compositeAssessmentId: target.id, title: section.title, description: section.description,
        position: section.position, contextSection: section.contextSection,
      } })
      sectionIds.set(section.id, created.id)
    }
    if (legacy) {
      for (const scale of legacy.questionnaireScales) await tx.compositeAssessmentItem.create({ data: {
        compositeAssessmentId: target.id, type: 'SCALE', position: scale.position, required: true, scaleId: scale.scaleId,
      } })
      for (const form of legacy.formItems) await tx.compositeAssessmentItem.create({ data: {
        compositeAssessmentId: target.id, type: 'FORM', position: form.position, required: form.required,
        formType: form.type, formLabel: form.label, formPlaceholder: form.placeholder,
        formOptions: form.options ?? Prisma.JsonNull, contextKey: form.contextKey,
        formSectionId: form.sectionId ? sectionIds.get(form.sectionId) : null, formSectionPosition: form.sectionPosition,
      } })
    } else {
      for (const item of composite!.items) {
        const { id: _id, compositeAssessmentId: _parent, cognitiveAssignment, ...data } = item
        if (cognitiveAssignment?.listedStandalone === false) {
          const binding = await tx.cognitiveAssignment.create({ data: {
            configId: cognitiveAssignment.configId, createdBy: actor.userId, title: cognitiveAssignment.title,
            instruction: cognitiveAssignment.instruction, status: cognitiveAssignment.status,
            listedStandalone: false, required: false, profile: cognitiveAssignment.profile,
            profileDefinitionVersion: cognitiveAssignment.profileDefinitionVersion,
            resolvedConfigSnapshotEncrypted: cognitiveAssignment.resolvedConfigSnapshotEncrypted,
            resolvedConfigHash: cognitiveAssignment.resolvedConfigHash,
            resolvedReportSnapshotEncrypted: cognitiveAssignment.resolvedReportSnapshotEncrypted,
          } })
          data.cognitiveAssignmentId = binding.id
        }
        await tx.compositeAssessmentItem.create({ data: { ...data, compositeAssessmentId: target.id,
          formOptions: item.formOptions ?? Prisma.JsonNull,
          formSectionId: item.formSectionId ? sectionIds.get(item.formSectionId) : null,
        } })
      }
    }
    await ensureCompositeFormSections(target.id, tx)
    return target.id
  }, { timeout: 30000 })
  let target: string
  try { target = await run() } catch (e: any) { if (e.code !== 'P2002') throw e; target = await run() }
  return detail(actor, target)
}

/** Paged audience-projected reports, never raw response tables. */
export async function exportReports(actor: Actor, id: string, raw: unknown) {
  await detail(actor, id)
  const { after } = z.object({ after: z.string().uuid().optional() }).strict().parse(raw)
  const rows = await prisma.compositeAssessmentAttempt.findMany({
    where: { compositeAssessmentId: id, status: 'COMPLETED', ...(after ? { id: { gt: after } } : {}) },
    orderBy: { id: 'asc' }, take: 101, select: { id: true },
  })
  const { getReportForTeacher } = await import('../composite/composite.service')
  const reports = []
  for (const row of rows.slice(0,100)) reports.push(await getReportForTeacher(actor.userId, actor.role, id, row.id))
  return { schemaVersion: 'questionnaire-independent-reports-v1', reportMode: 'COLLECTION_ONLY', questionnaireId: id,
    reports, next: rows.length > 100 ? rows[99].id : null }
}
