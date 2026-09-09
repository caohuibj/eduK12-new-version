import type { AssessmentImagePresentationItem, AssessmentStaticImageAssetIdentityV1 } from './types'

export type OrderedAssessmentImagePresentationItem = AssessmentImagePresentationItem & { order: number }

const isImageAsset = (value: unknown): value is AssessmentStaticImageAssetIdentityV1 => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const asset = value as Record<string, unknown>
  return typeof asset.assetId === 'string'
    && typeof asset.contentHash === 'string'
    && typeof asset.mimeType === 'string'
    && ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType)
}

export const assessmentImageItems = (value: unknown): OrderedAssessmentImagePresentationItem[] => {
  if (!Array.isArray(value)) return []
  const items = value.flatMap((entry): OrderedAssessmentImagePresentationItem[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const candidate = entry as Record<string, unknown>
    if (!isImageAsset(candidate.asset) || typeof candidate.altText !== 'string' || !candidate.altText.trim()) return []
    if (!Number.isInteger(candidate.order) || (candidate.order as number) < 0) return []
    if (candidate.caption !== undefined && (typeof candidate.caption !== 'string' || !candidate.caption.trim())) return []
    return [{
      asset: candidate.asset,
      altText: candidate.altText,
      ...(typeof candidate.caption === 'string' ? { caption: candidate.caption } : {}),
      order: candidate.order as number,
    }]
  })
  return items.sort((left, right) => left.order - right.order)
}

export const assessmentOptionImageItems = (options: unknown): OrderedAssessmentImagePresentationItem[] => {
  if (!Array.isArray(options)) return []
  return options.flatMap((option) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) return []
    return assessmentImageItems((option as { images?: unknown }).images)
  })
}
