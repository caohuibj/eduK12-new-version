import type { ScaleResultV2 } from '../scale-result'
import type {
  AudienceDisclosurePolicyV1,
  DisclosureCapabilitiesV1,
  EducationalFeedbackDefinitionV1,
  ScaleDisclosureAudience,
} from '../policy/types'

export type ScaleProjectionPurpose = 'resume' | 'result' | 'history' | 'report' | 'export'
export type ScaleRelationalDisposition = 'NON_RELATIONAL' | 'INDIVIDUAL_ALLOWED' | 'COHORT_ONLY'

export interface EffectiveScaleDisclosureSnapshot {
  disposition: 'FROZEN_V2' | 'LEGACY_PROFILE' | 'UNKNOWN'
  disclosure: AudienceDisclosurePolicyV1
  educationalFeedback?: EducationalFeedbackDefinitionV1
  runtimePolicyHash?: string
}

export interface ScaleProjectionAccessDecision {
  source: 'RESOURCE_AUTHORIZATION'
  allowed: boolean
  capabilities: DisclosureCapabilitiesV1
}

export interface ScaleProjectionContext {
  principalId: string | null
  audience: ScaleDisclosureAudience
  purpose: ScaleProjectionPurpose
  accessDecision: ScaleProjectionAccessDecision
  frozenPolicy: EffectiveScaleDisclosureSnapshot
  currentRestrictions: DisclosureCapabilitiesV1
  relationalDisposition: ScaleRelationalDisposition
}

export interface ExternalScaleReportBaseV1 {
  schemaVersion: 1
  kind: 'full' | 'scores' | 'educational' | 'completion' | 'unavailable'
  instrument: {
    scaleId: string
    code: string
    name: string
    instrumentVersion: string
  }
  completedAt: string | null
  totalTime: number | null
}

export interface ExternalScaleFullReportV1 extends ExternalScaleReportBaseV1 {
  kind: 'full'
  scores?: ScaleResultV2['scores']
  references?: ScaleResultV2['references']
  interpretations?: Array<{
    scoreKey: string
    headline?: string
    label?: string | null
    interpretation: string
    guidance: ScaleResultV2['interpretations'][number]['guidance']
    limitations: string[]
    referenceVersion: string | null
  }>
  quality?: ScaleResultV2['quality']
  itemScores?: ScaleResultV2['itemScores']
  method?: ScaleResultV2['method']
  caveats?: string[]
  disclaimer: string
  educationalContent?: EducationalFeedbackDefinitionV1
}

export interface ExternalScaleScoresReportV1 extends ExternalScaleReportBaseV1 {
  kind: 'scores'
  scores: ScaleResultV2['scores']
  disclaimer: string
}

export interface ExternalScaleEducationalReportV1 extends ExternalScaleReportBaseV1 {
  kind: 'educational'
  contentVersion: string
  blocks: EducationalFeedbackDefinitionV1['blocks']
  choices?: EducationalFeedbackDefinitionV1['choices']
  disclaimer?: string
}

export interface ExternalScaleCompletionReportV1 extends ExternalScaleReportBaseV1 {
  kind: 'completion'
}

export interface ExternalScaleUnavailableReportV1 extends ExternalScaleReportBaseV1 {
  kind: 'unavailable'
  reason: 'POLICY_UNAVAILABLE' | 'RESULT_UNAVAILABLE'
}

export type ExternalScaleReportV1 =
  | ExternalScaleFullReportV1
  | ExternalScaleScoresReportV1
  | ExternalScaleEducationalReportV1
  | ExternalScaleCompletionReportV1
  | ExternalScaleUnavailableReportV1
