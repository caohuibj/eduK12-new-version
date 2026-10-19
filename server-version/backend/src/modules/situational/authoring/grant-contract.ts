import { z } from 'zod'

export const SJT_COURSE_GRANT_POLICY = 'COURSE_GRANT_V1' as const
export const sjtGrantPermissionSchema = z.enum(['DISTRIBUTE', 'ADAPT'])
export type SjtGrantPermission = z.infer<typeof sjtGrantPermissionSchema>
export const sjtCourseGrantScopeSchema = z.object({
  teacherId: z.string().min(1), courseId: z.string().min(1), purpose: z.literal('TRAINING_COURSE'),
}).strict()
export type SjtCourseGrantScope = z.infer<typeof sjtCourseGrantScopeSchema>
const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const sjtCourseGrantReceiptSchema = z.object({
  policy: z.literal(SJT_COURSE_GRANT_POLICY),
  grantId: z.string().min(1), grantVersion: z.number().int().positive(),
  permission: sjtGrantPermissionSchema,
  releaseId: z.string().min(1), instrumentKey: z.string().min(1), instrumentVersion: z.string().min(1),
  definitionHash: hash, contentDigest: hash,
  granteeTeacherId: z.string().min(1), courseId: z.string().min(1), purpose: z.literal('TRAINING_COURSE'),
  validFrom: z.string().datetime(), expiresAt: z.string().datetime(), admittedAt: z.string().datetime(),
}).strict().refine(r => Date.parse(r.expiresAt) > Date.parse(r.validFrom)
  && Date.parse(r.admittedAt) >= Date.parse(r.validFrom) && Date.parse(r.admittedAt) < Date.parse(r.expiresAt),
  'Admission must be inside the grant interval')
export type SjtCourseGrantReceipt = z.infer<typeof sjtCourseGrantReceiptSchema>
export const sjtAdaptationSourceSchema = z.object({
  protocol: z.literal('sjt-adaptation-v1'), receipt: sjtCourseGrantReceiptSchema,
  sourceDraftId: z.string().min(1), sourceAuthorId: z.string().min(1),
}).strict().refine(v => v.receipt.permission === 'ADAPT', 'Adaptation requires an ADAPT grant')
export type SjtAdaptationSource = z.infer<typeof sjtAdaptationSourceSchema>
