import { z } from 'zod'
import { bundleContractFail } from './errors'
import {
  ASSESSMENT_BUNDLE_DEFINITION_SCHEMA,
  ASSESSMENT_BUNDLE_SNAPSHOT_FAMILY,
  ASSESSMENT_BUNDLE_SNAPSHOT_VERSION,
  BUNDLE_CONTEXT_FACTS_SCHEMA_VERSION,
  BUNDLE_ENGINE_KEYS,
  BUNDLE_REPORT_FACTS_SCHEMA_VERSION,
  BUNDLE_SNAPSHOT_HASH_SCHEME,
} from './types'

export const HEX_HASH = /^[0-9a-f]{64}$/
export const EXACT_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/
export const BUNDLE_KEY = /^[a-z][a-z0-9_]*$/
export const SLOT_KEY = /^[a-z][a-z0-9_.]*$/
export const CONSTRUCT_KEY = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/
/** Strict UTC instant: valid calendar clock (rejects T99 etc.). */
export const ISO_INSTANT = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/

const hexHash = z.string().regex(HEX_HASH)
const exactVersion = z.string().regex(EXACT_VERSION)
const nonEmpty = z.string().min(1)

export const parseContract = <T>(schema: z.ZodType<T>, value: unknown, code: string): T => {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : ''
    return bundleContractFail(code, `${path}${issue?.message ?? 'contract invalid'}`)
  }
  return parsed.data
}

const engineRefSchema = z.object({
  key: z.enum(BUNDLE_ENGINE_KEYS),
  version: exactVersion,
}).strict()

const factPresenceSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('present'),
    value: z.union([z.number().finite(), z.string(), z.boolean()]),
    unit: z.string().min(1).optional(),
  }).strict(),
  z.object({ state: z.literal('missing') }).strict(),
  z.object({ state: z.literal('invalid') }).strict(),
  z.object({ state: z.literal('not_applicable') }).strict(),
])

const slotSchema = z.object({
  slotKey: z.string().regex(SLOT_KEY),
  unitType: z.enum(['COGNITIVE', 'SCALE', 'FORM']),
  position: z.number().int().nonnegative(),
  required: z.boolean(),
  instrumentKey: nonEmpty,
  instrumentVersion: exactVersion,
  respondentType: z.enum(['SELF', 'PARENT', 'TEACHER']),
  valueSelectors: z.array(nonEmpty).optional(),
}).strict()

export const assessmentBundleDefinitionSchema = z.object({
  schemaVersion: z.literal(ASSESSMENT_BUNDLE_DEFINITION_SCHEMA),
  bundleKey: z.string().regex(BUNDLE_KEY),
  bundleVersion: exactVersion,
  status: z.enum(['DRAFT', 'PUBLISHED', 'RETIRED', 'HOLD']),
  category: z.enum(['cognitive', 'scale_self', 'observer', 'integrated']),
  name: nonEmpty,
  description: nonEmpty,
  respondentTypes: z.array(z.enum(['SELF', 'PARENT', 'TEACHER'])).min(1),
  initiationModes: z.array(z.enum([
    'TEACHER_ASSIGNMENT',
    'PARENT_SELF_SERVE',
    'ANONYMOUS_SELF',
    'STUDENT_COURSE',
  ])).min(1),
  population: z.object({
    subjectPopulation: z.enum(['youth', 'adult', 'unspecified']),
    subjectMinAgeYears: z.number().int().nonnegative().optional(),
    subjectMaxAgeYears: z.number().int().nonnegative().optional(),
  }).strict(),
  slots: z.array(slotSchema).min(1),
  engine: engineRefSchema,
  contextDefinitionKey: z.string().min(1).nullable(),
  contextDefinitionVersion: exactVersion.nullable(),
  reportDefinitionKey: nonEmpty,
  reportDefinitionVersion: exactVersion,
  publicationRequirements: z.object({
    scientificGate: z.boolean(),
    rightsGate: z.boolean(),
    languageGate: z.boolean(),
    reportGate: z.boolean(),
    safetyGate: z.boolean(),
    nonCommercialOnly: z.boolean(),
  }).strict(),
  rightsRequirements: z.object({
    required: z.boolean(),
    instrumentKeys: z.array(nonEmpty),
  }).strict(),
  safetyCapability: z.object({
    safetyCapable: z.boolean(),
    productionTriggerEnabled: z.boolean(),
  }).strict(),
  limitations: z.array(z.string().min(1)),
}).strict().superRefine((definition, ctx) => {
  const hasContextKey = definition.contextDefinitionKey !== null
  const hasContextVersion = definition.contextDefinitionVersion !== null
  if (hasContextKey !== hasContextVersion) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'contextDefinitionKey 与 contextDefinitionVersion 必须同时为 null 或同时有值',
      path: ['contextDefinitionKey'],
    })
  }
})

