import { canonicalHash } from '../assessment-runtime/canonical'
import type { BundleInitiationModeV1 } from '../assessment-bundle/types'
import type {
  RelationalActorRoleV1,
  RelationalAnalysisModeV1,
  RelationalApplicabilityV1,
  RelationalPerspectiveV1,
  RelationalRelationshipKindV1,
} from '../assessment-relational/types'
import type { RelationalProductJourneyV1 } from '../assessment-relational/product-catalog.service'

export const ASSESSMENT_JOURNEY_POLICY_SCHEMA_VERSION = 1 as const

export type AssessmentResourceFamilyV1 = 'BUNDLE' | 'SCALE' | 'FORM' | 'SITUATIONAL' | 'COGNITIVE'

export type AssessmentInitiationModeV1 =
  | 'ORG_ASSIGN'
  | 'CLASS_ASSIGN'
  | 'PROFESSIONAL_ASSIGN'
  | 'RELATED_OBSERVER_ASSIGN'
  | 'RESPONDENT_SELF_START'
  | 'PUBLIC_LINK'

export interface AssessmentJourneyPolicyV1 {
  schemaVersion: typeof ASSESSMENT_JOURNEY_POLICY_SCHEMA_VERSION
  resource: {
    family: AssessmentResourceFamilyV1
    key: string
    version: string
  }
  subjectRoles: RelationalActorRoleV1[]
  respondentRoles: RelationalActorRoleV1[]
  relationshipKinds: RelationalRelationshipKindV1[]
  perspectives: RelationalPerspectiveV1[]
  analysisMode: RelationalAnalysisModeV1
  visibilityPolicyKey: string
  minimumRespondents: number | null
  initiationModes: AssessmentInitiationModeV1[]
  /** Hash of the owning source policy. The normalized policy never replaces that source of truth. */
  sourcePolicyHash: string
}

const unique = <T extends string>(values: readonly T[]): T[] => [...new Set(values)]

export const normalizeBundleInitiationModes = (
  modes: readonly BundleInitiationModeV1[],
): AssessmentInitiationModeV1[] => unique(modes.flatMap((mode): AssessmentInitiationModeV1[] => {
  switch (mode) {
    case 'TEACHER_ASSIGNMENT':
    case 'STUDENT_COURSE':
      return ['CLASS_ASSIGN']
    case 'PARENT_SELF_SERVE':
      return ['RESPONDENT_SELF_START']
    case 'ANONYMOUS_SELF':
      return ['PUBLIC_LINK']
  }
  return []
}))

export const normalizeRelationalJourneyInitiationModes = (
  journeys: readonly RelationalProductJourneyV1[],
): AssessmentInitiationModeV1[] => unique(journeys.flatMap((journey): AssessmentInitiationModeV1[] => {
  switch (journey) {
    case 'PARENT_SELF_SERVE':
      return ['RESPONDENT_SELF_START']
    case 'TEACHER_ASSIGN_PARENT':
      return ['CLASS_ASSIGN', 'RELATED_OBSERVER_ASSIGN']
    case 'TEACHER_OBSERVER':
      return ['CLASS_ASSIGN']
    case 'STUDENT_EXPERIENCE':
      return ['RESPONDENT_SELF_START']
    case 'TEACHER_COHORT_REPORT':
      return []
  }
  return []
}))

export const journeyPolicyFromRelationalApplicability = (
  applicability: RelationalApplicabilityV1,
  initiationModes: readonly AssessmentInitiationModeV1[],
): AssessmentJourneyPolicyV1 => {
  if (initiationModes.length === 0) throw new Error('assessment journey requires at least one initiation mode')
  return {
    schemaVersion: ASSESSMENT_JOURNEY_POLICY_SCHEMA_VERSION,
    resource: {
      family: applicability.resourceKind,
      key: applicability.resourceKey,
      version: applicability.resourceVersion,
    },
    subjectRoles: [...applicability.subjectRoles],
    respondentRoles: [...applicability.respondentRoles],
    relationshipKinds: [...applicability.relationshipKinds],
    perspectives: [...applicability.perspectives],
    analysisMode: applicability.analysisMode,
    visibilityPolicyKey: applicability.visibilityPolicyKey,
    minimumRespondents: applicability.minimumRespondents,
    initiationModes: unique(initiationModes),
    sourcePolicyHash: canonicalHash(applicability),
  }
}

/**
 * Campaign policy may remove source-owned initiation paths, never invent a new path.
 * Population/relationship narrowing remains enforced by the owning Run/Relational authority.
 */
export const assertJourneyInitiationNarrowing = (
  source: readonly AssessmentInitiationModeV1[],
  requested: readonly AssessmentInitiationModeV1[],
): AssessmentInitiationModeV1[] => {
  const normalized = unique(requested)
  if (normalized.length === 0 || normalized.some((mode) => !source.includes(mode))) {
    throw new Error('assessment campaign cannot widen source initiation modes')
  }
  return normalized
}
