import { Prisma } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../../config/database'
import {
  validateQuestionnaireFormAnswer,
  normalizeQuestionnaireFormAnswer,
} from '../../services/questionnaireFormAnswerValidation'
import { writeContextFormAnswer } from '../assessment-context'
import { freezeCompositeAttemptContext } from '../../services/assessmentContextService'
import {
  assertAttemptEpoch,
  assertCanonicalSubmissionPayloadSize,
  assertDefinitionHash,
  assertFinalOnly,
  assertFinalSubmitStatus,
  assertSubmissionReplay,
  FINAL_SUBMISSION_MAX_BYTES,
  InstrumentFinalSubmitError,
  prepareCanonicalSubmission,
  validateSubmissionId,
} from '../../services/instrumentFinalSubmit'
import { withUnitSubmitAdmission } from '../../services/unitSubmitAdmission'
import { measureRequestPhase, measureRequestPhaseSync } from '../../services/runtimeObservability'
import {
  refreshCompositeFinalOnlyProgress,
  withFinalOnlyCompletionTransaction,
} from '../../services/questionnaireProgressService'

import {
  compositeFormSectionDefinitionHash,
  mapCompositeSection,
  orderedCompositeFormSectionItems,
  type CompositeSection,
  type CompositeSectionItem,
} from '../assessment-runtime/form-section-definition'

export {
  compositeFormSectionDefinitionHash,
  mapCompositeSection,
  type CompositeSection,
  type CompositeSectionItem,
}

export type SectionSubmitInput = {
  attemptId: string
  sectionId: string
  submissionId: string
  attemptEpoch: number
  definitionHash: string
  contextSnapshotHash?: string | null
  answers: Array<{ formItemId: string; value: string | string[] | null }>
  userId?: string | null
  recoveryTokenHash?: string
}

const orderedItems = orderedCompositeFormSectionItems

const contentTypesForComposite = (items: any[]) => [...items]
  .sort((left, right) => left.position - right.position)
  .map((item) => ({ type: item.type, position: item.position, item }))

const finalCompositeUnits = (assessment: any) => [
  ...(assessment.items ?? [])
    .filter((item: any) => item.type !== 'FORM')
    .map((item: any) => ({ id: item.id, type: item.type, position: item.position })),
  ...(assessment.formSections ?? [])
    .map((section: any) => ({ id: section.id, type: 'FORM_SECTION', position: section.position })),
].sort((left, right) => left.position - right.position)

const isFirstCompositeContentSection = (assessment: any, sectionId: string): boolean => {
  const firstUnit = finalCompositeUnits(assessment)[0]
  return firstUnit?.type === 'FORM_SECTION' && firstUnit.id === sectionId
}

const compositeHasContextSection = (assessment: any): boolean => Boolean(
  assessment?.formSections?.some((section: any) => (
    Boolean(section.contextSection) || section.items?.some((item: any) => Boolean(item.contextKey))
  )),
)

