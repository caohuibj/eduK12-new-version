import { frozenScalePresentationSchema, freezeLibraryScalePresentation, type FrozenScalePresentation } from '../scale/scale-presentation'
import { assertAssessmentStartResources } from '../../services/assessmentResourceProtection'
import { hashScaleDefinition, scaleDefinitionSchema, type ScaleDefinitionV2 } from '../scale/scale-definition'
import { assertAssessmentOperationallyActive } from '../assessment-governance/operational-hold'
import { compileScaleRuntime, parseCompiledInstrumentRuntime } from './compiler'
import { canonicalHash, canonicalHashObjectParts, retainImmutableCanonicalValue, hasImmutableCanonicalValue } from './canonical'
import { BoundedArtifactCache, artifactContentKey, jsonArtifactBytes } from './bounded-artifact-cache'
import { createHash } from 'node:crypto'
import { decryptUnifiedRuntimePayload, encryptUnifiedRuntimePayload } from './security'
import { freezeExactReferenceBindings } from './reference-binding'
import type { CompiledInstrumentRuntimeV1, ReferenceBindingSnapshot } from './types'
import {
  createFrozenScaleRuntimeSnapshotV2FromV1,
  parseFrozenScaleRuntimeSnapshotV2,
  type FrozenScaleRuntimeSnapshotV2,
  frozenScaleInstructionSchema,
  type FrozenScaleInstruction,
} from './runtime-snapshot-v2'
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
  measurementPresentation?: FrozenScalePresentation
  instruction?: FrozenScaleInstruction | null
  snapshotHash: string
}

export type VersionedFrozenScaleRuntimeSnapshot = FrozenScaleRuntimeSnapshotV1 | FrozenScaleRuntimeSnapshotV2

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
  ...(input.measurementPresentation ? { measurementPresentation: input.measurementPresentation } : {}),
  ...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
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
  measurementPresentation: frozenScalePresentationSchema.optional(),
  instruction: frozenScaleInstructionSchema.nullable().optional(),
  schemaVersion: z.literal(1),
  runtimeGeneration: z.literal('UNIFIED_V1'),
  frozenAt: z.string().datetime({ offset: true }),
  instrumentKey: z.string().min(1),
  instrumentVersion: z.string().min(1),
  sourceDefinitionHash: z.string().regex(/^[0-9a-f]{64}$/),
  legacyDefinitionHash: z.string().regex(/^[0-9a-f]{64}$/),
  compiledRuntime: z.record(z.string(), z.unknown()),
  referenceBindings: z.array(referenceBindingSchema),
  definition: scaleDefinitionSchema,
  snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()

// Cache only content-verified, immutable scientific artifacts. Per-attempt
// dates, bindings, context, answers and authorization are never cached.
type VerifiedScaleArtifact = {
  definition: ScaleDefinitionV2; compiledRuntime: CompiledInstrumentRuntimeV1;
  sourceHash: string; legacyHash: string; bytes: number;
}
const verifiedScaleArtifacts = new Map<string, VerifiedScaleArtifact>()
const MAX_SCALE_ARTIFACTS = 64
const MAX_SCALE_ARTIFACT_BYTES = 4 * 1024 * 1024
let scaleArtifactBytes = 0
const frozenScaleRuntimeHeaderSchema = frozenScaleRuntimeSnapshotSchema.extend({
  definition: z.unknown(), compiledRuntime: z.unknown(),
})
const freezeArtifact = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeArtifact(child)
    Object.freeze(value)
  }
  return value
}
export const frozenScaleArtifactCacheStats = () => ({
  entries: verifiedScaleArtifacts.size, bytes: scaleArtifactBytes,
  maxEntries: MAX_SCALE_ARTIFACTS, maxBytes: MAX_SCALE_ARTIFACT_BYTES,
})
const retainScaleArtifact = (key: string, artifact: VerifiedScaleArtifact) => {
  if (artifact.bytes > MAX_SCALE_ARTIFACT_BYTES) return
  while (verifiedScaleArtifacts.size >= MAX_SCALE_ARTIFACTS || scaleArtifactBytes + artifact.bytes > MAX_SCALE_ARTIFACT_BYTES) {
    const oldest = verifiedScaleArtifacts.keys().next().value!
    scaleArtifactBytes -= verifiedScaleArtifacts.get(oldest)!.bytes
    verifiedScaleArtifacts.delete(oldest)
  }
  retainImmutableCanonicalValue(artifact.definition); retainImmutableCanonicalValue(artifact.compiledRuntime)
  verifiedScaleArtifacts.set(key, artifact); scaleArtifactBytes += artifact.bytes
}

