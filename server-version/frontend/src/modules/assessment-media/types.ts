export interface AssessmentAssetIdentityV1 {
  assetId: string
  contentHash: string
  mimeType: string
}

export type AssessmentStaticImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface AssessmentStaticImageAssetIdentityV1 extends AssessmentAssetIdentityV1 {
  mimeType: AssessmentStaticImageMimeType
}

export interface AssessmentImagePresentationItem {
  asset: AssessmentStaticImageAssetIdentityV1
  altText: string
  caption?: string
}

export type AssessmentVideoMimeType = 'video/mp4' | 'video/webm' | 'video/ogg'

export interface AssessmentVideoAssetIdentityV1 extends AssessmentAssetIdentityV1 {
  mimeType: AssessmentVideoMimeType
}

export interface AssessmentVttAssetIdentityV1 extends AssessmentAssetIdentityV1 {
  mimeType: 'text/vtt'
}

export interface AssessmentVideoCaptionTrackV1 {
  asset: AssessmentVttAssetIdentityV1
  kind: 'captions' | 'subtitles'
  srcLang: string
  label: string
  default?: boolean
}

export interface AssessmentVideoPresentationV1 {
  schemaVersion: 1
  video: AssessmentVideoAssetIdentityV1
  poster?: AssessmentStaticImageAssetIdentityV1
  captions?: AssessmentVideoCaptionTrackV1[]
  transcript?: {
    language: string
    text: string
  }
  title?: string
  description?: string
}

export interface AssessmentVideoCapabilitySources {
  videoUrl: string
  posterUrl?: string
  captions?: Array<{
    assetId: string
    src: string
    kind: 'captions' | 'subtitles'
    srcLang: string
    label: string
    default?: boolean
  }>
  expiresAt?: number
}