/** Assign unassigned FORM modules to contiguous sections after migration. */
export const ensureCompositeFormSections = async (compositeId: string): Promise<CompositeSection[]> => {
  // A few service-level tests use a deliberately small Prisma mock from the
  // pre-section schema.  Keep the new read projection additive for those
  // callers; the generated production client always has this delegate.
  const formSectionDelegate = (prisma as any).compositeFormSection
  if (!formSectionDelegate) return []

  const current = await prisma.compositeAssessment.findUnique({
    where: { id: compositeId },
    select: {
      items: { orderBy: { position: 'asc' }, select: { id: true, type: true, position: true, formSectionId: true, contextKey: true } },
      formSections: { select: { id: true, position: true } },
    },
  })
  if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评不存在', 404)
  if (current.items.some((item) => item.type === 'FORM' && !item.formSectionId)) {
    await prisma.$transaction(async (tx) => {
      const latest = await tx.compositeAssessment.findUnique({
        where: { id: compositeId },
        select: {
          items: { orderBy: { position: 'asc' }, select: { id: true, type: true, position: true, formSectionId: true, contextKey: true } },
          formSections: { select: { id: true, position: true } },
        },
      })
      if (!latest) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评不存在', 404)
      const missing = latest.items.filter((item) => item.type === 'FORM' && !item.formSectionId)
      const missingIds = new Set(missing.map((item) => item.id))
      const runs: typeof missing[] = []
      let run: typeof missing = []
      for (const content of contentTypesForComposite(latest.items)) {
        if (content.type === 'FORM' && missingIds.has(content.item.id)) run.push(content.item)
        else if (content.type !== 'FORM' && run.length > 0) {
          runs.push(run)
          run = []
        }
      }
      if (run.length > 0) runs.push(run)
      const formSections = latest.formSections ?? []
      const occupied = new Set(formSections.map((section) => section.position))
      const maximum = Math.max(-1, ...latest.items.map((item) => item.position), ...formSections.map((section) => section.position))
      for (const [runIndex, items] of runs.entries()) {
        let position = items[0].position
        if (occupied.has(position)) position = maximum + runIndex + 1
        occupied.add(position)
        const section = await tx.compositeFormSection.create({
          data: {
            compositeAssessmentId: compositeId,
            title: '表单',
            position,
            contextSection: items.some((item) => Boolean(item.contextKey)),
          },
        })
        for (const [sectionPosition, item] of items.entries()) {
          await tx.compositeAssessmentItem.update({
            where: { id: item.id },
            data: { formSectionId: section.id, formSectionPosition: sectionPosition },
          })
        }
      }
    })
  }
  const sections = await prisma.compositeFormSection.findMany({
    where: { compositeAssessmentId: compositeId },
    orderBy: { position: 'asc' },
    include: { items: { orderBy: [{ formSectionPosition: 'asc' }, { position: 'asc' }] } },
  })
  return sections.map(mapCompositeSection)
}

export const listCompositeFormSections = async (compositeId: string) => {
  const sections = await ensureCompositeFormSections(compositeId)
  return sections.map((section) => ({ ...section, definitionHash: compositeFormSectionDefinitionHash(section) }))
}

export const listCompositeFormItems = async (compositeId: string) => prisma.compositeAssessmentItem.findMany({
  where: { compositeAssessmentId: compositeId, type: 'FORM' },
  orderBy: { position: 'asc' },
  select: {
    id: true,
    position: true,
    formSectionId: true,
    formSectionPosition: true,
    formType: true,
    formLabel: true,
    formPlaceholder: true,
    formOptions: true,
    required: true,
    contextKey: true,
  },
})

export const createCompositeFormSection = async (
  compositeId: string,
  input: { title?: string; description?: string; position?: number; contextSection?: boolean },
) => {
  await ensureCompositeFormSections(compositeId)
  const current = await prisma.compositeAssessment.findUnique({
    where: { id: compositeId },
    select: {
      items: { select: { position: true } },
      formSections: { select: { position: true } },
    },
  })
  if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评不存在', 404)
  const defaultPosition = Math.max(
    -1,
    ...current.items.map((item) => item.position),
    ...current.formSections.map((section) => section.position),
  ) + 1
  const section = await prisma.compositeFormSection.create({
    data: {
      compositeAssessmentId: compositeId,
      title: input.title?.trim() || '表单',
      description: input.description?.trim() || null,
      position: input.position ?? defaultPosition,
      contextSection: input.contextSection ?? false,
    },
    include: { items: true },
  })
  const mapped = mapCompositeSection(section)
  return { ...mapped, definitionHash: compositeFormSectionDefinitionHash(mapped) }
}

export const updateCompositeFormSection = async (
  compositeId: string,
  sectionId: string,
  input: { title?: string; description?: string | null; contextSection?: boolean },
) => {
  const current = await prisma.compositeFormSection.findFirst({ where: { id: sectionId, compositeAssessmentId: compositeId }, include: { items: true } })
  if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段不存在', 404)
  if (input.contextSection && !current.items.some((item) => item.contextKey)) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '没有人口学字段的区段不能作为上下文区段', 400)
  }
  if (input.contextSection) {
    const assessment = await prisma.compositeAssessment.findUnique({
      where: { id: compositeId },
      select: {
        items: { select: { id: true, type: true, position: true } },
        formSections: { select: { id: true, position: true } },
      },
    })
    if (!assessment || !isFirstCompositeContentSection(assessment, sectionId)) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '人口学上下文区段必须是第一个内容区段', 400)
    }
  }
  const updated = await prisma.compositeFormSection.update({
    where: { id: sectionId },
    data: {
      ...(input.title === undefined ? {} : { title: input.title.trim() || '表单' }),
      ...(input.description === undefined ? {} : { description: input.description?.trim() || null }),
      ...(input.contextSection === undefined ? {} : { contextSection: input.contextSection }),
    },
    include: { items: true },
  })
  const mapped = mapCompositeSection(updated)
  return { ...mapped, definitionHash: compositeFormSectionDefinitionHash(mapped) }
}