type PreparedScale = { definition: ScaleDefinitionV2; compiledRuntime: CompiledInstrumentRuntimeV1; legacyHash: string }
const preparedScales = new BoundedArtifactCache<PreparedScale>(64, 4 * 1024 * 1024)
const preparedScaleAliases = new WeakMap<object, Map<string, string>>()
const legacyHashes = new WeakMap<object, string>()
export const verifiedLegacyScaleDefinitionHash = (definition: ScaleDefinitionV2): string => {
  if (!hasImmutableCanonicalValue(definition)) return hashScaleDefinition(definition)
  const known = legacyHashes.get(definition)
  if (known) return known
  const hash = hashScaleDefinition(definition); legacyHashes.set(definition, hash); return hash
}
export const preparedScaleArtifactCacheStats = () => preparedScales.stats()
const prepareScale = (input: { instrumentKey: string; instrumentVersion: string; definition: ScaleDefinitionV2 }): PreparedScale => {
  const reuseIdentity = process.env.ASSESSMENT_SHARED_CONTROL_ENABLED === 'true'
    && process.env.ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED === 'true' && hasImmutableCanonicalValue(input.definition)
  const identity = JSON.stringify([input.instrumentKey, input.instrumentVersion])
  if (reuseIdentity) {
    const alias = preparedScaleAliases.get(input.definition)?.get(identity)
    const known = alias ? preparedScales.get(alias) : undefined
    if (known) return known // Actual input object was fully verified and deeply frozen.
  }
  const bytes = process.env.ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED === 'true' ? jsonArtifactBytes({ instrumentKey: input.instrumentKey, instrumentVersion: input.instrumentVersion, definition: input.definition }) : null
  const key = bytes ? artifactContentKey(bytes) : ''
  const known = bytes ? preparedScales.get(key) : undefined
  if (known) {
    if (reuseIdentity) {
      let aliases = preparedScaleAliases.get(input.definition)
      if (!aliases) { aliases = new Map(); preparedScaleAliases.set(input.definition, aliases) }
      if (aliases.size < 16) aliases.set(identity, key)
    }
    return known
  }
  const definition = scaleDefinitionSchema.parse(input.definition)
  const compiledRuntime = compileScaleRuntime({ instrumentKey: input.instrumentKey, instrumentVersion: input.instrumentVersion,
    definition, sourceDefinitionHash: canonicalHash(definition) })
  const legacyHash = hashScaleDefinition(definition)
  if (bytes) {
    retainImmutableCanonicalValue(definition); retainImmutableCanonicalValue(compiledRuntime)
    legacyHashes.set(definition, legacyHash)
    // Charge for parsed objects, canonical buffers and bookkeeping. This is a
    // bounded conservative accounting budget, not a claimed heap measurement.
    preparedScales.set(key, { definition, compiledRuntime, legacyHash }, bytes.length * 4 + 1024)
    if (reuseIdentity) {
      for (const object of [input.definition, definition]) {
        let aliases = preparedScaleAliases.get(object)
        if (!aliases) { aliases = new Map(); preparedScaleAliases.set(object, aliases) }
        if (aliases.size < 16) aliases.set(identity, key) // A weak alias never bypasses bounded eviction.
      }
    }

  }
  return { definition, compiledRuntime, legacyHash }
}

