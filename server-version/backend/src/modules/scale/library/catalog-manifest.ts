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
import { isValidContentLocaleTag } from '../content-locale'
import type { ReferenceKind } from '../../assessment-reference/reference'
import { SCIENTIFIC_MATURITY_LEVELS } from '../../assessment-governance/scientific-maturity'

export const SCALE_CATALOG_SCHEMA_VERSION = 1 as const

/** instrumentKey 沿用现有 package 产品 key 风格（who5 / sdq_parent_zh_cn / adexi_v1）。 */
const INSTRUMENT_KEY_RE = /^[a-z][a-z0-9_]*$/

/** 与 TEXI localization manifest 的版本约束一致：x.y.z 数字三段。 */
const INSTRUMENT_VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/

export const scaleCatalogStatusSchema = z.enum(['CANDIDATE', 'REVIEWED', 'ACCEPTED', 'DEPRECATED'])
export type ScaleCatalogStatus = z.infer<typeof scaleCatalogStatusSchema>

/**
 * Scientific maturity is independent from product lifecycle. PILOT and
 * RESEARCH_READY are both normal publishable product states; RESEARCH_GRADE is
 * reserved for a future higher evidence bar. Maturity is catalog-only
 * governance metadata and never changes hashScaleDefinition(definition).
 */
export const scientificMaturitySchema = z.enum(SCIENTIFIC_MATURITY_LEVELS)
export type ScientificMaturity = z.infer<typeof scientificMaturitySchema>

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

export const respondentTypeSchema = z.enum(['SELF', 'PARENT', 'TEACHER', 'OBSERVER', 'CLINICIAN'])
export type RespondentType = z.infer<typeof respondentTypeSchema>

/** 该工具的发展人群证据强度：是否有针对目标发展年龄段的心理测量学证据。 */
export const developmentalEvidenceSchema = z.enum(['ESTABLISHED', 'PARTIAL', 'UNKNOWN'])
export type DevelopmentalEvidence = z.infer<typeof developmentalEvidenceSchema>

/**
 * 工具适用人群与作答者（SL1-C2）。年龄用完整岁数（completed years）；
 * minAge/maxAge 独立可选，省略一侧表示该侧无界；年级用 1-12（1=小学一年级）。
 * 整个年龄或年级轴均可省略，表示 catalog 不对该轴作描述性限制。
 */
export const scaleCatalogPopulationSchema = z.object({
  minAge: z.number().int().min(0).max(100).optional(),
  maxAge: z.number().int().min(0).max(100).optional(),
  gradeRange: z.object({
    minGrade: z.number().int().min(1, 'minGrade 必须在 1-12').max(12, 'minGrade 必须在 1-12'),
    maxGrade: z.number().int().min(1, 'maxGrade 必须在 1-12').max(12, 'maxGrade 必须在 1-12'),
  }).strict().optional(),
  populationNotes: z.string().min(1).optional(),
  respondentTypes: z.array(respondentTypeSchema).min(1, '至少需要一种作答者类型'),
  developmentalEvidence: developmentalEvidenceSchema,
}).strict().superRefine((population, ctx) => {
  if (population.minAge !== undefined && population.maxAge !== undefined && population.minAge > population.maxAge) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['minAge'],
      message: 'minAge 不能大于 maxAge',
    })
  }
  if (population.gradeRange && population.gradeRange.minGrade > population.gradeRange.maxGrade) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['gradeRange', 'minGrade'],
      message: 'minGrade 不能大于 maxGrade',
    })
  }
  const seen = new Set<string>()
  population.respondentTypes.forEach((respondent, index) => {
    if (seen.has(respondent)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['respondentTypes', String(index)],
        message: 'respondentTypes 不能重复',
      })
    }
    seen.add(respondent)
  })
})
export type ScaleCatalogPopulation = z.infer<typeof scaleCatalogPopulationSchema>

export const administrationModeSchema = z.enum([
  'DIGITAL_SELF_ADMINISTERED',
  'DIGITAL_SUPERVISED',
  'PAPER',
  'INTERVIEWER_ADMINISTERED',
])
export type AdministrationMode = z.infer<typeof administrationModeSchema>

