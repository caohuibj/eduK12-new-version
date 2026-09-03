import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { canonicalHash } from '../assessment-runtime/canonical'
import { identityFail } from './errors'
import type {
  AttemptIdentityV1,
  AssessmentAttemptConsentRecordV1,
  AssessmentEpisodeInitiationModeV1,
  ParentInviteCodeRecordV1,
  ParentStudentRelationshipRecordV1,
  RespondentTypeV1,
} from './types'
import { PARENT_INVITE_DEFAULT_TTL_MS } from './types'

const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/

export const hashParentInviteCode = (plaintext: string): string => (
  createHash('sha256').update(`parent-invite-v1:${plaintext}`).digest('hex')
)

export const mintParentInvitePlaintext = (): string => (
  randomBytes(18).toString('base64url')
)

/**
 * Historical attempts keep null identity. Never invent subject/respondent from legacy userId.
 */
export const historicalAttemptIdentity = (): AttemptIdentityV1 => ({
  subjectUserId: null,
  respondentUserId: null,
  respondentType: null,
  episodeId: null,
  assignmentRef: null,
  consentId: null,
})

export const assertSubjectRespondentSeparation = (input: {
  subjectUserId: string
  respondentUserId: string
  respondentType: RespondentTypeV1
}): void => {
  if (input.respondentType === 'SELF') {
    if (input.subjectUserId !== input.respondentUserId) {
      identityFail('IDENTITY_SELF_MISMATCH', 'SELF respondent 必须与 subject 相同')
    }
    return
  }
  if (input.subjectUserId === input.respondentUserId) {
    identityFail('IDENTITY_SUBJECT_EQUALS_RESPONDENT', 'PARENT/TEACHER respondent 不得等于 subject')
  }
}

export const buildAttemptIdentity = (input: {
  subjectUserId: string
  respondentUserId: string
  respondentType: RespondentTypeV1
  episodeId: string
  assignmentRef?: string | null
  consentId: string
}): AttemptIdentityV1 => {
  assertSubjectRespondentSeparation(input)
  return {
    subjectUserId: input.subjectUserId,
    respondentUserId: input.respondentUserId,
    respondentType: input.respondentType,
    episodeId: input.episodeId,
    assignmentRef: input.assignmentRef ?? null,
    consentId: input.consentId,
  }
}

/** Refuse guessing identity from legacy userId alone. */
export const refuseInferIdentityFromLegacyUserId = (legacyUserId: string | null | undefined): AttemptIdentityV1 => {
  void legacyUserId
  return historicalAttemptIdentity()
}

export const createParentInviteCode = (input: {
  studentUserId: string
  courseId: string
  createdByUserId: string
  /** Student course membership must already be ACTIVE — do not require student approval fields. */
  studentCourseStatus: 'ACTIVE' | 'APPROVED' | 'PENDING'
  now?: string
  ttlMs?: number
}): { plaintext: string; record: ParentInviteCodeRecordV1 } => {
  if (input.createdByUserId !== input.studentUserId) {
    identityFail('INVITE_CREATOR', '只有学生本人可为自己生成家长邀请码')
  }
  // Parent approval must not depend on nonexistent student approval fields.
  // Course join is ACTIVE (or APPROVED legacy); PENDING cannot mint invites.
  if (input.studentCourseStatus === 'PENDING') {
    identityFail('INVITE_COURSE_STATUS', '学生课程关系未生效，不能生成邀请码')
  }
  if (input.studentCourseStatus !== 'ACTIVE' && input.studentCourseStatus !== 'APPROVED') {
    identityFail('INVITE_COURSE_STATUS', '学生课程关系状态无效')
  }
  const now = input.now ?? new Date().toISOString()
  if (!ISO.test(now)) identityFail('INVITE_DATETIME', 'now 必须是 UTC ISO')
  const plaintext = mintParentInvitePlaintext()
  const ttlMs = input.ttlMs ?? PARENT_INVITE_DEFAULT_TTL_MS
  const expiresAt = new Date(Date.parse(now) + ttlMs).toISOString()
  return {
    plaintext,
    record: {
      inviteCodeId: randomUUID(),
      codeHash: hashParentInviteCode(plaintext),
      studentUserId: input.studentUserId,
      courseId: input.courseId,
      createdByUserId: input.createdByUserId,
      status: 'ACTIVE',
      expiresAt,
      consumedAt: null,
      consumedByParentUserId: null,
    },
  }
}

