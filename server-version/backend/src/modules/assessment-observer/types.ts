import type { RespondentTypeV1 } from '../assessment-identity/types'

export type ObserverInitiationPathV1 =
  | 'TEACHER_ASSIGN_PARENT'
  | 'PARENT_SELF_SERVE'
  | 'TEACHER_SELF_REPORT'
  | 'PARENT_SHARE_TO_COURSE_LEAD'

export type ObserverResultVisibilityV1 =
  | 'PRIVATE_RESPONDENT'
  | 'ASSIGNING_TEACHER'
  | 'SHARED_COURSE_LEAD'

export type ObserverCatalogReleaseStatusV1 = 'PUBLISHED' | 'DRAFT' | 'HOLD' | 'RETIRED'

export interface ObserverBundleCatalogEntryV1 {
  bundleKey: string
  bundleVersion: string
  name: string
  respondentType: 'PARENT' | 'TEACHER'
  initiationModes: Array<'TEACHER_ASSIGNMENT' | 'PARENT_SELF_SERVE'>
  allowsParentSelfServe: boolean
  releaseStatus: ObserverCatalogReleaseStatusV1
  subjectMinAgeYears: number | null
  subjectMaxAgeYears: number | null
}

export interface ObserverAssignmentRecordV1 {
  assignmentId: string
  path: ObserverInitiationPathV1
  bundleKey: string
  bundleVersion: string
  episodeId: string
  subjectUserId: string
  respondentUserId: string
  respondentType: RespondentTypeV1
  assignedByUserId: string
  courseId: string | null
  visibility: ObserverResultVisibilityV1
  shareTargets: string[]
  consentId: string
  createdAt: string
  status: 'OPEN' | 'COMPLETED' | 'REVOKED'
}

export interface ObserverAudienceProjectionRequestV1 {
  viewerUserId: string
  viewerRole: 'PARENT' | 'TEACHER' | 'ADMIN' | 'STUDENT' | string
  assignment: ObserverAssignmentRecordV1
  /** Projection payload already scrubbed of raw answers — domain only checks access. */
  respondentProjection: Record<string, unknown>
}
