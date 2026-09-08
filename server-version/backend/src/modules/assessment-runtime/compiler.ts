import { scaleDefinitionSchema, type ScaleDefinitionV2 } from '../scale/scale-definition'
import { hashSituationDefinition, validateSituationDefinition, type SituationDefinitionV1 } from '../situational/situation-definition'
import type { TaskDefinition } from '../cognitive/v2/types'
import { canonicalHash, CANONICAL_JSON_SHA256_V1 } from './canonical'
import { z } from 'zod'
import type {
  CompiledInstrumentRuntimeV1,
  CompiledMetricDefinitionV1,
  CompiledQualityDefinitionV1,
  JsonObject,
  RuntimeInstrumentType,
} from './types'

export const UNIFIED_RUNTIME_COMPILER_VERSION = 'unified-runtime-v32-unit-1'

const compiledMetricDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().optional(),
  valueType: z.string().min(1),
  direction: z.string().optional(),
  role: z.string().optional(),
}).strict()

const compiledQualityDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
}).strict()

const compiledRuntimeSchema = z.object({
  schemaVersion: z.literal(1),
  compilerVersion: z.string().min(1),
  instrumentType: z.enum(['SCALE', 'COGNITIVE', 'SITUATIONAL', 'BUNDLE']),
  instrumentKey: z.string().min(1),
  instrumentVersion: z.string().min(1),
  sourceDefinitionHash: z.string().regex(/^[0-9a-f]{64}$/),
  compiledRuntimeHash: z.string().regex(/^[0-9a-f]{64}$/),
  hashScheme: z.literal(CANONICAL_JSON_SHA256_V1),
  scorerKey: z.string().nullable(),
  scorerVersion: z.string().min(1),
  metricDefinitions: z.record(compiledMetricDefinitionSchema),
  qualityDefinitions: z.record(compiledQualityDefinitionSchema),
  reportDefinition: z.record(z.unknown()),
  aggregateProjection: z.object({
    allowedMetricKeys: z.array(z.string()),
    allowedFactKeys: z.array(z.string()),
    allowedReferenceClassifications: z.array(z.string()),
  }).strict(),
  referenceBindingDefinition: z.object({
    required: z.boolean(),
    selections: z.array(z.object({
      referenceKey: z.string().min(1),
      referenceVersion: z.string().min(1),
      scoreKey: z.string().optional(),
      referenceKind: z.string().optional(),
      profileKey: z.string().optional(),
    }).strict()),
  }).strict(),
  runtimeCapabilities: z.object({
    standalone: z.boolean(),
    embedded: z.boolean(),
    aggregateEligible: z.boolean(),
    collectionFacts: z.boolean(),
    supported: z.boolean(),
  }).strict(),
}).strict()

const compileMetrics = (entries: Array<{
  key: string
  label: string
  unit?: string
  valueType: string
  direction?: string
  role?: string
}>): Record<string, CompiledMetricDefinitionV1> => Object.fromEntries(
  entries.map((entry) => [entry.key, {
    key: entry.key,
    label: entry.label,
    ...(entry.unit ? { unit: entry.unit } : {}),
    valueType: entry.valueType,
    ...(entry.direction ? { direction: entry.direction } : {}),
    ...(entry.role ? { role: entry.role } : {}),
  }]),
)

const compileQuality = (entries: Array<CompiledQualityDefinitionV1>): Record<string, CompiledQualityDefinitionV1> => (
  Object.fromEntries(entries.map((entry) => [entry.key, entry]))
)

const completeRuntime = (base: Omit<CompiledInstrumentRuntimeV1, 'compiledRuntimeHash' | 'hashScheme'>): CompiledInstrumentRuntimeV1 => {
  const compiledRuntimeHash = canonicalHash(base)
  return {
    ...base,
    compiledRuntimeHash,
    hashScheme: CANONICAL_JSON_SHA256_V1,
  }
}

export const parseCompiledInstrumentRuntime = (value: unknown): CompiledInstrumentRuntimeV1 => {
  const parsed = compiledRuntimeSchema.parse(value) as CompiledInstrumentRuntimeV1
  const { compiledRuntimeHash: _hash, hashScheme: _scheme, ...base } = parsed
  if (canonicalHash(base) !== parsed.compiledRuntimeHash) {
    throw new Error('compiled runtime hash mismatch')
  }
  return parsed
}

