import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), training: vi.fn(), preview: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: { get: mocks.get, post: mocks.post } }))
vi.mock('../../../training/context', () => ({ isTrainingHost: mocks.training }))
vi.mock('../../../components/MediaRenderer', () => ({ VideoList: () => null, ImageList: () => null }))
vi.mock('../../../components/PdfViewer', () => ({ default: (props: { isOpen: boolean; title: string; onClose: () => void }) => {
  mocks.preview(props)
  return props.isOpen ? <div role="dialog" aria-label={props.title}><button type="button" onClick={props.onClose}>关闭合成文档</button></div> : null
} }))
import AssignmentSubmit from '../AssignmentSubmit'
const questions = [{ id: 'subjective', type: 'text', question: '说说你的想法' }, { id: 'color', type: 'single_choice', question: '颜色', options: [{ key: 'B', text: '绿色' }] }, { id: 'colors', type: 'multiple_choice', question: '多种颜色', options: [{ key: 'A', text: '红色' }, { key: 'B', text: '绿色' }] }]
const assignment = { id: 'a1', title: '合成练习', questions }
function load(data = assignment, submission: any = null) { mocks.get.mockImplementation(async (url: string) => ({ code: 0, data: url.endsWith('/my-submission') ? submission : data })) }
function show() { return render(<MemoryRouter initialEntries={['/student/assignments/a1']}><Routes><Route path="/student/assignments/:assignmentId" element={<AssignmentSubmit />} /></Routes></MemoryRouter>) }
beforeEach(() => { vi.clearAllMocks(); mocks.training.mockReturnValue(false); vi.spyOn(window, 'alert').mockImplementation(() => {}); load(); mocks.post.mockResolvedValue({ code: 0 }) })
afterEach(() => vi.restoreAllMocks())
it('accepts a complete question-based assignment with an empty optional note', async () => {
  load({ ...assignment, questions: [questions[0]] }); show()
  fireEvent.change(await screen.findByPlaceholderText('请输入你的答案...'), { target: { value: '完整主观答案' } })
  expect(screen.getByRole('textbox', { name: '补充说明（选填）' })).not.toBeRequired()
  fireEvent.click(screen.getByRole('button', { name: '提交练习' }))
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/assignments/a1/submit', expect.objectContaining({ content: '', answers: { '0': '完整主观答案' }, expectedRevision: 0 }), expect.anything()))
})
it('blocks empty required question answers with a Chinese message', async () => {
  load({ ...assignment, questions: [questions[0]] }); show(); await screen.findByText('合成练习')
  fireEvent.click(screen.getByRole('button', { name: '提交练习' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('请完成题目1')
  expect(mocks.post).not.toHaveBeenCalled()
})
it('keeps content required for an assignment without questions', async () => {
  load({ ...assignment, questions: [] }); show(); await screen.findByText('合成练习')
  fireEvent.click(screen.getByRole('button', { name: '提交练习' }))
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
  fireEvent.click(screen.getByRole('button', { name: '修改练习' }))
  expect(screen.getByPlaceholderText('请输入你的答案...')).toHaveValue('合成原答案')
  expect(screen.getByRole('radio', { name: '绿色' })).toBeChecked()
  fireEvent.change(screen.getByPlaceholderText('请输入你的答案...'), { target: { value: '不保存' } })
  fireEvent.click(screen.getByRole('button', { name: '取消修改' }))
  fireEvent.click(screen.getByRole('button', { name: '修改练习' }))
  expect(screen.getByPlaceholderText('请输入你的答案...')).toHaveValue('合成原答案')
  expect(mocks.post).not.toHaveBeenCalled()
})

it.each([true, false])('focuses repeated local validation errors only in Training (Training=%s)', async training => {
  mocks.training.mockReturnValue(training)
  const user = userEvent.setup()
  const initialFocus = document.activeElement
  load({ ...assignment, questions: [questions[0]] }); show()
  const submit = await screen.findByRole('button', { name: '提交练习' })
  expect(document.activeElement).toBe(initialFocus)
  await user.click(submit)
  const error = await screen.findByRole('alert')
  expect(error).toHaveTextContent('请完成题目1')
  if (training) expect(error).toHaveFocus()
  else { expect(submit).toHaveFocus(); expect(error).not.toHaveAttribute('tabindex') }
  await user.click(screen.getByRole('textbox', { name: '补充说明（选填）' }))
  await user.click(submit)
  if (training) expect(error).toHaveFocus()
  else expect(submit).toHaveFocus()
  expect(mocks.post).not.toHaveBeenCalled()
})

it('focuses the Training no-question content error without changing its required validation', async () => {
  mocks.training.mockReturnValue(true)
  const user = userEvent.setup()
  load({ ...assignment, questions: [] }); show()
  await user.click(await screen.findByRole('button', { name: '提交练习' }))
  expect(screen.getByRole('alert')).toHaveFocus()
  expect(screen.getByRole('alert')).toHaveTextContent('请填写作答内容')
  expect(screen.getByRole('textbox', { name: '作答内容' })).toBeRequired()
  expect(mocks.post).not.toHaveBeenCalled()
})

it.each([true, false])('opens document attachments with native Enter and Space on both hosts (Training=%s)', async training => {
  mocks.training.mockReturnValue(training)
  const user = userEvent.setup()
  const doc = { id: 'document-1', title: '合成附件', fileName: 'notes.pdf', url: '/api/assets/document-1/content', allowDownload: false }
  const withDocument = { ...assignment, documents: [doc] }
  load(withDocument); show()
  const trigger = await screen.findByRole('button', { name: /合成附件/ })
  expect(trigger).toHaveAttribute('type', 'button')
  await user.tab()
  await user.tab()
  expect(trigger).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(screen.getByRole('dialog', { name: doc.title })).toBeInTheDocument()
  expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ url: doc.url, title: doc.title, allowDownload: false, isOpen: true }))
  await user.click(screen.getByRole('button', { name: '关闭合成文档' }))
  trigger.focus()
  await user.keyboard(' ')
  expect(screen.getByRole('dialog', { name: doc.title })).toBeInTheDocument()
  expect(mocks.post).not.toHaveBeenCalled()
})

