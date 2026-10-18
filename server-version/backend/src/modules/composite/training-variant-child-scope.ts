import { prisma } from '../../config/database'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { applyTrainingAttemptScope, resolveTrainingAttemptScope } from './training-variant-scope'

/** Included in the existing owner/child read. Null markers do not load a union. */
export const TRAINING_VARIANT_DEFINITION_MARKER_SELECT = {
  trainingVariantDraft: true, trainingVariantFrozen: true, trainingVariantDigest: true,
} as const
export const TRAINING_VARIANT_PARENT_MARKER_SELECT = {
  id: true, trainingVariantAllocationEncrypted: true, trainingVariantAllocationHash: true,
  compositeAssessment: { select: TRAINING_VARIANT_DEFINITION_MARKER_SELECT },
} as const

const markerComplete = (parent: any): boolean => Boolean(parent
  && ['trainingVariantAllocationEncrypted', 'trainingVariantAllocationHash'].every(key => Object.prototype.hasOwnProperty.call(parent, key))
  && ['trainingVariantDraft', 'trainingVariantFrozen', 'trainingVariantDigest'].every(key => Object.prototype.hasOwnProperty.call(parent.compositeAssessment ?? {}, key)))
const variantPresent = (parent: any): boolean => parent.trainingVariantAllocationEncrypted != null
  || parent.trainingVariantAllocationHash != null || parent.compositeAssessment?.trainingVariantDraft != null
  || parent.compositeAssessment?.trainingVariantFrozen != null || parent.compositeAssessment?.trainingVariantDigest != null
const graphComplete = (parent: any): boolean => Array.isArray(parent.compositeAssessment?.items)
  && Array.isArray(parent.compositeAssessment?.formSections)
const loadedParents = new WeakMap<object, any>()

/** Request-local reuse only; no credential, grant or course authorization is changed. */
export const loadTrainingChildParent = async (attemptId: string, parent?: any, db: any = prisma): Promise<any> => {
  if (parent && parent.id !== attemptId) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '子单元与上级测评身份不匹配', 409)
  const cached = parent && loadedParents.get(parent)
  if (cached) return cached
  let loaded = markerComplete(parent) ? parent : await db.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId }, select: TRAINING_VARIANT_PARENT_MARKER_SELECT,
  })
  if (!loaded) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评记录不存在', 404)
  if (variantPresent(loaded) && !graphComplete(loaded)) {
    loaded = await db.compositeAssessmentAttempt.findUnique({
      where: { id: attemptId },
      include: { compositeAssessment: { include: { items: true, formSections: { include: { items: true } } } } },
    })
    if (!loaded) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评记录不存在', 404)
  }
  if (parent) loadedParents.set(parent, loaded)
  return loaded
}

const scopedParent = async (parent: any, db: any): Promise<{ parent: any; scope: Awaited<ReturnType<typeof resolveTrainingAttemptScope>> | null }> => {
  if (!variantPresent(parent)) return { parent, scope: null }
  const scope = await resolveTrainingAttemptScope(parent, parent.compositeAssessment, db)
  return { parent: await applyTrainingAttemptScope(parent, db), scope }
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
  if (parent?.contextSnapshotHash !== undefined && Array.isArray(parent.compositeAssessment?.formSections)) return parent
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
  return loaded
}