const buildFrozenScaleRuntimeSnapshot = (input: {
  instrumentKey: string
  instrumentVersion: string
  definition: ScaleDefinitionV2
  compiledRuntime: CompiledInstrumentRuntimeV1
  referenceBindings: ReferenceBindingSnapshot[]
  frozenAt?: Date
  instruction?: FrozenScaleInstruction | null
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
    legacyDefinitionHash: verifiedLegacyScaleDefinitionHash(input.definition),
    compiledRuntime: input.compiledRuntime,
    referenceBindings: input.referenceBindings,
    definition: input.definition,
    instruction: input.instruction ?? null,
  })
  return { ...unsigned, snapshotHash: canonicalHashObjectParts(unsigned) }
}

export const createFrozenScaleRuntimeSnapshot = (input: {
  instrumentKey: string
  instrumentVersion: string
  definition: ScaleDefinitionV2
  referenceBindings?: ReferenceBindingSnapshot[]
  frozenAt?: Date
  instruction?: FrozenScaleInstruction | null
}): FrozenScaleRuntimeSnapshotV1 => {
  const { definition, compiledRuntime } = prepareScale(input)
  return buildFrozenScaleRuntimeSnapshot({
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    definition,
    compiledRuntime,
    referenceBindings: input.referenceBindings ?? [],
    frozenAt: input.frozenAt,
    instruction: input.instruction,
  })
}

export const freezeScaleRuntimeAtAttemptStart = async (
  db: Parameters<typeof freezeExactReferenceBindings>[0],
  input: {
    instrumentKey: string
    instrumentVersion: string
    definition: ScaleDefinitionV2
    frozenAt?: Date
    requestedMode?: import('../scale/policy/deployment').ScaleDeploymentModeV1
    instruction?: FrozenScaleInstruction | null
    /** Exact DB C pointer from an authorized immutable standard source. */
    importedScaleId?: string
    /** Content facts from an actual immutable education unit, never authority.
     * The owning START layer verifies current U and DB seal containment. */
    sealedLibraryPresentation?: {entryId:string;sourceDefinitionHash:string;presentation:FrozenScalePresentation}
  },
): Promise<VersionedFrozenScaleRuntimeSnapshot> => {
  assertAssessmentStartResources()
  // Manual operational pause is checked before any reference-binding DB read.
  // Parsing an existing frozen snapshot never consults current operational
  // state, so already-started attempts remain completable.
  assertAssessmentOperationallyActive({
    family: 'SCALE',
    key: input.instrumentKey,
    version: input.instrumentVersion,
  })

  const { definition, compiledRuntime } = prepareScale(input)
  const referenceBindings = await freezeExactReferenceBindings(db, {
    instrumentType: 'SCALE',
    instrumentKey: input.instrumentKey,
    selections: compiledRuntime.referenceBindingDefinition.selections,
  })
  const v1 = buildFrozenScaleRuntimeSnapshot({
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    definition,
    compiledRuntime,
    referenceBindings,
    frozenAt: input.frozenAt,
    instruction: input.instruction,
  })

  // Production Prisma clients expose Scale. Lightweight unit doubles used by
  // old V1 contract tests may not; they deliberately keep the exact legacy
  // writer behavior. A real DB resolution error never falls back open.
  const scaleModel = (db as any).scale
  if (!scaleModel || typeof scaleModel.findUnique !== 'function') {
    if (input.importedScaleId) throw new Error('Scale new start denied: DEPLOYMENT_SCALE_MISSING')
    return v1
  }
  const scaleSelect = { id: true, code: true, instrumentVersion: true, instrumentClass: true, status: true, libraryEntryId: true, measurementReleaseId: true, standardSourceKind: true, standardToolKey: true }
  let scale = await scaleModel.findUnique({
    where: input.importedScaleId ? { id: input.importedScaleId } : { code: input.instrumentKey },
    select: scaleSelect,
  })
  if (input.importedScaleId && (!scale || scale.standardSourceKind !== 'DB_IMPORTED' || scale.standardToolKey !== input.instrumentKey || scale.instrumentVersion !== input.instrumentVersion)) {
    throw new Error('Scale new start denied: IMPORTED_SOURCE_IDENTITY_MISMATCH')
  }
  if(!input.importedScaleId&&(!scale||scale.instrumentVersion!==input.instrumentVersion)&&typeof scaleModel.findFirst==='function'){
    const imported=await scaleModel.findFirst({
      where:{standardSourceKind:'DB_IMPORTED',standardToolKey:input.instrumentKey,instrumentVersion:input.instrumentVersion},
      select:scaleSelect,
    })
    if(imported)scale=imported
  }
  if (!scale) throw new Error('Scale new start denied: DEPLOYMENT_SCALE_MISSING')
  if (scale.instrumentVersion !== input.instrumentVersion) throw new Error('Scale new start denied: DEPLOYMENT_VERSION_CONFLICT')

  if (scale.libraryEntryId) {
    if(input.sealedLibraryPresentation){
      const source=input.sealedLibraryPresentation,presentation=frozenScalePresentationSchema.parse(source.presentation)
      if(scale.libraryEntryId!==source.entryId||scale.measurementReleaseId!==presentation.releaseId||v1.sourceDefinitionHash!==source.sourceDefinitionHash)
        throw new Error('Frozen education library presentation identity mismatch')
      v1.measurementPresentation=presentation
    }else v1.measurementPresentation = await freezeLibraryScalePresentation(db as any, scale, input.definition)
    v1.snapshotHash = hashFrozenScaleRuntimeSnapshot(v1)
  }else if(input.sealedLibraryPresentation)throw new Error('Frozen education library source required')

  const { resolveScaleStartDeployment } = await import('../scale/deployment/service')
  const resolution = await resolveScaleStartDeployment({ db: db as any, scale, requestedMode: input.requestedMode })
  if (!resolution.allowNewStarts) {
    throw new Error(`Scale new start denied: ${resolution.reasons.join(',') || 'UNKNOWN'}`)
  }
  if (resolution.kind !== 'MANAGED_V2') return v1
  return createFrozenScaleRuntimeSnapshotV2FromV1(v1, resolution.runtimePolicy)
}

