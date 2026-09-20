import { z } from 'zod'
import { validateReferenceSetDefinition } from '../../assessment-reference/reference'
import { scaleCatalogIdentitySchema, scaleCatalogManifestV1Schema } from '../library/catalog-manifest'
import { scaleDefinitionSchema } from '../scale-definition'
import {
  audienceDisclosurePolicyV1Schema,
  educationalFeedbackDefinitionV1Schema,
  instrumentApplicabilityV1Schema,
  instrumentUsageRequirementsV1Schema,
} from '../policy/schema'
import type { ScaleCustomScorer } from '../scale-scoring'
import type { ScaleInstrumentSourceV1 } from './types'

const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/
const LOCALE_RE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/

const catalogIdentityBodySchema = scaleCatalogIdentitySchema.omit({
  instrumentKey: true,
  instrumentVersion: true,
})

const catalogBodySchema = scaleCatalogManifestV1Schema.extend({
  identity: catalogIdentityBodySchema,
})

const goldenCaseSchema = z.object({
  name: z.string().min(1),
  answers: z.array(z.object({
    itemCode: z.string().min(1),
    responseValue: z.union([z.string(), z.number()]),
  }).strict()),
  expected: z.object({
    quality: z.enum(['interpretable', 'limited', 'invalid']),
    scores: z.record(z.number().nullable()),
    totalScoreKeys: z.array(z.string().min(1)),
  }).strict(),
}).strict()

const scorerPluginSchema = z.object({
  key: z.string().min(1),
  version: z.string().min(1),
  scorer: z.custom<ScaleCustomScorer>((value) => typeof value === 'function', 'scorer 必须是函数'),
}).strict()

const executableSchema = z.object({
  releaseStatus: z.enum(['DRAFT', 'PUBLISHED', 'RETIRED']),
  contentLocale: z.string().min(2).max(32).regex(LOCALE_RE),
  definition: scaleDefinitionSchema,
  references: z.array(z.record(z.unknown())),
  goldenCases: z.array(goldenCaseSchema),
  scorerPlugins: z.array(scorerPluginSchema).optional(),
}).strict()

export const scaleInstrumentSourceV1Schema = z.object({
  schemaVersion: z.literal(1),
  identity: z.object({
    instrumentKey: z.string().regex(/^[a-z][a-z0-9_]*$/),
    instrumentVersion: z.string().regex(VERSION_RE),
  }).strict(),
  catalog: catalogBodySchema,
  localization: z.record(z.unknown()).optional(),
  applicability: instrumentApplicabilityV1Schema.optional(),
  disclosure: audienceDisclosurePolicyV1Schema.optional(),
  usageRequirements: instrumentUsageRequirementsV1Schema.optional(),
  educationalFeedback: educationalFeedbackDefinitionV1Schema.optional(),
  candidatePreview: z.object({
    status: z.literal('CATALOG_ONLY'),
    reportPlan: z.string().min(1).optional(),
    blockers: z.array(z.string().min(1)).optional(),
  }).strict().optional(),
  executable: executableSchema.optional(),
}).strict().superRefine((source, ctx) => {
  if (source.executable && !source.applicability) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['applicability'], message: 'executable source 必须显式声明 applicability' })
  }
  if (source.executable && !source.disclosure) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['disclosure'], message: 'executable source 必须显式声明 disclosure' })
  }
  if (!source.executable && !source.candidatePreview) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidatePreview'], message: 'catalog-only source 必须显式标记 candidatePreview' })
  }
  source.executable?.references.forEach((reference, index) => {
    const parsed = validateReferenceSetDefinition(reference)
    parsed.issues.forEach((issue) => {
      if (issue.severity === 'error') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['executable', 'references', index, issue.path], message: issue.message })
    })
  })
})

export const parseScaleInstrumentSourceSchema = (value: unknown): ScaleInstrumentSourceV1 => (
  scaleInstrumentSourceV1Schema.parse(value) as unknown as ScaleInstrumentSourceV1
)
