import type {
  BundleContextFactsV1,
  BundleReportFactsV1,
  FrozenAssessmentBundleSnapshotV3,
} from '../assessment-bundle/types'
import type { BundleEngineResultV1 } from '../assessment-bundle/registry'
import type { BundleFrozenCognitiveSourceV1, BundleFrozenScaleSourceV1, BundleFrozenSituationalSourceV1 } from '../assessment-bundle/sources'

/**
 * Explicit versioned Bundle reanalysis — Commit 15 / Prep 15.1.
 * Reuses original frozen unit results + Context only.
 * Always creates a new analysis snapshot/history; never overwrites old.
 * Definition-only freeze is NOT enough — must dispatch engine + regenerate ReportFacts.
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
  /** Canonical Situational projections; omitted only for older callers without SJT slots. */
  frozenSituationalSources?: BundleFrozenSituationalSourceV1[]
  /** Original frozen Context facts (required when target declares Context). */
  frozenContextFacts: BundleContextFactsV1 | null
  /**
   * Caller-supplied aggregate provenance. When non-null, must match the
   * recomputed reanalysis provenance hash; otherwise reject.
   */
  aggregateInputHash: string | null
  actorUserId: string
  /**
   * Analysis-instance identity for SafetyCase uniqueness across reanalyses
   * that share the same content hash (e.g. prior analysisSnapshotId).
   */
  analysisInstanceId?: string | null
}

export type BundleReanalysisRejectReasonV1 =
  | 'TARGET_BUNDLE_UNKNOWN'
  | 'TARGET_VERSION_UNKNOWN'
  | 'MISSING_REQUIRED_CONTEXT'
  | 'CONTEXT_DEFINITION_MISMATCH'
  | 'MISSING_REQUIRED_SOURCE'
  | 'DUPLICATE_SOURCE_SLOT'
  | 'UNKNOWN_SOURCE_SLOT'
  | 'INCOMPATIBLE_SOURCE_VERSION'
  | 'AGGREGATE_INPUT_HASH_MISMATCH'
  | 'RAW_READ_FORBIDDEN'

/** Append-only analysis history entry produced by every successful reanalysis. */
export interface BundleReanalysisHistoryEntryV1 {
  historyId: string
  createdAt: string
  actorUserId: string
  targetBundleKey: string
  targetBundleVersion: string
  priorSnapshotHash: string | null
  newSnapshotHash: string
  reportFactsHash: string
  aggregateInputHash: string
  analysisInstanceId: string
}

export type BundleReanalysisResultV1 =
  | {
      ok: true
      request: BundleReanalysisRequestV1
      /** Always a newly built snapshot — never the prior snapshot object. */
      newSnapshot: FrozenAssessmentBundleSnapshotV3
      priorSnapshotHash: string | null
      /** Regenerated via BundleAnalysisEngineRegistry.dispatch + projectBundleReportFacts. */
      reportFacts: BundleReportFactsV1
      engineResult: BundleEngineResultV1
      /** Recomputed provenance — never trust caller blindly. */
      aggregateInputHash: string
      /** New history row — callers must persist; never overwrite prior analysis. */
      history: BundleReanalysisHistoryEntryV1
      safetyTriggered: boolean
      /** When safety triggers, callers must open a NEW SafetyCase. */
      openNewSafetyCase: boolean
    }
  | {
      ok: false
      reason: BundleReanalysisRejectReasonV1
      message: string
    }
