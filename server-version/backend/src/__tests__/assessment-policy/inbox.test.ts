import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ runs: vi.fn(), relational: vi.fn(), course: vi.fn(), scales: vi.fn(), cognitive: vi.fn(), sessions: vi.fn(), situational: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { assessment: { findMany: mocks.scales }, cognitiveSession: { findMany: mocks.sessions }, situationalAttempt: { findMany: mocks.situational } } }))
vi.mock('../../modules/assessment-run/productRead', () => ({ listAssignedRunTasks: mocks.runs }))
vi.mock('../../modules/assessment-relational/product.service', () => ({ relationalProductService: { tasks: mocks.relational } }))
vi.mock('../../modules/assessment-relational/legacy-domain', () => ({ filterLegacyRelationalAssignments: async (items: unknown[]) => items }))
vi.mock('../../services/studentTasks', () => ({ listStudentTasks: mocks.course }))
vi.mock('../../modules/cognitive/assignment.service', () => ({ listStudentAssignments: mocks.cognitive }))
import { listRespondentAssessments } from '../../modules/assessment-policy/inbox'

beforeEach(() => { vi.clearAllMocks(); mocks.runs.mockResolvedValue({ list: [], truncated: false }); mocks.relational.mockResolvedValue([]); mocks.scales.mockResolvedValue([]); mocks.cognitive.mockResolvedValue([]); mocks.sessions.mockResolvedValue([]); mocks.situational.mockResolvedValue([]); mocks.course.mockResolvedValue({ list: [], total: 0 }) })
describe('respondent inbox', () => {
  it('uses exact identity for ADMIN respondents without requesting tenant data', async () => {
    await listRespondentAssessments('admin-self', 'ADMIN')
    expect(mocks.runs).toHaveBeenCalledWith('admin-self')
    expect(mocks.scales.mock.calls[0][0].where).toMatchObject({ userId: 'admin-self', compositeAttemptId: null, questionnaireAssessmentId: null })
    expect(mocks.course).not.toHaveBeenCalled()
    expect(mocks.relational).not.toHaveBeenCalled()
  })
  it('keeps coursework outside the measurement inbox and retains assessment actions', async () => {
    mocks.course.mockResolvedValue({ list: [
      { id: 'hw', kind: 'ASSIGNMENT', title: 'Homework' },
      { id: 'q', kind: 'QUESTIONNAIRE', title: 'Questionnaire', state: 'PENDING', deadline: null, courses: [], href: '/student/questionnaires/q' },
    ], total: 2 })
    const result = await listRespondentAssessments('student-a', 'STUDENT')
    expect(result.list).toHaveLength(1)
    expect(result.list[0]).toMatchObject({ respondent: { userId: 'student-a', role: 'STUDENT' }, launchTarget: '/student/questionnaires/q' })
    expect(JSON.stringify(result)).not.toContain('Homework')
  })
})
