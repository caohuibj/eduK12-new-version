import { z } from 'zod'
import { SCIENTIFIC_MATURITY_LEVELS } from '../../assessment-governance/scientific-maturity'

const text = z.string().trim().min(1)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const situationalExecutionRefSchema = z.object({
  instrumentKey: text,
  instrumentVersion: text,
  scorerKey: text,
  scoringVersion: text,
  definitionHash: digest,
}).strict()
export const situationalScientificScopeSchema = z.object({
  language: text,
  population: text,
  use: text,
  claim: text,
}).strict()
export const situationalScientificEvidenceSchema = z.object({
  id: text,
  kind: z.enum(['RESEARCH_FOUNDATION', 'PROVENANCE', 'EMPIRICAL_REFERENCE', 'FORMAL_OUTPUT']),
  reference: text,
  executionRef: situationalExecutionRefSchema,
  scope: situationalScientificScopeSchema,
  reviewReference: text,
}).strict()
export const scientificReviewSchema = z.object({
  reviewUrl: z.string().regex(/^https:\/\/github\.com\/caohuibj\/eduK12-new-version\/pull\/\d+#pullrequestreview-\d+$/),
  reviewer: text,
  reviewedAt: z.string().datetime({ offset: true }),
  executionRef: situationalExecutionRefSchema,
  evidenceDigest: digest,
  targetMaturity: z.enum(SCIENTIFIC_MATURITY_LEVELS),
  scope: situationalScientificScopeSchema,
  governanceRevision: z.number().int().positive(),
}).strict()
// Evidence eligibility and the human declaration are deliberately separate.
export const scientificSchema = z.object({
  schemaVersion: z.literal(1),
  scientificMaturity: z.enum(SCIENTIFIC_MATURITY_LEVELS),
  governanceRevision: z.number().int().positive(),
  changeReason: text.optional(),
  review: scientificReviewSchema.optional(),
  claimScope: situationalScientificScopeSchema.nullable().default(null),
  evidence: z.array(situationalScientificEvidenceSchema).default([]),
  knownLimitations: z.array(text).default([]),
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>()
  value.evidence.forEach((evidence, index) => {
    if (ids.has(evidence.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence', index, 'id'], message: 'Duplicate evidence id' })
    ids.add(evidence.id)
  })
})
export type SituationalScientificDeclarationV1 = z.infer<typeof scientificSchema>
export type SituationalExecutionRefV1 = z.infer<typeof situationalExecutionRefSchema>

/** Stored inside the authenticated snapshot envelope, outside execution hashes. */
export const situationalScientificContextSchema = z.object({
  schemaVersion: z.literal(1),
  scientificMaturity: z.enum(SCIENTIFIC_MATURITY_LEVELS),
  governanceRevision: z.number().int().positive(),
  scope: situationalScientificScopeSchema.nullable(),
  executionRef: situationalExecutionRefSchema,
  evidenceDigest: digest,
  reviewUrl: z.string().url().optional(),
}).strict()
export type SituationalScientificContextV1 = z.infer<typeof situationalScientificContextSchema>
export const legacySituationalScientificContext = () => ({
  scientificMaturity: 'PILOT' as const, governanceRevision: null, scope: null,
  evidenceDigest: null, provenance: 'LEGACY_MISSING' as const,
})
export const frozenSituationalScientificProjection = (context?: SituationalScientificContextV1) => (
  context ? { ...context, provenance: 'FROZEN' as const } : legacySituationalScientificContext()
)
