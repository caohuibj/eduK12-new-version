import { hashScaleDefinition, scaleDefinitionSchema, type ScaleDefinitionV2 } from '../scale/scale-definition'
import { assertAssessmentOperationallyActive } from '../assessment-governance/operational-hold'
import { compileScaleRuntime, parseCompiledInstrumentRuntime } from './compiler'
import { canonicalHash } from './canonical'
import { decryptUnifiedRuntimePayload, encryptUnifiedRuntimePayload } from './security'
import { freezeExactReferenceBindings } from './reference-binding'
import type { CompiledInstrumentRuntimeV1, ReferenceBindingSnapshot } from './types'
import { z } from 'zod'

export interface FrozenScaleRuntimeSnapshotV1 {
  schemaVersion: 1
  runtimeGeneration: 'UNIFIED_V1'
  frozenAt: string
  instrumentKey: string
  instrumentVersion: string
  sourceDefinitionHash: string
  legacyDefinitionHash: string
  compiledRuntime: CompiledInstrumentRuntimeV1
  referenceBindings: ReferenceBindingSnapshot[]
  definition: ScaleDefinitionV2
  snapshotHash: string
}

const unsignedSnapshot = (input: Omit<FrozenScaleRuntimeSnapshotV1, 'snapshotHash'>) => ({
  schemaVersion: input.schemaVersion,
  runtimeGeneration: input.runtimeGeneration,
  frozenAt: input.frozenAt,
  instrumentKey: input.instrumentKey,
  instrumentVersion: input.instrumentVersion,
  sourceDefinitionHash: input.sourceDefinitionHash,
  legacyDefinitionHash: input.legacyDefinitionHash,
  compiledRuntime: input.compiledRuntime,
  referenceBindings: input.referenceBindings,
  definition: input.definition,
})

const referenceBindingSchema = z.object({
  referenceKey: z.string().min(1),
  referenceVersion: z.string().min(1),
  referenceHash: z.string().regex(/^[0-9a-f]{64}$/),
  scoreKey: z.string().min(1).optional(),
  referenceKind: z.string().min(1).optional(),
  profileKey: z.string().min(1).optional(),
}).strict()

const frozenScaleRuntimeSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  runtimeGeneration: z.literal('UNIFIED_V1'),
  frozenAt: z.string().datetime({ offset: true }),
  instrumentKey: z.string().min(1),
  instrumentVersion: z.string().min(1),
  sourceDefinitionHash: z.string().regex(/^[0-9a-f]{64}$/),
  legacyDefinitionHash: z.string().regex(/^[0-9a-f]{64}$/),
  compiledRuntime: z.record(z.unknown()),
  referenceBindings: z.array(referenceBindingSchema),
  definition: scaleDefinitionSchema,
  snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()

const buildFrozenScaleRuntimeSnapshot = (input: {
  instrumentKey: string
  instrumentVersion: string
  definition: ScaleDefinitionV2
  compiledRuntime: CompiledInstrumentRuntimeV1
  referenceBindings: ReferenceBindingSnapshot[]
  frozenAt?: Date
}): FrozenScaleRuntimeSnapshotV1 => {
  const frozenAt = input.frozenAt ?? new Date()
  if (Number.isNaN(frozenAt.getTime())) throw new Error('Invalid frozen Scale runtime snapshot frozenAt')
  const unsigned = unsignedSnapshot({
    schemaVersion: 1,
    runtimeGeneration: 'UNIFIED_V1',
    frozenAt: frozenAt.toISOString(),
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    sourceDefinitionHash: input.compiledRuntime.sourceDefinitionHash,
    legacyDefinitionHash: hashScaleDefinition(input.definition),
    compiledRuntime: input.compiledRuntime,
    referenceBindings: input.referenceBindings,
    definition: input.definition,
  })
  return { ...unsigned, snapshotHash: canonicalHash(unsigned) }
}

export const createFrozenScaleRuntimeSnapshot = (input: {
  instrumentKey: string
  instrumentVersion: string
  definition: ScaleDefinitionV2
  referenceBindings?: ReferenceBindingSnapshot[]
  frozenAt?: Date
}): FrozenScaleRuntimeSnapshotV1 => {
  const definition = scaleDefinitionSchema.parse(input.definition)
  const compiledRuntime = compileScaleRuntime({
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    definition,
    sourceDefinitionHash: canonicalHash(definition),
  })
  return buildFrozenScaleRuntimeSnapshot({
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    definition,
    compiledRuntime,
    referenceBindings: input.referenceBindings ?? [],
    frozenAt: input.frozenAt,
  })
}

