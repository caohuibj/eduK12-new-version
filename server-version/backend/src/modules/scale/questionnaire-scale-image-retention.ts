import type { AssetDatabase } from '../../services/assetStorage'
import type { VersionedFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { retainFrozenScaleAssessmentImages } from './scale-image-retention'

export const retainQuestionnaireScaleAssessmentImages = async (input: {
  questionnaireAssessmentId: string
  snapshots: Array<{
    scaleId: string
    snapshot: VersionedFrozenScaleRuntimeSnapshot
  }>
  db: AssetDatabase
}): Promise<void> => {
  const children = await input.db.assessment.findMany({
    where: { questionnaireAssessmentId: input.questionnaireAssessmentId },
    select: { id: true, scaleId: true },
  })
  const byScaleId = new Map(input.snapshots.map((entry) => [entry.scaleId, entry.snapshot]))
  if (children.length !== input.snapshots.length) {
    throw new Error('Questionnaire frozen Scale children do not match runtime snapshots')
  }
  for (const child of children) {
    const snapshot = byScaleId.get(child.scaleId)
    if (!snapshot) throw new Error('Questionnaire frozen Scale child does not match runtime snapshot')
    await retainFrozenScaleAssessmentImages({
      assessmentId: child.id,
      snapshot,
      db: input.db,
    })
  }
}
