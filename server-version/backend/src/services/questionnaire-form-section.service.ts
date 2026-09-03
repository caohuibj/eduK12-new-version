import { Prisma } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../config/database'
import {
  buildAssessmentContext,
  hashAssessmentContext,
  readContextFormAnswers,
  type AssessmentContextV1,
} from '../modules/assessment-context'
import { writeContextFormAnswer } from '../modules/assessment-context'
import {
  normalizeQuestionnaireFormAnswer,
  validateQuestionnaireFormAnswer,
} from './questionnaireFormAnswerValidation'
import { buildQuestionnaireCollectionReport, collectionReportForStorage } from '../modules/reporting/questionnaire-collection-report'
import { encryptField } from '../utils/encryption'
import {
  freezeQuestionnaireAssessmentContextFromSnapshot,
  isAssessmentContextServiceError,
  readQuestionnaireAssessmentContext,
} from './assessmentContextService'
import {
  assertAttemptEpoch,
  assertCanonicalSubmissionPayloadSize,
  assertDefinitionHash,
  assertFinalOnly,
  assertFinalSubmitStatus,
  assertSubmissionReplay,
  computeSubmissionPayloadHash,
  FINAL_SUBMISSION_MAX_BYTES,
  InstrumentFinalSubmitError,
  prepareCanonicalSubmission,
  validateSubmissionId,
} from './instrumentFinalSubmit'
import { withUnitSubmitAdmission } from './unitSubmitAdmission'
import { persistFormAnswerBatch, type BulkFormAnswerMutation } from './questionnaire-form-answer-batch'
import {
  withFinalOnlyCompletionTransaction,
  withQuestionnaireCompletionTransaction,
} from './questionnaireProgressService'
import { measureRequestPhase, measureRequestPhaseSync } from './runtimeObservability'
import {
  readScaleAnswers,
  scaleDefinitionFromRecord,
  scaleAssessmentForResponse,
  encryptScaleAnswers,
  scaleRunnerFromRecord,
} from '../modules/scale/scale-workflow.service'
import { hashScaleDefinition } from '../modules/scale/scale-definition'
import { questionnaireResumeTokenService } from './questionnaireResumeTokenService'
import { freezeQuestionnaireActiveSlotSet, formSectionIdentityHash } from '../modules/assessment-runtime/attempt-runtime'
import {
  decryptFrozenScaleRuntimeSnapshot,
  encryptFrozenScaleRuntimeSnapshot,
  freezeScaleRuntimeAtAttemptStart,
} from '../modules/assessment-runtime/runtime-snapshot'
import {
  decryptFrozenActiveSlotSet,
  encryptFrozenActiveSlotSet,
  formSectionSlotKey,
  questionnaireScaleSlotKey,
  type FrozenActiveSlotV1,
} from '../modules/assessment-runtime/slot-set'
import type { AggregateSnapshotHeader } from '../modules/assessment-runtime/unified-aggregate'
import { evaluateCompleteness } from '../modules/assessment-runtime/unified-aggregate'
import { runnerDefinition } from '../modules/scale/scale-definition'
import { ensureScaleAdmissionAtDelivery } from '../modules/scale/scale-admission.service'
import { ensureQuestionnaireFormAdmissionAtDelivery } from '../modules/assessment-runtime/form-admission.service'
import {
  mapQuestionnaireSection,
  orderedQuestionnaireFormSectionItems,
  questionnaireFormSectionDefinitionHash,
  type SectionItem,
  type SectionRow,
} from '../modules/assessment-runtime/form-section-definition'

export {
  mapQuestionnaireSection,
  questionnaireFormSectionDefinitionHash,
  type SectionItem,
  type SectionRow,
}

export type SectionSubmitInput = {
  questionnaireAssessmentId: string
  sectionId: string
  submissionId: string
  attemptEpoch: number
  definitionHash: string
  contextSnapshotHash?: string | null
  answers: Array<{ formItemId: string; value: string | string[] | null }>
  userId?: string | null
  sessionId?: string
  resumeTokenHash?: string
}

const orderedSectionItems = orderedQuestionnaireFormSectionItems

const contentTypesForQuestionnaire = (questionnaire: any) => [
  ...(questionnaire.formItems ?? []).map((item: any) => ({ type: 'FORM', position: item.position, item })),
  ...(questionnaire.questionnaireScales ?? []).map((item: any) => ({ type: 'SCALE', position: item.position, item })),
].sort((left, right) => left.position - right.position)

/**
 * Backfill sections for newly-created form items. Existing rows are mapped by
 * the migration; this helper keeps the editor/start path safe for items added
 * after that migration without changing the mixed Form/Scale order.
 */
export const ensureQuestionnaireFormSections = async (questionnaireId: string): Promise<SectionRow[]> => {
  const current = await prisma.questionnaire.findUnique({
    where: { id: questionnaireId },
    select: {
      formItems: { orderBy: { position: 'asc' }, select: { id: true, position: true, sectionId: true, contextKey: true } },
      questionnaireScales: { orderBy: { position: 'asc' }, select: { id: true, position: true } },
      formSections: { select: { id: true, position: true } },
    },
  })
  if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷不存在', 404)
  const unassigned = current.formItems.filter((item) => !item.sectionId)
  if (unassigned.length > 0) {
    await prisma.$transaction(async (tx) => {
      const latest = await tx.questionnaire.findUnique({
        where: { id: questionnaireId },
        select: {
          formItems: { orderBy: { position: 'asc' }, select: { id: true, position: true, sectionId: true, contextKey: true } },
          questionnaireScales: { orderBy: { position: 'asc' }, select: { id: true, position: true } },
          formSections: { select: { id: true, position: true } },
        },
      })
      if (!latest) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷不存在', 404)
      const missing = latest.formItems.filter((item) => !item.sectionId)
      if (missing.length === 0) return

      const missingIds = new Set(missing.map((item) => item.id))
      const runs: typeof missing[] = []
      let run: typeof missing = []
      for (const content of contentTypesForQuestionnaire(latest)) {
        if (content.type === 'FORM' && missingIds.has(content.item.id)) {
          run.push(content.item)
        } else if (content.type !== 'FORM' && run.length > 0) {
          runs.push(run)
          run = []
        }
      }
      if (run.length > 0) runs.push(run)

      const occupied = new Set(latest.formSections.map((section) => section.position))
      const maximumPosition = Math.max(
        -1,
        ...latest.formItems.map((item) => item.position),
        ...latest.questionnaireScales.map((item) => item.position),
      )
      for (const [runIndex, items] of runs.entries()) {
        let position = items[0].position
        if (occupied.has(position)) position = maximumPosition + runIndex + 1
        occupied.add(position)
        const section = await tx.questionnaireFormSection.create({
          data: {
            questionnaireId,
            title: '表单',
            position,
            contextSection: items.some((item) => Boolean(item.contextKey)),
          },
        })
        for (const [sectionPosition, item] of items.entries()) {
          await tx.questionnaireFormItem.update({
            where: { id: item.id },
            data: { sectionId: section.id, sectionPosition },
          })
        }
      }
    })
  }

  const sections = await prisma.questionnaireFormSection.findMany({
    where: { questionnaireId },
    orderBy: { position: 'asc' },
    include: { items: { orderBy: [{ sectionPosition: 'asc' }, { position: 'asc' }] } },
  })
  return sections.map(mapQuestionnaireSection)
}

const finalQuestionnaireUnits = (questionnaire: any) => [
  ...(questionnaire.questionnaireScales ?? []).map((item: any) => ({
    id: item.id,
    type: 'SCALE' as const,
    position: item.position,
    item,
  })),
  ...(questionnaire.formSections ?? []).map((section: any) => ({
    id: section.id,
    type: 'FORM_SECTION' as const,
    position: section.position,
    section,
  })),
].sort((left, right) => left.position - right.position)

const unifiedProgressSnapshot = (row: { slotKey: string; terminalState: string }, slots: Map<string, FrozenActiveSlotV1>, attemptEpoch: number): AggregateSnapshotHeader => {
  const slot = slots.get(row.slotKey)
  return {
    slotKey: row.slotKey,
    attemptEpoch,
    unitType: slot?.unitType ?? 'FORM_SECTION',
    terminalState: row.terminalState as AggregateSnapshotHeader['terminalState'],
    payloadKind: slot?.unitType === 'FORM_SECTION' ? 'COLLECTION_FACTS' : 'UNIT_RESULT',
    sourceType: 'PROGRESS_HEADER',
    sourceAttemptId: 'PROGRESS_HEADER',
  }
}

