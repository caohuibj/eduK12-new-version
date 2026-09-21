import { z } from 'zod'
import { canonicalHash } from './canonical'
import { compileScaleRuntime, parseCompiledInstrumentRuntime } from './compiler'
import { hashScaleDefinition, scaleDefinitionSchema, type ScaleDefinitionV2 } from '../scale/scale-definition'
import {
  compiledScalePolicyV1Schema,
  hashCompiledScalePolicy,
  parseCompiledScalePolicy,
  type CompiledScalePolicyV1,
} from '../scale/policy/compile'
import type { CompiledInstrumentRuntimeV1, ReferenceBindingSnapshot } from './types'

export interface FrozenScaleRuntimeSnapshotV2 {
  schemaVersion: 2
  runtimeGeneration: 'UNIFIED_V1'
  frozenAt: string
  instrumentKey: string
  instrumentVersion: string
  sourceDefinitionHash: string
  legacyDefinitionHash: string
  compiledRuntime: CompiledInstrumentRuntimeV1
  referenceBindings: ReferenceBindingSnapshot[]
  definition: ScaleDefinitionV2
  compiledPolicy: CompiledScalePolicyV1
  runtimePolicyHash: string
  snapshotHash: string
}

export interface FrozenScaleRuntimeSnapshotV1Like {
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

const referenceBindingSchema = z.object({
  referenceKey: z.string().min(1),
  referenceVersion: z.string().min(1),
  referenceHash: z.string().regex(/^[0-9a-f]{64}$/),
  scoreKey: z.string().min(1).optional(),
  referenceKind: z.string().min(1).optional(),
  profileKey: z.string().min(1).optional(),
}).strict()

const frozenScaleRuntimeSnapshotV2Schema = z.object({
  schemaVersion: z.literal(2),
  runtimeGeneration: z.literal('UNIFIED_V1'),
  frozenAt: z.string().datetime({ offset: true }),
  instrumentKey: z.string().min(1),
  instrumentVersion: z.string().min(1),
  sourceDefinitionHash: z.string().regex(/^[0-9a-f]{64}$/),
  legacyDefinitionHash: z.string().regex(/^[0-9a-f]{64}$/),
  compiledRuntime: z.record(z.unknown()),
  referenceBindings: z.array(referenceBindingSchema),
  definition: scaleDefinitionSchema,
  compiledPolicy: compiledScalePolicyV1Schema,
  runtimePolicyHash: z.string().regex(/^[0-9a-f]{64}$/),
  snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()

const unsignedV2 = (input: Omit<FrozenScaleRuntimeSnapshotV2, 'snapshotHash'>) => ({
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
  compiledPolicy: input.compiledPolicy,
  runtimePolicyHash: input.runtimePolicyHash,
})

export const hashFrozenScaleRuntimeSnapshotV2 = (snapshot: FrozenScaleRuntimeSnapshotV2): string => (
  canonicalHash(unsignedV2(snapshot))
)

const assertRuntimeAndReferenceIdentity = (snapshot: FrozenScaleRuntimeSnapshotV2): void => {
  if (snapshot.sourceDefinitionHash !== canonicalHash(snapshot.definition)) {
    throw new Error('Frozen Scale V2 source definition hash mismatch')
  }
  if (snapshot.legacyDefinitionHash !== hashScaleDefinition(snapshot.definition)) {
    throw new Error('Frozen Scale V2 legacy definition hash mismatch')
  }
  const compiledRuntime = snapshot.compiledRuntime
  if (
    compiledRuntime.instrumentType !== 'SCALE'
    || compiledRuntime.instrumentKey !== snapshot.instrumentKey
    || compiledRuntime.instrumentVersion !== snapshot.instrumentVersion
    || compiledRuntime.sourceDefinitionHash !== snapshot.sourceDefinitionHash
  ) throw new Error('Frozen Scale V2 compiled runtime identity mismatch')

  const selections = compiledRuntime.referenceBindingDefinition.selections
  if (snapshot.referenceBindings.length !== selections.length) {
    throw new Error('Frozen Scale V2 reference bindings do not match the compiled runtime')
  }
  selections.forEach((selection, index) => {
    const binding = snapshot.referenceBindings[index]
    if (
      !binding
      || binding.referenceKey !== selection.referenceKey
      || binding.referenceVersion !== selection.referenceVersion
      || binding.scoreKey !== selection.scoreKey
      || binding.referenceKind !== selection.referenceKind
    ) throw new Error('Frozen Scale V2 reference binding identity mismatch')
  })

  const policyByVersion = new Map(snapshot.compiledPolicy.referenceBindings.map((binding) => [binding.referenceVersion, binding.referenceHash]))
  snapshot.referenceBindings.forEach((binding) => {
    const expectedHash = policyByVersion.get(binding.referenceVersion)
    if (expectedHash !== undefined && expectedHash !== binding.referenceHash) {
      throw new Error('Frozen Scale V2 reference binding policy hash mismatch')
    }
  })
}

/** PR-1 test/contract factory; production writer upgrades an already-frozen V1 runtime. */
export const createFrozenScaleRuntimeSnapshotV2ForTest = (input: {
  instrumentKey: string
  instrumentVersion: string
  definition: ScaleDefinitionV2
  compiledPolicy: CompiledScalePolicyV1
  referenceBindings?: ReferenceBindingSnapshot[]
  frozenAt?: Date
}): FrozenScaleRuntimeSnapshotV2 => {
  const definition = scaleDefinitionSchema.parse(input.definition)
  const sourceDefinitionHash = canonicalHash(definition)
  const compiledRuntime = compileScaleRuntime({
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    definition,
    sourceDefinitionHash,
  })
  const base: FrozenScaleRuntimeSnapshotV1Like = {
    schemaVersion: 1,
    runtimeGeneration: 'UNIFIED_V1',
    frozenAt: (input.frozenAt ?? new Date()).toISOString(),
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    sourceDefinitionHash,
    legacyDefinitionHash: hashScaleDefinition(definition),
    compiledRuntime,
    referenceBindings: input.referenceBindings ?? [],
    definition,
    snapshotHash: '0'.repeat(64),
  }
  return createFrozenScaleRuntimeSnapshotV2FromV1(base, input.compiledPolicy)
}

export const createFrozenScaleRuntimeSnapshotV2FromV1 = (
  v1: FrozenScaleRuntimeSnapshotV1Like,
  compiledPolicyInput: CompiledScalePolicyV1,
): FrozenScaleRuntimeSnapshotV2 => {
  const compiledPolicy = parseCompiledScalePolicy(compiledPolicyInput)
  if (
    compiledPolicy.instrumentKey !== v1.instrumentKey
    || compiledPolicy.instrumentVersion !== v1.instrumentVersion
  ) throw new Error('Compiled Scale policy identity mismatch')
  if (hashCompiledScalePolicy(compiledPolicy) !== compiledPolicy.runtimePolicyHash) {
    throw new Error('Compiled Scale policy hash mismatch')
  }
  const unsigned: Omit<FrozenScaleRuntimeSnapshotV2, 'snapshotHash'> = {
    schemaVersion: 2,
    runtimeGeneration: v1.runtimeGeneration,
    frozenAt: v1.frozenAt,
    instrumentKey: v1.instrumentKey,
    instrumentVersion: v1.instrumentVersion,
    sourceDefinitionHash: v1.sourceDefinitionHash,
    legacyDefinitionHash: v1.legacyDefinitionHash,
    compiledRuntime: v1.compiledRuntime,
    referenceBindings: v1.referenceBindings,
    definition: v1.definition,
    compiledPolicy,
    runtimePolicyHash: compiledPolicy.runtimePolicyHash,
  }
  const snapshot: FrozenScaleRuntimeSnapshotV2 = { ...unsigned, snapshotHash: canonicalHash(unsignedV2(unsigned)) }
  assertRuntimeAndReferenceIdentity(snapshot)
  return snapshot
}

export const parseFrozenScaleRuntimeSnapshotV2 = (value: unknown): FrozenScaleRuntimeSnapshotV2 => {
  const rawSnapshot = frozenScaleRuntimeSnapshotV2Schema.parse(value)
  const snapshot: FrozenScaleRuntimeSnapshotV2 = {
    ...rawSnapshot,
    compiledRuntime: parseCompiledInstrumentRuntime(rawSnapshot.compiledRuntime),
    compiledPolicy: parseCompiledScalePolicy(rawSnapshot.compiledPolicy),
  }
  if (hashFrozenScaleRuntimeSnapshotV2(snapshot) !== snapshot.snapshotHash) {
    throw new Error('Frozen Scale V2 runtime snapshot hash mismatch')
  }
  if (
    hashCompiledScalePolicy(snapshot.compiledPolicy) !== snapshot.runtimePolicyHash
    || snapshot.compiledPolicy.runtimePolicyHash !== snapshot.runtimePolicyHash
  ) throw new Error('Frozen Scale V2 runtime policy hash mismatch')
  if (
    snapshot.compiledPolicy.instrumentKey !== snapshot.instrumentKey
    || snapshot.compiledPolicy.instrumentVersion !== snapshot.instrumentVersion
  ) throw new Error('Frozen Scale V2 runtime policy identity mismatch')
  assertRuntimeAndReferenceIdentity(snapshot)
  return snapshot
}

export type VersionedFrozenScaleRuntimeSnapshot = FrozenScaleRuntimeSnapshotV1Like | FrozenScaleRuntimeSnapshotV2

/** Compatibility export retained for PR-1/PR-2 callers. Lazy V1 require avoids a module-init cycle. */
export const parseVersionedFrozenScaleRuntimeSnapshot = (value: unknown): VersionedFrozenScaleRuntimeSnapshot => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Frozen Scale runtime snapshot')
  const schemaVersion = (value as { schemaVersion?: unknown }).schemaVersion
  if (schemaVersion === 2) return parseFrozenScaleRuntimeSnapshotV2(value)
  if (schemaVersion === 1) {
    const { parseFrozenScaleRuntimeSnapshot } = require('./runtime-snapshot') as typeof import('./runtime-snapshot')
    return parseFrozenScaleRuntimeSnapshot(value)
  }
  throw new Error(`Unsupported Frozen Scale runtime snapshot schemaVersion: ${String(schemaVersion)}`)
}
