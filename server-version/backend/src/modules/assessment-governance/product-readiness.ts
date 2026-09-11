/**
 * Cross-family product readiness contract.
 *
 * Product readiness answers one question only: can this exact assessment
 * identity complete the declared Huisurvey product workflow? It deliberately
 * excludes scientific maturity, rights/provenance completeness, norms and
 * research evidence.
 *
 * IMPORTANT PERFORMANCE BOUNDARY:
 * - pure governance contract only;
 * - no database access;
 * - never imported by per-item save, scorer or FINAL hot paths;
 * - intended for registry/build/CI/admin audit surfaces.
 */

export const PRODUCT_READINESS_STAGES = [
  'DEFINITION',
  'RUNTIME_COMPILE',
  'PRESENTATION',
  'RESPONSE',
  'SCORING',
  'FINAL',
  'RESULT',
  'HISTORY_EXPORT',
] as const

export type ProductReadinessStage = (typeof PRODUCT_READINESS_STAGES)[number]

export interface ProductReadinessIssueV1 {
  stage: ProductReadinessStage
  code: string
  message: string
}

export interface ProductReadinessDecisionV1 {
  ready: boolean
  blockers: ProductReadinessIssueV1[]
}

export const productReady = (): ProductReadinessDecisionV1 => ({ ready: true, blockers: [] })

export const productNotReady = (
  blockers: ProductReadinessIssueV1[],
): ProductReadinessDecisionV1 => ({ ready: blockers.length === 0, blockers })

/** Product lifecycle invariant used by CI/catalog audits. */
export const productReleaseMatchesReadiness = (
  releaseStatus: 'DRAFT' | 'PUBLISHED' | 'RETIRED',
  readiness: ProductReadinessDecisionV1,
): boolean => {
  if (releaseStatus === 'PUBLISHED') return readiness.ready
  if (releaseStatus === 'DRAFT') return !readiness.ready
  return true
}
