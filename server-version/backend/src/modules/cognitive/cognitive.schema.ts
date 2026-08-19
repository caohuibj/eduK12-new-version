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
  })
  .strict()
  .refine(
    (d) => !d.opensAt || !d.dueAt || new Date(d.dueAt).getTime() >= new Date(d.opensAt).getTime(),
    { message: 'dueAt must be equal to or after opensAt' }
  )

/** 教师端列表查询参数（D3 §5）。 */
export const listAssignmentsQuerySchema = z
  .object({
    courseId: z.string().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  })
  .strict()

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>

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
