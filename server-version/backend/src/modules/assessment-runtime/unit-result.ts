import type { ScaleResultV2 } from '../scale/scale-result'
import type { CognitiveResultSnapshot } from '../cognitive/v2/types'
import { canonicalHash, CANONICAL_JSON_SHA256_V1, canonicalJsonBytes } from './canonical'
import type {
  CompiledInstrumentRuntimeV1,
  JsonValue,
  ReferenceBindingSnapshot,
} from './types'
import { z } from 'zod'

export interface MetricFactV1 {
  key: string
  value: JsonValue
  unit?: string
  quality?: string
}

export interface MachineFactV1 {
  key: string
  value: string | number | boolean | null
}

export interface ReferenceFactV1 {
  key: string
  referenceVersion: string
  referenceHash: string | null
  classification: string | null
  scoreKey?: string
  status: 'available' | 'unavailable'
  value: number | null
  z: number | null
  percentile: number | null
}

export interface CanonicalUnitResultCoreV1 {
  schemaVersion: 1
  unitType: 'SCALE' | 'COGNITIVE'
  instrumentKey: string
  instrumentVersion: string
  sourceDefinitionHash: string
  compilerVersion: string
  compiledRuntimeHash: string
  scorerKey: string
  scorerVersion: string
  quality: {
    status: 'interpretable' | 'limited' | 'invalid'
    flags: string[]
  }
  metrics: MetricFactV1[]
  facts: MachineFactV1[]
  references: ReferenceFactV1[]
  contextHash: string | null
  scientificProvenance: {
    instrumentKey: string
    instrumentVersion: string
    protocolSignature?: string
    profileKey?: string | null
    /** Present for Cognitive aggregate results; optional for legacy/Scale payloads. */
    resolvedConfigHash?: string | null
  }
}

export interface CanonicalUnitResultEnvelopeV1 {
  core: CanonicalUnitResultCoreV1
  resultHash: string
  hashScheme: typeof CANONICAL_JSON_SHA256_V1
  completedAt: string
  persistenceProvenance: {
    sourceType: 'ASSESSMENT' | 'COGNITIVE_SESSION'
    sourceAttemptId: string
    sourceSubmissionId?: string
  }
}

const assertJsonValue = (value: unknown): JsonValue => {
  canonicalJsonBytes(value)
  return value as JsonValue
}

const isAllowed = (key: string, allowed: string[]): boolean => (
  allowed.some((candidate) => candidate === key || (candidate.endsWith('.*') && key.startsWith(candidate.slice(0, -1))))
)

const qualityFacts = (
  quality: CanonicalUnitResultCoreV1['quality'],
  allowed: string[],
): MachineFactV1[] => {
  const facts: MachineFactV1[] = []
  if (isAllowed('quality.status', allowed)) facts.push({ key: 'quality.status', value: quality.status })
  for (const flag of quality.flags) {
    const key = `quality.flag.${flag}`
    if (isAllowed(key, allowed)) facts.push({ key, value: true })
  }
  return facts
}

const referenceHashFor = (reference: {
  referenceVersion: string
  scoreKey?: string
  referenceKind?: string
}, bindings: ReferenceBindingSnapshot[]): string | null => (
  bindings.find((binding) => binding.referenceVersion === reference.referenceVersion
    && (!binding.scoreKey || !reference.scoreKey || binding.scoreKey === reference.scoreKey)
    && (!binding.referenceKind || !reference.referenceKind || binding.referenceKind === reference.referenceKind))?.referenceHash ?? null
)

type ReferenceFactSource = {
  scoreKey?: string
  referenceVersion: string
  referenceKind?: string
  status: 'available' | 'unavailable'
  value?: number | null
  z?: number | null
  percentile?: { value?: number | null } | null
}

const referenceFactSource = (value: unknown): ReferenceFactSource => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed reference fact source')
  const reference = value as Record<string, unknown>
  if (typeof reference.referenceVersion !== 'string' || !reference.referenceVersion) {
    throw new Error('Malformed reference fact source version')
  }
  if (reference.status !== 'available' && reference.status !== 'unavailable') {
    throw new Error('Malformed reference fact source status')
  }
  const optionalString = (key: string): string | undefined => {
    const candidate = reference[key]
    if (candidate === undefined || candidate === null) return undefined
    if (typeof candidate !== 'string') throw new Error(`Malformed reference fact source ${key}`)
    return candidate
  }
  const numericOrNull = (key: string): number | null => {
    const candidate = reference[key]
    if (candidate === undefined || candidate === null) return null
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) throw new Error(`Malformed reference fact source ${key}`)
    return candidate
  }
  const percentile = reference.percentile
  const percentileValue = percentile === undefined || percentile === null
    ? undefined
    : percentile && typeof percentile === 'object' && !Array.isArray(percentile)
      ? (percentile as Record<string, unknown>).value
      : (() => { throw new Error('Malformed reference fact source percentile') })()
  return {
    ...(optionalString('scoreKey') === undefined ? {} : { scoreKey: optionalString('scoreKey') }),
    referenceVersion: reference.referenceVersion,
    ...(optionalString('referenceKind') === undefined ? {} : { referenceKind: optionalString('referenceKind') }),
    status: reference.status,
    value: numericOrNull('value'),
    z: numericOrNull('z'),
    percentile: { value: numericOrNullValue(percentileValue) },
  }
}

