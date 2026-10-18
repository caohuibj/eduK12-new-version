import { prisma } from '../../config/database'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { applyTrainingAttemptScope, resolveTrainingAttemptScope } from './training-variant-scope'

/** A request-local parent can be shared by admission, context and media checks. */
export const loadTrainingChildParent = async (attemptId: string, parent?: any, db: any = prisma): Promise<any> => {
  if (parent && parent.id !== attemptId) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '子单元与上级测评身份不匹配', 409)
  }
  const complete = parent && Object.prototype.hasOwnProperty.call(parent, 'trainingVariantAllocationEncrypted')
    && Object.prototype.hasOwnProperty.call(parent.compositeAssessment ?? {}, 'trainingVariantFrozen')
  const loaded = (complete ? parent : undefined) ?? await db.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    include: {
      compositeAssessment: {
        include: { items: true, formSections: { include: { items: true } } },
      },
    },
  })
  if (!loaded) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评记录不存在', 404)
  return loaded
}

const scopedParent = async (parent: any, db: any): Promise<{ parent: any; scope: Awaited<ReturnType<typeof resolveTrainingAttemptScope>> | null }> => {
  // Explicit null preserves historical, unallocated attempts. Real callers load
  // the full parent graph; legacy structural test doubles omit these new fields.
  if (parent.compositeAssessment?.trainingVariantFrozen == null
    && parent.compositeAssessment?.trainingVariantDigest == null
    && parent.compositeAssessment?.trainingVariantDraft == null
    && parent.trainingVariantAllocationEncrypted == null
    && parent.trainingVariantAllocationHash == null) return { parent, scope: null }
  const scope = await resolveTrainingAttemptScope(parent, parent.compositeAssessment, db)
  return { parent: await applyTrainingAttemptScope(parent, db), scope }
}

export const assertTrainingChildSelected = async (
  child: { compositeAttemptId?: string | null; compositeItemId?: string | null },
  options: { parent?: any; db?: any } = {},
): Promise<any | undefined> => {
  if (!child.compositeAttemptId) return undefined
  const db = options.db ?? prisma
  const loaded = await loadTrainingChildParent(child.compositeAttemptId, options.parent, db)
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
