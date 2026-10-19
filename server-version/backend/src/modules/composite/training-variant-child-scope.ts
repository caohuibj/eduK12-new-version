import { prisma } from '../../config/database'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { applyTrainingAttemptScope, resolveTrainingAttemptScope } from './training-variant-scope'
import { resolveTrainingFlowScope, trainingFlowMarkerState } from './training-flow-scope'
import { trainingFlowItemKey, trainingFlowUnitKey } from '../assessment-core/flow/training'
import { compositeItemSlotKey, formSectionSlotKey } from '../assessment-runtime/slot-set'

import {
  TRAINING_VARIANT_DEFINITION_MARKER_SELECT,
  TRAINING_VARIANT_PARENT_MARKER_SELECT,
  trainingVariantMarkerState,
} from './training-variant-markers'
export {
  TRAINING_VARIANT_DEFINITION_MARKER_SELECT,
  TRAINING_VARIANT_PARENT_MARKER_SELECT,
  trainingVariantMarkerState,
} from './training-variant-markers'

const requireKnownMarkers = (parent: any): void => {
  if (trainingVariantMarkerState(parent) === 'UNKNOWN') {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '概率分卷标志投影不完整', 409)
  }
}
const graphComplete = (parent: any): boolean => Array.isArray(parent.compositeAssessment?.items)
  && Array.isArray(parent.compositeAssessment?.formSections)
const loadedParents = new WeakMap<object, any>()

/** Request-local reuse only; no credential, grant or course authorization is changed. */
export const loadTrainingChildParent = async (attemptId: string, parent?: any, db: any = prisma): Promise<any> => {
  if (parent && parent.id !== attemptId) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '子单元与上级测评身份不匹配', 409)
  const cached = parent && loadedParents.get(parent)
  if (cached) return cached
  let loaded = trainingVariantMarkerState(parent) !== 'UNKNOWN' ? parent : await db.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId }, select: { ...TRAINING_VARIANT_PARENT_MARKER_SELECT, userId: true, recoveryTokenHash: true },
  })
  if (!loaded) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评记录不存在', 404)
  requireKnownMarkers(loaded)
  if (trainingVariantMarkerState(loaded) === 'VARIANT' && !graphComplete(loaded)) {
    loaded = await db.compositeAssessmentAttempt.findUnique({
      where: { id: attemptId },
      include: { compositeAssessment: { include: { items: true, formSections: { include: { items: true } } } } },
    })
    if (!loaded) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评记录不存在', 404)
    requireKnownMarkers(loaded)
  }
  if (parent) loadedParents.set(parent, loaded)
  return loaded
}

/** Authorize before resolving a flow, which can expand accepted answer facts. */
export const assertTrainingFormFinalPrincipal = (
  parent: any,
  input: { userId?: string | null; recoveryTokenHash?: string },
): void => {
  if (input.userId != null && parent?.userId === input.userId) return
  if (input.userId == null && parent?.userId === null && input.recoveryTokenHash
    && parent.recoveryTokenHash === input.recoveryTokenHash) return
  throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限操作此综合测评', 403)
}

/** Only explicit, complete null markers permit the unchanged legacy fast path. */
export const requiresTrainingFlowFinalLock = (attemptId: string | null | undefined, parent: any): boolean => {
  if (!attemptId) return false
  const known = parent && (loadedParents.get(parent) ?? parent)
  if (known?.id !== attemptId) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '子单元与上级测评身份不匹配', 409)
  requireKnownMarkers(known)
  return trainingFlowMarkerState(known) === 'FLOW'
}

type TrainingFlowFinalTarget = {
  attemptId?: string | null
  parent?: any
  attemptEpoch: number
  itemId?: string | null
  sectionId?: string
  sourceAttemptId: string
  submissionId: string
  /** The SJT path already holds this parent lock, including for legacy rows. */
  parentLocked?: boolean
}

/** Parent -> child -> outbox. Never reuse a pre-lock graph or fact projection.
 * Call the returned assertion after the child's existing replay validation and
 * before its first mutation. Historical accepted units are replay-only.
 */
