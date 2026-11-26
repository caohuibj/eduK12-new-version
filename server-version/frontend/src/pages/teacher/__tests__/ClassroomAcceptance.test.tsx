import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), emit: vi.fn(), listeners: {} as Record<string, (data: any) => void> }))
vi.mock('../../../api/client', () => ({ default: { get: mocks.get, post: mocks.post, put: mocks.put } }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ isLoading: false, user: { id: 'teacher-1' } }) }))
vi.mock('../../../hooks/useClassroomSocket', () => ({ useClassroomSocket: () => ({ isConnected: true, connectionState: 'CONNECTED', emit: mocks.emit, manualRetry: vi.fn(), on: register, off: vi.fn() }) }))
function register(event: string, callback: (data: any) => void) { mocks.listeners[event] = callback }
import ClassroomControl from '../ClassroomControl'
import ClassroomQuestionEdit from '../ClassroomQuestionEdit'
const question = { id: 'q1', questionIndex: 1, questionContent: { type: 'single_choice', question: '颜色？' }, startedAt: '2026-10-04T00:00:00Z', endedAt: null }
const classroom = { id: 'class-1', code: '390765', name: '验收课堂', status: 'ACTIVE', course: { id: 'course-1', title: '验收课程' }, questions: [question] }
function show(component: React.ReactNode) { return render(<MemoryRouter initialEntries={['/teacher/classrooms/class-1/control']}><Routes><Route path='/teacher/classrooms/:id/control' element={component} /></Routes></MemoryRouter>) }
beforeEach(() => {
  vi.clearAllMocks(); mocks.listeners = {}
  mocks.get.mockImplementation(async (url: string) => ({ code: 0, data: url.endsWith('/qrcode') ? { classroomId: 'class-1', name: '验收课堂', code: '390765', qrcodeUrl: 'https://eduk12.top/student/classroom/join?code=390765' } : classroom }))
})
it('renders the QR inline without a popup and recovers from a generation failure', async () => {
  const popup = vi.spyOn(window, 'open').mockImplementation(() => null)
  let qrAttempts = 0
  mocks.get.mockImplementation(async (url: string) => {
    if (!url.endsWith('/qrcode')) return { code: 0, data: classroom }
    if (++qrAttempts === 1) throw { message: '二维码暂不可用', status: 503 }
    return { code: 0, data: { name: '验收课堂', code: '390765', qrcodeUrl: 'https://eduk12.top/join' } }
  })
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
  const view = show(<ClassroomControl />)
  await screen.findByText('验收课堂')
  fireEvent.click(screen.getByRole('button', { name: '二维码' }))
  fireEvent.click(screen.getByRole('button', { name: '生成二维码' }))
  expect(await screen.findByText('二维码暂不可用')).toBeInTheDocument()
  expect(popup).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '重新生成' }))
  await screen.findByRole('button', { name: '下载二维码' })
  expect(view.container.querySelector('canvas')).toBeInTheDocument()
  popup.mockRestore()
  context.mockRestore()
})
it('shows ended after the finish event while the classroom itself stays ACTIVE', async () => {
  show(<ClassroomControl />)
  expect(await screen.findByText('答题进行中')).toBeInTheDocument()
  mocks.get.mockResolvedValue({ code: 0, data: { ...classroom, questions: [{ ...question, endedAt: '2026-10-04T00:01:00Z' }] } })
  act(() => mocks.listeners['broadcast:finished']({ questionId: 'q1', endedAt: '2026-10-04T00:01:00Z' }))
  expect(await screen.findByText('答题已结束')).toBeInTheDocument()
  expect(screen.queryByText('答题进行中')).toBeNull()
})
it('keeps the closed classroom open so the teacher can generate its summary and revisit history', async () => {
  show(<ClassroomControl />)
  await screen.findByText('答题进行中')
  const ended = { ...classroom, status: 'ENDED', questions: [{ ...question, endedAt: '2026-10-04T00:01:00Z' }] }
  mocks.get.mockImplementation(async (url: string) => ({ code: 0, data: url.endsWith('/summary') ? null : ended }))
  mocks.emit.mockImplementationOnce((_event, _data, ack) => ack({ ok: true }))
  fireEvent.click(screen.getByRole('button', { name: '关闭课堂' }))
  expect(await screen.findByRole('button', { name: '生成课堂小结' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '关闭课堂' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: '二维码' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '历史大屏' }))
  expect(screen.getByRole('button', { name: /第 1 题/ })).toBeEnabled()
})
it('shows cumulative answers separately from current online progress', async () => {
  show(<ClassroomControl />)
  await screen.findByText('答题进行中')
  act(() => mocks.listeners['broadcast:stats']({ questionId: 'q1', answerCount: 2, totalSessions: 1, activeAnswerCount: 1, submissionRate: 100 }))
  // A student session may be represented by multiple Socket connections.
  act(() => mocks.listeners['broadcast:online']({ onlineCount: 2 }))
  expect(screen.getByText('在线人数').nextElementSibling).toHaveTextContent('1')
  expect(screen.getByText('累计提交').nextElementSibling).toHaveTextContent('2')
  expect(screen.getByText('在线未提交').nextElementSibling).toHaveTextContent('0')
  expect(screen.getByText('在线提交率').nextElementSibling).toHaveTextContent('100%')
  act(() => mocks.listeners['broadcast:online']({ onlineCount: 0 }))
  act(() => mocks.listeners['broadcast:stats']({ questionId: 'q1', answerCount: 2, totalSessions: 0, activeAnswerCount: 0, submissionRate: 0 }))
  expect(screen.getByText('在线人数').nextElementSibling).toHaveTextContent('0')
  expect(screen.getByText('累计提交').nextElementSibling).toHaveTextContent('2')
  expect(screen.getByText('在线未提交').nextElementSibling).toHaveTextContent('0')
  expect(screen.getByText('在线提交率').nextElementSibling).toHaveTextContent('—')
})
it('loads online progress when a teacher enters an active classroom without any membership broadcast', async () => {
  const stats = { questionId: 'q1', answerCount: 20, totalSessions: 30, activeAnswerCount: 20, submissionRate: 200 / 3 }
  mocks.get.mockImplementation(async (url: string) => ({ code: 0, data: url.endsWith('/stats') ? { stats } : classroom }))
  show(<ClassroomControl />)
  await screen.findByText('答题进行中')
  await waitFor(() => expect(screen.getByText('在线人数').nextElementSibling).toHaveTextContent('30'))
  expect(screen.getByText('在线未提交').nextElementSibling).toHaveTextContent('10')
  expect(screen.getByText('在线提交率').nextElementSibling).toHaveTextContent('67%')
  expect(screen.getByText('在线 30 人')).toBeInTheDocument()
  expect(mocks.get.mock.calls.filter(([url]) => url.endsWith('/stats'))).toHaveLength(1)
})
it('refreshes the snapshot after reconnect and skips a pending read when a new broadcast arrives', async () => {
  const stats = { questionId: 'q1', answerCount: 2, totalSessions: 1, activeAnswerCount: 1, submissionRate: 100 }
  mocks.get.mockImplementation(async (url: string) => ({ code: 0, data: url.endsWith('/stats') ? { stats } : classroom }))
  show(<ClassroomControl />)
  await screen.findByText('答题进行中')
  act(() => {
    mocks.listeners['broadcast:online']({ onlineCount: 2 })
    mocks.listeners['broadcast:stats'](stats)
  })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 400)) })
  expect(mocks.get.mock.calls.filter(([url]) => url.endsWith('/stats'))).toHaveLength(0)
  act(() => mocks.listeners['teacher:joined']({ status: 'ACTIVE', currentQuestion: { ...question, questionId: question.id } }))
  await waitFor(() => expect(mocks.get.mock.calls.filter(([url]) => url.endsWith('/stats'))).toHaveLength(1))
})
it('clears stats for a restarted question and ignores a late HTTP response from the previous round', async () => {
  let resolveOld: (value: unknown) => void = () => { throw new Error('stats request not started') }
  mocks.get.mockImplementation(async (url: string) => url.endsWith('/stats')
    ? new Promise(resolve => { resolveOld = resolve })
    : { code: 0, data: classroom })
  show(<ClassroomControl />)
  await screen.findByText('答题进行中')
  await waitFor(() => expect(mocks.get.mock.calls.filter(([url]) => url.endsWith('/stats'))).toHaveLength(1))
  act(() => mocks.listeners['broadcast:question']({ ...question, questionId: question.id, startedAt: '2026-10-04T00:02:00Z' }))
  expect(screen.getByText('累计提交').nextElementSibling).toHaveTextContent('—')
  await act(async () => resolveOld({ code: 0, data: { stats: { questionId: 'q1', answerCount: 20, totalSessions: 30, activeAnswerCount: 20, submissionRate: 200 / 3 } } }))
  expect(screen.getByText('累计提交').nextElementSibling).toHaveTextContent('—')
  act(() => mocks.listeners['broadcast:stats']({ questionId: 'q1', answerCount: 99, totalSessions: 99, activeAnswerCount: 99, submissionRate: 100 }))
  expect(screen.getByText('累计提交').nextElementSibling).toHaveTextContent('—')
  act(() => mocks.listeners['broadcast:stats']({ questionId: 'q1', startedAt: '2026-10-04T00:02:00Z', answerCount: 1, totalSessions: 2, activeAnswerCount: 1, submissionRate: 50 }))
  expect(screen.getByText('累计提交').nextElementSibling).toHaveTextContent('1')
  expect(screen.getByText('在线提交率').nextElementSibling).toHaveTextContent('50%')
})
it('saves three filled options and ignores the default fourth empty slot', async () => {
  mocks.get.mockImplementation(async (url: string) => ({ code: 0, data: url.endsWith('/questions') ? [] : { ...classroom, status: 'PREPARING' } }))
  mocks.post.mockResolvedValue({ code: 0, data: { ...question, id: 'q2' } })
  show(<ClassroomQuestionEdit />)
  fireEvent.click(await screen.findByRole('button', { name: '添加题目' }))
  fireEvent.change(screen.getByRole('textbox', { name: '题目内容' }), { target: { value: '颜色？' } })
  for (const [key, value] of [['A', '红色'], ['B', '绿色'], ['C', '蓝色']]) fireEvent.change(screen.getByRole('textbox', { name: `选项 ${key}` }), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/classrooms/class-1/questions', expect.objectContaining({ questionContent: expect.objectContaining({ options: [{ value: 'A', label: '红色' }, { value: 'B', label: '绿色' }, { value: 'C', label: '蓝色' }] }) })))
})
it('preserves remaining option values and saves a unique value after deleting and adding an option', async () => {
  mocks.get.mockImplementation(async (url: string) => ({ code: 0, data: url.endsWith('/questions') ? [] : { ...classroom, status: 'PREPARING' } }))
  mocks.post.mockResolvedValue({ code: 0, data: { ...question, id: 'q2' } })
  show(<ClassroomQuestionEdit />)
  fireEvent.click(await screen.findByRole('button', { name: '添加题目' }))
  fireEvent.click(screen.getByRole('button', { name: '删除选项 B' }))
  fireEvent.click(screen.getByRole('button', { name: '添加选项' }))
  fireEvent.change(screen.getByRole('textbox', { name: '题目内容' }), { target: { value: '颜色？' } })
  const options = [{ value: 'A', label: '红色' }, { value: 'C', label: '蓝色' }, { value: 'D', label: '黄色' }, { value: 'E', label: '紫色' }]
  for (const { value, label } of options) fireEvent.change(screen.getByRole('textbox', { name: `选项 ${value}` }), { target: { value: label } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/classrooms/class-1/questions', expect.objectContaining({ questionContent: expect.objectContaining({ options }) })))
})


it('ignores late same-question finish and stats after a restart without fetching old classroom state', async () => {
  show(<ClassroomControl />)
  await screen.findByText('答题进行中')
  const startedAt = '2026-10-04T00:02:00.000Z'
  act(() => mocks.listeners['broadcast:question']({ ...question, questionId: question.id, startedAt }))
  act(() => mocks.listeners['broadcast:stats']({ questionId: 'q1', startedAt, answerCount: 1, totalSessions: 2, activeAnswerCount: 1, submissionRate: 50 }))
  const calls = mocks.get.mock.calls.length
  act(() => {
    mocks.listeners['broadcast:stats']({ questionId: 'q1', startedAt: question.startedAt, answerCount: 99, totalSessions: 99, activeAnswerCount: 99, submissionRate: 100 })
    mocks.listeners['broadcast:finished']({ questionId: 'q1', startedAt: question.startedAt })
  })
  expect(screen.getByText('答题进行中')).toBeInTheDocument()
  expect(screen.getByText('累计提交').nextElementSibling).toHaveTextContent('1')
  expect(mocks.get.mock.calls).toHaveLength(calls)
})


it('ignores a classroom read started by the old finish once a new same-question round arrives', async () => {
  let resolveOld: (value: unknown) => void = () => { throw new Error('old classroom request missing') }
  let classReads = 0
  mocks.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/stats')) return { code: 0, data: { stats: { questionId: 'q1', startedAt: question.startedAt, answerCount: 0, totalSessions: 0, activeAnswerCount: 0, submissionRate: 0 } } }
    if (++classReads === 1) return { code: 0, data: classroom }
    return new Promise(resolve => { resolveOld = resolve })
  })
  show(<ClassroomControl />)
  await screen.findByText('答题进行中')
  act(() => mocks.listeners['broadcast:finished']({ questionId: 'q1', startedAt: question.startedAt }))
  act(() => mocks.listeners['broadcast:question']({ ...question, questionId: question.id, startedAt: '2026-10-04T00:02:00Z' }))
  await act(async () => resolveOld({ code: 0, data: { ...classroom, questions: [{ ...question, endedAt: '2026-10-04T00:01:00Z' }] } }))
  expect(screen.getByText('答题进行中')).toBeInTheDocument()
})
