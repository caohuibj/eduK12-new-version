import { z } from 'zod'
import { computeConfigSnapshotHash, computeProtocolSignature, assertProtocolSignature } from './canonical'
import type { ProtocolDefinition, SessionConfigSnapshot, TaskDefinition } from './types'
import { canonicalHash, CANONICAL_JSON_SHA256_V1 } from '../../assessment-runtime/canonical'
import type { CompiledInstrumentRuntimeV1, JsonObject, ReferenceBindingSnapshot } from '../../assessment-runtime/types'
import { parseCompiledInstrumentRuntime } from '../../assessment-runtime/compiler'
import {
  CognitiveFinalSubmissionConfigError,
  resolveCognitiveFinalMaxTrials,
} from './final-submission-budget'
import { cognitivePresentationDefinitionSchema, parseCognitivePresentationDefinition } from './presentation'
import { BAD_REQUEST } from '../cognitive.errors'

const protocolPhaseSchema = z.object({
  key: z.enum(['test', 'learning', 'delayed']),
  persists: z.boolean(),
  required: z.boolean(),
}).strict()

export const protocolDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  key: z.string().min(1),
  version: z.string().min(1),
  clock: z.literal('performance'),
  randomizationAlgorithmVersion: z.string().min(1),
  trialEnvelopeVersion: z.literal(1),
  phases: z.array(protocolPhaseSchema).min(1),
  measurementCriticalConfigPaths: z.array(z.string().min(1)).min(1),
}).strict()

export const sessionConfigSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  frozenAt: z.string().datetime({ offset: true }),
  testType: z.string().min(1),
  configVersion: z.string().min(1),
  engineVersion: z.string().min(1),
  scoringVersion: z.string().min(1),
  config: z.unknown(),
  configHash: z.string().regex(/^[0-9a-f]{64}$/),
  hashScheme: z.literal(CANONICAL_JSON_SHA256_V1).optional(),
  runtimeGeneration: z.literal('UNIFIED_V1').optional(),
  compiledRuntime: z.record(z.unknown()).optional(),
  referenceBindings: z.array(z.object({
    referenceKey: z.string().min(1),
    referenceVersion: z.string().min(1),
    referenceHash: z.string().regex(/^[0-9a-f]{64}$/),
    scoreKey: z.string().min(1).optional(),
    referenceKind: z.string().min(1).optional(),
    profileKey: z.string().min(1).optional(),
    applicability: z.record(z.unknown()).optional(),
  }).strict()).optional(),
  presentation: cognitivePresentationDefinitionSchema.optional(),
  protocol: protocolDefinitionSchema,
  protocolSignature: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()

const freezeReferenceApplicability = <TConfig, TTrial>(
  definition: TaskDefinition<TConfig, TTrial>,
  bindings: ReferenceBindingSnapshot[],
): ReferenceBindingSnapshot[] => bindings.map((binding) => {
  const mapping = definition.references.find((candidate) => (
    candidate.referenceVersion === binding.referenceVersion
    && candidate.metricKey === binding.scoreKey
    && candidate.referenceKind === binding.referenceKind
  ))
  if (!mapping) {
    throw new Error(`Cognitive reference binding ${binding.referenceVersion}/${binding.scoreKey ?? 'unknown'} has no exact applicability mapping`)
  }
  return {
    ...binding,
    applicability: mapping as unknown as JsonObject,
  }
})

export const createSessionConfigSnapshot = <TConfig, TTrial>(input: {
  definition: TaskDefinition<TConfig, TTrial>
  configVersion: string
  config: unknown
  runtime?: {
    runtimeGeneration: 'UNIFIED_V1'
    compiledRuntime: CompiledInstrumentRuntimeV1
    referenceBindings?: ReferenceBindingSnapshot[]
  }
  frozenAt?: Date
}): SessionConfigSnapshot<TConfig> => {
  const validatedConfig = input.definition.configSchema.parse(input.config)
  try {
    resolveCognitiveFinalMaxTrials(input.definition, validatedConfig)
  } catch (error) {
    if (error instanceof CognitiveFinalSubmissionConfigError) {
      throw BAD_REQUEST(
        error.code === 'EXCEEDS_ABSOLUTE_LIMIT'
          ? '该认知任务配置超过最终提交试次数上限，请调整配置后再发布'
          : '该认知任务配置无法满足最终提交试次预算，请检查配置后再发布',
      )
    }
    throw error
  }
  const frozenAt = input.frozenAt ?? new Date()
  if (Number.isNaN(frozenAt.getTime())) throw new Error('Invalid session snapshot frozenAt')
  const presentation = input.definition.presentation
    ? parseCognitivePresentationDefinition(input.definition.presentation)
    : undefined
  const snapshot: SessionConfigSnapshot<TConfig> = {
    schemaVersion: 1,
    frozenAt: frozenAt.toISOString(),
    testType: input.definition.testType,
    configVersion: input.configVersion,
    engineVersion: input.definition.engineVersion,
    scoringVersion: input.definition.scoringVersion,
    config: validatedConfig,
    configHash: input.runtime ? canonicalHash(validatedConfig) : computeConfigSnapshotHash(validatedConfig),
    ...(input.runtime ? {
      hashScheme: CANONICAL_JSON_SHA256_V1,
      runtimeGeneration: input.runtime.runtimeGeneration,
      compiledRuntime: input.runtime.compiledRuntime,
      referenceBindings: freezeReferenceApplicability(input.definition, input.runtime.referenceBindings ?? []),
    } : {}),
    ...(presentation ? { presentation } : {}),
    protocol: input.definition.protocol,
    protocolSignature: computeProtocolSignature(input.definition.protocol),
  }
  return parseSessionConfigSnapshot(snapshot)
}

