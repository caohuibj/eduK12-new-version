/** Explicit synthetic fixtures for contract tests and a cloud-only preview. Never imported by EnumerationTask. */
import { enumerationConfig } from './generated/protocol'
import type { EnumerationContext } from './display'
export function enumerationFixtureContext(width = 390, height = 844): EnumerationContext {
  return { contextId: 'synthetic-enumeration-context', attemptId: 'synthetic-enumeration-attempt', usage: 'INTERNAL_REVIEW_ONLY',
    config: enumerationConfig('experience'), randomSeed: 'synthetic-enumeration-ui-20261026', language: 'zh',
    calibration: { id: 'synthetic-calibration-not-physical', source: 'synthetic_fixture', referenceMm: 50,
      referenceCssPx: 348, viewingDistanceMm: 500, viewportWidthCssPx: width, viewportHeightCssPx: height,
      devicePixelRatio: 1, visualViewportScale: 1 },
    recipe: { id: 'synthetic-approved-layout-nominal-recipe-not-validated', source: 'synthetic_fixture',
      status: 'CANDIDATE_RECIPE_NOT_VALIDATED', fieldShape: 'square_background_circular_sampling_proposal',
      fieldDiameterDeg: 5, dotDiameterDeg: 0.5, fieldColor: '#808080', dotColor: '#FFFFFF',
      fixationMs: 1000, formalExposureMs: 50, practiceExposureMs: 1000, maskMs: 1000,
      mask: { rows: 48, columns: 48, values: ['#141414', '#EBEBEB'], seed: 20261026,
        algorithm: 'lcg1664525-1013904223-u32-topbit', scope: 'session_fixed' } } }
}
