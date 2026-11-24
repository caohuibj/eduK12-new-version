import { z } from 'zod'
import type { ScaleResultV2 } from '../scale/scale-result'
import type { CanonicalUnitResultCoreV1 } from './unit-result'
import type { TypedFormValue } from './typed-form'

export const HEX64_RE = /^[a-f0-9]{64}$/
const hashSchema = z.string().regex(HEX64_RE)
const nonEmptyText = z.string().min(1).max(240)
const isoDateTimeSchema = z.string().datetime({ offset: true })

export const compactScoreTupleSchema = z.tuple([
  z.number().finite().nullable(),
  z.enum(['calculated', 'limited', 'not_calculable']),
  z.boolean(),
  z.array(z.number().int().min(0)).nullable(),
  z.record(z.string(), z.unknown()),
])
export type CompactScoreTuple = z.infer<typeof compactScoreTupleSchema>

export const compactItemTupleSchema = z.tuple([
  z.number().int().min(0),
  z.number().finite(),
  z.number().finite(),
  z.number().int().min(0).max(7),
  z.record(z.string(), z.unknown()),
])
export type CompactItemTuple = z.infer<typeof compactItemTupleSchema>

export const compactRefFactSchema = z.object({
  base: hashSchema,
  band: hashSchema.nullable(),
  hasBand: z.boolean(),
  dynamic: z.record(z.string(), z.unknown()),
}).strict()
export type CompactRefFact = z.infer<typeof compactRefFactSchema>

export const compactInterpFactSchema = z.object({
  template: hashSchema,
  extras: z.record(z.string(), z.unknown()),
}).strict()
export type CompactInterpFact = z.infer<typeof compactInterpFactSchema>

export const scaleQualitySummarySchema = z.object({
  status: z.enum(['interpretable', 'limited', 'invalid']),
  flags: z.array(z.enum(['missing_items', 'insufficient_items', 'score_not_calculable'])),
}).strict()

export const compositeScaleUnitFactSchema = z.object({
  unitType: z.literal('SCALE'),
  itemId: nonEmptyText,
  scaleId: nonEmptyText,
  sourceDefinitionHash: hashSchema,
  sourceResultHash: hashSchema,
  compiledRuntimeHash: hashSchema.optional(),
  bundleHash: hashSchema,
  scores: z.array(compactScoreTupleSchema).max(500),
  quality: scaleQualitySummarySchema,
  /** Fast 1B/item nibble-packed base64 when all items are sequential 0..15 with no extras. */
  itemsPacked: z.string().min(1).max(65536).optional(),
  /** General fallback item tuples when nibble fast-pack does not apply. */
  items: z.array(compactItemTupleSchema).max(20000).optional(),
  references: z.array(compactRefFactSchema).max(500),
  interpretations: z.array(compactInterpFactSchema).max(500),
  extras: z.record(z.string(), z.unknown()).optional(),
  methodExtras: z.record(z.string(), z.unknown()).optional(),
  canonicalValues: z.array(z.unknown()).optional(),
  canonicalResultHash: hashSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.itemsPacked === undefined && value.items === undefined) {
    ctx.addIssue({ code: 'custom', message: 'Scale unit fact requires itemsPacked or items' })
  }
  if (value.itemsPacked !== undefined && value.items !== undefined) {
    ctx.addIssue({ code: 'custom', message: 'Scale unit fact cannot carry both itemsPacked and items' })
  }
})
export type CompositeScaleUnitFactV1 = z.infer<typeof compositeScaleUnitFactSchema>

export const compositeFormSectionUnitFactSchema = z.object({
  unitType: z.literal('FORM_SECTION'),
  sectionId: nonEmptyText,
  sourceDefinitionHash: hashSchema,
  sourceResultHash: hashSchema,
  typedValues: z.record(z.string(), z.unknown()),
  contextSnapshot: z.record(z.string(), z.unknown()).optional(),
}).strict()
export type CompositeFormSectionUnitFactV1 = Omit<z.infer<typeof compositeFormSectionUnitFactSchema>, 'typedValues'> & {
  typedValues: Record<string, TypedFormValue>
}

