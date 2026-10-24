import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), state: vi.fn(), finalize: vi.fn(), startContent: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { questionnaireAssessment: { findUnique: mocks.findUnique } } }))
vi.mock('../../services/questionnaire-form-section.service', () => ({ getQuestionnaireFinalAttemptState: mocks.state, finalizeQuestionnaireAttemptIfReady: mocks.finalize }))
vi.mock('../../services/cacheService', () => ({ cacheService: { getQuestionnaireStartContent: mocks.startContent } }))
import { publicQuestionnaireController } from '../../controllers/publicQuestionnaireController'
import { questionnaireController } from '../../controllers/questionnaireController'
const header = { id: 'qa-1', userId: 'student-1', deliveryMode: 'FINAL_ONLY' }
const state = (status = 'IN_PROGRESS', currentIndex = 0) => ({ questionnaireAssessment: { id: 'qa-1', status, currentIndex }, totalItems: 2, currentFormSection: { id: 'section-1', items: [] } })
const invoke = async () => {
  const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }
  await questionnaireController.getAssessment({ params: { id: 'qa-1' }, user: { userId: 'student-1' } } as any, res as any)
  return res
}
beforeEach(() => { vi.resetAllMocks(); mocks.findUnique.mockResolvedValue(header); mocks.state.mockResolvedValue(state()) })
describe('registered questionnaire state lean FINAL dispatch', () => {
  it.each(['IN_PROGRESS', 'PAUSED', 'COMPLETED'])('preserves %s FINAL DTO without requesting legacy payloads', async status => {
    const expected = state(status); mocks.state.mockResolvedValue(expected)
    const res = await invoke()
    expect(mocks.findUnique).toHaveBeenCalledTimes(1)
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: 'qa-1' }, select: { id: true, userId: true, deliveryMode: true } })
    expect(mocks.state).toHaveBeenCalledExactlyOnceWith('qa-1')
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expected }))
    expect(mocks.finalize).not.toHaveBeenCalled()
  })
  it('retains reconcile and fresh response at the end', async () => {
    const completed = state('COMPLETED', 2)
    mocks.state.mockResolvedValueOnce(state('IN_PROGRESS', 2)).mockResolvedValueOnce(completed)
    const res = await invoke()
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith('qa-1'); expect(mocks.state).toHaveBeenCalledTimes(2)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: completed }))
  })
  it('rejects another owner before loading runtime', async () => {
    mocks.findUnique.mockResolvedValue({ ...header, userId: 'other' }); const res = await invoke()
    expect(res.status).toHaveBeenCalledWith(403); expect(mocks.findUnique).toHaveBeenCalledTimes(1); expect(mocks.state).not.toHaveBeenCalled()
  })
  it('keeps missing attempt error', async () => {
    mocks.findUnique.mockResolvedValue(null); const res = await invoke()
    expect(res.status).toHaveBeenCalledWith(404); expect(mocks.state).not.toHaveBeenCalled()
  })
  it('keeps legacy resume DTO with one additional header query', async () => {
    mocks.findUnique.mockResolvedValueOnce({ ...header, deliveryMode: 'LEGACY' }).mockResolvedValueOnce({
      ...header, deliveryMode: 'LEGACY', status: 'IN_PROGRESS', attemptEpoch: 0,
      questionnaire: { id: 'q-1', name: 'Legacy', instruction: null, formItems: [{ id: 'f-1', label: 'Name', type: 'TEXT', required: true, position: 0 }], questionnaireScales: [] }, scaleAssessments: [], formAnswers: [],
    })
    const res = await invoke()
    expect(mocks.findUnique).toHaveBeenCalledTimes(2); expect(mocks.findUnique.mock.calls[1][0]).toHaveProperty('include.formAnswers', true); expect(mocks.state).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      questionnaire: { id: 'q-1', name: 'Legacy', instruction: null, totalItems: 1 },
      currentFormItem: { id: 'f-1', label: 'Name', type: 'TEXT', required: true, position: 0 }, currentFormAnswerRevision: 0, currentScale: null, totalItems: 1,
      contentItems: [{ type: 'form', position: 0, id: 'f-1', label: 'Name', completed: false }], scaleAssessments: [],
    }) }))
  })
  it('rechecks ownership after the legacy header', async () => {
    mocks.findUnique.mockResolvedValueOnce({ ...header, deliveryMode: 'LEGACY' }).mockResolvedValueOnce({ ...header, userId: 'other' })
    const res = await invoke(); expect(res.status).toHaveBeenCalledWith(403); expect(mocks.state).not.toHaveBeenCalled()
  })
})

const invokePublic = async () => {
  const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }
  await publicQuestionnaireController.getAssessment({ params: { sessionId: 'session-1' } } as any, res as any)
  return res
}
describe('public questionnaire state lean FINAL dispatch', () => {
  it.each(['IN_PROGRESS', 'PAUSED', 'COMPLETED'])('keeps %s DTO and session locator without legacy reads', async status => {
    const expected = state(status); mocks.state.mockResolvedValue(expected)
    const res = await invokePublic()
    expect(mocks.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { sessionId: 'session-1' }, select: { id: true, deliveryMode: true } })
    expect(mocks.state).toHaveBeenCalledExactlyOnceWith('qa-1')
    expect(mocks.startContent).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { ...expected, sessionId: 'session-1' } }))
  })
  it('retains finalization and reread when the end is reached', async () => {
    const completed = state('COMPLETED', 2)
    mocks.state.mockResolvedValueOnce(state('IN_PROGRESS', 2)).mockResolvedValueOnce(completed)
    const res = await invokePublic()
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith('qa-1'); expect(mocks.state).toHaveBeenCalledTimes(2)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { ...completed, sessionId: 'session-1' } }))
  })
  it('keeps missing session error', async () => {
    mocks.findUnique.mockResolvedValue(null); const res = await invokePublic()
    expect(res.status).toHaveBeenCalledWith(404); expect(mocks.state).not.toHaveBeenCalled()
  })
  it('keeps legacy response and content lookup with one additional header query', async () => {
    const item = { id: 'f-1', label: 'Name', type: 'TEXT', required: true, position: 0 }
    mocks.startContent.mockResolvedValue({ formItems: [item], questionnaireScales: [] })
    mocks.findUnique.mockResolvedValueOnce({ ...header, deliveryMode: 'LEGACY' }).mockResolvedValueOnce({
      ...header, deliveryMode: 'LEGACY', status: 'IN_PROGRESS', questionnaire: { id: 'q-1', name: 'Legacy', instruction: null }, scaleAssessments: [], formAnswers: [],
    })
    const res = await invokePublic()
    expect(mocks.findUnique).toHaveBeenCalledTimes(2)
    expect(mocks.findUnique.mock.calls[1][0]).toHaveProperty('select.formAnswers')
    expect(mocks.startContent).toHaveBeenCalledExactlyOnceWith('q-1'); expect(mocks.state).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currentFormItem: item, currentFormAnswerRevision: 0, totalItems: 1, sessionId: 'session-1' }) }))
  })
})
