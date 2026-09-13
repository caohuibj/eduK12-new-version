import { requiredVideoCompletionFromMeta } from '../../modules/assessment-media/required-video-completion'
import { formOptionVideoPresentations, scaleItemVideoPresentation } from '../../modules/assessment-media/video-adapter'
import type { FinalDraftMeta } from '../../services/persistence/finalDraftStore'

export class QuestionnaireRequiredVideoCompletionError extends Error {
  readonly itemKey: string

  constructor(itemKey: string, message: string) {
    super(message)
    this.name = 'QuestionnaireRequiredVideoCompletionError'
    this.itemKey = itemKey
  }
}

export const formItemVideoSlotPrefix = (itemId: string) => `form-item:${itemId}:video`
export const formOptionVideoSlotKey = (itemId: string, optionIndex: number) => `${formItemVideoSlotPrefix(itemId)}:option:${optionIndex}`
export const scaleItemVideoSlotKey = (itemCode: string) => `scale-item:${itemCode}:video`

const normalizeOptions = (options: unknown): unknown[] => {
  if (Array.isArray(options)) return options
  if (typeof options !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(options)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const assertFormItemRequiredVideosComplete = ({
  meta,
  draftKey,
  itemId,
  options,
}: {
  meta: FinalDraftMeta
  draftKey: string
  itemId: string
  options: unknown
}) => {
  const entries = formOptionVideoPresentations(normalizeOptions(options))
  for (const entry of entries) {
    const marker = requiredVideoCompletionFromMeta(meta, {
      draftKey,
      slotKey: formOptionVideoSlotKey(itemId, entry.optionIndex),
      assetId: entry.presentation.video.assetId,
      contentHash: entry.presentation.video.contentHash,
    })
    if (!marker) {
      throw new QuestionnaireRequiredVideoCompletionError(
        itemId,
        '该字段包含必看视频。请依次以 1× 完整观看全部选项视频后再继续。',
      )
    }
  }
}

export const assertScaleRequiredVideosComplete = ({
  meta,
  draftKey,
  items,
}: {
  meta: FinalDraftMeta
  draftKey: string
  items: Array<{ itemCode: string; video?: unknown }>
}) => {
  for (const item of items) {
    const presentation = scaleItemVideoPresentation(item)
    if (!presentation) continue
    const marker = requiredVideoCompletionFromMeta(meta, {
      draftKey,
      slotKey: scaleItemVideoSlotKey(item.itemCode),
      assetId: presentation.video.assetId,
      contentHash: presentation.video.contentHash,
    })
    if (!marker) {
      throw new QuestionnaireRequiredVideoCompletionError(
        item.itemCode,
        '该题包含必看视频。请从头以 1× 完整观看视频后再提交量表。',
      )
    }
  }
}
