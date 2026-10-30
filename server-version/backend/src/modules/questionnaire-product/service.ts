import { appendFormContent, readFormSource } from './form-template-content'
import { parseCatalogFilters, sqlLike } from '../training-catalog/filters'
import {attachTrainingReferenceSelection,listTrainingReferenceChoices,trainingReferenceSelectionSchema} from '../composite/training-reference-selection'
import { assertCurrentTrainingContentOwner, attachTrainingReportSelection, trainingReportSelectionSchema } from '../composite/training-report-selection'
import { prepareTrainingContentSnapshot } from '../composite/training-content-binding'
import {publishAssignmentMeasurementRelease} from '../cognitive/assignment-measurement-release'
import { parseTrainingFeedbackPolicy, trainingFeedbackPolicySchema } from '../assessment-policy/training-feedback-policy'
import { parseTrainingPersistencePolicy } from '../composite/training-persistence.policy'
import { compileWeightedVariants, weightedVariantConfigSchema } from '../assessment-core/weighted-variants'
import { buildTrainingVariantUnion } from '../composite/training-variant-scope'
import { assertTrainingVariantAuthoringScope } from './training-variant-authoring'
import { assertTrainingFlowAuthoringScope, compileTrainingFlowDefinition, hasTrainingFlowDefinition, remapTrainingFlowDraft, trainingFlowSchema, validateTrainingFlow } from './training-flow-authoring'
import {freezeTrainingTimingPolicy,readTrainingTimingPolicy} from '../assessment-runtime/training-scale-timing'
import { remapTrainingFormDefinition } from '../assessment-runtime/form-policy'
import { typedCompositeFormQuestion } from '../assessment-runtime/typed-form'
import { assertCognitiveProductEligible, isCognitiveProductEligible, isCognitiveNewAdmissionEnabled } from '../cognitive/product-eligibility'
import { assertCognitiveCatalogConfiguration } from '../cognitive/assignment.service'
import { Prisma, UserRole } from '@prisma/client'
import {trainingTrackingSelectionSchema,copiedTrainingTracking,readTrainingTracking,trainingTrackingPreviewChoices} from '../composite/personal-tracking'
import {getContentRelease} from '../measurement-content/repository'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../config/database'
import { config } from '../../config'
import { loadCurrentPrincipal } from '../organization/principal'
import { inactiveAccountMessage } from '../../utils/accountStatus'
import { canonicalHash } from '../assessment-runtime/canonical'
import { lockCompositeAssetReferences, compositeSjtGrantScope, inspectCompositeSituationalItems, resolveCompositeSituationalItems, assertValidItem, getCompositeForTeacher, publishComposite, prepareCompositePublication, listAvailableForStudent } from '../composite/composite.service'
import { compositeBadRequest, compositeConflict, compositeForbidden, compositeNotFound } from '../composite/composite.errors'
import { mapCompositeSection, compositeFormSectionDefinitionHash } from '../assessment-runtime/form-section-definition'
import { compositeFormSectionImageReferences, compositeFormSectionMaterialReferences, publishedFormMediaOwner, retainFormSectionImages } from '../assessment-runtime/form-image.adapter'
import { compositeFormSectionVideoPresentations, retainFormSectionVideos } from '../assessment-runtime/form-video.adapter'
import { ensureCompositeFormSections } from '../composite/final-submit.service'
import { addCompositeItemSchema } from '../composite/composite.schema'
import { listQuestionnaireScaleResources } from './scale-resources'
import {prepareTrainingStandardItemSource,verifyStoredTrainingStandardItem,decodeTrainingStandardItemSource} from '../composite/training-standard-combination'
import {trainingReferenceAudit} from '../composite/training-reference-audit'
import {selectedReferenceChanges,type SelectedReferenceAudit} from '../assessment-authorization/selected-reference-audit'
import {listTrainingStandardCombinationChoices} from '../measurement-content/standard-combination-use'
import { situationalReleaseKey, listSituationalResourceSummaries } from '../situational/situational-release.service'
import { freezeAssignmentProfile, freezeDataForWrite } from '../cognitive/profile-freeze'
import {readTrainingCognitiveTaskBinding,loadPinnedTrainingCognitiveProfile} from '../assessment-authorization/training-cognitive-profile-use'
import {assertCognitiveAssignmentFreeze} from '../assessment-authorization/cognitive-profile-assignment'
import { requireCognitiveRegistryEntry } from '../cognitive/cognitive.registry'
import { z } from 'zod'

type Actor = { userId: string; role: UserRole }
type Tx = Prisma.TransactionClient
const author = (a: Actor) => { if (!['ADMIN', 'TEACHER'].includes(a.role)) throw compositeForbidden() }
const owner = (a: Actor, row: { createdBy: string | null }) => {
  author(a)
  if (a.role !== 'ADMIN' && row.createdBy !== a.userId) throw compositeForbidden()
}
const retentionSettingSchema = z.object({ enabled: z.literal(true), ttlHours: z.number().int().min(1).max(48) }).strict().nullable()
const persistencePolicySchema = z.object({ schemaVersion: z.literal(1), checkpoint: retentionSettingSchema.optional().default(null), localCognitive: retentionSettingSchema.optional().default(null) }).strict().nullable()
const metadata = {
  trainingFeedbackPolicy: trainingFeedbackPolicySchema.nullable().optional(),
  trainingPersistencePolicy: persistencePolicySchema.optional(),
  trainingTimingEnabled: z.boolean().optional(),
  name: z.string().trim().min(1, '请填写问卷名称').max(200, '问卷名称不能超过200字'), description: z.string().max(5000).nullable().optional(),
  instruction: z.string().max(10000).nullable().optional(), courseIds: z.array(z.string().min(1)).max(100).default([]),
  publicEnabled: z.boolean().default(false), opensAt: z.string().datetime().nullable().optional(), expiresAt: z.string().datetime().nullable().optional(),
}
export const createSchema = z.object({ ...metadata, requestId: z.string().guid(), questionnaireType: z.enum(['COURSE', 'GENERAL']) }).strict()
export const editSchema = z.object({ ...metadata, revision: z.number().int().nonnegative() }).strict()
export const trainingVariantsSchema = z.object({
  revision: z.number().int().nonnegative(), config: weightedVariantConfigSchema.nullable(),
  maxAttempts: z.number().int().min(1).max(100).optional(),
}).strict()
export const revisionSchema = z.object({ revision: z.number().int().nonnegative() }).strict()
export const itemSchema = z.object({ revision: z.number().int().nonnegative(), item: addCompositeItemSchema, formSectionId: z.string().min(1).optional() }).strict()
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
async function assertTrainingPolicyCreator(tx: Tx, row: {createdBy?:string|null}, facts: Array<{creatorId:string}>, label:string) {
  const creator=row.createdBy?await loadCurrentPrincipal(row.createdBy,tx):null
  if(!creator || !['LEGACY','TRAINING'].includes(creator.accountDomain) || inactiveAccountMessage(creator) || creator.mustChangePassword
    || (creator.role!=='ADMIN' && (creator.role!=='TEACHER' || !creator.teacherApproved || facts.some(course=>course.creatorId!==creator.userId))))
    throw compositeForbidden(label+'的课程编制权限无效')
}
export async function validateTrainingPersistenceAuthoring(tx: Tx, row: any, raw: unknown) {
  const policy = parseTrainingPersistencePolicy(raw)
  if (!policy) return { trainingPersistencePolicy: Prisma.DbNull, trainingPersistencePolicyHash: null }
  if (policy.checkpoint || policy.localCognitive) {
    if (row.productKind !== 'QUESTIONNAIRE' || row.questionnaireType !== 'COURSE' || row.deliveryMode === 'LEGACY' || row.reportPackageKey || row.analysisProtocolKey)
      throw compositeBadRequest('草稿策略仅支持 Training 课程普通问卷')
    const ids = (row.questionnaireCourses ?? []).map((entry: any) => entry.courseId)
    if (!ids.length || (row.publicEnabled && ids.length !== 1)) throw compositeBadRequest('公开草稿策略必须明确绑定唯一 Training 课程')
    const facts = await tx.course.findMany({ where: { id: { in: ids } }, select: { id: true, courseType: true, isLibrary: true, creatorId: true } })
    if (facts.length !== ids.length || facts.some(course => course.isLibrary || course.courseType !== 'TRAINING_COURSE')) throw compositeBadRequest('草稿策略的 Training 课程来源无效')
    await assertTrainingPolicyCreator(tx,row,facts,'草稿策略')
  }
  return { trainingPersistencePolicy: policy as Prisma.InputJsonValue, trainingPersistencePolicyHash: canonicalHash(policy) }
}
/** New eligible Training drafts default to immediate feedback. Existing null
 * publications are never inferred/backfilled on metadata edit or publish. */