export const lockTrainingFlowFinalAdmission = async (
  tx: any,
  input: TrainingFlowFinalTarget,
): Promise<(replayed: boolean) => void> => {
  if (!requiresTrainingFlowFinalLock(input.attemptId, input.parent)) return () => undefined
  if (!input.parentLocked) {
    const rows = await tx.$queryRaw`SELECT "id" FROM "composite_assessment_attempts" WHERE "id" = ${input.attemptId} FOR UPDATE`
    if (!rows[0]) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评记录不存在', 404)
  }
  const parent = await tx.compositeAssessmentAttempt.findUnique({
    where: { id: input.attemptId },
    include: { compositeAssessment: { include: { items: true, formSections: { include: { items: true } } } } },
  })
  if (!parent) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评记录不存在', 404)
  requireKnownMarkers(parent)
  if (parent.id !== input.attemptId || parent.attemptEpoch !== input.attemptEpoch || trainingFlowMarkerState(parent) !== 'FLOW') {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '流程测评来源或轮次已变化', 409)
  }
  const scope = await resolveTrainingFlowScope(parent, parent.compositeAssessment, { db: tx })
  if (!scope) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '流程来源缺失', 409)
  const item = !input.sectionId && parent.compositeAssessment.items.find((candidate: any) => candidate.id === input.itemId && candidate.type !== 'FORM')
  const section = input.sectionId && parent.compositeAssessment.formSections.find((candidate: any) => candidate.id === input.sectionId)
  if (!item && !section) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '流程单元不存在', 404)
  const key = section ? trainingFlowUnitKey(section.id) : trainingFlowItemKey(item.id)
  const slotKey = section ? formSectionSlotKey(section.id) : compositeItemSlotKey(item.id, item.type)
  return (replayed: boolean): void => {
    if (replayed) {
      const accepted = scope.snapshots.find((row: any) => row.slotKey === slotKey)
      if (scope.executedSlotKeys.has(slotKey) && accepted?.sourceAttemptId === input.sourceAttemptId
        && accepted.sourceSubmissionId === input.submissionId) return
    } else if (parent.status === 'IN_PROGRESS' && !scope.terminal && scope.path.currentInstrumentKey === key
      && scope.reachedSlotKeys.has(slotKey) && !scope.executedSlotKeys.has(slotKey)) return
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '当前流程不允许提交此测评单元', 409)
  }
}

const scopedParent = async (parent: any, db: any): Promise<{ parent: any; scope: Awaited<ReturnType<typeof resolveTrainingAttemptScope>> | null }> => {
  requireKnownMarkers(parent)
  if (trainingVariantMarkerState(parent) === 'LEGACY') return { parent, scope: null }
  const projected = await applyTrainingAttemptScope(parent, { db })
  return { parent: projected, scope: projected.trainingVariantScope }
}

export const assertTrainingChildSelected = async (
  child: { compositeAttemptId?: string | null; compositeItemId?: string | null; compositeAttempt?: any },
  options: { parent?: any; db?: any } = {},
): Promise<any | undefined> => {
  if (!child.compositeAttemptId) return undefined
  const db = options.db ?? prisma
  const loaded = await loadTrainingChildParent(child.compositeAttemptId, options.parent ?? child.compositeAttempt, db)
  const resolved = await scopedParent(loaded, db)
  if (resolved.scope && (!child.compositeItemId || !resolved.scope.itemIds.has(child.compositeItemId))) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '当前分组未包含此测评单元', 404)
  }
  return resolved.parent
}

export const assertTrainingSectionSelected = async (
  attemptId: string,
  sectionId: string,
  options: { parent?: any; db?: any } = {},
): Promise<any> => {
  const db = options.db ?? prisma
  const loaded = await loadTrainingChildParent(attemptId, options.parent, db)
  const resolved = await scopedParent(loaded, db)
  if (resolved.scope && !resolved.scope.sectionIds.has(sectionId)) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '当前分组未包含此表单区段', 404)
  }
  return resolved.parent
}

/** Original narrow context query is retained only for a fresh child admission. */
export const loadTrainingChildAdmissionParent = async (attemptId: string, parent?: any, db: any = prisma): Promise<any> => {
  if (trainingVariantMarkerState(parent) !== 'UNKNOWN' && parent?.contextSnapshotHash !== undefined
    && Array.isArray(parent.compositeAssessment?.formSections)) return parent
  const loaded = await db.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      ...TRAINING_VARIANT_PARENT_MARKER_SELECT,
      userId: true, recoveryTokenHash: true, assignmentRef: true, trainingTimingSnapshot: true,
      runtimeGeneration: true, deliveryMode: true, attemptEpoch: true,
      contextSnapshotEncrypted: true, contextSnapshotHash: true,
      frozenActiveSlotSetEncrypted: true, frozenActiveSlotSetHash: true,
      compositeAssessment: { select: {
        ...TRAINING_VARIANT_DEFINITION_MARKER_SELECT,
        productKind: true, reportPackageKey: true, analysisProtocolKey: true,
        formSections: { select: { contextSection: true, items: { select: { contextKey: true } } } },
      } },
    },
  })
  if (!loaded) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评记录不存在', 404)
  requireKnownMarkers(loaded)
  return loaded
}