const slotBindingSchema = z.object({
  slotKey: z.string().regex(SLOT_KEY),
  unitType: z.enum(['COGNITIVE', 'SCALE', 'FORM']),
  instrumentKey: nonEmpty,
  instrumentVersion: exactVersion,
  required: z.boolean(),
  respondentType: z.enum(['SELF', 'PARENT', 'TEACHER']),
  valueSelectors: z.array(nonEmpty).nullable(),
}).strict()

export const frozenAssessmentBundleSnapshotSchema = z.object({
  snapshotFamily: z.literal(ASSESSMENT_BUNDLE_SNAPSHOT_FAMILY),
  snapshotVersion: z.literal(ASSESSMENT_BUNDLE_SNAPSHOT_VERSION),
  bundleKey: z.string().regex(BUNDLE_KEY),
  bundleVersion: exactVersion,
  bundleDefinition: assessmentBundleDefinitionSchema,
  bundleDefinitionHash: hexHash,
  engine: engineRefSchema,
  slotBindings: z.array(slotBindingSchema).min(1),
  contextDefinitionHash: hexHash.nullable(),
  rightsSnapshotHash: hexHash.nullable(),
  ruleSetRef: z.object({
    key: nonEmpty,
    version: exactVersion,
    hash: hexHash,
  }).strict().nullable(),
  reportDefinitionKey: nonEmpty,
  reportDefinitionVersion: exactVersion,
  hashScheme: z.literal(BUNDLE_SNAPSHOT_HASH_SCHEME),
  snapshotHash: hexHash,
}).strict()

const cognitiveSourceSchema = z.object({
  kind: z.literal('COGNITIVE_METRIC'),
  slotKey: nonEmpty,
  metricKey: nonEmpty,
  sourceResultHash: hexHash,
}).strict()

const scaleSourceSchema = z.object({
  kind: z.literal('SCALE_SCORE'),
  slotKey: nonEmpty,
  scoreKey: nonEmpty,
  sourceResultHash: hexHash,
}).strict()

const contextSourceSchema = z.object({
  kind: z.literal('CONTEXT_FACT'),
  contextKey: nonEmpty,
  contextSnapshotHash: hexHash,
}).strict()

export const evidenceSourceSchema = z.discriminatedUnion('kind', [
  cognitiveSourceSchema,
  scaleSourceSchema,
  contextSourceSchema,
])

export const evidenceItemSchema = z.object({
  evidenceKey: z.string().regex(CONSTRUCT_KEY),
  constructKey: z.string().regex(CONSTRUCT_KEY),
  source: evidenceSourceSchema,
  value: factPresenceSchema,
  quality: z.enum(['interpretable', 'limited', 'invalid', 'unavailable']),
  criterionBandKey: z.string().min(1).nullable(),
  role: z.enum(['PRIMARY', 'SUPPORTING', 'CONTEXT', 'SAFETY']),
}).strict()

export const bundleContextFactsSchema = z.object({
  schemaVersion: z.literal(BUNDLE_CONTEXT_FACTS_SCHEMA_VERSION),
  contextDefinitionKey: nonEmpty,
  contextDefinitionVersion: exactVersion,
  contextDefinitionHash: hexHash,
  frozenAt: z.string().regex(ISO_INSTANT),
  contextSnapshotHash: hexHash,
  facts: z.array(z.object({
    contextKey: nonEmpty,
    value: factPresenceSchema,
  }).strict()),
}).strict()

export const bundleReportFactsSchema = z.object({
  schemaVersion: z.literal(1),
  factsSchemaVersion: z.literal(BUNDLE_REPORT_FACTS_SCHEMA_VERSION),
  identity: z.object({
    bundleKey: z.string().regex(BUNDLE_KEY),
    bundleVersion: exactVersion,
    engine: engineRefSchema,
    snapshotHash: hexHash,
  }).strict(),
  evidence: z.array(evidenceItemSchema),
  quality: z.object({
    overall: z.enum(['interpretable', 'limited', 'invalid', 'unavailable']),
    notes: z.array(z.string()),
  }).strict(),
  enginePayload: z.discriminatedUnion('kind', [
    z.object({
      engineKey: z.enum(BUNDLE_ENGINE_KEYS),
      engineVersion: exactVersion,
      kind: z.literal('UNAVAILABLE'),
      reason: nonEmpty,
    }).strict(),
    z.object({
      engineKey: z.enum(BUNDLE_ENGINE_KEYS),
      engineVersion: exactVersion,
      kind: z.literal('COMPUTED'),
      payload: z.any(),
    }).strict(),
  ]),
  limitations: z.array(z.string()),
  recommendations: z.array(z.string()),
  contextSnapshotHash: hexHash.nullable(),
  provenance: z.object({
    compiledBundleRuntimeHash: hexHash,
    aggregateInputHash: hexHash.nullable(),
    evidenceSourceHashes: z.array(hexHash),
    contextDefinitionHash: hexHash.nullable(),
    ruleSetRef: z.object({
      key: nonEmpty,
      version: exactVersion,
      hash: hexHash,
    }).strict().nullable(),
  }).strict(),
}).strict()
