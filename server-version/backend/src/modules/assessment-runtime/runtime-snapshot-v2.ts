import {frozenScaleInstructionSchema,type FrozenScaleInstruction} from './frozen-scale-instruction'
import { frozenScalePresentationSchema, type FrozenScalePresentation } from '../scale/scale-presentation'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { canonicalHash, canonicalHashObjectParts, retainImmutableCanonicalValue } from './canonical'
import { BoundedArtifactCache, artifactContentKey, jsonArtifactBytes } from './bounded-artifact-cache'
import { parseFrozenScaleRuntimeSnapshot, verifiedLegacyScaleDefinitionHash } from './runtime-snapshot'
import { compileScaleRuntime, parseCompiledInstrumentRuntime } from './compiler'
import { hashScaleDefinition, scaleDefinitionSchema, type ScaleDefinitionV2 } from '../scale/scale-definition'
import {
  compiledScalePolicyV1Schema,
  hashCompiledScalePolicy,
  parseCompiledScalePolicy,
  type CompiledScalePolicyV1,
} from '../scale/policy/compile'
import type { CompiledInstrumentRuntimeV1, ReferenceBindingSnapshot } from './types'

export {frozenScaleInstructionSchema,type FrozenScaleInstruction} from './frozen-scale-instruction'

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
  measurementPresentation?: FrozenScalePresentation
  instruction?: FrozenScaleInstruction | null
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
  measurementPresentation?: FrozenScalePresentation
  instruction?: FrozenScaleInstruction | null
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
  measurementPresentation: frozenScalePresentationSchema.optional(),
  schemaVersion: z.literal(2),
  runtimeGeneration: z.literal('UNIFIED_V1'),
  frozenAt: z.string().datetime({ offset: true }),
  instrumentKey: z.string().min(1),
  instrumentVersion: z.string().min(1),
  sourceDefinitionHash: z.string().regex(/^[0-9a-f]{64}$/),
  legacyDefinitionHash: z.string().regex(/^[0-9a-f]{64}$/),
  compiledRuntime: z.record(z.string(), z.unknown()),
  referenceBindings: z.array(referenceBindingSchema),
  definition: scaleDefinitionSchema,
  compiledPolicy: compiledScalePolicyV1Schema,
  runtimePolicyHash: z.string().regex(/^[0-9a-f]{64}$/),
  instruction: frozenScaleInstructionSchema.nullable().optional(),
  snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()

// Only immutable instrument/policy content is shared, never a respondent,
// attempt, dynamic reference binding, consent, answer or authorization result.
type VerifiedV2Artifact = Pick<FrozenScaleRuntimeSnapshotV2, 'definition' | 'compiledRuntime' | 'compiledPolicy'>
  & { sourceHash: string; legacyHash: string; policyHash: string; bytes: number }
const artifacts = new Map<string, VerifiedV2Artifact>()
const MAX_ENTRIES = 64, MAX_BYTES = 4 * 1024 * 1024
let artifactBytes = 0
const headerSchema = frozenScaleRuntimeSnapshotV2Schema.extend({ definition: z.unknown(), compiledRuntime: z.unknown(), compiledPolicy: z.unknown() })
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
export const frozenScaleV2ArtifactCacheStats = () => ({ entries: artifacts.size, bytes: artifactBytes, maxEntries: MAX_ENTRIES, maxBytes: MAX_BYTES })
const retain = (key: string, value: VerifiedV2Artifact): void => {
  if (value.bytes > MAX_BYTES) return
  while (artifacts.size >= MAX_ENTRIES || artifactBytes + value.bytes > MAX_BYTES) {
    const oldest = artifacts.keys().next().value!
    artifactBytes -= artifacts.get(oldest)!.bytes; artifacts.delete(oldest)
  }
  retainImmutableCanonicalValue(value.definition); retainImmutableCanonicalValue(value.compiledRuntime); retainImmutableCanonicalValue(value.compiledPolicy)
  artifacts.set(key, value); artifactBytes += value.bytes
}

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
  ...(input.measurementPresentation ? { measurementPresentation: input.measurementPresentation } : {}),
  ...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
  compiledPolicy: input.compiledPolicy,
  runtimePolicyHash: input.runtimePolicyHash,
})

export const hashFrozenScaleRuntimeSnapshotV2 = (snapshot: FrozenScaleRuntimeSnapshotV2): string => (
  canonicalHashObjectParts(unsignedV2(snapshot))
)