/** 施测形态与负担（SL1-C3）。itemCount/estimatedMinutes 是 catalog 参考值，不替代 runtime。 */
export const scaleCatalogAdministrationSchema = z.object({
  itemCount: z.number().int().positive({ message: 'itemCount 必须是正整数' }),
  estimatedMinutes: z.number().int().positive({ message: 'estimatedMinutes 必须是正整数' }),
  administrationModes: z.array(administrationModeSchema).min(1, '至少需要一种施测方式'),
  timeFrame: z.string().min(1, 'timeFrame 不能为空'),
  requiredTraining: z.boolean(),
  itemOrderLocked: z.boolean(),
  responseFormatLocked: z.boolean(),
  layoutConstraints: z.array(z.string().min(1)).default([]),
}).strict().superRefine((administration, ctx) => {
  const seen = new Set<string>()
  administration.administrationModes.forEach((mode, index) => {
    if (seen.has(mode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['administrationModes', String(index)],
        message: 'administrationModes 不能重复',
      })
    }
    seen.add(mode)
  })
})
export type ScaleCatalogAdministration = z.infer<typeof scaleCatalogAdministrationSchema>

export const intendedUseSchema = z.enum([
  'RESEARCH',
  'INDIVIDUAL_REFLECTION',
  'PROGRESS_MONITORING',
  'PROGRAM_EVALUATION',
  'SCREENING',
])
export type IntendedUse = z.infer<typeof intendedUseSchema>

/** 结构性禁止的用途——与 intendedUse 枚举不相交，一旦声明即为硬约束。 */
export const forbiddenUseSchema = z.enum([
  'DIAGNOSIS',
  'HIGH_STAKES_SELECTION',
  'SCHOOL_RANKING',
  'TEACHER_ACCOUNTABILITY',
  'UNSUPPORTED_GROUP_COMPARISON',
])
export type ForbiddenUse = z.infer<typeof forbiddenUseSchema>

/**
 * 每个可用用途都携带独立的证据状态，避免 validated=true 式的无边界判断：
 * “研究允许 / 诊断禁止 / 进展监测证据未知”必须可以同时成立。
 */
export const intendedUseEvidenceStatusSchema = z.enum(['SUPPORTED', 'EVIDENCE_UNKNOWN', 'NOT_SUPPORTED'])
export type IntendedUseEvidenceStatus = z.infer<typeof intendedUseEvidenceStatusSchema>

export const scaleCatalogIntendedUseSchema = z.object({
  intendedUses: z.array(z.object({
    use: intendedUseSchema,
    evidenceStatus: intendedUseEvidenceStatusSchema,
    notes: z.string().min(1).optional(),
  }).strict()).min(1, '至少需要声明一个可用用途'),
  forbiddenUses: z.array(forbiddenUseSchema).default([]),
}).strict().superRefine((intendedUse, ctx) => {
  const seenUses = new Set<string>()
  intendedUse.intendedUses.forEach((entry, index) => {
    if (seenUses.has(entry.use)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['intendedUses', String(index)],
        message: '同一用途只能声明一条 evidenceStatus',
      })
    }
    seenUses.add(entry.use)
  })
  const seenForbidden = new Set<string>()
  intendedUse.forbiddenUses.forEach((use, index) => {
    if (seenForbidden.has(use)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['forbiddenUses', String(index)],
        message: 'forbiddenUses 不能重复',
      })
    }
    seenForbidden.add(use)
  })
})
export type ScaleCatalogIntendedUse = z.infer<typeof scaleCatalogIntendedUseSchema>

export const evidenceTypeSchema = z.enum([
  'CONTENT_VALIDITY',
  'STRUCTURAL_VALIDITY',
  'INTERNAL_CONSISTENCY',
  'TEST_RETEST',
  'CONVERGENT_DISCRIMINANT',
  'CRITERION',
  'CROSS_CULTURAL_VALIDITY',
  'MEASUREMENT_INVARIANCE',
  'RESPONSIVENESS',
])
export type EvidenceType = z.infer<typeof evidenceTypeSchema>

/** 证据评级是按 population/locale 划分的，不存在全局 validated=true。 */
export const evidenceRatingSchema = z.enum(['SUFFICIENT', 'MIXED', 'INSUFFICIENT', 'UNKNOWN'])
export type EvidenceRating = z.infer<typeof evidenceRatingSchema>

/**
 * 单条科学证据记录（SL1-C4）。citation 必填；population 与 locale 必须显式，
 * 同一工具在不同人群中可以并存不同 rating 的证据。
 * locale 复用 content-locale 的 tag 校验，与授权 scope 的语言标签保持一致。
 */
export const scaleEvidenceRecordSchema = z.object({
  evidenceId: z.string().min(1, 'evidenceId 不能为空'),
  evidenceType: evidenceTypeSchema,
  population: z.string().min(1, 'population 不能为空'),
  ageRange: z.string().min(1).optional(),
  locale: z.string().refine(isValidContentLocaleTag, 'locale 必须是合法的语言 tag（如 zh-CN / en）'),
  territory: z.string().regex(/^[A-Z]{2}$/, 'territory 必须是两位大写国家/地区码（如 CN / GB / US）'),
  sampleSize: z.number().int().positive({ message: 'sampleSize 必须是正整数' }).optional(),
  studyDesign: z.string().min(1, 'studyDesign 不能为空'),
  rating: evidenceRatingSchema,
  citation: z.string({ required_error: 'evidence 必须提供 citation' }).min(1, 'evidence 必须提供 citation'),
  doi: z.string().min(1).optional(),
  url: z.string().url().optional(),
  notes: z.string().min(1).optional(),
}).strict()
export type ScaleEvidenceRecord = z.infer<typeof scaleEvidenceRecordSchema>

