import type { AssessmentReferenceSetDefinition } from '../../assessment-reference/reference'
import type { ScaleCatalogManifestV1 } from '../library/catalog-manifest'
import type { LocalizationManifestV1 } from '../library/localization-manifest'
import type { ScaleDefinitionV2 } from '../scale-definition'
import type { ScaleCustomScorer } from '../scale-scoring'
import type {
  AudienceDisclosurePolicyV1,
  EducationalFeedbackDefinitionV1,
  InstrumentApplicabilityV1,
  InstrumentUsageRequirementsV1,
} from '../policy/types'

export interface ScaleGoldenCase {
  name: string
  answers: Array<{ itemCode: string; responseValue: string | number }>
  expected: {
    quality: 'interpretable' | 'limited' | 'invalid'
    scores: Record<string, number | null>
    totalScoreKeys: string[]
  }
}

/** Legacy executable projection retained for existing callers. */
export interface ScalePackageV2 {
  key: string
  instrumentVersion: string
  releaseStatus: 'DRAFT' | 'PUBLISHED' | 'RETIRED'
  definition: ScaleDefinitionV2
  references: AssessmentReferenceSetDefinition[]
  goldenCases: ScaleGoldenCase[]
}

export interface ScaleInstrumentIdentityV1 {
  instrumentKey: string
  instrumentVersion: string
}

export type ScaleCatalogMetadataBodyV1 = Omit<ScaleCatalogManifestV1, 'identity'> & {
  identity: Omit<ScaleCatalogManifestV1['identity'], 'instrumentKey' | 'instrumentVersion'>
}

export type ScaleLocalizationMetadataBodyV1 = Omit<LocalizationManifestV1, 'instrumentKey' | 'instrumentVersion'>

export interface VersionedScorerRegistration {
  key: string
  version: string
  scorer: ScaleCustomScorer
}

export interface ScaleExecutableSourceV1 {
  releaseStatus: ScalePackageV2['releaseStatus']
  contentLocale: string
  definition: ScaleDefinitionV2
  references: AssessmentReferenceSetDefinition[]
  goldenCases: ScaleGoldenCase[]
  scorerPlugins?: readonly VersionedScorerRegistration[]
}

export interface ScaleCatalogOnlyPreviewV1 {
  status: 'CATALOG_ONLY'
  reportPlan?: string
  blockers?: string[]
}

/**
 * PR-1 source aggregation contract. Durable authorization grants, deployment
 * identity, attempt context and results are intentionally excluded.
 */
export interface ScaleInstrumentSourceV1 {
  schemaVersion: 1
  identity: ScaleInstrumentIdentityV1
  catalog: ScaleCatalogMetadataBodyV1
  localization?: ScaleLocalizationMetadataBodyV1
  applicability?: InstrumentApplicabilityV1
  disclosure?: AudienceDisclosurePolicyV1
  usageRequirements?: InstrumentUsageRequirementsV1
  educationalFeedback?: EducationalFeedbackDefinitionV1
  candidatePreview?: ScaleCatalogOnlyPreviewV1
  executable?: ScaleExecutableSourceV1
}