const getUnifiedQuestionnaireFinalAttemptState = async (assessmentId: string) => {
  const assessment = await prisma.questionnaireAssessment.findUnique({
    where: { id: assessmentId },
    select: {
      id: true,
      status: true,
      deliveryMode: true,
      runtimeGeneration: true,
      attemptEpoch: true,
      progress: true,
      startedAt: true,
      completedAt: true,
      totalTime: true,
      sessionId: true,
      contextSnapshotEncrypted: true,
      contextSnapshotHash: true,
      contextFrozenAt: true,
      frozenActiveSlotSetEncrypted: true,
      frozenActiveSlotSetHash: true,
      questionnaire: {
        select: {
          id: true,
          name: true,
          instruction: true,
          questionnaireScales: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              scaleId: true,
              position: true,
              scale: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  instruction: true,
                  instrumentClass: true,
                  instrumentVersion: true,
                },
              },
            },
          },
          formSections: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              title: true,
              description: true,
              position: true,
              contextSection: true,
              items: {
                orderBy: [{ sectionPosition: 'asc' }, { position: 'asc' }],
                select: {
                  id: true,
                  type: true,
                  label: true,
                  placeholder: true,
                  required: true,
                  options: true,
                  contextKey: true,
                  position: true,
                  sectionPosition: true,
                },
              },
            },
          },
        },
      },
      scaleAssessments: {
        orderBy: { startedAt: 'asc' },
        select: { id: true, scaleId: true, status: true, progress: true },
      },
    },
  }) as any
  if (!assessment) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评记录不存在', 404)
  assertFinalOnly(assessment.deliveryMode)
  if (assessment.runtimeGeneration !== 'UNIFIED_V1') {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷运行时版本不匹配，请重启测评', 409)
  }

  let frozenSlotSet: ReturnType<typeof decryptFrozenActiveSlotSet>
  try {
    if (!assessment.frozenActiveSlotSetEncrypted || !assessment.frozenActiveSlotSetHash) throw new Error('FrozenActiveSlotSet missing')
    frozenSlotSet = decryptFrozenActiveSlotSet(assessment.frozenActiveSlotSetEncrypted)
    if (frozenSlotSet.snapshotHash !== assessment.frozenActiveSlotSetHash || frozenSlotSet.attemptEpoch !== assessment.attemptEpoch) {
      throw new Error('FrozenActiveSlotSet identity mismatch')
    }
  } catch {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '问卷冻结内容不可用，请重启测评', 409)
  }

  // This is the only progress query. It intentionally selects no payload,
  // answer, trial, or child result column.
  const rows = await prisma.assessmentUnitSnapshot.findMany({
    where: { questionnaireAssessmentId: assessment.id, attemptEpoch: assessment.attemptEpoch },
    select: { slotKey: true, terminalState: true },
  })
  const slotsByKey = new Map(frozenSlotSet.slots.map((slot: FrozenActiveSlotV1) => [slot.slotKey, slot]))
  const headers = rows.map((row) => unifiedProgressSnapshot(row, slotsByKey, assessment.attemptEpoch))
  const completeness = evaluateCompleteness({ slots: frozenSlotSet.slots, snapshots: headers, attemptEpoch: assessment.attemptEpoch })
  if (completeness.invalidSlotKeys.length > 0) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '问卷进度快照不可用，请重启测评', 409)
  }

  const sections = assessment.questionnaire.formSections ?? []
  const headerByKey = new Map(headers.map((header) => [header.slotKey, header]))
  const scaleMap = new Map<string, any>(assessment.scaleAssessments.map((child: any) => [child.scaleId, child] as [string, any]))
  const units = finalQuestionnaireUnits(assessment.questionnaire)
  const completed = (unit: any) => {
    const slotKey = unit.type === 'SCALE'
      ? questionnaireScaleSlotKey(unit.item.id)
      : formSectionSlotKey(unit.section.id)
    return headerByKey.get(slotKey)?.terminalState === 'COMPLETED'
  }
  const completedItems = units.filter(completed).length
  const currentIndex = units.findIndex((unit) => !completed(unit))
  const effectiveCurrentIndex = currentIndex < 0 ? units.length : currentIndex

  const formSections: any[] = sections.map((section: any) => {
    const definition = mapQuestionnaireSection(section)
    const slot = slotsByKey.get(formSectionSlotKey(section.id))
    const sectionCompleted = completed({ type: 'FORM_SECTION', section })
    return {
      id: section.id,
      title: section.title,
      description: section.description ?? null,
      position: section.position,
      contextSection: definition.contextSection,
      definitionHash: slot?.sourceDefinitionIdentity.hash ?? formSectionIdentityHash(definition),
      status: sectionCompleted ? 'COMPLETED' : 'IN_PROGRESS',
      submittedAt: null,
      // Individual values belong to the local final-only draft. The server
      // progress projection must not reread questionnaire_form_answers.
      items: definition.items.map((item) => ({
        id: item.id,
        formItemId: item.id,
        type: item.type,
        label: item.label,
        placeholder: (section.items.find((candidate: any) => candidate.id === item.id) as any)?.placeholder ?? null,
        options: item.options,
        required: item.required,
        contextKey: item.contextKey,
        value: null,
      })),
    }
  })

  let currentScale: any = null
  let currentFormSection: any = null
  const current = currentIndex >= 0 ? units[currentIndex] : null
  if (current?.type === 'FORM_SECTION') {
    currentFormSection = formSections.find((section) => section.id === current.section.id) ?? null
    await ensureQuestionnaireFormAdmissionAtDelivery(assessment.id, mapQuestionnaireSection(current.section))
  } else if (current?.type === 'SCALE') {
    const child = scaleMap.get(current.item.scaleId)
    if (!child?.id) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结运行时不可用，请重启测评', 409)
    }
    // Lazy current-unit projection: only the unfinished Scale loads its frozen runtime.
    const runtimeChild = await prisma.assessment.findUnique({
      where: { id: child.id },
      select: { id: true, runtimeSnapshotEncrypted: true, compiledRuntimeHash: true },
    })
    if (!runtimeChild?.runtimeSnapshotEncrypted) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结运行时不可用，请重启测评', 409)
    }
    try {
      const runtime = decryptFrozenScaleRuntimeSnapshot(runtimeChild.runtimeSnapshotEncrypted)
      const slot = slotsByKey.get(questionnaireScaleSlotKey(current.item.id))
      if (
        runtime.instrumentKey !== current.item.scale.code
        || runtime.instrumentVersion !== current.item.scale.instrumentVersion
        || runtime.compiledRuntime.compiledRuntimeHash !== runtimeChild.compiledRuntimeHash
        || runtime.sourceDefinitionHash !== slot?.sourceDefinitionIdentity.hash
      ) throw new Error('Scale runtime identity mismatch')
      await ensureScaleAdmissionAtDelivery(child.id)
      currentScale = {
        id: current.item.scale.id,
        name: current.item.scale.name,
        instruction: current.item.scale.instruction ?? null,
        scaleAssessmentId: child.id,
        definitionHash: runtime.legacyDefinitionHash,
        definition: runnerDefinition(runtime.definition),
      }
    } catch (error) {
      if (error instanceof InstrumentFinalSubmitError) throw error
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结运行时不可用，请重启测评', 409)
    }
  }

  const scaleAssessments = assessment.scaleAssessments.map((child: any) => {
    const questionnaireScale = assessment.questionnaire.questionnaireScales.find((item: any) => item.scaleId === child.scaleId)
    const isCompleted = questionnaireScale ? completed({ type: 'SCALE', item: questionnaireScale }) : false
    return {
      id: child.id,
      scaleId: child.scaleId,
      status: isCompleted ? 'COMPLETED' : 'IN_PROGRESS',
      progress: isCompleted ? 100 : 0,
      scaleName: questionnaireScale?.scale.name ?? '未知量表',
    }
  })
  return {
    questionnaireAssessment: {
      id: assessment.id,
      status: assessment.status,
      progress: assessment.status === 'COMPLETED' ? 100 : completeness.progress,
      currentIndex: assessment.status === 'COMPLETED' ? units.length : effectiveCurrentIndex,
      deliveryMode: 'FINAL_ONLY' as const,
      attemptEpoch: assessment.attemptEpoch,
      startedAt: assessment.startedAt,
      completedAt: assessment.completedAt,
      totalTime: assessment.totalTime,
      context: {
        status: assessment.contextSnapshotEncrypted && assessment.contextSnapshotHash ? 'frozen' as const : 'collecting' as const,
        frozenAt: assessment.contextFrozenAt?.toISOString?.() ?? null,
        snapshotHash: assessment.contextSnapshotHash ?? null,
      },
    },
    questionnaire: {
      id: assessment.questionnaire.id,
      name: assessment.questionnaire.name,
      instruction: assessment.questionnaire.instruction,
    },
    definitionHash: finalQuestionnaireDefinitionHash(assessment.questionnaire),
    contextSnapshotHash: assessment.contextSnapshotHash ?? null,
    currentFormItem: null,
    currentFormSection,
    currentScale,
    totalItems: units.length,
    contentItems: units.map((unit, index) => ({
      type: unit.type === 'SCALE' ? 'scale' as const : 'form-section' as const,
      position: unit.position,
      id: unit.id,
      label: unit.type === 'SCALE' ? unit.item.scale.name : unit.section.title,
      completed: completed(unit),
      index,
    })),
    units: units.map((unit, index) => ({
      type: unit.type,
      id: unit.id,
      position: unit.position,
      label: unit.type === 'SCALE' ? unit.item.scale.name : unit.section.title,
      completed: completed(unit),
      index,
    })),
    formSections,
    scaleAssessments,
    sessionId: assessment.sessionId,
    completedItems,
  }
}

const isFirstQuestionnaireContentSection = (questionnaire: any, sectionId: string): boolean => {
  const firstUnit = finalQuestionnaireUnits(questionnaire)[0]
  return firstUnit?.type === 'FORM_SECTION' && firstUnit.id === sectionId
}

export const finalQuestionnaireDefinitionHash = (questionnaire: any) => computeSubmissionPayloadHash({
  questionnaireId: questionnaire.id,
  scales: (questionnaire.questionnaireScales ?? []).map((item: any) => ({ id: item.id, scaleId: item.scaleId, position: item.position })),
  formSections: (questionnaire.formSections ?? []).map((section: any) => ({
    id: section.id,
    position: section.position,
    title: section.title,
    description: section.description ?? null,
    contextSection: Boolean(section.contextSection) || (section.items ?? []).some((item: any) => Boolean(item.contextKey)),
    items: (section.items ?? []).map((item: any) => ({
      id: item.id,
      type: item.type,
      label: item.label,
      placeholder: item.placeholder ?? null,
      required: item.required !== false,
      options: item.options,
      contextKey: item.contextKey ?? null,
      position: item.position,
      sectionPosition: item.sectionPosition ?? null,
    })),
  })),
})

/**
 * Response projection used by final-only Questionnaire start/get endpoints.
 * It deliberately reads answers only at an instrument boundary: individual
 * field changes are local IndexedDB state and never reach this endpoint.
 */