const runtimeIdentity = (input: {
  instrumentType: RuntimeInstrumentType
  instrumentKey: string
  instrumentVersion: string
  sourceDefinitionHash?: string
}): string => input.sourceDefinitionHash ?? canonicalHash({
  instrumentType: input.instrumentType,
  instrumentKey: input.instrumentKey,
  instrumentVersion: input.instrumentVersion,
})

export const compileScaleRuntime = (input: {
  instrumentKey: string
  instrumentVersion: string
  definition: ScaleDefinitionV2
  sourceDefinitionHash?: string
}): CompiledInstrumentRuntimeV1 => {
  const definition = scaleDefinitionSchema.parse(input.definition)
  const selections = definition.referencePolicy.type === 'declared'
    ? definition.referencePolicy.selections.map((selection) => ({
        referenceKey: input.instrumentKey,
        referenceVersion: selection.referenceVersion,
        scoreKey: selection.scoreKey,
        referenceKind: selection.referenceKind,
      }))
    : []
  const metricDefinitions = compileMetrics(definition.scoring.scores.map((score) => ({
    key: score.key,
    label: score.label,
    unit: 'score',
    valueType: 'number',
    direction: score.direction,
    role: score.canonical ? 'primary' : 'secondary',
  })))
  const qualityDefinitions = compileQuality([
    { key: 'interpretable', label: '可解释', description: '结果满足量表定义的解释条件。' },
    { key: 'limited', label: '有限', description: '结果可计算但解释受到数据质量限制。' },
    { key: 'invalid', label: '无效', description: '结果不满足可解释条件。' },
  ])
  const base = {
    schemaVersion: 1 as const,
    compilerVersion: UNIFIED_RUNTIME_COMPILER_VERSION,
    instrumentType: 'SCALE' as const,
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    sourceDefinitionHash: runtimeIdentity({ ...input, instrumentType: 'SCALE' }),
    scorerKey: definition.scoring.scorerKey ?? 'scale.default',
    scorerVersion: definition.scoring.scoringVersion,
    metricDefinitions,
    qualityDefinitions,
    reportDefinition: definition.report as unknown as JsonObject,
    aggregateProjection: {
      allowedMetricKeys: Object.keys(metricDefinitions),
      allowedFactKeys: ['quality.status', 'quality.flag.*'],
      allowedReferenceClassifications: [...new Set(selections.map((selection) => selection.referenceKind))],
    },
    referenceBindingDefinition: {
      required: selections.length > 0,
      selections,
    },
    runtimeCapabilities: {
      standalone: true,
      embedded: true,
      aggregateEligible: true,
      collectionFacts: false,
      supported: true,
    },
  }
  return completeRuntime(base)
}

export const compileCognitiveRuntime = (input: {
  definition: TaskDefinition<unknown, unknown>
  instrumentVersion?: string
  sourceDefinitionHash?: string
}): CompiledInstrumentRuntimeV1 => {
  const definition = input.definition
  const metricDefinitions = compileMetrics(Object.values(definition.metrics).map((metric) => ({
    key: metric.key,
    label: metric.label,
    unit: metric.unit,
    valueType: metric.valueType,
    direction: metric.direction,
    role: metric.role,
  })))
  const qualityDefinitions = compileQuality(Object.values(definition.quality).map((quality) => ({
    key: quality.key,
    label: quality.label,
    description: quality.description,
  })))
  const selections = definition.references.map((reference) => ({
    referenceKey: definition.testType,
    referenceVersion: reference.referenceVersion,
    scoreKey: reference.metricKey,
    referenceKind: reference.referenceKind,
  }))
  const base = {
    schemaVersion: 1 as const,
    compilerVersion: UNIFIED_RUNTIME_COMPILER_VERSION,
    instrumentType: 'COGNITIVE' as const,
    instrumentKey: definition.testType,
    instrumentVersion: input.instrumentVersion ?? definition.engineVersion,
    sourceDefinitionHash: input.sourceDefinitionHash ?? canonicalHash({
      schemaVersion: definition.schemaVersion,
      testType: definition.testType,
      name: definition.name,
      category: definition.category,
      engineVersion: definition.engineVersion,
      scoringVersion: definition.scoringVersion,
      protocol: definition.protocol,
      metrics: definition.metrics,
      quality: definition.quality,
      report: definition.report,
      references: definition.references,
    }),
    scorerKey: definition.testType,
    scorerVersion: definition.scoringVersion,
    metricDefinitions,
    qualityDefinitions,
    reportDefinition: definition.report as unknown as JsonObject,
    aggregateProjection: {
      allowedMetricKeys: Object.keys(metricDefinitions),
      allowedFactKeys: ['quality.status', 'quality.flag.*'],
      allowedReferenceClassifications: [...new Set(selections.map((selection) => selection.referenceKind))],
    },
    referenceBindingDefinition: {
      required: selections.length > 0,
      selections,
    },
    runtimeCapabilities: {
      standalone: true,
      embedded: true,
      aggregateEligible: true,
      collectionFacts: false,
      supported: true,
    },
  }
  return completeRuntime(base)
}

