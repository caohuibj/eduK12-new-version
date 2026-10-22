import { Prisma, UserRole } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { config } from '../../config'
import { compositeBadRequest, compositeConflict, compositeForbidden, compositeNotFound } from '../composite/composite.errors'
import { remapTrainingFormDefinition } from '../assessment-runtime/form-policy'
import { typedCompositeFormQuestion } from '../assessment-runtime/typed-form'
import { mediaGrantFilter, mediaLibraryFilter } from '../../services/workspaceMedia'

export type FormSource = { id: string; kind: 'COMPOSITE' | 'LEGACY'; revision?: number }
type Actor = { userId: string; role: UserRole }
type Tx = Prisma.TransactionClient

/** Resolve authority and storage on the server. A form grant never imports scales. */
export async function readFormSource(tx: Tx, actor: Actor, source: FormSource) {
  if (source.kind === 'LEGACY') {
    await tx.$queryRaw`SELECT id FROM questionnaires WHERE id=${source.id} FOR SHARE`
    const row = await tx.questionnaire.findUnique({ where: { id: source.id }, include: { creator: true, questionnaireScales: true, formItems: true, formSections: true } })
    if (!row || row.type !== 'GENERAL' || row.questionnaireScales.length || !['LEGACY', 'TRAINING'].includes(row.creator.accountDomain)) throw compositeNotFound('可复用表单不存在')
    if (row.creatorId !== actor.userId && actor.role !== 'ADMIN') {
      // New template use must not race revocation; hold the exact grant until
      // the same transaction has committed the independent content copy.
      const grants = config.materialGrantsEnabled && row.status === 'PUBLISHED'
        ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM material_grants
            WHERE teacher_id=${actor.userId} AND resource_type::text='FORM_TEMPLATE' AND resource_id=${row.id}
            FOR SHARE`
        : []
      if (!grants.length) throw compositeForbidden('当前没有此表单的使用授权')
      // A form-content grant does not grant the author's private attachments.
      const assets = new Set<string>()
      const visit = (value: any) => {
        if (!value || typeof value !== 'object') return
        if (typeof value.assetId === 'string') assets.add(value.assetId)
        for (const child of Object.values(value)) visit(child)
      }
      row.formItems.forEach(item => visit(item.options))
      if (assets.size) {
        const permitted = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT a.id FROM stored_assets a JOIN users u ON u.id=a.owner_id
          WHERE a.id IN (${Prisma.join([...assets])}) AND ${mediaLibraryFilter} AND (a.owner_id=${actor.userId} OR (${mediaGrantFilter(actor.userId)}))`)
        if (permitted.length !== assets.size) throw compositeForbidden('此表单包含尚未单独授权的媒体，请先取得对应媒体授权')
      }
    }
    return { name: row.name, description: row.description, instruction: row.instruction, sections: row.formSections, items: row.formItems.map(item => ({
      id: item.id, type: 'FORM', position: item.position, required: item.required,
      formType: item.type, formLabel: item.label, formPlaceholder: item.placeholder,
      formOptions: item.options, formDefinition: null, formPolicy: null,
      contextKey: item.contextKey, formSectionId: item.sectionId, formSectionPosition: item.sectionPosition,
    })) }
  }
  await tx.$queryRaw`SELECT id FROM composite_assessments WHERE id=${source.id} FOR SHARE`
  const row = await tx.compositeAssessment.findUnique({ where: { id: source.id }, include: { items: true, formSections: true } })
  if (!row || !['FORM_TEMPLATE', 'QUESTIONNAIRE'].includes(row.productKind) || row.status === 'ARCHIVED') throw compositeNotFound('可复用表单不存在')
  if (row.createdBy !== actor.userId && actor.role !== 'ADMIN') throw compositeForbidden('只能复用本人编制的表单')
  if (source.revision !== undefined && source.revision !== row.revision) throw compositeConflict('来源表单已更新，请重新选择')
  if (row.items.some(item => item.type !== 'FORM') || row.reportPackageKey || row.analysisProtocolKey || row.trainingVariantDraft || row.trainingVariantFrozen || row.trainingFlowDraft || row.trainingFlowFrozen) throw compositeBadRequest('只能整份复用纯表单内容，请在组合测评中分别选择其他工具')
  return { name: row.name, description: row.description, instruction: row.instruction, sections: row.formSections, items: row.items }
}

/** Allowlist definition fields only. No deliveries, answers, grants or tokens. */
export async function appendFormContent(tx: Tx, target: any, source: Awaited<ReturnType<typeof readFormSource>>, includeInstruction = true) {
  if (!source.items.length) throw compositeBadRequest('来源表单还没有题目')
  if (target.items.length + source.items.length > 500) throw compositeBadRequest('加入后将超过 500 道题目上限')
  if (source.items.some(item => item.contextKey) && target.items.length) throw compositeBadRequest('含人口学上下文的表单需要最先加入，请先调整当前内容')
  const ids = new Map(source.items.map(item => [item.id, randomUUID()]))
  const keys = new Map(source.items.filter(item => item.formDefinition != null).map(item => [(item.formDefinition as any).itemKey, 'q_' + ids.get(item.id)]))
  const sections = new Map<string, string>()
  let position = Math.max(-1, ...target.items.map((item: any) => item.position), ...target.formSections.map((section: any) => section.position)) + 1
  const ordered = [...source.sections].sort((a, b) => a.position - b.position)
  const orphanContext = source.items.filter(item => !item.formSectionId && item.contextKey)
  const orphanOrdinary = source.items.filter(item => !item.formSectionId && !item.contextKey)
  const contextFallback = randomUUID(), ordinaryFallback = randomUUID()
  if (orphanContext.length) ordered.unshift({ id: contextFallback, title: '背景信息', description: null, position: -1, contextSection: true } as any)
  if (orphanOrdinary.length) ordered.push({ id: ordinaryFallback, title: source.name, description: null, position: Number.MAX_SAFE_INTEGER, contextSection: false } as any)
  for (const section of ordered) {
    const created = await tx.compositeFormSection.create({ data: {
      compositeAssessmentId: target.id, title: section.title === '表单' ? source.name : section.title, description: section === ordered[0] && includeInstruction ? [source.instruction, section.description].filter(Boolean).join('\n\n') || null : section.description,
      contextSection: section.contextSection, position: position++,
    } })
    sections.set(section.id, created.id)
  }
  for (const item of [...source.items].sort((a, b) => a.position - b.position)) {
    if (item.formSectionId && !sections.has(item.formSectionId)) throw compositeBadRequest('来源表单区段缺失，请先修复来源')
    if (item.formDefinition != null) typedCompositeFormQuestion({ ...item, placeholder: item.formPlaceholder ?? null } as any)
    await tx.compositeAssessmentItem.create({ data: {
      id: ids.get(item.id), compositeAssessmentId: target.id, type: 'FORM', position: position++, required: item.required,
      formType: item.formType, formLabel: item.formLabel, formPlaceholder: item.formPlaceholder,
      formOptions: item.formOptions ?? Prisma.JsonNull,
      formDefinition: item.formDefinition == null ? Prisma.DbNull : remapTrainingFormDefinition(item.formDefinition, keys),
      formPolicy: item.formPolicy ?? Prisma.DbNull, contextKey: item.contextKey,
      formSectionId: sections.get(item.formSectionId || (item.contextKey ? contextFallback : ordinaryFallback)),
      formSectionPosition: item.formSectionPosition,
    } })
  }
}