const numericOrNullValue = (value: unknown): number | null => {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Malformed reference fact source percentile value')
  return value
}

const referenceFactFrom = (
  value: unknown,
  bindings: ReferenceBindingSnapshot[],
  allowedReferenceClassifications: string[],
): ReferenceFactV1 => {
  const reference = referenceFactSource(value)
  if (!reference.referenceKind || !allowedReferenceClassifications.includes(reference.referenceKind)) {
    throw new Error(
      `Reference classification ${reference.referenceKind ?? '<missing>'} is not declared by the compiled runtime`,
    )
  }
  return {
    key: `${reference.scoreKey ?? ''}:${reference.referenceVersion}:${reference.referenceKind ?? ''}`,
    referenceVersion: reference.referenceVersion,
    referenceHash: referenceHashFor(reference, bindings),
    classification: reference.referenceKind ?? null,
    ...(reference.scoreKey === undefined ? {} : { scoreKey: reference.scoreKey }),
    status: reference.status,
    value: reference.value ?? null,
    z: reference.z ?? null,
    percentile: reference.percentile?.value ?? null,
  }
}

const baseCore = (runtime: CompiledInstrumentRuntimeV1, input: {
  unitType: 'SCALE' | 'COGNITIVE'
  quality: CanonicalUnitResultCoreV1['quality']
  metrics: MetricFactV1[]
  facts: MachineFactV1[]
  references: ReferenceFactV1[]
  contextHash: string | null
  protocolSignature?: string
  profileKey?: string | null
  resolvedConfigHash?: string | null
}): CanonicalUnitResultCoreV1 => ({
  schemaVersion: 1,
  unitType: input.unitType,
  instrumentKey: runtime.instrumentKey,
  instrumentVersion: runtime.instrumentVersion,
  sourceDefinitionHash: runtime.sourceDefinitionHash,
  compilerVersion: runtime.compilerVersion,
  compiledRuntimeHash: runtime.compiledRuntimeHash,
  scorerKey: runtime.scorerKey ?? `${input.unitType.toLowerCase()}.default`,
  scorerVersion: runtime.scorerVersion,
  quality: input.quality,
  metrics: input.metrics,
  facts: input.facts,
  references: input.references,
  contextHash: input.contextHash,
  scientificProvenance: {
    instrumentKey: runtime.instrumentKey,
    instrumentVersion: runtime.instrumentVersion,
    ...(input.protocolSignature ? { protocolSignature: input.protocolSignature } : {}),
    ...(input.profileKey === undefined ? {} : { profileKey: input.profileKey }),
    ...(input.resolvedConfigHash === undefined ? {} : { resolvedConfigHash: input.resolvedConfigHash }),
  },
})

export const projectScaleCanonicalUnitResult = (input: {
  result: ScaleResultV2
  runtime: CompiledInstrumentRuntimeV1
  contextHash: string | null
  referenceBindings?: ReferenceBindingSnapshot[]
}): CanonicalUnitResultCoreV1 => {
  const allowed = new Set(input.runtime.aggregateProjection.allowedMetricKeys)
  for (const score of input.result.scores) {
    if (!allowed.has(score.key)) throw new Error(`Scale score ${score.key} is not declared by the compiled runtime`)
  }
  const metrics = input.result.scores
    .filter((score) => allowed.has(score.key))
    .map((score) => ({
      key: score.key,
      value: assertJsonValue(score.value),
      unit: 'score',
      quality: score.status,
    }))
    .sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
  const quality = {
    status: input.result.quality.status,
    flags: [...input.result.quality.flags].sort(),
  }
  const references = input.result.references
    .map((reference) => referenceFactFrom(
      reference,
      input.referenceBindings ?? [],
      input.runtime.aggregateProjection.allowedReferenceClassifications,
    ))
    .sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
  return baseCore(input.runtime, {
    unitType: 'SCALE',
    quality,
    metrics,
    facts: qualityFacts(quality, input.runtime.aggregateProjection.allowedFactKeys),
    references,
    contextHash: input.contextHash,
  })
}

