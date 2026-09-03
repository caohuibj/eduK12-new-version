/**
 * TEXI Simplified Chinese localization manifest contract.
 * Content packages stay blocked until a signed manifest is attached.
 * Do not invent TEXI item text here.
 */
import { z } from 'zod'

const HEX = /^[0-9a-f]{64}$/
const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/

export const TEXI_SOURCE_VERSION = 'Thorell et al. 2020 / ages 13-19' as const
export const TEXI_SUBJECT_AGE_MIN = 13
export const TEXI_SUBJECT_AGE_MAX = 19

export const texiLocalizationManifestSchema = z.object({
  schemaVersion: z.literal(1),
  instrumentKey: z.enum(['texi_parent_zh_cn', 'texi_teacher_zh_cn']),
  instrumentVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
  fixedSourceVersion: z.literal(TEXI_SOURCE_VERSION),
  itemCodes: z.array(z.string().min(1)).min(1),
  translationCompleted: z.literal(true),
  backTranslationCompleted: z.literal(true),
  terminologyReviewCompleted: z.literal(true),
  mainlandLanguageReviewCompleted: z.literal(true),
  claimsMainlandNorms: z.literal(false),
  descriptiveOnly: z.literal(true),
  subjectAgeMinYears: z.literal(TEXI_SUBJECT_AGE_MIN),
  subjectAgeMaxYears: z.literal(TEXI_SUBJECT_AGE_MAX),
  signedBy: z.string().min(1),
  signedAt: z.string().regex(ISO),
  manifestHash: z.string().regex(HEX),
}).strict()

export type TexiLocalizationManifestV1 = z.infer<typeof texiLocalizationManifestSchema>

/** Placeholder blocked manifest — unsigned / incomplete on purpose. */
export const TEXI_LOCALIZATION_MANIFEST_BLOCKED = {
  schemaVersion: 1 as const,
  instrumentKey: 'texi_parent_zh_cn' as const,
  instrumentVersion: '1.0.0',
  fixedSourceVersion: TEXI_SOURCE_VERSION,
  itemCodes: [] as string[],
  status: 'BLOCKED_UNSIGNED' as const,
  notes: [
    'Awaiting official TEXI item codes + signed translation/back-translation/terminology/mainland language review.',
    'Descriptive only; claimsMainlandNorms must remain false.',
  ],
}

export const isTexiLocalizationManifestSigned = (value: unknown): boolean => (
  texiLocalizationManifestSchema.safeParse(value).success
)
