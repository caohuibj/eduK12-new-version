import type { AssessmentReferenceEntry } from './reference'

export interface ReferenceGovernanceV1 {
  schemaVersion: 1
  kind: 'THEORETICAL_RANGE' | 'LOCAL_PILOT' | 'LOCAL_REFERENCE' | 'MULTISITE_REFERENCE' | 'VALIDATED_NORM' | 'CRITERION'
  subjectKey: string
  schoolStage: 'junior_secondary' | 'upper_secondary'
  locale: string
  populationKey: string
  effectiveFrom: string
  scoreRange: { min: number; max: number }
  bandSource: 'THEORETICAL_SCORE_RANGE' | 'EMPIRICAL_DISTRIBUTION' | 'CRITERION'
  bands: Array<{ key: string; label: string; lower: number; upper: number; sampleN?: number }>
  sampleN: number | null
  sourceDataset: string
  sourceSnapshot: string
  crossStageReReferenceAllowed: boolean
  calibration?: { method: string; missingness: number; floor: number; ceiling: number; skew: number; subgroupReview: string }
}

/** Publication-time checks; never recalibrate from participant submit. */
export function validateReferenceGovernance(entry: Partial<AssessmentReferenceEntry>): string[] {
  const g = entry.governance
  if (!g) return entry.referenceKind === 'theoretical_range' ? ['THEORETICAL_GOVERNANCE_REQUIRED'] : []
  const errors: string[] = []
  if (g.schemaVersion !== 1 || !['THEORETICAL_RANGE','LOCAL_PILOT','LOCAL_REFERENCE','MULTISITE_REFERENCE','VALIDATED_NORM','CRITERION'].includes(g.kind)) errors.push('REFERENCE_KIND_INVALID')
  if (!g.subjectKey || !g.locale || !g.populationKey || !g.sourceDataset || !g.sourceSnapshot || !Number.isFinite(Date.parse(g.effectiveFrom))) errors.push('REFERENCE_PROVENANCE_REQUIRED')
  const grades = g.schoolStage === 'junior_secondary' ? ['7','8','9'] : g.schoolStage === 'upper_secondary' ? ['10','11','12'] : []
  if (!grades.length || JSON.stringify(entry.population?.match?.gradeLevels) !== JSON.stringify(grades) || entry.population?.language !== g.locale) errors.push('REFERENCE_POPULATION_IDENTITY_INVALID')
  const bands = g.bands
  if (!g.scoreRange || !Number.isFinite(g.scoreRange.min) || !Number.isFinite(g.scoreRange.max) || g.scoreRange.min >= g.scoreRange.max) return [...errors, 'REFERENCE_RANGE_INVALID']
  if (!Array.isArray(bands) || bands.length < 3 || bands.length > 5) return [...errors, 'BAND_COUNT_INVALID']
  if (new Set(bands.map(b => b.key)).size !== bands.length) errors.push('BAND_KEYS_DUPLICATE')
  bands.forEach((b,i) => {
    if (!b.key || !b.label || !Number.isFinite(b.lower) || !Number.isFinite(b.upper) || b.lower >= b.upper || b.lower !== (i ? bands[i-1].upper : g.scoreRange.min)) errors.push('BAND_COVERAGE_INVALID')
  })
  if (bands[bands.length-1].upper !== g.scoreRange.max) errors.push('BAND_COVERAGE_INVALID')
  if (g.kind === 'THEORETICAL_RANGE') {
    if (entry.referenceKind !== 'theoretical_range' || entry.evidenceLevel !== 'theoretical' || entry.provenanceType !== 'theoretical_score_range' || g.bandSource !== 'THEORETICAL_SCORE_RANGE' || g.sampleN !== null || entry.source?.sampleSize !== undefined || Object.keys(entry.statistics ?? {}).length || g.calibration || bands.some(b => b.sampleN !== undefined)) errors.push('THEORETICAL_EMPIRICAL_CLAIM_FORBIDDEN')
  } else if (g.bandSource === 'EMPIRICAL_DISTRIBUTION') {
    if (!Number.isInteger(g.sampleN) || (g.sampleN ?? 0) < 100 || !g.calibration || !g.calibration.subgroupReview || !/^[a-f0-9]{64}$/.test(g.sourceSnapshot)) errors.push('EMPIRICAL_REVIEW_REQUIRED')
    if (bands.some(b => !Number.isInteger(b.sampleN) || (b.sampleN ?? 0) < 20) || bands.reduce((n,b) => n+(b.sampleN ?? 0),0) !== g.sampleN) errors.push('EMPIRICAL_BAND_ALLOCATION_INVALID')
    if (g.calibration && [g.calibration.missingness,g.calibration.floor,g.calibration.ceiling].some(x => !Number.isFinite(x) || x < 0 || x > 1)) errors.push('EMPIRICAL_QC_INVALID')
    if (entry.source?.sampleSize !== g.sampleN) errors.push('EMPIRICAL_SAMPLE_MISMATCH')
  }
  return [...new Set(errors)]
}