export const reorderCompositeFormSections = async (compositeId: string, sectionIds: string[]) => {
  const sections = await prisma.compositeFormSection.findMany({ where: { compositeAssessmentId: compositeId }, select: { id: true } })
  if (new Set(sectionIds).size !== sectionIds.length || sections.length !== sectionIds.length || sections.some((section) => !sectionIds.includes(section.id))) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '区段排序列表不一致', 400)
  }
  await prisma.$transaction(async (tx) => {
    const offset = sections.length + 1000
    for (const [index, id] of sectionIds.entries()) await tx.compositeFormSection.update({ where: { id }, data: { position: offset + index } })
    for (const [index, id] of sectionIds.entries()) await tx.compositeFormSection.update({ where: { id }, data: { position: index } })
  })
  return listCompositeFormSections(compositeId)
}

export const reorderCompositeFormSectionItems = async (compositeId: string, sectionId: string, itemIds: string[]) => {
  const section = await prisma.compositeFormSection.findFirst({ where: { id: sectionId, compositeAssessmentId: compositeId }, include: { items: { select: { id: true } } } })
  if (!section || new Set(itemIds).size !== itemIds.length || section.items.length !== itemIds.length || section.items.some((item) => !itemIds.includes(item.id))) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '区段字段排序列表不一致', 400)
  }
  await prisma.$transaction(async (tx) => {
    for (const [index, id] of itemIds.entries()) await tx.compositeAssessmentItem.update({ where: { id }, data: { formSectionPosition: 1000 + index } })
    for (const [index, id] of itemIds.entries()) await tx.compositeAssessmentItem.update({ where: { id }, data: { formSectionPosition: index } })
  })
  return listCompositeFormSections(compositeId)
}

export const assignCompositeFormItemToSection = async (compositeId: string, sectionId: string, itemId: string, position?: number) => {
  const [section, item] = await Promise.all([
    prisma.compositeFormSection.findFirst({ where: { id: sectionId, compositeAssessmentId: compositeId } }),
    prisma.compositeAssessmentItem.findFirst({ where: { id: itemId, compositeAssessmentId: compositeId, type: 'FORM' }, select: { id: true, formSectionId: true, contextKey: true } }),
  ])
  if (!section || !item) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '区段或字段不存在', 404)
  const assessment = await prisma.compositeAssessment.findUnique({
    where: { id: compositeId },
    select: {
      items: { select: { id: true, type: true, position: true } },
      formSections: { select: { id: true, position: true } },
    },
  })
  if ((section.contextSection || item.contextKey) && (!assessment || !isFirstCompositeContentSection(assessment, sectionId))) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '人口学上下文区段必须是第一个内容区段', 400)
  }
  const nextPosition = position ?? await prisma.compositeAssessmentItem.count({ where: { formSectionId: sectionId } })
  await prisma.$transaction(async (tx) => {
    await tx.compositeAssessmentItem.update({
      where: { id: itemId },
      data: { formSectionId: sectionId, formSectionPosition: nextPosition },
    })
    if (item.contextKey && !section.contextSection) {
      await tx.compositeFormSection.update({ where: { id: sectionId }, data: { contextSection: true } })
    }
    if (item.contextKey && item.formSectionId && item.formSectionId !== sectionId) {
      const remainingContext = await tx.compositeAssessmentItem.count({
        where: { formSectionId: item.formSectionId, contextKey: { not: null }, id: { not: itemId } },
      })
      if (remainingContext === 0) {
        await tx.compositeFormSection.update({ where: { id: item.formSectionId }, data: { contextSection: false } })
      }
    }
  })
  return listCompositeFormSections(compositeId)
}

