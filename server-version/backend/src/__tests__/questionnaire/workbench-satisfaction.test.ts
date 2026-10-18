import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'
const { db } = vi.hoisted(() => ({ db: {
  course: { findFirst: vi.fn() }, compositeAssessment: { findMany: vi.fn(), count: vi.fn() },
  compositeAssessmentAttempt: { groupBy: vi.fn() }, cognitiveSession: { findMany: vi.fn() },
  $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
} }))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/questionnaire-product/service', () => ({}))
import { courseOverview } from '../../modules/questionnaire-product/workbench'
beforeEach(() => { vi.clearAllMocks(); db.course.findFirst.mockResolvedValue({ id: 'c', title: '课程' }); db.compositeAssessment.count.mockResolvedValue(30); db.cognitiveSession.findMany.mockResolvedValue([]) })
describe('workbench satisfaction batches', () => {
  it('adds repeated status buckets and preserves course provenance in one grouped count', async () => {
    db.compositeAssessment.findMany.mockResolvedValue(Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, name: '问卷', status: 'PUBLISHED', productKind: 'QUESTIONNAIRE' })))
    db.compositeAssessmentAttempt.groupBy.mockResolvedValue([
      ...[null, 'SATISFIED', 'NOT_SATISFIED', 'INVALID'].map(taskSatisfaction => ({ compositeAssessmentId: 'q0', status: 'COMPLETED', taskSatisfaction, _count: { _all: 3 } })),
      { compositeAssessmentId: 'q0', status: 'IN_PROGRESS', taskSatisfaction: 'SATISFIED', _count: { _all: 2 } },
    ])
    const result = await courseOverview({ userId: 'teacher', role: UserRole.TEACHER }, 'c', {})
    expect(result.list[0].attempts).toEqual({ COMPLETED: 12, SATISFIED: 6, NOT_SATISFIED: 6, IN_PROGRESS: 2 })
    expect(result.list[1].attempts).toEqual({ SATISFIED: 0, NOT_SATISFIED: 0 })
    expect(result.countMeaning).toContain('不去重为人数')
    expect(db.compositeAssessmentAttempt.groupBy).toHaveBeenCalledTimes(1)
    expect(db.compositeAssessmentAttempt.groupBy.mock.calls[0][0]).toMatchObject({ by: ['compositeAssessmentId', 'status', 'taskSatisfaction'], _count: { _all: true }, where: { userId: { not: null }, assignmentRef: null, OR: [{ deliveryCourseId: 'c' }, { deliveryCourseId: null, compositeAssessment: { courseId: 'c', productKind: { not: 'QUESTIONNAIRE' } } }] } })
    expect(db.compositeAssessmentAttempt.groupBy.mock.calls[0][0].where.compositeAssessmentId.in).toHaveLength(30)
  })
})