const assertRuntimeAndReferenceIdentity = (snapshot: FrozenScaleRuntimeSnapshotV2, verified?: VerifiedV2Artifact): void => {
  if (snapshot.sourceDefinitionHash !== (verified?.sourceHash ?? canonicalHash(snapshot.definition))) {
    throw new Error('Frozen Scale V2 source definition hash mismatch')
  }
  if (snapshot.legacyDefinitionHash !== (verified?.legacyHash ?? verifiedLegacyScaleDefinitionHash(snapshot.definition))) {
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

const preparedPolicies = new BoundedArtifactCache<CompiledScalePolicyV1>(64, 2 * 1024 * 1024)
export const preparedScalePolicyCacheStats = () => preparedPolicies.stats()
const preparePolicy = (input: CompiledScalePolicyV1): CompiledScalePolicyV1 => {
  const bytes = process.env.ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED === 'true' ? jsonArtifactBytes(input) : null
  const key = bytes ? artifactContentKey(bytes) : ''
  const known = bytes ? preparedPolicies.get(key) : undefined
  if (known) return known
  const parsed = parseCompiledScalePolicy(input)
  if (bytes) { retainImmutableCanonicalValue(parsed); preparedPolicies.set(key, parsed, bytes.length * 4 + 1024) }
  return parsed
}

export const createFrozenScaleRuntimeSnapshotV2FromV1 = (
  v1: FrozenScaleRuntimeSnapshotV1Like,
  compiledPolicyInput: CompiledScalePolicyV1,
): FrozenScaleRuntimeSnapshotV2 => {
  const compiledPolicy = preparePolicy(compiledPolicyInput)
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
    ...(v1.measurementPresentation ? { measurementPresentation: v1.measurementPresentation } : {}),
    ...(v1.instruction !== undefined ? { instruction: v1.instruction } : {}),
    compiledPolicy,
    runtimePolicyHash: compiledPolicy.runtimePolicyHash,
  }
  const snapshot: FrozenScaleRuntimeSnapshotV2 = { ...unsigned, snapshotHash: canonicalHashObjectParts(unsignedV2(unsigned)) }
  assertRuntimeAndReferenceIdentity(snapshot)
  return snapshot
}

export const parseFrozenScaleRuntimeSnapshotV2 = (value: unknown): FrozenScaleRuntimeSnapshotV2 => {
  const header = headerSchema.parse(value)
  // The key hashes actual canonical content, never only supplied identity hashes.
  const content = process.env.ASSESSMENT_FROZEN_ARTIFACT_CACHE_ENABLED === 'true'
    ? jsonArtifactBytes({ definition: header.definition, compiledRuntime: header.compiledRuntime, compiledPolicy: header.compiledPolicy }) : null
  const key = content ? createHash('sha256').update('verified-scale-v2:').update(content).digest('hex') : ''
  const verified = content ? artifacts.get(key) : undefined
  if (verified) { artifacts.delete(key); artifacts.set(key, verified) }
  const rawSnapshot = verified ? { ...header, definition: verified.definition, compiledRuntime: verified.compiledRuntime, compiledPolicy: verified.compiledPolicy } : frozenScaleRuntimeSnapshotV2Schema.parse(value)
  const snapshot: FrozenScaleRuntimeSnapshotV2 = {
    ...rawSnapshot, definition: verified?.definition ?? rawSnapshot.definition as ScaleDefinitionV2,
    compiledRuntime: verified?.compiledRuntime ?? parseCompiledInstrumentRuntime(rawSnapshot.compiledRuntime),
    compiledPolicy: verified?.compiledPolicy ?? parseCompiledScalePolicy(rawSnapshot.compiledPolicy),
  }
  if (hashFrozenScaleRuntimeSnapshotV2(snapshot) !== snapshot.snapshotHash) {
    throw new Error('Frozen Scale V2 runtime snapshot hash mismatch')
  }
  if (
    (verified?.policyHash ?? hashCompiledScalePolicy(snapshot.compiledPolicy)) !== snapshot.runtimePolicyHash
    || snapshot.compiledPolicy.runtimePolicyHash !== snapshot.runtimePolicyHash
  ) throw new Error('Frozen Scale V2 runtime policy hash mismatch')
  if (
    snapshot.compiledPolicy.instrumentKey !== snapshot.instrumentKey
    || snapshot.compiledPolicy.instrumentVersion !== snapshot.instrumentVersion
  ) throw new Error('Frozen Scale V2 runtime policy identity mismatch')
  assertRuntimeAndReferenceIdentity(snapshot, verified)
  if (content && !verified) retain(key, { definition: snapshot.definition, compiledRuntime: snapshot.compiledRuntime,
    compiledPolicy: snapshot.compiledPolicy, sourceHash: snapshot.sourceDefinitionHash, legacyHash: snapshot.legacyDefinitionHash,
    policyHash: snapshot.runtimePolicyHash, bytes: content.length * 4 + 1024 })
  return snapshot
}

export type VersionedFrozenScaleRuntimeSnapshot = FrozenScaleRuntimeSnapshotV1Like | FrozenScaleRuntimeSnapshotV2

/** Compatibility export retained for PR-1/PR-2 callers. The V1 parser is only called after module initialization. */
export const parseVersionedFrozenScaleRuntimeSnapshot = (value: unknown): VersionedFrozenScaleRuntimeSnapshot => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Frozen Scale runtime snapshot')
  const schemaVersion = (value as { schemaVersion?: unknown }).schemaVersion
  if (schemaVersion === 2) return parseFrozenScaleRuntimeSnapshotV2(value)
  if (schemaVersion === 1) {
    return parseFrozenScaleRuntimeSnapshot(value)
  }
  throw new Error(`Unsupported Frozen Scale runtime snapshot schemaVersion: ${String(schemaVersion)}`)
}
