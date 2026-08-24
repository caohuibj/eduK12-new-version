import { z } from 'zod'

/**
 * Cognitive 跨阶段共享 schema/helper（D2 Step 6）。
 *
 * D2 只放真正跨 D3–D6 会复用的轻量 schema/helper；
 * 不要在这里预写 Assignment / Session / Completion request schema ——
 * "D3 的 API body schema 到 D3 再加"（D2 §10）。
 */

/** 通用 trialIndex：non-negative integer（envelope 字段，不属于 payload）。 */
export const trialIndexSchema = z.number().int().min(0)

/** Registry 版本键基础 string schema。 */
export const versionStringSchema = z.string().min(1)

// ---------------------------------------------------------------------------
// D3 — Assignment / Distribution request schemas
// ---------------------------------------------------------------------------

/**
 * 创建 Cognitive Assignment（D3 §7）。
 * `.strict()`：body 中禁止出现 createdBy / status / courseSnapshot / publishedAt，
 * 这些字段全部由服务端决定。
 */
export const cognitiveProfileSchema = z.enum(['experience', 'standard', 'research'])

export const createAssignmentSchema = z
  .object({
    courseId: z.string().min(1),
    configId: z.string().min(1),
    title: z.string().min(1),
    instruction: z.string().optional(),
    opensAt: z.string().datetime().optional(),
    dueAt: z.string().datetime().optional(),
    maxAttempts: z.number().int().positive().optional().default(1),
    required: z.boolean().optional().default(true),
    profile: cognitiveProfileSchema,
  })
  .strict()
  .refine(
    (d) => !d.opensAt || !d.dueAt || new Date(d.dueAt).getTime() >= new Date(d.opensAt).getTime(),
    { message: 'dueAt must be equal to or after opensAt' }
  )

/** 更新 DRAFT Assignment（D3 §8）。字段全部 optional，同样 strict 禁止越权字段。 */
export const updateAssignmentSchema = z
  .object({
    title: z.string().min(1).optional(),
    instruction: z.string().optional(),
    opensAt: z.string().datetime().optional(),
    dueAt: z.string().datetime().optional(),
    maxAttempts: z.number().int().positive().optional(),
    required: z.boolean().optional(),
    profile: cognitiveProfileSchema.optional(),
  })
  .strict()
  .refine(
    (d) => !d.opensAt || !d.dueAt || new Date(d.dueAt).getTime() >= new Date(d.opensAt).getTime(),
    { message: 'dueAt must be equal to or after opensAt' }
  )

/** 教师端列表查询参数（D3 §5）。 */
export const listAssignmentsQuerySchema = z.object({
  courseId: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  listedStandalone: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
})

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>
export const updateAccessPolicySchema = z.object({
  accessPolicy: z.enum(['OPEN', 'GRANT']),
}).strict()

export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>
export type UpdateAccessPolicyInput = z.infer<typeof updateAccessPolicySchema>

// ---------------------------------------------------------------------------
// Cognitive export
// ---------------------------------------------------------------------------

/**
 * 认知测评导出预览查询。
 * summary 只导出服务端汇总指标；full 额外展开每个原始试次。
 */
export const cognitiveExportQuerySchema = z.object({
  detail: z.enum(['summary', 'full', 'research']).optional().default('summary'),
})

/**
 * 认知测评导出请求。
 * 日期兼容管理端 date input 的 YYYY-MM-DD，也兼容完整 ISO 时间。
 */
export const cognitiveExportRequestSchema = z
  .object({
    detail: z.enum(['summary', 'full', 'research']).optional().default('summary'),
    format: z.enum(['csv', 'sav', 'xlsx', 'zip']).optional().default('csv'),
    anonymize: z.boolean().optional().default(true),
    dateRange: z.object({
      start: z.string().min(1).optional(),
      end: z.string().min(1).optional(),
    }).optional(),
  })
  .strict()
  .refine((value) => {
    const wide = value.detail === 'summary' || value.detail === 'full'
    if (wide) return value.format === 'csv' || value.format === 'sav'
    return value.format === 'zip' || value.format === 'xlsx'
  }, {
    message: '导出 detail 与 format 组合无效：summary/full 仅 csv|sav，research 仅 zip|xlsx',
  })

export type CognitiveExportQuery = z.infer<typeof cognitiveExportQuerySchema>
export type CognitiveExportRequest = z.infer<typeof cognitiveExportRequestSchema>

// 公开认知测评：入口令牌和恢复凭证均由服务端生成，客户端只能提交恢复凭证。
export const cognitivePublicTokenSchema = z.object({
  expiresAt: z.string().datetime(),
  maxUses: z.number().int().min(0).default(0),
}).strict()

export const cognitivePublicStartSchema = z.object({
  recoveryToken: z.string().min(20).max(200).optional(),
}).strict()

export const cognitivePublicTrialSchema = z.object({
  recoveryToken: z.string().min(20).max(200),
  trialIndex: z.number().int().min(0),
  payload: z.any(),
}).strict()

export const cognitivePublicRecoverySchema = z.object({
  recoveryToken: z.string().min(20).max(200),
}).strict()

// ---------------------------------------------------------------------------
// D4 — Session request schemas
// ---------------------------------------------------------------------------

/**
 * 创建 Session（D4 §4）：body 只含 assignmentId。
 * 不接受 userId / participantKey / attemptNo / testType / config / randomSeed —— 全部由服务端决定。
 */
export const createSessionSchema = z
  .object({
    assignmentId: z.string().min(1),
  })
  .strict()

/** restart 无 body。 */
export const restartSessionSchema = z.object({}).strict()

// ---------------------------------------------------------------------------
// D5 — Trial request schemas
// ---------------------------------------------------------------------------

/**
 * Append Trial（D5 §5）：body = { trialIndex, payload }。
 * - trialIndex：non-negative integer。
 * - payload：API shell 层 unknown，具体形状由 RegistryEntry.trialSchema 判定（不硬编码 fake shape）。
 * - `.strict()`：拒绝 sessionId / payloadHash / payloadEncrypted / createdAt（全部服务端决定）。
 */
export const appendTrialSchema = z
  .object({
    trialIndex: z.number().int().min(0),
    // API shell 层任意值，具体形状由 RegistryEntry.trialSchema 判定（不硬编码 fake shape）
    payload: z.any(),
  })
  .strict()

// ---------------------------------------------------------------------------
// D6 — Completion request schema
// ---------------------------------------------------------------------------

/**
 * Complete Session（D6 §4）：body 必须为严格空对象 `{}`。
 * 客户端提交 score / metrics / rawData 会被 `.strict()` 直接拒绝 —— 评分由服务端权威决定。
 */
export const completeSessionSchema = z.object({}).strict()
