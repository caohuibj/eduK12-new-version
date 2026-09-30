import { describe, expect, it } from 'vitest'
import {
  assertJourneyInitiationNarrowing,
  journeyPolicyFromRelationalApplicability,
  normalizeBundleInitiationModes,
  normalizeRelationalJourneyInitiationModes,
} from '../../modules/assessment-policy/journey'
import type { RelationalApplicabilityV1 } from '../../modules/assessment-relational/types'

const applicability: RelationalApplicabilityV1 = {
  schemaVersion: 1,
  resourceKind: 'BUNDLE',
  resourceKey: 'student_teacher_experience',
  resourceVersion: '1.0.0',
  subjectRoles: ['TEACHER'],
  respondentRoles: ['STUDENT'],
  relationshipKinds: ['COURSE_TEACHER_STUDENT'],
  perspectives: ['RELATIONAL_EXPERIENCE'],
  analysisMode: 'COHORT_AGGREGATE',
  visibilityPolicyKey: 'student_teacher_aggregate_only_v1',
  minimumRespondents: 5,
}

describe('AssessmentJourneyPolicyV1', () => {
  it('normalizes existing Bundle initiation modes without changing the source contract', () => {
    expect(normalizeBundleInitiationModes([
      'TEACHER_ASSIGNMENT',
      'PARENT_SELF_SERVE',
      'ANONYMOUS_SELF',
      'STUDENT_COURSE',
    ])).toEqual(['CLASS_ASSIGN', 'RESPONDENT_SELF_START', 'PUBLIC_LINK'])
  })

  it('normalizes existing relational product journeys into delivery vocabulary', () => {
    expect(normalizeRelationalJourneyInitiationModes([
      'TEACHER_ASSIGN_PARENT',
      'PARENT_SELF_SERVE',
      'STUDENT_EXPERIENCE',
      'TEACHER_COHORT_REPORT',
    ])).toEqual([
      'CLASS_ASSIGN',
      'RELATED_OBSERVER_ASSIGN',
      'RESPONDENT_SELF_START',
    ])
  })

  it('projects exact applicability identity instead of creating a second authority source', () => {
    const policy = journeyPolicyFromRelationalApplicability(applicability, ['ORG_ASSIGN', 'CLASS_ASSIGN'])
    expect(policy).toMatchObject({
      schemaVersion: 1,
      resource: { family: 'BUNDLE', key: 'student_teacher_experience', version: '1.0.0' },
      subjectRoles: ['TEACHER'],
      respondentRoles: ['STUDENT'],
      relationshipKinds: ['COURSE_TEACHER_STUDENT'],
      perspectives: ['RELATIONAL_EXPERIENCE'],
      analysisMode: 'COHORT_AGGREGATE',
      minimumRespondents: 5,
      initiationModes: ['ORG_ASSIGN', 'CLASS_ASSIGN'],
    })
    expect(policy.sourcePolicyHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('allows a campaign to narrow initiation but never widen it', () => {
    expect(assertJourneyInitiationNarrowing(
      ['ORG_ASSIGN', 'CLASS_ASSIGN'],
      ['CLASS_ASSIGN'],
    )).toEqual(['CLASS_ASSIGN'])
    expect(() => assertJourneyInitiationNarrowing(
      ['CLASS_ASSIGN'],
      ['CLASS_ASSIGN', 'PUBLIC_LINK'],
    )).toThrow(/cannot widen/)
    expect(() => assertJourneyInitiationNarrowing(['CLASS_ASSIGN'], [])).toThrow(/cannot widen/)
  })
})
