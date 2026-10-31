import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import CognitiveAssignmentEntry from '../pages/CognitiveAssignmentEntry'
import { readAssignmentSessionId, readSessionLedger } from '../core/session-ledger'

const m = vi.hoisted(() => ({ getAssignment: vi.fn(), createSession: vi.fn(), navigate: vi.fn() }))
vi.mock('../api', () => ({ cognitiveApi: m }))
vi.mock('../../../contexts/CapabilitiesContext', () => ({ useCognitiveEnabled: () => true }))
vi.mock('../../../training/learnerNavigation', () => ({ useTrainingLearnerNavigation: () => ({ enabled: false, navigate: m.navigate }) }))
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
const details = (id: string) => ({ code: 0, data: { id, title: `任务 ${id}`, instruction: `说明 ${id}`, maxAttempts: 2, remainingAttempts: 2 } })
function Navigation() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/assignments/b')}>切换任务 B</button>
}
const mount = () => render(<MemoryRouter initialEntries={['/assignments/a']}><Navigation /><Routes>
  <Route path="/assignments/:assignmentId" element={<CognitiveAssignmentEntry />} />
</Routes></MemoryRouter>)
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); m.getAssignment.mockImplementation(async (id: string) => details(id)) })

it('does not offer the previous assignment start while the next assignment is loading', async () => {
  const next = deferred<ReturnType<typeof details>>()
  m.getAssignment.mockImplementation((id: string) => id === 'b' ? next.promise : Promise.resolve(details(id)))
  m.createSession.mockReturnValue(new Promise(() => {}))
  mount()
  await screen.findByRole('heading', { name: '任务 a' })
  fireEvent.click(screen.getByRole('button', { name: '切换任务 B' }))
  expect.soft(screen.queryByText('说明 a')).toBeNull()
  await act(async () => {
    const staleStart = screen.queryByRole('button', { name: '开始/继续测评' })
    if (staleStart) fireEvent.click(staleStart)
  })
  expect.soft(m.createSession).not.toHaveBeenCalled()
  await act(async () => { next.resolve(details('b')) })
  expect(await screen.findByRole('heading', { name: '任务 b' })).toBeInTheDocument()
})

it('ignores a departed assignment start and keeps the current start and ledger intact', async () => {
  const old = deferred<unknown>(), current = deferred<unknown>()
  m.createSession.mockImplementation((id: string) => id === 'a' ? old.promise : current.promise)
  mount()
  await screen.findByRole('heading', { name: '任务 a' })
  fireEvent.click(screen.getByRole('button', { name: '开始/继续测评' }))
  await waitFor(() => expect(m.createSession).toHaveBeenCalledWith('a'))
  fireEvent.click(screen.getByRole('button', { name: '切换任务 B' }))
  await screen.findByRole('heading', { name: '任务 b' })
  fireEvent.click(screen.getByRole('button', { name: /开始\/继续测评|正在核对/ }))
  expect.soft(m.createSession.mock.calls.map(([id]) => id)).toEqual(['a', 'b'])
  await act(async () => { old.resolve({ code: 0, data: { sessionId: 'session-a', status: 'IN_PROGRESS' } }) })
  expect.soft(m.navigate).not.toHaveBeenCalled()
  expect.soft(readAssignmentSessionId('a')).toBeNull()
  expect.soft(readAssignmentSessionId('b')).toBeNull()
  await act(async () => { current.resolve({ code: 0, data: { sessionId: 'session-b', status: 'IN_PROGRESS' } }) })
  expect(m.navigate).toHaveBeenCalledExactlyOnceWith('/student/cognitive/sessions/session-b')
  expect(readAssignmentSessionId('b')).toBe('session-b')
  expect(readSessionLedger('session-b')).toEqual({ status: 'IN_PROGRESS', trialIndex: -1 })
})
