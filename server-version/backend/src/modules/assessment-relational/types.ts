export type RelationalActorRoleV1 = 'STUDENT' | 'TEACHER' | 'PARENT' | 'COUNSELOR' | 'CLIENT'

export type RelationalRelationshipKindV1 =
  | 'SELF'
  | 'PARENT_CHILD'
  | 'COURSE_TEACHER_STUDENT'
  | 'CLASS_TEACHER_STUDENT'
  | 'COUNSELOR_CLIENT'

export type RelationalPerspectiveV1 =
  | 'SELF_REPORT'
  | 'OBSERVER_REPORT'
  | 'RELATIONAL_EXPERIENCE'

export type RelationalResourceKindV1 = 'BUNDLE' | 'SCALE' | 'FORM' | 'SITUATIONAL'

export type RelationalAnalysisModeV1 =
  | 'INDIVIDUAL_ONLY'
  | 'COHORT_AGGREGATE'
  | 'MULTI_INFORMANT_SYNTHESIS'

export type RelationalPolicyDomainV1 = 'LEGACY_COURSE' | 'ORGANIZATION_RUN'

export interface RelationalApplicabilityV1 {
  schemaVersion: 1
  resourceKind: RelationalResourceKindV1
  resourceKey: string
  resourceVersion: string
  subjectRoles: RelationalActorRoleV1[]
  respondentRoles: RelationalActorRoleV1[]
  relationshipKinds: RelationalRelationshipKindV1[]
  perspectives: RelationalPerspectiveV1[]
  analysisMode: RelationalAnalysisModeV1
  visibilityPolicyKey: string
  minimumRespondents: number | null
}

export interface RelationalRelationshipSnapshotV1 {
  schemaVersion: 1
  relationshipKind: RelationalRelationshipKindV1
  relationshipRef: string | null
  subjectUserId: string
  subjectRole: RelationalActorRoleV1
  respondentUserId: string
  respondentRole: RelationalActorRoleV1
  courseId: string | null
  verifiedAt: string
  facts: Record<string, string | boolean | null>
}

export type RelationalAssignmentStatusV1 = 'OPEN' | 'STARTED' | 'COMPLETED' | 'REVOKED' | 'EXPIRED'

export interface RelationalAssignmentRecordV1 {
  assignmentId: string
  episodeId: string
  subjectUserId: string
  subjectRole: RelationalActorRoleV1
  respondentUserId: string
  respondentRole: RelationalActorRoleV1
  createdByUserId: string
  relationshipKind: RelationalRelationshipKindV1
  relationshipRef: string | null
  relationshipSnapshot: RelationalRelationshipSnapshotV1
  relationshipSnapshotHash: string
  perspective: RelationalPerspectiveV1
  resourceKind: RelationalResourceKindV1
  resourceKey: string
  resourceVersion: string
  /** Frozen applicability identity; cohort privacy must never be caller-selected later. */
  applicabilityHash: string
  analysisMode: Exclude<RelationalAnalysisModeV1, 'MULTI_INFORMANT_SYNTHESIS'>
  minimumRespondents: number | null
  consentId: string | null
  visibilityPolicyKey: string
  /** Existing fixtures default to LEGACY_COURSE; Organization Run must persist ORGANIZATION_RUN explicitly. */
  policyDomain?: RelationalPolicyDomainV1
  status: RelationalAssignmentStatusV1
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  revokedAt: string | null
}