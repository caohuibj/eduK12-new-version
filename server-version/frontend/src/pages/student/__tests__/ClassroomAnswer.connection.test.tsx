import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ io: vi.fn(), authLoading: false }))
vi.mock('socket.io-client', () => ({ io: mocks.io }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ isLoading: mocks.authLoading }) }))
import ClassroomAnswer from '../ClassroomAnswer'
const snapshot = { questionId: 'q1', questionIndex: 1, startedAt: new Date().toISOString(), timeLimit: 600, remainingTime: 500,
  questionContent: { type: 'single_choice', question: '合成颜色题', options: [{ value: 'B', label: '绿色' }] }, mySubmission: { answer: 'B' } }
function app() { return <MemoryRouter initialEntries={['/student/classroom/c1?code=123456']}><Routes><Route path="/student/classroom/:classroomId" element={<ClassroomAnswer />} /></Routes></MemoryRouter> }
beforeEach(() => { vi.clearAllMocks(); mocks.authLoading = false })
it.each([false, true])('captures a join snapshot arriving before the connected rerender (initial authLoading=%s)', initialLoading => {
  mocks.authLoading = initialLoading
  const handlers = new Map<string, Set<(data?: any) => void>>()
  function deliver(event: string, data?: any) { for (const fn of [...(handlers.get(event) ?? [])]) fn(data) }
  const socket = { connected: false,
    on: vi.fn((event, callback) => { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event)!.add(callback) }),
    off: vi.fn((event, callback) => { callback ? handlers.get(event)?.delete(callback) : handlers.delete(event) }),
    emit: vi.fn((event) => { if (event === 'student:join') deliver('broadcast:question', snapshot) }),
    disconnect: vi.fn(), connect: vi.fn(), io: { on: vi.fn() } }
  mocks.io.mockReturnValue(socket)
  const view = render(app())
  if (initialLoading) { expect(mocks.io).not.toHaveBeenCalled(); mocks.authLoading = false; view.rerender(app()) }
  act(() => { socket.connected = true; deliver('connect') })
  expect(screen.getByText('答案已提交')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '绿色' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '绿色' })).toHaveAttribute('aria-pressed', 'true')
})