export const hashFrozenScaleRuntimeSnapshot = (snapshot: FrozenScaleRuntimeSnapshotV1): string => (
  canonicalHashObjectParts(unsignedSnapshot(snapshot))
)

export const parseFrozenScaleRuntimeSnapshot = (value: unknown): FrozenScaleRuntimeSnapshotV1 => {
  const header = frozenScaleRuntimeHeaderSchema.parse(value)
  // Hash the ACTUAL content, never trust supplied hash fields as cache keys.
  const artifactContent = process.env.ASSESSMENT_FROZEN_ARTIFACT_CACHE_ENABLED === 'true'
    ? jsonArtifactBytes({ definition: header.definition, compiledRuntime: header.compiledRuntime }) : null
  const artifactKey = artifactContent ? createHash('sha256').update('frozen-scale-artifact-cache-v1:').update(artifactContent).digest('hex') : ''
  const verified = artifactContent ? verifiedScaleArtifacts.get(artifactKey) : undefined
  if (verified) { verifiedScaleArtifacts.delete(artifactKey); verifiedScaleArtifacts.set(artifactKey, verified) }
  const snapshot = (verified
    ? { ...header, definition: verified.definition, compiledRuntime: verified.compiledRuntime }
    : frozenScaleRuntimeSnapshotSchema.parse(value)) as unknown as FrozenScaleRuntimeSnapshotV1
  const definition = snapshot.definition
  const expectedSourceDefinitionHash = verified?.sourceHash ?? canonicalHash(definition)
  if (snapshot.sourceDefinitionHash !== expectedSourceDefinitionHash) {
    throw new Error('Frozen Scale source definition hash mismatch')
  }
  const expectedLegacyHash = verified?.legacyHash ?? hashScaleDefinition(definition)
  if (snapshot.legacyDefinitionHash !== expectedLegacyHash) {
    throw new Error('Frozen Scale legacy definition hash mismatch')
  }
  const compiledRuntime = verified?.compiledRuntime ?? parseCompiledInstrumentRuntime(snapshot.compiledRuntime)
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
    measurementPresentation: snapshot.measurementPresentation,
    instruction: (snapshot as FrozenScaleRuntimeSnapshotV1).instruction,
    definition,
  })
  if (canonicalHashObjectParts(unsigned) !== snapshot.snapshotHash) throw new Error('Frozen Scale runtime snapshot hash mismatch')
  if (!verified && artifactContent) retainScaleArtifact(artifactKey, { definition, compiledRuntime,
    sourceHash: expectedSourceDefinitionHash, legacyHash: expectedLegacyHash, bytes: artifactContent.byteLength * 4 + 1024 })
  return { ...unsigned, snapshotHash: snapshot.snapshotHash }
}

