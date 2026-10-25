import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { CognitiveRunner } from '../pages/CognitiveRunner'
import type { CognitiveSession } from '../types'
import { createFinalDraftMeta, finalDraftStore, trainingCognitiveDraftKey } from '../../../services/persistence/finalDraftStore'
import { readCognitiveRecoveryCredential, saveCognitiveRecoveryCredential } from '../core/recovery-credential'
import CompositeAssessmentPage from '../../composite/CompositeAssessmentPage'
import type { CompositeAttemptState } from '../../composite/types'

const mocks = vi.hoisted(() => {
  const api = {
    getSession: vi.fn(), appendTrial: vi.fn(), appendTrials: vi.fn(),
    completeSession: vi.fn(), submitFinal: vi.fn(), restartSession: vi.fn(),
  }
  const parentApi = { getAttempt: vi.fn(), restart: vi.fn() }
  return { api, publicApi: vi.fn(() => api), parentApi, parentPublicApi: vi.fn(() => parentApi) }
})

vi.mock('../api', () => ({ cognitiveApi: mocks.api, publicCognitiveApi: mocks.publicApi }))
vi.mock('../../composite/api', () => ({ compositeApi: mocks.parentApi, publicCompositeApi: mocks.parentPublicApi }))

const ParentLocation = () => {
  const location = useLocation()
  return <p data-testid="parent-location">{location.pathname}{location.search}</p>
}

const parentState = (session: CognitiveSession, id = session.trainingPersistence!.attemptId, accepted = false): CompositeAttemptState => ({
  id, assessmentId: 'assessment', name: '课程综合测评', instruction: null,
  status: 'IN_PROGRESS', progress: accepted ? 50 : 0, completedItems: accepted ? 1 : 0,
  totalItems: accepted ? 2 : 1, currentIndex: accepted ? 1 : 0,
  startedAt: '2026-10-19T00:00:00Z', lastSavedAt: '2026-10-19T00:00:00Z', completedAt: null, anonymousCode: null,
  deliveryMode: 'FINAL_ONLY', attemptEpoch: id === session.trainingPersistence!.attemptId ? 1 : 2,
  trainingPersistence: { ...session.trainingPersistence!, attemptId: id },
  items: [
    ...(accepted ? [{ id: 'accepted-scale', type: 'SCALE' as const, position: 0, label: '已接受的量表', completed: true, index: 0 }] : []),
    { id: 'cognitive-slot', type: 'COGNITIVE', position: accepted ? 1 : 0, label: '认知任务', completed: false, index: accepted ? 1 : 0 },
  ],
  currentItem: { id: 'cognitive-slot', type: 'COGNITIVE', position: accepted ? 1 : 0, required: true,
    cognitiveSession: id === session.trainingPersistence!.attemptId ? session : { ...session, sessionId: `new-${session.sessionId}` } },
})

const renderRecoveryRoute = (surface: string, path: string) => render(<MemoryRouter initialEntries={[path]}>
  <ParentLocation />
  <Routes>
    <Route path={`/${surface}/cognitive/sessions/:sessionId`} element={<CognitiveRunner />} />
    <Route path={`/${surface}/composite/attempts/:attemptId`} element={<CompositeAssessmentPage />} />
  </Routes>
</MemoryRouter>)

const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: vi.fn(async (_name: string, _options: LockOptions, callback: (lock: unknown) => Promise<void>) => callback({})),
  } })
})

afterEach(() => {
  vi.restoreAllMocks()
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks)
  else Reflect.deleteProperty(navigator, 'locks')
})

const expiredSession = async (id: string) => {
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  const session: CognitiveSession = {
    sessionId: `expired-${id}`, assignmentId: 'assignment', testType: 'fake', attemptNo: 1,
    status: 'IN_PROGRESS', configVersion: '1.0.0', engineVersion: '1.0.0', scoringVersion: '1.0.0',
    config: { trialCount: 2, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 }, randomSeed: 'seed',
    deliveryMode: 'FINAL_ONLY', definitionHash: 'definition', attemptEpoch: 1, sessionEpoch: 1,
    trainingPersistence: { snapshotHash: 'policy', attemptId: `parent-${id}`, attemptEpoch: 1,
      courseId: 'course', checkpoint: null, localCognitive: { enabled: true, ttlHours: 1 } },
  }
  const retention = { schemaVersion: 1 as const, snapshotHash: 'policy', attemptId: `parent-${id}`, attemptEpoch: 1,
    sessionId: session.sessionId, sessionEpoch: 1, ttlHours: 1, lastWriteAt: now }
  const key = trainingCognitiveDraftKey(retention)
  await finalDraftStore.ensure(createFinalDraftMeta({ draftKey: key, instrument: 'cognitive', attemptId: session.sessionId,
    attemptEpoch: 1, definitionHash: 'definition', contextSnapshotHash: null, deliveryMode: 'final_only',
    submissionId: `original-${id}`, trainingRetention: retention }))
  await finalDraftStore.putTrial({ draftKey: key, trialIndex: 0, payload: { response: 'old' }, createdAt: now })
  clock.mockReturnValue(now + 3600001)
  mocks.api.getSession.mockResolvedValue({ code: 0, data: session })
  return { session, key, expiredAt: now + 3600001 }
}

