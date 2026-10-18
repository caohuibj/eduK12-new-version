import { inAssetTransaction, lockStoredAssetRows, type AssetDatabase } from '../../services/assetStorage'
import type { VersionedFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { retainFrozenScaleAssessmentImages, scaleAssessmentMediaReferences } from './scale-image-retention'

export const retainQuestionnaireScaleAssessmentImages = async (input: {
  questionnaireAssessmentId: string
  snapshots: Array<{
    scaleId: string
    snapshot: VersionedFrozenScaleRuntimeSnapshot
  }>
  db: AssetDatabase
}): Promise<void> => {
  await inAssetTransaction(input.db, async db => {
    const children = await db.assessment.findMany({
      where: { questionnaireAssessmentId: input.questionnaireAssessmentId },
      select: { id: true, scaleId: true },
    })
    const byScaleId = new Map(input.snapshots.map((entry) => [entry.scaleId, entry.snapshot]))
    if (children.length !== input.snapshots.length) {
      throw new Error('Questionnaire frozen Scale children do not match runtime snapshots')
    }
    const entries = children.map(child => {
      const snapshot = byScaleId.get(child.scaleId)
      if (!snapshot) throw new Error('Questionnaire frozen Scale child does not match runtime snapshot')
      return { child, snapshot }
    })
    // Prelock all child snapshots, including video/poster/captions, before the
    // first child retain. Per-snapshot ordering cannot establish a parent order.
    await lockStoredAssetRows(db, entries.flatMap(({ snapshot }) =>
      scaleAssessmentMediaReferences(snapshot.definition).map(reference => reference.assetId)))
    for (const { child, snapshot } of entries) {
      await retainFrozenScaleAssessmentImages({ assessmentId: child.id, snapshot, db })
    }
  })
}
