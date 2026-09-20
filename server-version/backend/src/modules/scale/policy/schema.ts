import { z } from 'zod'
import { assessmentContextKeySchema } from '../../assessment-context/context'

export const scalePolicyRespondentTypeSchema = z.enum(['SELF', 'PARENT', 'TEACHER', 'OBSERVER', 'CLINICIAN'])
export const scalePolicyGradeSchema = z.enum(['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'])

const uniqueStrings = (values: readonly string[], ctx: z.RefinementCtx, path: string): void => {
  const seen = new Set<string>()
  values.forEach((value, index) => {
    if (seen.has(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path, index], message: `${path} 不能重复` })
    }
    seen.add(value)
  })
}

export const instrumentApplicabilityV1Schema = z.object({
  schemaVersion: z.literal(1),
  policyVersion: z.string().min(1),
  respondentTypes: z.array(scalePolicyRespondentTypeSchema).min(1),
  subject: z.object({
    ageMonths: z.object({
      minInclusive: z.number().int().nonnegative().optional(),
      maxExclusive: z.number().int().positive().optional(),
    }).strict().optional(),
    grades: z.array(scalePolicyGradeSchema).optional(),
  }).strict().optional(),
  assessmentContexts: z.array(z.string().min(1)).optional(),
  requiredContextKeys: z.array(assessmentContextKeySchema),
}).strict().superRefine((policy, ctx) => {
  uniqueStrings(policy.respondentTypes, ctx, 'respondentTypes')
  uniqueStrings(policy.requiredContextKeys, ctx, 'requiredContextKeys')
  if (policy.assessmentContexts) uniqueStrings(policy.assessmentContexts, ctx, 'assessmentContexts')
  if (policy.subject?.grades) uniqueStrings(policy.subject.grades, ctx, 'subject.grades')
  const range = policy.subject?.ageMonths
  if (range?.minInclusive !== undefined && range.maxExclusive !== undefined && range.minInclusive >= range.maxExclusive) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['subject', 'ageMonths'], message: 'ageMonths 必须满足 minInclusive < maxExclusive' })
  }
})

export const disclosureCapabilitiesV1Schema = z.object({
  numericScores: z.boolean(),
  references: z.boolean(),
  individualInterpretations: z.boolean(),
  scoreDerivedLabels: z.boolean(),
  resultQualityDetails: z.boolean(),
  rawAnswers: z.boolean(),
  itemScores: z.boolean(),
  methods: z.boolean(),
  educationalContent: z.boolean(),
}).strict()

export const audienceDisclosurePolicyV1Schema = z.object({
  schemaVersion: z.literal(1),
  policyVersion: z.string().min(1),
  audiences: z.object({
    respondent: disclosureCapabilitiesV1Schema.optional(),
    subject: disclosureCapabilitiesV1Schema.optional(),
    teacher: disclosureCapabilitiesV1Schema.optional(),
    researcher: disclosureCapabilitiesV1Schema.optional(),
  }).strict(),
  unknownAudience: z.literal('DENY'),
}).strict()

export const instrumentUsageRequirementsV1Schema = z.object({
  schemaVersion: z.literal(1),
  policyVersion: z.string().min(1),
  requiredRightsActions: z.array(z.string().min(1)).default([]),
  allowedDeploymentModes: z.array(z.string().min(1)).optional(),
  notes: z.array(z.string().min(1)).default([]),
}).strict()

export const educationalFeedbackDefinitionV1Schema = z.object({
  schemaVersion: z.literal(1),
  contentVersion: z.string().min(1),
  blocks: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1).optional(),
    body: z.string().min(1),
  }).strict()),
  choices: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    body: z.string().min(1),
  }).strict()).optional(),
  disclaimer: z.string().min(1).optional(),
}).strict()