const patchQuestionnaireStateAfterFinalize = (
  state: Awaited<ReturnType<typeof getUnifiedQuestionnaireFinalAttemptState>>,
  finalized: { status: string; progress: number; completedAt: Date | string | null },
) => {
  // Only promote runner 终态 fields when finalize actually completed.
  if (finalized.status !== 'COMPLETED') {
    return {
      ...state,
      questionnaireAssessment: {
        ...state.questionnaireAssessment,
        status: finalized.status,
        progress: finalized.progress,
        completedAt: finalized.completedAt,
      },
    }
  }
  return {
    ...state,
    questionnaireAssessment: {
      ...state.questionnaireAssessment,
      status: finalized.status,
      progress: 100,
      completedAt: finalized.completedAt,
      currentIndex: state.totalItems,
    },
    currentFormSection: null,
    currentScale: null,
    completedItems: state.totalItems,
  }
}

export const getQuestionnaireFinalAttemptState = async (assessmentId: string) => {
  const runtime = await prisma.questionnaireAssessment.findUnique({
    where: { id: assessmentId },
    select: { deliveryMode: true, runtimeGeneration: true },
  })
  if (!runtime) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评记录不存在', 404)
  assertFinalOnly(runtime.deliveryMode)
  if (runtime.runtimeGeneration === 'UNIFIED_V1') {
    const state = await getUnifiedQuestionnaireFinalAttemptState(assessmentId)
    if (
      state.questionnaireAssessment.status === 'IN_PROGRESS'
      && state.totalItems > 0
      && state.completedItems >= state.totalItems
    ) {
      // Reconcile-once: finalize mutates parent status/progress/completedAt only.
      // Do not rebuild the full runner projection a second time.
      const finalized = await finalizeQuestionnaireIfReady(assessmentId)
      if (!finalized) return state
      return patchQuestionnaireStateAfterFinalize(state, finalized)
    }
    return state
  }

  const assessment = await prisma.questionnaireAssessment.findUnique({
    where: { id: assessmentId },
    include: {
      questionnaire: {
        include: {
          questionnaireScales: {
            orderBy: { position: 'asc' },
            include: { scale: true },
          },
          formSections: {
            orderBy: { position: 'asc' },
            include: { items: { orderBy: [{ sectionPosition: 'asc' }, { position: 'asc' }] } },
          },
        },
      },
      scaleAssessments: { include: { scale: true }, orderBy: { startedAt: 'asc' } },
      formAnswers: true,
      formSectionAttempts: true,
    },
  })
  if (!assessment) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评记录不存在', 404)
  assertFinalOnly(assessment.deliveryMode)

  const sections = assessment.questionnaire.formSections ?? []
  const readableAnswers = readContextFormAnswers(
    sections.flatMap((section: any) => section.items.map((item: any) => ({ id: item.id, contextKey: item.contextKey ?? null }))),
    assessment.formAnswers,
  )
  const answerMap = new Map(readableAnswers.map((answer: any) => [answer.formItemId, answer]))
  const scaleMap = new Map(assessment.scaleAssessments.map((child: any) => [child.scaleId, child]))
  const sectionAttemptMap = new Map<string, any>(assessment.formSectionAttempts.map((attempt: any) => [attempt.sectionId, attempt]))
  const units = finalQuestionnaireUnits(assessment.questionnaire)
  const completed = (unit: any) => unit.type === 'SCALE'
    ? scaleMap.get(unit.item.scaleId)?.status === 'COMPLETED'
    : sectionAttemptMap.get(unit.section.id)?.status === 'COMPLETED'
  const completedItems = units.filter(completed).length
  const currentIndex = units.findIndex((unit) => !completed(unit))
  const effectiveCurrentIndex = currentIndex < 0 ? units.length : currentIndex
  const current = currentIndex >= 0 ? units[currentIndex] : null

  const sectionResponse = (section: any) => {
    const definition = mapQuestionnaireSection(section)
    const sectionAttempt = sectionAttemptMap.get(section.id)
    return {
      id: section.id,
      title: section.title,
      description: section.description ?? null,
      position: section.position,
      contextSection: definition.contextSection,
      definitionHash: assessment.runtimeGeneration === 'UNIFIED_V1'
        ? formSectionIdentityHash(definition)
        : questionnaireFormSectionDefinitionHash(definition),
      status: sectionAttempt?.status ?? 'IN_PROGRESS',
      submittedAt: sectionAttempt?.submittedAt ?? null,
      items: definition.items.map((item) => ({
        id: item.id,
        formItemId: item.id,
        type: item.type,
        label: item.label,
        placeholder: (section.items.find((candidate: any) => candidate.id === item.id) as any)?.placeholder ?? null,
        options: item.options,
        required: item.required,
        contextKey: item.contextKey,
        value: answerMap.get(item.id)?.value ?? null,
      })),
    }
  }
  const formSections = sections.map(sectionResponse)

  let currentScale: any = null
  let currentFormSection: any = null
  if (current?.type === 'SCALE') {
    const child = scaleMap.get(current.item.scaleId)
    const definition = scaleDefinitionFromRecord(current.item.scale)
    const stored = readScaleAnswers(child?.answers)
    currentScale = {
      ...scaleRunnerFromRecord(current.item.scale),
      scaleAssessmentId: child?.id,
      definitionHash: hashScaleDefinition(definition),
      assessment: child ? scaleAssessmentForResponse(child) : null,
      ...(stored.decryptError ? { decryptError: true } : {}),
    }
  } else if (current?.type === 'FORM_SECTION') {
    currentFormSection = formSections.find((section) => section.id === current.section.id) ?? null
  }

  const totalItems = units.length
  const progress = totalItems === 0 ? 100 : Math.min(100, Math.round((completedItems / totalItems) * 100))
  return {
    questionnaireAssessment: {
      id: assessment.id,
      status: assessment.status,
      progress: assessment.status === 'COMPLETED' ? 100 : progress,
      currentIndex: assessment.status === 'COMPLETED' ? totalItems : effectiveCurrentIndex,
      deliveryMode: 'FINAL_ONLY' as const,
      attemptEpoch: assessment.attemptEpoch,
      startedAt: assessment.startedAt,
      completedAt: assessment.completedAt,
      totalTime: assessment.totalTime,
      context: {
        status: assessment.contextSnapshotEncrypted && assessment.contextSnapshotHash ? 'frozen' as const : 'collecting' as const,
        frozenAt: assessment.contextFrozenAt?.toISOString?.() ?? null,
        snapshotHash: assessment.contextSnapshotHash ?? null,
      },
    },
    questionnaire: {
      id: assessment.questionnaire.id,
      name: assessment.questionnaire.name,
      instruction: assessment.questionnaire.instruction,
    },
    definitionHash: finalQuestionnaireDefinitionHash(assessment.questionnaire),
    contextSnapshotHash: assessment.contextSnapshotHash ?? null,
    currentFormItem: null,
    currentFormSection,
    currentScale,
    totalItems,
    contentItems: units.map((unit, index) => ({
      type: unit.type === 'SCALE' ? 'scale' as const : 'form-section' as const,
      position: unit.position,
      id: unit.id,
      label: unit.type === 'SCALE' ? unit.item.scale.name : unit.section.title,
      completed: completed(unit),
      index,
    })),
    units: units.map((unit, index) => ({
      type: unit.type,
      id: unit.id,
      position: unit.position,
      label: unit.type === 'SCALE' ? unit.item.scale.name : unit.section.title,
      completed: completed(unit),
      index,
    })),
    formSections,
    scaleAssessments: assessment.scaleAssessments.map((child: any) => ({
      id: child.id,
      scaleId: child.scaleId,
      status: child.status,
      progress: child.progress,
      scaleName: assessment.questionnaire.questionnaireScales.find((item: any) => item.scaleId === child.scaleId)?.scale.name ?? '未知量表',
    })),
    sessionId: assessment.sessionId,
  }
}

export const listQuestionnaireFormSections = async (questionnaireId: string) => {
  const sections = await ensureQuestionnaireFormSections(questionnaireId)
  return sections.map((section) => ({
    ...section,
    definitionHash: questionnaireFormSectionDefinitionHash(section),
  }))
}

export type QuestionnaireContentUnitType = 'scale' | 'form-section'

export type QuestionnaireContentUnitInput = {
  type: QuestionnaireContentUnitType | 'form' | 'SCALE' | 'FORM_SECTION' | 'FORM'
  id: string
  position: number
}

export type QuestionnaireContentUnit = {
  type: QuestionnaireContentUnitType
  id: string
  position: number
  label: string
  itemCount: number
  contextSection: boolean
}

const contentUnitSort = <T extends { position: number; id: string }>(left: T, right: T) => (
  left.position - right.position || left.id.localeCompare(right.id)
)

const sectionHasContext = (section: { contextSection?: boolean; items?: Array<{ contextKey?: string | null }> }) => (
  Boolean(section.contextSection) || Boolean(section.items?.some((item) => item.contextKey))
)

const assertQuestionnaireContextUnitOrder = (
  units: Array<{ type: QuestionnaireContentUnitType; id: string }>,
  sections: Array<{ id: string; contextSection?: boolean; items?: Array<{ contextKey?: string | null }> }>,
) => {
  const contextSections = sections.filter(sectionHasContext)
  if (contextSections.length > 1) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '同一问卷只能有一个上下文区段', 400)
  }
  const contextSection = contextSections[0]
  if (contextSection && (units[0]?.type !== 'form-section' || units[0].id !== contextSection.id)) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '人口学上下文区段必须是第一个内容单元', 400)
  }
}