it.each([true, false])('preserves pending, retry identity, native alerts and accepted-write hydration (Training=%s)', async training => {
  mocks.training.mockReturnValue(training)
  const user = userEvent.setup()
  const data = { ...assignment, questions: [] }
  load(data); show()
  const input = await screen.findByRole('textbox', { name: '作答内容' })
  await user.type(input, '保留这份作答')
  let reject!: (reason: unknown) => void
  mocks.post.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
  const submit = screen.getByRole('button', { name: '提交练习' })
  const form = submit.closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(mocks.post).toHaveBeenCalledTimes(1)
  expect(submit).toBeDisabled()
  const firstKey = mocks.post.mock.calls[0][2].headers['Idempotency-Key']
  await act(async () => reject({ status: 500, message: '稍后重试' }))
  expect(window.alert).toHaveBeenLastCalledWith('稍后重试')
  expect(input).toHaveValue('保留这份作答')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(submit).toBeEnabled()

  let accept!: (value: unknown) => void
  mocks.post.mockImplementationOnce(() => new Promise(resolve => { accept = resolve }))
  load(data, { id: 's1', content: '保留这份作答', revision: 1, submittedAt: '2026-10-19T00:00:00Z' })
  await user.click(submit)
  const focus = vi.spyOn(HTMLElement.prototype, 'focus')
  await act(async () => accept({ code: 0 }))
  expect(await screen.findByText('我的提交')).toBeInTheDocument()
  expect(window.alert).toHaveBeenLastCalledWith('提交成功！')
  expect(focus).not.toHaveBeenCalled()
  expect(mocks.post).toHaveBeenCalledTimes(2)
  expect(mocks.post.mock.calls[1]).toEqual(['/assignments/a1/submit', { content: '保留这份作答', answers: undefined, expectedRevision: 0 }, { headers: { 'Idempotency-Key': firstKey } }])
  expect(mocks.get.mock.calls.filter(([url]) => url === '/assignments/a1/my-submission')).toHaveLength(2)
})
