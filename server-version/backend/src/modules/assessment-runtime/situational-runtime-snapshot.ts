import {
  situationalOpaqueKeySchema,
  situationalStimulusSchema,
  situationDefinitionSchema,
} from '../situational/situation-definition'
import {
  situationalBranchFlowSchema,
  situationalBranchSamplingSchema,
  situationDefinitionV2Schema,
} from '../situational/situation-branching'
import {
  hashSituationRuntimeDefinition,
  runnerSituationRuntimeDefinition,
  validateSituationRuntimeDefinition,
  type SituationRuntimeDefinition,
} from '../situational/situation-runtime-definition'
import { compileSituationRuntime, parseCompiledInstrumentRuntime } from './compiler'
import { canonicalHash } from './canonical'
import { decryptUnifiedRuntimePayload, encryptUnifiedRuntimePayload } from './security'
import type { CompiledInstrumentRuntimeV1 } from './types'
import { z } from 'zod'

export interface FrozenSituationalRuntimeSnapshotV1 {
  /** Snapshot envelope version. Definition schema may be Situational V1 or V2. */
  schemaVersion: 1
  runtimeGeneration: 'UNIFIED_V1'
  frozenAt: string
  instrumentKey: string
  instrumentVersion: string
  definitionHash: string
  compiledRuntimeHash: string
  scorerKey: string
  scoringVersion: string
  definition: SituationRuntimeDefinition
  runnerDefinition: ReturnType<typeof runnerSituationRuntimeDefinition>
  compiledRuntime: CompiledInstrumentRuntimeV1
  snapshotHash: string
}

const runnerChannelSchema = z.union([
  z.object({
    channelKey: situationalOpaqueKeySchema,
    responseType: z.literal('SINGLE_CHOICE'),
    prompt: z.string().min(1),
    required: z.literal(false).optional(),
    options: z.array(z.object({
      optionKey: situationalOpaqueKeySchema,
      label: z.string().min(1),
    }).strict()).min(2),
  }).strict(),
  z.object({
    channelKey: situationalOpaqueKeySchema,
    responseType: z.literal('CONTINUOUS'),
    prompt: z.string().min(1),
    required: z.literal(false).optional(),
    range: z.object({ min: z.number().finite(), max: z.number().finite() }).strict(),
  }).strict(),
])

const runnerSceneSchema = z.object({
  sceneKey: situationalOpaqueKeySchema,
  title: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  stimulus: situationalStimulusSchema,
  channels: z.array(runnerChannelSchema).min(1).max(3),
}).strict()

const runnerDefinitionV1Schema = z.object({
  schemaVersion: z.literal(1),
  respondentType: z.string().min(1),
  sampling: z.object({ strategy: z.literal('ALL') }).strict(),
  scenes: z.array(runnerSceneSchema).min(1),
}).strict()

const runnerDefinitionV2Schema = z.object({
  schemaVersion: z.literal(2),
  respondentType: z.string().min(1),
  sampling: situationalBranchSamplingSchema,
  scenes: z.array(runnerSceneSchema).min(1),
  flow: situationalBranchFlowSchema,
}).strict()

const frozenSituationalRuntimeSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  runtimeGeneration: z.literal('UNIFIED_V1'),
  frozenAt: z.string().datetime({ offset: true }),
  instrumentKey: z.string().min(1),
  instrumentVersion: z.string().min(1),
  definitionHash: z.string().regex(/^[0-9a-f]{64}$/),
  compiledRuntimeHash: z.string().regex(/^[0-9a-f]{64}$/),
  scorerKey: z.string().min(1),
  scoringVersion: z.string().min(1),
  definition: z.union([situationDefinitionSchema, situationDefinitionV2Schema]),
  runnerDefinition: z.union([runnerDefinitionV1Schema, runnerDefinitionV2Schema]),
  compiledRuntime: z.record(z.unknown()),
  snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()

const unsignedSnapshot = (input: Omit<FrozenSituationalRuntimeSnapshotV1, 'snapshotHash'>) => ({
  schemaVersion: input.schemaVersion,
  runtimeGeneration: input.runtimeGeneration,
  frozenAt: input.frozenAt,
  instrumentKey: input.instrumentKey,
  instrumentVersion: input.instrumentVersion,
  definitionHash: input.definitionHash,
  compiledRuntimeHash: input.compiledRuntimeHash,
  scorerKey: input.scorerKey,
  scoringVersion: input.scoringVersion,
  definition: input.definition,
  runnerDefinition: input.runnerDefinition,
  compiledRuntime: input.compiledRuntime,
})

const assertPilotCapabilities = (runtime: CompiledInstrumentRuntimeV1): void => {
  const expected = {
    standalone: true,
    embedded: true,
    aggregateEligible: true,
    collectionFacts: false,
    supported: true,
  }
  const keys = Object.keys(expected) as Array<keyof typeof expected>
  const actual = runtime.runtimeCapabilities
  const hasExpectedKeys = Object.keys(actual).length === keys.length
  const hasExpectedValues = keys.every((key) => actual[key] === expected[key])
  if (!hasExpectedKeys || !hasExpectedValues) {
    throw new Error('Situational runtime capabilities are not the embedded pilot contract')
  }
}

