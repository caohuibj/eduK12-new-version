import { z } from 'zod'

const dateTime = z.string().datetime()

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
}).strict().refine(
  (value) => !value.opensAt || !value.expiresAt || new Date(value.expiresAt).getTime() >= new Date(value.opensAt).getTime(),
  { message: 'expiresAt 必须晚于或等于 opensAt' }
)

const formOption = z.object({ value: z.string(), label: z.string() }).strict()

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
}).strict()

export const reorderCompositeItemsSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1), position: z.number().int().min(0) }).strict()).min(1),
}).strict()

export const createCompositeTokenSchema = z.object({
  expiresAt: dateTime,
  maxUses: z.number().int().min(0).default(0),
}).strict()

export const compositeExportQuerySchema = z.object({
  detail: z.enum(['summary', 'full']).default('summary'),
}).strict()

export const compositeExportRequestSchema = z.object({
  detail: z.enum(['summary', 'full']).default('summary'),
  format: z.enum(['csv', 'sav']).default('csv'),
  anonymize: z.boolean().default(true),
  dateRange: z.object({ start: z.string().optional(), end: z.string().optional() }).optional(),
}).strict()

export const compositeScaleAnswerSchema = z.object({
  itemId: z.string().min(1),
  value: z.number(),
  responseTime: z.number().int().nonnegative().optional(),
}).strict()

export const compositeFormAnswerSchema = z.object({
  itemId: z.string().min(1),
  value: z.string(),
}).strict()

export const publicRecoverySchema = z.object({
  recoveryToken: z.string().min(20).max(200),
}).strict()

export type CreateCompositeInput = z.infer<typeof createCompositeSchema>
export type UpdateCompositeInput = z.infer<typeof updateCompositeSchema>
export type AddCompositeItemInput = z.infer<typeof addCompositeItemSchema>
export type CompositeExportRequest = z.infer<typeof compositeExportRequestSchema>
