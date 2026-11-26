import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ClassroomDanmakuSnapshot } from '../../../types/classroomDanmaku'
const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, (data: any) => void>,
  emit: vi.fn(),
  emitWithAck: vi.fn(),
}))
function on(event: string, handler: (data: any) => void) { mocks.listeners[event] = handler }
const off = vi.fn()
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ isLoading: false }) }))
vi.mock('../../../hooks/useClassroomSocket', () => ({
  useClassroomSocket: () => ({ isConnected: true, on, off, emit: mocks.emit, emitWithAck: mocks.emitWithAck }),
}))
import ClassroomAnswer from '../ClassroomAnswer'
const question = { questionId: 'q1', questionIndex: 1, startedAt: '2026-10-04T12:00:00Z', timeLimit: 600, remainingTime: 100,
  questionContent: { type: 'single_choice', question: '颜色？', options: [{ value: 'A', label: '红色' }, { value: 'B', label: '绿色' }] } }
function show() { return render(<MemoryRouter initialEntries={['/student/classroom/c1?code=123456']}><Routes><Route path="/student/classroom/:classroomId" element={<ClassroomAnswer />} /></Routes></MemoryRouter>) }
function receive(data: any) { act(() => mocks.listeners['broadcast:question'](data)) }
beforeEach(() => { vi.clearAllMocks(); mocks.listeners = {} })

const activeDanmaku: ClassroomDanmakuSnapshot = {
  available: true,
  classroomId: 'c1',
  sessionId: 'activity',
  revision: 4,
  controlRevision: 2,
  displayEpoch: 1,
  enabled: true,
  paused: false,
  displayMode: 'QUESTION',
  reviewMode: 'realtime',
  topic: '今天的收获',
  speed: 'normal',
  expiresAt: null,
  messages: [],
  limits: { maxTextLength: 60, cooldownMs: 3000, maxPerMinute: 10, messageTtlMs: 30000, pendingTtlMs: 300000 },
}

function receiveDanmaku(snapshot: ClassroomDanmakuSnapshot) {
  act(() => mocks.listeners['danmaku:state'](snapshot))
}