const buildFrozenSnapshot = (input: {
  instrumentKey: string
  instrumentVersion: string
  definition: SituationRuntimeDefinition
  frozenAt?: Date
}): FrozenSituationalRuntimeSnapshotV1 => {
  const validation = validateSituationRuntimeDefinition(input.definition)
  const definitionErrors = validation.issues.filter((issue) => issue.severity === 'error')
  if (!validation.definition || definitionErrors.length > 0) {
    throw new Error('Situational definition cannot be frozen')
  }
  const definition = validation.definition
  const definitionHash = hashSituationRuntimeDefinition(definition)
  const compiledRuntime = compileSituationRuntime({
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    definition,
    sourceDefinitionHash: definitionHash,
  })
  assertPilotCapabilities(compiledRuntime)
  const frozenAt = input.frozenAt ?? new Date()
  if (Number.isNaN(frozenAt.getTime())) throw new Error('Invalid frozen Situational runtime snapshot frozenAt')
  const runnerDefinition = runnerSituationRuntimeDefinition(definition)
  const unsigned = unsignedSnapshot({
    schemaVersion: 1,
    runtimeGeneration: 'UNIFIED_V1',
    frozenAt: frozenAt.toISOString(),
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    definitionHash,
    compiledRuntimeHash: compiledRuntime.compiledRuntimeHash,
    scorerKey: compiledRuntime.scorerKey ?? 'situational.default',
    scoringVersion: definition.scoring.scoringVersion,
    definition,
    runnerDefinition,
    compiledRuntime,
  })
  return { ...unsigned, snapshotHash: canonicalHash(unsigned) }
}

/** Freeze the complete authoritative definition once, before an attempt exists. */
export const freezeSituationalRuntimeAtAttemptStart = (input: {
  instrumentKey: string
  instrumentVersion: string
  definition: SituationRuntimeDefinition
  frozenAt?: Date
}): FrozenSituationalRuntimeSnapshotV1 => buildFrozenSnapshot(input)

export const hashFrozenSituationalRuntimeSnapshot = (snapshot: FrozenSituationalRuntimeSnapshotV1): string => (
  canonicalHash(unsignedSnapshot(snapshot))
)

export const parseFrozenSituationalRuntimeSnapshot = (value: unknown): FrozenSituationalRuntimeSnapshotV1 => {
  const parsed = frozenSituationalRuntimeSnapshotSchema.parse(value) as unknown as FrozenSituationalRuntimeSnapshotV1
  const validation = validateSituationRuntimeDefinition(parsed.definition)
  const definitionErrors = validation.issues.filter((issue) => issue.severity === 'error')
  if (!validation.definition || definitionErrors.length > 0) throw new Error('Frozen Situational definition is invalid')
  const definition = validation.definition
  const definitionHash = hashSituationRuntimeDefinition(definition)
  if (parsed.definitionHash !== definitionHash) throw new Error('Frozen Situational definition hash mismatch')
  if (canonicalHash(parsed.runnerDefinition) !== canonicalHash(runnerSituationRuntimeDefinition(definition))) {
    throw new Error('Frozen Situational runner definition mismatch')
  }
  const compiledRuntime = parseCompiledInstrumentRuntime(parsed.compiledRuntime)
  if (
    compiledRuntime.instrumentType !== 'SITUATIONAL'
    || compiledRuntime.instrumentKey !== parsed.instrumentKey
    || compiledRuntime.instrumentVersion !== parsed.instrumentVersion
    || compiledRuntime.sourceDefinitionHash !== parsed.definitionHash
    || compiledRuntime.compiledRuntimeHash !== parsed.compiledRuntimeHash
    || compiledRuntime.scorerKey !== parsed.scorerKey
    || compiledRuntime.scorerVersion !== parsed.scoringVersion
  ) {
    throw new Error('Frozen Situational compiled runtime identity mismatch')
  }
  assertPilotCapabilities(compiledRuntime)
  const unsigned = unsignedSnapshot({
    schemaVersion: parsed.schemaVersion,
    runtimeGeneration: parsed.runtimeGeneration,
    frozenAt: parsed.frozenAt,
    instrumentKey: parsed.instrumentKey,
    instrumentVersion: parsed.instrumentVersion,
    definitionHash: parsed.definitionHash,
    compiledRuntimeHash: parsed.compiledRuntimeHash,
    scorerKey: parsed.scorerKey,
    scoringVersion: parsed.scoringVersion,
    definition,
    runnerDefinition: parsed.runnerDefinition,
    compiledRuntime,
  })
  if (canonicalHash(unsigned) !== parsed.snapshotHash) throw new Error('Frozen Situational runtime snapshot hash mismatch')
  return { ...unsigned, snapshotHash: parsed.snapshotHash }
}

export const encryptFrozenSituationalRuntimeSnapshot = (snapshot: FrozenSituationalRuntimeSnapshotV1): string => (
  encryptUnifiedRuntimePayload(snapshot)
)

export const decryptFrozenSituationalRuntimeSnapshot = (encrypted: string): FrozenSituationalRuntimeSnapshotV1 => (
  parseFrozenSituationalRuntimeSnapshot(decryptUnifiedRuntimePayload<unknown>(encrypted))
)
