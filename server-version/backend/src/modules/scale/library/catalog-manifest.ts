/**
 * Scale Catalog Manifest V1 — Scale Library 的科学治理元数据契约（非 runtime）。
 *
 * 硬边界（Scale Library v1 规格 §2 全局硬边界）：
 * - Library 是 metadata / scientific governance / discovery layer，不是第三套 assessment runtime；
 * - InstrumentAuthorization 仍是唯一 rights 事实源；catalog 不得保存 isLicensed /
 *   canUseCommercially 之类的第二事实源；
 * - catalog 元数据永不写入 ScaleDefinitionV2：修改任何 catalog 字段（含 evidence
 *   citation）只要求 catalogManifestVersion 递增，hashScaleDefinition(definition) 完全不变；
 * - 学生 submit 热路径不得查询 catalog。
 *
 * 结构按 section 组合：identity → construct → population → administration /
 * intendedUse → evidence → referenceApplicability，随 SL1-C1..C5 逐个落地。
 * 顶层 .strict()：未定义字段一律 fail-closed。
 */
import { z } from 'zod'

export const SCALE_CATALOG_SCHEMA_VERSION = 1 as const

/** instrumentKey 沿用现有 package 产品 key 风格（who5 / sdq_parent_zh_cn / adexi_v1）。 */
const INSTRUMENT_KEY_RE = /^[a-z][a-z0-9_]*$/

/** 与 TEXI localization manifest 的版本约束一致：x.y.z 数字三段。 */
const INSTRUMENT_VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/

export const scaleCatalogStatusSchema = z.enum(['CANDIDATE', 'REVIEWED', 'ACCEPTED', 'DEPRECATED'])
export type ScaleCatalogStatus = z.infer<typeof scaleCatalogStatusSchema>

/**
 * 第一版 construct domains（规格 §SL1-C1）——刻意保持小集合，
 * 不做庞大 ontology；扩域必须改本枚举并过 review。
 */
export const constructDomainSchema = z.enum([
  'WELL_BEING',
  'EXECUTIVE_FUNCTION',
  'SELF_REGULATION',
  'SOCIAL_EMOTIONAL',
  'SCHOOL_BELONGING',
  'MOTIVATION',
  'SELF_EFFICACY',
  'RESILIENCE',
  'PERSONALITY',
  'BEHAVIORAL_DIFFICULTIES',
  'SCHOOL_CLIMATE',
  'ENGAGEMENT',
  'PARENT_OBSERVATION',
  'TEACHER_OBSERVATION',
])
export type ConstructDomain = z.infer<typeof constructDomainSchema>

export const constructLevelSchema = z.enum(['BROAD_DOMAIN', 'SPECIFIC_CONSTRUCT', 'FACET'])
export type ConstructLevel = z.infer<typeof constructLevelSchema>

export const scaleCatalogIdentitySchema = z.object({
  instrumentKey: z.string().regex(INSTRUMENT_KEY_RE, 'instrumentKey 必须是 snake_case 产品 key'),
  instrumentVersion: z.string().regex(INSTRUMENT_VERSION_RE, 'instrumentVersion 必须是 x.y.z 三段数字'),
  canonicalName: z.string().min(1, 'canonicalName 不能为空'),
  abbreviation: z.string().min(1).optional(),
  instrumentFamily: z.string().min(1).optional(),
}).strict()
export type ScaleCatalogIdentity = z.infer<typeof scaleCatalogIdentitySchema>

export const scaleCatalogConstructSchema = z.object({
  primaryDomain: constructDomainSchema,
  secondaryDomains: z.array(constructDomainSchema).default([]),
  constructDefinition: z.string().min(1, 'constructDefinition 不能为空'),
  constructLevel: constructLevelSchema,
  constructOverlapTags: z.array(z.string().min(1)).default([]),
}).strict().superRefine((construct, ctx) => {
  const seen = new Set<string>()
  construct.secondaryDomains.forEach((domain, index) => {
    const path = ['secondaryDomains', String(index)] as const
    if (domain === construct.primaryDomain) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path], message: 'secondaryDomains 不能与 primaryDomain 重复' })
    }
    if (seen.has(domain)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path], message: 'secondaryDomains 不能重复' })
    }
    seen.add(domain)
  })
})
export type ScaleCatalogConstruct = z.infer<typeof scaleCatalogConstructSchema>

/**
 * catalogManifestVersion 是 manifest 内容版本（任何内容变化，如 evidence
 * citation 修订，都必须递增）；schemaVersion 才是契约结构版本。
 */
export const scaleCatalogManifestV1Schema = z.object({
  schemaVersion: z.literal(SCALE_CATALOG_SCHEMA_VERSION),
  catalogManifestVersion: z.number().int().positive({ message: 'catalogManifestVersion 必须是正整数' }),
  catalogStatus: scaleCatalogStatusSchema,
  identity: scaleCatalogIdentitySchema,
  construct: scaleCatalogConstructSchema,
}).strict()

export type ScaleCatalogManifestV1 = z.infer<typeof scaleCatalogManifestV1Schema>

export type CatalogManifestParseResult =
  | { ok: true; manifest: ScaleCatalogManifestV1 }
  | { ok: false; issues: Array<{ path: string; message: string }> }

export const parseScaleCatalogManifest = (value: unknown): CatalogManifestParseResult => {
  const parsed = scaleCatalogManifestV1Schema.safeParse(value)
  if (parsed.success) return { ok: true, manifest: parsed.data }
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.') || 'manifest',
      message: issue.message,
    })),
  }
}
