import type {
  DisclosureCapabilitiesV1,
  ScaleDisclosureAudience,
} from '../scale/policy/types'

export const ASSESSMENT_DISCLOSURE_SCHEMA_VERSION = 1 as const

export type AssessmentDisclosureAudienceV1 =
  | 'RESPONDENT'
  | 'SUBJECT'
  | 'TEACHER'
  | 'PROFESSIONAL'
  | 'ORGANIZATION'
  | 'RESEARCH'

export type AssessmentReportModeV1 =
  | 'NONE'
  | 'COMPLETION_ONLY'
  | 'EDUCATIONAL_SUMMARY'
  | 'INDIVIDUAL_REPORT'
  | 'AGGREGATE_REPORT'
  | 'DELAYED_AGGREGATE_REPORT'
  | 'RESEARCH_PROJECTION'

export type RelationalDisclosureDispositionV1 =
  | 'NON_RELATIONAL'
  | 'INDIVIDUAL_ALLOWED'
  | 'COHORT_ONLY'

export interface AssessmentDisclosureProjectionV1 {
  schemaVersion: typeof ASSESSMENT_DISCLOSURE_SCHEMA_VERSION
  audience: AssessmentDisclosureAudienceV1
  mode: AssessmentReportModeV1
  minimumRespondents: number | null
  rawAnswers: boolean
  itemLevel: boolean
  researchExport: boolean
  sourcePolicyKey: string
}

const scaleAudience = (audience: ScaleDisclosureAudience): AssessmentDisclosureAudienceV1 => ({
  respondent: 'RESPONDENT',
  subject: 'SUBJECT',
  teacher: 'TEACHER',
  researcher: 'RESEARCH',
}[audience] as AssessmentDisclosureAudienceV1)

const noCapabilities = (capabilities: DisclosureCapabilitiesV1): boolean => (
  Object.values(capabilities).every((value) => value === false)
)

const educationalOnly = (capabilities: DisclosureCapabilitiesV1): boolean => (
  capabilities.educationalContent
  && Object.entries(capabilities).every(([key, value]) => key === 'educationalContent' || value === false)
)

/** Normalize the existing Scale disclosure contract without replacing its capabilities. */
export const disclosureFromScaleCapabilities = (input: {
  audience: ScaleDisclosureAudience
  capabilities: DisclosureCapabilitiesV1
  policyKey: string
}): AssessmentDisclosureProjectionV1 => ({
  schemaVersion: ASSESSMENT_DISCLOSURE_SCHEMA_VERSION,
  audience: scaleAudience(input.audience),
  mode: noCapabilities(input.capabilities)
    ? 'NONE'
    : educationalOnly(input.capabilities)
      ? 'EDUCATIONAL_SUMMARY'
      : input.audience === 'researcher'
        ? 'RESEARCH_PROJECTION'
        : 'INDIVIDUAL_REPORT',
  minimumRespondents: null,
  rawAnswers: input.capabilities.rawAnswers,
  itemLevel: input.capabilities.itemScores,
  researchExport: false,
  sourcePolicyKey: input.policyKey,
})

/**
 * Relational FINAL projection stays conservative: cohort-only respondents get
 * completion acknowledgement only. Aggregate visibility for a subject/staff
 * audience must be explicitly allowed by the owning report policy and must
 * preserve its minimum-N floor.
 */
export const disclosureFromRelationalDisposition = (input: {
  disposition: RelationalDisclosureDispositionV1
  audience: AssessmentDisclosureAudienceV1
  policyKey: string
  minimumRespondents?: number | null
  aggregateAllowed?: boolean
}): AssessmentDisclosureProjectionV1 => {
  let mode: AssessmentReportModeV1
  let minimumRespondents: number | null = null
  if (input.disposition === 'NON_RELATIONAL' || input.disposition === 'INDIVIDUAL_ALLOWED') {
    mode = 'INDIVIDUAL_REPORT'
  } else if (input.audience === 'RESPONDENT') {
    mode = 'COMPLETION_ONLY'
  } else if (input.aggregateAllowed) {
    if (input.minimumRespondents === null || input.minimumRespondents === undefined || input.minimumRespondents < 3) {
      throw new Error('aggregate disclosure requires an explicit minimumRespondents floor of at least 3')
    }
    mode = 'AGGREGATE_REPORT'
    minimumRespondents = input.minimumRespondents
  } else {
    mode = 'NONE'
  }
  return {
    schemaVersion: ASSESSMENT_DISCLOSURE_SCHEMA_VERSION,
    audience: input.audience,
    mode,
    minimumRespondents,
    rawAnswers: false,
    itemLevel: false,
    researchExport: false,
    sourcePolicyKey: input.policyKey,
  }
}

const allowedNarrowing: Record<AssessmentReportModeV1, readonly AssessmentReportModeV1[]> = {
  NONE: ['NONE'],
  COMPLETION_ONLY: ['NONE', 'COMPLETION_ONLY'],
  EDUCATIONAL_SUMMARY: ['NONE', 'COMPLETION_ONLY', 'EDUCATIONAL_SUMMARY'],
  INDIVIDUAL_REPORT: ['NONE', 'COMPLETION_ONLY', 'EDUCATIONAL_SUMMARY', 'INDIVIDUAL_REPORT'],
  AGGREGATE_REPORT: ['NONE', 'AGGREGATE_REPORT', 'DELAYED_AGGREGATE_REPORT'],
  DELAYED_AGGREGATE_REPORT: ['NONE', 'DELAYED_AGGREGATE_REPORT'],
  RESEARCH_PROJECTION: ['NONE', 'RESEARCH_PROJECTION'],
}

/** Campaign/report configuration may only reduce an owning disclosure contract. */
export const assertDisclosureNarrowing = (
  source: AssessmentDisclosureProjectionV1,
  requested: AssessmentDisclosureProjectionV1,
): AssessmentDisclosureProjectionV1 => {
  if (source.audience !== requested.audience) throw new Error('disclosure audience cannot be replaced')
  if (!allowedNarrowing[source.mode].includes(requested.mode)) throw new Error('disclosure mode cannot be widened')
  if (requested.rawAnswers && !source.rawAnswers) throw new Error('raw-answer disclosure cannot be widened')
  if (requested.itemLevel && !source.itemLevel) throw new Error('item-level disclosure cannot be widened')
  if (requested.researchExport && !source.researchExport) throw new Error('research export cannot be widened')
  if (
    source.minimumRespondents !== null
    && (requested.minimumRespondents === null || requested.minimumRespondents < source.minimumRespondents)
  ) throw new Error('minimumRespondents cannot be lowered')
  return requested
}
