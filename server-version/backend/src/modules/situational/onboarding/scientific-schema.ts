import { z } from 'zod'

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
// Advanced declarations stay closed until review authority and frozen projections
// are implemented. Evidence eligibility alone never promotes an instrument.
export const scientificSchema = z.object({
  schemaVersion: z.literal(1),
  scientificMaturity: z.literal('PILOT'),
  governanceRevision: z.number().int().positive(),
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