it('keeps answers independent and retries an unconfirmed danmaku with the same message ID', async () => {
  show()
  receive(question)
  receiveDanmaku({ ...activeDanmaku, reviewMode: 'review' })
  mocks.emitWithAck.mockRejectedValueOnce(new Error('尚未收到课堂确认')).mockResolvedValueOnce({
    ok: true, status: 'pending', snapshot: activeDanmaku,
  })

  fireEvent.click(screen.getByRole('button', { name: '绿色' }))
  fireEvent.click(screen.getByRole('button', { name: '提交答案' }))
  const message = screen.getByRole('textbox', { name: '弹幕内容' })
  fireEvent.change(message, { target: { value: '愿意多听不同观点' } })
  fireEvent.click(screen.getByRole('button', { name: '发送弹幕' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('尚未收到课堂确认')
  expect(message).toHaveValue('愿意多听不同观点')
  fireEvent.click(screen.getByRole('button', { name: '发送弹幕' }))
  expect(await screen.findByRole('status')).toHaveTextContent('等待教师审核')
  expect(message).toHaveValue('')
  expect(mocks.emitWithAck.mock.calls[1]).toEqual(mocks.emitWithAck.mock.calls[0])
  expect(mocks.emit).toHaveBeenCalledExactlyOnceWith('student:submit', {
    questionId: 'q1', startedAt: question.startedAt, answer: 'B',
  })
})

it('rejects overlong danmaku locally and ignores stale activity after the teacher stops it', () => {
  show()
  receiveDanmaku({ ...activeDanmaku, classroomId: 'other' })
  expect(screen.queryByRole('textbox', { name: '弹幕内容' })).toBeNull()
  receiveDanmaku(activeDanmaku)
  fireEvent.change(screen.getByRole('textbox', { name: '弹幕内容' }), { target: { value: '好'.repeat(61) } })
  expect(screen.getByRole('button', { name: '发送弹幕' })).toBeDisabled()
  expect(screen.getByText('61 / 60，内容过长')).toBeInTheDocument()
  receiveDanmaku({ ...activeDanmaku, enabled: false, sessionId: null, revision: 1, displayEpoch: 2 })
  receiveDanmaku(activeDanmaku)
  expect(screen.queryByRole('textbox', { name: '弹幕内容' })).toBeNull()
  expect(mocks.emitWithAck).not.toHaveBeenCalled()
})

it('removes the danmaku composer at the restored activity deadline without hiding the question', () => {
  vi.useFakeTimers()
  try {
    show()
    receive(question)
    receiveDanmaku({ ...activeDanmaku, expiresAt: new Date(Date.now() + 3000).toISOString() })
    expect(screen.getByRole('textbox', { name: '弹幕内容' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(3000))
    expect(screen.queryByRole('textbox', { name: '弹幕内容' })).toBeNull()
    expect(screen.getByRole('button', { name: '提交答案' })).toBeInTheDocument()
  } finally { vi.useRealTimers() }
})
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
it('keeps the anonymous participant on an ended-classroom page without a login redirect', () => {
  show()
  receive(question)
  act(() => mocks.listeners['broadcast:closed']({ classroomId: 'c1' }))
  expect(screen.getByRole('heading', { name: '课堂已结束' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '返回课堂入口' })).toHaveAttribute('href', '/student/classroom/enter')
  expect(screen.queryByRole('button', { name: '提交答案' })).not.toBeInTheDocument()
})
it('offers a return to the classroom entrance when reconnecting after admission has closed', () => {
  show()
  receive(question)
  act(() => mocks.listeners.error({ message: '课堂不存在或当前不可加入' }))
  expect(screen.getByRole('heading', { name: '课堂暂不可加入' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '返回课堂入口' })).toHaveAttribute('href', '/student/classroom/enter')
  expect(screen.queryByRole('button', { name: '提交答案' })).not.toBeInTheDocument()
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


it('ignores an old same-question finish and next event after restart, including unbound legacy events', () => {
  show(); receive(question)
  const restarted = { ...question, startedAt: '2026-10-04T12:05:00.000Z', remainingTime: 80 }
  receive(restarted)
  fireEvent.click(screen.getByRole('button', { name: '绿色' }))
  act(() => {
    mocks.listeners['broadcast:finished']({ questionId: 'q1', startedAt: question.startedAt })
    mocks.listeners['broadcast:next']({ expectedQuestionId: 'q1', expectedStartedAt: question.startedAt })
    mocks.listeners['broadcast:finished']({ questionId: 'q1' })
  })
  expect(screen.getByRole('button', { name: '提交答案' })).toBeEnabled()
  expect(screen.queryByText('答题已结束，无法提交')).toBeNull()
  act(() => mocks.listeners['broadcast:finished']({ questionId: 'q1', startedAt: restarted.startedAt }))
  expect(screen.getByText('答题已结束，无法提交')).toBeInTheDocument()
})

it('does not let a same-round replay reopen an already finished answer window', () => {
  show(); receive(question)
  act(() => mocks.listeners['broadcast:finished']({ questionId: 'q1', startedAt: question.startedAt }))
  receive(question)
  expect(screen.queryByRole('button', { name: '提交答案' })).toBeNull()
  expect(screen.getByText('答题已结束，无法提交')).toBeInTheDocument()
})


it('does not let an already queued countdown tick subtract time from a restarted round', () => {
  vi.useFakeTimers()
  try {
    show(); receive({ ...question, remainingTime: 1 })
    act(() => {
      mocks.listeners['broadcast:question']({ ...question, startedAt: '2026-10-04T12:05:00.000Z', remainingTime: 5 })
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('0:05')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提交答案' })).toBeInTheDocument()
  } finally { vi.useRealTimers() }
})
