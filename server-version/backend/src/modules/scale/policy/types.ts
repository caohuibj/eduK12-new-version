import type { AssessmentContextKey } from '../../assessment-context/context'

export const SCALE_POLICY_SCHEMA_VERSION = 1 as const

export type ScalePolicyRespondentType = 'SELF' | 'PARENT' | 'TEACHER' | 'OBSERVER' | 'CLINICIAN'
export type ScalePolicyGrade = 'K' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12'

export interface InstrumentApplicabilityV1 {
  schemaVersion: typeof SCALE_POLICY_SCHEMA_VERSION
  policyVersion: string
  respondentTypes: ScalePolicyRespondentType[]
  subject?: {
    ageMonths?: {
      minInclusive?: number
      maxExclusive?: number
    }
    grades?: ScalePolicyGrade[]
  }
  assessmentContexts?: string[]
  requiredContextKeys: AssessmentContextKey[]
}

export interface DisclosureCapabilitiesV1 {
  numericScores: boolean
  references: boolean
  individualInterpretations: boolean
  scoreDerivedLabels: boolean
  resultQualityDetails: boolean
  rawAnswers: boolean
  itemScores: boolean
  methods: boolean
  educationalContent: boolean
}

export type ScaleDisclosureAudience = 'respondent' | 'subject' | 'teacher' | 'researcher'

export interface AudienceDisclosurePolicyV1 {
  schemaVersion: typeof SCALE_POLICY_SCHEMA_VERSION
  policyVersion: string
  audiences: Partial<Record<ScaleDisclosureAudience, DisclosureCapabilitiesV1>>
  unknownAudience: 'DENY'
}

/**
 * Source-owned requirements, not proof that a right has been granted.
 * Deployment-specific scope and durable InstrumentAuthorization bindings are
 * deliberately introduced by PR-3 rather than stored here as facts.
 */
export interface InstrumentUsageRequirementsV1 {
  schemaVersion: typeof SCALE_POLICY_SCHEMA_VERSION
  policyVersion: string
  requiredRightsActions: string[]
  allowedDeploymentModes?: string[]
  notes: string[]
}

export interface EducationalFeedbackBlockV1 {
  id: string
  title?: string
  body: string
}

export interface EducationalFeedbackChoiceV1 {
  id: string
  label: string
  body: string
}

/** Static feedback only: no score predicates or result interpolation. */
export interface EducationalFeedbackDefinitionV1 {
  schemaVersion: typeof SCALE_POLICY_SCHEMA_VERSION
  contentVersion: string
  blocks: EducationalFeedbackBlockV1[]
  choices?: EducationalFeedbackChoiceV1[]
  disclaimer?: string
}