export const scaleCatalogEvidenceSchema = z.array(scaleEvidenceRecordSchema).superRefine((records, ctx) => {
  const seen = new Set<string>()
  records.forEach((record, index) => {
    if (seen.has(record.evidenceId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [String(index), 'evidenceId'],
        message: 'evidenceId 不能重复',
      })
    }
    seen.add(record.evidenceId)
  })
})

/**
 * Reference applicability metadata（SL1-C5）。
 * Library 不发明新的 reference engine，也不改变现有 reference scoring 行为：
 * 这里只描述“某 referenceVersion 适用于谁”，referenceKind 与月龄语义复用
 * assessment-reference 既有契约，字段命名与 ReferencePopulationMatch 对齐。
 */
const REFERENCE_KIND_VALUES = ['normative_distribution', 'criterion_threshold', 'descriptive_sample'] as const satisfies readonly ReferenceKind[]
export const catalogReferenceKindSchema = z.enum(REFERENCE_KIND_VALUES)

export const samplingMethodSchema = z.enum(['PROBABILITY', 'STRATIFIED', 'CONVENIENCE', 'UNKNOWN', 'OTHER'])
export type SamplingMethod = z.infer<typeof samplingMethodSchema>

export const scaleReferenceApplicabilityRecordSchema = z.object({
  applicabilityId: z.string().min(1, 'applicabilityId 不能为空'),
  referenceVersion: z.string().min(1, 'referenceVersion 不能为空'),
  referenceKind: catalogReferenceKindSchema,
  respondent: respondentTypeSchema,
  locale: z.string().refine(isValidContentLocaleTag, 'locale 必须是合法的语言 tag（如 zh-CN / en）'),
  territory: z.string().regex(/^[A-Z]{2}$/, 'territory 必须是两位大写国家/地区码（如 CN / GB / US）'),
  minAgeMonthsInclusive: z.number().int().min(0, '月龄下界必须是非负整数').optional(),
  maxAgeMonthsExclusive: z.number().int().positive({ message: '月龄上界必须是正整数' }).optional(),
  sampleN: z.number().int().positive({ message: 'sampleN 必须是正整数' }).optional(),
  samplingMethod: samplingMethodSchema,
  collectionYears: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
}).strict().superRefine((record, ctx) => {
  if (
    record.minAgeMonthsInclusive !== undefined
    && record.maxAgeMonthsExclusive !== undefined
    && record.minAgeMonthsInclusive >= record.maxAgeMonthsExclusive
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['minAgeMonthsInclusive'],
      message: '月龄下界必须小于不含上界',
    })
  }
})
export type ScaleReferenceApplicabilityRecord = z.infer<typeof scaleReferenceApplicabilityRecordSchema>

export const scaleCatalogReferenceApplicabilitySchema = z.array(scaleReferenceApplicabilityRecordSchema).superRefine((records, ctx) => {
  const seen = new Set<string>()
  records.forEach((record, index) => {
    if (seen.has(record.applicabilityId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [String(index), 'applicabilityId'],
        message: 'applicabilityId 不能重复',
      })
    }
    seen.add(record.applicabilityId)
  })
})

/**
 * catalogManifestVersion 是 manifest 内容版本（任何内容变化，如 evidence
 * citation 修订，都必须递增）；schemaVersion 才是契约结构版本。
 */
export const scaleCatalogManifestV1Schema = z.object({
  schemaVersion: z.literal(SCALE_CATALOG_SCHEMA_VERSION),
  catalogManifestVersion: z.number().int().positive({ message: 'catalogManifestVersion 必须是正整数' }),
  catalogStatus: scaleCatalogStatusSchema,
  /** New exact identities default to PILOT; maturity upgrades are governance-only. */
  scientificMaturity: scientificMaturitySchema.default('PILOT'),
  identity: scaleCatalogIdentitySchema,
  construct: scaleCatalogConstructSchema,
  population: scaleCatalogPopulationSchema,
  administration: scaleCatalogAdministrationSchema,
  intendedUse: scaleCatalogIntendedUseSchema,
  evidence: scaleCatalogEvidenceSchema.default([]),
  referenceApplicability: scaleCatalogReferenceApplicabilitySchema.default([]),
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