const normalizeQuestionnaireContentUnits = async (
  questionnaireId: string,
  input: QuestionnaireContentUnitInput[],
): Promise<{ units: Array<{ type: QuestionnaireContentUnitType; id: string }>; sections: SectionRow[] }> => {
  const sections = await ensureQuestionnaireFormSections(questionnaireId)
  const scales = await prisma.questionnaireScale.findMany({
    where: { questionnaireId },
    select: { id: true, scaleId: true, position: true },
  })
  const formItems = sections.flatMap((section) => section.items.map((item) => ({
    id: item.id,
    sectionId: section.id,
    position: item.position,
  })))
  const knownSections = new Map(sections.map((section) => [section.id, section]))
  const knownScales = new Map(scales.map((scale) => [scale.id, scale]))
  const knownForms = new Map(formItems.map((item) => [item.id, item]))
  if (input.some((item) => !Number.isInteger(item.position) || item.position < 0)) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '内容排序位置必须是非负整数', 400)
  }
  const orderedInput = [...input].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
  if (new Set(orderedInput.map((item) => item.position)).size !== orderedInput.length) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '内容排序位置不能重复', 400)
  }

  const canonicalType = (type: QuestionnaireContentUnitInput['type']): 'scale' | 'form-section' | 'form' => {
    if (type === 'scale' || type === 'SCALE') return 'scale'
    if (type === 'form-section' || type === 'FORM_SECTION') return 'form-section'
    return 'form'
  }
  const oldFormInput = orderedInput.some((item) => canonicalType(item.type) === 'form')
  const units: Array<{ type: QuestionnaireContentUnitType; id: string }> = []

  if (oldFormInput) {
    if (orderedInput.some((item) => canonicalType(item.type) !== 'form' && canonicalType(item.type) !== 'scale')) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '旧表单排序格式不能与区段排序混用', 400)
    }
    if (orderedInput.length !== formItems.length + scales.length) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '内容排序列表与问卷内容不一致', 400)
    }
    const seenFormIds = new Set<string>()
    const seenScaleIds = new Set<string>()
    const seenSections = new Set<string>()
    let activeSectionId: string | null = null
    const inferredPositions = new Map<string, number>()
    for (const entry of orderedInput) {
      if (canonicalType(entry.type) === 'scale') {
        if (!knownScales.has(entry.id) || seenScaleIds.has(entry.id)) {
          throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表排序列表与问卷内容不一致', 400)
        }
        seenScaleIds.add(entry.id)
        activeSectionId = null
        inferredPositions.set(`scale:${entry.id}`, entry.position)
        continue
      }
      const form = knownForms.get(entry.id)
      if (!form || seenFormIds.has(entry.id)) {
        throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '表单排序列表与问卷内容不一致', 400)
      }
      seenFormIds.add(entry.id)
      if (activeSectionId !== form.sectionId) {
        if (seenSections.has(form.sectionId)) {
          throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '同一区段的字段必须连续排列', 400)
        }
        activeSectionId = form.sectionId
        seenSections.add(form.sectionId)
        inferredPositions.set(`form-section:${form.sectionId}`, entry.position)
      }
    }
    if (seenFormIds.size !== formItems.length || seenScaleIds.size !== scales.length) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '内容排序列表与问卷内容不一致', 400)
    }
    // Empty sections have no representation in the legacy physical-item list;
    // retain their current relative place instead of silently dropping them.
    for (const section of sections) {
      if (!inferredPositions.has(`form-section:${section.id}`)) inferredPositions.set(`form-section:${section.id}`, section.position)
    }
    for (const scale of scales) {
      if (!inferredPositions.has(`scale:${scale.id}`)) inferredPositions.set(`scale:${scale.id}`, scale.position)
    }
    return {
      units: [...inferredPositions.entries()]
        .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
        .map(([key]) => {
          const [type, id] = key.split(':')
          return { type: type === 'scale' ? 'scale' as const : 'form-section' as const, id }
        }),
      sections,
    }
  }

  if (orderedInput.length !== sections.length + scales.length) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '内容单元排序列表与问卷内容不一致', 400)
  }
  const seen = new Set<string>()
  for (const entry of orderedInput) {
    const type = canonicalType(entry.type)
    const key = `${type}:${entry.id}`
    if (type === 'scale' && !knownScales.has(entry.id)) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表排序列表与问卷内容不一致', 400)
    }
    if (type === 'form-section' && !knownSections.has(entry.id)) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '区段排序列表与问卷内容不一致', 400)
    }
    if (type === 'form' || seen.has(key)) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '内容单元排序数据无效', 400)
    }
    seen.add(key)
    units.push({ type, id: entry.id })
  }
  const expected = new Set([
    ...scales.map((scale) => `scale:${scale.id}`),
    ...sections.map((section) => `form-section:${section.id}`),
  ])
  if (seen.size !== expected.size || [...expected].some((key) => !seen.has(key))) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '内容单元排序列表与问卷内容不一致', 400)
  }
  return { units, sections }
}

export const listQuestionnaireContentUnits = async (questionnaireId: string): Promise<QuestionnaireContentUnit[]> => {
  const sections = await ensureQuestionnaireFormSections(questionnaireId)
  const scales = await prisma.questionnaireScale.findMany({
    where: { questionnaireId },
    orderBy: { position: 'asc' },
    include: { scale: { select: { name: true } } },
  })
  return [
    ...scales.map((scale) => ({
      type: 'scale' as const,
      id: scale.id,
      position: scale.position,
      label: scale.scale.name,
      itemCount: 1,
      contextSection: false,
    })),
    ...sections.map((section) => ({
      type: 'form-section' as const,
      id: section.id,
      position: section.position,
      label: section.title,
      itemCount: section.items.length,
      contextSection: sectionHasContext(section),
    })),
  ].sort(contentUnitSort)
}

export const reorderQuestionnaireContentUnits = async (
  questionnaireId: string,
  input: QuestionnaireContentUnitInput[],
) => {
  const normalized = await normalizeQuestionnaireContentUnits(questionnaireId, input)
  assertQuestionnaireContextUnitOrder(normalized.units, normalized.sections)
  const scales = await prisma.questionnaireScale.findMany({ where: { questionnaireId }, select: { id: true } })
  const scaleIds = new Set(scales.map((scale) => scale.id))
  const sectionOffset = Math.max(
    1000,
    ...normalized.sections.map((section) => section.position),
    ...input.map((item) => item.position),
  ) + normalized.units.length + 1
  await prisma.$transaction(async (tx) => {
    for (const [index, section] of normalized.sections.entries()) {
      await tx.questionnaireFormSection.update({ where: { id: section.id }, data: { position: sectionOffset + index } })
    }
    for (const [index, unit] of normalized.units.entries()) {
      if (unit.type === 'form-section') {
        await tx.questionnaireFormSection.update({ where: { id: unit.id }, data: { position: index } })
      } else if (scaleIds.has(unit.id)) {
        await tx.questionnaireScale.update({ where: { id: unit.id }, data: { position: index } })
      }
    }
  })
  return listQuestionnaireContentUnits(questionnaireId)
}

/**
 * Retire an in-progress attempt and create a clean FINAL_ONLY attempt while
 * retaining every historical answer. The caller supplies either the logged-in
 * owner or the already-hashed anonymous resume capability; the check is
 * repeated after the row lock so a restart cannot race another state change.
 */