export const assertInviteCodeConsumable = (input: {
  record: ParentInviteCodeRecordV1
  plaintext: string
  now?: string
}): void => {
  const now = input.now ?? new Date().toISOString()
  if (hashParentInviteCode(input.plaintext) !== input.record.codeHash) {
    identityFail('INVITE_CODE_MISMATCH', '邀请码无效')
  }
  if (input.record.status === 'CONSUMED') {
    identityFail('INVITE_REPLAY', '邀请码已使用，禁止重放')
  }
  if (input.record.status === 'REVOKED') {
    identityFail('INVITE_REVOKED', '邀请码已撤销')
  }
  if (input.record.status === 'EXPIRED' || Date.parse(now) > Date.parse(input.record.expiresAt)) {
    identityFail('INVITE_EXPIRED', '邀请码已过期')
  }
  if (input.record.status !== 'ACTIVE') {
    identityFail('INVITE_STATUS', `邀请码状态不可用: ${input.record.status}`)
  }
}

export const consumeParentInviteCode = (input: {
  record: ParentInviteCodeRecordV1
  plaintext: string
  parentUserId: string
  now?: string
}): ParentInviteCodeRecordV1 => {
  assertInviteCodeConsumable(input)
  const now = input.now ?? new Date().toISOString()
  return {
    ...input.record,
    status: 'CONSUMED',
    consumedAt: now,
    consumedByParentUserId: input.parentUserId,
  }
}

export const createPendingParentRelationship = (input: {
  parentUserId: string
  studentUserId: string
  inviteCodeId: string
}): ParentStudentRelationshipRecordV1 => {
  if (input.parentUserId === input.studentUserId) {
    identityFail('RELATIONSHIP_SELF', '家长不能与自己建立亲子关系')
  }
  return {
    relationshipId: randomUUID(),
    parentUserId: input.parentUserId,
    studentUserId: input.studentUserId,
    status: 'PENDING',
    inviteCodeId: input.inviteCodeId,
    approvedByUserId: null,
    approvedAt: null,
    revokedByUserId: null,
    revokedAt: null,
    revokeReason: null,
    consentVersion: null,
    consentHash: null,
  }
}

/**
 * Only the invite-bound course creator (teacher) or ADMIN may approve.
 * Wrong teacher cannot approve.
 */
export const approveParentRelationship = (input: {
  relationship: ParentStudentRelationshipRecordV1
  actorUserId: string
  actorRole: 'TEACHER' | 'ADMIN' | 'STUDENT' | 'PARENT' | string
  inviteCourseCreatorUserId: string
  now?: string
  consentVersion: string
  consentHash: string
}): ParentStudentRelationshipRecordV1 => {
  if (input.relationship.status !== 'PENDING') {
    identityFail('RELATIONSHIP_STATE', `只有 PENDING 可批准，当前 ${input.relationship.status}`)
  }
  const isAdmin = input.actorRole === 'ADMIN'
  const isCourseTeacher = (
    input.actorRole === 'TEACHER'
    && input.actorUserId === input.inviteCourseCreatorUserId
  )
  if (!isAdmin && !isCourseTeacher) {
    identityFail('RELATIONSHIP_APPROVER', '错误教师或其他角色不能批准家长关系')
  }
  const now = input.now ?? new Date().toISOString()
  return {
    ...input.relationship,
    status: 'ACTIVE',
    approvedByUserId: input.actorUserId,
    approvedAt: now,
    consentVersion: input.consentVersion,
    consentHash: input.consentHash,
  }
}

export const revokeParentRelationship = (input: {
  relationship: ParentStudentRelationshipRecordV1
  actorUserId: string
  reason: string
  now?: string
}): ParentStudentRelationshipRecordV1 => {
  if (input.relationship.status === 'REVOKED') {
    identityFail('RELATIONSHIP_STATE', '关系已撤销')
  }
  const now = input.now ?? new Date().toISOString()
  return {
    ...input.relationship,
    status: 'REVOKED',
    revokedByUserId: input.actorUserId,
    revokedAt: now,
    revokeReason: input.reason,
  }
}

