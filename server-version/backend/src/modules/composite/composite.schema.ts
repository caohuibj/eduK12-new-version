import { z } from 'zod'
import { MAX_TOKEN_USES } from '../../constants'
import { deviceInputProvenanceV1Schema } from '../scale/device-input-provenance'

const dateTime = z.string().datetime()
const exportDate = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), { message: '日期格式无效' })
const analysisProtocolSelection = z.object({
  key: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, '必须指定精确协议版本'),
  profile: z.enum(['standard', 'research']),
}).strict()

// PR6B package selection is the only teacher-facing fixed-report mode. The
// legacy analysisProtocol shape is retained below only for historical
// migration/setter code; it is intentionally absent from createCompositeSchema.
const reportPackageSelection = z.object({
  key: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, '必须指定精确报告包版本'),
  profile: z.enum(['standard', 'research']),
}).strict()

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
  reportPackage: reportPackageSelection.nullable().optional(),
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

export const setCompositeAnalysisProtocolSchema = z.object({
  analysisProtocol: analysisProtocolSelection.nullable(),
}).strict()

export const setCompositeReportPackageSchema = z.object({
  reportPackage: reportPackageSelection.nullable(),
}).strict()

const formOption = z.object({ value: z.string().min(1), label: z.string().min(1) }).strict()

export const addCompositeItemSchema = z.object({
  type: z.enum(['SCALE', 'COGNITIVE', 'FORM']),
  position: z.number().int().min(0).optional(),
  required: z.boolean().optional().default(true),
  scaleId: z.string().min(1).optional(),
  cognitiveAssignmentId: z.string().min(1).optional(),
  formType: z.enum(['fill_blank', 'single_choice', 'multiple_choice', 'text_input', 'year_month']).optional(),
  formLabel: z.string().min(1).max(500).optional(),
  formPlaceholder: z.string().nullable().optional(),
  formOptions: z.array(formOption).nullable().optional(),
  contextKey: z.enum(['birthYearMonth', 'sexAtBirth', 'gradeLevel', 'primaryLanguage', 'countryOrRegion']).nullable().optional(),
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
  if (input.type !== 'FORM' && input.contextKey !== undefined && input.contextKey !== null) {
    ctx.addIssue({ code: 'custom', path: ['contextKey'], message: '只有表单模块可以绑定 contextKey' })
  }
  if (input.required === false && (input.type !== 'FORM' || !input.contextKey)) {
    ctx.addIssue({ code: 'custom', path: ['required'], message: '只有 context 表单可以设置为非必填' })
  }
})

export const reorderCompositeItemsSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1), position: z.number().int().min(0) }).strict()).min(1),
}).strict()

export const reorderCompositeContentUnitsSchema = z.object({
  units: z.array(z.object({
    type: z.enum(['scale', 'cognitive', 'form-section', 'SCALE', 'COGNITIVE', 'FORM_SECTION']),
    id: z.string().min(1),
    position: z.number().int().min(0),
  }).strict()).min(1),
}).strict()

export const createCompositeTokenSchema = z.object({
  expiresAt: dateTime,
  maxUses: z.number().int().min(0).max(MAX_TOKEN_USES).default(0),
}).strict()

export const compositeExportQuerySchema = z.object({
  detail: z.enum(['summary', 'full']).default('summary'),
})

export const compositeReportQuerySchema = z.object({
  snapshotId: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict()

export const compositeAnalysisExportQuerySchema = z.object({
  format: z.enum(['json', 'zip', 'xlsx']).default('zip'),
  snapshotId: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict()

export const compositeParticipantAnalysisExportQuerySchema = z.object({
  format: z.enum(['json', 'zip', 'xlsx']).default('zip'),
}).strict()

export const compositeReanalysisBodySchema = z.object({}).strict()

export const compositeExportRequestSchema = z.object({
  detail: z.enum(['summary', 'full']).default('summary'),
  format: z.enum(['csv', 'sav']).default('csv'),
  anonymize: z.boolean().default(true),
  dateRange: z.object({ start: exportDate.optional(), end: exportDate.optional() }).strict().optional(),
}).strict()

export const compositeScaleAnswerSchema = z.object({
  itemCode: z.string().min(1),
  responseValue: z.union([z.string(), z.number().finite()]),
  responseTimeMs: z.number().finite().nonnegative().optional(),
  deviceInputProvenance: deviceInputProvenanceV1Schema.optional(),
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
export type SetCompositeAnalysisProtocolInput = z.infer<typeof setCompositeAnalysisProtocolSchema>
export type SetCompositeReportPackageInput = z.infer<typeof setCompositeReportPackageSchema>
export type AddCompositeItemInput = z.infer<typeof addCompositeItemSchema>
export type CopyCompositeInput = z.infer<typeof copyCompositeSchema>
export type CompositeExportRequest = z.infer<typeof compositeExportRequestSchema>
export type CompositeAnalysisExportQuery = z.infer<typeof compositeAnalysisExportQuerySchema>
