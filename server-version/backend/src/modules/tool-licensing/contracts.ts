import { z } from 'zod'

export const toolLicenseProductSchema = z.enum(['TRAINING', 'SURVEY', 'SCHOOL', 'TEACHER'])
export type ToolLicenseProduct = z.infer<typeof toolLicenseProductSchema>
export const toolLicenseFamilySchema = z.enum(['SCALE', 'FORM', 'COGNITIVE', 'SJT', 'COMBINATION', 'BUNDLE'])
export type ToolLicenseFamily = z.infer<typeof toolLicenseFamilySchema>
export type ToolLicenseSubjectType = 'ORGANIZATION' | 'USER'

export const toolLicenseId = z.string().guid()
export const toolLicenseKeySchema = z.string().max(300).regex(/^(SCALE|FORM|COGNITIVE|SJT|COMBINATION|BUNDLE):[^\x00-\x20\x7f]+$/)
export const toolLicenseKey = (family: ToolLicenseFamily, key: string) =>
  key.startsWith(family + ':') ? key : family + ':' + key
export const educationPublicationResponseCap = z.number().int().positive().max(2_147_483_647)
const reason = z.string().trim().min(1).max(500)
const items = z.array(z.object({
  key: toolLicenseKeySchema,
  limit: educationPublicationResponseCap.nullable(),
}).strict()).min(1).refine(list => new Set(list.map(item => item.key)).size === list.length, '工具不可重复')

export const createToolLicenseSchema = z.object({
  requestId: toolLicenseId,
  product: toolLicenseProductSchema,
  subjectId: toolLicenseId,
  startsAt: z.string().datetime().transform(value => new Date(value)),
  expiresAt: z.string().datetime().transform(value => new Date(value)),
  reason,
  tools: items,
}).strict().refine(input => input.startsAt < input.expiresAt, '到期时间须晚于生效时间')

export const editToolLicenseSchema = z.object({
  expectedRevision: z.number().int().positive(),
  reason,
  tools: items,
}).strict()

export const terminateToolLicenseSchema = z.object({
  expectedRevision: z.number().int().positive(),
  reason,
}).strict()

export const toolLicenseDirectoryQuery = z.object({
  product: toolLicenseProductSchema,
  q: z.string().trim().max(160).default(''),
  page: z.coerce.number().int().min(1).max(10000).default(1),
}).strict()

export const toolLicenseToolDirectoryQuery = toolLicenseDirectoryQuery.extend({
  key: toolLicenseKeySchema.optional(),
})

export const toolLicenseRecordStatus = z.enum(['SCHEDULED','ACTIVE','EXPIRING','EXPIRED','TERMINATED'])
export const toolLicenseListQuery = z.object({
  product: toolLicenseProductSchema,
  subjectId: toolLicenseId.optional(),
  toolKey: toolLicenseKeySchema.optional(),
  family: toolLicenseFamilySchema.optional(),
  status: toolLicenseRecordStatus.optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
}).strict()

export function toolLicenseSubjectType(product: ToolLicenseProduct): ToolLicenseSubjectType {
  return product === 'SCHOOL' || product === 'TEACHER' ? 'ORGANIZATION' : 'USER'
}
