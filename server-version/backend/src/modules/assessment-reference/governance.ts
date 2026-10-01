import type { AssessmentReferenceEntry } from './reference'

export interface ReferenceGovernanceV1 {
  schemaVersion: 1
  kind: 'THEORETICAL_RANGE' | 'LOCAL_PILOT' | 'LOCAL_REFERENCE' | 'MULTISITE_REFERENCE' | 'VALIDATED_NORM' | 'CRITERION'
  measurementHash: string
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
  if (g === undefined) return entry.referenceKind === 'theoretical_range' ? ['THEORETICAL_GOVERNANCE_REQUIRED'] : []
  if (!g || typeof g!=='object' || !Array.isArray(g.bands) || g.bands.some(b=>!b || typeof b!=='object')) return ['REFERENCE_GOVERNANCE_INVALID']
  const errors: string[] = []
  const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
  const stableNumbers=(v:unknown):boolean=>typeof v==='number' ? Number.isFinite(v) && v===Number(v.toFixed(8)) : Array.isArray(v)?v.every(stableNumbers):v && typeof v==='object'?Object.values(v).every(stableNumbers):true
  if(!stableNumbers(entry.statistics) || !stableNumbers(g)) errors.push('REFERENCE_SNAPSHOT_NUMERIC_PRECISION_REQUIRED')
  if(!/^[a-f0-9]{64}$/.test(g.measurementHash??''))errors.push('REFERENCE_MEASUREMENT_HASH_REQUIRED')
  if (g.schemaVersion !== 1 || !['THEORETICAL_RANGE','LOCAL_PILOT','LOCAL_REFERENCE','MULTISITE_REFERENCE','VALIDATED_NORM','CRITERION'].includes(g.kind)) errors.push('REFERENCE_KIND_INVALID')
  if (![g.subjectKey,g.locale,g.populationKey,g.sourceDataset,g.sourceSnapshot,g.effectiveFrom].every(text) || !Number.isFinite(Date.parse(g.effectiveFrom))) errors.push('REFERENCE_PROVENANCE_REQUIRED')
  if(typeof g.crossStageReReferenceAllowed!=='boolean') errors.push('REFERENCE_CROSS_STAGE_DECISION_REQUIRED')
  const grades = g.schoolStage === 'junior_secondary' ? ['7','8','9'] : g.schoolStage === 'upper_secondary' ? ['10','11','12'] : []
  if (!grades.length || JSON.stringify(entry.population?.match?.gradeLevels) !== JSON.stringify(grades) || entry.population?.language !== g.locale) errors.push('REFERENCE_POPULATION_IDENTITY_INVALID')
  const bands = g.bands
  if (!g.scoreRange || !Number.isFinite(g.scoreRange.min) || !Number.isFinite(g.scoreRange.max) || g.scoreRange.min >= g.scoreRange.max) return [...errors, 'REFERENCE_RANGE_INVALID']
  if (!Array.isArray(bands) || bands.length < 3 || bands.length > 5) return [...errors, 'BAND_COUNT_INVALID']
  if (new Set(bands.map(b => b.key)).size !== bands.length) errors.push('BAND_KEYS_DUPLICATE')
  bands.forEach((b,i) => {
    if (!text(b.key) || !text(b.label) || !Number.isFinite(b.lower) || !Number.isFinite(b.upper) || b.lower >= b.upper || b.lower !== (i ? bands[i-1].upper : g.scoreRange.min)) errors.push('BAND_COVERAGE_INVALID')
  })
  if (bands[bands.length-1].upper !== g.scoreRange.max) errors.push('BAND_COVERAGE_INVALID')
  if (g.kind === 'THEORETICAL_RANGE') {
    if (entry.referenceKind !== 'theoretical_range' || entry.evidenceLevel !== 'theoretical' || entry.provenanceType !== 'theoretical_score_range' || g.bandSource !== 'THEORETICAL_SCORE_RANGE' || g.sampleN !== null || entry.source?.sampleSize !== undefined || Object.keys(entry.statistics ?? {}).length || g.calibration || bands.some(b => b.sampleN !== undefined)) errors.push('THEORETICAL_EMPIRICAL_CLAIM_FORBIDDEN')
  } else if (g.bandSource === 'EMPIRICAL_DISTRIBUTION') {
    if(entry.provenanceType!=='local_observed' || entry.evidenceLevel==='theoretical' || !['normative_distribution','descriptive_sample'].includes(entry.referenceKind??'') || g.kind==='CRITERION')errors.push('REFERENCE_KIND_SOURCE_MISMATCH')
    if (!Number.isInteger(g.sampleN) || (g.sampleN ?? 0) < 100 || !g.calibration || !g.calibration.subgroupReview || !/^[a-f0-9]{64}$/.test(g.sourceSnapshot)) errors.push('EMPIRICAL_REVIEW_REQUIRED')
    if (bands.some(b => !Number.isInteger(b.sampleN) || (b.sampleN ?? 0) < 20) || bands.reduce((n,b) => n+(b.sampleN ?? 0),0) !== g.sampleN) errors.push('EMPIRICAL_BAND_ALLOCATION_INVALID')
    if (g.calibration && (!text(g.calibration.method) || !Number.isFinite(g.calibration.skew) || [g.calibration.missingness,g.calibration.floor,g.calibration.ceiling].some(x => !Number.isFinite(x) || x < 0 || x > 1))) errors.push('EMPIRICAL_QC_INVALID')
    if (entry.source?.sampleSize !== g.sampleN) errors.push('EMPIRICAL_SAMPLE_MISMATCH')
  }
  if(g.kind!=='THEORETICAL_RANGE' && g.bandSource!=='EMPIRICAL_DISTRIBUTION' && !(g.kind==='CRITERION' && g.bandSource==='CRITERION' && entry.referenceKind==='criterion_threshold'))errors.push('REFERENCE_KIND_SOURCE_MISMATCH')
  return [...new Set(errors)]
}
