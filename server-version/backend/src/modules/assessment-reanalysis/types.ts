import type { BundleContextFactsV1, FrozenAssessmentBundleSnapshotV3 } from '../assessment-bundle/types'
import type { BundleFrozenCognitiveSourceV1, BundleFrozenScaleSourceV1 } from '../assessment-bundle/sources'

/**
 * Explicit versioned Bundle reanalysis — Commit 15.
 * Reuses original frozen unit results + Context only.
 * Always creates a new snapshot; never overwrites old.
 * reanalysis ≠ rescoring; no raw reads.
 */
export interface BundleReanalysisRequestV1 {
  schemaVersion: 1
  targetBundleKey: string
  targetBundleVersion: string
  /** Frozen Cognitive unit projections from the original attempt. */
  frozenCognitiveSources: BundleFrozenCognitiveSourceV1[]
  /** Frozen Scale unit projections from the original attempt. */
  frozenScaleSources: BundleFrozenScaleSourceV1[]
  /** Original frozen Context facts (required when target declares Context). */
  frozenContextFacts: BundleContextFactsV1 | null
  aggregateInputHash: string | null
  actorUserId: string
}

export type BundleReanalysisRejectReasonV1 =
  | 'TARGET_BUNDLE_UNKNOWN'
  | 'TARGET_VERSION_UNKNOWN'
  | 'MISSING_REQUIRED_CONTEXT'
  | 'CONTEXT_DEFINITION_MISMATCH'
  | 'INCOMPATIBLE_SOURCE_VERSION'
  | 'RAW_READ_FORBIDDEN'

export type BundleReanalysisResultV1 =
  | {
      ok: true
      request: BundleReanalysisRequestV1
      /** Always a newly built snapshot — never the prior snapshot object. */
      newSnapshot: FrozenAssessmentBundleSnapshotV3
      priorSnapshotHash: string | null
      safetyTriggered: boolean
      /** When safety triggers, callers must open a NEW SafetyCase. */
      openNewSafetyCase: boolean
    }
  | {
      ok: false
      reason: BundleReanalysisRejectReasonV1
      message: string
    }