describe('Training cognitive expiry recovery navigation', () => {
  it.each([
    { surface: 'student', query: '', name: 'authenticated-direct' },
    { surface: 'public', query: '', name: 'anonymous-direct' },
    { surface: 'student', query: '?returnTo=%2Fstudent%2Fcomposite%2Fattempts%2Funrelated', name: 'different-parent' },
    { surface: 'public', query: '?returnTo=%2Fstudent%2Fcomposite%2Fattempts%2Funrelated', name: 'cross-surface-parent' },
  ])('returns $name to the server-verified parent without restarting the child', async ({ surface, query, name }) => {
    const { session, key, expiredAt } = await expiredSession(name)
    const parentId = session.trainingPersistence!.attemptId
    const nextId = `new-${parentId}`
    mocks.parentApi.getAttempt.mockImplementation(async (id: string) => ({ code: 0, data: parentState(session, id) }))
    mocks.parentApi.restart.mockResolvedValue({ code: 0, data: { attempt: parentState(session, nextId), recoveryToken: 'new-parent-credential' } })
    saveCognitiveRecoveryCredential(session.sessionId, 'child-credential')
    sessionStorage.setItem(`composite:recovery:attempt:${parentId}`, 'parent-credential')
    const remove = vi.spyOn(finalDraftStore, 'delete')
    const putTrial = vi.spyOn(finalDraftStore, 'putTrial')
    const seal = vi.spyOn(finalDraftStore, 'sealForSubmission')

    renderRecoveryRoute(surface, `/${surface}/cognitive/sessions/${session.sessionId}${query}`)

    const back = await screen.findByRole('button', { name: '返回上层测评' })
    expect(screen.getByText('需要处理恢复状态')).toBeTruthy()
    expect(screen.getByText(/本地草稿已过期/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
    expect(screen.queryByRole('button', { name: '重启并继续作答' })).toBeNull()
    expect(screen.queryByRole('button', { name: '开始测评' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'trial 0' })).toBeNull()
    if (surface === 'public') {
      expect(mocks.publicApi).toHaveBeenCalledWith('child-credential')
      expect(screen.getByText('child-credential')).toBeTruthy()
    } else expect(mocks.publicApi).not.toHaveBeenCalled()

    fireEvent.click(back)
    const restart = await screen.findByRole('button', { name: '请求重启整份测评' })
    expect(screen.getByTestId('parent-location')).toHaveTextContent(`/${surface}/composite/attempts/${parentId}?recovery=cognitive-draft-expired&sessionId=${session.sessionId}`)
    expect(screen.queryByRole('button', { name: '开始/继续认知任务' })).toBeNull()
    expect(mocks.parentApi.restart).not.toHaveBeenCalled()
    expect(readCognitiveRecoveryCredential(session.sessionId)).toBe('child-credential')
    expect(sessionStorage.getItem(`composite:recovery:attempt:${parentId}`)).toBe('parent-credential')
    if (surface === 'public') expect(mocks.parentPublicApi).toHaveBeenCalledWith('parent-credential')

    fireEvent.click(restart)
    expect(await screen.findByRole('button', { name: '开始/继续认知任务' })).toBeTruthy()
    expect(mocks.parentApi.restart).toHaveBeenCalledExactlyOnceWith(parentId)
    expect(screen.getByTestId('parent-location').textContent).toBe(`/${surface}/composite/attempts/${nextId}`)
    await waitFor(()=>expect(mocks.parentApi.getAttempt).toHaveBeenCalledWith(nextId, 'current-unit'))
    if (surface === 'public') {
      expect(sessionStorage.getItem(`composite:recovery:attempt:${nextId}`)).toBe('new-parent-credential')
      expect(mocks.parentPublicApi).toHaveBeenCalledWith('new-parent-credential')
    }
    expect((await finalDraftStore.get(key))?.trainingRetention?.expiredAt).toBe(expiredAt)
    expect(await finalDraftStore.listTrials(key)).toEqual([])
    expect(remove).not.toHaveBeenCalled()
    expect(putTrial).not.toHaveBeenCalled()
    expect(seal).not.toHaveBeenCalled()
    expect(mocks.api.submitFinal).not.toHaveBeenCalled()
    expect(mocks.api.restartSession).not.toHaveBeenCalled()
    expect(mocks.api.appendTrial).not.toHaveBeenCalled()
    expect(mocks.api.appendTrials).not.toHaveBeenCalled()
  })

  it.each(['student', 'public'])('shows actionable %s parent recovery when accepted facts prevent restart', async (surface) => {
    const { session, key, expiredAt } = await expiredSession(`blocked-${surface}`)
    const parentId = session.trainingPersistence!.attemptId
    const accepted = parentState(session, parentId, true)
    const before = JSON.stringify(accepted)
    mocks.parentApi.getAttempt.mockResolvedValue({ code: 0, data: accepted })
    let refuse!: (value: unknown) => void
    mocks.parentApi.restart.mockImplementation(() => new Promise(resolve => { refuse = resolve }))
    saveCognitiveRecoveryCredential(session.sessionId, 'child-credential')
    sessionStorage.setItem(`composite:recovery:attempt:${parentId}`, 'parent-credential')
    const remove = vi.spyOn(finalDraftStore, 'delete')
    renderRecoveryRoute(surface, `/${surface}/cognitive/sessions/${session.sessionId}`)
    fireEvent.click(await screen.findByRole('button', { name: '返回上层测评' }))
    const restart = await screen.findByRole('button', { name: '请求重启整份测评' })
    expect(screen.getByText('1. 已接受的量表')).toBeTruthy()
    expect(mocks.parentApi.restart).not.toHaveBeenCalled()
    fireEvent.click(restart)
    fireEvent.click(restart)
    expect(mocks.parentApi.restart).toHaveBeenCalledExactlyOnceWith(parentId)
    expect(screen.getByRole('button', { name: '正在请求重启…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存并退出' })).toBeDisabled()
    refuse({ code: 409, message: '此概率分卷已接收 FINAL 作答，请继续原作答；不能重启重新抽签' })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('请联系老师核对本次记录并处理恢复'))
    expect(screen.getByRole('alert')).toHaveTextContent('已接收 FINAL 作答')
    expect(screen.queryByRole('button', { name: '开始/继续认知任务' })).toBeNull()
    expect(screen.queryByRole('button', { name: '请求重启整份测评' })).toBeNull()
    expect(screen.getByRole('button', { name: '保存并退出' })).toBeEnabled()
    expect(JSON.stringify(accepted)).toBe(before)
    expect(sessionStorage.getItem(`composite:recovery:attempt:${parentId}`)).toBe('parent-credential')
    expect((await finalDraftStore.get(key))?.trainingRetention?.expiredAt).toBe(expiredAt)
    expect(remove).not.toHaveBeenCalled()
    expect(mocks.api.restartSession).not.toHaveBeenCalled()
    expect(mocks.api.submitFinal).not.toHaveBeenCalled()
  })

  it('does not apply a recovery hint for a different child or create an attempt from query data', async () => {
    const { session } = await expiredSession('untrusted-hint')
    const parentId = session.trainingPersistence!.attemptId
    mocks.parentApi.getAttempt.mockResolvedValue({ code: 0, data: parentState(session) })
    renderRecoveryRoute('student', `/student/composite/attempts/${parentId}?recovery=cognitive-draft-expired&sessionId=unrelated-child`)
    expect(await screen.findByRole('button', { name: '开始/继续认知任务' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '请求重启整份测评' })).toBeNull()
    expect(mocks.parentApi.restart).not.toHaveBeenCalled()
    expect(mocks.api.restartSession).not.toHaveBeenCalled()
  })

  it('keeps embedded campus recovery on its parent callback', async () => {
    const { session, key, expiredAt } = await expiredSession('campus')
    const onExit = vi.fn()
    const remove = vi.spyOn(finalDraftStore, 'delete')
    render(<MemoryRouter initialEntries={['/school/activities/current']}>
      <CognitiveRunner campus={{ sessionId: session.sessionId, api: mocks.api, onExit, onCompleted: vi.fn() }} />
    </MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: '返回上层测评' }))
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '重启并继续作答' })).toBeNull()
    expect(screen.queryByRole('button', { name: '开始测评' })).toBeNull()
    expect(mocks.api.restartSession).not.toHaveBeenCalled()
    expect(mocks.api.submitFinal).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect((await finalDraftStore.get(key))?.trainingRetention?.expiredAt).toBe(expiredAt)
  })
})