export const compositeSituationalUnitFactSchema = z.object({
  unitType: z.literal('SITUATIONAL'),
  itemId: nonEmptyText,
  instrumentKey: nonEmptyText,
  instrumentVersion: nonEmptyText,
  sourceDefinitionHash: hashSchema,
  sourceResultHash: hashSchema,
  scores: z.record(z.string(), z.unknown()),
  trajectory: z.array(nonEmptyText).max(500).optional(),
  quality: z.object({
    status: nonEmptyText,
    flags: z.array(nonEmptyText).max(100),
  }).strict(),
  canonicalCore: z.record(z.string(), z.unknown()),
}).strict()
export type CompositeSituationalUnitFactV1 = Omit<z.infer<typeof compositeSituationalUnitFactSchema>, 'canonicalCore'> & {
  canonicalCore: CanonicalUnitResultCoreV1
}

export const compositeCognitiveUnitFactSchema = z.object({
  unitType: z.literal('COGNITIVE'),
  itemId: nonEmptyText,
  testType: nonEmptyText,
  configVersion: nonEmptyText,
  engineVersion: nonEmptyText,
  scoringVersion: nonEmptyText,
  protocolSignature: hashSchema,
  profile: nonEmptyText,
  sourceResultHash: hashSchema,
  trialCount: z.number().int().min(0).max(100000),
  metrics: z.record(z.string(), z.unknown()),
  quality: z.object({
    state: nonEmptyText,
    flags: z.record(z.string(), z.unknown()),
    reasons: z.array(z.string().max(400)).max(100),
  }).strict(),
  references: z.array(z.unknown()).max(200),
  reportSummary: z.record(z.string(), z.unknown()),
  canonicalCore: z.record(z.string(), z.unknown()),
}).strict()
export type CompositeCognitiveUnitFactV1 = Omit<z.infer<typeof compositeCognitiveUnitFactSchema>, 'canonicalCore'> & {
  canonicalCore: CanonicalUnitResultCoreV1
}

export const compositeUnitFactSchema = z.discriminatedUnion('unitType', [
  compositeScaleUnitFactSchema,
  compositeFormSectionUnitFactSchema,
  compositeSituationalUnitFactSchema,
  compositeCognitiveUnitFactSchema,
])
export type CompositeUnitFactV1 =
  | CompositeScaleUnitFactV1
  | CompositeFormSectionUnitFactV1
  | CompositeSituationalUnitFactV1
  | CompositeCognitiveUnitFactV1
export type CompositeUnitType = CompositeUnitFactV1['unitType']

export const resolvedUnitReferenceSlotSchema = z.object({
  metricKey: nonEmptyText,
  referenceKind: z.enum(['normative_distribution', 'criterion_threshold', 'descriptive_sample', 'theoretical_range']),
  status: z.enum(['SELECTED', 'UNAVAILABLE']),
  releaseId: nonEmptyText.optional(),
  contentHash: hashSchema.optional(),
  entryKey: nonEmptyText.optional(),
  reason: nonEmptyText.optional(),
}).strict()

export const compositeFinalFactsSchema = z.object({
  schemaVersion: z.literal(1),
  attemptId: nonEmptyText,
  attemptEpoch: z.number().int().min(1),
  compositeId: nonEmptyText,
  publicationHash: hashSchema,
  slotSetHash: hashSchema,
  contextHash: hashSchema.nullable(),
  completedAt: isoDateTimeSchema,
  executedSlotKeys: z.array(nonEmptyText).max(200),
  referenceSelection: z.record(z.string(), z.array(resolvedUnitReferenceSlotSchema)).optional(),
  interpretation: z.record(z.string(), z.unknown()).optional(),
  units: z.record(z.string(), compositeUnitFactSchema),
}).strict()

export interface CompositeFinalFactsV1 {
  schemaVersion: 1
  attemptId: string
  attemptEpoch: number
  compositeId: string
  publicationHash: string
  slotSetHash: string
  contextHash: string | null
  completedAt: string
  executedSlotKeys: string[]
  referenceSelection?: Record<string, Array<z.infer<typeof resolvedUnitReferenceSlotSchema>>>
  interpretation?: Record<string, unknown>
  units: Record<string, CompositeUnitFactV1>
}

export const compositeScaleUnitRawSchema = z.object({
  unitType: z.literal('SCALE'),
  itemId: nonEmptyText,
  codes: z.array(nonEmptyText).max(20000),
  values: z.array(z.union([z.string(), z.number().finite()])).max(20000),
  timings: z.record(z.string(), z.unknown()).optional(),
  deviceInputProvenance: z.record(z.string(), z.unknown()).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.codes.length !== value.values.length) {
    ctx.addIssue({ code: 'custom', message: 'Scale raw codes and values length mismatch' })
  }
})
export type CompositeScaleUnitRawV1 = z.infer<typeof compositeScaleUnitRawSchema>