const lockAttempt = async (tx: Prisma.TransactionClient, attemptId: string) => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "composite_assessment_attempts" WHERE "id" = ${attemptId} FOR UPDATE
  `
  if (!rows[0]) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评记录不存在', 404)
}

const lockCompositeFormSectionAttempt = async (tx: Prisma.TransactionClient, sectionAttemptId: string) => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "composite_form_section_attempts" WHERE "id" = ${sectionAttemptId} FOR UPDATE
  `
  if (!rows[0]) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段记录不存在', 404)
}

export const normalizeCompositeSectionAnswers = (section: CompositeSection, values: SectionSubmitInput['answers']) => {
  const itemMap = new Map(section.items.map((item) => [item.id, item]))
  const provided = new Map<string, string | string[] | null>()
  for (const answer of values) {
    const item = itemMap.get(answer.formItemId)
    if (!item) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '提交中包含不属于该区段的字段', 400)
    if (provided.has(answer.formItemId)) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '同一字段不能重复提交', 400)
    provided.set(answer.formItemId, answer.value)
  }
  const normalized = orderedItems(section.items).map((item) => {
    const value = provided.has(item.id) ? provided.get(item.id)! : null
    if (value === null) {
      if (item.required) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', `${item.formLabel} 为必填项`, 400)
      return { item, normalizedValue: null, storedValue: null, completed: false }
    }
    const form = { id: item.id, type: item.formType, label: item.formLabel, required: item.required, options: item.formOptions, contextKey: item.contextKey }
    const validation = validateQuestionnaireFormAnswer(form, value)
    if (validation) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', validation, 400)
    const valueAfterNormalization = normalizeQuestionnaireFormAnswer(form, value) as string | string[]
    const serialized = Array.isArray(valueAfterNormalization) ? JSON.stringify(valueAfterNormalization) : valueAfterNormalization
    return { item, normalizedValue: valueAfterNormalization, storedValue: writeContextFormAnswer(item.contextKey, serialized), completed: true }
  })
  return { normalized, payloadAnswers: normalized.map((entry) => ({ formItemId: entry.item.id, value: entry.normalizedValue })) }
}

