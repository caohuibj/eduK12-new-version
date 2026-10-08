import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const mock = vi.hoisted(() => ({
  course: vi.fn(),
  questionnaire: vi.fn(),
  composite: vi.fn(),
  scale: vi.fn(),
  cognitive: vi.fn(),
}))
vi.mock('../../config/database', () => ({
  prisma: {
    course: { findUnique: mock.course },
    questionnaire: { findMany: mock.questionnaire },
    compositeAssessment: { findMany: mock.composite },
    scale: { findMany: mock.scale },
    cognitiveAssignment: { findMany: mock.cognitive },
  },
}))
import { courseTrainingAssessments } from '../../controllers/courseTrainingAssessmentsController'

const res = () => {
  const response: any = { statusCode: 200, body: null }
  response.status = vi.fn((status: number) => { response.statusCode = status; return response })
  response.json = vi.fn((body: unknown) => { response.body = body; return response })
  return response
}
const req = (role: UserRole, actor = 'creator') => ({
  params: { id: 'course-1' },
  user: { role, userId: actor },
})
beforeEach(() => {
  vi.clearAllMocks()
  mock.course.mockResolvedValue({ id: 'course-1', creatorId: 'creator', isLibrary: false })
  mock.questionnaire.mockResolvedValue([
    { id: 'q', name: '课程反馈', description: null, creatorId: 'creator', _count: { questionnaireScales: 1 } },
  ])
  mock.composite.mockResolvedValue([
    { id: 'modern', name: '现代课程问卷', description: null, createdBy: 'creator', productKind: 'QUESTIONNAIRE', _count: { items: 2 } },
    { id: 'composite', name: '组合', description: null, createdBy: 'creator', productKind: 'LEGACY_COMPOSITE', _count: { items: 3 } },
    { id: 'bundle', name: '固定包', description: null, createdBy: 'other', productKind: 'ASSESSMENT_BUNDLE', _count: { items: 4 } },
  ])
  mock.scale.mockResolvedValue([
    { id: 'scale', name: '课程量表', description: null, creatorId: 'creator', itemCount: 12 },
  ])
  mock.cognitive.mockResolvedValue([
    { id: 'memory', title: '记忆测验', instruction: null, createdBy: 'creator' },
  ])
})

describe('course-scoped read-only Training measurement inventory', () => {
  it('lists delivered Scale, legacy/new questionnaire, Composite, Bundle, standalone Cognitive without learner results', async () => {
    const response = res()
    await courseTrainingAssessments(req(UserRole.TEACHER) as any, response)
    expect(response.statusCode).toBe(200)
    const list = response.body.data.list
    expect(list.map((row: any) => row.kind)).toEqual([
      'LEGACY_QUESTIONNAIRE', 'QUESTIONNAIRE', 'LEGACY_COMPOSITE',
      'ASSESSMENT_BUNDLE', 'SCALE', 'COGNITIVE',
    ])
    expect(list.map((row: any) => row.key)).toEqual([
      'legacy-questionnaire:q', 'composite:modern', 'composite:composite',
      'composite:bundle', 'scale:scale', 'cognitive:memory',
    ])
    expect(list.find((r: any) => r.kind === 'ASSESSMENT_BUNDLE').manageHref).toBeNull()
    expect(list.find((r: any) => r.kind === 'SCALE').manageHref).toBe('/scales/scale')
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|rawAnswer|studentId|participantKey/)
  })

  it('enforces the exact course creator boundary and does not query any measurement for a shared teacher', async () => {
    const response = res()
    await courseTrainingAssessments(req(UserRole.TEACHER, 'shared-teacher') as any, response)
    expect(response.statusCode).toBe(403)
    expect(mock.questionnaire).not.toHaveBeenCalled()
    expect(mock.scale).not.toHaveBeenCalled()
    expect(mock.composite).not.toHaveBeenCalled()
    expect(mock.cognitive).not.toHaveBeenCalled()
  })

  it('filters all sources by exact course delivery, status and standalone nature', async () => {
    await courseTrainingAssessments(req(UserRole.TEACHER) as any, res())
    expect(mock.questionnaire.mock.calls[0][0].where).toMatchObject({
      type: 'COURSE', status: 'PUBLISHED', visibility: { in: ['PUBLIC', 'COURSE'] }, courseQuestionnaires: { some: { courseId: 'course-1' } },
    })
    expect(mock.scale.mock.calls[0][0].where).toMatchObject({
      status: 'PUBLISHED', visibility: { in: ['PUBLIC', 'COURSE'] }, courseScales: { some: { courseId: 'course-1' } },
    })
    expect(mock.cognitive.mock.calls[0][0].where).toMatchObject({
      courseId: 'course-1', status: 'PUBLISHED', listedStandalone: true,
    })
    const composed = mock.composite.mock.calls[0][0].where
    expect(composed.status).toBe('PUBLISHED')
    expect(composed.OR).toContainEqual(expect.objectContaining({
      productKind: { in: ['LEGACY_COMPOSITE', 'ASSESSMENT_BUNDLE'] },
      courseId: 'course-1',
    }))
    expect(composed.OR).toContainEqual(expect.objectContaining({
      productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE',
      questionnaireCourses: { some: { courseId: 'course-1' } },
    }))
  })

  it('rejects missing courses without exposing their content', async () => {
    mock.course.mockResolvedValue(null)
    const response = res()
    await courseTrainingAssessments(req(UserRole.TEACHER) as any, response)
    expect(response.statusCode).toBe(404)
    expect(mock.questionnaire).not.toHaveBeenCalled()
  })
})
