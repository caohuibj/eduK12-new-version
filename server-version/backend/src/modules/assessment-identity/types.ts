export type RespondentTypeV1 = 'SELF' | 'PARENT' | 'TEACHER'

export type ParentRelationshipStatusV1 = 'PENDING' | 'ACTIVE' | 'REVOKED'

export type ParentInviteCodeStatusV1 = 'ACTIVE' | 'CONSUMED' | 'EXPIRED' | 'REVOKED'

export type AssessmentEpisodeInitiationModeV1 =
  | 'TEACHER_CAMPAIGN'
  | 'PARENT_SELF_SERVE'
  | 'STUDENT_SELF'
  | 'ANONYMOUS_SELF'

export interface AttemptIdentityV1 {
  subjectUserId: string | null
  respondentUserId: string | null
  respondentType: RespondentTypeV1 | null
  episodeId: string | null
  assignmentRef: string | null
  consentId: string | null
}

export interface ParentInviteCodeRecordV1 {
  inviteCodeId: string
  codeHash: string
  studentUserId: string
  courseId: string
  createdByUserId: string
  status: ParentInviteCodeStatusV1
  expiresAt: string
  consumedAt: string | null
  consumedByParentUserId: string | null
}

export interface ParentStudentRelationshipRecordV1 {
  relationshipId: string
  parentUserId: string
  studentUserId: string
  status: ParentRelationshipStatusV1
  inviteCodeId: string | null
  approvedByUserId: string | null
  approvedAt: string | null
  revokedByUserId: string | null
  revokedAt: string | null
  revokeReason: string | null
  consentVersion: string | null
  consentHash: string | null
}

export interface AssessmentAttemptConsentRecordV1 {
  consentId: string
  subjectUserId: string | null
  respondentUserId: string | null
  respondentType: RespondentTypeV1
  consentVersion: string
  consentHash: string
  purpose: string
  visibilityScope: string
  shareTargets: string[]
  acceptedAt: string
  revokedAt: string | null
}

export const PARENT_INVITE_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000
