import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: { get: mocks.get, post: mocks.post } }))
vi.mock('../../../components/MediaRenderer', () => ({ VideoList: () => null, ImageList: () => null }))
vi.mock('../../../components/PdfViewer', () => ({ default: () => null }))
import AssignmentSubmit from '../AssignmentSubmit'
const questions = [{ id: 'subjective', type: 'text', question: '说说你的想法' }, { id: 'color', type: 'single_choice', question: '颜色', options: [{ key: 'B', text: '绿色' }] }, { id: 'colors', type: 'multiple_choice', question: '多种颜色', options: [{ key: 'A', text: '红色' }, { key: 'B', text: '绿色' }] }]
const assignment = { id: 'a1', title: '合成作业', questions }
function load(data = assignment, submission: any = null) { mocks.get.mockImplementation(async (url: string) => ({ code: 0, data: url.endsWith('/my-submission') ? submission : data })) }
function show() { return render(<MemoryRouter initialEntries={['/student/assignments/a1']}><Routes><Route path="/student/assignments/:assignmentId" element={<AssignmentSubmit />} /></Routes></MemoryRouter>) }
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, 'alert').mockImplementation(() => {}); load(); mocks.post.mockResolvedValue({ code: 0 }) })
it('accepts a complete question-based assignment with an empty optional note', async () => {
  load({ ...assignment, questions: [questions[0]] }); show()
  fireEvent.change(await screen.findByPlaceholderText('请输入你的答案...'), { target: { value: '完整主观答案' } })
  expect(screen.getByRole('textbox', { name: '补充说明（选填）' })).not.toBeRequired()
  fireEvent.click(screen.getByRole('button', { name: '提交作业' }))
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/assignments/a1/submit', expect.objectContaining({ content: '', answers: { '0': '完整主观答案' }, expectedRevision: 0 }), expect.anything()))
})
it('blocks empty required question answers with a Chinese message', async () => {
  load({ ...assignment, questions: [questions[0]] }); show(); await screen.findByText('合成作业')
  fireEvent.click(screen.getByRole('button', { name: '提交作业' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('请完成题目1')
  expect(mocks.post).not.toHaveBeenCalled()
})
it('keeps content required for an assignment without questions', async () => {
  load({ ...assignment, questions: [] }); show(); await screen.findByText('合成作业')
  fireEvent.click(screen.getByRole('button', { name: '提交作业' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('请填写作答内容')
  expect(mocks.post).not.toHaveBeenCalled()
})
it.each(['index', 'id'])('reviews all answer labels and restores edits/cancel for %s keys', async keyStyle => {
  const values = ['合成原答案', 'B', 'A,B']
  const answers = Object.fromEntries(questions.map((q, i) => [keyStyle === 'id' ? q.id : String(i), values[i]]))
  load(assignment, { id: 's1', content: '补充内容', answers, revision: 1, submittedAt: '2026-10-04T12:00:00Z', comment: '已读' }); show()
  expect(await screen.findByText('题目1：合成原答案')).toBeInTheDocument()
  expect(screen.getByText('题目2：绿色')).toBeInTheDocument()
  expect(screen.getByText('题目3：红色、绿色')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '修改作业' }))
  expect(screen.getByPlaceholderText('请输入你的答案...')).toHaveValue('合成原答案')
  expect(screen.getByRole('radio', { name: '绿色' })).toBeChecked()
  fireEvent.change(screen.getByPlaceholderText('请输入你的答案...'), { target: { value: '不保存' } })
  fireEvent.click(screen.getByRole('button', { name: '取消修改' }))
  fireEvent.click(screen.getByRole('button', { name: '修改作业' }))
  expect(screen.getByPlaceholderText('请输入你的答案...')).toHaveValue('合成原答案')
  expect(mocks.post).not.toHaveBeenCalled()
})