export const restartQuestionnaireAssessment = async (
  assessmentId: string,
  context: { userId?: string; resumeTokenHash?: string },
) => {
  const existing = await prisma.questionnaireAssessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, userId: true, sessionId: true, resumeTokenHash: true, resumeTokenExpiresAt: true },
  })
  if (!existing) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评记录不存在', 404)
  if (context.userId !== undefined) {
    if (!existing.userId || existing.userId !== context.userId) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限重启此问卷测评', 403)
    }
  } else if (!context.resumeTokenHash || existing.userId !== null || existing.resumeTokenHash !== context.resumeTokenHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '恢复凭证无权重启此问卷测评', 403)
  }

  const questionnaireId = await prisma.questionnaireAssessment.findUnique({ where: { id: assessmentId }, select: { questionnaireId: true } })
  if (!questionnaireId) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评记录不存在', 404)
  const frozenFormSections = await ensureQuestionnaireFormSections(questionnaireId.questionnaireId)

  const created = await prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "questionnaire_assessments" WHERE "id" = ${assessmentId} FOR UPDATE
    `
    if (!lockedRows[0]) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评记录不存在', 404)

    const current = await tx.questionnaireAssessment.findUnique({
      where: { id: assessmentId },
      include: {
        questionnaire: {
          select: {
            id: true,
            questionnaireScales: {
              select: {
                id: true,
                scaleId: true,
                scale: {
                  select: {
                    id: true,
                    code: true,
                    status: true,
                    instrumentClass: true,
                    instrumentVersion: true,
                    definition: true,
                  },
                },
              },
            },
            formItems: { select: { id: true } },
            formSections: { select: { id: true, title: true, description: true, position: true, contextSection: true, items: true } },
          },
        },
        token: { select: { expiresAt: true, isActive: true } },
      },
    })
    if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评记录不存在', 404)
    if (context.userId !== undefined) {
      if (!current.userId || current.userId !== context.userId) {
        throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限重启此问卷测评', 403)
      }
    } else if (!context.resumeTokenHash || current.userId !== null || current.resumeTokenHash !== context.resumeTokenHash) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '恢复凭证无权重启此问卷测评', 403)
    }
    if (current.status !== 'IN_PROGRESS') {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '只有进行中的问卷测评可以重启', 409)
    }
    if (context.resumeTokenHash && (!current.token?.isActive || questionnaireResumeTokenService.isExpired(current.resumeTokenExpiresAt))) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '测评恢复凭证已过期', 401)
    }

    const isPublic = context.userId === undefined
    const newSessionId = isPublic ? uuidv4() : null
    const retiredAt = new Date()
    await tx.questionnaireAssessment.update({
      where: { id: current.id },
      data: { status: 'ABANDONED', completedAt: retiredAt },
    })
    const nextAttemptEpoch = current.attemptEpoch + 1
    const scaleRuntimeSnapshots = await Promise.all(current.questionnaire.questionnaireScales.map(async (entry: any) => {
      if (entry.scale.status !== 'PUBLISHED') throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '问卷中的量表已不再可用', 409)
      const definition = scaleDefinitionFromRecord(entry.scale)
      return {
        entry,
        snapshot: await freezeScaleRuntimeAtAttemptStart(tx as any, {
          instrumentKey: entry.scale.code,
          instrumentVersion: entry.scale.instrumentVersion,
          definition,
        }),
      }
    }))
    const frozenActiveSlotSet = freezeQuestionnaireActiveSlotSet({
      attemptEpoch: nextAttemptEpoch,
      scales: scaleRuntimeSnapshots.map(({ entry, snapshot }) => ({
        questionnaireScaleId: entry.id,
        code: entry.scale.code,
        instrumentVersion: entry.scale.instrumentVersion,
        sourceDefinitionHash: snapshot.sourceDefinitionHash,
        compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash,
      })),
      formSections: frozenFormSections.map((section) => ({
        sectionId: section.id,
        definitionHash: formSectionIdentityHash(section),
      })),
    })
    const next = await tx.questionnaireAssessment.create({
      data: {
        questionnaireId: current.questionnaireId,
        userId: isPublic ? null : context.userId,
        tokenId: isPublic ? current.tokenId : null,
        sessionId: newSessionId,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(frozenActiveSlotSet),
        frozenActiveSlotSetHash: frozenActiveSlotSet.snapshotHash,
        attemptEpoch: nextAttemptEpoch,
        progress: 0,
      },
    })
    if (current.questionnaire.questionnaireScales.length > 0) {
      await tx.assessment.createMany({
        data: scaleRuntimeSnapshots.map(({ entry, snapshot }) => ({
          scaleId: entry.scaleId,
          userId: isPublic ? null : context.userId,
          status: 'IN_PROGRESS' as const,
          deliveryMode: 'FINAL_ONLY' as const,
          runtimeGeneration: 'UNIFIED_V1' as const,
          runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(snapshot),
          compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash,
          attemptEpoch: next.attemptEpoch,
          progress: 0,
          answers: encryptScaleAnswers([]),
          questionnaireAssessmentId: next.id,
        })),
      })
    }
    if (current.questionnaire.formItems.length > 0) {
      await tx.questionnaireFormAnswer.createMany({
        data: current.questionnaire.formItems.map((item) => ({
          questionnaireAssessmentId: next.id,
          formItemId: item.id,
          value: null,
          status: 'PENDING' as const,
        })),
        skipDuplicates: true,
      })
    }
    if (current.questionnaire.formSections.length > 0) {
      await tx.questionnaireFormSectionAttempt.createMany({
        data: current.questionnaire.formSections.map((section) => ({
          questionnaireAssessmentId: next.id,
          sectionId: section.id,
          attemptEpoch: next.attemptEpoch,
        })),
      })
    }

    const resumeToken = isPublic
      ? await questionnaireResumeTokenService.issue(
          next.id,
          current.token?.expiresAt ?? new Date(),
          tx,
        )
      : null
    return { id: next.id, sessionId: newSessionId, resumeToken }
  })

  return {
    ...(await getQuestionnaireFinalAttemptState(created.id)),
    sessionId: created.sessionId,
    resumeToken: created.resumeToken,
  }
}

export const createQuestionnaireFormSection = async (
  questionnaireId: string,
  input: { title?: string; description?: string; position?: number; contextSection?: boolean },
) => {
  await ensureQuestionnaireFormSections(questionnaireId)
  const current = await prisma.questionnaire.findUnique({
    where: { id: questionnaireId },
    select: {
      formItems: { select: { position: true } },
      questionnaireScales: { select: { position: true } },
      formSections: { select: { position: true } },
    },
  })
  if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷不存在', 404)
  const defaultPosition = Math.max(
    -1,
    ...current.formItems.map((item) => item.position),
    ...current.questionnaireScales.map((item) => item.position),
    ...current.formSections.map((section) => section.position),
  ) + 1
  const section = await prisma.questionnaireFormSection.create({
    data: {
      questionnaireId,
      title: input.title?.trim() || '表单',
      description: input.description?.trim() || null,
      position: input.position ?? defaultPosition,
      contextSection: input.contextSection ?? false,
    },
    include: { items: true },
  })
  const mapped = mapQuestionnaireSection(section)
  return { ...mapped, definitionHash: questionnaireFormSectionDefinitionHash(mapped) }
}

export const updateQuestionnaireFormSection = async (
  questionnaireId: string,
  sectionId: string,
  input: { title?: string; description?: string | null; contextSection?: boolean },
) => {
  const existing = await prisma.questionnaireFormSection.findFirst({ where: { id: sectionId, questionnaireId }, include: { items: true } })
  if (!existing) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段不存在', 404)
  if (input.contextSection) {
    const contextItems = existing.items.filter((item) => item.contextKey)
    if (contextItems.length === 0) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '没有人口学字段的区段不能作为上下文区段', 400)
    const questionnaire = await prisma.questionnaire.findUnique({
      where: { id: questionnaireId },
      select: {
        questionnaireScales: { select: { id: true, position: true } },
        formSections: { select: { id: true, position: true } },
      },
    })
    if (!questionnaire || !isFirstQuestionnaireContentSection(questionnaire, sectionId)) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '人口学上下文区段必须是第一个内容区段', 400)
    }
  }
  const updated = await prisma.questionnaireFormSection.update({
    where: { id: sectionId },
    data: {
      ...(input.title === undefined ? {} : { title: input.title.trim() || '表单' }),
      ...(input.description === undefined ? {} : { description: input.description?.trim() || null }),
      ...(input.contextSection === undefined ? {} : { contextSection: input.contextSection }),
    },
    include: { items: true },
  })
  const mapped = mapQuestionnaireSection(updated)
  return { ...mapped, definitionHash: questionnaireFormSectionDefinitionHash(mapped) }
}

export const reorderQuestionnaireFormSections = async (questionnaireId: string, sectionIds: string[]) => {
  const sections = await prisma.questionnaireFormSection.findMany({ where: { questionnaireId }, select: { id: true } })
  if (new Set(sectionIds).size !== sectionIds.length || sections.length !== sectionIds.length || sections.some((section) => !sectionIds.includes(section.id))) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '区段排序列表与问卷内容不一致', 400)
  }
  await prisma.$transaction(async (tx) => {
    const offset = sections.length + 1000
    for (const [index, id] of sectionIds.entries()) {
      await tx.questionnaireFormSection.update({ where: { id }, data: { position: offset + index } })
    }
    for (const [index, id] of sectionIds.entries()) {
      await tx.questionnaireFormSection.update({ where: { id }, data: { position: index } })
    }
  })
  return listQuestionnaireFormSections(questionnaireId)
}

export const reorderQuestionnaireFormSectionItems = async (
  questionnaireId: string,
  sectionId: string,
  itemIds: string[],
) => {
  const section = await prisma.questionnaireFormSection.findFirst({ where: { id: sectionId, questionnaireId }, include: { items: { select: { id: true } } } })
  if (!section || new Set(itemIds).size !== itemIds.length || section.items.length !== itemIds.length || section.items.some((item) => !itemIds.includes(item.id))) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '区段字段排序列表不一致', 400)
  }
  await prisma.$transaction(async (tx) => {
    for (const [index, id] of itemIds.entries()) {
      await tx.questionnaireFormItem.update({ where: { id }, data: { sectionPosition: 1000 + index } })
    }
    for (const [index, id] of itemIds.entries()) {
      await tx.questionnaireFormItem.update({ where: { id }, data: { sectionPosition: index } })
    }
  })
  return listQuestionnaireFormSections(questionnaireId)
}

export const assignQuestionnaireFormItemToSection = async (
  questionnaireId: string,
  sectionId: string,
  itemId: string,
  sectionPosition?: number,
) => {
  const [section, item, questionnaire] = await Promise.all([
    prisma.questionnaireFormSection.findFirst({ where: { id: sectionId, questionnaireId } }),
    prisma.questionnaireFormItem.findFirst({ where: { id: itemId, questionnaireId }, select: { id: true, sectionId: true, contextKey: true } }),
    prisma.questionnaire.findUnique({
      where: { id: questionnaireId },
      select: {
        questionnaireScales: { select: { id: true, position: true } },
        formSections: { select: { id: true, position: true } },
      },
    }),
  ])
  if (!section || !item) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '区段或字段不存在', 404)
  const nextPosition = sectionPosition ?? await prisma.questionnaireFormItem.count({ where: { sectionId } })
  if ((section.contextSection || item.contextKey) && (!questionnaire || !isFirstQuestionnaireContentSection(questionnaire, sectionId))) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '人口学上下文区段必须是第一个内容区段', 400)
  }
  await prisma.$transaction(async (tx) => {
    await tx.questionnaireFormItem.update({ where: { id: itemId }, data: { sectionId, sectionPosition: nextPosition } })
    if (item.contextKey && !section.contextSection) {
      await tx.questionnaireFormSection.update({ where: { id: sectionId }, data: { contextSection: true } })
    }
    if (item.contextKey && item.sectionId && item.sectionId !== sectionId) {
      const remainingContext = await tx.questionnaireFormItem.count({
        where: { sectionId: item.sectionId, contextKey: { not: null }, id: { not: itemId } },
      })
      if (remainingContext === 0) {
        await tx.questionnaireFormSection.update({ where: { id: item.sectionId }, data: { contextSection: false } })
      }
    }
  })
  return listQuestionnaireFormSections(questionnaireId)
}

const lockQuestionnaireAssessment = async (tx: Prisma.TransactionClient, id: string) => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "questionnaire_assessments" WHERE "id" = ${id} FOR UPDATE
  `
  if (!rows[0]) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评记录不存在', 404)
}

