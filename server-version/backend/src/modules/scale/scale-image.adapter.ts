import {serveAssessmentMaterial} from '../assessment-media/material-delivery'
import {scaleStimulusMaterialReferences} from './scale-image-retention'
import type { Response } from 'express'
import type { AssetDatabase } from '../../services/assetStorage'
import { findFrozenAssessmentAssetReference } from '../assessment-media/assessment-asset'
import { serveAssessmentImageContent } from '../assessment-media/assessment-image-delivery'
import type { ScaleDefinitionV2 } from './scale-definition'

export {
  assertScaleAssessmentImagesReady,
  frozenScaleMediaOwner,
  publishedScaleMediaOwner,
  retainFrozenScaleAssessmentImages,
  retainScaleAssessmentImages,
  scaleAssessmentImageReferences,
} from './scale-image-retention'

import { scaleAssessmentImageReferences } from './scale-image-retention'

export const serveFrozenScaleAssessmentImage = async (input: {
  snapshot: { definition: ScaleDefinitionV2 }
  assetId: string
  res: Response
  db?: AssetDatabase
}): Promise<void> => {
  const material=scaleStimulusMaterialReferences(input.snapshot.definition).find(reference=>reference.assetId===input.assetId)
  if(material){await serveAssessmentMaterial(material,input.res,input.db);return}
  const reference = findFrozenAssessmentAssetReference(
    scaleAssessmentImageReferences(input.snapshot.definition),
    input.assetId,
  )
  if (!reference) throw new Error('Assessment image is not referenced by the frozen Scale runtime')
  await serveAssessmentImageContent({ reference, res: input.res, db: input.db })
}
