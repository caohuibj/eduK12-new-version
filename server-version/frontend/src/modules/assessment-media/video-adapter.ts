import type { AssessmentVideoPresentationV1 } from './types'

const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/ogg'])
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const VTT_MIME_TYPES = new Set(['text/vtt'])

const isAssetIdentity = (value: unknown, mimeTypes: Set<string>): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const asset = value as Record<string, unknown>
  return typeof asset.assetId === 'string'
    && asset.assetId.length > 0
    && typeof asset.contentHash === 'string'
    && /^[a-f0-9]{64}$/i.test(asset.contentHash)
    && typeof asset.mimeType === 'string'
    && mimeTypes.has(asset.mimeType)
}

export const assessmentVideoPresentation = (value: unknown): AssessmentVideoPresentationV1 | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const candidate = value as Record<string, unknown>
  if (candidate.schemaVersion !== 1 || !isAssetIdentity(candidate.video, VIDEO_MIME_TYPES)) return undefined
  if (candidate.poster !== undefined && !isAssetIdentity(candidate.poster, IMAGE_MIME_TYPES)) return undefined

  if (candidate.captions !== undefined) {
    if (!Array.isArray(candidate.captions) || candidate.captions.length > 8) return undefined
    let defaults = 0
    for (const entry of candidate.captions) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined
      const track = entry as Record<string, unknown>
      if (!isAssetIdentity(track.asset, VTT_MIME_TYPES)) return undefined
      if (track.kind !== 'captions' && track.kind !== 'subtitles') return undefined
      if (typeof track.srcLang !== 'string' || !track.srcLang.trim()) return undefined
      if (typeof track.label !== 'string' || !track.label.trim()) return undefined
      if (track.default !== undefined && typeof track.default !== 'boolean') return undefined
      if (track.default) defaults += 1
    }
    if (defaults > 1) return undefined
  }

  if (candidate.transcript !== undefined) {
    if (!candidate.transcript || typeof candidate.transcript !== 'object' || Array.isArray(candidate.transcript)) return undefined
    const transcript = candidate.transcript as Record<string, unknown>
    if (typeof transcript.language !== 'string' || !transcript.language.trim()) return undefined
    if (typeof transcript.text !== 'string' || !transcript.text.trim()) return undefined
  }

  return candidate as unknown as AssessmentVideoPresentationV1
}

export const scaleItemVideoPresentation = (item: unknown): AssessmentVideoPresentationV1 | undefined => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined
  return assessmentVideoPresentation((item as { video?: unknown }).video)
}

export interface FormOptionVideoPresentation {
  optionIndex: number
  optionLabel: string
  presentation: AssessmentVideoPresentationV1
}

export const formOptionVideoPresentations = (options: unknown): FormOptionVideoPresentation[] => {
  if (!Array.isArray(options)) return []
  return options.flatMap((option, optionIndex): FormOptionVideoPresentation[] => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) return []
    const candidate = option as { label?: unknown; video?: unknown }
    if (typeof candidate.label !== 'string' || !candidate.label.trim()) return []
    const presentation = assessmentVideoPresentation(candidate.video)
    if (!presentation) return []
    return [{ optionIndex, optionLabel: candidate.label.trim(), presentation }]
  })
}