const lockQuestionnaireFormSectionAttempt = async (tx: Prisma.TransactionClient, id: string) => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "questionnaire_form_section_attempts" WHERE "id" = ${id} FOR UPDATE
  `
  if (!rows[0]) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段记录不存在', 404)
}

export const normalizeQuestionnaireSectionAnswers = (section: SectionRow, values: SectionSubmitInput['answers']) => {
  const itemMap = new Map(section.items.map((item) => [item.id, item]))
  const provided = new Map<string, string | string[] | null>()
  for (const answer of values) {
    const item = itemMap.get(answer.formItemId)
    if (!item) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '提交中包含不属于该区段的字段', 400)
    if (provided.has(answer.formItemId)) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '同一字段不能重复提交', 400)
    provided.set(answer.formItemId, answer.value)
  }

  const normalized = orderedSectionItems(section.items).map((item) => {
    const value = provided.has(item.id) ? provided.get(item.id)! : null
    if (value === null) {
      if (item.required) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', `${item.label} 为必填项`, 400)
      return { item, normalizedValue: null, storedValue: null, status: 'SKIPPED' as const }
    }
    const validation = validateQuestionnaireFormAnswer(item, value)
    if (validation) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', validation, 400)
    const valueAfterNormalization = normalizeQuestionnaireFormAnswer(item, value) as string | string[]
    const serialized = Array.isArray(valueAfterNormalization) ? JSON.stringify(valueAfterNormalization) : valueAfterNormalization
    return {
      item,
      normalizedValue: valueAfterNormalization,
      storedValue: writeContextFormAnswer(item.contextKey, serialized),
      status: 'ANSWERED' as const,
    }
  })
  return {
    normalized,
    payloadAnswers: normalized.map((entry) => ({ formItemId: entry.item.id, value: entry.normalizedValue })),
  }
}

const contextSnapshotForSection = (
  assessmentId: string,
  section: SectionRow,
  normalized: ReturnType<typeof normalizeQuestionnaireSectionAnswers>['normalized'],
): { id: string; contextSnapshotEncrypted: string | null; contextSnapshotHash: string | null; questionnaire: { formItems: Array<unknown> }; formAnswers: Array<unknown> } => {
  const contextItems = section.items.filter((item) => item.contextKey)
  const contextAnswers = normalized
    .filter((entry) => Boolean(entry.item.contextKey) && entry.storedValue !== null)
    .map((entry) => ({ formItemId: entry.item.id, value: entry.storedValue }))
  return {
    id: assessmentId,
    contextSnapshotEncrypted: null,
    contextSnapshotHash: null,
    questionnaire: { formItems: contextItems },
    formAnswers: contextAnswers,
  }
}

const finalizeQuestionnaireLegacyIfReady = async (assessmentId: string) => withQuestionnaireCompletionTransaction(async (tx) => {
  await lockQuestionnaireAssessment(tx, assessmentId)
  const assessment = await tx.questionnaireAssessment.findUnique({
    where: { id: assessmentId },
    include: {
      questionnaire: {
        include: {
          formItems: true,
          formSections: { include: { items: true } },
          questionnaireScales: { include: { scale: true } },
        },
      },
      scaleAssessments: { include: { scale: true } },
      formAnswers: true,
      formSectionAttempts: true,
    },
  })
  if (!assessment) return null
  if (assessment.status === 'COMPLETED') return { status: assessment.status, progress: assessment.progress, completedAt: assessment.completedAt }
  if (assessment.status !== 'IN_PROGRESS' || assessment.deliveryMode !== 'FINAL_ONLY') return { status: assessment.status, progress: assessment.progress, completedAt: assessment.completedAt }

  const completedScales = assessment.scaleAssessments.filter((child) => child.status === 'COMPLETED').length
  const completedForms = assessment.formSectionAttempts.filter((section) => section.status === 'COMPLETED').length
  const totalUnits = assessment.questionnaire.questionnaireScales.length + assessment.questionnaire.formSections.length
  const completedUnits = completedScales + completedForms
  const progress = totalUnits === 0 ? 100 : Math.min(100, Math.round((completedUnits / totalUnits) * 100))
  if (completedUnits < totalUnits) {
    await tx.questionnaireAssessment.update({ where: { id: assessmentId }, data: { completedScales, completedForms, progress } })
    return { status: 'IN_PROGRESS', progress, completedAt: null }
  }

  const completedAt = new Date()
  const report = buildQuestionnaireCollectionReport(assessment as any)
  await tx.questionnaireAssessment.update({
    where: { id: assessmentId },
    data: {
      status: 'COMPLETED',
      completedScales,
      completedForms,
      progress: 100,
      completedAt,
      totalTime: completedAt.getTime() - assessment.startedAt.getTime(),
      aggregateReport: Prisma.DbNull,
      aggregateReportEncrypted: encryptField(collectionReportForStorage(report)),
    },
  })
  return { status: 'COMPLETED', progress: 100, completedAt }
})

type QuestionnaireCompletionCandidate = {
  id: string
  status: string
  deliveryMode: string
  progress: number
  completedScales: number
  completedForms: number
  attemptEpoch: number
  startedAt: Date
  completedAt: Date | null
  contextSnapshotHash: string | null
  questionnaire: {
    questionnaireScales: Array<{ id: string; scaleId: string }>
    formSections: Array<{ id: string }>
  }
  scaleAssessments: Array<{
    id: string
    scaleId: string
    status: string
    attemptEpoch: number
    submissionId: string | null
    submissionPayloadHash: string | null
  }>
  formSectionAttempts: Array<{
    id: string
    sectionId: string
    status: string
    attemptEpoch: number
    submissionId: string | null
    submissionPayloadHash: string | null
  }>
}

const questionnaireCompletionCandidateSelect = {
  id: true,
  status: true,
  deliveryMode: true,
  progress: true,
  completedScales: true,
  completedForms: true,
  attemptEpoch: true,
  startedAt: true,
  completedAt: true,
  contextSnapshotHash: true,
  questionnaire: {
    select: {
      questionnaireScales: { select: { id: true, scaleId: true } },
      formSections: { select: { id: true } },
    },
  },
  scaleAssessments: {
    select: { id: true, scaleId: true, status: true, attemptEpoch: true, submissionId: true, submissionPayloadHash: true },
  },
  formSectionAttempts: {
    select: { id: true, sectionId: true, status: true, attemptEpoch: true, submissionId: true, submissionPayloadHash: true },
  },
} as const

const loadQuestionnaireCompletionCandidate = async (assessmentId: string) => measureRequestPhase(
  'final_submit_db_query',
  () => prisma.questionnaireAssessment.findUnique({
    where: { id: assessmentId },
    select: questionnaireCompletionCandidateSelect,
  }) as Promise<QuestionnaireCompletionCandidate | null>,
)

const questionnaireCompletionCounts = (candidate: QuestionnaireCompletionCandidate) => {
  const scaleIds = new Set(candidate.questionnaire.questionnaireScales.map((scale) => scale.scaleId))
  const completedScaleIds = new Set(candidate.scaleAssessments
    .filter((child) => scaleIds.has(child.scaleId)
      && child.attemptEpoch === candidate.attemptEpoch
      && child.status === 'COMPLETED')
    .map((child) => child.scaleId))
  const sectionIds = new Set(candidate.questionnaire.formSections.map((section) => section.id))
  const completedSectionIds = new Set(candidate.formSectionAttempts
    .filter((section) => sectionIds.has(section.sectionId)
      && section.attemptEpoch === candidate.attemptEpoch
      && section.status === 'COMPLETED')
    .map((section) => section.sectionId))
  const completedScales = completedScaleIds.size
  const completedForms = completedSectionIds.size
  const totalUnits = scaleIds.size + sectionIds.size
  const completedUnits = completedScales + completedForms
  const progress = totalUnits === 0 ? 100 : Math.min(100, Math.round((completedUnits / totalUnits) * 100))
  return {
    completedScales,
    completedForms,
    totalUnits,
    completedUnits,
    progress,
    ready: totalUnits > 0 && completedUnits >= totalUnits,
  }
}

const questionnaireProgressHint = (current: any, extraSectionId?: string) => {
  const scaleIds = new Set((current.questionnaire.questionnaireScales ?? []).map((scale: any) => scale.scaleId))
  const completedScales = new Set((current.scaleAssessments ?? [])
    .filter((child: any) => scaleIds.has(child.scaleId)
      && child.attemptEpoch === current.attemptEpoch
      && child.status === 'COMPLETED')
    .map((child: any) => child.scaleId)).size
  const sectionIds = new Set((current.questionnaire.formSections ?? []).map((section: any) => section.id))
  const completedFormIds = new Set((current.formSectionAttempts ?? [])
    .filter((section: any) => sectionIds.has(section.sectionId)
      && section.attemptEpoch === current.attemptEpoch
      && section.status === 'COMPLETED')
    .map((section: any) => section.sectionId))
  if (extraSectionId) completedFormIds.add(extraSectionId)
  const completedForms = completedFormIds.size
  const totalUnits = scaleIds.size + sectionIds.size
  const completedUnits = completedScales + completedForms
  const progress = totalUnits === 0 ? 100 : Math.min(100, Math.round((completedUnits / totalUnits) * 100))
  return {
    completedScales,
    completedForms,
    progress,
    terminalCandidate: totalUnits > 0 && completedUnits >= totalUnits,
  }
}

const questionnaireCompletionFingerprint = (candidate: QuestionnaireCompletionCandidate): string => computeSubmissionPayloadHash({
  attemptEpoch: candidate.attemptEpoch,
  contextSnapshotHash: candidate.contextSnapshotHash,
  scales: candidate.scaleAssessments
    .filter((child) => child.attemptEpoch === candidate.attemptEpoch)
    .map((child) => ({
      id: child.id,
      scaleId: child.scaleId,
      attemptEpoch: child.attemptEpoch,
      status: child.status,
      submissionId: child.submissionId,
      submissionPayloadHash: child.submissionPayloadHash,
    }))
    .sort((left, right) => left.id.localeCompare(right.id)),
  formSections: candidate.formSectionAttempts
    .filter((section) => section.attemptEpoch === candidate.attemptEpoch)
    .map((section) => ({
      id: section.id,
      sectionId: section.sectionId,
      status: section.status,
      attemptEpoch: section.attemptEpoch,
      submissionId: section.submissionId,
      submissionPayloadHash: section.submissionPayloadHash,
    }))
    .sort((left, right) => left.id.localeCompare(right.id)),
})

const loadQuestionnaireFinalizationGraph = async (assessmentId: string) => measureRequestPhase(
  'final_submit_db_query',
  () => prisma.questionnaireAssessment.findUnique({
    where: { id: assessmentId },
    include: {
      questionnaire: {
        include: {
          formItems: true,
          formSections: { include: { items: true } },
          questionnaireScales: { include: { scale: true } },
        },
      },
      scaleAssessments: { include: { scale: true } },
      formAnswers: true,
      formSectionAttempts: true,
    },
  }),
)

const finalOnlyRetryBackoff = async (retry: number): Promise<void> => {
  const delayMs = Math.min(25, 5 * (2 ** retry))
  await measureRequestPhase('final_submit_retry_backoff', () => new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs)
  }))
}

const finalizeQuestionnaireFinalOnlyIfReady = async (assessmentId: string) => {
  for (let retry = 0; retry < 3; retry += 1) {
    const candidate = await loadQuestionnaireCompletionCandidate(assessmentId)
    if (!candidate) return null
    if (candidate.status === 'COMPLETED' || candidate.status !== 'IN_PROGRESS') {
      return { status: candidate.status, progress: candidate.progress, completedAt: candidate.completedAt }
    }

    const counts = questionnaireCompletionCounts(candidate)
    if (!counts.ready) {
      const progressResult = await withFinalOnlyCompletionTransaction(async (tx) => {
        await measureRequestPhase('final_submit_row_lock_wait', () => lockQuestionnaireAssessment(tx, assessmentId))
        const current = await tx.questionnaireAssessment.findUnique({
          where: { id: assessmentId },
          select: questionnaireCompletionCandidateSelect,
        }) as QuestionnaireCompletionCandidate | null
        if (!current) return null
        if (current.status !== 'IN_PROGRESS') return { status: current.status, progress: current.progress, completedAt: current.completedAt }
        const currentCounts = questionnaireCompletionCounts(current)
        if (currentCounts.ready) return { needsPreparation: true as const }
        await tx.questionnaireAssessment.update({
          where: { id: assessmentId },
          data: {
            completedScales: currentCounts.completedScales,
            completedForms: currentCounts.completedForms,
            progress: currentCounts.progress,
          },
        })
        return { status: 'IN_PROGRESS', progress: currentCounts.progress, completedAt: null }
      })
      if (progressResult && 'needsPreparation' in progressResult) {
        if (retry < 2) await finalOnlyRetryBackoff(retry)
        continue
      }
      return progressResult
    }

    // Reports and encryption are intentionally outside the parent-row lock.
    const graph = await loadQuestionnaireFinalizationGraph(assessmentId)
    if (!graph) return null
    const report = measureRequestPhaseSync('final_submit_serialization', () => buildQuestionnaireCollectionReport(graph as any))
    const aggregateReportEncrypted = measureRequestPhaseSync(
      'final_submit_encryption',
      () => encryptField(collectionReportForStorage(report)),
    )
    const expectedFingerprint = measureRequestPhaseSync(
      'final_submit_payload_hash',
      () => questionnaireCompletionFingerprint(candidate),
    )

    const completionResult = await withFinalOnlyCompletionTransaction(async (tx) => {
      await measureRequestPhase('final_submit_row_lock_wait', () => lockQuestionnaireAssessment(tx, assessmentId))
      const current = await tx.questionnaireAssessment.findUnique({
        where: { id: assessmentId },
        select: questionnaireCompletionCandidateSelect,
      }) as QuestionnaireCompletionCandidate | null
      if (!current) return null
      if (current.status === 'COMPLETED' || current.status !== 'IN_PROGRESS') {
        return { status: current.status, progress: current.progress, completedAt: current.completedAt }
      }
      const currentFingerprint = measureRequestPhaseSync(
        'final_submit_payload_hash',
        () => questionnaireCompletionFingerprint(current),
      )
      if (currentFingerprint !== expectedFingerprint) return { retry: true as const }
      const currentCounts = questionnaireCompletionCounts(current)
      if (!currentCounts.ready) {
        await tx.questionnaireAssessment.update({
          where: { id: assessmentId },
          data: {
            completedScales: currentCounts.completedScales,
            completedForms: currentCounts.completedForms,
            progress: currentCounts.progress,
          },
        })
        return { status: 'IN_PROGRESS', progress: currentCounts.progress, completedAt: null }
      }
      const completedAt = new Date()
      await tx.questionnaireAssessment.update({
        where: { id: assessmentId },
        data: {
          status: 'COMPLETED',
          completedScales: currentCounts.completedScales,
          completedForms: currentCounts.completedForms,
          progress: 100,
          completedAt,
          totalTime: Math.max(0, completedAt.getTime() - new Date(current.startedAt).getTime()),
          aggregateReport: Prisma.DbNull,
          aggregateReportEncrypted,
        },
      })
      return { status: 'COMPLETED', progress: 100, completedAt }
    })
    if (completionResult && 'retry' in completionResult) {
      if (retry < 2) await finalOnlyRetryBackoff(retry)
      continue
    }
    return completionResult
  }

  const latest = await loadQuestionnaireCompletionCandidate(assessmentId)
  return latest ? { status: latest.status, progress: latest.progress, completedAt: latest.completedAt } : null
}

const finalizeQuestionnaireIfReady = async (assessmentId: string) => {
  const route = await prisma.questionnaireAssessment.findUnique({
    where: { id: assessmentId },
    select: { deliveryMode: true, runtimeGeneration: true },
  })
  if (route?.runtimeGeneration === 'UNIFIED_V1') {
    const { finalizeQuestionnaireAttemptUnifiedIfReady } = await import('../modules/assessment-runtime/unified-aggregate-finalizer.service')
    return finalizeQuestionnaireAttemptUnifiedIfReady(assessmentId)
  }
  if (!route || route.deliveryMode !== 'FINAL_ONLY') return finalizeQuestionnaireLegacyIfReady(assessmentId)
  return finalizeQuestionnaireFinalOnlyIfReady(assessmentId)
}

const submitQuestionnaireFormSectionFinalImpl = async (input: SectionSubmitInput) => {
  const submissionId = validateSubmissionId(input.submissionId)
  const route = await measureRequestPhase('final_submit_admission', () => prisma.questionnaireAssessment.findUnique({
    where: { id: input.questionnaireAssessmentId },
    select: { id: true, runtimeGeneration: true },
  }))
  if (!route) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评记录不存在', 404)
  if (route.runtimeGeneration === 'UNIFIED_V1') {
    const { submitUnifiedQuestionnaireFormSectionFinal } = await import('../modules/assessment-runtime/unified-form-section-final-submit.service')
    return submitUnifiedQuestionnaireFormSectionFinal(input)
  }
  const assessment = await measureRequestPhase('final_submit_admission', () => prisma.questionnaireAssessment.findUnique({
    where: { id: input.questionnaireAssessmentId },
    select: {
      id: true,
      questionnaireId: true,
      userId: true,
      sessionId: true,
      status: true,
      deliveryMode: true,
      runtimeGeneration: true,
      attemptEpoch: true,
      completedScales: true,
      completedForms: true,
      contextSnapshotEncrypted: true,
      contextSnapshotHash: true,
      frozenActiveSlotSetEncrypted: true,
      frozenActiveSlotSetHash: true,
      resumeTokenHash: true,
      formSectionAttempts: {
        where: { sectionId: input.sectionId },
        select: { sectionId: true, status: true, attemptEpoch: true },
      },
      questionnaire: {
        select: {
          questionnaireScales: { select: { id: true, position: true } },
          formSections: { orderBy: { position: 'asc' }, include: { items: true } },
        },
      },
    },
  }))
  if (!assessment) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评记录不存在', 404)
  if (input.userId !== null && input.userId !== undefined) {
    if (assessment.userId !== input.userId) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限操作此问卷测评', 403)
  } else if (!input.sessionId || assessment.sessionId !== input.sessionId || assessment.userId !== null || !input.resumeTokenHash || assessment.resumeTokenHash !== input.resumeTokenHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '恢复凭证无权操作此问卷测评', 403)
  }
  assertFinalOnly(assessment.deliveryMode)
  assertAttemptEpoch(assessment.attemptEpoch, input.attemptEpoch)
  assertFinalSubmitStatus(assessment.status, '问卷测评')
  const admissionSectionAttempt = assessment.formSectionAttempts[0]
  if (admissionSectionAttempt) {
    assertFinalSubmitStatus(admissionSectionAttempt.status, '表单区段')
    assertAttemptEpoch(admissionSectionAttempt.attemptEpoch, input.attemptEpoch)
  }
  if (assessment.status === 'COMPLETED' && admissionSectionAttempt?.status !== 'COMPLETED') {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评已结束，请重启后重新作答', 409)
  }
  const section = assessment.questionnaire.formSections.find((candidate) => candidate.id === input.sectionId)
  if (!section) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段不存在', 404)
  const mappedSection = mapQuestionnaireSection(section)
  const actualDefinitionHash = measureRequestPhaseSync(
    'final_submit_definition_prepare',
    () => questionnaireFormSectionDefinitionHash(mappedSection),
  )
  assertDefinitionHash(actualDefinitionHash, input.definitionHash)
  if (mappedSection.contextSection && !isFirstQuestionnaireContentSection(assessment.questionnaire, mappedSection.id)) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '人口学上下文区段必须是第一个内容区段', 409)
  }
  const questionnaireHasContext = assessment.questionnaire.formSections.some(sectionHasContext)
  if (questionnaireHasContext && !mappedSection.contextSection && !assessment.contextSnapshotHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '请先完成并提交人口学上下文区段', 409)
  }
  if ((input.contextSnapshotHash ?? null) !== (assessment.contextSnapshotHash ?? null)) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷上下文版本已变化，请重试', 409)
  }
  const normalizedResult = measureRequestPhaseSync(
    'final_submit_payload_validation',
    () => normalizeQuestionnaireSectionAnswers(mappedSection, input.answers),
  )
  const canonical = measureRequestPhaseSync('final_submit_non_db_compute', () => (
    measureRequestPhaseSync('final_submit_serialization', () => (
      measureRequestPhaseSync('final_submit_payload_hash', () => prepareCanonicalSubmission({ answers: normalizedResult.payloadAnswers }))
    ))
  ))
  assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.formSection, '问卷区段提交数据')
  const payloadHash = canonical.hash

  let sectionAttempt = await prisma.questionnaireFormSectionAttempt.findUnique({
    where: { questionnaireAssessmentId_sectionId: { questionnaireAssessmentId: assessment.id, sectionId: mappedSection.id } },
  })
  if (!sectionAttempt) {
    try {
      sectionAttempt = await prisma.questionnaireFormSectionAttempt.create({
        data: { questionnaireAssessmentId: assessment.id, sectionId: mappedSection.id, attemptEpoch: input.attemptEpoch },
      })
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error
      sectionAttempt = await prisma.questionnaireFormSectionAttempt.findUnique({
        where: { questionnaireAssessmentId_sectionId: { questionnaireAssessmentId: assessment.id, sectionId: mappedSection.id } },
      })
    }
  }
  if (!sectionAttempt) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段记录不存在', 404)

  const committed = await withFinalOnlyCompletionTransaction(async (tx) => {
    await measureRequestPhase('final_submit_row_lock_wait', () => lockQuestionnaireFormSectionAttempt(tx, sectionAttempt!.id))
    await lockQuestionnaireAssessment(tx, assessment.id)
    const current = await tx.questionnaireAssessment.findUnique({
      where: { id: assessment.id },
      select: {
        id: true,
        status: true,
        deliveryMode: true,
        attemptEpoch: true,
        completedScales: true,
        completedForms: true,
        contextSnapshotEncrypted: true,
        contextSnapshotHash: true,
        questionnaire: {
          select: {
            questionnaireScales: { select: { scaleId: true } },
            formSections: { select: { id: true, contextSection: true, items: { select: { contextKey: true } } } },
          },
        },
        scaleAssessments: { select: { scaleId: true, status: true, attemptEpoch: true } },
        formSectionAttempts: { select: { sectionId: true, status: true, attemptEpoch: true } },
      },
    })
    if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评记录不存在', 404)
    assertFinalOnly(current.deliveryMode)
    assertAttemptEpoch(current.attemptEpoch, input.attemptEpoch)
    assertFinalSubmitStatus(current.status, '问卷测评')

    const lockedSectionAttempt = await tx.questionnaireFormSectionAttempt.findUnique({ where: { id: sectionAttempt!.id } })
    if (!lockedSectionAttempt) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段记录不存在', 404)
    assertAttemptEpoch(lockedSectionAttempt.attemptEpoch, input.attemptEpoch)
    const currentHasContext = current.questionnaire.formSections.some(sectionHasContext)
    if (currentHasContext && !mappedSection.contextSection && !current.contextSnapshotHash) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '请先完成并提交人口学上下文区段', 409)
    }
    if ((input.contextSnapshotHash ?? null) !== (current.contextSnapshotHash ?? null)) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷上下文版本已变化，请重试', 409)
    }
    const replay = assertSubmissionReplay(lockedSectionAttempt, submissionId, payloadHash)
    if (replay === 'replay' && lockedSectionAttempt.status === 'COMPLETED') {
      const hint = questionnaireProgressHint(current)
      await tx.questionnaireAssessment.updateMany({
        where: { id: assessment.id, status: 'IN_PROGRESS' },
        data: { completedScales: hint.completedScales, completedForms: hint.completedForms, progress: hint.progress },
      })
      return {
        replayed: true,
        sectionAttemptId: lockedSectionAttempt.id,
        contextSnapshotHash: current.contextSnapshotHash,
        progress: hint.progress,
        terminalCandidate: hint.terminalCandidate,
      }
    }
    if (current.status !== 'IN_PROGRESS') throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评已结束', 409)
    if (lockedSectionAttempt.status !== 'IN_PROGRESS') throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段已结束', 409)

    const itemIds = normalizedResult.normalized.map((entry) => entry.item.id)
    const existingAnswers = await tx.questionnaireFormAnswer.findMany({
      where: { questionnaireAssessmentId: assessment.id, formItemId: { in: itemIds } },
      select: { formItemId: true, revision: true },
    })
    const revisions = new Map(existingAnswers.map((answer) => [answer.formItemId, answer.revision]))
    const mutations: BulkFormAnswerMutation[] = normalizedResult.normalized.map((entry) => ({
      formItemId: entry.item.id,
      formSectionAttemptId: lockedSectionAttempt.id,
      value: entry.storedValue,
      status: entry.status,
      revision: (revisions.get(entry.item.id) ?? -1) + 1,
    }))
    await persistFormAnswerBatch(tx, assessment.id, mutations)
    const updatedSection = await tx.questionnaireFormSectionAttempt.updateMany({
      where: { id: lockedSectionAttempt.id, status: 'IN_PROGRESS', attemptEpoch: input.attemptEpoch },
      data: { status: 'COMPLETED', submissionId, submissionPayloadHash: payloadHash, submittedAt: new Date() },
    })
    if (updatedSection.count !== 1) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段状态已变化，请重试', 409)

    const hint = questionnaireProgressHint(current, mappedSection.id)
    await tx.questionnaireAssessment.updateMany({
      where: { id: assessment.id, status: 'IN_PROGRESS' },
      data: { completedScales: hint.completedScales, completedForms: hint.completedForms, progress: hint.progress },
    })

    let contextSnapshotHash = current.contextSnapshotHash
    if (mappedSection.contextSection && !current.contextSnapshotHash) {
      try {
        const frozen = await measureRequestPhase('final_submit_context_read', () => freezeQuestionnaireAssessmentContextFromSnapshot(
          tx,
          contextSnapshotForSection(assessment.id, mappedSection, normalizedResult.normalized),
        ))
        contextSnapshotHash = frozen.hash
      } catch (error) {
        if (isAssessmentContextServiceError(error)) {
          throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', error.message, error.statusCode)
        }
        throw error
      }
    }
    return {
      replayed: false,
      sectionAttemptId: lockedSectionAttempt.id,
      contextSnapshotHash,
      progress: hint.progress,
      payloadHash,
      terminalCandidate: hint.terminalCandidate,
    }
  })

  const { terminalCandidate: shouldFinalize, ...response } = committed
  return {
    submissionId,
    sectionId: input.sectionId,
    ...response,
    shouldFinalize,
    finalizeQuestionnaireAssessmentId: shouldFinalize ? assessment.id : null,
  }
}

const finalizeQuestionnaireAfterUnitSubmit = async <T>(result: T): Promise<any> => {
  if (!result || typeof result !== 'object' || !('shouldFinalize' in (result as object))) return result
  const record = result as T & {
    shouldFinalize?: boolean
    finalizeQuestionnaireAssessmentId?: string | null
    progress?: number
  }
  const { shouldFinalize, finalizeQuestionnaireAssessmentId, ...response } = record as any
  const parent = shouldFinalize && finalizeQuestionnaireAssessmentId
    ? await measureRequestPhase('final_submit_parent_finalization', () => finalizeQuestionnaireIfReady(finalizeQuestionnaireAssessmentId))
    : { status: 'IN_PROGRESS', progress: response.progress ?? 0, completedAt: null }
  return { ...response, parent }
}

export const submitQuestionnaireFormSectionFinalForUser = async (
  assessmentId: string,
  userId: string,
  input: Omit<SectionSubmitInput, 'questionnaireAssessmentId' | 'userId' | 'sessionId'>,
) => finalizeQuestionnaireAfterUnitSubmit(
  await withUnitSubmitAdmission(() => submitQuestionnaireFormSectionFinalImpl({ ...input, questionnaireAssessmentId: assessmentId, userId })),
)

export const submitQuestionnaireFormSectionFinalForPublic = async (
  sessionId: string,
  input: Omit<SectionSubmitInput, 'questionnaireAssessmentId' | 'userId' | 'sessionId'>,
  resumeTokenHash: string,
) => {
  const result = await withUnitSubmitAdmission(async () => {
    const assessment = await prisma.questionnaireAssessment.findUnique({ where: { sessionId }, select: { id: true } })
    if (!assessment) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评记录不存在', 404)
    return submitQuestionnaireFormSectionFinalImpl({ ...input, questionnaireAssessmentId: assessment.id, userId: null, sessionId, resumeTokenHash })
  })
  return finalizeQuestionnaireAfterUnitSubmit(result)
}

export const finalizeQuestionnaireAttemptIfReady = finalizeQuestionnaireIfReady
