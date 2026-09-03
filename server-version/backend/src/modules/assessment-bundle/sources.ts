/**
 * Narrow frozen unit projections for Bundle engines.
 * Engines read these only — never raw trials/answers, never Prisma.
 * Deliberately smaller than CognitiveResultSnapshot / ScaleResultV2.
 */

export type BundleFrozenSourceQualityV1 = 'interpretable' | 'limited' | 'invalid'

export interface BundleFrozenCognitiveSourceV1 {
  slotKey: string
  instrumentKey: string
  instrumentVersion: string
  sourceResultHash: string
  metrics: Record<string, unknown>
  qualityState: BundleFrozenSourceQualityV1
  /**
   * True only when the frozen Cognitive result carried usable reference norms
   * for the selected metrics. Without this, engines must not classify abnormality.
   */
  hasReferenceNorms: boolean
}

export interface BundleFrozenScaleScoreV1 {
  scoreKey: string
  value: number | null
  status: 'calculated' | 'limited' | 'not_calculable'
  /** Frozen criterionBand.key only — never a display label. */
  criterionBandKey: string | null
}

export interface BundleFrozenScaleSourceV1 {
  slotKey: string
  instrumentKey: string
  instrumentVersion: string
  sourceResultHash: string
  qualityState: BundleFrozenSourceQualityV1
  scores: BundleFrozenScaleScoreV1[]
}