export const compileSituationRuntime = (input: {
  instrumentKey: string
  instrumentVersion: string
  definition: SituationDefinitionV1
  sourceDefinitionHash?: string
}): CompiledInstrumentRuntimeV1 => {
  const validation = validateSituationDefinition(input.definition)
  const definitionErrors = validation.issues.filter((issue) => issue.severity === 'error')
  if (!validation.definition || definitionErrors.length > 0) {
    throw new Error(`Situational definition is invalid: ${definitionErrors.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`)
  }
  const definition = validation.definition
  const computedDefinitionHash = hashSituationDefinition(definition)
  if (input.sourceDefinitionHash !== undefined && input.sourceDefinitionHash !== computedDefinitionHash) {
    throw new Error('Situational sourceDefinitionHash must match the authoritative definition hash')
  }
  const metricDefinitions = compileMetrics(definition.scoring.publishedMetrics.map((metric) => ({
    key: metric.key,
    label: metric.label,
    unit: 'score',
    valueType: 'number',
    direction: metric.direction,
    role: metric.role,
  })))
  const qualityDefinitions = compileQuality([
    { key: 'interpretable', label: '可解释', description: '结果满足情境化测评定义的解释条件。' },
    { key: 'limited', label: '有限', description: '结果可计算但解释受到数据质量限制。' },
    { key: 'invalid', label: '无效', description: '结果不满足可解释条件。' },
  ])
  const base = {
    schemaVersion: 1 as const,
    compilerVersion: UNIFIED_RUNTIME_COMPILER_VERSION,
    instrumentType: 'SITUATIONAL' as const,
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    // Definition-content identity is authoritative: a caller may provide the
    // expected hash for verification, but can never override the definition.
    sourceDefinitionHash: computedDefinitionHash,
    scorerKey: 'situational.default',
    scorerVersion: definition.scoring.scoringVersion,
    metricDefinitions,
    qualityDefinitions,
    reportDefinition: definition.report as unknown as JsonObject,
    aggregateProjection: {
      allowedMetricKeys: Object.keys(metricDefinitions),
      allowedFactKeys: ['quality.status', 'quality.flag.*'],
      allowedReferenceClassifications: [],
    },
    referenceBindingDefinition: { required: false, selections: [] },
    // Staged capabilities: only what the unified runtime supports TODAY.
    // The PR that lands each path (standalone submit → PR-B, composite/
    // aggregate → PR-D) flips the corresponding flag — never ahead of code.
    runtimeCapabilities: {
      standalone: false,
      embedded: false,
      aggregateEligible: false,
      collectionFacts: false,
      supported: false,
    },
  }
  return completeRuntime(base)
}

export const compileBundleRuntime = (input: {
  instrumentKey: string
  instrumentVersion: string
  sourceDefinitionHash: string
  reportDefinition?: JsonObject
  aggregateProjection?: CompiledInstrumentRuntimeV1['aggregateProjection']
  referenceBindingDefinition?: CompiledInstrumentRuntimeV1['referenceBindingDefinition']
}): CompiledInstrumentRuntimeV1 => completeRuntime({
  schemaVersion: 1,
  compilerVersion: UNIFIED_RUNTIME_COMPILER_VERSION,
  instrumentType: 'BUNDLE',
  instrumentKey: input.instrumentKey,
  instrumentVersion: input.instrumentVersion,
  sourceDefinitionHash: input.sourceDefinitionHash,
  scorerKey: null,
  scorerVersion: 'bundle-runtime-v1',
  metricDefinitions: {},
  qualityDefinitions: {},
  reportDefinition: input.reportDefinition ?? {},
  aggregateProjection: input.aggregateProjection ?? {
    allowedMetricKeys: [],
    allowedFactKeys: [],
    allowedReferenceClassifications: [],
  },
  referenceBindingDefinition: input.referenceBindingDefinition ?? { required: false, selections: [] },
  runtimeCapabilities: {
    standalone: false,
    embedded: true,
    aggregateEligible: true,
    collectionFacts: true,
    supported: true,
  },
})