export async function validateTrainingFeedbackAuthoring(tx: Tx, row: any, raw: unknown, initializeDefault = false) {
  const absent = { trainingFeedbackPolicy: Prisma.DbNull, trainingFeedbackPolicyHash: null }
  if (raw == null && !initializeDefault) return absent
  const ids: string[] = (row.questionnaireCourses ?? []).map((entry: any) => entry.courseId)
  const eligibleScope = row.productKind === 'QUESTIONNAIRE' && row.questionnaireType === 'COURSE' && row.deliveryMode !== 'LEGACY' &&
    !row.reportPackageKey && !row.analysisProtocolKey && ids.length > 0 && new Set(ids).size === ids.length &&
    (!row.publicEnabled || ids.length === 1)
  if (!eligibleScope) {
    if (raw == null) return absent
    throw compositeBadRequest('反馈开放策略仅支持明确绑定 Training 课程的普通问卷；公开投放须绑定唯一课程')
  }
  const facts = await tx.course.findMany({ where: { id: { in: ids } }, select: { id: true, courseType: true, isLibrary: true, creatorId: true } })
  if (facts.length !== ids.length || facts.some(course => course.isLibrary || course.courseType !== 'TRAINING_COURSE')) {
    if (raw == null) return absent
    throw compositeBadRequest('反馈开放策略的 Training 课程来源无效')
  }
  await assertTrainingPolicyCreator(tx,row,facts,'反馈开放策略')
  let policy
  try { policy = parseTrainingFeedbackPolicy(raw) } catch { throw compositeBadRequest('反馈开放策略或预设开放时间无效') }
  return { trainingFeedbackPolicy: policy as Prisma.InputJsonValue, trainingFeedbackPolicyHash: canonicalHash(policy) }
}
async function timingPolicy(tx:Tx, row:any, enabled:boolean) {
 if(!enabled)return Prisma.DbNull
 if(row.questionnaireType!=='COURSE'||row.productKind!=='QUESTIONNAIRE'||row.reportPackageKey||row.analysisProtocolKey)throw compositeBadRequest('计时仅支持 Training 课程普通问卷')
 const ids=(row.questionnaireCourses??[]).map((x:any)=>x.courseId)
 const facts=await tx.course.findMany({where:{id:{in:ids}},select:{id:true,courseType:true,isLibrary:true}})
 if(facts.length!==ids.length)throw compositeBadRequest('计时课程来源缺失')
 return freezeTrainingTimingPolicy(facts,row.publicEnabled)
}
export async function updateTimingExport(actor:Actor,id:string,raw:unknown){
 const input=z.object({revision:z.number().int().nonnegative(),enabled:z.boolean()}).strict().parse(raw)
 return mutate(actor,id,input.revision,async(tx,row)=>{
  await tx.compositeAssessment.update({where:{id},data:{timingExportEnabled:input.enabled}})
  await tx.assessmentManagementEvent.create({data:{actorId:actor.userId,resourceId:id,action:'TRAINING_TIMING_EXPORT_POLICY',metadata:{previous:row.timingExportEnabled,enabled:input.enabled,revision:row.revision+1}}})
 },false)
}
/** Explicit opt-in; the ordinary null configuration is never inferred or backfilled. */
export async function updateTrainingVariants(actor: Actor, id: string, raw: unknown) {
  const input = trainingVariantsSchema.parse(raw)
  return mutate(actor, id, input.revision, async (tx, row) => {
    if (input.config === null) {
      if (input.maxAttempts !== undefined) throw compositeBadRequest('关闭分组时不能同时改变作答次数')
      await tx.compositeAssessment.update({ where: { id }, data: {
        trainingVariantDraft: Prisma.DbNull, trainingVariantFrozen: Prisma.DbNull, trainingVariantDigest: null,
      } })
      return
    }
    const candidate = { ...row, maxAttempts: input.maxAttempts ?? row.maxAttempts }
    await assertTrainingVariantAuthoringScope(tx, candidate)
    compileWeightedVariants(input.config, buildTrainingVariantUnion(candidate))
    await tx.compositeAssessment.update({ where: { id }, data: {
      trainingVariantDraft: input.config as Prisma.InputJsonValue,
      trainingVariantFrozen: Prisma.DbNull, trainingVariantDigest: null, maxAttempts: candidate.maxAttempts,
    } })
  })
}
/** Explicit opt-in. No flow is inferred from a legacy questionnaire layout. */
export async function updateTrainingFlow(actor: Actor, id: string, raw: unknown) {
  const input = trainingFlowSchema.parse(raw)
  return mutate(actor, id, input.revision, async (tx, row) => {
    if(input.maxAttempts!==undefined&&input.config?.schemaVersion!==2)throw compositeBadRequest('作答预算仅随明确材料实验设置')
    const candidate={...row,trainingFlowDraft:input.config,maxAttempts:input.maxAttempts??row.maxAttempts}
    if (input.config !== null) {
      await assertTrainingFlowAuthoringScope(tx, candidate)
      compileTrainingFlowDefinition(input.config, candidate)
    }
    await tx.compositeAssessment.update({ where: { id }, data: {
      trainingFlowDraft: input.config === null ? Prisma.DbNull : input.config as Prisma.InputJsonValue,
      trainingFlowFrozen: Prisma.DbNull, trainingFlowDigest: null, ...(input.maxAttempts!==undefined?{maxAttempts:input.maxAttempts}:{}),
    } })
  })
}
async function validateTrainingVariants(tx: Tx, row: any) {
  if (row.trainingVariantDraft == null) return
  await assertTrainingVariantAuthoringScope(tx, row)
  return compileWeightedVariants(row.trainingVariantDraft, buildTrainingVariantUnion(row))
}
export async function detail(actor: Actor, id: string) {
  const row = await prisma.compositeAssessment.findUnique({ where: { id } })
  if (!row || !['QUESTIONNAIRE', 'FORM_TEMPLATE'].includes(row.productKind)) throw compositeNotFound('新版问卷不存在')
  owner(actor, row)
  let reportSelection:unknown=undefined,referenceSelection:unknown=undefined
  if(row.createdBy===actor.userId){
    reportSelection=null;referenceSelection=null
    if((row as any).trainingReportSelectionDraft!=null||(row as any).trainingReferenceSelectionDraft!=null){const selections=await prisma.$transaction(async tx=>{
      const current=await tx.compositeAssessment.findUnique({where:{id},include:{questionnaireCourses:true}})
      if(!current)throw compositeNotFound('新版问卷不存在')
      await assertCurrentTrainingContentOwner(tx,actor,current)
      return {report:current.trainingReportSelectionDraft,reference:current.trainingReferenceSelectionDraft}
    });reportSelection=selections.report;referenceSelection=selections.reference}
  }
  return { ...await getCompositeForTeacher(actor.userId, actor.role, id), trainingReportSelectionDraft:reportSelection, trainingReferenceSelectionDraft:referenceSelection, supportedChannels: ['WEB'], reportMode: 'COLLECTION_ONLY' }
}
const formSourceSchema = z.object({ id: z.string().min(1), kind: z.enum(['COMPOSITE', 'LEGACY']), revision: z.number().int().nonnegative().optional() }).strict()
export async function createFormTemplate(actor: Actor, raw: unknown) {
  author(actor)
  if (process.env.QUESTIONNAIRE_PRODUCTS_ENABLED === 'false') throw compositeConflict('暂未开放表单编制')
  const input = z.object({ name: metadata.name, description: metadata.description, instruction: metadata.instruction, requestId: z.string().guid(), source: formSourceSchema.optional() }).strict().parse(raw)
  const creationKey = actor.userId + ':' + input.requestId, creationHash = canonicalHash({ formTemplate: input })
  const id = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${creationKey},0))`
    const previous = await tx.compositeAssessment.findUnique({ where: { creationKey } })
    if (previous) {
      if (previous.creationHash !== creationHash) throw compositeConflict('创建请求已用于其他内容')
      return previous.id
    }
    const source = input.source ? await readFormSource(tx, actor, input.source) : null
    const row = await tx.compositeAssessment.create({ data: {
      code: 'F-' + randomUUID(), productKind: 'FORM_TEMPLATE', questionnaireType: 'GENERAL', createdBy: actor.userId,
      name: input.name, description: input.description ?? source?.description, instruction: input.instruction ?? source?.instruction, creationKey, creationHash,
    } })
    if (source?.items.length) {
      await appendFormContent(tx, { ...row, items: [], formSections: [] }, source, false)
      await ensureCompositeFormSections(row.id, tx)
    }
    return row.id
  }, { timeout: 30000 })
  return detail(actor, id)
}
export async function importFormTemplate(actor: Actor, id: string, raw: unknown) {
  const input = z.object({ revision: z.number().int().nonnegative(), source: formSourceSchema }).strict().parse(raw)
  if (input.source.kind === 'COMPOSITE' && input.source.id === id) throw compositeBadRequest('不能把表单加入自身')
  return mutate(actor, id, input.revision, async (tx, row) => {
    const source = await readFormSource(tx, actor, input.source)
    await appendFormContent(tx, row, source)
    await ensureCompositeFormSections(id, tx)
  })
}
export async function formTemplateSources(actor: Actor) {
  author(actor)
  const owned = await prisma.compositeAssessment.findMany({ where: {
    createdBy: actor.userId, productKind: { in: ['FORM_TEMPLATE', 'QUESTIONNAIRE'] }, status: { not: 'ARCHIVED' },
    items: { some: { type: 'FORM' }, none: { type: { not: 'FORM' } } },
    reportPackageKey: null, analysisProtocolKey: null,
  }, select: { id: true, name: true, description: true, revision: true, updatedAt: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] })
  const legacy = await prisma.questionnaire.findMany({ where: {
    type: 'GENERAL', questionnaireScales: { none: {} }, formItems: { some: {} }, creator: { accountDomain: { in: ['LEGACY', 'TRAINING'] } },
    OR: [{ creatorId: actor.userId }, ...(config.materialGrantsEnabled ? [{ status: 'PUBLISHED' as const, id: { in: (await prisma.materialGrant.findMany({ where: { teacherId: actor.userId, resourceType: 'FORM_TEMPLATE' }, select: { resourceId: true } })).map(grant => grant.resourceId) } }] : [])],
  }, select: { id: true, name: true, description: true } })
  return { list: [...owned.map(row => ({ ...row, kind: 'COMPOSITE' })), ...legacy.map(row => ({ ...row, kind: 'LEGACY' }))] }
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
      trainingTimingPolicy: await timingPolicy(tx,{productKind:'QUESTIONNAIRE',questionnaireType:input.questionnaireType,questionnaireCourses:input.courseIds.map(courseId=>({courseId})),publicEnabled:input.publicEnabled},input.trainingTimingEnabled===true),
      ...await validateTrainingPersistenceAuthoring(tx,{createdBy:actor.userId,productKind:'QUESTIONNAIRE',questionnaireType:input.questionnaireType,questionnaireCourses:input.courseIds.map(courseId=>({courseId})),publicEnabled:input.publicEnabled},input.trainingPersistencePolicy),
      ...await validateTrainingFeedbackAuthoring(tx,{createdBy:actor.userId,productKind:'QUESTIONNAIRE',questionnaireType:input.questionnaireType,questionnaireCourses:input.courseIds.map(courseId=>({courseId})),publicEnabled:input.publicEnabled},input.trainingFeedbackPolicy,true),
      creationKey, creationHash, publicEnabled: input.publicEnabled, opensAt: date(input.opensAt), expiresAt: date(input.expiresAt),
      questionnaireCourses: { create: input.courseIds.map(courseId => ({ courseId })) },
    } })).id
  })
  let id: string
  try { id = await run() } catch (e: any) { if (e.code !== 'P2002') throw e; id = await run() }
  return detail(actor, id)
}
async function mutate(actor: Actor, id: string, revision: number, fn: (tx: Tx, row: any) => Promise<void>, draft = true, noOp?: (row: any) => boolean, allowFormTemplate = false) {
  author(actor)
  await prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe('SELECT "id" FROM "composite_assessments" WHERE "id" = $1 FOR UPDATE', id)
    const row = await tx.compositeAssessment.findUnique({ where: { id }, include: {
      questionnaireCourses: true, items: { orderBy: { position: 'asc' }, include: { cognitiveAssignment: { include: { config: true } }, scale: true } },
      formSections: { orderBy: { position: 'asc' }, include: { items: true } },
    } })
    if (!row || (row.productKind !== 'QUESTIONNAIRE' && !(allowFormTemplate && row.productKind === 'FORM_TEMPLATE'))) throw compositeNotFound('新版问卷不存在')
    owner(actor, row)
    if (row.reportPackageKey || row.analysisProtocolKey) throw compositeConflict('问卷必须只收集单项结果')
    if (noOp?.(row)) return
    if (row.revision !== revision) throw compositeConflict('问卷已被其他操作修改，请刷新后重试')
    if (draft && row.status !== 'DRAFT') throw compositeConflict('已发布问卷不能修改，请复制为新草稿')
    await fn(tx, row)
    // Keep every edit atomic with the saved group references. Authors can
    // explicitly disable grouping before changing the global unit layout.
    if (draft && row.status === 'DRAFT' && (row.trainingVariantDraft != null || hasTrainingFlowDefinition(row))) {
      const current = await tx.compositeAssessment.findUnique({ where: { id }, include: {
        questionnaireCourses: true, items: true, formSections: { include: { items: true } },
      } })
      if (current?.trainingVariantDraft != null) await validateTrainingVariants(tx, current)
      if (current) await validateTrainingFlow(tx, current)
    }
    await tx.compositeAssessment.update({ where: { id }, data: { revision: { increment: 1 } } })
  }, { timeout: 30000 })
  return detail(actor, id)
}
export async function update(actor: Actor, id: string, raw: unknown) {
  const input = editSchema.parse(raw); windowCheck(input)
  return mutate(actor, id, input.revision, async (tx, row) => {
    if (row.productKind === 'FORM_TEMPLATE' && (input.courseIds.length || input.publicEnabled || input.opensAt || input.expiresAt || input.trainingFeedbackPolicy || input.trainingPersistencePolicy || input.trainingTimingEnabled)) throw compositeBadRequest('独立表单只保存内容，不设置投放或报告策略')
    await courses(tx, actor, input.courseIds, row.questionnaireType)
    await tx.questionnaireCourseDelivery.deleteMany({ where: { compositeId: id } })
    await tx.questionnaireCourseDelivery.createMany({ data: input.courseIds.map(courseId => ({ compositeId: id, courseId })) })
    await tx.compositeAssessment.update({ where: { id }, data: {
      trainingTimingPolicy: await timingPolicy(tx,{...row,questionnaireCourses:input.courseIds.map(courseId=>({courseId})),publicEnabled:input.publicEnabled},input.trainingTimingEnabled??Boolean(row.trainingTimingPolicy)),
      ...await validateTrainingPersistenceAuthoring(tx,{...row,questionnaireCourses:input.courseIds.map(courseId=>({courseId})),publicEnabled:input.publicEnabled},input.trainingPersistencePolicy === undefined ? row.trainingPersistencePolicy : input.trainingPersistencePolicy),
      ...await validateTrainingFeedbackAuthoring(tx,{...row,questionnaireCourses:input.courseIds.map(courseId=>({courseId})),publicEnabled:input.publicEnabled},input.trainingFeedbackPolicy === undefined ? row.trainingFeedbackPolicy : input.trainingFeedbackPolicy),
      name: input.name, description: input.description ?? null, instruction: input.instruction ?? null,
      publicEnabled: input.publicEnabled, opensAt: date(input.opensAt), expiresAt: date(input.expiresAt),
    } })
  }, true, undefined, true)
}
export async function addItem(actor: Actor, id: string, raw: unknown) {
  const { revision, item, formSectionId } = itemSchema.parse(raw)
  return mutate(actor, id, revision, async (tx, row) => {
    if (row.productKind === 'FORM_TEMPLATE' && item.type !== 'FORM') throw compositeBadRequest('独立表单只能加入表单题目')
    const itemId = randomUUID()
    const standard=item.standardCombination?await prepareTrainingStandardItemSource(tx,actor.userId,row,{id:itemId,scaleId:item.scaleId!},item.standardCombination):null
    if(!standard)await assertValidItem(item, actor.userId, actor.role, row.productKind === 'FORM_TEMPLATE' ? { ...row, productKind: 'QUESTIONNAIRE' } : row, tx)
    if (row.items.length >= 500) throw compositeBadRequest('问卷最多包含 500 个内容项')
    const position = Math.max(-1, ...row.items.map((v: any) => v.position), ...row.formSections.map((v: any) => v.position)) + 1
    const targetSection = formSectionId ? row.formSections.find((section:any)=>section.id===formSectionId) : null
    if (formSectionId && (item.type!=='FORM' || !targetSection || targetSection.contextSection || item.contextKey)) throw compositeBadRequest('只能加入当前草稿已有的普通表单区段')
    if (targetSection) {
      const ordered = [...row.items].sort((a:any,b:any)=>a.position-b.position)
      const start = ordered.findIndex((value:any)=>value.formSectionId===targetSection.id)
      if (start < 0 || ordered.slice(start).some((value:any)=>value.formSectionId!==targetSection.id)) throw compositeBadRequest('只能追加到末尾连续表单区段；请创建新区段，不能跨越后续内容')
    }
    await tx.compositeAssessmentItem.create({ data: {
      id: itemId,
      ...(standard?{standardCombinationSource:{reference:standard.reference,referenceHash:standard.referenceHash} as Prisma.InputJsonValue}:{}),
      ...(targetSection ? {formSectionId:targetSection.id, formSectionPosition:Math.max(-1,...targetSection.items.map((child:any)=>child.formSectionPosition??child.position))+1}: {}),
      ...(item.type==='FORM' && item.formPolicy ? {formPolicy:item.formPolicy}: {}),
      ...(item.type === 'FORM' && item.formDefinition ? { formDefinition: { ...item.formDefinition, itemKey: 'q_' + itemId } as Prisma.InputJsonValue } : {}),
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
    await auditSelectedReferences(tx,actor,row,[],trainingReferenceAudit(row,{id:itemId,type:item.type,scaleId:item.scaleId??null,
      standardCombinationSource:standard?{reference:standard.reference,referenceHash:standard.referenceHash}:null}))
  }, true, undefined, true)
}
export async function updateFormItem(actor: Actor, id: string, itemId: string, raw: unknown) {
  const { revision, item } = itemSchema.parse(raw)
  return mutate(actor, id, revision, async (tx, row) => {
    if (row.productKind !== 'FORM_TEMPLATE') throw compositeBadRequest('此编辑入口只修改独立表单题目')
    const previous = row.items.find((value: any) => value.id === itemId)
    if (!previous || previous.type !== 'FORM' || item.type !== 'FORM') throw compositeNotFound('表单题目不存在')
    if ((item.contextKey ?? null) !== previous.contextKey) throw compositeBadRequest('编辑已有题目时不能改变人口学字段绑定')
    await assertValidItem(item, actor.userId, actor.role, { ...row, productKind: 'QUESTIONNAIRE' }, tx)
    await tx.compositeAssessmentItem.update({ where: { id: itemId }, data: {
      required: item.required, formType: item.formType, formLabel: item.formLabel,
      formPlaceholder: item.formPlaceholder ?? previous.formPlaceholder,
      formOptions: item.formOptions ?? Prisma.JsonNull,
      formDefinition: item.formDefinition ? { ...item.formDefinition, itemKey: (previous.formDefinition as any)?.itemKey ?? 'q_' + itemId } as Prisma.InputJsonValue : Prisma.DbNull,
      formPolicy: item.formPolicy ?? Prisma.DbNull,
    } })
  }, true, undefined, true)
}
export async function removeItem(actor: Actor, id: string, itemId: string, raw: unknown) {
  return mutate(actor, id, revisionSchema.parse(raw).revision, async (tx, row) => {
    const item = row.items.find((v: any) => v.id === itemId)
    if (!item) throw compositeNotFound('问卷内容项不存在')
    const removed=trainingReferenceAudit(row,item)
    await tx.compositeAssessmentItem.delete({ where: { id: itemId } })
    if (item.formSectionId && !await tx.compositeAssessmentItem.count({ where: { formSectionId: item.formSectionId } })) await tx.compositeFormSection.delete({ where: { id: item.formSectionId } })
    await auditSelectedReferences(tx,actor,row,removed,[])
  }, true, undefined, true)
}
async function auditSelectedReferences(tx:Tx,actor:Actor,row:{id:string;createdBy:string;revision:number},previous:SelectedReferenceAudit[],next:SelectedReferenceAudit[]){
 const changes=selectedReferenceChanges(previous,next)
 if(changes)await tx.assessmentManagementEvent.create({data:{actorId:actor.userId,resourceId:row.id,action:'TRAINING_DRAFT_SOURCE_BINDINGS_CHANGED',
  metadata:{schemaVersion:1,ownerId:row.createdBy,fromRevision:row.revision,toRevision:row.revision+1,...changes}}})
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
  }, true, undefined, true)
}

export async function removeEmptySection(actor: Actor, id: string, sectionId: string, raw: unknown) {
  return mutate(actor, id, revisionSchema.parse(raw).revision, async (tx, row) => {
    const section = row.formSections.find((value: any) => value.id === sectionId)
    if (!section) throw compositeNotFound('表单区段不存在')
    if (section.items.length) throw compositeConflict('区段中还有字段，请先移除字段')
    await tx.compositeFormSection.delete({ where: { id: sectionId } })
  }, true, undefined, true)
}
const copiedCognitiveBinding = (item: any, row: any) => item.type === 'COGNITIVE' && item.cognitiveAssignment?.listedStandalone === false
  && item.cognitiveAssignment?.createdBy === row.createdBy && item.cognitiveAssignment?.courseId === null
  && item.cognitiveAssignment?.resolvedConfigSnapshotEncrypted && item.cognitiveAssignment?.resolvedReportSnapshotEncrypted

async function validateDelivery(tx: Tx, actor: Actor, row: any) {
    if (row.questionnaireType === 'COURSE' && !row.questionnaireCourses.length) throw compositeBadRequest('请选择至少一个投放课程')
    if (row.questionnaireType === 'GENERAL' && !row.publicEnabled) throw compositeBadRequest('通用问卷需要启用公开链接')
    windowCheck({ publicEnabled: row.publicEnabled, opensAt: row.opensAt?.toISOString(), expiresAt: row.expiresAt?.toISOString() })
    await courses(tx, actor, row.questionnaireCourses.map((v: any) => v.courseId), row.questionnaireType)
}

async function validateResources(tx: Tx, actor: Actor, row: any, inspected?: Awaited<ReturnType<typeof inspectCompositeSituationalItems>>) {
  const situational = inspected?.releases ?? await resolveCompositeSituationalItems(row.items, tx, true, compositeSjtGrantScope(row))
  for (const item of row.items) {
    if(item.standardCombinationSource!=null){await verifyStoredTrainingStandardItem(tx,row,item);continue}
    // Legacy storage accepts arbitrary strings. Do not publish an unknown
    // field type as a text input through the player's compatibility fallback.
    if (item.type === 'FORM' && item.formDefinition == null && !['fill_blank', 'single_choice', 'multiple_choice', 'text_input', 'year_month'].includes(item.formType)) {
      throw compositeBadRequest(`表单字段“${item.formLabel || item.id}”的题型不受支持，请在副本中重新配置后发布`)
    }
    if (copiedCognitiveBinding(item, row)) continue
    if (item.type === 'SITUATIONAL' && inspected) {
      const key = situationalReleaseKey({ instrumentKey: item.situationalInstrumentKey, instrumentVersion: item.situationalInstrumentVersion })
      if (inspected.errors.has(key)) throw inspected.errors.get(key)
    }
    await assertValidItem({ ...item, required: item.required } as any, actor.userId, actor.role, row, tx, situational)
  }
  return situational
}

export async function preflight(actor: Actor, id: string, raw: unknown) {
  author(actor)
  const { revision } = revisionSchema.parse(raw)
  return prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe('SELECT "id" FROM "composite_assessments" WHERE "id" = $1 FOR SHARE', id)
    const row = await tx.compositeAssessment.findUnique({ where: { id }, include: {
      questionnaireCourses: true, formSections: { include: { items: true } }, items: { include: { cognitiveAssignment: { include: { config: true } }, scale: true } },
    } })
    if (!row || row.productKind !== 'QUESTIONNAIRE') throw compositeNotFound()
    owner(actor, row)
    if (row.revision !== revision) throw compositeConflict('草稿已变化，请刷新后重新自检')
    const inspectedSituational = await inspectCompositeSituationalItems(row.items, tx, compositeSjtGrantScope(row))
    const checks: Array<{ key: string; label: string; status: 'passed' | 'failed'; message: string; targetId?: string }> = []
    const trackingCandidates:Array<{itemId:string;scoreKey:string;label:string;unit:string}>=[]
    for (const [key, label, validate] of [
      ['delivery', '课程、公开投放与时间', () => validateDelivery(tx, actor, row)],
      ['training-persistence', 'Training 草稿策略与课程来源', () => validateTrainingPersistenceAuthoring(tx, row, row.trainingPersistencePolicy)],
      ['training-feedback', 'Training 反馈开放时间与课程来源', () => validateTrainingFeedbackAuthoring(tx, row, row.trainingFeedbackPolicy)],
      ['training-variants', 'Training 加权分组、完整覆盖与次数限制', () => validateTrainingVariants(tx, row)],
      ['training-flow', 'Training 条件路径、材料与结束规则', () => validateTrainingFlow(tx, row)],
      ['resources', '内容依赖与当前权限', () => validateResources(tx, actor, row, inspectedSituational)],
      ['content', '区段、背景顺序、字段与冻结定义', async () => {
        if (inspectedSituational.errors.size) throw inspectedSituational.errors.values().next().value
        const prepared=await prepareCompositePublication(actor.userId, actor.role, id, tx, inspectedSituational.releases)
        const snapshot=prepared.trainingContentSnapshot as import('../composite/training-content-binding').TrainingContentSnapshot|undefined
        for(const unit of snapshot?.units??[]){
          const release=await getContentRelease(tx,unit.measurement.releaseId)
          const item=row.items.find(i=>i.id===unit.itemId)
          if(release?.layer==='MEASUREMENT')for(const metric of release.content.metrics)trackingCandidates.push({
            itemId:unit.itemId,scoreKey:metric.metricKey,label:(item?.scale?.name??item?.cognitiveAssignment?.title??item?.situationalInstrumentKey??'工具')+' · '+metric.metricKey,unit:metric.unit})
        }
        trackingCandidates.push(...trainingTrackingPreviewChoices(row.items.filter(item=>item.type==='FORM')).map(choice=>({...choice,unit:'raw'})))
        return prepared
      }],
    ] as const) {
      try { await validate(); checks.push({ key, label, status: 'passed', message: '通过' }) }
      catch (cause: any) {
        if (!(cause.statusCode >= 400 && cause.statusCode < 500)) throw cause
        checks.push({ key, label, status: 'failed', message: cause.message })
      }
    }
    if (checks.some(check => check.key === 'resources' && check.status === 'failed')) {
      for (const item of row.items) {
        try { await validateResources(tx, actor, { ...row, items: [item] }, inspectedSituational) }
        catch (cause: any) {
          if (!(cause.statusCode >= 400 && cause.statusCode < 500)) throw cause
          checks.push({ key: 'resource:' + item.id, label: item.scale?.name || item.cognitiveAssignment?.title || item.formLabel || '内容依赖', status: 'failed', message: cause.message, targetId: item.formSectionId || item.id })
        }
      }
    }
    if (checks.some(check => check.key === 'content' && check.status === 'failed')) {
      for (const section of row.formSections.filter(section => !section.items.length)) checks.push({ key: 'section:' + section.id, label: section.title, status: 'failed', message: '移除空区段或在当前草稿补齐字段，再重新自检。', targetId: section.id })
    }
    if(row.trainingTimingPolicy){try{await timingPolicy(tx,row,true);checks.push({key:'timing',label:'可选计时来源',status:'passed',message:'通过'})}catch(cause:any){if(!(cause.statusCode>=400&&cause.statusCode<500))throw cause;checks.push({key:'timing',label:'可选计时来源',status:'failed',message:cause.message})}}
    return { revision, ok: checks.every(check => check.status === 'passed'), checks, reportMode: 'COLLECTION_ONLY',trackingCandidates }
  }, { timeout: 30000 })
}

async function prepareOwnedCognitiveMeasurements(tx:Tx,actor:Actor,row:any) {
  if(!row.items.some((item:any)=>item.type==='COGNITIVE'))return
  const expiry=await assertCurrentTrainingContentOwner(tx,actor,row)
    for (const item of row.items) {
      const copiedBinding = copiedCognitiveBinding(item, row)
      const fixedPin=item.type==='COGNITIVE'?readTrainingCognitiveTaskBinding(item.cognitiveAssignment?.courseSnapshot):null
      const precise=fixedPin?await loadPinnedTrainingCognitiveProfile(tx,fixedPin,{userId:actor.userId,configId:item.cognitiveAssignment.configId},true):null
      if(precise)assertCognitiveAssignmentFreeze(item.cognitiveAssignment,precise.artifact)
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
          quotaSourceAssignmentId: source.createdBy === actor.userId ? source.quotaSourceAssignmentId ?? source.id : null, maxAttempts: source.maxAttempts,
          ...(precise?{courseSnapshot:{selectedCognitiveProfile:fixedPin,selectedCognitiveConfigurationName:precise.configurationName}}:{}),
        } })
        await tx.compositeAssessmentItem.update({ where: { id: item.id }, data: { cognitiveAssignmentId: binding.id } })
        if(precise)await publishAssignmentMeasurementRelease(tx,actor.userId,binding.id,precise.artifact)
        else await publishAssignmentMeasurementRelease(tx,actor.userId,binding.id)
      } else if (item.type==='COGNITIVE') {
        if(precise)await publishAssignmentMeasurementRelease(tx,actor.userId,item.cognitiveAssignment.id,precise.artifact)
        else await publishAssignmentMeasurementRelease(tx,actor.userId,item.cognitiveAssignment.id)
      }
    }
  return expiry
 }
async function recheckMeasurementPublisherExpiry(tx:Tx,expiresAt:Date|null|undefined) {
  if(!expiresAt)return
  const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
  if(!clock||expiresAt<=clock.now)throw compositeForbidden('测量实例作者账号已到期')
}

export async function contentReferenceChoices(actor:Actor,id:string) {
  return prisma.$transaction(async tx=>{
    const row=await tx.compositeAssessment.findUnique({where:{id},include:{questionnaireCourses:true,items:{include:{scale:true,cognitiveAssignment:{include:{config:true}}}}}})
    if(!row||row.productKind!=='QUESTIONNAIRE')throw compositeNotFound('新版问卷不存在')
    const expiry=await assertCurrentTrainingContentOwner(tx,actor,row)
    const situational=await validateResources(tx,actor,row)
    const prepared=await prepareTrainingContentSnapshot(tx,row,situational)
    const result=await listTrainingReferenceChoices(tx,{...prepared,ownerId:actor.userId})
    await recheckMeasurementPublisherExpiry(tx,expiry)
    return result
  },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:10000})
}
export async function updateContentReferenceSelection(actor:Actor,id:string,raw:unknown) {
  const input=z.object({revision:z.number().int().nonnegative(),selection:trainingReferenceSelectionSchema.nullable()}).strict().parse(raw)
  return mutate(actor,id,input.revision,async(tx,row)=>{
    const expiry=await assertCurrentTrainingContentOwner(tx,actor,row)
    const situational=await validateResources(tx,actor,row)
    if(input.selection!=null){
      const prepared=await prepareTrainingContentSnapshot(tx,row,situational)
      await attachTrainingReferenceSelection(tx,{...prepared,ownerId:actor.userId,selection:input.selection})
    }
    await recheckMeasurementPublisherExpiry(tx,expiry)
    await tx.compositeAssessment.update({where:{id},data:{trainingReferenceSelectionDraft:input.selection??Prisma.DbNull}})
  })
}

export async function updateContentReportSelection(actor:Actor,id:string,raw:unknown) {
  const input=z.object({revision:z.number().int().nonnegative(),selection:trainingReportSelectionSchema.nullable()}).strict().parse(raw)
  return mutate(actor,id,input.revision,async(tx,row)=>{
    const expiry=await assertCurrentTrainingContentOwner(tx,actor,row)
    const situational=await validateResources(tx,actor,row)
    if(input.selection!=null){
      const prepared=await prepareTrainingContentSnapshot(tx,row,situational)
      await attachTrainingReportSelection(tx,{...prepared,ownerId:actor.userId,selection:input.selection})
    }
    await recheckMeasurementPublisherExpiry(tx,expiry)
    await tx.compositeAssessment.update({where:{id},data:{trainingReportSelectionDraft:input.selection??Prisma.DbNull}})
  })
}

/** Explicit draft-revision operation; does not publish or start a deployment. */
export async function publishMeasurementInstances(actor:Actor,id:string,raw:unknown) {
  return mutate(actor,id,revisionSchema.parse(raw).revision,async(tx,row)=>{
    await validateResources(tx,actor,row)
    const expiry=await prepareOwnedCognitiveMeasurements(tx,actor,row)
    await recheckMeasurementPublisherExpiry(tx,expiry)
  })
}

export async function publish(actor: Actor, id: string, raw: unknown) {
  const input=revisionSchema.extend({tracking:trainingTrackingSelectionSchema.optional()}).parse(raw)
  return mutate(actor, id, input.revision, async (tx, row) => {
    if (await tx.assessmentCompositionTemplate.findUnique({ where: { definitionId: id } })) throw compositeConflict('组合模板需要先复制为新草稿，再绑定课程或公开投放')
    if(row.trainingVariantDraft!=null)await validateTrainingVariants(tx,row)
    await validateDelivery(tx, actor, row)
    const situational = await validateResources(tx, actor, row)
    await lockCompositeAssetReferences(tx, row.items, row.formSections, situational)
    const measurementPublisherExpiry=await prepareOwnedCognitiveMeasurements(tx,actor,row)
    for (const section of row.formSections) {
      const definition = mapCompositeSection(section)
      const mediaOwner = publishedFormMediaOwner('COMPOSITE', id, compositeFormSectionDefinitionHash(definition))
      await retainFormSectionImages({ owner: mediaOwner, references: [...compositeFormSectionImageReferences(definition),...compositeFormSectionMaterialReferences(definition)], db: tx })
      await retainFormSectionVideos({ owner: mediaOwner, presentations: compositeFormSectionVideoPresentations(definition), db: tx })
    }
    if(row.trainingTimingPolicy){readTrainingTimingPolicy(row.trainingTimingPolicy);await tx.compositeAssessment.update({where:{id},data:{trainingTimingPolicy:await timingPolicy(tx,row,true)}})}
    await publishComposite(actor.userId, actor.role, id, tx, situational,input.tracking)
    await recheckMeasurementPublisherExpiry(tx,measurementPublisherExpiry)
  })
}
export async function archive(actor: Actor, id: string, raw: unknown) {
  return mutate(actor, id, revisionSchema.parse(raw).revision, async (tx, row) => {
    await tx.compositeAssessment.update({ where: { id }, data: { status: 'ARCHIVED', publicEnabled: false } })
    if (row.status !== 'ARCHIVED') await tx.assessmentManagementEvent.create({ data: { actorId: actor.userId, resourceId: id, action: 'ASSESSMENT_ARCHIVE', metadata: { name: row.name, previousStatus: row.status, revision: row.revision } } })
  }, false, row => row.status === 'ARCHIVED' && !row.publicEnabled)
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
export async function list(actor: Actor, page = 1, pageSize = 25, raw: unknown = {}) {
  author(actor)
  const extra = z.object({ status: z.enum(['DRAFT','PUBLISHED','ARCHIVED','DEPRECATED']).optional(), since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value,'创建日期无效').optional() }).parse(raw)
  const filters = parseCatalogFilters({ ...(raw as object), page, pageSize })
  if (filters.dateField !== 'created') throw compositeBadRequest('测评清单仅支持创建时间')
  const search = sqlLike(filters.search)
  // SQL is static; values remain positional parameters, never interpolated.
  const union = "SELECT id, name, tags, status::text, created_at AS created, creator_id AS owner_id, 'LEGACY' AS kind, type::text AS questionnaire_type FROM questionnaires UNION ALL SELECT c.id, c.name, c.tags, c.status::text, c.created_at AS created, c.created_by AS owner_id, CASE WHEN c.product_kind = 'QUESTIONNAIRE' THEN 'COLLECTION' ELSE 'LEGACY_COMPOSITE' END AS kind, c.questionnaire_type::text FROM composite_assessments c WHERE (c.product_kind = 'QUESTIONNAIRE' OR (c.product_kind = 'LEGACY_COMPOSITE' AND c.report_package_key IS NULL AND c.analysis_protocol_key IS NULL)) AND NOT EXISTS (SELECT 1 FROM assessment_composition_templates t WHERE t.definition_id = c.id)"
  const filter = '($1::boolean OR owner_id = $2) AND LOWER(name) LIKE $3 AND ($4::text IS NULL OR status = $4::text) AND ($5::timestamp IS NULL OR created >= $5::timestamp) AND ($8::timestamp IS NULL OR created < $8::timestamp) AND tags @> $9::text[]'
  const [rows, counts] = await prisma.$transaction([
    prisma.$queryRawUnsafe<any[]>('SELECT * FROM (' + union + ') q WHERE ' + filter + ' ORDER BY created DESC,id,kind LIMIT $6 OFFSET $7', actor.role === 'ADMIN', actor.userId, search, extra.status ?? null, filters.from ?? (extra.since ? extra.since + 'T00:00:00.000Z' : null), pageSize, (page - 1) * pageSize, filters.to ?? null, filters.tags),
    prisma.$queryRawUnsafe<Array<{ total: bigint }>>('SELECT COUNT(*) AS total FROM (' + union + ') q WHERE ' + filter.replace(/\$8/g,'$6').replace(/\$9/g,'$7'), actor.role === 'ADMIN', actor.userId, search, extra.status ?? null, filters.from ?? (extra.since ? extra.since + 'T00:00:00.000Z' : null), filters.to ?? null, filters.tags),
  ])
  return { list: rows.map(v => ({ ...v, reportMode: 'COLLECTION_ONLY', editHref: v.kind === 'COLLECTION' ? '/questionnaire-products/' + v.id : v.kind === 'LEGACY_COMPOSITE' ? '/composite-assessments/' + v.id : v.questionnaire_type === 'GENERAL' ? '/general-questionnaires/' + v.id + '/edit' : '/questionnaires/' + v.id })), total: Number(counts[0].total), page, pageSize }
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
  const [scales, cognitive, courseRows, situational,standardCombinations] = await Promise.all([
    listQuestionnaireScaleResources(actor),
    isCognitiveNewAdmissionEnabled() ? prisma.cognitiveAssignment.findMany({ where: { status: 'PUBLISHED', listedStandalone: true, config: { status: 'PUBLISHED' }, ...(actor.role === 'ADMIN' ? {} : { createdBy: actor.userId }) }, include: { config: true }, orderBy: { title: 'asc' } }) : Promise.resolve([]),
    prisma.course.findMany({ where: { isLibrary: false, ...(actor.role === 'ADMIN' ? {} : { creatorId: actor.userId }) }, select: { id: true, title: true, courseType: true } }),
    listSituationalResourceSummaries(actor.userId),
    actor.role==='TEACHER'?listTrainingStandardCombinationChoices(actor.userId):Promise.resolve([]),
  ])
  for (const row of cognitive.filter(v => isCognitiveProductEligible(v.config.testType))) assertCognitiveCatalogConfiguration(row.config)
  return {
    scales, cognitive: cognitive.filter(v => isCognitiveProductEligible(v.config.testType)).map(v => ({ id: v.id, name: v.title, profile: v.profile, testType: v.config.testType, configVersion: v.config.configVersion, engineVersion: v.config.engineVersion, scoringVersion: v.config.scoringVersion })),
    situational,
    standardCombinations,
    courses: courseRows,
  }
}

/** Copy definitions only; no attempts, responses, tokens or report ciphertext. */
export async function copy(actor: Actor, id: string, raw: unknown, options: { allowTrainingVariants?: boolean; allowTrainingFlow?: boolean;trackingNext?:boolean } = {}) {
  author(actor)
  if (process.env.QUESTIONNAIRE_PRODUCTS_ENABLED === 'false') throw compositeConflict('暂未开放新版问卷创建')
  const { requestId } = z.object({ requestId: z.string().guid() }).strict().parse(raw)
  const creationKey = actor.userId + ':' + requestId
  const creationHash = canonicalHash({ copySource: id,...(options.trackingNext?{trackingNext:true}:{}) })
  const run = () => prisma.$transaction(async tx => {
    const existing = await tx.compositeAssessment.findUnique({ where: { creationKey } })
    if (existing) {
      if (existing.creationHash !== creationHash) throw compositeConflict('创建请求已用于其他内容')
      if (options.allowTrainingVariants === false && (existing.trainingVariantDraft != null || existing.trainingVariantFrozen != null)) {
        throw compositeBadRequest('加权随机分组暂不支持无课程投放的私有模板，请复制为课程草稿')
      }
      if ((options.allowTrainingFlow ?? options.allowTrainingVariants) === false && hasTrainingFlowDefinition(existing)) {
        throw compositeBadRequest('跨工具流程暂不支持无课程投放的私有模板，请复制为课程草稿')
      }
      return existing.id
    }
    // Resolve storage server-side. A collision is rejected rather than guessed.
    const legacy = await tx.questionnaire.findUnique({ where: { id }, include: {
      questionnaireScales: true, formItems: true, formSections: true, courseQuestionnaires: true,
    } })
    let composite = await tx.compositeAssessment.findUnique({ where: { id }, include: { items: { include: { cognitiveAssignment: true } }, formSections: true, questionnaireCourses: true } })
    if ((!legacy && !composite) || (legacy && composite)) throw compositeNotFound('无法唯一识别来源问卷')
    owner(actor, { createdBy: legacy ? legacy.creatorId : composite!.createdBy })
    if (composite && (composite.trainingVariantDraft != null || composite.trainingVariantFrozen != null || hasTrainingFlowDefinition(composite))) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "composite_assessments" WHERE "id" = $1 FOR SHARE', id)
      composite = await tx.compositeAssessment.findUnique({ where: { id }, include: { items: { include: { cognitiveAssignment: true } }, formSections: true, questionnaireCourses: true } })
      if (!composite) throw compositeNotFound('来源问卷不存在')
      owner(actor, composite)
      if (composite.trainingVariantDraft != null || composite.trainingVariantFrozen != null) {
        if (options.allowTrainingVariants === false) throw compositeBadRequest('加权随机分组暂不支持无课程投放的私有模板，请复制为课程草稿')
        if (composite.trainingVariantDraft == null) throw compositeBadRequest('来源问卷缺少加权分组定义')
        await assertTrainingVariantAuthoringScope(tx, composite)
      }
      if (hasTrainingFlowDefinition(composite)) {
        if ((options.allowTrainingFlow ?? options.allowTrainingVariants) === false) throw compositeBadRequest('跨工具流程暂不支持无课程投放的私有模板，请复制为课程草稿')
        await validateTrainingFlow(tx, composite)
      }
    }
    const source = legacy ?? composite!
    let trackingOrdinal:number|undefined
    if(options.trackingNext){
      if(!composite||composite.status!=='PUBLISHED'||!composite.personalTrackingBaselineId||!readTrainingTracking(composite.personalTracking))throw compositeBadRequest('请从已发布的纵向测评创建下一轮')
      await tx.$queryRaw`SELECT id FROM composite_assessments WHERE id=${composite.personalTrackingBaselineId} FOR UPDATE`
      const last=await tx.compositeAssessment.findFirst({where:{personalTrackingBaselineId:composite.personalTrackingBaselineId},orderBy:{personalTrackingOrdinal:'desc'}})
      trackingOrdinal=(last?.personalTrackingOrdinal??0)+1
      if(trackingOrdinal>100)throw compositeBadRequest('纵向计划最多100轮')
    }
    if (composite && (composite.productKind === 'ASSESSMENT_BUNDLE' || composite.reportPackageKey || composite.analysisProtocolKey)) throw compositeBadRequest('固定报告包不能复制为问卷')
    const questionnaireType = legacy?.type ?? composite!.questionnaireType ?? 'COURSE'
    const sourceCourses = legacy ? legacy.courseQuestionnaires.map(v => v.courseId) : composite!.productKind === 'LEGACY_COMPOSITE' ? (composite!.courseId ? [composite!.courseId] : []) : composite!.questionnaireCourses.map(v => v.courseId)
    await courses(tx, actor, sourceCourses, questionnaireType)
    // Optional Form fields share the existing FINAL skip contract. Preserve
    // their required flag, options and section mapping without rewriting them.
    for (const item of composite?.items ?? []) {
      if (item.cognitiveAssignment) {
        const config = await tx.cognitiveTestConfig.findUnique({ where: { id: item.cognitiveAssignment.configId } })
        if (!config) throw compositeBadRequest('来源认知任务配置不存在')
        assertCognitiveProductEligible(config.testType)
      }
    }
    if (composite) await resolveCompositeSituationalItems(composite.items, tx, true, compositeSjtGrantScope({ productKind: 'QUESTIONNAIRE', questionnaireType, questionnaireCourses: sourceCourses.map(courseId => ({courseId})), createdBy: actor.userId }))
    const target = await tx.compositeAssessment.create({ data: {
      code: 'Q-' + randomUUID(), name: source.name + '（副本）', description: source.description, instruction: source.instruction,
      productKind: 'QUESTIONNAIRE', questionnaireType, createdBy: actor.userId, creationKey, creationHash,
      ...((composite?.trainingVariantDraft != null||(composite?.trainingFlowDraft as any)?.schemaVersion===2) ? { maxAttempts: composite!.maxAttempts } : {}),
      trainingTimingPolicy:await timingPolicy(tx,{productKind:'QUESTIONNAIRE',questionnaireType,questionnaireCourses:sourceCourses.map(courseId=>({courseId})),publicEnabled:false},Boolean(composite?.trainingTimingPolicy)),
      ...await validateTrainingPersistenceAuthoring(tx,{createdBy:actor.userId,productKind:'QUESTIONNAIRE',questionnaireType,questionnaireCourses:sourceCourses.map(courseId=>({courseId})),publicEnabled:false},composite?.trainingPersistencePolicy),
      ...await validateTrainingFeedbackAuthoring(tx,{createdBy:actor.userId,productKind:'QUESTIONNAIRE',questionnaireType,questionnaireCourses:sourceCourses.map(courseId=>({courseId})),publicEnabled:false},composite?.trainingFeedbackPolicy,true),
      questionnaireCourses: { create: sourceCourses.map(courseId => ({ courseId })) },
    } })
    const copiedIds = new Map<string, string>((composite?.items ?? []).map(item => [item.id, randomUUID()]))
    const copiedKeys = new Map<string, string>((composite?.items ?? []).filter(item => item.formDefinition != null).map(item => [(item.formDefinition as any).itemKey, 'q_' + copiedIds.get(item.id)]))
    const sectionIds = new Map<string, string>()
    const copiedSelectedReferences:SelectedReferenceAudit[]=[]
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
        if (item.formDefinition != null) typedCompositeFormQuestion({ ...item, placeholder: item.formPlaceholder ?? null } as any)
        const { id: _id, compositeAssessmentId: _parent, cognitiveAssignment, ...data } = item
        const fixedCognitivePin=cognitiveAssignment?readTrainingCognitiveTaskBinding(cognitiveAssignment.courseSnapshot):null
        const preciseCognitive=fixedCognitivePin?await loadPinnedTrainingCognitiveProfile(tx,fixedCognitivePin,{userId:actor.userId,configId:cognitiveAssignment!.configId},true):null
        if(preciseCognitive)assertCognitiveAssignmentFreeze(cognitiveAssignment!,preciseCognitive.artifact)
        if (cognitiveAssignment?.listedStandalone === false) {
          const binding = await tx.cognitiveAssignment.create({ data: {
            configId: cognitiveAssignment.configId, createdBy: actor.userId, title: cognitiveAssignment.title,
            instruction: cognitiveAssignment.instruction, status: cognitiveAssignment.status,
            listedStandalone: false, required: false, profile: cognitiveAssignment.profile,
            profileDefinitionVersion: cognitiveAssignment.profileDefinitionVersion,
            resolvedConfigSnapshotEncrypted: cognitiveAssignment.resolvedConfigSnapshotEncrypted,
            resolvedConfigHash: cognitiveAssignment.resolvedConfigHash,
            resolvedReportSnapshotEncrypted: cognitiveAssignment.resolvedReportSnapshotEncrypted,
            maxAttempts: cognitiveAssignment.maxAttempts,
            quotaSourceAssignmentId: cognitiveAssignment.createdBy === actor.userId ? cognitiveAssignment.quotaSourceAssignmentId ?? cognitiveAssignment.id : null,
            ...(preciseCognitive?{courseSnapshot:{selectedCognitiveProfile:fixedCognitivePin,selectedCognitiveConfigurationName:preciseCognitive.configurationName}}:{}),
          } })
          data.cognitiveAssignmentId = binding.id
        }
        const originalStandard=item.standardCombinationSource!=null?decodeTrainingStandardItemSource(item.standardCombinationSource,
          {compositeId:composite!.id,itemId:item.id,scaleId:item.scaleId!,ownerId:composite!.createdBy!}).reference:null
        const standard=originalStandard?await prepareTrainingStandardItemSource(tx,actor.userId,
          {...target,questionnaireCourses:sourceCourses.map(courseId=>({courseId}))},{id:copiedIds.get(item.id)!,scaleId:item.scaleId!},
          {...originalStandard.combination,...(originalStandard.selectedBinding?{selectedBinding:originalStandard.selectedBinding}:{})}):null
        await tx.compositeAssessmentItem.create({ data: { ...data, id:copiedIds.get(item.id), compositeAssessmentId: target.id,
          standardCombinationSource:standard?{reference:standard.reference,referenceHash:standard.referenceHash} as Prisma.InputJsonValue:Prisma.DbNull,
          formOptions: item.formOptions ?? Prisma.JsonNull,
          formDefinition: item.formDefinition != null ? remapTrainingFormDefinition(item.formDefinition,copiedKeys) : Prisma.DbNull,
          formPolicy: item.formPolicy ?? Prisma.DbNull,
          formSectionId: item.formSectionId ? sectionIds.get(item.formSectionId) : null,
        } })
        if(standard)copiedSelectedReferences.push(...trainingReferenceAudit({id:target.id,createdBy:actor.userId},{id:copiedIds.get(item.id)!,type:item.type,scaleId:item.scaleId,
          standardCombinationSource:{reference:standard.reference,referenceHash:standard.referenceHash}}))
      }
    }
    await ensureCompositeFormSections(target.id, tx)
    if(options.trackingNext)await tx.compositeAssessment.update({where:{id:target.id},data:{
      name:source.name+' · T'+trackingOrdinal,personalTrackingBaselineId:composite!.personalTrackingBaselineId,
      personalTrackingOrdinal:trackingOrdinal,personalTracking:copiedTrainingTracking(composite,copiedIds,copiedKeys),
    }})
    if (composite?.trainingVariantDraft != null) {
      const original = weightedVariantConfigSchema.parse(composite.trainingVariantDraft)
      const remapped = { ...original, groups: original.groups.map(group => ({ ...group,
        units: group.units.map(unit => {
          const mapped = (unit.type === 'FORM_SECTION' ? sectionIds : copiedIds).get(unit.id)
          if (!mapped) throw compositeBadRequest('来源分组引用了不存在的内容单元，请先修复原草稿')
          return { ...unit, id: mapped }
        }),
      })) }
      const copied = await tx.compositeAssessment.findUniqueOrThrow({ where: { id: target.id }, include: {
        questionnaireCourses: true, items: true, formSections: { include: { items: true } },
      } })
      await assertTrainingVariantAuthoringScope(tx, copied)
      // Recompile all remapped definition references; the new draft does not
      // inherit the source's immutable publication digest or allocation data.
      compileWeightedVariants(remapped, buildTrainingVariantUnion(copied))
      await tx.compositeAssessment.update({ where: { id: target.id }, data: {
        trainingVariantDraft: remapped as Prisma.InputJsonValue,
        trainingVariantFrozen: Prisma.DbNull, trainingVariantDigest: null,
      } })
    }
    if (composite?.trainingFlowDraft != null) {
      const remapped = remapTrainingFlowDraft(composite.trainingFlowDraft, sectionIds, copiedIds, copiedKeys)
      const copied = await tx.compositeAssessment.findUniqueOrThrow({ where: { id: target.id }, include: {
        questionnaireCourses: true, items: true, formSections: { include: { items: true } },
      } })
      await assertTrainingFlowAuthoringScope(tx, copied)
      compileTrainingFlowDefinition(remapped, copied)
      await tx.compositeAssessment.update({ where: { id: target.id }, data: {
        trainingFlowDraft: remapped as Prisma.InputJsonValue, trainingFlowFrozen: Prisma.DbNull, trainingFlowDigest: null,
      } })
    }
    const selectedSourceChanges=selectedReferenceChanges([],copiedSelectedReferences)
    if(selectedSourceChanges)await tx.assessmentManagementEvent.create({data:{actorId:actor.userId,resourceId:target.id,
      action:'TRAINING_DRAFT_SOURCE_BINDINGS_COPIED',metadata:{schemaVersion:1,ownerId:actor.userId,sourceCompositeId:id,
       sourceRevision:composite!.revision,revision:target.revision,...selectedSourceChanges}}})
    return target.id
  }, { timeout: 30000 })
  let target: string
  try { target = await run() } catch (e: any) { if (e.code !== 'P2002') throw e; target = await run() }
  return detail(actor, target)
}

/** Paged audience-projected reports, never raw response tables. */
export async function exportReports(actor: Actor, id: string, raw: unknown) {
  const definition = await detail(actor, id)
  const { after } = z.object({ after: z.string().guid().optional() }).strict().parse(raw)
  if (definition.trainingVariantDraft != null || definition.trainingVariantFrozen != null || definition.trainingVariantDigest != null) {
    const { getTrainingVariantReportsForTeacher } = await import('../composite/composite.service')
    const page = await getTrainingVariantReportsForTeacher(actor.userId, actor.role, id, after)
    return { schemaVersion: 'questionnaire-independent-reports-v1', reportMode: 'COLLECTION_ONLY', questionnaireId: id, ...page }
  }
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
