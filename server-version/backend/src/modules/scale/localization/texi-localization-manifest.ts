/**
 * TEXI Simplified Chinese localization manifest contract.
 * English item codes are now fixed from the authorized source PDF.
 * Content may not claim zh-CN until a signed manifest is attached.
 */
import { z } from 'zod'
import { TEXI_ITEM_CODES, TEXI_SOURCE_VERSION_LABEL, TEXI_SUBJECT_AGE_MAX, TEXI_SUBJECT_AGE_MIN } from '../packages/texi-en-v1'

const HEX = /^[0-9a-f]{64}$/
const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/

export const TEXI_SOURCE_VERSION = TEXI_SOURCE_VERSION_LABEL
export { TEXI_SUBJECT_AGE_MIN, TEXI_SUBJECT_AGE_MAX }

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

/** Fixed English item codes from authorized source — unsigned until localization completes. */
export const TEXI_LOCALIZATION_MANIFEST_PENDING = {
  schemaVersion: 1 as const,
  instrumentKey: 'texi_parent_zh_cn' as const,
  instrumentVersion: '1.0.0',
  fixedSourceVersion: TEXI_SOURCE_VERSION,
  itemCodes: [...TEXI_ITEM_CODES],
  status: 'BLOCKED_UNSIGNED' as const,
  notes: [
    'English item codes locked from authorized TEXI Parents and Teachers PDF.',
    'Awaiting signed translation/back-translation/terminology/mainland language review.',
    'Descriptive only; claimsMainlandNorms must remain false.',
  ],
}

/** @deprecated alias — prefer TEXI_LOCALIZATION_MANIFEST_PENDING */
export const TEXI_LOCALIZATION_MANIFEST_BLOCKED = TEXI_LOCALIZATION_MANIFEST_PENDING

export const isTexiLocalizationManifestSigned = (value: unknown): boolean => (
  texiLocalizationManifestSchema.safeParse(value).success
)
