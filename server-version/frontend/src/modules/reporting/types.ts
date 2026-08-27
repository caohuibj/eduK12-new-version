export type ScaleResponseValue = string | number

export type ScaleScoreDirection =
  | 'higher_is_better'
  | 'higher_is_worse'
  | 'higher_is_more'
  | 'lower_is_better'
  | 'bipolar'
  | 'descriptive'

export interface ScaleScoreValue {
  key: string
  type: 'total' | 'dimension'
  label: string
  description?: string
  direction: ScaleScoreDirection
  canonical: boolean
  displayPrecision: number
  value: number | null
  range: { min: number; max: number } | null
  expectedItems: string[]
  answeredItems: string[]
  status: 'calculated' | 'limited' | 'not_calculable'
  prorated: boolean
}

export interface ScaleReferenceValue {
  scoreKey: string
  referenceVersion: string
  referenceKind: 'normative_distribution' | 'criterion_threshold' | 'descriptive_sample'
  evidenceLevel: 'literature_beta' | 'local_pilot' | 'local_norm' | 'validated_norm' | null
  status: 'available' | 'unavailable'
  unavailableReason?: 'not_requested' | 'not_found' | 'inactive' | 'version_mismatch' | 'missing_context' | 'no_population_match' | 'ambiguous_population' | 'insufficient_data'
  label: string
  value: number | null
  mean: number | null
  sd: number | null
  z: number | null
  t: number | null
  percentile: { value: number; estimated: boolean } | null
  criterionBand: { key: string; label: string; minInclusive: number | null; maxInclusive: number | null } | null
  meanDifference: number | null
  source: {
    citation: string
    doi?: string
    url?: string
    publicationYear?: number
    sampleSize?: number
  } | null
  population: {
    description?: string
    match?: {
      minAgeMonthsInclusive?: number
      maxAgeMonthsExclusive?: number
      sexAtBirth?: Array<'female' | 'male' | 'intersex'>
      gradeLevels?: string[]
      primaryLanguages?: string[]
      countriesOrRegions?: string[]
    }
    ageBand?: string | null
    sexScope?: string | null
    language?: string | null
    countryOrRegion?: string | null
  } | null
  instrumentVersion: string | null
  scoringVersion: string | null
  limitations: string[]
  disclaimer: string
}

export interface ScaleInterpretationValue {
  scoreKey: string
  headline: string
  label: string | null
  interpretation: string
  guidance: Array<{
    category: 'reflection' | 'strategy' | 'environment' | 'support'
    text: string
  }>
  limitations: string[]
  referenceVersion: string | null
}

export interface ScaleResultV2 {
  schemaVersion: 2
  instrument: {
    scaleId: string
    code: string
    name: string
    instrumentVersion: string
  }
  method: {
    scaleId: string
    instrumentVersion: string
    scoringVersion: string
    reportVersion: string
    definitionHash: string
    referenceVersions: string[]
    assessmentContext: {
      schemaVersion: 1
      snapshotHash: string
    } | null
  }
  quality: {
    status: 'interpretable' | 'limited' | 'invalid'
    flags: Array<'missing_items' | 'insufficient_items' | 'score_not_calculable'>
  }
  itemScores: Array<{
    itemCode: string
    responseValue: ScaleResponseValue
    baseScore: number
    score: number
    responseTimeMs?: number
    answeredAt?: string
    changeCount?: number
  }>
  scores: ScaleScoreValue[]
  references: ScaleReferenceValue[]
  interpretations: ScaleInterpretationValue[]
  caveats: string[]
  disclaimer: string
}

export interface ScaleUnitReport {
  itemId?: string
  type: 'SCALE'
  kind: 'scale'
  scaleId: string
  scaleCode?: string | null
  label?: string | null
  scaleName: string
  result: ScaleResultV2 | null
  quality: ScaleResultV2['quality'] | null
  scores: ScaleScoreValue[]
  references: ScaleReferenceValue[]
  interpretations: ScaleInterpretationValue[]
  caveats: string[]
  disclaimer: string
  completedAt: string | null
  totalTime: number | null
  method: ScaleResultV2['method'] | null
  decryptError?: boolean
}

export interface FormBackgroundReport {
  itemId: string
  type: 'FORM'
  kind: 'background'
  label: string | null
  value: string | null
}

export interface CollectionQuestionnaireResponse {
  questionnaireId?: string
  questionnaireName: string
  completedAt: string | null
  totalTime: number | null
  totalDimensions: number
  backgroundValues: FormBackgroundReport[]
  unitReports: ScaleUnitReport[]
}