export const parseSessionConfigSnapshot = <TConfig = unknown>(value: unknown): SessionConfigSnapshot<TConfig> => {
  const parsed = sessionConfigSnapshotSchema.parse(value) as SessionConfigSnapshot<TConfig>
  const expectedConfigHash = parsed.hashScheme === CANONICAL_JSON_SHA256_V1
    ? canonicalHash(parsed.config)
    : computeConfigSnapshotHash(parsed.config)
  if (expectedConfigHash !== parsed.configHash) {
    throw new Error('config snapshot hash mismatch')
  }
  const hasUnifiedMetadata = Boolean(parsed.hashScheme || parsed.runtimeGeneration || parsed.compiledRuntime || parsed.referenceBindings)
  if (hasUnifiedMetadata) {
    if (parsed.hashScheme !== CANONICAL_JSON_SHA256_V1 || parsed.runtimeGeneration !== 'UNIFIED_V1' || !parsed.compiledRuntime) {
      throw new Error('unified cognitive session snapshot metadata is incomplete')
    }
    const compiledRuntime = parseCompiledInstrumentRuntime(parsed.compiledRuntime)
    if (compiledRuntime.instrumentType !== 'COGNITIVE'
      || compiledRuntime.instrumentKey !== parsed.testType
      || compiledRuntime.instrumentVersion !== parsed.engineVersion
      || compiledRuntime.scorerVersion !== parsed.scoringVersion) {
      throw new Error('unified cognitive compiled runtime identity does not match the session snapshot')
    }
    const referenceBindings = parsed.referenceBindings ?? []
    const expectedSelections = compiledRuntime.referenceBindingDefinition.selections
    if (referenceBindings.length !== expectedSelections.length) {
      throw new Error('unified cognitive session reference bindings do not match the compiled runtime')
    }
    expectedSelections.forEach((selection, index) => {
      const binding = referenceBindings[index]
      if (
        !binding
        || binding.referenceKey !== selection.referenceKey
        || binding.referenceVersion !== selection.referenceVersion
        || binding.scoreKey !== selection.scoreKey
        || binding.referenceKind !== selection.referenceKind
      ) {
        throw new Error('unified cognitive session reference binding identity mismatch')
      }
    })
    if (compiledRuntime.referenceBindingDefinition.required && referenceBindings.length === 0) {
      throw new Error('unified cognitive session snapshot is missing reference bindings')
    }
  }
  assertProtocolSignature(parsed)
  return parsed
}

export const tryParseSessionConfigSnapshot = <TConfig = unknown>(value: unknown): SessionConfigSnapshot<TConfig> | null => {
  const parsed = sessionConfigSnapshotSchema.safeParse(value)
  if (!parsed.success) return null
  try {
    return parseSessionConfigSnapshot<TConfig>(parsed.data)
  } catch {
    return null
  }
}

export const isSessionConfigSnapshot = (value: unknown): value is SessionConfigSnapshot => (
  tryParseSessionConfigSnapshot(value) !== null
)

const looksLikeSessionConfigSnapshot = (value: unknown): boolean => (
  Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.prototype.hasOwnProperty.call(value, 'protocol')
      || Object.prototype.hasOwnProperty.call(value, 'protocolSignature')),
  )
)

export const sessionConfigFromStoredValue = <TConfig = unknown>(value: unknown): {
  config: TConfig
  snapshot: SessionConfigSnapshot<TConfig> | null
} => {
  // A legacy session stores the parsed task config directly. Once a stored
  // value advertises the v2 snapshot fields, malformed metadata must fail
  // closed instead of silently being treated as a legacy config.
  const snapshot = looksLikeSessionConfigSnapshot(value)
    ? parseSessionConfigSnapshot<TConfig>(value)
    : null
  return snapshot ? { config: snapshot.config, snapshot } : { config: value as TConfig, snapshot: null }
}

export const protocolForSnapshot = (snapshot: SessionConfigSnapshot): ProtocolDefinition => snapshot.protocol
