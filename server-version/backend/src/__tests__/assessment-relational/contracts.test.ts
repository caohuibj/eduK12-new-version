import { describe, expect, it } from 'vitest'
import { hashAssessmentBundleDefinition } from '../../modules/assessment-bundle/definition'
import {
  RelationalAssessmentError,
  assertRelationalApplicabilityMatch,
  hashRelationalApplicability,
  validateRelationalApplicability,
  type RelationalApplicabilityV1,
} from '../../modules/assessment-relational'
import { cognitiveSelfBundle, observerBundle } from '../assessment-bundle/fixtures'

const studentTeacher: RelationalApplicabilityV1 = {
  schemaVersion: 1,
  resourceKind: 'BUNDLE',
  resourceKey: 'classroom_environment_student_report_v1',
  resourceVersion: '1.0.0',
  subjectRoles: ['TEACHER'],
  respondentRoles: ['STUDENT'],
  relationshipKinds: ['COURSE_TEACHER_STUDENT'],
  perspectives: ['RELATIONAL_EXPERIENCE'],
  analysisMode: 'COHORT_AGGREGATE',
  visibilityPolicyKey: 'student_teacher_aggregate_only_v1',
  minimumRespondents: 5,
}

const failCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected RelationalAssessmentError')
  } catch (error) {
    if (error instanceof RelationalAssessmentError) return error.code
    throw error
  }
}

describe('Relational applicability contract', () => {
  it('supports student -> teacher without changing legacy respondentType', () => {
    expect(validateRelationalApplicability(studentTeacher).respondentRoles).toEqual(['STUDENT'])
    expect(() => assertRelationalApplicabilityMatch({
      applicability: studentTeacher,
      subjectRole: 'TEACHER',
      respondentRole: 'STUDENT',
      relationshipKind: 'COURSE_TEACHER_STUDENT',
      perspective: 'RELATIONAL_EXPERIENCE',
    })).not.toThrow()
  })

  it('requires privacy floor for cohort aggregate and keeps synthesis reserved', () => {
    expect(failCode(() => validateRelationalApplicability({
      ...studentTeacher,
      minimumRespondents: 2,
    }))).toBe('RELATIONAL_MINIMUM_N')
    expect(failCode(() => validateRelationalApplicability({
      ...studentTeacher,
      analysisMode: 'MULTI_INFORMANT_SYNTHESIS',
      minimumRespondents: null,
    }))).toBe('RELATIONAL_ANALYSIS_RESERVED')
  })

  it('rejects relationship/perspective mismatch', () => {
    expect(failCode(() => validateRelationalApplicability({
      ...studentTeacher,
      relationshipKinds: ['SELF'],
    }))).toBe('RELATIONAL_APPLICABILITY')
  })

  it('hashes applicability independently from frozen Bundle identity', () => {
    expect(hashRelationalApplicability(studentTeacher)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashAssessmentBundleDefinition(cognitiveSelfBundle()))
      .toBe('9822900f3d222e3d2ecc87e6658b48741f5d065da8c45833d653f7f94cdaee03')
    expect(hashAssessmentBundleDefinition(observerBundle()))
      .toBe('430e31826af43a20c86b18ae61a796abc18926fc9acd981f848d6c7202da3570')
  })
})
