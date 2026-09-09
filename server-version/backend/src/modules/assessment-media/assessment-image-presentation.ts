import { z } from 'zod'
import { assessmentStaticImageAssetIdentitySchema, type AssessmentStaticImageAssetIdentityV1 } from './assessment-image'

export const assessmentImagePresentationSchema = z.object({
  asset: assessmentStaticImageAssetIdentitySchema,
  altText: z.string().min(1),
  caption: z.string().min(1).optional(),
  order: z.number().int().nonnegative(),
}).strict()
export type AssessmentImagePresentationV1 = z.infer<typeof assessmentImagePresentationSchema>

export const assessmentImagePresentationListSchema = z.array(assessmentImagePresentationSchema).superRefine((images, ctx) => {
  const orders = new Set<number>()
  images.forEach((image, index) => {
    if (orders.has(image.order)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'order'],
        message: `Assessment image order must be unique: ${image.order}`,
      })
    }
    orders.add(image.order)
  })
})
export type AssessmentImagePresentationListV1 = z.infer<typeof assessmentImagePresentationListSchema>

export const orderedAssessmentImagePresentation = <T extends { order: number }>(images: readonly T[]): T[] => (
  [...images].sort((left, right) => left.order - right.order)
)

export const assessmentImageAssetReferences = (
  images: readonly AssessmentImagePresentationV1[] | undefined,
): AssessmentStaticImageAssetIdentityV1[] => (
  images?.map((image) => image.asset) ?? []
)
