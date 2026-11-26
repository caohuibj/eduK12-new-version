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
  mocks.get.mockReset().mockResolvedValueOnce({ code: 0, data: classroom }).mockRejectedValueOnce({ message: '二维码暂不可用', status: 503 }).mockResolvedValue({ code: 0, data: { name: '验收课堂', code: '390765', qrcodeUrl: 'https://eduk12.top/join' } })
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
  act(() => mocks.listeners['broadcast:online']({ onlineCount: 1 }))
  expect(screen.getByText('累计提交').nextElementSibling).toHaveTextContent('2')
  expect(screen.getByText('在线未提交').nextElementSibling).toHaveTextContent('0')
  expect(screen.getByText('在线提交率').nextElementSibling).toHaveTextContent('100%')
  act(() => mocks.listeners['broadcast:online']({ onlineCount: 0 }))
  expect(screen.getByText('累计提交').nextElementSibling).toHaveTextContent('2')
  expect(screen.getByText('在线未提交').nextElementSibling).toHaveTextContent('0')
  expect(screen.getByText('在线提交率').nextElementSibling).toHaveTextContent('—')
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
