import { describe, expect, it } from 'vitest'
import { createRelationalProductReportService } from '../../modules/assessment-relational/product-report.service'

const frozenRelationship = {
  schemaVersion: 1,
  relationshipKind: 'CLASS_TEACHER_STUDENT',
  relationshipRef: 'class-1',
  subjectUserId: 'teacher-1',
  subjectRole: 'TEACHER',
  respondentUserId: 'student-1',
  respondentRole: 'STUDENT',
  courseId: null,
  verifiedAt: '2026-09-19T00:00:00.000Z',
  facts: {},
}

const assignmentRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'assignment-1',
  episodeId: 'episode-1',
  subjectUserId: 'teacher-1',
  subjectRole: 'TEACHER',
  respondentUserId: 'student-1',
  respondentRole: 'STUDENT',
  createdByUserId: 'teacher-1',
  relationshipKind: 'CLASS_TEACHER_STUDENT',
  relationshipRef: 'class-1',
  relationshipSnapshotJson: frozenRelationship,
  relationshipSnapshotHash: '1'.repeat(64),
  perspective: 'RELATIONAL_EXPERIENCE',
  resourceKind: 'SCALE',
  resourceKey: 'feedback',
  resourceVersion: '1.0.0',
  applicabilityHash: '2'.repeat(64),
  analysisMode: 'COHORT_AGGREGATE',
  minimumRespondents: 5,
  consentId: null,
  visibilityPolicyKey: 'protected',
  policyDomain: 'ORGANIZATION_RUN',
  status: 'COMPLETED',
  createdAt: new Date('2026-09-19T00:00:00.000Z'),
  startedAt: new Date('2026-09-19T00:01:00.000Z'),
  completedAt: new Date('2026-09-19T00:02:00.000Z'),
  revokedAt: null,
  ...overrides,
})

const mockDb = (row: ReturnType<typeof assignmentRow>) => ({
  compositeAssessmentAttempt: {
    findUnique: async () => ({ id: 'attempt-1', userId: 'student-1', assignmentRef: 'assignment-1' }),
  },
  assessment: {
    findUnique: async () => ({ id: 'scale-assessment-1', compositeAttemptId: 'attempt-1', status: 'COMPLETED', userId: 'student-1' }),
  },
  $queryRawUnsafe: async () => [row],
})

describe('generic report route isolation', () => {
  it('rejects Organization protected attempts for generic Composite report/export regardless of viewer identity', async () => {
    const service = createRelationalProductReportService(mockDb(assignmentRow()) as any)
    await expect(service.assertGenericCompositeReportAllowed({ attemptId: 'attempt-1' }))
      .rejects.toMatchObject({ code: 'RELATIONAL_ANALYSIS_ACCESS' })
  })

  it('rejects the same protected lineage through generic Scale/Questionnaire report routes', async () => {
    const service = createRelationalProductReportService(mockDb(assignmentRow()) as any)
    await expect(service.assertGenericScaleReportAllowed({ assessmentId: 'scale-assessment-1' }))
      .rejects.toMatchObject({ code: 'RELATIONAL_ANALYSIS_ACCESS' })
  })

  it('keeps individual legacy relational reports on their existing generic surface', async () => {
    const service = createRelationalProductReportService(mockDb(assignmentRow({
      perspective: 'OBSERVER_REPORT',
      analysisMode: 'INDIVIDUAL_ONLY',
      minimumRespondents: null,
      policyDomain: 'LEGACY_COURSE',
    })) as any)
    await expect(service.assertGenericCompositeReportAllowed({ attemptId: 'attempt-1' })).resolves.toBeUndefined()
  })
})