export const persistCompositeFormSection = async (
  tx: Prisma.TransactionClient,
  attemptId: string,
  sectionAttemptId: string,
  mutations: Array<{ itemId: string; value: string | null }>,
) => {
  if (mutations.length === 0) return
  const values = mutations.map((mutation) => Prisma.sql`(
    ${uuidv4()}, ${attemptId}, ${mutation.itemId}, ${sectionAttemptId}, ${mutation.value}, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )`)
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "composite_form_answers" ("id", "attempt_id", "item_id", "form_section_attempt_id", "value", "completed", "created_at", "updated_at")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("attempt_id", "item_id") DO UPDATE SET
      "form_section_attempt_id" = EXCLUDED."form_section_attempt_id",
      "value" = EXCLUDED."value",
      "completed" = EXCLUDED."completed",
      "updated_at" = CURRENT_TIMESTAMP
  `)
}

const submitCompositeFormSectionFinalImpl = async (input: SectionSubmitInput) => {
  const submissionId = validateSubmissionId(input.submissionId)
  const route = await measureRequestPhase('final_submit_admission', () => prisma.compositeAssessmentAttempt.findUnique({
    where: { id: input.attemptId },
    select: { id: true, runtimeGeneration: true },
  }))
  if (!route) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评记录不存在', 404)
  if (route.runtimeGeneration === 'UNIFIED_V1') {
    const { submitUnifiedCompositeFormSectionFinal } = await import('../assessment-runtime/unified-form-section-final-submit.service')
    return submitUnifiedCompositeFormSectionFinal(input)
  }
  const attempt = await measureRequestPhase('final_submit_admission', () => prisma.compositeAssessmentAttempt.findUnique({
    where: { id: input.attemptId },
    select: {
      id: true,
      userId: true,
      recoveryTokenHash: true,
      status: true,
      deliveryMode: true,
      runtimeGeneration: true,
      attemptEpoch: true,
      completedItems: true,
      contextSnapshotEncrypted: true,
      contextSnapshotHash: true,
      frozenActiveSlotSetEncrypted: true,
      frozenActiveSlotSetHash: true,
      formSectionAttempts: {
        where: { sectionId: input.sectionId },
        select: { sectionId: true, status: true, attemptEpoch: true },
      },
      compositeAssessment: {
        select: {
          items: { select: { id: true, type: true, position: true, formSectionId: true, formSectionPosition: true } },
          formSections: { orderBy: { position: 'asc' }, include: { items: true } },
        },
      },
    },
  }))
  if (!attempt) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评记录不存在', 404)
  if (input.userId !== null && input.userId !== undefined) {
    if (attempt.userId !== input.userId) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限操作此综合测评', 403)
  } else if (attempt.userId !== null || !input.recoveryTokenHash || attempt.recoveryTokenHash !== input.recoveryTokenHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '恢复凭证无权操作此综合测评', 403)
  }
  assertFinalOnly(attempt.deliveryMode)
  assertAttemptEpoch(attempt.attemptEpoch, input.attemptEpoch)
  assertFinalSubmitStatus(attempt.status, '综合测评')
  const admissionSectionAttempt = attempt.formSectionAttempts[0]
  if (admissionSectionAttempt) {
    assertFinalSubmitStatus(admissionSectionAttempt.status, '表单区段')
    assertAttemptEpoch(admissionSectionAttempt.attemptEpoch, input.attemptEpoch)
  }
  if (attempt.status === 'COMPLETED' && admissionSectionAttempt?.status !== 'COMPLETED') {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评已结束，请重启后重新作答', 409)
  }
  const section = attempt.compositeAssessment.formSections.find((candidate) => candidate.id === input.sectionId)
  if (!section) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段不存在', 404)
  const mappedSection = mapCompositeSection(section)
  const actualDefinitionHash = measureRequestPhaseSync(
    'final_submit_definition_prepare',
    () => compositeFormSectionDefinitionHash(mappedSection),
  )
  assertDefinitionHash(actualDefinitionHash, input.definitionHash)
  if (mappedSection.contextSection && !isFirstCompositeContentSection(attempt.compositeAssessment, mappedSection.id)) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '人口学上下文区段必须是第一个内容区段', 409)
  }
  if (compositeHasContextSection(attempt.compositeAssessment) && !mappedSection.contextSection && !attempt.contextSnapshotHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '请先完成并提交人口学上下文区段', 409)
  }
  if ((input.contextSnapshotHash ?? null) !== (attempt.contextSnapshotHash ?? null)) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评上下文版本已变化，请重试', 409)
  }
  const normalizedResult = measureRequestPhaseSync(
    'final_submit_payload_validation',
    () => normalizeCompositeSectionAnswers(mappedSection, input.answers),
  )
  const canonical = measureRequestPhaseSync('final_submit_non_db_compute', () => (
    measureRequestPhaseSync('final_submit_serialization', () => (
      measureRequestPhaseSync('final_submit_payload_hash', () => prepareCanonicalSubmission({ answers: normalizedResult.payloadAnswers }))
    ))
  ))
  assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.formSection, '综合测评区段提交数据')
  const payloadHash = canonical.hash

  let sectionAttempt = await prisma.compositeFormSectionAttempt.findUnique({
    where: { attemptId_sectionId: { attemptId: attempt.id, sectionId: mappedSection.id } },
  })
  if (!sectionAttempt) {
    try {
      sectionAttempt = await prisma.compositeFormSectionAttempt.create({
        data: { attemptId: attempt.id, sectionId: mappedSection.id, attemptEpoch: input.attemptEpoch },
      })
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error
      sectionAttempt = await prisma.compositeFormSectionAttempt.findUnique({
        where: { attemptId_sectionId: { attemptId: attempt.id, sectionId: mappedSection.id } },
      })
    }
  }
  if (!sectionAttempt) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段记录不存在', 404)

  const committed = await withFinalOnlyCompletionTransaction(async (tx) => {
    await measureRequestPhase('final_submit_row_lock_wait', () => lockCompositeFormSectionAttempt(tx, sectionAttempt!.id))
    await lockAttempt(tx, attempt.id)
    const current = await tx.compositeAssessmentAttempt.findUnique({
      where: { id: attempt.id },
      select: {
        status: true,
        deliveryMode: true,
        attemptEpoch: true,
        contextSnapshotEncrypted: true,
        contextSnapshotHash: true,
        compositeAssessment: {
          select: {
            formSections: { select: { id: true, contextSection: true, items: { select: { contextKey: true } } } },
          },
        },
      },
    })
    if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评记录不存在', 404)
    assertFinalOnly(current.deliveryMode)
    assertAttemptEpoch(current.attemptEpoch, input.attemptEpoch)
    assertFinalSubmitStatus(current.status, '综合测评')

    const lockedSectionAttempt = await tx.compositeFormSectionAttempt.findUnique({ where: { id: sectionAttempt!.id } })
    if (!lockedSectionAttempt) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段记录不存在', 404)
    assertAttemptEpoch(lockedSectionAttempt.attemptEpoch, input.attemptEpoch)
    if (compositeHasContextSection(current.compositeAssessment) && !mappedSection.contextSection && !current.contextSnapshotHash) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '请先完成并提交人口学上下文区段', 409)
    }
    if ((input.contextSnapshotHash ?? null) !== (current.contextSnapshotHash ?? null)) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评上下文版本已变化，请重试', 409)
    const replay = assertSubmissionReplay(lockedSectionAttempt, submissionId, payloadHash)
    if (replay === 'replay' && lockedSectionAttempt.status === 'COMPLETED') {
      const parent = await refreshCompositeFinalOnlyProgress(tx, attempt.id)
      return {
        replayed: true,
        sectionAttemptId: lockedSectionAttempt.id,
        progress: parent.progress,
        contextSnapshotHash: current.contextSnapshotHash,
        payloadHash,
        terminalCandidate: parent.terminalCandidate,
      }
    }
    if (current.status !== 'IN_PROGRESS') throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评已结束', 409)
    if (lockedSectionAttempt.status !== 'IN_PROGRESS') throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段已结束', 409)

    const itemIds = normalizedResult.normalized.map((entry) => entry.item.id)
    const existing = await tx.compositeFormAnswer.findMany({ where: { attemptId: attempt.id, itemId: { in: itemIds } }, select: { itemId: true } })
    const existingIds = new Set(existing.map((row) => row.itemId))
    await persistCompositeFormSection(tx, attempt.id, lockedSectionAttempt.id, normalizedResult.normalized.map((entry) => ({ itemId: entry.item.id, value: entry.storedValue })))
    const updatedSection = await tx.compositeFormSectionAttempt.updateMany({
      where: { id: lockedSectionAttempt.id, status: 'IN_PROGRESS', attemptEpoch: input.attemptEpoch },
      data: { status: 'COMPLETED', submissionId, submissionPayloadHash: payloadHash, submittedAt: new Date() },
    })
    if (updatedSection.count !== 1) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段状态已变化，请重试', 409)

    const parent = await refreshCompositeFinalOnlyProgress(tx, attempt.id)

    let contextSnapshotHash = current.contextSnapshotHash
    if (mappedSection.contextSection && !current.contextSnapshotHash) {
      try {
        const frozen = await measureRequestPhase('final_submit_context_read', () => freezeCompositeAttemptContext(tx, attempt.id))
        contextSnapshotHash = frozen.hash
      } catch (error) {
        throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', error instanceof Error ? error.message : '人口学上下文无效', 409)
      }
    }
    return {
      replayed: false,
      sectionAttemptId: sectionAttempt.id,
      progress: parent.progress,
      contextSnapshotHash,
      payloadHash,
      replacedAnswerCount: existingIds.size,
      terminalCandidate: parent.terminalCandidate,
    }
  })

  const { terminalCandidate: shouldFinalize, ...response } = committed
  const parent = shouldFinalize
    ? await measureRequestPhase('final_submit_parent_finalization', async () => {
      const { finalizeCompositeAttemptIfReady } = await import('./composite.service')
      return finalizeCompositeAttemptIfReady(attempt.id)
    })
    : { status: 'IN_PROGRESS', progress: response.progress, completedAt: null }
  return { submissionId, sectionId: input.sectionId, ...response, parent }
}


export const submitCompositeFormSectionFinal = (input: SectionSubmitInput) => (
  withUnitSubmitAdmission(() => submitCompositeFormSectionFinalImpl(input))
)