/** Revoked parents cannot view subject-linked projections. */
export const assertParentCanViewRespondentProjection = (input: {
  relationship: ParentStudentRelationshipRecordV1
  parentUserId: string
  respondentUserId: string
  /** Subject-bound IDOR fix: relationship.studentUserId must equal assignment.subjectUserId. */
  subjectUserId?: string | null
}): void => {
  if (input.relationship.parentUserId !== input.parentUserId) {
    identityFail('RELATIONSHIP_VIEW', '非本关系家长')
  }
  if (input.relationship.status !== 'ACTIVE') {
    identityFail('RELATIONSHIP_REVOKED_VIEW', '已撤销关系不可再查看')
  }
  if (input.respondentUserId !== input.parentUserId) {
    identityFail('RELATIONSHIP_VIEW', '家长只能查看自己作为 respondent 的投影')
  }
  if (
    input.subjectUserId !== undefined
    && input.subjectUserId !== null
    && input.relationship.studentUserId !== input.subjectUserId
  ) {
    identityFail('RELATIONSHIP_VIEW', 'relationship.studentUserId 必须等于 assignment.subjectUserId')
  }
}

export const createEpisode = (input: {
  subjectUserId: string | null
  initiatedByUserId: string | null
  initiationMode: AssessmentEpisodeInitiationModeV1
  courseId?: string | null
  campaignKey?: string | null
  label?: string | null
}): { episodeId: string; initiationMode: AssessmentEpisodeInitiationModeV1 } => ({
  episodeId: randomUUID(),
  initiationMode: input.initiationMode,
})

export const createAttemptConsent = (input: {
  subjectUserId: string | null
  respondentUserId: string | null
  respondentType: RespondentTypeV1
  consentVersion: string
  purpose: string
  visibilityScope: string
  shareTargets?: string[]
  /** When omitted and pending=true, acceptedAt is null (teacher assign awaiting parent acceptance). */
  acceptedAt?: string | null
  pending?: boolean
}): AssessmentAttemptConsentRecordV1 => {
  if (input.subjectUserId && input.respondentUserId) {
    assertSubjectRespondentSeparation({
      subjectUserId: input.subjectUserId,
      respondentUserId: input.respondentUserId,
      respondentType: input.respondentType,
    })
  }
  const pending = input.pending === true || input.acceptedAt === null
  const acceptedAt = pending
    ? null
    : (input.acceptedAt ?? new Date().toISOString())
  const consentHash = canonicalHash({
    consentVersion: input.consentVersion,
    purpose: input.purpose,
    visibilityScope: input.visibilityScope,
    shareTargets: input.shareTargets ?? [],
    subjectUserId: input.subjectUserId,
    respondentUserId: input.respondentUserId,
    respondentType: input.respondentType,
    pending,
  })
  return {
    consentId: randomUUID(),
    subjectUserId: input.subjectUserId,
    respondentUserId: input.respondentUserId,
    respondentType: input.respondentType,
    consentVersion: input.consentVersion,
    consentHash,
    purpose: input.purpose,
    visibilityScope: input.visibilityScope,
    shareTargets: [...(input.shareTargets ?? [])],
    acceptedAt,
    revokedAt: null,
  }
}

/** Parent accepts a previously pending teacher-assigned consent. */
export const acceptPendingAttemptConsent = (input: {
  pending: AssessmentAttemptConsentRecordV1
  acceptedAt?: string
}): AssessmentAttemptConsentRecordV1 => {
  if (input.pending.revokedAt) {
    identityFail('CONSENT_STATE', '已撤销 consent 不可接受')
  }
  const acceptedAt = input.acceptedAt ?? new Date().toISOString()
  return {
    ...input.pending,
    consentId: randomUUID(), // append-only new acceptance row
    acceptedAt,
    consentHash: canonicalHash({
      consentVersion: input.pending.consentVersion,
      purpose: input.pending.purpose,
      visibilityScope: input.pending.visibilityScope,
      shareTargets: input.pending.shareTargets,
      subjectUserId: input.pending.subjectUserId,
      respondentUserId: input.pending.respondentUserId,
      respondentType: input.pending.respondentType,
      pending: false,
      priorConsentId: input.pending.consentId,
    }),
  }
}

export const enumerateInviteBruteForceGuard = (input: {
  failedAttempts: number
  maxAttempts?: number
}): void => {
  const max = input.maxAttempts ?? 20
  if (input.failedAttempts >= max) {
    identityFail('INVITE_ENUMERATION', '邀请码尝试过多，疑似枚举')
  }
}
