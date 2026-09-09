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