export const parseVersionedFrozenScaleRuntimeSnapshot = (value: unknown): VersionedFrozenScaleRuntimeSnapshot => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Frozen Scale runtime snapshot')
  const schemaVersion = (value as { schemaVersion?: unknown }).schemaVersion
  if (schemaVersion === 1) return parseFrozenScaleRuntimeSnapshot(value)
  if (schemaVersion === 2) return parseFrozenScaleRuntimeSnapshotV2(value)
  throw new Error(`Unsupported Frozen Scale runtime snapshot schemaVersion: ${String(schemaVersion)}`)
}

export const encryptFrozenScaleRuntimeSnapshot = (snapshot: VersionedFrozenScaleRuntimeSnapshot): string => (
  encryptUnifiedRuntimePayload(snapshot)
)

export const decryptFrozenScaleRuntimeSnapshot = (encrypted: string): VersionedFrozenScaleRuntimeSnapshot => (
  parseVersionedFrozenScaleRuntimeSnapshot(decryptUnifiedRuntimePayload<unknown>(encrypted))
)

/** New writes are opt-in; compatible reads remain unconditional for rollback. */
export const persistFrozenScaleRuntimeSnapshot = async (snapshot: VersionedFrozenScaleRuntimeSnapshot, db?: import('./shared-scale-runtime').SharedScaleArtifactDb): Promise<string> => {
  if (process.env.ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED !== 'true') return encryptFrozenScaleRuntimeSnapshot(snapshot)
  const shared = await import('./shared-scale-runtime')
  return shared.sharedScaleRuntimeStore.save(snapshot, db ? shared.sharedScaleArtifactRepositoryForDatabase(db) : undefined)
}
export class FrozenRuntimeStorageUnavailableError extends Error {
  readonly code = 'ASSESSMENT_RUNTIME_UNAVAILABLE'
  readonly statusCode = 503
  readonly retryAfterSeconds = 5
  constructor(cause: unknown) {
    super('冻结的测评内容暂时无法读取，已保存的作答会保留，请稍后重试。')
    Object.defineProperty(this, 'cause', { value: cause })
    this.name = 'FrozenRuntimeStorageUnavailableError'
  }
}
export const loadFrozenScaleRuntimeSnapshot = async (encrypted: string, db?: import('./shared-scale-runtime').SharedScaleArtifactDb): Promise<VersionedFrozenScaleRuntimeSnapshot> => {
  const value = decryptUnifiedRuntimePayload<unknown>(encrypted)
  const shared = await import('./shared-scale-runtime')
  if (!shared.isSharedScaleRuntimeReference(value)) return parseVersionedFrozenScaleRuntimeSnapshot(value)
  try { return await shared.sharedScaleRuntimeStore.load(value, db ? shared.sharedScaleArtifactRepositoryForDatabase(db) : undefined) }
  catch (cause) { throw new FrozenRuntimeStorageUnavailableError(cause) }
}