export const compositeFormSectionUnitRawSchema = z.object({
  unitType: z.literal('FORM_SECTION'),
  sectionId: nonEmptyText,
  answers: z.array(z.object({
    formItemId: nonEmptyText,
    value: z.unknown(),
    otherText: z.string().max(4000).optional(),
  }).strict()).max(1000),
}).strict()
export type CompositeFormSectionUnitRawV1 = z.infer<typeof compositeFormSectionUnitRawSchema>

export const compositeSituationalUnitRawSchema = z.object({
  unitType: z.literal('SITUATIONAL'),
  itemId: nonEmptyText,
  responses: z.record(z.string(), z.unknown()),
  researchEvents: z.array(z.unknown()).max(10000).optional(),
  totalTimeMs: z.number().finite().min(0).optional(),
  lockedAt: isoDateTimeSchema.optional(),
}).strict()
export type CompositeSituationalUnitRawV1 = z.infer<typeof compositeSituationalUnitRawSchema>

export const compositeCognitiveUnitRawSchema = z.object({
  unitType: z.literal('COGNITIVE'),
  itemId: nonEmptyText,
  randomSeed: nonEmptyText,
  trials: z.array(z.unknown()).max(20000),
  summaryMeta: z.record(z.string(), z.unknown()).optional(),
  lockedAt: isoDateTimeSchema.optional(),
}).strict()
export type CompositeCognitiveUnitRawV1 = z.infer<typeof compositeCognitiveUnitRawSchema>

export const compositeUnitRawSchema = z.discriminatedUnion('unitType', [
  compositeScaleUnitRawSchema,
  compositeFormSectionUnitRawSchema,
  compositeSituationalUnitRawSchema,
  compositeCognitiveUnitRawSchema,
])
export type CompositeUnitRawV1 = z.infer<typeof compositeUnitRawSchema>

export const compositeFinalRawSchema = z.object({
  schemaVersion: z.literal(1),
  attemptId: nonEmptyText,
  attemptEpoch: z.number().int().min(1),
  submissionId: nonEmptyText,
  payloadHash: hashSchema,
  completedAt: isoDateTimeSchema,
  units: z.record(z.string(), compositeUnitRawSchema),
}).strict()
export type CompositeFinalRawV1 = z.infer<typeof compositeFinalRawSchema>

export const compositeUnitSeedsSchema = z.object({
  schemaVersion: z.literal(1),
  attemptId: nonEmptyText,
  attemptEpoch: z.number().int().min(1),
  seeds: z.record(z.string(), nonEmptyText),
}).strict()
export type CompositeUnitSeedsV1 = z.infer<typeof compositeUnitSeedsSchema>

export const lockedCognitiveCheckpointUnitSchema = z.object({
  unitType: z.literal('COGNITIVE'),
  itemId: nonEmptyText,
  randomSeed: nonEmptyText,
  trials: z.array(z.unknown()).max(20000),
  summaryMeta: z.record(z.string(), z.unknown()).optional(),
  lockedAt: isoDateTimeSchema,
  payloadHash: hashSchema,
}).strict()

export const lockedSituationalCheckpointUnitSchema = z.object({
  unitType: z.literal('SITUATIONAL'),
  itemId: nonEmptyText,
  responses: z.record(z.string(), z.unknown()),
  researchEvents: z.array(z.unknown()).max(10000).optional(),
  totalTimeMs: z.number().finite().min(0).optional(),
  lockedAt: isoDateTimeSchema,
  payloadHash: hashSchema,
}).strict()

export const lockedCheckpointUnitSchema = z.discriminatedUnion('unitType', [
  lockedCognitiveCheckpointUnitSchema,
  lockedSituationalCheckpointUnitSchema,
])
export type LockedCheckpointUnitV1 = z.infer<typeof lockedCheckpointUnitSchema>

export const compositeAttemptCheckpointEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  publicationHash: hashSchema,
  drafts: z.record(z.string(), z.record(z.string(), z.unknown())),
  itemTimings: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  lockedUnits: z.record(z.string(), lockedCheckpointUnitSchema),
}).strict()
export type CompositeAttemptCheckpointEnvelopeV1 = z.infer<typeof compositeAttemptCheckpointEnvelopeSchema>

export type CompositeFinalKey = {
  attemptId: string
  attemptEpoch: number
}

export const compositeFinalKeyString = (key: CompositeFinalKey): string => `${key.attemptId}:${key.attemptEpoch}`

export type HydratedScaleUnitResult = {
  result: ScaleResultV2
  canonical: import('./unit-result').CanonicalUnitResultEnvelopeV1 | null
}
