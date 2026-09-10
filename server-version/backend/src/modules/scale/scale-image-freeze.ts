import type { AssetDatabase } from '../../services/assetStorage'
import type { FrozenScaleRuntimeSnapshotV1 } from '../assessment-runtime/runtime-snapshot'
import { retainScaleAssessmentImages } from './scale-image-retention'

export const retainFrozenScaleSnapshotImages = async (input: {
  ownerId: string
  snapshot: FrozenScaleRuntimeSnapshotV1
  db: AssetDatabase
}): Promise<void> => retainScaleAssessmentImages({
  owner: {
    entityType: 'AssessmentFrozenRuntime',
    entityId: input.ownerId,
    field: 'media',
  },
  definition: input.snapshot.definition,
  db: input.db,
})
