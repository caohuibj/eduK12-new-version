import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import QuestionnaireAssessment from '../QuestionnaireAssessment'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: mocks }))
vi.mock('../../../components/FinalQuestionnaireAssessment', () => ({
  default: ({ data }: any) => <div>作答入口 {data.questionnaireAssessment.id}</div>,
}))
beforeEach(() => vi.clearAllMocks())
it.each(['active-with-completed', 'completed', 'unstarted'])('opens only the target questionnaire with unchanged %s dispatch', async state => {
  mocks.get.mockResolvedValue({ code: 0, data: { list: [{ id: 'target', inProgress: state === 'active-with-completed',
    completed: state !== 'unstarted', assessmentId: state === 'unstarted' ? null : 'done' }] } })
  const attempt = state === 'active-with-completed' ? 'active' : 'new'
  mocks.post.mockResolvedValue({ code: 0, data: {
    questionnaireAssessment: { id: attempt, status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', attemptEpoch: 1, currentIndex: 0 },
    currentFormItem: null, currentScale: null, currentFormSection: null, contentItems: [], totalItems: 1,
  } })
  render(<MemoryRouter initialEntries={['/student/questionnaires/target/assessment']}><Routes>
    <Route path="/student/questionnaires/:questionnaireId/assessment" element={<QuestionnaireAssessment />} />
    <Route path="/student/questionnaires/result/:assessmentId" element={<div>已完成报告入口</div>} />
  </Routes></MemoryRouter>)
  if (state === 'completed') {
    await screen.findByText('已完成报告入口')
    expect(mocks.post).not.toHaveBeenCalled()
  } else {
    await screen.findByText(`作答入口 ${attempt}`)
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/questionnaires/target/assessments')
  }
  await waitFor(() => expect(mocks.get).toHaveBeenCalledExactlyOnceWith('/questionnaires/available', { params: { questionnaireId: 'target' } }))
})

it('shows the opening error and retries without treating a temporary failure as a missing questionnaire', async () => {
  mocks.get.mockRejectedValueOnce(new Error('网络暂不可用')).mockResolvedValueOnce({ code: 0, data: { list: [{ id: 'target', completed: false, inProgress: false, assessmentId: null }] } })
  mocks.post.mockResolvedValue({ code: 0, data: {
    questionnaireAssessment: { id: 'recovered', status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', attemptEpoch: 1, currentIndex: 0 },
    currentFormItem: null, currentScale: null, currentFormSection: null, contentItems: [], totalItems: 1,
  } })
  render(<MemoryRouter initialEntries={['/student/questionnaires/target/assessment']}><Routes>
    <Route path="/student/questionnaires/:questionnaireId/assessment" element={<QuestionnaireAssessment />} />
  </Routes></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('网络暂不可用')
  expect(screen.queryByText('问卷不存在或未发布')).not.toBeInTheDocument()
  expect(mocks.post).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '重试打开问卷' }))
  await screen.findByText('作答入口 recovered')
  expect(mocks.get).toHaveBeenCalledTimes(2)
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/questionnaires/target/assessments')
})


it('keeps the existing empty-result state distinct from a thrown opening error', async () => {
  mocks.get.mockResolvedValue({ code: 0, data: { list: [] } })
  mocks.post.mockResolvedValue({ code: 404, message: '问卷不存在或未发布' })
  render(<MemoryRouter initialEntries={['/student/questionnaires/target/assessment']}><Routes>
    <Route path="/student/questionnaires/:questionnaireId/assessment" element={<QuestionnaireAssessment />} />
  </Routes></MemoryRouter>)
  await screen.findByText('问卷不存在或未发布')
  expect(screen.queryByRole('button', { name: '重试打开问卷' })).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
