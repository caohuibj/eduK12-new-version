import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ runs: vi.fn(), relational: vi.fn(), course: vi.fn(), scales: vi.fn(), cognitive: vi.fn(), sessions: vi.fn(), situational: vi.fn(), decrypt: vi.fn(), parse: vi.fn() }))
vi.mock('../../modules/assessment-runtime/security', () => ({ decryptUnifiedRuntimePayload: mocks.decrypt }))
vi.mock('../../modules/assessment-runtime/unit-result', () => ({ parseCanonicalUnitResultEnvelope: mocks.parse }))
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


it.each(['COMPLETED', 'SUBMITTED_NOT_SATISFIED'])('routes submitted course state %s to reports and never a new launch', async (state) => {
  mocks.course.mockResolvedValue({ list: [{ id: 'q', kind: 'COMPOSITE', title: 'Course', state, deadline: null, courses: [{ id: 'c', title: '课程' }], href: '/student/composite/attempts/a/report', canStart: false, canContinue: false }], total: 1 })
  const result = await listRespondentAssessments('student-a', 'STUDENT')
  expect(result.list[0]).toMatchObject({ state, launchTarget: null, reportTarget: '/student/composite/attempts/a/report', resultAvailability: 'REPORT', respondent: { userId: 'student-a', role: 'STUDENT' } })
  expect(result.pendingCount).toBe(0)
  expect(mocks.course).toHaveBeenCalledWith('student-a', { page: 1, pageSize: 200 })
})


it('keeps legacy SJT lists metadata-only without loading or decrypting result blobs', async () => {
  mocks.situational.mockResolvedValueOnce([{ id: 'old', instrumentKey: 'legacy', instrumentVersion: '1.0.0', status: 'COMPLETED', scoringVersion: 'author-key-sum-v1' }])
  const result = await listRespondentAssessments('student-a', 'STUDENT')
  expect(result.list[0].state).toBe('COMPLETED')
  expect(mocks.situational).toHaveBeenCalledTimes(1)
  expect(mocks.situational.mock.calls[0][0].select).not.toHaveProperty('canonicalResultEncrypted')
  expect(mocks.decrypt).not.toHaveBeenCalled()
})

it('loads completed online SJT qualification in one owner-bound batch, never per row', async () => {
  mocks.situational.mockResolvedValueOnce([
    { id: 'old', instrumentKey: 'legacy', instrumentVersion: '1', status: 'COMPLETED', scoringVersion: 'author-key-sum-v1' },
    { id: 'a', instrumentKey: 'online', instrumentVersion: '1', status: 'COMPLETED', scoringVersion: 'sjt-online-v1-author-sum-1' },
    { id: 'b', instrumentKey: 'online', instrumentVersion: '2', status: 'COMPLETED', scoringVersion: 'sjt-online-v1-expert-mean-1' },
    { id: 'pending', instrumentKey: 'online', instrumentVersion: '3', status: 'IN_PROGRESS', scoringVersion: 'sjt-online-v1-author-sum-1' },
  ]).mockResolvedValueOnce([{ id: 'a', canonicalResultEncrypted: 'cipher-a' }, { id: 'b', canonicalResultEncrypted: 'cipher-b' }])
  mocks.decrypt.mockImplementation(value => value)
  mocks.parse.mockImplementation(value => ({ core: { unitType: 'SITUATIONAL', quality: { status: 'invalid', flags: ['sjt_online_response_v1', ...(value === 'cipher-a' ? ['sjt_online_task_not_satisfied'] : [])] } } }))
  const result = await listRespondentAssessments('student-a', 'STUDENT')
  expect(mocks.situational).toHaveBeenCalledTimes(2)
  expect(mocks.situational.mock.calls[1][0]).toEqual({ where: { id: { in: ['a', 'b'] }, userId: 'student-a', compositeAttemptId: null, status: 'COMPLETED' }, select: { id: true, canonicalResultEncrypted: true } })
  expect(mocks.decrypt).toHaveBeenCalledTimes(2)
  expect(result.list.find(row => row.sourceId === 'a')).toMatchObject({ state: 'SUBMITTED_NOT_SATISFIED', launchTarget: null, resultAvailability: 'REPORT' })
  expect(result.list.find(row => row.sourceId === 'b')?.state).toBe('COMPLETED')
  expect(result.list.find(row => row.sourceId === 'old')?.state).toBe('COMPLETED')
})
