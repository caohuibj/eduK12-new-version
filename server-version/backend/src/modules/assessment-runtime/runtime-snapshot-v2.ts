import { z } from 'zod'
import { canonicalHash } from './canonical'
import { parseCompiledInstrumentRuntime } from './compiler'
import {
  createFrozenScaleRuntimeSnapshot,
  hashFrozenScaleRuntimeSnapshot,
  parseFrozenScaleRuntimeSnapshot,
  type FrozenScaleRuntimeSnapshotV1,
} from './runtime-snapshot'
import { scaleDefinitionSchema, type ScaleDefinitionV2 } from '../scale/scale-definition'
import {
  compiledScalePolicyV1Schema,
  hashCompiledScalePolicy,
  parseCompiledScalePolicy,
  type CompiledScalePolicyV1,
} from '../scale/policy/compile'
import type { ReferenceBindingSnapshot } from './types'

export interface FrozenScaleRuntimeSnapshotV2 {
  schemaVersion: 2
  runtimeGeneration: 'UNIFIED_V1'
  frozenAt: string
  instrumentKey: string
  instrumentVersion: string
  sourceDefinitionHash: string
  legacyDefinitionHash: string
  compiledRuntime: FrozenScaleRuntimeSnapshotV1['compiledRuntime']
  referenceBindings: ReferenceBindingSnapshot[]
  definition: ScaleDefinitionV2
  compiledPolicy: CompiledScalePolicyV1
  runtimePolicyHash: string
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

/**
 * PR-1 test/contract factory only. Production freezeScaleRuntimeAtAttemptStart
 * remains a V1 writer until PR-3 enables versioned admission end-to-end.
 */
export const createFrozenScaleRuntimeSnapshotV2ForTest = (input: {
  instrumentKey: string
  instrumentVersion: string
  definition: ScaleDefinitionV2
  compiledPolicy: CompiledScalePolicyV1
  referenceBindings?: ReferenceBindingSnapshot[]
  frozenAt?: Date
}): FrozenScaleRuntimeSnapshotV2 => {
  if (
    input.compiledPolicy.instrumentKey !== input.instrumentKey
    || input.compiledPolicy.instrumentVersion !== input.instrumentVersion
  ) {
    throw new Error('Compiled Scale policy identity mismatch')
  }
  if (hashCompiledScalePolicy(input.compiledPolicy) !== input.compiledPolicy.runtimePolicyHash) {
    throw new Error('Compiled Scale policy hash mismatch')
  }
  const v1 = createFrozenScaleRuntimeSnapshot({
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    definition: input.definition,
    referenceBindings: input.referenceBindings,
    frozenAt: input.frozenAt,
  })
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
    compiledPolicy: input.compiledPolicy,
    runtimePolicyHash: input.compiledPolicy.runtimePolicyHash,
  }
  return { ...unsigned, snapshotHash: canonicalHash(unsignedV2(unsigned)) }
}

export const parseFrozenScaleRuntimeSnapshotV2 = (value: unknown): FrozenScaleRuntimeSnapshotV2 => {
  const rawSnapshot = frozenScaleRuntimeSnapshotV2Schema.parse(value)
  const compiledRuntime = parseCompiledInstrumentRuntime(rawSnapshot.compiledRuntime)
  const compiledPolicy = parseCompiledScalePolicy(rawSnapshot.compiledPolicy)
  const snapshot: FrozenScaleRuntimeSnapshotV2 = {
    ...rawSnapshot,
    compiledRuntime,
    compiledPolicy,
  }

  if (hashFrozenScaleRuntimeSnapshotV2(snapshot) !== snapshot.snapshotHash) {
    throw new Error('Frozen Scale V2 runtime snapshot hash mismatch')
  }
  if (hashCompiledScalePolicy(compiledPolicy) !== snapshot.runtimePolicyHash || compiledPolicy.runtimePolicyHash !== snapshot.runtimePolicyHash) {
    throw new Error('Frozen Scale V2 runtime policy hash mismatch')
  }
  if (compiledPolicy.instrumentKey !== snapshot.instrumentKey || compiledPolicy.instrumentVersion !== snapshot.instrumentVersion) {
    throw new Error('Frozen Scale V2 runtime policy identity mismatch')
  }

  // Reuse the unchanged V1 validator for definition/runtime/reference identity
  // invariants without ever adding V2 defaults to a persisted V1 object.
  const v1Unsigned: Omit<FrozenScaleRuntimeSnapshotV1, 'snapshotHash'> = {
    schemaVersion: 1,
    runtimeGeneration: snapshot.runtimeGeneration,
    frozenAt: snapshot.frozenAt,
    instrumentKey: snapshot.instrumentKey,
    instrumentVersion: snapshot.instrumentVersion,
    sourceDefinitionHash: snapshot.sourceDefinitionHash,
    legacyDefinitionHash: snapshot.legacyDefinitionHash,
    compiledRuntime,
    referenceBindings: snapshot.referenceBindings,
    definition: snapshot.definition,
  }
  const v1Candidate: FrozenScaleRuntimeSnapshotV1 = {
    ...v1Unsigned,
    snapshotHash: hashFrozenScaleRuntimeSnapshot({ ...v1Unsigned, snapshotHash: '0'.repeat(64) }),
  }
  parseFrozenScaleRuntimeSnapshot(v1Candidate)
  return snapshot
}

export type VersionedFrozenScaleRuntimeSnapshot = FrozenScaleRuntimeSnapshotV1 | FrozenScaleRuntimeSnapshotV2

export const parseVersionedFrozenScaleRuntimeSnapshot = (value: unknown): VersionedFrozenScaleRuntimeSnapshot => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Frozen Scale runtime snapshot')
  const schemaVersion = (value as { schemaVersion?: unknown }).schemaVersion
  if (schemaVersion === 1) return parseFrozenScaleRuntimeSnapshot(value)
  if (schemaVersion === 2) return parseFrozenScaleRuntimeSnapshotV2(value)
  throw new Error(`Unsupported Frozen Scale runtime snapshot schemaVersion: ${String(schemaVersion)}`)
}
