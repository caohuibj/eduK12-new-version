import { canonicalHash, CANONICAL_JSON_SHA256_V1 } from './canonical'
import { compileBundleRuntime } from './compiler'
import type { FrozenActiveSlotV1 } from './slot-set'
import type { JsonObject } from './types'
import type { FrozenReportPackageSnapshot } from '../cognitive-analysis/report-package-freeze'

export const UNIFIED_AGGREGATE_HASH_SCHEME = CANONICAL_JSON_SHA256_V1

export type AggregateSnapshotHeader = {
  id?: string
  slotKey: string
  attemptEpoch: number
  unitType: 'SCALE' | 'COGNITIVE' | 'FORM_SECTION' | 'SITUATIONAL'
  terminalState: 'COMPLETED' | 'SKIPPED' | 'NOT_APPLICABLE'
  payloadKind: 'UNIT_RESULT' | 'COLLECTION_FACTS' | 'NONE'
  sourceType: string
  sourceAttemptId: string
  sourceSubmissionId?: string | null
  sourceDefinitionHash?: string | null
  compiledRuntimeHash?: string | null
  canonicalResultEncrypted?: string | null
  collectionFactsEncrypted?: string | null
  completedAt?: Date | string | null
}

export type AggregateCompleteness = {
  ready: boolean
  requiredSlotCount: number
  completedSlotCount: number
  missingSlotKeys: string[]
  invalidSlotKeys: string[]
  progress: number
}

/** An explicitly verified flow path narrows readiness, never the immutable
 * candidate slot set. Only accepted, actually executed units carry snapshots. */
export type AggregatePathCompletenessPolicy = {
  kind: 'TRAINING_FLOW_V1'
  terminal: boolean
  reachedSlotKeys: readonly string[]
  executedSlotKeys: readonly string[]
}

const expectedPayloadKind = (slot: FrozenActiveSlotV1): AggregateSnapshotHeader['payloadKind'] => (
  slot.unitType === 'FORM_SECTION' ? 'COLLECTION_FACTS' : 'UNIT_RESULT'
)

/**
 * Closed-input completeness is intentionally pure. It consumes only the
 * frozen required slot set and snapshot headers; encrypted participant
 * payloads are never needed to decide whether an aggregate may start.
 */
export const evaluateCompleteness = (input: {
  slots: FrozenActiveSlotV1[]
  snapshots: AggregateSnapshotHeader[]
  attemptEpoch: number
  pathPolicy?: AggregatePathCompletenessPolicy | null
}): AggregateCompleteness => {
  if (input.pathPolicy != null) return evaluatePathCompleteness({ ...input, pathPolicy: input.pathPolicy })
  const required = input.slots.filter((slot) => slot.required)
  const requiredByKey = new Map(required.map((slot) => [slot.slotKey, slot]))
  const snapshotsByKey = new Map<string, AggregateSnapshotHeader>()
  const invalidSlotKeys = new Set<string>()

  for (const snapshot of input.snapshots) {
    const slot = requiredByKey.get(snapshot.slotKey)
    if (!slot || snapshotsByKey.has(snapshot.slotKey)) {
      invalidSlotKeys.add(snapshot.slotKey)
      continue
    }
    snapshotsByKey.set(snapshot.slotKey, snapshot)
    if (
      snapshot.attemptEpoch !== input.attemptEpoch
      || snapshot.unitType !== slot.unitType
      // V32-2 has no skip/applicability policy yet. Keep the enum values as
      // schema capability, but only a required COMPLETED snapshot carrying
      // its unit payload may satisfy the closed aggregate contract.
      || snapshot.terminalState !== 'COMPLETED'
      || snapshot.payloadKind !== expectedPayloadKind(slot)
    ) {
      invalidSlotKeys.add(snapshot.slotKey)
    }
  }

  const missingSlotKeys = required
    .filter((slot) => !snapshotsByKey.has(slot.slotKey))
    .map((slot) => slot.slotKey)
  const completedSlotCount = required.filter((slot) => {
    const snapshot = snapshotsByKey.get(slot.slotKey)
    return snapshot?.terminalState === 'COMPLETED'
      && !invalidSlotKeys.has(slot.slotKey)
  }).length
  const ready = missingSlotKeys.length === 0 && invalidSlotKeys.size === 0
  return {
    ready,
    requiredSlotCount: required.length,
    completedSlotCount,
    missingSlotKeys,
    invalidSlotKeys: [...invalidSlotKeys].sort(),
    progress: required.length === 0 ? 100 : Math.min(100, Math.round((completedSlotCount / required.length) * 100)),
  }
}

