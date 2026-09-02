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
  unitType: 'SCALE' | 'COGNITIVE' | 'FORM_SECTION'
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
}): AggregateCompleteness => {
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
}): string => canonicalHash({
  hashScheme: UNIFIED_AGGREGATE_HASH_SCHEME,
  attemptEpoch: input.attemptEpoch,
  contextHash: input.contextHash ?? null,
  compiledBundleRuntimeHash: input.compiledBundleRuntimeHash ?? null,
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
