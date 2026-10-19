import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { CognitiveRunner } from '../pages/CognitiveRunner'
import type { CognitiveSession } from '../types'
import { createFinalDraftMeta, finalDraftStore, trainingCognitiveDraftKey } from '../../../services/persistence/finalDraftStore'
import { readCognitiveRecoveryCredential, saveCognitiveRecoveryCredential } from '../core/recovery-credential'

const mocks = vi.hoisted(() => {
  const api = {
    getSession: vi.fn(), appendTrial: vi.fn(), appendTrials: vi.fn(),
    completeSession: vi.fn(), submitFinal: vi.fn(), restartSession: vi.fn(),
  }
  return { api, publicApi: vi.fn(() => api) }
})

vi.mock('../api', () => ({ cognitiveApi: mocks.api, publicCognitiveApi: mocks.publicApi }))

const ParentLocation = () => {
  const location = useLocation()
  return <p data-testid="parent-location">{location.pathname}{location.search}</p>
}

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
    saveCognitiveRecoveryCredential(session.sessionId, 'child-credential')
    sessionStorage.setItem(`composite:recovery:attempt:${parentId}`, 'parent-credential')
    const remove = vi.spyOn(finalDraftStore, 'delete')
    const putTrial = vi.spyOn(finalDraftStore, 'putTrial')
    const seal = vi.spyOn(finalDraftStore, 'sealForSubmission')

    render(<MemoryRouter initialEntries={[`/${surface}/cognitive/sessions/${session.sessionId}${query}`]}>
      <Routes>
        <Route path={`/${surface}/cognitive/sessions/:sessionId`} element={<CognitiveRunner />} />
        <Route path={`/${surface}/composite/attempts/:attemptId`} element={<ParentLocation />} />
      </Routes>
    </MemoryRouter>)

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
    expect(await screen.findByTestId('parent-location')).toHaveTextContent(`/${surface}/composite/attempts/${parentId}`)
    expect(readCognitiveRecoveryCredential(session.sessionId)).toBe('child-credential')
    expect(sessionStorage.getItem(`composite:recovery:attempt:${parentId}`)).toBe('parent-credential')
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
