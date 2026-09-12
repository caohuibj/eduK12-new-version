import type { FinalDraftMeta } from '../../services/persistence/finalDraftStore'
import { requiredVideoCompletionFromMeta, type RequiredVideoCompletionIdentity } from '../assessment-media/required-video-completion'
import { scaleItemVideoPresentation } from '../assessment-media/video-adapter'

export interface ScaleVideoItemLike {
  itemCode: string
  video?: unknown
}

export const scaleRequiredVideoSlotKey = (itemCode: string) => `scale-item:${itemCode}:video`

export const scaleRequiredVideoCompletionIdentity = (
  draftKey: string,
  item: ScaleVideoItemLike,
): RequiredVideoCompletionIdentity | null => {
  const presentation = scaleItemVideoPresentation(item)
  if (!presentation) return null
  return {
    draftKey,
    slotKey: scaleRequiredVideoSlotKey(item.itemCode),
    assetId: presentation.video.assetId,
    contentHash: presentation.video.contentHash,
  }
}

export const hasScaleRequiredVideoCompletion = (
  meta: FinalDraftMeta,
  draftKey: string,
  item: ScaleVideoItemLike,
): boolean => {
  const identity = scaleRequiredVideoCompletionIdentity(draftKey, item)
  return !identity || Boolean(requiredVideoCompletionFromMeta(meta, identity))
}