export const projectCognitiveCanonicalUnitResult = (input: {
  snapshot: CognitiveResultSnapshot
  runtime: CompiledInstrumentRuntimeV1
  contextHash: string | null
  referenceBindings?: ReferenceBindingSnapshot[]
  resolvedConfigHash: string
}): CanonicalUnitResultCoreV1 => {
  if (!/^[0-9a-f]{64}$/.test(input.resolvedConfigHash)) {
    throw new Error('Cognitive resolved config hash must be a lowercase SHA-256 hex digest')
  }
  const allowed = new Set(input.runtime.aggregateProjection.allowedMetricKeys)
  const metricEntries = Object.entries(input.snapshot.metrics)
  for (const [key] of metricEntries) {
    if (!allowed.has(key)) throw new Error(`Cognitive metric ${key} is not declared by the compiled runtime`)
  }
  const metrics = metricEntries.map(([key, value]) => ({
    key,
    value: assertJsonValue(value),
    ...(input.runtime.metricDefinitions[key]?.unit ? { unit: input.runtime.metricDefinitions[key].unit } : {}),
  })).sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
  const quality = {
    status: input.snapshot.quality.state,
    flags: Object.entries(input.snapshot.quality.flags)
      .filter(([, value]) => value)
      .map(([key]) => key)
      .sort(),
  }
  const references = input.snapshot.references
    .map((reference) => referenceFactFrom(
      reference,
      input.referenceBindings ?? [],
      input.runtime.aggregateProjection.allowedReferenceClassifications,
    ))
    .sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
  return baseCore(input.runtime, {
    unitType: 'COGNITIVE',
    quality,
    metrics,
    facts: qualityFacts(quality, input.runtime.aggregateProjection.allowedFactKeys),
    references,
    contextHash: input.contextHash,
    protocolSignature: input.snapshot.protocolSignature,
    profileKey: input.snapshot.profile,
    resolvedConfigHash: input.resolvedConfigHash,
  })
}

export const createCanonicalUnitResultEnvelope = (input: {
  core: CanonicalUnitResultCoreV1
  completedAt: Date | string
  persistenceProvenance: CanonicalUnitResultEnvelopeV1['persistenceProvenance']
}): CanonicalUnitResultEnvelopeV1 => {
  const completedAt = input.completedAt instanceof Date ? input.completedAt.toISOString() : input.completedAt
  if (Number.isNaN(Date.parse(completedAt))) throw new Error('Invalid canonical unit result completedAt')
  return {
    core: input.core,
    resultHash: canonicalHash(input.core),
    hashScheme: CANONICAL_JSON_SHA256_V1,
    completedAt,
    persistenceProvenance: input.persistenceProvenance,
  }
}

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(jsonValueSchema),
])) as z.ZodType<JsonValue>

const metricFactSchema = z.object({
  key: z.string().min(1),
  value: jsonValueSchema,
  unit: z.string().optional(),
  quality: z.string().optional(),
}).strict()

const machineFactSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
}).strict()

const referenceFactSchema = z.object({
  key: z.string().min(1),
  referenceVersion: z.string().min(1),
  referenceHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  classification: z.string().nullable(),
  scoreKey: z.string().optional(),
  status: z.enum(['available', 'unavailable']),
  value: z.number().finite().nullable(),
  z: z.number().finite().nullable(),
  percentile: z.number().finite().nullable(),
}).strict()

const canonicalUnitResultCoreSchema = z.object({
  schemaVersion: z.literal(1),
  unitType: z.enum(['SCALE', 'COGNITIVE']),
  instrumentKey: z.string().min(1),
  instrumentVersion: z.string().min(1),
  sourceDefinitionHash: z.string().min(1),
  compilerVersion: z.string().min(1),
  compiledRuntimeHash: z.string().regex(/^[0-9a-f]{64}$/),
  scorerKey: z.string().min(1),
  scorerVersion: z.string().min(1),
  quality: z.object({
    status: z.enum(['interpretable', 'limited', 'invalid']),
    flags: z.array(z.string()),
  }).strict(),
  metrics: z.array(metricFactSchema),
  facts: z.array(machineFactSchema),
  references: z.array(referenceFactSchema),
  contextHash: z.string().nullable(),
  scientificProvenance: z.object({
    instrumentKey: z.string().min(1),
    instrumentVersion: z.string().min(1),
    protocolSignature: z.string().optional(),
    profileKey: z.string().nullable().optional(),
    resolvedConfigHash: z.string().regex(/^[0-9a-f]{64}$/).nullable().optional(),
  }).strict(),
}).strict()

const canonicalUnitResultEnvelopeSchema = z.object({
  core: canonicalUnitResultCoreSchema,
  resultHash: z.string().regex(/^[0-9a-f]{64}$/),
  hashScheme: z.literal(CANONICAL_JSON_SHA256_V1),
  completedAt: z.string().min(1),
  persistenceProvenance: z.object({
    sourceType: z.enum(['ASSESSMENT', 'COGNITIVE_SESSION']),
    sourceAttemptId: z.string().min(1),
    sourceSubmissionId: z.string().min(1).optional(),
  }).strict(),
}).strict()

export const parseCanonicalUnitResultEnvelope = (value: unknown): CanonicalUnitResultEnvelopeV1 => {
  const envelope = canonicalUnitResultEnvelopeSchema.parse(value) as CanonicalUnitResultEnvelopeV1
  if (canonicalHash(envelope.core) !== envelope.resultHash) throw new Error('Canonical unit result hash mismatch')
  if (!envelope.completedAt || Number.isNaN(Date.parse(envelope.completedAt))) throw new Error('Invalid canonical unit result completedAt')
  return envelope
}
