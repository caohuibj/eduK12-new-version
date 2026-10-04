import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ listeners: {} as Record<string, (data: any) => void>, emit: vi.fn() }))
function on(event: string, handler: (data: any) => void) { mocks.listeners[event] = handler }
const off = vi.fn()
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ isLoading: false }) }))
vi.mock('../../../hooks/useClassroomSocket', () => ({ useClassroomSocket: () => ({ isConnected: true, on, off, emit: mocks.emit }) }))
import ClassroomAnswer from '../ClassroomAnswer'
const question = { questionId: 'q1', questionIndex: 1, startedAt: '2026-10-04T12:00:00Z', timeLimit: 600, remainingTime: 100,
  questionContent: { type: 'single_choice', question: '颜色？', options: [{ value: 'A', label: '红色' }, { value: 'B', label: '绿色' }] } }
function show() { return render(<MemoryRouter initialEntries={['/student/classroom/c1?code=123456']}><Routes><Route path="/student/classroom/:classroomId" element={<ClassroomAnswer />} /></Routes></MemoryRouter>) }
function receive(data: any) { act(() => mocks.listeners['broadcast:question'](data)) }
beforeEach(() => { vi.clearAllMocks(); mocks.listeners = {} })
it('restores the server answer and submitted state after a full remount', () => {
  const first = show(); receive(question)
  fireEvent.click(screen.getByRole('button', { name: '绿色' }))
  fireEvent.click(screen.getByRole('button', { name: '提交答案' }))
  act(() => mocks.listeners['student:submitted']({ questionId: 'q1', startedAt: question.startedAt, success: true }))
  first.unmount(); show()
  receive({ ...question, mySubmission: { answer: 'B', submittedAt: '2026-10-04T12:00:02Z' } })
  expect(screen.getByText('答案已提交')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '绿色' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: '绿色' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: '提交答案' })).toBeNull()
})
it.each(['multiple_choice', 'text_input'])('restores %s without emitting another answer', type => {
  show()
  receive({ ...question, questionContent: { ...question.questionContent, type }, mySubmission: { answer: type === 'multiple_choice' ? 'A,B' : '合成主观答案' } })
  expect(screen.getByText('答案已提交')).toBeInTheDocument()
  if (type === 'multiple_choice') {
    expect(screen.getByRole('button', { name: '红色' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '绿色' })).toHaveAttribute('aria-pressed', 'true')
  } else expect(screen.getByRole('textbox')).toHaveValue('合成主观答案')
  expect(mocks.emit).not.toHaveBeenCalled()
})
it('keeps an acknowledged answer on same-round broadcasts, but resets for a restart and ignores an old ack', () => {
  show(); receive({ ...question, mySubmission: { answer: 'B' } }); receive(question)
  expect(screen.getByText('答案已提交')).toBeInTheDocument()
  receive({ ...question, startedAt: '2026-10-04T12:05:00Z', mySubmission: null })
  act(() => mocks.listeners['student:submitted']({ questionId: 'q1', startedAt: question.startedAt, success: true }))
  expect(screen.queryByText('答案已提交')).toBeNull()
  expect(screen.getByRole('button', { name: '绿色' })).toHaveAttribute('aria-pressed', 'false')
})
it('sends once while pending and retries after a server rejection', () => {
  show(); receive(question)
  fireEvent.click(screen.getByRole('button', { name: '绿色' }))
  const submit = screen.getByRole('button', { name: '提交答案' })
  fireEvent.click(submit); fireEvent.click(submit)
  expect(mocks.emit).toHaveBeenCalledTimes(1)
  act(() => mocks.listeners.error({ message: '暂时失败' }))
  fireEvent.click(screen.getByRole('button', { name: '提交答案' }))
  expect(mocks.emit).toHaveBeenCalledTimes(2)
})
it('prevents new submissions when the restored deadline has already elapsed', () => {
  show(); receive({ ...question, remainingTime: 0, mySubmission: null })
  expect(screen.getByText('答题已结束，无法提交')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '提交答案' })).toBeNull()
})
it('allows retry when the submission confirmation never arrives', () => {
  vi.useFakeTimers()
  try {
    show(); receive(question)
    fireEvent.click(screen.getByRole('button', { name: '绿色' }))
    fireEvent.click(screen.getByRole('button', { name: '提交答案' }))
    act(() => vi.advanceTimersByTime(15_000))
    expect(screen.getByRole('alert')).toHaveTextContent('尚未收到提交确认')
    fireEvent.click(screen.getByRole('button', { name: '提交答案' }))
    expect(mocks.emit).toHaveBeenCalledTimes(2)
    expect(mocks.emit.mock.calls[0]).toEqual(mocks.emit.mock.calls[1])
  } finally { vi.useRealTimers() }
})