export const freezeScaleRuntimeAtAttemptStart = async (
  db: Parameters<typeof freezeExactReferenceBindings>[0],
  input: {
    instrumentKey: string
    instrumentVersion: string
    definition: ScaleDefinitionV2
    frozenAt?: Date
  },
): Promise<FrozenScaleRuntimeSnapshotV1> => {
  // Manual operational pause is checked before any reference-binding DB read.
  // Parsing an existing frozen snapshot never consults current operational
  // state, so already-started attempts remain completable.
  assertAssessmentOperationallyActive({
    family: 'SCALE',
    key: input.instrumentKey,
    version: input.instrumentVersion,
  })

  const definition = scaleDefinitionSchema.parse(input.definition)
  const compiledRuntime = compileScaleRuntime({
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    definition,
    sourceDefinitionHash: canonicalHash(definition),
  })
  const referenceBindings = await freezeExactReferenceBindings(db, {
    instrumentType: 'SCALE',
    instrumentKey: input.instrumentKey,
    selections: compiledRuntime.referenceBindingDefinition.selections,
  })
  return buildFrozenScaleRuntimeSnapshot({
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    definition,
    compiledRuntime,
    referenceBindings,
    frozenAt: input.frozenAt,
  })
}

export const hashFrozenScaleRuntimeSnapshot = (snapshot: FrozenScaleRuntimeSnapshotV1): string => (
  canonicalHash(unsignedSnapshot(snapshot))
)

export const parseFrozenScaleRuntimeSnapshot = (value: unknown): FrozenScaleRuntimeSnapshotV1 => {
  const snapshot = frozenScaleRuntimeSnapshotSchema.parse(value) as unknown as FrozenScaleRuntimeSnapshotV1
  const definition = snapshot.definition
  const expectedSourceDefinitionHash = canonicalHash(definition)
  if (snapshot.sourceDefinitionHash !== expectedSourceDefinitionHash) {
    throw new Error('Frozen Scale source definition hash mismatch')
  }
  if (snapshot.legacyDefinitionHash !== hashScaleDefinition(definition)) {
    throw new Error('Frozen Scale legacy definition hash mismatch')
  }
  const compiledRuntime = parseCompiledInstrumentRuntime(snapshot.compiledRuntime)
  if (
    compiledRuntime.instrumentType !== 'SCALE'
    || compiledRuntime.instrumentKey !== snapshot.instrumentKey
    || compiledRuntime.instrumentVersion !== snapshot.instrumentVersion
    || compiledRuntime.sourceDefinitionHash !== snapshot.sourceDefinitionHash
  ) {
    throw new Error('Frozen Scale compiled runtime identity mismatch')
  }
  const expectedSelections = compiledRuntime.referenceBindingDefinition.selections
  if (snapshot.referenceBindings.length !== expectedSelections.length) {
    throw new Error('Frozen Scale reference bindings do not match the compiled runtime')
  }
  expectedSelections.forEach((selection, index) => {
    const binding = snapshot.referenceBindings[index]
    if (
      !binding
      || binding.referenceKey !== selection.referenceKey
      || binding.referenceVersion !== selection.referenceVersion
      || binding.scoreKey !== selection.scoreKey
      || binding.referenceKind !== selection.referenceKind
    ) {
      throw new Error('Frozen Scale reference binding identity mismatch')
    }
  })
  const unsigned = unsignedSnapshot({
    schemaVersion: snapshot.schemaVersion,
    runtimeGeneration: snapshot.runtimeGeneration,
    frozenAt: snapshot.frozenAt,
    instrumentKey: snapshot.instrumentKey,
    instrumentVersion: snapshot.instrumentVersion,
    sourceDefinitionHash: snapshot.sourceDefinitionHash,
    legacyDefinitionHash: snapshot.legacyDefinitionHash,
    compiledRuntime,
    referenceBindings: snapshot.referenceBindings,
    definition,
  })
  if (canonicalHash(unsigned) !== snapshot.snapshotHash) throw new Error('Frozen Scale runtime snapshot hash mismatch')
  return { ...unsigned, snapshotHash: snapshot.snapshotHash }
}

export const encryptFrozenScaleRuntimeSnapshot = (snapshot: FrozenScaleRuntimeSnapshotV1): string => (
  encryptUnifiedRuntimePayload(snapshot)
)

export const decryptFrozenScaleRuntimeSnapshot = (encrypted: string): FrozenScaleRuntimeSnapshotV1 => (
  parseFrozenScaleRuntimeSnapshot(decryptUnifiedRuntimePayload<unknown>(encrypted))
)
