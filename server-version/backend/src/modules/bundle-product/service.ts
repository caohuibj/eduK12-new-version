import { assertPackageAdmission } from '../bundle-product/package-release'
import { createScaleProjectionContext } from '../scale/projection/context-factory'
import type { EffectiveScaleDisclosureSnapshot } from '../scale/projection/types'
import { Prisma, UserRole } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { canInstantiateConfig } from '../../services/materialGrant'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { encryptCognitivePayload, decryptCognitivePayload } from '../cognitive/cognitive.security'
import { assertValidItem, publishComposite } from '../composite/composite.service'
import { ensureCompositeFormSections } from '../composite/final-submit.service'
import { compositeBadRequest, compositeConflict, compositeForbidden, compositeNotFound } from '../composite/composite.errors'
import { freezeDataForWrite, freezeAssignmentProfile } from '../cognitive/profile-freeze'
import { requireCognitiveRegistryEntry } from '../cognitive/cognitive.registry'
import { BundleDefinitionProvider, freezeBundleProductionDefinition, readFrozenBundleProductionDefinition } from './definition-provider'
import { createCodeBundleDefinitionProvider } from './code-catalog'

export type BundleActor = { userId: string; role: UserRole }
export type BundleBindings = {
  schemaVersion: 1
  slots: Array<{ slotKey: string; itemId: string; unitType: string; scaleDisclosure?: EffectiveScaleDisclosureSnapshot }>
  context: Array<{ contextKey: string; itemId: string; valueType: string }>
}
export const author = (actor: BundleActor) => {
  if (!['ADMIN', 'TEACHER'].includes(actor.role)) throw compositeForbidden()
}
export const owner = (actor: BundleActor, row: { createdBy: string | null }) => {
  author(actor)
  if (actor.role !== 'ADMIN' && row.createdBy !== actor.userId) throw compositeForbidden()
}
export function readInstance(row: { definitionEncrypted: string; definitionHash: string; bindingsEncrypted: string; bindingsHash: string }) {
  const frozen = readFrozenBundleProductionDefinition(decryptCognitivePayload(row.definitionEncrypted))
  const bindings = decryptCognitivePayload<BundleBindings>(row.bindingsEncrypted)
  if (frozen.contentHash !== row.definitionHash || canonicalHash(bindings) !== row.bindingsHash || bindings.schemaVersion !== 1) {
    throw compositeConflict('Bundle 冻结定义或绑定校验失败')
  }
  return { frozen, bindings }
}
const createSchema = z.object({
  requestId: z.string().uuid(), bundleKey: z.string().min(1), bundleVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: z.string().trim().min(1).max(200), courseId: z.string().min(1).nullable(),
  publicEnabled: z.boolean().default(false), expiresAt: z.string().datetime().nullable().default(null),
  bindings: z.array(z.object({ slotKey: z.string().min(1), resourceId: z.string().min(1).optional() }).strict()).max(100),
}).strict()

