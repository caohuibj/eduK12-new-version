import { z } from 'zod'

const dateTime = z.string().datetime()
const exportDate = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), { message: '日期格式无效' })

export const createCompositeSchema = z.object({
  code: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  instruction: z.string().nullable().optional(),
  courseId: z.string().min(1).nullable().optional(),
  opensAt: dateTime.nullable().optional(),
  expiresAt: dateTime.nullable().optional(),
  maxAttempts: z.number().int().positive().optional().default(1),
  publicEnabled: z.boolean().optional().default(false),
}).strict().refine(
  (value) => !value.opensAt || !value.expiresAt || new Date(value.expiresAt).getTime() >= new Date(value.opensAt).getTime(),
  { message: 'expiresAt 必须晚于或等于 opensAt' }
)

export const updateCompositeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  instruction: z.string().nullable().optional(),
  courseId: z.string().min(1).nullable().optional(),
  opensAt: dateTime.nullable().optional(),
  expiresAt: dateTime.nullable().optional(),
  maxAttempts: z.number().int().positive().optional(),
  publicEnabled: z.boolean().optional(),
  copyable: z.boolean().optional(),
}).strict().refine(
  (value) => !value.opensAt || !value.expiresAt || new Date(value.expiresAt).getTime() >= new Date(value.opensAt).getTime(),
  { message: 'expiresAt 必须晚于或等于 opensAt' }
)

const formOption = z.object({ value: z.string().min(1), label: z.string().min(1) }).strict()

export const addCompositeItemSchema = z.object({
  type: z.enum(['SCALE', 'COGNITIVE', 'FORM']),
  position: z.number().int().min(0).optional(),
  required: z.boolean().optional().default(true),
  scaleId: z.string().min(1).optional(),
  cognitiveAssignmentId: z.string().min(1).optional(),
  formType: z.enum(['fill_blank', 'single_choice', 'multiple_choice', 'text_input']).optional(),
  formLabel: z.string().min(1).max(500).optional(),
  formPlaceholder: z.string().nullable().optional(),
  formOptions: z.array(formOption).nullable().optional(),
}).strict().superRefine((input, ctx) => {
  if (input.type === 'FORM' && (!input.formType || !input.formLabel)) {
    ctx.addIssue({ code: 'custom', path: ['formLabel'], message: '表单模块必须提供 formType 和 formLabel' })
  }
  if (input.type === 'FORM' && (input.formType === 'single_choice' || input.formType === 'multiple_choice')) {
    const values = input.formOptions?.map((option) => option.value) ?? []
    if (values.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['formOptions'], message: '选择题必须提供至少一个选项' })
    } else if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: 'custom', path: ['formOptions'], message: '表单选项不能重复' })
    }
  }
})

export const reorderCompositeItemsSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1), position: z.number().int().min(0) }).strict()).min(1),
}).strict()

export const createCompositeTokenSchema = z.object({
  expiresAt: dateTime,
  maxUses: z.number().int().min(0).default(0),
}).strict()

export const compositeExportQuerySchema = z.object({
  detail: z.enum(['summary', 'full']).default('summary'),
})

export const compositeExportRequestSchema = z.object({
  detail: z.enum(['summary', 'full']).default('summary'),
  format: z.enum(['csv', 'sav']).default('csv'),
  anonymize: z.boolean().default(true),
  dateRange: z.object({ start: exportDate.optional(), end: exportDate.optional() }).strict().optional(),
}).strict()

export const compositeScaleAnswerSchema = z.object({
  itemId: z.string().min(1),
  value: z.number().int().finite(),
  responseTime: z.number().int().nonnegative().optional(),
}).strict()

export const compositeFormAnswerSchema = z.object({
  itemId: z.string().min(1),
  value: z.string().max(10000),
}).strict()

export const compositeSaveSchema = z.object({
  itemId: z.string().min(1).optional(),
  value: z.string().max(10000).optional(),
}).strict().refine(
  (input) => (input.itemId === undefined) === (input.value === undefined),
  { message: '保存表单草稿时必须同时提供 itemId 和 value' },
)

export const publicRecoverySchema = z.object({
  recoveryToken: z.string().min(20).max(200),
}).strict()

export const copyCompositeSchema = z.object({
  courseId: z.string().min(1).nullable().optional(),
  code: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(200).optional(),
}).strict()

export const listCompositeAttemptsQuerySchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'ABANDONED']).optional(),
  q: z.string().max(100).optional(),
  page: z.union([z.string(), z.number()]).optional(),
  pageSize: z.union([z.string(), z.number()]).optional(),
}).strict()

export type CreateCompositeInput = z.infer<typeof createCompositeSchema>
export type UpdateCompositeInput = z.infer<typeof updateCompositeSchema>
export type AddCompositeItemInput = z.infer<typeof addCompositeItemSchema>
export type CopyCompositeInput = z.infer<typeof copyCompositeSchema>
export type CompositeExportRequest = z.infer<typeof compositeExportRequestSchema>
