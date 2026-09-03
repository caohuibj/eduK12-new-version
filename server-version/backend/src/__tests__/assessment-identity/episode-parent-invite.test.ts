import { describe, expect, it } from 'vitest'
import {
  AssessmentIdentityError,
  approveParentRelationship,
  assertParentCanViewRespondentProjection,
  assertSubjectRespondentSeparation,
  buildAttemptIdentity,
  consumeParentInviteCode,
  createAttemptConsent,
  createParentInviteCode,
  createPendingParentRelationship,
  enumerateInviteBruteForceGuard,
  historicalAttemptIdentity,
  refuseInferIdentityFromLegacyUserId,
  revokeParentRelationship,
} from '../../modules/assessment-identity'

const failCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected AssessmentIdentityError')
  } catch (error) {
    if (error instanceof AssessmentIdentityError) return error.code
    throw error
  }
}

describe('episode / PARENT / invite / consent', () => {
  it('keeps historical identity null and refuses guessing from legacy userId', () => {
    expect(historicalAttemptIdentity()).toEqual({
      subjectUserId: null,
      respondentUserId: null,
      respondentType: null,
      episodeId: null,
      assignmentRef: null,
      consentId: null,
    })
    expect(refuseInferIdentityFromLegacyUserId('legacy-user-1').subjectUserId).toBeNull()
    expect(refuseInferIdentityFromLegacyUserId('legacy-user-1').respondentUserId).toBeNull()
  })

  it('enforces subject ≠ respondent for PARENT/TEACHER and equality for SELF', () => {
    expect(failCode(() => assertSubjectRespondentSeparation({
      subjectUserId: 'student-1',
      respondentUserId: 'student-1',
      respondentType: 'PARENT',
    }))).toBe('IDENTITY_SUBJECT_EQUALS_RESPONDENT')

    expect(() => assertSubjectRespondentSeparation({
      subjectUserId: 'student-1',
      respondentUserId: 'parent-1',
      respondentType: 'PARENT',
    })).not.toThrow()

    expect(failCode(() => assertSubjectRespondentSeparation({
      subjectUserId: 'student-1',
      respondentUserId: 'parent-1',
      respondentType: 'SELF',
    }))).toBe('IDENTITY_SELF_MISMATCH')

    const identity = buildAttemptIdentity({
      subjectUserId: 'student-1',
      respondentUserId: 'parent-1',
      respondentType: 'PARENT',
      episodeId: 'episode-1',
      consentId: 'consent-1',
    })
    expect(identity.subjectUserId).not.toBe(identity.respondentUserId)
  })

  it('mints ACTIVE-course invites and rejects expiry / replay / enumeration', () => {
    expect(failCode(() => createParentInviteCode({
      studentUserId: 'student-1',
      courseId: 'course-1',
      createdByUserId: 'student-1',
      studentCourseStatus: 'PENDING',
    }))).toBe('INVITE_COURSE_STATUS')

    const minted = createParentInviteCode({
      studentUserId: 'student-1',
      courseId: 'course-1',
      createdByUserId: 'student-1',
      studentCourseStatus: 'ACTIVE',
      now: '2026-09-03T05:00:00.000Z',
      ttlMs: 60_000,
    })
    expect(minted.record.status).toBe('ACTIVE')
    expect(minted.record.codeHash).toMatch(/^[0-9a-f]{64}$/)

    expect(failCode(() => consumeParentInviteCode({
      record: minted.record,
      plaintext: minted.plaintext,
      parentUserId: 'parent-1',
      now: '2026-09-03T05:02:00.000Z',
    }))).toBe('INVITE_EXPIRED')

    const fresh = createParentInviteCode({
      studentUserId: 'student-1',
      courseId: 'course-1',
      createdByUserId: 'student-1',
      studentCourseStatus: 'ACTIVE',
      now: '2026-09-03T05:00:00.000Z',
    })
    const consumed = consumeParentInviteCode({
      record: fresh.record,
      plaintext: fresh.plaintext,
      parentUserId: 'parent-1',
      now: '2026-09-03T05:00:30.000Z',
    })
    expect(consumed.status).toBe('CONSUMED')
    expect(failCode(() => consumeParentInviteCode({
      record: consumed,
      plaintext: fresh.plaintext,
      parentUserId: 'parent-2',
      now: '2026-09-03T05:00:40.000Z',
    }))).toBe('INVITE_REPLAY')

    expect(failCode(() => enumerateInviteBruteForceGuard({ failedAttempts: 20 }))).toBe('INVITE_ENUMERATION')
  })

  it('rejects wrong teacher approval and blocks revoked parent viewing', () => {
    const invite = createParentInviteCode({
      studentUserId: 'student-1',
      courseId: 'course-1',
      createdByUserId: 'student-1',
      studentCourseStatus: 'ACTIVE',
    })
    const pending = createPendingParentRelationship({
      parentUserId: 'parent-1',
      studentUserId: 'student-1',
      inviteCodeId: invite.record.inviteCodeId,
    })
    expect(pending.status).toBe('PENDING')

    expect(failCode(() => approveParentRelationship({
      relationship: pending,
      actorUserId: 'teacher-wrong',
      actorRole: 'TEACHER',
      inviteCourseCreatorUserId: 'teacher-course-owner',
      consentVersion: 'parent-rel-v1',
      consentHash: 'a'.repeat(64),
    }))).toBe('RELATIONSHIP_APPROVER')

    const approved = approveParentRelationship({
      relationship: pending,
      actorUserId: 'teacher-course-owner',
      actorRole: 'TEACHER',
      inviteCourseCreatorUserId: 'teacher-course-owner',
      consentVersion: 'parent-rel-v1',
      consentHash: 'a'.repeat(64),
      now: '2026-09-03T05:10:00.000Z',
    })
    expect(approved.status).toBe('ACTIVE')

    expect(() => assertParentCanViewRespondentProjection({
      relationship: approved,
      parentUserId: 'parent-1',
      respondentUserId: 'parent-1',
    })).not.toThrow()

    const revoked = revokeParentRelationship({
      relationship: approved,
      actorUserId: 'teacher-course-owner',
      reason: 'revoked by teacher',
      now: '2026-09-03T05:20:00.000Z',
    })
    expect(revoked.status).toBe('REVOKED')
    expect(failCode(() => assertParentCanViewRespondentProjection({
      relationship: revoked,
      parentUserId: 'parent-1',
      respondentUserId: 'parent-1',
    }))).toBe('RELATIONSHIP_REVOKED_VIEW')
  })

  it('records per-attempt consent without inventing subject/respondent', () => {
    const consent = createAttemptConsent({
      subjectUserId: 'student-1',
      respondentUserId: 'parent-1',
      respondentType: 'PARENT',
      consentVersion: 'attempt-consent-v1',
      purpose: 'observer_report',
      visibilityScope: 'respondent_only',
      shareTargets: [],
      acceptedAt: '2026-09-03T05:15:00.000Z',
    })
    expect(consent.consentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(consent.revokedAt).toBeNull()
  })
})
