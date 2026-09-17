import { describe, expect, it } from 'vitest'
import {
  AssessmentIdentityError,
  assertSubjectRespondentSeparation,
  historicalAttemptIdentity,
} from '../../modules/assessment-identity'
import {
  hashAssessmentBundleDefinition,
  validateAssessmentBundleDefinition,
} from '../../modules/assessment-bundle/definition'
import {
  cognitiveSelfBundle,
  observerBundle,
} from '../assessment-bundle/fixtures'

const failIdentityCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected AssessmentIdentityError')
  } catch (error) {
    if (error instanceof AssessmentIdentityError) return error.code
    throw error
  }
}

describe('Relational Assessment compatibility baseline', () => {
  it('pins legacy attempt identity semantics before relational extensions', () => {
    expect(historicalAttemptIdentity()).toEqual({
      subjectUserId: null,
      respondentUserId: null,
      respondentType: null,
      episodeId: null,
      assignmentRef: null,
      consentId: null,
    })

    expect(() => assertSubjectRespondentSeparation({
      subjectUserId: 'student-1',
      respondentUserId: 'student-1',
      respondentType: 'SELF',
    })).not.toThrow()

    expect(failIdentityCode(() => assertSubjectRespondentSeparation({
      subjectUserId: 'student-1',
      respondentUserId: 'parent-1',
      respondentType: 'SELF',
    }))).toBe('IDENTITY_SELF_MISMATCH')

    for (const respondentType of ['PARENT', 'TEACHER'] as const) {
      expect(() => assertSubjectRespondentSeparation({
        subjectUserId: 'student-1',
        respondentUserId: `${respondentType.toLowerCase()}-1`,
        respondentType,
      })).not.toThrow()
      expect(failIdentityCode(() => assertSubjectRespondentSeparation({
        subjectUserId: 'student-1',
        respondentUserId: 'student-1',
        respondentType,
      }))).toBe('IDENTITY_SUBJECT_EQUALS_RESPONDENT')
    }
  })

  it('pins legacy SELF and observer Bundle validation without relational metadata', () => {
    const self = validateAssessmentBundleDefinition(cognitiveSelfBundle())
    const observer = validateAssessmentBundleDefinition(observerBundle())

    expect(self.respondentTypes).toEqual(['SELF'])
    expect(self.slots.every((slot) => slot.respondentType === 'SELF')).toBe(true)
    expect(observer.respondentTypes).toEqual(['PARENT'])
    expect(observer.slots.every((slot) => slot.respondentType === 'PARENT')).toBe(true)
  })

  it('pins legacy Bundle definition hashes so additive schema work cannot rewrite frozen identity', () => {
    expect(hashAssessmentBundleDefinition(cognitiveSelfBundle()))
      .toBe('9822900f3d222e3d2ecc87e6658b48741f5d065da8c45833d653f7f94cdaee03')
    expect(hashAssessmentBundleDefinition(observerBundle()))
      .toBe('430e31826af43a20c86b18ae61a796abc18926fc9acd981f848d6c7202da3570')
  })
})