export function createBundleProductService(provider: BundleDefinitionProvider) {
  async function eligible(actor: BundleActor, key: string, version: string, db: Prisma.TransactionClient = prisma) {
    author(actor)
    const entry = provider.exact(key, version)
    if (!entry) throw compositeNotFound('Bundle 精确版本不存在')
    if (entry.declarativePackage) {
      try { await assertPackageAdmission(db, entry.declarativePackage) } catch { throw compositeConflict('Bundle 内容尚未发布、已停用或审批失效') }
    }
    const blockers = provider.publicationBlockers(key, version).filter(v => !(entry.declarativePackage && v === 'BUNDLE_NOT_PUBLISHED'))
    if (blockers.length) throw compositeConflict(blockers.join(', '))
    if (actor.role !== 'ADMIN' && !await db.materialGrant.findUnique({ where: {
      teacherId_resourceType_resourceId: { teacherId: actor.userId, resourceType: 'ASSESSMENT_BUNDLE', resourceId: key + '@' + version },
    } })) throw compositeForbidden('缺少此精确版本 Bundle 的使用授权')
    return entry.declarativePackage ? { ...entry, definition: { ...entry.definition, status: 'PUBLISHED' as const } } : entry
  }
  async function detail(actor: BundleActor, id: string) {
    const row = await prisma.compositeAssessment.findUnique({ where: { id }, include: { bundleInstance: true,
      items: { orderBy: { position: 'asc' } }, attempts: { select: { id: true, status: true, completedAt: true }, orderBy: { startedAt: 'desc' }, take: 100 } } })
    if (!row || row.productKind !== 'ASSESSMENT_BUNDLE' || !row.bundleInstance) throw compositeNotFound()
    owner(actor, row)
    const { frozen } = readInstance(row.bundleInstance)
    return { id, name: row.name, status: row.status, revision: row.revision, courseId: row.courseId, publicEnabled: row.publicEnabled,
      bundle: frozen.bundleSnapshot.bundleDefinition, definitionHash: frozen.contentHash, items: row.items, attempts: row.attempts }
  }
  async function create(actor: BundleActor, raw: unknown) {
    author(actor)
    if (process.env.BUNDLE_PRODUCTS_ENABLED !== 'true') throw compositeConflict('尚未开放 Bundle 新建')
    const input = createSchema.parse(raw)
    if (!input.courseId && !input.publicEnabled) throw compositeBadRequest('请选择课程或公开投放')
    if (input.publicEnabled && (!input.expiresAt || Date.parse(input.expiresAt) <= Date.now())) throw compositeBadRequest('公开投放需要未来的有效期')
    const key = 'bundle:' + actor.userId + ':' + input.requestId, hash = canonicalHash(input)
    const run = () => prisma.$transaction(async tx => {
      const existing = await tx.compositeAssessment.findUnique({ where: { creationKey: key } })
      if (existing) {
        if (existing.creationHash !== hash) throw compositeConflict('同一请求不能更改内容')
        return existing.id
      }
      const entry = await eligible(actor, input.bundleKey, input.bundleVersion, tx)
      const definition = entry.definition
      if (input.publicEnabled && !definition.initiationModes.includes('ANONYMOUS_SELF')) throw compositeForbidden('此包不支持匿名投放')
      if (input.courseId && !definition.initiationModes.includes('TEACHER_ASSIGNMENT')) throw compositeForbidden('此包不支持课程投放')
      if (input.courseId) {
        const course = await tx.course.findUnique({ where: { id: input.courseId } })
        if (!course || course.isLibrary || (actor.role !== 'ADMIN' && course.creatorId !== actor.userId)) throw compositeForbidden('课程不可用')
      }
      const measurementSlots = definition.slots.filter(slot => slot.unitType !== 'FORM')
      // FORM slots are represented by declared Context fields; arbitrary freeform append is disallowed.
      if (definition.slots.some(slot => slot.unitType === 'FORM') && !entry.contextDefinition) throw compositeBadRequest('FORM slot 缺少声明的上下文定义')
      if (input.bindings.length !== measurementSlots.length || new Set(input.bindings.map(v => v.slotKey)).size !== measurementSlots.length ||
          input.bindings.some(v => !measurementSlots.some(slot => slot.slotKey === v.slotKey))) throw compositeBadRequest('必须精确绑定全部测评槽位')
      const frozen = freezeBundleProductionDefinition(entry, { frozenAt: new Date().toISOString(), sourceReference: 'code-catalog' })
      const row = await tx.compositeAssessment.create({ data: { code: 'B-' + randomUUID(), productKind: 'ASSESSMENT_BUNDLE',
        name: input.name, courseId: input.courseId, publicEnabled: input.publicEnabled, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: actor.userId, creationKey: key, creationHash: hash } })
      const bindings: BundleBindings = { schemaVersion: 1, slots: [], context: [] }
      let position = 0
      for (const field of entry.contextDefinition?.fields ?? []) {
        const boolean = field.valueType === 'boolean'
        const choices = boolean ? ['true', 'false'] : field.enumValues
        const item = await tx.compositeAssessmentItem.create({ data: {
          compositeAssessmentId: row.id, type: 'FORM', required: field.required, position: position++,
          formType: choices ? 'single_choice' : 'text_input', formLabel: field.contextKey === 'subject_age_years' ? '年龄（周岁）' : field.contextKey,
          formOptions: choices ? choices.map(value => ({ label: value, value })) : Prisma.JsonNull,
        } })
        bindings.context.push({ contextKey: field.contextKey, valueType: field.valueType, itemId: item.id })
      }
      await ensureCompositeFormSections(row.id, tx)
      for (const slot of [...measurementSlots].sort((a,b) => a.position-b.position)) {
        if (!slot.required) throw compositeBadRequest('当前 Bundle 投放仅支持必填测评槽位')
        const binding = input.bindings.find(v => v.slotKey === slot.slotKey)!
        let scaleDisclosure: EffectiveScaleDisclosureSnapshot | undefined
        const data: any = { compositeAssessmentId: row.id, type: slot.unitType, required: true, position: position++ }
        if (slot.unitType === 'SCALE') {
          const scale = await tx.scale.findUnique({ where: { id: binding.resourceId ?? '' } })
          if (!scale || scale.code !== slot.instrumentKey || scale.instrumentVersion !== slot.instrumentVersion) throw compositeBadRequest('量表精确版本不匹配')
          await assertValidItem({ type: 'SCALE', required: true, scaleId: scale.id }, actor.userId, actor.role, row, tx)
          scaleDisclosure = createScaleProjectionContext({instrumentKey:scale.code,instrumentVersion:scale.instrumentVersion,instrumentClass:scale.instrumentClass,audience:'subject',purpose:'report'}).frozenPolicy
          data.scaleId = scale.id
        } else if (slot.unitType === 'COGNITIVE') {
          const source = await tx.cognitiveAssignment.findUnique({ where: { id: binding.resourceId ?? '' }, include: { config: true } })
          if (!source || source.config.testType !== slot.instrumentKey || source.config.configVersion !== slot.instrumentVersion) throw compositeBadRequest('认知任务精确版本不匹配')
          await assertValidItem({ type: 'COGNITIVE', required: true, cognitiveAssignmentId: source.id }, actor.userId, actor.role,
            { courseId: input.courseId, productKind: 'QUESTIONNAIRE' }, tx)
          if (!await canInstantiateConfig(actor.userId, actor.role, source.config)) throw compositeForbidden('缺少认知配置使用授权')
          const engine = requireCognitiveRegistryEntry(source.config.testType, source.config.engineVersion, source.config.scoringVersion)
          const dependency = entry.declarativePackage?.manifest.cognitiveDependencies.find(d => d.slotKey === slot.slotKey)
          if (dependency && (source.config.engineVersion !== dependency.engineVersion || source.config.scoringVersion !== dependency.scoringVersion || source.profile !== dependency.profile)) throw compositeBadRequest('认知任务精确引擎/评分/profile 不匹配')
          const freeze = source.resolvedConfigSnapshotEncrypted && source.resolvedReportSnapshotEncrypted ? {
            profile: source.profile, profileDefinitionVersion: source.profileDefinitionVersion, resolvedConfigSnapshotEncrypted: source.resolvedConfigSnapshotEncrypted,
            resolvedConfigHash: source.resolvedConfigHash, resolvedReportSnapshotEncrypted: source.resolvedReportSnapshotEncrypted,
          } : freezeDataForWrite(freezeAssignmentProfile({ entry: engine, profile: 'standard', baseConfig: engine.configSchema.parse(source.config.config) }))
          data.cognitiveAssignmentId = (await tx.cognitiveAssignment.create({ data: {
            configId: source.configId, createdBy: actor.userId, courseId: input.courseId, title: source.title, status: 'PUBLISHED',
            publishedAt: new Date(), listedStandalone: false, required: false, ...freeze,
          } })).id
        } else {
          await assertValidItem({ type: 'SITUATIONAL', required: true, situationalInstrumentKey: slot.instrumentKey, situationalInstrumentVersion: slot.instrumentVersion }, actor.userId, actor.role, row, tx)
          data.situationalInstrumentKey = slot.instrumentKey; data.situationalInstrumentVersion = slot.instrumentVersion
        }
        const item = await tx.compositeAssessmentItem.create({ data })
        bindings.slots.push({ slotKey: slot.slotKey, itemId: item.id, unitType: slot.unitType, ...(scaleDisclosure ? {scaleDisclosure} : {}) })
      }
      await tx.bundleInstance.create({ data: { compositeId: row.id, bundleKey: definition.bundleKey, bundleVersion: definition.bundleVersion,
        definitionHash: frozen.contentHash, definitionEncrypted: encryptCognitivePayload(frozen),
        bindingsHash: canonicalHash(bindings), bindingsEncrypted: encryptCognitivePayload(bindings) } })
      return row.id
    }, { timeout: 30000 })
    let id: string
    try { id = await run() } catch (error: any) { if (error.code !== 'P2002') throw error; id = await run() }
    return detail(actor, id)
  }
  async function publish(actor: BundleActor, id: string, revision: number) {
    if (process.env.BUNDLE_PRODUCTS_ENABLED !== 'true') throw compositeConflict('尚未开放 Bundle 发布')
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM composite_assessments WHERE id = ${id} FOR UPDATE`
      const row = await tx.compositeAssessment.findUnique({ where: { id }, include: { bundleInstance: true } })
      if (!row || !row.bundleInstance || row.productKind !== 'ASSESSMENT_BUNDLE') throw compositeNotFound()
      owner(actor, row)
      if (row.revision !== revision) throw compositeConflict('版本已变化，请刷新')
      if (row.status !== 'DRAFT') throw compositeConflict('只能发布 Bundle 草稿')
      if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) throw compositeConflict('投放时间已过期')
      const entry = await eligible(actor, row.bundleInstance.bundleKey, row.bundleInstance.bundleVersion, tx)
      const { frozen } = readInstance(row.bundleInstance)
      const current = freezeBundleProductionDefinition(entry, { frozenAt: frozen.frozenAt, sourceReference: frozen.source.reference })
      if (current.contentHash !== frozen.contentHash) throw compositeConflict('同版本定义已变化，请重新创建')
      const items = await tx.compositeAssessmentItem.findMany({ where: { compositeAssessmentId: id }, include: { cognitiveAssignment: { include: { config: true } } } })
      for (const item of items) {
        if (item.type === 'SCALE') await assertValidItem({ type: 'SCALE', required: true, scaleId: item.scaleId! }, actor.userId, actor.role, row, tx)
        if (item.type === 'COGNITIVE' && (!item.cognitiveAssignment || !await canInstantiateConfig(actor.userId, actor.role, item.cognitiveAssignment.config))) throw compositeForbidden('认知配置授权已失效')
      }
      await publishComposite(actor.userId, actor.role, id, tx)
      await tx.compositeAssessment.update({ where: { id }, data: { revision: { increment: 1 } } })
    }, { timeout: 30000 })
    return detail(actor, id)
  }
  async function archive(actor: BundleActor, id: string, revision: number) {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM composite_assessments WHERE id = ${id} FOR UPDATE`
      const row = await tx.compositeAssessment.findUnique({where:{id}})
      if (!row || row.productKind !== 'ASSESSMENT_BUNDLE') throw compositeNotFound()
      owner(actor,row)
      if (row.revision !== revision) throw compositeConflict('版本已变化，请刷新')
      await tx.compositeAssessment.update({where:{id},data:{status:'ARCHIVED',publicEnabled:false,revision:{increment:1}}})
    })
    return detail(actor,id)
  }
  async function catalog(actor: BundleActor) {
    author(actor)
    return Promise.all(provider.list().map(async entry => {
      const definition = entry.definition
      let allowed = true
      let publicationBlockers: string[] = []
      try { await eligible(actor, definition.bundleKey, definition.bundleVersion) } catch (error: any) { allowed = false; publicationBlockers = [error.message] }
      return { ...definition, ...(allowed && entry.declarativePackage ? { status: 'PUBLISHED' } : {}), canInstantiate: allowed && process.env.BUNDLE_PRODUCTS_ENABLED === 'true',
        publicationBlockers }
    }))
  }
  async function list(actor: BundleActor) {
    author(actor)
    return prisma.compositeAssessment.findMany({ where: { productKind: 'ASSESSMENT_BUNDLE', ...(actor.role === 'ADMIN' ? {} : { createdBy: actor.userId }) },
      select: { id: true, name: true, status: true, revision: true, bundleInstance: { select: { bundleKey: true, bundleVersion: true } } },
      orderBy: { createdAt: 'desc' }, take: 100 })
  }
  return { eligible, detail, create, publish, archive, catalog, list }
}
export const bundleDefinitionProvider = createCodeBundleDefinitionProvider()
export const bundleProductService = createBundleProductService(bundleDefinitionProvider)