const evaluatePathCompleteness = (input: {
  slots: FrozenActiveSlotV1[]
  snapshots: AggregateSnapshotHeader[]
  attemptEpoch: number
  pathPolicy: AggregatePathCompletenessPolicy
}): AggregateCompleteness => {
  const policy = input.pathPolicy
  const candidates = new Map(input.slots.map(slot => [slot.slotKey, slot]))
  const reached = new Set(policy.reachedSlotKeys)
  const executed = new Set(policy.executedSlotKeys)
  const invalid = new Set<string>()
  const snapshots = new Map<string, AggregateSnapshotHeader>()
  if (policy.kind !== 'TRAINING_FLOW_V1') invalid.add('training-flow:policy')
  for (const keys of [policy.reachedSlotKeys, policy.executedSlotKeys]) {
    const seen = new Set<string>()
    for (const key of keys) {
      if (!candidates.has(key) || seen.has(key)) invalid.add(key)
      seen.add(key)
    }
  }
  for (const key of executed) if (!reached.has(key)) invalid.add(key)
  for (const snapshot of input.snapshots) {
    const slot = candidates.get(snapshot.slotKey)
    if (!slot || !executed.has(snapshot.slotKey) || snapshots.has(snapshot.slotKey)) {
      invalid.add(snapshot.slotKey)
      continue
    }
    snapshots.set(snapshot.slotKey, snapshot)
    if (snapshot.attemptEpoch !== input.attemptEpoch
      || snapshot.unitType !== slot.unitType
      || snapshot.terminalState !== 'COMPLETED'
      || snapshot.payloadKind !== expectedPayloadKind(slot)) invalid.add(snapshot.slotKey)
  }
  // Reached includes the current pending unit. Even an optional instrument
  // cannot be silently treated as accepted by the aggregate layer.
  const missingSlotKeys = [...reached].filter(key => !snapshots.has(key))
  const completedSlotCount = [...executed].filter(key => snapshots.has(key) && !invalid.has(key)).length
  const ready = policy.terminal && missingSlotKeys.length === 0 && invalid.size === 0
  return {
    ready,
    requiredSlotCount: reached.size,
    completedSlotCount,
    missingSlotKeys,
    invalidSlotKeys: [...invalid].sort(),
    progress: ready ? 100 : reached.size === 0 ? 0 : Math.min(99, Math.round(completedSlotCount / reached.size * 100)),
  }
}

export type AggregateInputHashEntry = {
  slotKey: string
  terminalState: AggregateSnapshotHeader['terminalState']
  payloadKind: AggregateSnapshotHeader['payloadKind']
  resultHash?: string | null
  collectionFactsHash?: string | null
  collectionIdentity?: unknown
}

/**
 * Hash only immutable aggregate inputs. Ciphertext, row ids and timestamps
 * are deliberately excluded so retries and concurrent finalizers converge.
 */
export const buildAggregateInputHash = (input: {
  attemptEpoch: number
  contextHash?: string | null
  compiledBundleRuntimeHash?: string | null
  entries: AggregateInputHashEntry[]
  trainingFlowPath?: { pathHash: string; evidence: unknown } | null
}): string => canonicalHash({
  hashScheme: UNIFIED_AGGREGATE_HASH_SCHEME,
  attemptEpoch: input.attemptEpoch,
  contextHash: input.contextHash ?? null,
  compiledBundleRuntimeHash: input.compiledBundleRuntimeHash ?? null,
  // Do not add even a null member to historical hashes.
  ...(input.trainingFlowPath == null ? {} : { trainingFlowPath: input.trainingFlowPath }),
  slots: [...input.entries]
    .sort((left, right) => left.slotKey < right.slotKey ? -1 : left.slotKey > right.slotKey ? 1 : 0)
    .map((entry) => ({
      slotKey: entry.slotKey,
      terminalState: entry.terminalState,
      payloadKind: entry.payloadKind,
      ...(entry.payloadKind === 'UNIT_RESULT'
        ? { resultHash: entry.resultHash ?? null }
        : {
            collectionFactsHash: entry.collectionFactsHash ?? null,
            collectionIdentity: entry.collectionIdentity ?? null,
          }),
    })),
})

/** Compile the exact bundle identity from the frozen package snapshot. */
export const compileBundleRuntimeFromSnapshot = (
  snapshot: FrozenReportPackageSnapshot,
) => compileBundleRuntime({
  instrumentKey: `report-package:${snapshot.packageKey}`,
  instrumentVersion: snapshot.packageVersion,
  sourceDefinitionHash: canonicalHash({
    snapshotVersion: snapshot.snapshotVersion,
    packageKey: snapshot.packageKey,
    packageVersion: snapshot.packageVersion,
    profile: snapshot.profile,
    packageDefinition: snapshot.packageDefinition,
    analysisProtocolSnapshot: snapshot.analysisProtocolSnapshot,
  }),
  reportDefinition: {
    packageKey: snapshot.packageKey,
    packageVersion: snapshot.packageVersion,
    profile: snapshot.profile,
  } as JsonObject,
})

export const compiledBundleRuntimeHashForSnapshot = (
  snapshot: FrozenReportPackageSnapshot,
): string => compileBundleRuntimeFromSnapshot(snapshot).compiledRuntimeHash
