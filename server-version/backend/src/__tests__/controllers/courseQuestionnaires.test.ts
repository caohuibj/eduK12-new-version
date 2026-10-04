import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({
  course: { findUnique: vi.fn() }, questionnaire: { findMany: vi.fn() }, compositeAssessment: { findMany: vi.fn() },
}))
vi.mock('../../config/database', () => ({ prisma: db }))
import { courseQuestionnaires } from '../../controllers/courseQuestionnairesController'
const req = (role = 'TEACHER', userId = 'owner') => ({ params: { id: 'course' }, user: { role, userId } } as any)
function res() {
  const r: any = { statusCode: 200 }
  r.status = vi.fn((code) => { r.statusCode = code; return r })
  r.json = vi.fn((body) => { r.body = body; return r })
  return r
}
beforeEach(() => {
  vi.resetAllMocks()
  db.course.findUnique.mockResolvedValue({ id: 'course', creatorId: 'owner', shares: [] })
  db.questionnaire.findMany.mockResolvedValue([{ id: 'old', code: 'old', name: '旧版问卷', description: null, estimatedTime: 5, creatorId: 'owner', _count: { questionnaireScales: 2 } }])
  db.compositeAssessment.findMany.mockResolvedValue([{ id: 'new', code: 'new', name: '新版问卷', description: null, createdBy: 'owner', _count: { items: 3 } }])
})
describe('course questionnaire delivery projection', () => {
  it('includes legacy and collection deliveries, with correct separate management routes', async () => {
    const r = res(); await courseQuestionnaires(req(), r)
    expect(r.body.data.total).toBe(2)
    expect(r.body.data.list).toEqual([
      expect.objectContaining({ id: 'old', manageHref: '/questionnaires/old', unitCount: 2 }),
      expect.objectContaining({ id: 'new', manageHref: '/questionnaire-products/new', unitCount: 3 }),
    ])
    expect(db.questionnaire.findMany.mock.calls[0][0].where).toEqual({ type: 'COURSE', status: 'PUBLISHED', courseQuestionnaires: { some: { courseId: 'course' } } })
    expect(db.compositeAssessment.findMany.mock.calls[0][0].where).toEqual({ productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', status: 'PUBLISHED', questionnaireCourses: { some: { courseId: 'course' } } })
    expect(r.body.data.list[1]).not.toHaveProperty('createdBy')
  })
  it.each(['STUDENT', 'PARENT', 'COUNSELOR'])('rejects %s before reading questionnaires', async role => {
    const r = res(); await courseQuestionnaires(req(role), r)
    expect(r.statusCode).toBe(403); expect(db.questionnaire.findMany).not.toHaveBeenCalled()
  })
  it('rejects another teacher before reading any questionnaire metadata', async () => {
    const r = res(); await courseQuestionnaires(req('TEACHER', 'other'), r)
    expect(r.statusCode).toBe(403); expect(db.compositeAssessment.findMany).not.toHaveBeenCalled()
  })
  it('allows shared course metadata without granting edit access to its questionnaire', async () => {
    db.course.findUnique.mockResolvedValue({ creatorId: 'owner', shares: [{ sharedTo: 'other' }] })
    const r = res(); await courseQuestionnaires(req('TEACHER', 'other'), r)
    expect(r.body.data.list.every((q: any) => q.manageHref === null)).toBe(true)
  })
  it('returns missing and failed reads as errors, rather than an empty course', async () => {
    db.course.findUnique.mockResolvedValueOnce(null)
    const missing = res(); await courseQuestionnaires(req(), missing); expect(missing.statusCode).toBe(404)
    db.compositeAssessment.findMany.mockRejectedValueOnce(new Error('unavailable'))
    const failed = res(); await courseQuestionnaires(req(), failed); expect(failed.statusCode).toBe(500)
  })
})
