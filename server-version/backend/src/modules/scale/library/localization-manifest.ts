/**
 * LocalizationManifestV1 — Scale Library 通用本地化 provenance 契约（SL2-C1）。
 *
 * 从 TEXI 专用 manifest 的设计思想泛化而来；TEXI 现有专用契约与其 gate 行为
 * 保持不变（§26/§27），新 instrument 统一使用本契约。
 *
 * 关键原则：
 * - 翻译/内容适配变化 → localizationVersion++；不自动 bump scoringVersion，
 *   也不自动 bump catalogManifestVersion（除非对应 metadata 同时变化）。
 * - translationRightsStatus 只是 provenance 记录（本 manifest 声明翻译用途是否
 *   已被授权覆盖）；法律事实源仍是 InstrumentAuthorization，publication gate
 *   负责与其交叉核对，本字段不得被当作第二 rights truth。
 * - PILOT 本地化不要求科研全部完成：cognitiveDebriefStatus / localEvidenceRefs
 *   允许 NOT_ESTABLISHED / 空，但必须显式声明当前文本来源与版本。
 */
import { z } from 'zod'
import { isValidContentLocaleTag } from '../content-locale'

const INSTRUMENT_KEY_RE = /^[a-z][a-z0-9_]*$/
const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/
const ISO_TIMESTAMP_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/

/**
 * 翻译权利的 provenance 记录。COVERED_BY_INSTRUMENT_AUTHORIZATION 表示翻译用途
 * 已由 InstrumentAuthorization 覆盖（gate 会交叉核对）；DENIED/PENDING/UNKNOWN
 * 在 publication gate 中 fail-closed。
 */
export const localizationRightsStatusSchema = z.enum([
  'COVERED_BY_INSTRUMENT_AUTHORIZATION',
  'DENIED',
  'PENDING',
  'UNKNOWN',
])
export type LocalizationRightsStatus = z.infer<typeof localizationRightsStatusSchema>

/** 当前部署文本的来源方式；sourceLocale === targetLocale 时必须为 ORIGINAL_SOURCE。 */
export const localizationAdaptationMethodSchema = z.enum([
  'ORIGINAL_SOURCE',
  'DIRECT_TRANSLATION',
  'BACK_TRANSLATION_VERIFIED',
  'CULTURAL_ADAPTATION',
])
export type LocalizationAdaptationMethod = z.infer<typeof localizationAdaptationMethodSchema>

/** 单项审核状态：必须是显式已知状态，PILOT 允许 PENDING / NOT_ESTABLISHED。 */
export const localizationReviewItemStatusSchema = z.enum(['COMPLETED', 'PENDING', 'NOT_ESTABLISHED'])
export type LocalizationReviewItemStatus = z.infer<typeof localizationReviewItemStatusSchema>

export const localizationManifestV1Schema = z.object({
  schemaVersion: z.literal(1),
  instrumentKey: z.string().regex(INSTRUMENT_KEY_RE, 'instrumentKey 必须是 snake_case 产品 key'),
  instrumentVersion: z.string().regex(VERSION_RE, 'instrumentVersion 必须是 x.y.z 三段数字'),
  sourceLocale: z.string().refine(isValidContentLocaleTag, 'sourceLocale 必须是合法的语言 tag（如 zh-CN / en）'),
  targetLocale: z.string().refine(isValidContentLocaleTag, 'targetLocale 必须是合法的语言 tag（如 zh-CN / en）'),
  localizationVersion: z.string().regex(VERSION_RE, 'localizationVersion 必须是 x.y.z 三段数字'),
  translationSource: z.string({ required_error: 'translationSource 必填：必须记录当前部署文本的来源' }).min(1, 'translationSource 必填：必须记录当前部署文本的来源'),
  translationRightsStatus: localizationRightsStatusSchema,
  adaptationMethod: localizationAdaptationMethodSchema,
  expertReviewStatus: localizationReviewItemStatusSchema,
  cognitiveDebriefStatus: localizationReviewItemStatusSchema,
  /** 指向 catalog manifest evidence matrix 中的 evidenceId。 */
  localEvidenceRefs: z.array(z.string().min(1)).default([]),
  /** manifest 级治理审核：APPROVED 必须带 reviewedAt。 */
  reviewStatus: z.enum(['APPROVED', 'PENDING']),
  reviewedAt: z.string().regex(ISO_TIMESTAMP_RE, 'reviewedAt 必须是 ISO 时间戳').optional(),
  notes: z.string().min(1).optional(),
}).strict().superRefine((manifest, ctx) => {
  if (manifest.reviewStatus === 'APPROVED' && !manifest.reviewedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reviewedAt'],
      message: 'reviewStatus=APPROVED 时必须提供 reviewedAt',
    })
  }
  if (manifest.sourceLocale === manifest.targetLocale && manifest.adaptationMethod !== 'ORIGINAL_SOURCE') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['adaptationMethod'],
      message: 'sourceLocale 与 targetLocale 相同时只能使用 ORIGINAL_SOURCE',
    })
  }
})

export type LocalizationManifestV1 = z.infer<typeof localizationManifestV1Schema>

export type LocalizationManifestParseResult =
  | { ok: true; manifest: LocalizationManifestV1 }
  | { ok: false; issues: Array<{ path: string; message: string }> }

export const parseLocalizationManifest = (value: unknown): LocalizationManifestParseResult => {
  const parsed = localizationManifestV1Schema.safeParse(value)
  if (parsed.success) return { ok: true, manifest: parsed.data }
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.') || 'localizationManifest',
      message: issue.message,
    })),
  }
}
