import { describe, expect, it } from 'vitest'
import { RelationalAssessmentError } from '../../modules/assessment-relational/errors'
import { createRelationalRuntimeConsentAuthority } from '../../modules/assessment-relational/runtime-consent'
import type { RelationalAssignmentRecordV1 } from '../../modules/assessment-relational/types'

const assignment = (overrides: Partial<RelationalAssignmentRecordV1> = {}): RelationalAssignmentRecordV1 => ({
  assignmentId: 'assignment-1',
  episodeId: 'episode-1',
  subjectUserId: 'student-1',
  subjectRole: 'STUDENT',
  respondentUserId: 'parent-1',
  respondentRole: 'PARENT',
  createdByUserId: 'teacher-1',
  relationshipKind: 'PARENT_CHILD',
  relationshipRef: 'relationship-1',
  relationshipSnapshot: {
    schemaVersion: 1,
    relationshipKind: 'PARENT_CHILD',
    relationshipRef: 'relationship-1',
    subjectUserId: 'student-1',
    subjectRole: 'STUDENT',
    respondentUserId: 'parent-1',
    respondentRole: 'PARENT',
    courseId: null,
    verifiedAt: '2026-09-18T00:00:00.000Z',
    facts: {},
  },
  relationshipSnapshotHash: 'a'.repeat(64),
  perspective: 'OBSERVER_REPORT',
  resourceKind: 'BUNDLE',
  resourceKey: 'observer-v1',
  resourceVersion: '1.0.0',
  applicabilityHash: 'b'.repeat(64),
  analysisMode: 'INDIVIDUAL_ONLY',
  minimumRespondents: null,
  consentId: 'consent-root-a',
  visibilityPolicyKey: 'observer_assigning_teacher_v1',
  status: 'STARTED',
  createdAt: '2026-09-18T00:00:00.000Z',
  startedAt: '2026-09-18T00:05:00.000Z',
  completedAt: null,
  revokedAt: null,
  ...overrides,
})

const failCode = async (run: () => Promise<unknown>) => {
  try {
    await run()
    throw new Error('expected RelationalAssessmentError')
  } catch (error) {
    if (error instanceof RelationalAssessmentError) return error.code
    throw error
  }
}

const authority = (input: {
  record?: RelationalAssignmentRecordV1
  resolvedConsentId?: string | null
  attemptConsentId?: string | null
  cognitiveParentId?: string | null
}) => {
  const record = input.record ?? assignment()
  return createRelationalRuntimeConsentAuthority({
    db: {
      compositeAssessmentAttempt: {
        async findUnique() {
          return {
            userId: record.respondentUserId,
            assignmentRef: record.assignmentId,
            consentId: input.attemptConsentId === undefined ? 'consent-accepted-b' : input.attemptConsentId,
          }
        },
      },
      cognitiveSession: {
        async findUnique() {
          return {
            userId: record.respondentUserId,
            compositeAttemptId: input.cognitiveParentId === undefined ? 'composite-attempt-1' : input.cognitiveParentId,
          }
        },
      },
    },
    assignments: {
      async findById() { return record },
      async resolveAcceptedConsent() {
        return input.resolvedConsentId === null
          ? null
          : { consentId: input.resolvedConsentId ?? 'consent-accepted-b', acceptedAt: '2026-09-18T00:01:00.000Z' }
      },
    },
  })
}

describe('relational runtime FINAL consent authority', () => {
  it('requires the currently resolved accepted consent at Composite FINAL', async () => {
    await expect(authority({}).assertCompositeFinal('attempt-1', 'parent-1')).resolves.toBeUndefined()
    expect(await failCode(() => authority({ resolvedConsentId: null }).assertCompositeFinal('attempt-1', 'parent-1')))
      .toBe('RELATIONAL_CONSENT_REQUIRED')
    expect(await failCode(() => authority({ resolvedConsentId: 'consent-accepted-c' }).assertCompositeFinal('attempt-1', 'parent-1')))
      .toBe('RELATIONAL_CONSENT_BINDING')
  })

  it('applies the same authority through an embedded Cognitive session', async () => {
    await expect(authority({}).assertCognitiveFinal('session-1', 'parent-1')).resolves.toBeUndefined()
    expect(await failCode(() => authority({ resolvedConsentId: null }).assertCognitiveFinal('session-1', 'parent-1')))
      .toBe('RELATIONAL_CONSENT_REQUIRED')
  })

  it('keeps consent-free Student-to-Teacher FINAL valid but rejects unexpected consent binding', async () => {
    const relationalExperience = assignment({
      subjectUserId: 'teacher-1',
      subjectRole: 'TEACHER',
      respondentUserId: 'student-1',
      respondentRole: 'STUDENT',
      relationshipKind: 'COURSE_TEACHER_STUDENT',
      relationshipRef: null,
      relationshipSnapshot: {
        schemaVersion: 1,
        relationshipKind: 'COURSE_TEACHER_STUDENT',
        relationshipRef: null,
        subjectUserId: 'teacher-1',
        subjectRole: 'TEACHER',
        respondentUserId: 'student-1',
        respondentRole: 'STUDENT',
        courseId: 'course-1',
        verifiedAt: '2026-09-18T00:00:00.000Z',
        facts: {},
      },
      perspective: 'RELATIONAL_EXPERIENCE',
      analysisMode: 'COHORT_AGGREGATE',
      minimumRespondents: 3,
      consentId: null,
      visibilityPolicyKey: 'student_teacher_aggregate_only_v1',
    })
    await expect(authority({ record: relationalExperience, attemptConsentId: null }).assertCompositeFinal('attempt-1', 'student-1'))
      .resolves.toBeUndefined()
    expect(await failCode(() => authority({ record: relationalExperience, attemptConsentId: 'unexpected' }).assertCompositeFinal('attempt-1', 'student-1')))
      .toBe('RELATIONAL_RUNTIME_BINDING')
  })

  it('rejects legacy Organization observer attempts without consent while preserving completed replay', async () => {
    const record = assignment({ policyDomain: 'ORGANIZATION_RUN', consentId: null })
    expect(await failCode(() => authority({ record, attemptConsentId: null }).assertCompositeFinal('attempt-1', 'parent-1'))).toBe('RELATIONAL_CONSENT_REQUIRED')
    await expect(authority({ record: { ...record, status: 'COMPLETED' }, attemptConsentId: null }).assertCompositeFinal('attempt-1', 'parent-1')).resolves.toBeUndefined()
  })

  it('leaves historical completed FINAL replay semantics to the runtime', async () => {
    const completed = assignment({ status: 'COMPLETED', completedAt: '2026-09-18T00:20:00.000Z' })
    await expect(authority({ record: completed, resolvedConsentId: null }).assertCompositeFinal('attempt-1', 'parent-1'))
      .resolves.toBeUndefined()
  })
})
